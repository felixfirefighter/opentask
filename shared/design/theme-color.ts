import pwaMetadata from "./pwa-metadata.json";

export type ResolvedColorScheme = "light" | "dark";

const themeColorSelector = 'meta[name="theme-color"]';

export function themeColorFor(colorScheme: ResolvedColorScheme) {
  return colorScheme === "dark" ? pwaMetadata.darkThemeColor : pwaMetadata.lightThemeColor;
}

export function synchronizeThemeColor(colorScheme: ResolvedColorScheme) {
  if (typeof document === "undefined") return [];

  const elements = [...document.head.querySelectorAll<HTMLMetaElement>(themeColorSelector)];
  const color = themeColorFor(colorScheme);
  for (const element of elements) element.content = color;
  return elements;
}

export function createPublicThemeBootstrapScript() {
  const darkThemeColor = JSON.stringify(pwaMetadata.darkThemeColor);
  const lightThemeColor = JSON.stringify(pwaMetadata.lightThemeColor);

  return `(()=>{const r=document.documentElement;let p="system";try{const s=localStorage.getItem("opentask-theme-preference");if(s==="light"||s==="dark"||s==="system")p=s}catch{}const t=p==="system"?(window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"):p;r.dataset.themePreference=p;r.dataset.theme=t;const c=t==="dark"?${darkThemeColor}:${lightThemeColor};for(const m of document.head.querySelectorAll('meta[name="theme-color"]'))m.content=c})()`;
}
