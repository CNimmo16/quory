import type { ClientDatabase } from "./DatabaseService";

const executions = new WeakMap<ClientDatabase, Map<string, AbortController>>();
export async function withQueryExecution<T>(
  database: ClientDatabase,
  id: string | undefined,
  run: (signal?: AbortSignal) => Promise<T>
) {
  if (!id) return run();
  let active = executions.get(database);
  if (!active) executions.set(database, (active = new Map()));
  if (active.has(id)) throw new Error("Query is already running.");
  const controller = new AbortController();
  active.set(id, controller);
  try {
    return await run(controller.signal);
  } finally {
    active.delete(id);
  }
}
export function cancelQueryExecution(database: ClientDatabase, id: string) {
  executions.get(database)?.get(id)?.abort(new Error("Query cancelled."));
}
