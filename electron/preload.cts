const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("opentaskDesktop", {
  isDesktop: true,
});
