import type { DatabaseSchema, DatabaseTableInfo } from "@quory/core";
import type { Suggestion } from "./suggestions";
export type DemoDatabase = {
  schemas: DatabaseSchema[];
  suggestions: Suggestion[];
  tables: {
    name: string;
    columns: DatabaseTableInfo["columns"];
    count: number;
  }[];
};

export class DemoSession {
  private worker = new Worker(new URL("./demo.worker.ts", import.meta.url), {
    type: "module",
  });
  private sequence = 0;
  private closed = false;
  private pending = new Map<
    number,
    {
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  onProgress?: (stage: string) => void;
  constructor() {
    this.worker.onmessage = ({ data }) => {
      if (data.progress) {
        this.onProgress?.(data.progress);
        return;
      }
      const pending = this.pending.get(data.id);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.pending.delete(data.id);
      if (data.error) pending.reject(new Error(data.error));
      else pending.resolve(data.result);
    };
    this.worker.onerror = () =>
      this.dispose(
        new Error(
          "The browser database could not start. Please reload and try again.",
        ),
      );
  }
  call<T>(method: string, args: unknown, signal?: AbortSignal): Promise<T> {
    if (this.closed)
      return Promise.reject(
        new Error(
          "This playground has closed. Start over to create another database.",
        ),
      );
    signal?.throwIfAborted();
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const abort = () => {
        const p = this.pending.get(id);
        if (p) {
          clearTimeout(p.timer);
          this.pending.delete(id);
          reject(signal?.reason ?? new Error("Cancelled."));
        }
      };
      const timer = setTimeout(() => {
        this.dispose(
          new Error("The browser database timed out. Start over to try again."),
        );
      }, 20_000);
      signal?.addEventListener("abort", abort, { once: true });
      this.pending.set(id, {
        resolve: (value) => {
          signal?.removeEventListener("abort", abort);
          resolve(value as T);
        },
        reject: (error) => {
          signal?.removeEventListener("abort", abort);
          reject(error);
        },
        timer,
      });
      this.worker.postMessage({ id, method, args });
    });
  }
  fetchFn = (path: string, data?: unknown, signal?: AbortSignal) =>
    this.call("request", { path, data }, signal);
  dispose(error = new Error("Demo closed.")) {
    this.closed = true;
    this.worker.terminate();
    for (const request of this.pending.values()) {
      clearTimeout(request.timer);
      request.reject(error);
    }
    this.pending.clear();
  }
}

export async function demoRequest(
  path: "generate" | "query",
  body: unknown,
  signal?: AbortSignal,
) {
  const response = await fetch(`/api/demo/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  const data = await response.json().catch(() => ({
    error: "The demo service is unavailable. Please try again.",
  }));
  if (!response.ok)
    throw new Error(
      typeof data.error === "string" && data.error.trim()
        ? data.error
        : "The demo service is unavailable. Please try again.",
    );
  return data;
}
