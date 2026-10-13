import { randomUUID } from "crypto";
import { publicProcedure, router } from "../util/trpc";
import { z } from "zod";
import { validators } from "@quory/stack/server";
import { splitTableRef } from "@quory/core";
import { TRPCError } from "@trpc/server";
import {
  chatMessageSchema,
  mergeChatMessages,
  type ChatMessage,
} from "../../shared/queryChat";
import { moveQueryHistory } from "../../shared/queryHistory";
import { queryHistorySchema } from "../repositories/queryHistorySchema";

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
        queryHistory: queryHistorySchema.optional(),
      })
    )
    .mutation(
      async ({
        input: { queryId, query, revision, connectionId, queryHistory },
      }) => {
        const doc = await savedQueryService.update(
          connectionId,
          queryId,
          revision,
          { query, ...(queryHistory ? { queryHistory } : {}) }
        );
        return {
          revision: doc.rev,
        };
      }
    ),
  changeQueryHistory: publicProcedure
    .input(
      z.object({
        connectionId: z.string(),
        queryId: z.string(),
        revision: z.string(),
        action: z.enum(["undo", "redo"]),
        queryHistory: queryHistorySchema,
        messages: z.array(chatMessageSchema).max(60),
      })
    )
    .mutation(async ({ input }) => {
      const context = await savedQueryService.assertConnection(
        input.connectionId
      );
      const existing = await savedQueryService.fetch(context, input.queryId);
      const queryHistory = moveQueryHistory(input.queryHistory, input.action);
      if (!queryHistory)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `There is no query change to ${input.action}.`,
        });
      const changedVersion =
        input.action === "undo"
          ? input.queryHistory.present
          : queryHistory.present;
      const messages = mergeChatMessages(
        existing.chatMessages ?? [],
        input.messages
      );
      const changedMessage = messages.find(
        ({ id }) => id === changedVersion.messageId
      );
      const event: ChatMessage = {
        id: randomUUID(),
        role: "user",
        historyAction: input.action,
        ...(changedMessage ? { relatedMessageId: changedMessage.id } : {}),
        content: `${input.action === "undo" ? "Undid" : "Redid"} ${
          changedMessage ? "the AI query change" : "a manual query change"
        }.${
          changedMessage
            ? ` Change: ${changedMessage.content.slice(0, 1000)}`
            : ""
        } ${
          input.action === "undo" ? "The previous query" : "The query change"
        } has been restored and saved.`,
      };
      messages.push(event);
      const doc = await savedQueryService.update(
        context,
        input.queryId,
        input.revision,
        {
          query: queryHistory.present.query,
          queryHistory,
          chatMessages: messages,
        }
      );
      return { revision: doc.rev, queryHistory, messages };
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
