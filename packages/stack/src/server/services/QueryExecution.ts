import type { ClientDatabase } from "./DatabaseService";

const executions = new WeakMap<
  ClientDatabase,
  Map<string | symbol, AbortController>
>();
export async function withQueryExecution<T>(
  database: ClientDatabase,
  id: string | undefined,
  run: (signal?: AbortSignal) => Promise<T>,
) {
  const key = id ?? Symbol("query");
  let active = executions.get(database);
  if (!active) executions.set(database, (active = new Map()));
  if (active.has(key)) throw new Error("Query is already running.");
  const controller = new AbortController();
  active.set(key, controller);
  try {
    return await run(controller.signal);
  } finally {
    active.delete(key);
  }
}
export function cancelQueryExecution(database: ClientDatabase, id: string) {
  executions.get(database)?.get(id)?.abort(new Error("Query cancelled."));
}

export function cancelAllQueryExecutions(database: ClientDatabase) {
  for (const controller of executions.get(database)?.values() ?? [])
    controller.abort(new Error("Database session is disposed."));
}
