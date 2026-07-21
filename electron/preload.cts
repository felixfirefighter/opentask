const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("omplishDesktop", {
  isDesktop: true,
  setWindowTheme(theme: "light" | "dark") {
    if (theme === "light" || theme === "dark") ipcRenderer.send("omplish-window-theme", theme);
  },
});
