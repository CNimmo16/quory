import { randomUUID } from "crypto";
import { publicProcedure, router } from "../util/trpc";
import { z } from "zod";
import { validators } from "@quory/stack/server";
import { splitTableRef } from "@quory/core";

import { savedQueryService } from "../repositories/savedQueryService";
import { queryChatProcedure } from "../ai/queryChat";

const queryRouter = router({
  chat: queryChatProcedure,
  listSavedQueries: publicProcedure
    .input(z.object({ connectionId: z.string() }))
    .query(async ({ input }) => ({
      queries: await savedQueryService.list(input.connectionId),
    })),
  fetchQuery: publicProcedure
    .input(
      z.object({
        connectionId: z.string(),
        queryId: z.string(),
      })
    )
    .query(async ({ input: { queryId, connectionId } }) => {
      const query = await savedQueryService.fetch(connectionId, queryId);

      return { query };
    }),
  createQuery: publicProcedure
    .input(
      z.object({
        connectionId: z.string(),
        query: validators.query,
      })
    )
    .mutation(async ({ input: { query, connectionId } }) => {
      const queryId = randomUUID();

      const [_schemaName, tableName] = splitTableRef(query.base.tableRef);
      await savedQueryService.create(
        connectionId,
        queryId,
        query,
        `${tableName} ${new Date()
          .toISOString()
          .substring(0, 16)
          .replace("T", " ")}`
      );
      return {
        queryId,
      };
    }),
  updateQuery: publicProcedure
    .input(
      z.object({
        connectionId: z.string(),
        query: validators.query,
        queryId: z.string(),
        revision: z.string(),
      })
    )
    .mutation(async ({ input: { queryId, query, revision, connectionId } }) => {
      const doc = await savedQueryService.update(
        connectionId,
        queryId,
        revision,
        { query }
      );
      return {
        revision: doc.rev,
      };
    }),
  updateQueryNickname: publicProcedure
    .input(
      z.object({
        connectionId: z.string(),
        queryId: z.string(),
        revision: z.string(),
        nickname: z.string(),
      })
    )
    .mutation(
      async ({ input: { queryId, nickname, revision, connectionId } }) => {
        const doc = await savedQueryService.update(
          connectionId,
          queryId,
          revision,
          { nickname }
        );
        return {
          revision: doc.rev,
        };
      }
    ),
  deleteQuery: publicProcedure
    .input(
      z.object({
        connectionId: z.string(),
        queryId: z.string(),
        revision: z.string(),
      })
    )
    .mutation(async ({ input: { queryId, connectionId, revision } }) => {
      await savedQueryService.delete(connectionId, queryId, revision);
    }),
});

export default queryRouter;
