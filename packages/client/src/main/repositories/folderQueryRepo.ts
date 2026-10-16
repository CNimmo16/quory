import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import { basename, isAbsolute, join, resolve } from "node:path";
import { z } from "zod";
import { queryDefinitionSchema } from "./queryDefinitionSchema";
import { isSqlQuery } from "../../shared/sqlQuery";
import type { SavedQuery } from "./queryRepo";
import makeRepo from "../util/makeRepo";

const writingFiles = new Set<string>();

type Document = SavedQuery & { _id: string; _rev: string };
const queryFileSchema = queryDefinitionSchema.and(
  z.object({
    version: z.literal(1).optional(),
    id: z.string().optional(),
    nickname: z.string().trim().min(1),
  }),
);
const manifestSchema = z.object({
  version: z.literal(1),
  id: z.string().uuid(),
  name: z.string().min(1),
});
const revision = (contents: string) =>
  createHash("sha256").update(contents).digest("hex");
const isMissing = (error: unknown) =>
  (error as NodeJS.ErrnoException).code === "ENOENT";
const conflict = () =>
  Object.assign(
    new Error("This query changed on disk. Reopen it before saving."),
    { status: 409 },
  );
let metadataRepo:
  | ReturnType<
      typeof makeRepo<{
        fileRevision: string;
        chatMessages?: SavedQuery["chatMessages"];
        lastChatRequestId?: string | undefined;
        queryHistory?: SavedQuery["queryHistory"];
      }>
    >
  | undefined;
function metadata() {
  return (metadataRepo ??= makeRepo("folderQueryMetadata"));
}

export async function initializeProjectFolder(
  folderPath: string,
  name: string,
) {
  if (!isAbsolute(folderPath))
    throw new Error("Choose an absolute folder path.");
  const selected = await fs.realpath(resolve(folderPath));
  if (!(await fs.stat(selected)).isDirectory())
    throw new Error("Choose a folder, rather than a file.");
  const directory =
    basename(selected) === ".quory" ? selected : join(selected, ".quory");
  await fs.mkdir(directory, { recursive: true });
  const canonicalDirectory = await fs.realpath(directory);
  const manifestPath = join(canonicalDirectory, "project.json");
  let manifest: z.infer<typeof manifestSchema>;
  try {
    manifest = manifestSchema.parse(
      JSON.parse(await fs.readFile(manifestPath, "utf8")),
    );
  } catch (error) {
    if (!isMissing(error))
      throw new Error(
        "Could not read .quory/project.json. Check that it contains a valid Quory project.",
      );
    manifest = { version: 1, id: randomUUID(), name };
    try {
      await fs.writeFile(
        manifestPath,
        JSON.stringify(manifest, null, 2) + "\n",
        { flag: "wx" },
      );
    } catch (writeError) {
      if ((writeError as NodeJS.ErrnoException).code !== "EEXIST")
        throw writeError;
      manifest = manifestSchema.parse(
        JSON.parse(await fs.readFile(manifestPath, "utf8")),
      );
    }
  }
  await fs.mkdir(join(canonicalDirectory, "queries"), { recursive: true });
  await fs
    .writeFile(join(canonicalDirectory, ".gitignore"), "queries/*.tmp\n", {
      flag: "wx",
    })
    .catch((error: unknown) => {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    });
  return { directory: canonicalDirectory, manifest };
}

export class FolderQueryRepo {
  constructor(
    private directory: string,
    private projectId: string,
  ) {}
  private file(id: string) {
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id))
      throw new Error("Invalid query file ID.");
    return join(this.directory, "queries", `${id}.json`);
  }
  private metadataId(id: string) {
    return `${this.projectId}:${id}`;
  }
  private async read(id: string) {
    let contents: string;
    try {
      contents = await fs.readFile(this.file(id), "utf8");
    } catch (error) {
      if (isMissing(error))
        throw Object.assign(new Error("Query file not found."), {
          status: 404,
        });
      throw error;
    }
    try {
      const value = queryFileSchema.parse(JSON.parse(contents));
      if (value.id && value.id !== id)
        throw new Error("Query ID does not match its filename.");
      return {
        ...value,
        _id: id,
        _rev: revision(contents),
        projectId: this.projectId,
      };
    } catch (error) {
      throw new Error(
        `Could not read query ${id}.json: ${
          error instanceof Error ? error.message : "Invalid JSON"
        }`,
      );
    }
  }
  async get(id: string): Promise<Document> {
    const doc = await this.read(id);
    const local = await metadata()
      .get(this.metadataId(id))
      .catch((error: unknown) => {
        if ((error as { status?: number }).status === 404) return undefined;
        throw error;
      });
    return {
      ...doc,
      ...(local?.fileRevision === doc._rev
        ? {
            ...(local.chatMessages ? { chatMessages: local.chatMessages } : {}),
            ...(local.lastChatRequestId
              ? { lastChatRequestId: local.lastChatRequestId }
              : {}),
            ...(local.queryHistory ? { queryHistory: local.queryHistory } : {}),
          }
        : {}),
    };
  }
  async allDocs(_options: { include_docs: true }) {
    const names = await fs.readdir(join(this.directory, "queries"));
    const rows = await Promise.all(
      names
        .filter((name) => name.endsWith(".json"))
        .sort()
        .map(async (name) => {
          const id = name.slice(0, -5);
          try {
            return { id, doc: await this.get(id) };
          } catch (error) {
            // Git updates may remove a file between directory listing and read.
            if ((error as { status?: number }).status === 404) return null;
            throw error;
          }
        }),
    );
    return {
      rows: rows.filter((row): row is NonNullable<typeof row> => row !== null),
    };
  }
  private async locked<T>(id: string, action: () => Promise<T>) {
    const file = this.file(id);
    if (writingFiles.has(file)) throw conflict();
    writingFiles.add(file);
    try {
      return await action();
    } finally {
      writingFiles.delete(file);
    }
  }
  private async checkRevision(id: string, expected?: string) {
    const current = await this.read(id).catch((error: unknown) => {
      if ((error as { status?: number }).status === 404) return undefined;
      throw error;
    });
    if (current?._rev !== expected) throw conflict();
  }
  async put(doc: SavedQuery & { _id: string; _rev?: string }) {
    return this.locked(doc._id, async () => {
      await this.checkRevision(doc._id, doc._rev);
      // Only portable query definitions are shared. Chat, history, connection
      // credentials, and machine-local project paths remain in app storage.
      const contents =
        JSON.stringify(
          queryFileSchema.parse({
            version: 1,
            id: doc._id,
            nickname: doc.nickname,
            ...(isSqlQuery(doc)
              ? {
                  mode: "sql",
                  sql: doc.sql,
                  parameters: doc.parameters,
                  dialect: doc.dialect,
                }
              : { base: doc.base, limit: doc.limit, offset: doc.offset }),
          }),
          null,
          2,
        ) + "\n";
      const rev = revision(contents);
      const target = this.file(doc._id);
      const temporary = `${target}.${randomUUID()}.tmp`;
      try {
        await fs.writeFile(temporary, contents, { flag: "wx" });
        await this.checkRevision(doc._id, doc._rev);
        const previous = await metadata()
          .get(this.metadataId(doc._id))
          .catch((error: unknown) => {
            if ((error as { status?: number }).status === 404) return undefined;
            throw error;
          });
        // Persist local metadata before publishing the matching file revision.
        await metadata().put({
          _id: this.metadataId(doc._id),
          _rev: previous?._rev,
          fileRevision: rev,
          chatMessages: doc.chatMessages,
          lastChatRequestId: doc.lastChatRequestId,
          queryHistory: doc.queryHistory,
        });
        await fs.rename(temporary, target);
      } finally {
        await fs.unlink(temporary).catch((error: unknown) => {
          if (!isMissing(error)) throw error;
        });
      }
      return { ok: true, id: doc._id, rev };
    });
  }
  async remove(doc: Document) {
    return this.locked(doc._id, async () => {
      await this.checkRevision(doc._id, doc._rev);
      await fs.unlink(this.file(doc._id));
      return { ok: true, id: doc._id, rev: doc._rev };
    });
  }
}
