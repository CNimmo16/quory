import { TRPCError } from "@trpc/server";
import { isSqlQuery, type QueryDefinition } from "../../shared/sqlQuery";
import { type SavedQuery } from "./queryRepo";
import activeConnectionState from "../state/activeConnectionState";
import {
  appendQueryVersion,
  createQueryHistory,
} from "../../shared/queryHistory";

import { activeProjectState } from "../state/activeProjectState";
import { projectQueryRepo } from "./projectQueryRepo";

export type SavedQueryContext = {
  connectionId: string;
  generation: number;
  projectId: string;
  projectGeneration: number;
};
type ConnectionContext = string | SavedQueryContext;

// Renderer context is only a claim: validate it against main-process state on
// entry and again after asynchronous reads, before returning data or writing.
function assertGeneration(context: SavedQueryContext) {
  activeProjectState.assertCurrent(
    context.projectId,
    context.projectGeneration,
  );
  if (activeConnectionState.getConnectionGeneration() !== context.generation)
    throw new TRPCError({
      code: "CONFLICT",
      message:
        "The active connection changed. Start again on the current connection.",
    });
}

async function assertConnection(
  context: ConnectionContext,
): Promise<SavedQueryContext> {
  const project = activeProjectState.requireActiveProject();
  const projectGeneration =
    typeof context === "string"
      ? activeProjectState.getProjectGeneration()
      : context.projectGeneration;
  const projectId =
    typeof context === "string" ? project._id : context.projectId;
  activeProjectState.assertCurrent(projectId, projectGeneration);
  const connectionId =
    typeof context === "string" ? context : context.connectionId;
  const generation =
    typeof context === "string"
      ? activeConnectionState.getConnectionGeneration()
      : context.generation;
  if (
    (await activeConnectionState.getActiveConnectionId()) !== connectionId ||
    activeConnectionState.getConnectionGeneration() !== generation
  )
    throw new TRPCError({
      code: "CONFLICT",
      message:
        "The active connection changed. Start again on the current connection.",
    });
  activeProjectState.assertCurrent(projectId, projectGeneration);
  return { connectionId, generation, projectId, projectGeneration };
}

async function fetch(connection: ConnectionContext, queryId: string) {
  const context = await assertConnection(connection);
  const query = await projectQueryRepo(
    activeProjectState.requireActiveProject(),
  ).get(queryId);
  if (query.projectId !== context.projectId)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "This query belongs to a different project.",
    });
  await assertConnection(context);
  return query;
}

function assertRevision(actual: string, revision: string) {
  if (actual !== revision)
    throw new TRPCError({
      code: "CONFLICT",
      message: "This query changed. Reopen it before trying again.",
    });
}

async function write(
  context: SavedQueryContext,
  doc: SavedQuery & { _id: string; _rev?: string },
) {
  await assertConnection(context);
  // No await between this check and dispatching the write.
  assertGeneration(context);
  try {
    return await projectQueryRepo(
      activeProjectState.requireActiveProject(),
    ).put(doc);
  } catch (error) {
    if ((error as { status?: number }).status === 409)
      throw new TRPCError({
        code: "CONFLICT",
        message: "This query changed. Reopen it before trying again.",
      });
    throw error;
  }
}

export const savedQueryService = {
  assertConnection,
  assertCurrent: assertGeneration,
  fetch,
  async list(connection?: ConnectionContext, projectId?: string) {
    const project = activeProjectState.requireActiveProject();
    const projectGeneration = activeProjectState.getProjectGeneration();
    activeProjectState.assertCurrent(
      projectId ?? project._id,
      projectGeneration,
    );
    const context =
      connection !== undefined ? await assertConnection(connection) : undefined;
    const { rows } = await projectQueryRepo(project).allDocs({
      include_docs: true,
    });
    activeProjectState.assertCurrent(project._id, projectGeneration);
    if (context) await assertConnection(context);
    return rows
      .filter((row) => row.doc?.projectId === project._id)
      .map((row) => ({ id: row.id, query: row.doc! }));
  },
  async create(
    connection: ConnectionContext,
    queryId: string,
    query: QueryDefinition,
    nickname: string,
    metadata: Pick<
      SavedQuery,
      "chatMessages" | "lastChatRequestId" | "queryHistory"
    > = {},
  ) {
    const context = await assertConnection(connection);
    const { projectId } = context;
    return write(context, {
      ...query,
      ...(!isSqlQuery(query)
        ? { queryHistory: createQueryHistory(query) }
        : {}),
      ...metadata,
      _id: queryId,
      projectId,
      nickname,
    });
  },
  async update(
    connection: ConnectionContext,
    queryId: string,
    revision: string,
    changes: { query?: QueryDefinition; nickname?: string } & Pick<
      SavedQuery,
      "chatMessages" | "lastChatRequestId" | "queryHistory"
    >,
  ) {
    const context = await assertConnection(connection);
    const existing = await fetch(context, queryId);
    assertRevision(existing._rev, revision);
    const { query, ...metadata } = changes;
    const { queryHistory: _providedHistory, ...sqlMetadata } = metadata;
    // Conversion replaces the definition; never retain a relationship tree or
    // its undo snapshots on a custom SQL query.
    const {
      base: _base,
      limit: _limit,
      offset: _offset,
      mode: _mode,
      sql: _sql,
      parameters: _parameters,
      dialect: _dialect,
      queryHistory: _history,
      ...previousMetadata
    } = existing;
    if (query && !isSqlQuery(query) && isSqlQuery(existing))
      throw new TRPCError({
        code: "BAD_REQUEST",
        message:
          "SQL queries cannot be converted back to relationship queries.",
      });
    const next = query ?? existing;
    return write(context, {
      ...previousMetadata,
      ...next,
      ...(!isSqlQuery(next)
        ? {
            queryHistory:
              query && !isSqlQuery(query) && !isSqlQuery(existing)
                ? appendQueryVersion(
                    existing.queryHistory ?? createQueryHistory(existing),
                    query,
                  )
                : (existing.queryHistory ?? createQueryHistory(next)),
          }
        : {}),
      ...(isSqlQuery(next) ? sqlMetadata : metadata),
      _id: existing._id,
      _rev: revision,
      projectId: context.projectId,
    });
  },
  async delete(
    connection: ConnectionContext,
    queryId: string,
    revision: string,
  ) {
    const context = await assertConnection(connection);
    const query = await fetch(context, queryId);
    assertRevision(query._rev, revision);
    await assertConnection(context);
    assertGeneration(context);
    try {
      await projectQueryRepo(activeProjectState.requireActiveProject()).remove(
        query,
      );
    } catch (error) {
      if ((error as { status?: number }).status === 409)
        throw new TRPCError({
          code: "CONFLICT",
          message: "This query changed. Reopen it before trying again.",
        });
      throw error;
    }
  },
};
