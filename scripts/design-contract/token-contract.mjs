export const requiredTokens = new Map(
  Object.entries({
    "--canvas": "#f4f1e9",
    "--surface": "#fcfbf7",
    "--surface-subtle": "#ece8de",
    "--surface-hover": "#e4ded3",
    "--surface-selected": "#e3efea",
    "--surface-elevated": "#fffdf8",
    "--border": "#d7d0c4",
    "--border-strong": "#77756e",
    "--text": "#24251f",
    "--text-muted": "#63635c",
    "--text-disabled": "#74746d",
    "--text-selected": "#255d50",
    "--brand": "#2d7565",
    "--action": "#252823",
    "--action-hover": "#3a3e38",
    "--text-on-strong": "#fefcf7",
    "--focus-ring": "#2a61b8",
    "--success": "#217551",
    "--warning": "#865700",
    "--danger": "#b42a25",
    "--info": "#245db7",
    "--priority-high": "#b42a25",
    "--priority-medium": "#8c5b00",
    "--priority-low": "#245db7",
    "--priority-none": "#696a62",
    "--category-coral-bg": "#f6e2e3",
    "--category-coral-fg": "#783b42",
    "--category-amber-bg": "#f3e7c9",
    "--category-amber-fg": "#684e16",
    "--category-mint-bg": "#ddece1",
    "--category-mint-fg": "#2b6248",
    "--category-sky-bg": "#dee9f3",
    "--category-sky-fg": "#315f84",
    "--category-violet-bg": "#e8e1f1",
    "--category-violet-fg": "#5e467a",
    "--category-slate-bg": "#e6e4de",
    "--category-slate-fg": "#51534d",
    "--atmosphere-moss": "#d9e7dc",
    "--atmosphere-clay": "#f0dece",
    "--atmosphere-iris": "#e4ddef",
    "--atmosphere-mist": "#d9e7ec",
    "--atmosphere-blush": "#efdcdd",
    "--atmosphere-opacity": "0.72",
    "--atmosphere-blur": "64px",
    "--shadow-overlay": "0 12px 32px rgb(37 35 28 / 0.14)",
    "--shadow-dialog": "0 28px 72px rgb(37 35 28 / 0.2)",
    "--font-display":
      'var(--font-editorial, "Newsreader Variable"), Newsreader, Georgia, "Times New Roman", serif',
    "--font-sans":
      'var(--font-interface, "Inter Variable"), Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    "--type-display-size": "clamp(38px, 5vw, 60px)",
    "--type-display-line": "1.06",
    "--type-display-weight": "350",
    "--type-display-tracking": "-0.025em",
    "--type-page-title-size": "26px",
    "--type-page-title-line": "32px",
    "--type-page-title-weight": "600",
    "--type-section-title-size": "20px",
    "--type-section-title-line": "26px",
    "--type-section-title-weight": "600",
    "--type-body-size": "15px",
    "--type-body-line": "22px",
    "--type-body-weight": "400",
    "--type-row-size": "15px",
    "--type-row-line": "22px",
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
    "--space-3": "12px",
    "--space-4": "16px",
    "--space-5": "20px",
    "--space-6": "24px",
    "--space-8": "32px",
    "--space-10": "40px",
    "--space-12": "48px",
    "--space-16": "64px",
    "--radius-control": "8px",
    "--radius-card": "12px",
    "--radius-overlay": "16px",
    "--radius-dialog": "20px",
    "--radius-pill": "999px",
    "--border-default": "1px",
    "--control-target-desktop": "36px",
    "--control-target-touch": "44px",
    "--task-status-indicator-size": "20px",
    "--task-row-compact-height": "44px",
    "--task-row-standard-height": "64px",
    "--task-row-touch-height": "68px",
    "--motion-fast": "100ms",
    "--motion-standard": "160ms",
    "--motion-panel": "220ms",
    "--ease-standard": "cubic-bezier(0.2, 0, 0, 1)",
    "--ease-exit": "cubic-bezier(0.4, 0, 1, 1)",
    "--z-base": "0",
    "--z-sticky": "10",
    "--z-popover": "30",
    "--z-sheet": "40",
    "--z-dialog": "50",
    "--z-toast": "60",
  }),
);

export const requiredDarkTokens = new Map(
  Object.entries({
    "--canvas": "#181914",
    "--surface": "#20211c",
    "--surface-subtle": "#292a24",
    "--surface-hover": "#34362f",
    "--surface-selected": "#243b35",
    "--surface-elevated": "#2c2d27",
    "--border": "#41433b",
    "--border-strong": "#74776e",
    "--text": "#f3f0e7",
    "--text-muted": "#b9b6ac",
    "--text-disabled": "#8b8d84",
    "--text-selected": "#9fdec9",
    "--brand": "#78c4ad",
    "--action": "#eee9dc",
    "--action-hover": "#d9d2c3",
    "--text-on-strong": "#20211c",
    "--focus-ring": "#79a9f2",
    "--success": "#75d5a1",
    "--warning": "#f2c36a",
    "--danger": "#ff8d85",
    "--info": "#8eb8ff",
    "--priority-high": "#ff8d85",
    "--priority-medium": "#f2c36a",
    "--priority-low": "#8eb8ff",
    "--priority-none": "#a8aaa1",
    "--category-coral-bg": "#4a2e31",
    "--category-coral-fg": "#f4b6b9",
    "--category-amber-bg": "#43391f",
    "--category-amber-fg": "#f0cd7c",
    "--category-mint-bg": "#263f34",
    "--category-mint-fg": "#a3ddba",
    "--category-sky-bg": "#273a4a",
    "--category-sky-fg": "#afd1eb",
    "--category-violet-bg": "#3a3147",
    "--category-violet-fg": "#d3bbe5",
    "--category-slate-bg": "#353730",
    "--category-slate-fg": "#d0d0c8",
    "--atmosphere-moss": "#2a3c32",
    "--atmosphere-clay": "#413329",
    "--atmosphere-iris": "#353044",
    "--atmosphere-mist": "#283a42",
    "--atmosphere-blush": "#402e32",
    "--atmosphere-opacity": "0.55",
    "--shadow-overlay": "0 16px 40px rgb(0 0 0 / 0.44)",
    "--shadow-dialog": "0 32px 80px rgb(0 0 0 / 0.56)",
  }),
);

export const contrastPairs = [
  ["--text", "--canvas", 4.5],
  ["--text", "--surface", 4.5],
  ["--text", "--surface-subtle", 4.5],
  ["--text-muted", "--canvas", 4.5],
  ["--text-muted", "--surface", 4.5],
  ["--text-selected", "--surface-selected", 4.5],
  ["--text-on-strong", "--action", 4.5],
  ["--text-on-strong", "--action-hover", 4.5],
  ["--text-on-strong", "--brand", 4.5],
  ["--text-on-strong", "--success", 4.5],
  ["--text-on-strong", "--danger", 4.5],
  ["--text-on-strong", "--text-muted", 4.5],
  ["--border-strong", "--surface", 3],
  ["--focus-ring", "--canvas", 3],
  ["--focus-ring", "--surface", 3],
  ["--focus-ring", "--surface-subtle", 3],
  ["--focus-ring", "--surface-selected", 3],
  ["--danger", "--surface", 4.5],
  ["--warning", "--surface", 4.5],
  ["--info", "--surface", 4.5],
  ["--success", "--surface", 4.5],
  ["--category-coral-fg", "--category-coral-bg", 4.5],
  ["--category-amber-fg", "--category-amber-bg", 4.5],
  ["--category-mint-fg", "--category-mint-bg", 4.5],
  ["--category-sky-fg", "--category-sky-bg", 4.5],
  ["--category-violet-fg", "--category-violet-bg", 4.5],
  ["--category-slate-fg", "--category-slate-bg", 4.5],
];

const categoryPairs = contrastPairs
  .filter(([foreground]) => foreground.startsWith("--category-"))
  .map(([foreground, background]) => [foreground, background]);

const evidenceGroups = {
  primary: [
    ["--text", "--canvas"],
    ["--text", "--surface"],
    ["--text", "--surface-subtle"],
  ],
  muted: [
    ["--text-muted", "--canvas"],
    ["--text-muted", "--surface"],
  ],
  action: [
    ["--text-on-strong", "--action"],
    ["--text-on-strong", "--action-hover"],
  ],
  "strong border": [["--border-strong", "--surface"]],
  focus: [
    ["--focus-ring", "--canvas"],
    ["--focus-ring", "--surface"],
    ["--focus-ring", "--surface-subtle"],
    ["--focus-ring", "--surface-selected"],
  ],
  category: categoryPairs,
};

export function buildContrastEvidence(lightTokens, darkTokens) {
  const evidence = Object.entries(evidenceGroups).map(
    ([label, pairs]) =>
      `${label} ${minimumContrast(lightTokens, pairs)}/${minimumContrast(darkTokens, pairs)}`,
  );
  return `Computed contract ratios (light/dark): ${evidence.join("; ")}.`;
}

export function contrastRatio(foreground, background) {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  if (foregroundLuminance === undefined || backgroundLuminance === undefined) return undefined;

  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

function minimumContrast(tokens, pairs) {
  const ratios = pairs.map(([foreground, background]) =>
    contrastRatio(tokens.get(foreground), tokens.get(background)),
  );
  if (ratios.some((ratio) => ratio === undefined)) return "invalid";
  return Math.min(...ratios).toFixed(2);
}

function relativeLuminance(value) {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(value ?? "");
  if (!match) return undefined;

  const channels = match.slice(1).map((channel) => Number.parseInt(channel, 16) / 255);
  const linear = channels.map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}
