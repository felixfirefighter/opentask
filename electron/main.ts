import { app, BrowserWindow, dialog, ipcMain, nativeTheme, shell } from "electron";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { startDesktopRuntime, type DesktopRuntime } from "./runtime.js";

const development = process.argv.includes("--dev");
const smoke = process.env.OPENTASK_SMOKE_MODE === "1";
const moduleDirectory = dirname(fileURLToPath(import.meta.url));
const configuredUserDataPath = process.env.OPENTASK_USER_DATA_PATH;
if (configuredUserDataPath) {
  const userDataPath = resolve(configuredUserDataPath);
  mkdirSync(userDataPath, { recursive: true });
  app.setPath("userData", userDataPath);
}
const hasSingleInstance = app.requestSingleInstanceLock();
let window: BrowserWindow | undefined;
let runtime: DesktopRuntime | undefined;
let stopping = false;

const windowThemeColors = {
  light: { background: "#f4f1e9", symbol: "#24251f" },
  dark: { background: "#181914", symbol: "#f3f0e7" },
} as const;

ipcMain.on("opentask-window-theme", (event, theme: unknown) => {
  if (event.sender !== window?.webContents || (theme !== "light" && theme !== "dark")) return;
  applyWindowTheme(window, theme);
});

if (!hasSingleInstance) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!window) return;
    if (window.isMinimized()) window.restore();
    window.focus();
  });

  app.whenReady().then(launch).catch(handleLaunchFailure);

  app.on("before-quit", (event) => {
    if (stopping || !runtime) return;
    event.preventDefault();
    stopping = true;
    void runtime.stop().finally(() => app.quit());
  });

  app.on("window-all-closed", () => app.quit());
}

async function launch(): Promise<void> {
  app.setName("OpenTask");
  if (process.platform === "win32") app.setAppUserModelId("com.rarticle.opentask");

  runtime = await startDesktopRuntime({
    mode: development ? "development" : "production",
    projectRoot: app.isPackaged
      ? resolve(process.resourcesPath, "next-server")
      : resolve(moduleDirectory, ".."),
    resourcesPath: process.resourcesPath,
    userDataPath: app.getPath("userData"),
  });
  nativeTheme.themeSource = "light";

  window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 960,
    minHeight: 640,
    show: false,
    backgroundColor: windowThemeColors.light.background,
    ...(process.platform === "win32" || process.platform === "linux"
      ? {
          titleBarOverlay: {
            color: windowThemeColors.light.background,
            symbolColor: windowThemeColors.light.symbol,
            height: 36,
          },
        }
      : {}),
    webPreferences: {
      contextIsolation: true,
      preload: resolve(moduleDirectory, "preload.cjs"),
      sandbox: true,
      nodeIntegration: false,
    },
  });

  const trustedOrigin = new URL(runtime.serverUrl).origin;
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//u.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, url) => {
    if (new URL(url).origin !== trustedOrigin) event.preventDefault();
  });
  await window.loadURL(runtime.serverUrl);
  window.center();
  window.show();
  if (smoke) setTimeout(() => app.quit(), 1_000);
}

function applyWindowTheme(target: BrowserWindow, theme: "light" | "dark") {
  const colors = windowThemeColors[theme];
  nativeTheme.themeSource = theme;
  target.setBackgroundColor(colors.background);
  if (process.platform === "win32" || process.platform === "linux") {
    target.setTitleBarOverlay({
      color: colors.background,
      symbolColor: colors.symbol,
      height: 36,
    });
  }
}

function handleLaunchFailure(error: unknown): void {
  const detail = error instanceof Error ? error.message : "Unknown desktop startup failure.";
  dialog.showErrorBox("OpenTask could not start", detail);
  app.quit();
}
