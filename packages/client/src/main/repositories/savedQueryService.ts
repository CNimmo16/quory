import { TRPCError } from "@trpc/server";
import type { Query } from "@quory/core";
import { queryRepo, type SavedQuery } from "./queryRepo";
import activeConnectionState from "../state/activeConnectionState";
import {
  appendQueryVersion,
  createQueryHistory,
} from "../../shared/queryHistory";

export type SavedQueryContext = { connectionId: string; generation: number };
type ConnectionContext = string | SavedQueryContext;

// Renderer context is only a claim: validate it against main-process state on
// entry and again after asynchronous reads, before returning data or writing.
function assertGeneration(context: SavedQueryContext) {
  if (activeConnectionState.getConnectionGeneration() !== context.generation)
    throw new TRPCError({
      code: "CONFLICT",
      message:
        "The active connection changed. Start again on the current connection.",
    });
}

async function assertConnection(
  context: ConnectionContext
): Promise<SavedQueryContext> {
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
  return { connectionId, generation };
}

async function fetch(connection: ConnectionContext, queryId: string) {
  const context = await assertConnection(connection);
  const { connectionId } = context;
  const query = await queryRepo.get(queryId);
  if (query.connectionId !== connectionId)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "This query belongs to a different connection.",
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
  doc: SavedQuery & { _id: string; _rev?: string }
) {
  await assertConnection(context);
  // No await between this check and dispatching the write.
  assertGeneration(context);
  try {
    return await queryRepo.put(doc);
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
  fetch,
  async list(connection: ConnectionContext) {
    const context = await assertConnection(connection);
    const { connectionId } = context;
    const { rows } = await queryRepo.allDocs({ include_docs: true });
    await assertConnection(context);
    return rows
      .filter((row) => row.doc?.connectionId === connectionId)
      .map((row) => ({ id: row.id, query: row.doc! }));
  },
  async create(
    connection: ConnectionContext,
    queryId: string,
    query: Query,
    nickname: string,
    metadata: Pick<
      SavedQuery,
      "chatMessages" | "lastChatRequestId" | "queryHistory"
    > = {}
  ) {
    const context = await assertConnection(connection);
    const { connectionId } = context;
    return write(context, {
      ...query,
      queryHistory: createQueryHistory(query),
      ...metadata,
      _id: queryId,
      connectionId,
      nickname,
    });
  },
  async update(
    connection: ConnectionContext,
    queryId: string,
    revision: string,
    changes: { query?: Query; nickname?: string } & Pick<
      SavedQuery,
      "chatMessages" | "lastChatRequestId" | "queryHistory"
    >
  ) {
    const context = await assertConnection(connection);
    const existing = await fetch(context, queryId);
    assertRevision(existing._rev, revision);
    const { query, ...metadata } = changes;
    return write(context, {
      ...existing,
      ...query,
      ...(query
        ? {
            queryHistory: appendQueryVersion(
              existing.queryHistory ?? createQueryHistory(existing),
              query
            ),
          }
        : {}),
      ...metadata,
      _id: existing._id,
      _rev: revision,
      connectionId: existing.connectionId,
    });
  },
  async delete(
    connection: ConnectionContext,
    queryId: string,
    revision: string
  ) {
    const context = await assertConnection(connection);
    const query = await fetch(context, queryId);
    assertRevision(query._rev, revision);
    await assertConnection(context);
    assertGeneration(context);
    try {
      await queryRepo.remove(query);
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
