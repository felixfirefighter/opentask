import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import {
  buildContrastEvidence,
  contrastPairs,
  contrastRatio,
  requiredDarkTokens,
  requiredTokens,
} from "./design-contract/token-contract.mjs";

const repositoryRoot = process.cwd();
const tokenFile = "shared/design/tokens.css";
const cssRoots = ["app", "modules", "shared"];
const failures = [];
const sourceFiles = (await Promise.all(cssRoots.map(collectSourceFiles))).flat().sort();
const cssFiles = sourceFiles.filter((file) => file.endsWith(".css"));
const tokenSource = await readRelative(tokenFile);
const themeRules = parseRules(tokenSource);
const lightTokens = themeRules.find((rule) => rule.selector === ":root")?.declarations;
const darkTokens = themeRules.find((rule) => rule.selector === ':root[data-theme="dark"]')?.declarations;
const declaredTokens = lightTokens ?? new Map();

if (!lightTokens) failures.push(`${tokenFile}: missing :root token block`);

for (const [token, expectedValue] of requiredTokens) {
  const actualValue = declaredTokens.get(token);
  if (actualValue === undefined) {
    failures.push(`${tokenFile}: missing required token ${token}`);
  } else if (actualValue !== expectedValue) {
    failures.push(
      `${tokenFile}: ${token} must equal ${expectedValue}; received ${actualValue || "an empty value"}`,
    );
  }
}

for (const token of declaredTokens.keys()) {
  if (token.startsWith("--") && !requiredTokens.has(token)) {
    failures.push(`${tokenFile}: unreviewed light token ${token} must be added to the exact contract`);
  }
}

if (!darkTokens) {
  failures.push(`${tokenFile}: missing :root[data-theme="dark"] token block`);
} else {
  for (const [token, expectedValue] of requiredDarkTokens) {
    const actualValue = darkTokens.get(token);
    if (actualValue !== expectedValue) {
      failures.push(
        `${tokenFile}: dark ${token} must equal ${expectedValue}; received ${actualValue ?? "a missing value"}`,
      );
    }
  }
  for (const token of darkTokens.keys()) {
    if (token.startsWith("--") && !requiredDarkTokens.has(token)) {
      failures.push(`${tokenFile}: unreviewed dark override ${token} must be added to the exact contract`);
    }
  }
}

for (const [theme, tokens] of [
  ["light", declaredTokens],
  ["dark", darkTokens],
]) {
  if (!tokens) continue;
  const effectiveTokens = theme === "dark" ? new Map([...declaredTokens, ...tokens]) : tokens;
  for (const [foreground, background, minimum] of contrastPairs) {
    const foregroundValue = effectiveTokens.get(foreground);
    const backgroundValue = effectiveTokens.get(background);
    const ratio = contrastRatio(foregroundValue, backgroundValue);
    if (ratio === undefined) {
      failures.push(`${tokenFile}: ${theme} ${foreground}/${background} must use six-digit hex values`);
    } else if (ratio + Number.EPSILON < minimum) {
      failures.push(
        `${tokenFile}: ${theme} ${foreground}/${background} contrast ${ratio.toFixed(2)} must be at least ${minimum.toFixed(1)}`,
      );
    }
  }
}

const darkEffectiveTokens = darkTokens
  ? new Map([...declaredTokens, ...darkTokens])
  : new Map(declaredTokens);
const contrastEvidence = buildContrastEvidence(declaredTokens, darkEffectiveTokens);
const tokenDocumentation = (await readRelative("docs/design/tokens.md")).replace(/\s+/g, " ");
if (!tokenDocumentation.includes(contrastEvidence)) {
  failures.push(`docs/design/tokens.md: contrast evidence is stale; expected \`${contrastEvidence}\``);
}

const globalSource = await readRelative("app/globals.css");
if (!globalSource.includes('@import "../shared/design/tokens.css";')) {
  failures.push("app/globals.css: must import the canonical shared design tokens");
}

for (const file of sourceFiles) {
  const source = await readRelative(file);

  if (file !== tokenFile) {
    reportMatches(
      file,
      source,
      /#[0-9a-fA-F]{3,8}\b|(?:rgb|hsl)a?\(|(?:oklch|oklab|lch|lab|color)\(/g,
      "raw color literal",
    );

    if (file.endsWith(".css")) {
      for (const match of source.matchAll(/::placeholder[^{}]*\{[^{}]*var\(--text-disabled\)[^{}]*\}/g)) {
        failures.push(
          `${file}:${lineNumber(source, match.index)}: active placeholder text must use --text-muted, not the disabled-state token`,
        );
      }

      for (const match of source.matchAll(
        /(?:^|[;{])\s*(color|background(?:-color|-image)?|border(?:-(?:top|right|bottom|left|color|top-color|right-color|bottom-color|left-color))?|outline|box-shadow|text-shadow|fill|stroke)\s*:\s*([^;}]+)(?:;|(?=\s*}))/gm,
      )) {
        const [, property, rawValue] = match;
        const value = rawValue?.trim().replace(/\s*!important\s*$/, "");
        const safeKeyword =
          /^(?:0|none|transparent|currentcolor|inherit|initial|unset|revert(?:-layer)?)$/i.test(value ?? "");
        if (!safeKeyword && !value?.includes("var(--")) {
          failures.push(
            `${file}:${lineNumber(source, match.index)}: ${property} must consume a semantic color token`,
          );
        }
      }
    }
  }

  if (file.startsWith("shared/presentation/") && /\.(?:ts|tsx)$/.test(file)) {
    for (const match of source.matchAll(
      /\b(font|fontFamily|fontSize|fontWeight|lineHeight|borderRadius)\s*:\s*([^,}\n]+)/g,
    )) {
      const [, property, rawValue] = match;
      const value = rawValue?.trim().replace(/^["']|["']$/g, "");
      const expectedPrefix =
        property === "fontFamily"
          ? "var(--font-"
          : property === "borderRadius"
            ? "var(--radius-"
            : "var(--type-";
      const isCircle = property === "borderRadius" && value === "50%";
      const isInheritedFont = property === "font" && value === "inherit";
      if (!isCircle && !isInheritedFont && !value?.startsWith(expectedPrefix)) {
        failures.push(
          `${file}:${lineNumber(source, match.index)}: inline ${property} must consume a design token`,
        );
      }
    }
  }

  if (file.endsWith(".css") && (file === "app/globals.css" || file.startsWith("shared/presentation/"))) {
    for (const match of source.matchAll(
      /(?:^|[;{])\s*(font|font-family|font-size|font-weight|line-height)\s*:\s*([^;}]+)(?:;|(?=\s*}))/gm,
    )) {
      const [, property, value] = match;
      if (property === "font") {
        if (value?.trim() !== "inherit") {
          failures.push(
            `${file}:${lineNumber(source, match.index)}: font shorthand is forbidden; use token-backed longhands`,
          );
        }
      } else if (property === "font-family" && !value?.includes("var(--font-")) {
        failures.push(
          `${file}:${lineNumber(source, match.index)}: font-family must consume a --font-* token`,
        );
      } else if (property !== "font-family" && !value?.includes("var(--type-")) {
        failures.push(
          `${file}:${lineNumber(source, match.index)}: ${property} must consume a --type-* token`,
        );
      }
    }

    for (const match of source.matchAll(/(?:^|[;{])\s*border-radius\s*:\s*([^;}]+)(?:;|(?=\s*}))/gm)) {
      const value = match[1]?.trim();
      if (value !== "50%" && !value?.startsWith("var(--radius-")) {
        failures.push(
          `${file}:${lineNumber(source, match.index)}: border-radius must consume a radius token or be a true circle`,
        );
      }
    }

    for (const match of source.matchAll(/var\((--[\w-]+)/g)) {
      const token = match[1];
      if (!tokenSource.includes(`${token}:`) && !source.includes(`${token}:`)) {
        failures.push(`${file}:${lineNumber(source, match.index)}: references undefined token ${token}`);
      }
    }
  }
}

const taskRowPath = "modules/tasks/presentation/TaskRow.module.css";
const taskRowSource = await readRelative(taskRowPath);
const taskRowRules = parseRules(taskRowSource);
const requiredTaskRowDeclarations = [
  [".row", "min-height", "var(--task-row-standard-height)"],
  [".row", "min-height", "var(--task-row-touch-height)"],
  [".row", "border-bottom", "var(--border-default) solid var(--border)"],
  [".row", "column-gap", "var(--space-2)"],
  [".row", "grid-template-columns", "var(--control-target-desktop) minmax(0, 1fr) auto"],
  [".row", "grid-template-columns", "var(--control-target-touch) minmax(0, 1fr) auto"],
  [".content", "gap", "var(--space-1)"],
  [".title", "font-size", "var(--type-row-size)"],
  [".title", "font-weight", "var(--type-row-weight)"],
  [".title", "line-height", "var(--type-row-line)"],
  [".metadata", "gap", "var(--space-2)"],
  [".metadata", "font-size", "var(--type-compact-size)"],
  [".metadata", "font-weight", "var(--type-compact-weight)"],
  [".metadata", "line-height", "var(--type-compact-line)"],
  [".tag", "padding", "0 var(--space-2)"],
  [".tag", "font-size", "var(--type-label-size)"],
  [".tag", "font-weight", "var(--type-label-weight)"],
  [".tag", "line-height", "var(--type-label-line)"],
  [".trailing", "gap", "var(--space-1)"],
  [".status, .more, .dragHandle", "width", "var(--control-target-desktop)"],
  [".status, .more, .dragHandle", "height", "var(--control-target-desktop)"],
  [".status, .more, .dragHandle", "width", "var(--control-target-touch)"],
  [".status, .more, .dragHandle", "height", "var(--control-target-touch)"],
  [".status > svg", "width", "var(--task-status-indicator-size)"],
  [".status > svg", "height", "var(--task-status-indicator-size)"],
  [".statusDone, .statusCancelled", "width", "var(--task-status-indicator-size)"],
  [".statusDone, .statusCancelled", "height", "var(--task-status-indicator-size)"],
];

for (const [selector, property, expectedValue] of requiredTaskRowDeclarations) {
  const matchesContract = taskRowRules.some(
    (rule) => rule.selector === selector && rule.declarations.get(property) === expectedValue,
  );
  if (!matchesContract) {
    failures.push(`${taskRowPath}: ${selector} must set ${property}: ${expectedValue}`);
  }
}

if (failures.length > 0) {
  console.error("Design contract check failed:\n");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(
    `Design contract check passed (${sourceFiles.length} source files, including ${cssFiles.length} stylesheets, inspected).`,
  );
}

async function collectSourceFiles(relativeDirectory) {
  const absoluteDirectory = path.join(repositoryRoot, relativeDirectory);
  const entries = await readdir(absoluteDirectory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const relativePath = path.posix.join(relativeDirectory, entry.name);
    if (entry.isDirectory()) files.push(...(await collectSourceFiles(relativePath)));
    else if (entry.isFile() && /\.(?:css|ts|tsx)$/.test(entry.name)) files.push(relativePath);
  }

  return files;
}

async function readRelative(relativePath) {
  return readFile(path.join(repositoryRoot, relativePath), "utf8");
}

function reportMatches(file, source, pattern, label) {
  for (const match of source.matchAll(pattern)) {
    failures.push(`${file}:${lineNumber(source, match.index)}: ${label} ${match[0]} belongs in ${tokenFile}`);
  }
}

function parseRules(source) {
  const rules = [];
  for (const match of source.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = match[1]?.trim().replace(/\s+/g, " ");
    const body = match[2] ?? "";
    if (!selector || selector.startsWith("@")) continue;

    const declarations = new Map();
    for (const declaration of body.matchAll(/([\w-]+)\s*:\s*([^;}]+)(?:;|$)/g)) {
      declarations.set(declaration[1], declaration[2]?.trim().replace(/\s+/g, " "));
    }
    rules.push({ selector, declarations });
  }
  return rules;
}

function lineNumber(source, index = 0) {
  return source.slice(0, index).split("\n").length;
}
