import { makeQuoryRequestHandler } from "@quory/stack/server";
import { BrowserWindow, ipcMain } from "electron";
import { createIPCHandler } from "trpc-electron/main";
import activeConnectionState from "./state/activeConnectionState";
import appRouter from "./routers";

export type AppRouter = typeof appRouter;

const trpcHandler = createIPCHandler({ router: appRouter, windows: [] });

export async function attachIpcHandlers(window: BrowserWindow) {
  const activeConnection = await activeConnectionState.getActiveConnection();

  if (activeConnection) {
    const handleQuoryRequest = await makeQuoryRequestHandler({
      database: activeConnection,
    });
    ipcMain.removeHandler("quory");
    ipcMain.handle("quory", (event, body) => handleQuoryRequest(body));
  }

  trpcHandler.attachWindow(window);
}

export async function detatchIpcHandlers(window: BrowserWindow) {
  trpcHandler.detachWindow(window);
}
