import { BrowserWindow, ipcMain } from "electron";
import { createIPCHandler } from "trpc-electron/main";
import { z } from "zod";
import { savedQueryService } from "./repositories/savedQueryService";
import appRouter from "./routers";
import { getQuorySession } from "./state/quorySession";

export type AppRouter = typeof appRouter;

const trpcHandler = createIPCHandler({ router: appRouter, windows: [] });

export async function attachIpcHandlers(window: BrowserWindow) {
  ipcMain.removeHandler("quory");
  ipcMain.handle("quory", async (_event, body) => {
    const { connectionId } = z.object({ connectionId: z.string() }).parse(body);
    const context = await savedQueryService.assertConnection(connectionId);
    const session = await getQuorySession();
    await savedQueryService.assertConnection(context);
    const result = await session.request(body);
    await savedQueryService.assertConnection(context);
    return result;
  });

  trpcHandler.attachWindow(window);
}

export async function detatchIpcHandlers(window: BrowserWindow) {
  trpcHandler.detachWindow(window);
}
