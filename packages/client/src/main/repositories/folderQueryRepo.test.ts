import { afterEach, expect, it, vi } from "vitest";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FolderQueryRepo, initializeProjectFolder } from "./folderQueryRepo";

vi.mock("../util/makeRepo", () => ({
  default: () => {
    const docs = new Map<string, Record<string, unknown>>();
    return {
      get: async (id: string) => {
        const doc = docs.get(id);
        if (!doc) throw { status: 404 };
        return structuredClone(doc);
      },
      put: async (doc: Record<string, unknown> & { _id: string }) => {
        docs.set(doc._id, { ...doc, _rev: "1-metadata" });
        return { rev: "1-metadata" };
      },
    };
  },
}));
const folders: string[] = [];
afterEach(async () => {
  await Promise.all(
    folders
      .splice(0)
      .map((folder) => fs.rm(folder, { recursive: true, force: true }))
  );
});
async function fixture() {
  const root = await fs.mkdtemp(join(tmpdir(), "quory-project-"));
  folders.push(root);
  const { directory, manifest } = await initializeProjectFolder(
    root,
    "Team project"
  );
  const repo = new FolderQueryRepo(directory, manifest.id);
  return { root, directory, manifest, repo };
}
const query = {
  _id: "orders",
  nickname: "Recent orders",
  base: { tableRef: "public.orders", select: "*" as const },
  limit: 100,
  offset: 0,
};

it("opens either the repository or .quory folder and loads portable queries without overwriting them", async () => {
  const { root, directory, manifest, repo } = await fixture();
  const created = await repo.put({
    ...query,
    chatMessages: [
      { id: "private-chat", role: "user", content: "Private conversation" },
    ],
    lastChatRequestId: "request",
  });
  const file = join(directory, "queries", "orders.json");
  const contents = await fs.readFile(file, "utf8");
  expect(JSON.parse(contents)).toEqual({
    version: 1,
    id: "orders",
    nickname: query.nickname,
    base: query.base,
    limit: 100,
    offset: 0,
  });
  expect(contents).not.toContain("connectionId");
  expect(contents).not.toContain("private-chat");
  expect((await repo.get("orders")).lastChatRequestId).toBe("request");
  expect(
    (await initializeProjectFolder(root, "Other local name")).manifest
  ).toEqual(manifest);
  expect(
    (await initializeProjectFolder(directory, "Other name")).directory
  ).toBe(directory);
  expect(await fs.readFile(file, "utf8")).toBe(contents);
  const imported = new FolderQueryRepo(directory, "other-machine-project");
  expect(
    (await imported.allDocs({ include_docs: true })).rows[0]!.doc
  ).toMatchObject({
    nickname: "Recent orders",
    projectId: "other-machine-project",
    _rev: created.rev,
  });
  expect((await imported.get("orders")).chatMessages).toBeUndefined();
});

it("round trips edits, renames and deletion, and rejects stale external edits", async () => {
  const { repo, directory } = await fixture();
  const created = await repo.put(query);
  const update = await repo.put({
    ...query,
    _rev: created.rev,
    nickname: "Paid orders",
  });
  expect(update.rev).not.toBe(created.rev);
  expect((await repo.get("orders")).nickname).toBe("Paid orders");
  await expect(repo.put({ ...query, _rev: created.rev })).rejects.toMatchObject(
    { status: 409 }
  );
  const snapshot = await repo.get("orders");
  const file = join(directory, "queries", "orders.json");
  const external = {
    ...JSON.parse(await fs.readFile(file, "utf8")),
    nickname: "Changed in Git",
  };
  await fs.writeFile(file, JSON.stringify(external));
  await expect(repo.remove(snapshot)).rejects.toMatchObject({ status: 409 });
  await expect(
    repo.put({ ...snapshot, nickname: "Stale save" })
  ).rejects.toMatchObject({ status: 409 });
  const current = await repo.get("orders");
  expect(current.nickname).toBe("Changed in Git");
  expect(current.queryHistory).toBeUndefined();
  await repo.remove(current);
  expect((await repo.allDocs({ include_docs: true })).rows).toEqual([]);
  expect(await fs.readdir(join(directory, "queries"))).toEqual([]);
});

it("serializes competing saves and preserves the winning query", async () => {
  const { repo } = await fixture();
  const created = await repo.put(query);
  const results = await Promise.allSettled([
    repo.put({ ...query, _rev: created.rev, nickname: "First edit" }),
    repo.put({ ...query, _rev: created.rev, nickname: "Second edit" }),
  ]);
  expect(
    results.filter((result) => result.status === "fulfilled")
  ).toHaveLength(1);
  expect(results.filter((result) => result.status === "rejected")).toHaveLength(
    1
  );
  expect(["First edit", "Second edit"]).toContain(
    (await repo.get("orders")).nickname
  );
});

it("reports malformed query files and invalid paths without replacing data", async () => {
  const { repo, directory } = await fixture();
  await expect(repo.get("../outside")).rejects.toThrow("Invalid query file ID");
  await expect(
    initializeProjectFolder("relative/path", "Bad path")
  ).rejects.toThrow("absolute folder path");
  const file = join(directory, "queries", "broken.json");
  await fs.writeFile(file, "{broken");
  await expect(repo.allDocs({ include_docs: true })).rejects.toThrow(
    "Could not read query broken.json"
  );
  expect(await fs.readFile(file, "utf8")).toBe("{broken");
});

it("round trips custom SQL files with bound parameters independently of relationships", async () => {
  const { repo, directory } = await fixture();
  const result = await repo.put({
    _id: "custom",
    nickname: "Custom SQL",
    mode: "sql",
    sql: "SELECT * FROM orders WHERE status = $1",
    parameters: ["paid"],
    dialect: "postgres",
  });
  const contents = JSON.parse(
    await fs.readFile(join(directory, "queries", "custom.json"), "utf8")
  );
  expect(contents).toMatchObject({
    mode: "sql",
    sql: "SELECT * FROM orders WHERE status = $1",
    parameters: ["paid"],
    dialect: "postgres",
  });
  expect(contents).not.toHaveProperty("base");
  expect(await repo.get("custom")).toMatchObject({
    mode: "sql",
    _rev: result.rev,
  });
});
