import { contextBridge, ipcRenderer } from "electron";
import { exposeElectronTRPC } from "trpc-electron/main";

export const api = {
  quory: (body: unknown) => ipcRenderer.invoke("quory", body),
};

process.once("loaded", async () => {
  exposeElectronTRPC();
  contextBridge.exposeInMainWorld("api", api);
});
