import { spawn, type ChildProcess } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  DatabaseDriver,
  SqlExecutionOptions,
  SqlExecutionResult,
  ExecutionOptions,
  Row,
  SqlParameter,
  TableColumn,
  Relationship,
} from "@quory/core";

// Load the built driver inside the worker, including its native SQLite binding.
const moduleFile =
  typeof __filename === "string" ? __filename : fileURLToPath(import.meta.url);
const driverModule = join(
  dirname(moduleFile),
  moduleFile.endsWith(".ts") ? "../dist/index.js" : "index.js"
);
const source = `
const queued = [];
const queue = message => queued.push(message);
process.on('message', queue);
process.on('disconnect', () => process.exit(0));
(async () => {
const { SqliteDriver } = await import(require('node:url').pathToFileURL(process.argv[1]).href);
const driver = new SqliteDriver(process.argv[2], { readonly: true });
const handle = async ({ id, method, args }) => {
  try {
    let result;
    if (method === 'execSql') {
      const custom = new SqliteDriver(process.argv[2], { readonly: args[2].readOnly, fileMustExist: true });
      try { result = await custom.execSql(...args); }
      finally { await custom.teardown(); }
    } else result = await driver[method](...args);
    process.send({ id, result });
  }
  catch (error) { process.send({ id, error: error.message }); }
};
process.removeListener('message', queue);
process.on('message', handle);
queued.forEach(handle);
})().catch(error => { console.error(error); process.exit(1); });`;

/** File-backed app connections run SQLite in an isolated process.
 * A process can be killed during a native SQLite call; worker_threads cannot.
 */
export class WorkerSqliteDriver implements DatabaseDriver {
  readonly dialect = "sqlite" as const;
  private worker: ChildProcess | undefined;
  private closed = false;
  private sequence = 0;
  private terminations = new Set<Promise<void>>();
  private pending = new Map<
    number,
    {
      reject: (error: Error) => void;
      finish: (result: unknown, error?: string) => void;
    }
  >();
  constructor(private filename: string) {}

  private stop(error: Error) {
    const worker = this.worker;
    this.worker = undefined;
    for (const request of this.pending.values()) request.reject(error);
    this.pending.clear();
    if (!worker) return;
    const termination = new Promise<void>((resolve) => {
      if (worker.exitCode !== null || worker.signalCode !== null) resolve();
      else {
        worker.once("close", () => resolve());
        worker.kill("SIGKILL");
      }
    });
    this.terminations.add(termination);
    void termination.finally(() => this.terminations.delete(termination));
    return termination;
  }

  private call<T>(
    method: string,
    args: unknown[],
    options: ExecutionOptions = {}
  ): Promise<T> {
    if (this.closed)
      return Promise.reject(new Error("SQLite worker is closed."));
    if (options.signal?.aborted) return Promise.reject(options.signal.reason);
    if (!this.worker) {
      const worker = spawn(
        process.execPath,
        ["-e", source, driverModule, this.filename],
        {
          env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
          stdio: ["ignore", "ignore", "pipe", "ipc"],
          serialization: "advanced",
        }
      );
      let stderr = "";
      worker.stderr?.on("data", (chunk) => {
        stderr = (stderr + String(chunk)).slice(-2000);
      });
      this.worker = worker;
      worker.on("message", (message) => {
        const { id, result, error } = message as {
          id: number;
          result?: unknown;
          error?: string;
        };
        this.pending.get(id)?.finish(result, error);
      });
      worker.on("error", (error) => {
        if (this.worker === worker) void this.stop(error);
      });
      worker.on("exit", () => {
        if (this.worker === worker)
          void this.stop(new Error(`SQLite worker exited. ${stderr}`));
      });
    }
    const worker = this.worker;
    worker.ref();
    worker.channel?.ref();
    return new Promise<T>((resolve, reject) => {
      const id = ++this.sequence;
      const cleanup = () => {
        clearTimeout(timer);
        options.signal?.removeEventListener("abort", abort);
        this.pending.delete(id);
        if (this.pending.size === 0) {
          worker.unref();
          worker.channel?.unref();
        }
      };
      const fail = (error: Error) => {
        cleanup();
        reject(error);
      };
      // Killing the process interrupts synchronous native SQLite execution.
      // All concurrent requests fail; the next request opens a fresh read-only connection.
      const abort = () => {
        void this.stop(new Error("Query cancelled."));
      };
      const timer = setTimeout(() => {
        void this.stop(new Error("Query timed out."));
      }, options.timeoutMs ?? 15_000);
      options.signal?.addEventListener("abort", abort, { once: true });
      this.pending.set(id, {
        reject: fail,
        finish: (result, error) => {
          cleanup();
          if (error) reject(new Error(error));
          else resolve(result as T);
        },
      });
      worker.send({ id, method, args }, (error) => {
        if (error && this.worker === worker) void this.stop(error);
      });
    });
  }
  exec(
    sql: string,
    parameters: SqlParameter[] = [],
    options?: ExecutionOptions
  ) {
    return this.call<Row[]>("exec", [sql, parameters], options);
  }
  execSql(
    sql: string,
    parameters: SqlParameter[],
    options: SqlExecutionOptions
  ) {
    return this.call<SqlExecutionResult>(
      "execSql",
      [sql, parameters, { readOnly: options.readOnly }],
      options
    );
  }
  testConnection() {
    return this.call<void>("testConnection", []);
  }
  getAllColumnsInDatabase() {
    return this.call<TableColumn[]>("getAllColumnsInDatabase", []);
  }
  getAllForeignKeysInDatabase() {
    return this.call<Relationship[]>("getAllForeignKeysInDatabase", []);
  }
  async teardown() {
    this.closed = true;
    await this.stop(new Error("SQLite worker is closed."));
    await Promise.all(this.terminations);
  }
}
