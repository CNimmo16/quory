import type { DatabaseDriver, ExecutionOptions } from "./DatabaseDriver";
import type { SqlParameter } from "./sqlDialect";

/** Deadline applies to both row queries and explicitly requested exact counts. */
export default async function executeQuery(
  driver: DatabaseDriver,
  sql: string,
  parameters: SqlParameter[],
  options: ExecutionOptions = {},
) {
  const controller = new AbortController();
  const abort = () => controller.abort(options.signal?.reason);
  if (options.signal?.aborted) abort();
  else options.signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(
    () => controller.abort(new Error("Query timed out.")),
    options.timeoutMs ?? 15_000,
  );
  let onAbort: () => void = () => {};
  try {
    controller.signal.throwIfAborted();
    return await Promise.race([
      driver.exec(sql, parameters, { signal: controller.signal }),
      new Promise<never>((_, reject) => {
        onAbort = () =>
          reject(controller.signal.reason ?? new Error("Query cancelled."));
        controller.signal.addEventListener("abort", onAbort, { once: true });
      }),
    ]);
  } catch (error) {
    if (controller.signal.aborted) throw controller.signal.reason;
    throw error;
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", abort);
    controller.signal.removeEventListener("abort", onAbort);
  }
}
