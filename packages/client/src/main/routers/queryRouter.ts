import { randomUUID } from "crypto";
import makeRepo from "../util/makeRepo";
import { publicProcedure, router } from "../util/trpc";
import { z } from "zod";
import { validators } from "@quory/stack/server";
import { Query, splitTableRef } from "@quory/core";
import activeConnectionState from "../state/activeConnectionState";

const queryRepo = makeRepo<
  Query & {
    connectionId: string;
    nickname: string;
  }
>("queries");

const queryRouter = router({
  listSavedQueries: publicProcedure.query(async () => {
    const activeConnectionId =
      await activeConnectionState.getActiveConnectionId();

    if (!activeConnectionId) {
      return {
        queries: [],
      };
    }

    const { rows } = await queryRepo.allDocs({ include_docs: true });

    return {
      queries: rows
        .filter((row) => row.doc!.connectionId === activeConnectionId)
        .map((row) => ({
          id: row.id,
          query: row.doc!,
        })),
    };
  }),
  fetchQuery: publicProcedure
    .input(
      z.object({
        queryId: z.string(),
      })
    )
    .query(async ({ input: { queryId } }) => {
      const query = await queryRepo.get(queryId);

      return { query };
    }),
  createQuery: publicProcedure
    .input(
      z.object({
        query: validators.query,
      })
    )
    .mutation(async ({ input: { query } }) => {
      const queryId = randomUUID();
      const activeConnectionId =
        await activeConnectionState.getActiveConnectionIdOrThrow();

      const [_schemaName, tableName] = splitTableRef(query.base.tableRef);
      await queryRepo.put({
        _id: queryId,
        ...query,
        connectionId: activeConnectionId,
        nickname: `${tableName} ${new Date().toISOString().substring(0, 16).replace("T", " ")}`,
      });
      return {
        queryId,
      };
    }),
  updateQuery: publicProcedure
    .input(
      z.object({
        query: validators.query,
        queryId: z.string(),
        revision: z.string(),
      })
    )
    .mutation(async ({ input: { queryId, query, revision } }) => {
      const activeConnectionId =
        await activeConnectionState.getActiveConnectionIdOrThrow();
      const existingDoc = await queryRepo.get(queryId);
      const doc = await queryRepo.put({
        _id: queryId,
        _rev: revision,
        ...query,
        connectionId: activeConnectionId,
        nickname: existingDoc.nickname,
      });
      return {
        revision: doc.rev,
      };
    }),
  updateQueryNickname: publicProcedure
    .input(
      z.object({
        queryId: z.string(),
        revision: z.string(),
        nickname: z.string(),
      })
    )
    .mutation(async ({ input: { queryId, nickname, revision } }) => {
      const activeConnectionId =
        await activeConnectionState.getActiveConnectionIdOrThrow();
      const existingDoc = await queryRepo.get(queryId);
      const doc = await queryRepo.put({
        ...existingDoc,
        _rev: revision,
        connectionId: activeConnectionId,
        nickname,
      });
      return {
        revision: doc.rev,
      };
    }),
  deleteQuery: publicProcedure
    .input(
      z.object({
        queryId: z.string(),
      })
    )
    .mutation(async ({ input: { queryId } }) => {
      const query = await queryRepo.get(queryId);

      await queryRepo.remove(query);
    }),
});

export default queryRouter;
