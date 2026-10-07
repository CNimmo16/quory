import { BrowserWindow, ipcMain } from "electron";
import { createIPCHandler } from "trpc-electron/main";
import activeConnectionState from "./state/activeConnectionState";
import appRouter from "./routers";
import { getQuorySession } from "./state/quorySession";

export type AppRouter = typeof appRouter;

const trpcHandler = createIPCHandler({ router: appRouter, windows: [] });

export async function attachIpcHandlers(window: BrowserWindow) {
  const activeConnection = await activeConnectionState.getActiveConnection();

  if (activeConnection) {
    await getQuorySession();
    ipcMain.removeHandler("quory");
    ipcMain.handle("quory", async (_event, body) =>
      (await getQuorySession()).request(body)
    );
  }

  trpcHandler.attachWindow(window);
}

export async function detatchIpcHandlers(window: BrowserWindow) {
  trpcHandler.detachWindow(window);
}
