import { randomUUID } from "node:crypto";
import { dialog } from "electron";
import { z } from "zod";
import { projectRepo } from "../repositories/projectRepo";
import { queryRepo } from "../repositories/queryRepo";
import { projectQueryRepo } from "../repositories/projectQueryRepo";
import { connectionRepo } from "../state/connectionRepo";
import { activeProjectState } from "../state/activeProjectState";
import {
  initializeProjectFolder,
  FolderQueryRepo,
} from "../repositories/folderQueryRepo";
import { publicProcedure, router } from "../util/trpc";
import { TRPCError } from "@trpc/server";

// Idempotent migration: tag legacy docs without deleting or renaming them. A
// fixed project ID lets interrupted migrations resume on the next launch.
let migration: Promise<void> | undefined;
async function migrateLegacyData() {
  const [{ rows: connections }, { rows: queries }] = await Promise.all([
    connectionRepo.allDocs({ include_docs: true }),
    queryRepo.allDocs({ include_docs: true }),
  ]);
  const legacyConnections = connections.filter(
    ({ doc }) => doc && !doc.projectId,
  );
  const legacyQueries = queries.filter(({ doc }) => doc && !doc.projectId);
  if (!legacyConnections.length && !legacyQueries.length) return;
  const id = "imported-project";
  try {
    await projectRepo.get(id);
  } catch (error) {
    if ((error as { status?: number }).status !== 404) throw error;
    await projectRepo.put({
      _id: id,
      name: "Imported project",
      storage: "database",
    });
  }
  for (const { doc } of legacyConnections)
    await connectionRepo.put({ ...doc!, projectId: id });
  for (const { doc } of legacyQueries) {
    const { connectionId: _legacyConnection, ...query } = doc!;
    await queryRepo.put({ ...query, projectId: id });
  }
}
function ensureMigration() {
  return (migration ??= migrateLegacyData().catch((error: unknown) => {
    migration = undefined;
    throw error;
  }));
}

const projectReference = z.object({
  projectId: z.string(),
  revision: z.string(),
});
const queryReference = z.object({
  projectId: z.string(),
  queryId: z.string(),
  revision: z.string(),
});
const nameSchema = z.string().trim().min(1).max(100);
function assertRevision(actual: string, expected: string) {
  if (actual !== expected)
    throw new TRPCError({
      code: "CONFLICT",
      message: "This item changed. Refresh it before trying again.",
    });
}
async function readProjectQuery(input: z.infer<typeof queryReference>) {
  await ensureMigration();
  const project = await projectRepo.get(input.projectId);
  const repo = projectQueryRepo(project);
  const query = await repo.get(input.queryId);
  if (query.projectId !== project._id)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "This query belongs to a different project.",
    });
  assertRevision(query._rev, input.revision);
  return { repo, query };
}

export default router({
  rename: publicProcedure
    .input(projectReference.extend({ name: nameSchema }))
    .mutation(async ({ input }) => {
      await ensureMigration();
      const project = await projectRepo.get(input.projectId);
      assertRevision(project._rev, input.revision);
      const result = await projectRepo.put({ ...project, name: input.name });
      activeProjectState.updateMetadata({
        ...project,
        name: input.name,
        _rev: result.rev,
      });
      return { revision: result.rev };
    }),
  delete: publicProcedure
    .input(projectReference)
    .mutation(async ({ input }) => {
      await ensureMigration();
      const project = await projectRepo.get(input.projectId);
      assertRevision(project._rev, input.revision);
      // Unregister first so this project cannot be opened during cleanup.
      await projectRepo.remove(project);
      if (activeProjectState.getActiveProject()?._id === project._id)
        await activeProjectState.close();
      const [{ rows: connections }, { rows: queries }] = await Promise.all([
        connectionRepo.allDocs({ include_docs: true }),
        queryRepo.allDocs({ include_docs: true }),
      ]);
      for (const { doc } of connections)
        if (doc?.projectId === project._id) await connectionRepo.remove(doc);
      for (const { doc } of queries)
        if (doc?.projectId === project._id) await queryRepo.remove(doc);
      // Folder projects are only unregistered; their shared .quory files remain on disk.
    }),
  renameQuery: publicProcedure
    .input(queryReference.extend({ nickname: nameSchema }))
    .mutation(async ({ input }) => {
      const { repo, query } = await readProjectQuery(input);
      const result = await repo.put({ ...query, nickname: input.nickname });
      return { revision: result.rev };
    }),
  deleteQuery: publicProcedure
    .input(queryReference)
    .mutation(async ({ input }) => {
      const { repo, query } = await readProjectQuery(input);
      await repo.remove(query);
    }),
  listQueries: publicProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input }) => {
      await ensureMigration();
      const project = await projectRepo.get(input.projectId);
      const { rows } = await projectQueryRepo(project).allDocs({
        include_docs: true,
      });
      return {
        queries: rows
          .filter(({ doc }) => doc?.projectId === project._id)
          .map(({ id, doc }) => ({ id, query: doc! })),
      };
    }),
  list: publicProcedure.query(async () => {
    await ensureMigration();
    const { rows } = await projectRepo.allDocs({ include_docs: true });
    return {
      projects: rows
        .filter(({ doc }) => !!doc)
        .map(({ id, doc }) => ({ id, project: doc! })),
      activeProject: activeProjectState.getActiveProject(),
    };
  }),
  create: publicProcedure
    .input(
      z.discriminatedUnion("storage", [
        z.object({
          name: z.string().trim().min(1).max(100),
          storage: z.literal("database"),
        }),
        z.object({
          name: z.string().trim().min(1).max(100),
          storage: z.literal("folder"),
          folderPath: z.string().trim().min(1),
        }),
      ]),
    )
    .mutation(async ({ input }) => {
      await ensureMigration();
      let id: string = randomUUID();
      let directory: string | undefined;
      if (input.storage === "folder") {
        try {
          const initialized = await initializeProjectFolder(
            input.folderPath,
            input.name,
          );
          directory = initialized.directory;
          id = initialized.manifest.id;
          await new FolderQueryRepo(directory, id).allDocs({
            include_docs: true,
          });
        } catch (error) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              error instanceof Error
                ? error.message
                : "Could not open the project folder.",
            cause: error,
          });
        }
      }
      const { rows } = await projectRepo.allDocs({ include_docs: true });
      const existing = rows.find(
        ({ doc }) => directory && doc?.directory === directory,
      );
      if (existing) return { projectId: existing.id };
      // A cloned repository has the same shared manifest but a different local path.
      if (rows.some((row) => row.id === id)) id = randomUUID();
      const definition = {
        name: input.name,
        storage: input.storage,
        ...(directory ? { directory } : {}),
      };
      try {
        await projectRepo.put({ _id: id, ...definition });
      } catch (error) {
        if (!directory || (error as { status?: number }).status !== 409)
          throw error;
        // PouchDB retains deleted IDs. Re-register a removed folder locally
        // without rewriting its shared manifest or query files.
        try {
          const concurrent = await projectRepo.get(id);
          if (concurrent.directory === directory) return { projectId: id };
          throw error;
        } catch (lookupError) {
          if ((lookupError as { status?: number }).status !== 404)
            throw lookupError;
        }
        id = randomUUID();
        await projectRepo.put({ _id: id, ...definition });
      }
      return { projectId: id };
    }),
  open: publicProcedure
    .input(z.object({ projectId: z.string() }))
    .mutation(async ({ input }) => {
      await ensureMigration();
      return { project: await activeProjectState.open(input.projectId) };
    }),
  close: publicProcedure.mutation(async () => activeProjectState.close()),
  chooseFolder: publicProcedure.mutation(async () => {
    const result = await dialog.showOpenDialog({
      title: "Choose a project folder or an existing .quory folder",
      properties: ["openDirectory", "showHiddenFiles"],
    });
    return { path: result.canceled ? null : (result.filePaths[0] ?? null) };
  }),
});
