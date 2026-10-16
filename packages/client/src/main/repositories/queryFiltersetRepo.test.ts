import { rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { captureFilterset } from "../../shared/queryFiltersets";
const storage = vi.hoisted(() => ({
  path: `/tmp/quory-filtersets-${process.pid}-${Math.random()
    .toString(36)
    .slice(2)}`,
}));
vi.mock("electron", () => ({ app: { getPath: () => storage.path } }));

it("persists filtersets across database reopen under app userData rather than the project folder", async () => {
  const { queryFiltersetRepo } = await import("./queryFiltersetRepo");
  let repo: ReturnType<typeof queryFiltersetRepo> | undefined =
    queryFiltersetRepo();
  try {
    const snapshot = captureFilterset({
      base: { tableRef: "public.orders", select: ["id"] },
    });
    await repo.put({
      _id: "saved",
      projectId: "folder-project",
      queryId: "query",
      name: "All orders",
      createdAt: new Date().toISOString(),
      snapshot,
    });
    await repo.close();
    repo = undefined;
    vi.resetModules();
    const reopened = await import("./queryFiltersetRepo");
    repo = reopened.queryFiltersetRepo();
    expect(await repo.get("saved")).toMatchObject({
      name: "All orders",
      projectId: "folder-project",
      snapshot,
    });
    expect(existsSync(join(storage.path, "pouchdb", "query-filtersets"))).toBe(
      true,
    );
    expect(existsSync(join(storage.path, ".quory"))).toBe(false);
  } finally {
    if (repo) await repo.destroy();
    await rm(storage.path, { recursive: true, force: true });
  }
});
