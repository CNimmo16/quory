import { getSchemas, type DatabaseDriver } from "@quory/core";
import routes, {
  type RouterPath,
  type RouterRequest,
  type RouterResponse,
} from "../server/routes";
import {
  cancelAllQueryExecutions,
  cancelQueryExecution,
} from "../server/services/QueryExecution";

/** Use Stack's normal routes with a browser-owned driver, without Node adapters. */
export async function makeBrowserQuoryHandler(driver: DatabaseDriver) {
  const database = { driver, schemas: await getSchemas(driver) };
  const operations = new Set<Promise<unknown>>();
  let disposed = false;
  let disposal: Promise<void> | undefined;
  async function fetchFn<P extends RouterPath>(
    path: P,
    data: RouterRequest<P>,
    signal?: AbortSignal,
  ): Promise<RouterResponse<P>>;
  // Match QuoryProvider's custom transport interface while retaining typed calls.
  async function fetchFn(
    path: string,
    data?: unknown,
    signal?: AbortSignal,
  ): Promise<unknown>;
  async function fetchFn(
    path: string,
    data: unknown = {},
    signal?: AbortSignal,
  ): Promise<unknown> {
    if (disposed) throw new Error("Database session is disposed.");
    signal?.throwIfAborted();
    if (!Object.prototype.hasOwnProperty.call(routes, path))
      throw new Error(`Unknown Quory route: ${path}`);
    const route = routes[path as RouterPath];
    const executionId =
      path === "query" || path === "queryCount"
        ? crypto.randomUUID()
        : undefined;
    const abort = () => {
      if (executionId) cancelQueryExecution(database, executionId);
    };
    signal?.addEventListener("abort", abort, { once: true });
    const pending = route.handle(
      { database },
      executionId ? { ...(data as object), executionId } : data,
    );
    operations.add(pending);
    try {
      return await pending;
    } finally {
      operations.delete(pending);
      signal?.removeEventListener("abort", abort);
    }
  }
  return {
    schemas: database.schemas,
    fetchFn,
    dispose() {
      if (disposal) return disposal;
      disposed = true;
      cancelAllQueryExecutions(database);
      return (disposal = (async () => {
        await Promise.allSettled([...operations]);
        await driver.teardown();
      })());
    },
  };
}

export type { RouterPath, RouterRequest, RouterResponse };
