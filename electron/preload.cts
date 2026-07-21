const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("opentaskDesktop", {
  isDesktop: true,
  setWindowTheme(theme: "light" | "dark") {
    if (theme === "light" || theme === "dark") ipcRenderer.send("opentask-window-theme", theme);
  },
});
