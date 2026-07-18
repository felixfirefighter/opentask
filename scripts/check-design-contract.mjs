import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const repositoryRoot = process.cwd();
const tokenFile = "shared/design/tokens.css";
const cssRoots = ["app", "modules", "shared"];
const requiredTokens = new Map(
  Object.entries({
    "--font-sans":
      '"Geist Sans", Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    "--type-row-size": "14px",
    "--type-row-line": "20px",
    "--type-row-weight": "500",
    "--type-compact-size": "13px",
    "--type-compact-line": "18px",
    "--type-compact-weight": "400",
    "--type-label-size": "12px",
    "--type-label-line": "16px",
    "--type-label-weight": "600",
    "--space-0": "0",
    "--space-1": "4px",
    "--space-2": "8px",
    "--radius-control": "5px",
    "--radius-pill": "999px",
    "--border-default": "1px",
    "--control-target-desktop": "36px",
    "--control-target-touch": "44px",
    "--task-status-indicator-size": "20px",
    "--task-row-standard-height": "60px",
    "--task-row-touch-height": "64px",
    "--ease-exit": "cubic-bezier(0.4, 0, 1, 1)",
    "--z-base": "0",
    "--z-sticky": "10",
    "--z-popover": "30",
    "--z-sheet": "40",
    "--z-dialog": "50",
    "--z-toast": "60",
  }),
);

const failures = [];
const sourceFiles = (await Promise.all(cssRoots.map(collectSourceFiles))).flat().sort();
const cssFiles = sourceFiles.filter((file) => file.endsWith(".css"));
const tokenSource = await readRelative(tokenFile);
const declaredTokens = parseCustomProperties(tokenSource);

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

const taskRowSource = await readRelative("shared/presentation/TaskRow.module.css");
for (const match of taskRowSource.matchAll(
  /(?:^|[;{])\s*(gap|column-gap|row-gap|margin(?:-[\w-]+)?|padding(?:-[\w-]+)?|width|height|min-height|border-bottom|grid-template-columns)\s*:\s*([^;}]+)(?:;|(?=\s*}))/gm,
)) {
  const [, property, value] = match;
  const normalizedValue = value?.trim();
  if (/\d*\.?\d+(?:px|rem|em|vw|vh|vmin|vmax)\b/.test(normalizedValue ?? "")) {
    failures.push(
      `shared/presentation/TaskRow.module.css:${lineNumber(taskRowSource, match.index)}: ${property} contains a raw length`,
    );
  } else if (normalizedValue !== "0" && !normalizedValue?.includes("var(--")) {
    failures.push(
      `shared/presentation/TaskRow.module.css:${lineNumber(taskRowSource, match.index)}: ${property} must consume a design token`,
    );
  }
}

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
  [".meta", "gap", "var(--space-1)"],
  [".meta", "font-size", "var(--type-compact-size)"],
  [".meta", "font-weight", "var(--type-compact-weight)"],
  [".meta", "line-height", "var(--type-compact-line)"],
  [".tag", "padding", "var(--space-1) var(--space-2)"],
  [".tag", "font-size", "var(--type-label-size)"],
  [".tag", "font-weight", "var(--type-label-weight)"],
  [".tag", "line-height", "var(--type-label-line)"],
  [".trailing", "gap", "var(--space-1)"],
  [".status, .more", "width", "var(--control-target-desktop)"],
  [".status, .more", "height", "var(--control-target-desktop)"],
  [".status, .more", "width", "var(--control-target-touch)"],
  [".status, .more", "height", "var(--control-target-touch)"],
  [".status > svg", "width", "var(--task-status-indicator-size)"],
  [".status > svg", "height", "var(--task-status-indicator-size)"],
  [".statusDone", "width", "var(--task-status-indicator-size)"],
  [".statusDone", "height", "var(--task-status-indicator-size)"],
];

for (const [selector, property, expectedValue] of requiredTaskRowDeclarations) {
  const matchesContract = taskRowRules.some(
    (rule) => rule.selector === selector && rule.declarations.get(property) === expectedValue,
  );
  if (!matchesContract) {
    failures.push(
      `shared/presentation/TaskRow.module.css: ${selector} must set ${property}: ${expectedValue}`,
    );
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

function parseCustomProperties(source) {
  const properties = new Map();
  for (const match of source.matchAll(/^\s*(--[\w-]+)\s*:\s*([^;]*);/gm)) {
    if (!properties.has(match[1])) properties.set(match[1], match[2]?.trim().replace(/\s+/g, " "));
  }
  return properties;
}

function lineNumber(source, index = 0) {
  return source.slice(0, index).split("\n").length;
}
