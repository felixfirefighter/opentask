import { app, BrowserWindow, dialog, shell } from "electron";
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

  window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 960,
    minHeight: 640,
    show: false,
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

function handleLaunchFailure(error: unknown): void {
  const detail = error instanceof Error ? error.message : "Unknown desktop startup failure.";
  dialog.showErrorBox("OpenTask could not start", detail);
  app.quit();
}
