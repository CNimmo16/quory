import { randomUUID } from "node:crypto";
import { APICallError, RetryError } from "ai";
import { TRPCError } from "@trpc/server";
import { validators } from "@quory/stack/server";
import { z } from "zod";
import {
  chatMessageSchema,
  mergeChatMessages,
  type ChatMessage,
  type QueryChatResult,
} from "../../shared/queryChat";
import { savedQueryService } from "../repositories/savedQueryService";
import { getQuorySession } from "../state/quorySession";
import { publicProcedure } from "../util/trpc";
import { getQueryModel } from "./model";
import { runQueryAssistant } from "./queryAssistant";
import {
  appendQueryVersion,
  createQueryHistory,
  queriesMatch,
  type QueryHistory,
} from "../../shared/queryHistory";
import { queryHistorySchema } from "../repositories/queryHistorySchema";

const inFlight = new Set<string>();
const conflict = () =>
  new TRPCError({
    code: "CONFLICT",
    message:
      "This query changed while you were chatting. Reopen it before trying again.",
  });

export const queryChatProcedure = publicProcedure
  .input(
    z.object({
      connectionId: z.string(),
      requestId: z.string().uuid(),
      message: z.string().trim().min(1).max(6000),
      history: z.array(chatMessageSchema).max(60),
      queryId: z.string().optional(),
      revision: z.string().optional(),
      currentQuery: validators.query.optional(),
      queryHistory: queryHistorySchema.optional(),
    })
  )
  .mutation(async ({ input }): Promise<QueryChatResult> => {
    const id = input.queryId ?? input.requestId;
    if (inFlight.has(id))
      throw new TRPCError({
        code: "CONFLICT",
        message: "A query update is already in progress.",
      });
    inFlight.add(id);
    try {
      const context = await savedQueryService.assertConnection(
        input.connectionId
      );
      const session = await getQuorySession();
      if (session.connectionId !== input.connectionId)
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "The active connection changed. Start again on the current connection.",
        });
      const existing = await savedQueryService
        .fetch(context, id)
        .catch((error: unknown) => {
          if ((error as { status?: number }).status === 404 && !input.queryId)
            return undefined;
          throw error;
        });
      if (existing?.lastChatRequestId === input.requestId) {
        return {
          messages: existing.chatMessages ?? [],
          queryId: id,
          revision: existing._rev,
          queryUpdated: true,
          ...(existing.queryHistory
            ? { queryHistory: existing.queryHistory }
            : {}),
        };
      }
      if (existing && (!input.queryId || input.revision !== existing._rev))
        throw conflict();

      let model: ReturnType<typeof getQueryModel>;
      try {
        model = getQueryModel();
      } catch (error) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: (error as Error).message,
        });
      }

      const messages: ChatMessage[] = [
        ...mergeChatMessages(
          existing?.chatMessages ?? [],
          input.history
        ).filter((message) => !message.historyAction),
        { id: input.requestId, role: "user", content: input.message },
      ];
      let saved:
        | {
            revision: string;
            messages: ChatMessage[];
            queryHistory: QueryHistory;
          }
        | undefined;
      await savedQueryService.assertConnection(context);
      const result = await runQueryAssistant({
        model,
        schemas: session.schemas,
        currentQuery:
          input.currentQuery ??
          (existing
            ? {
                base: existing.base,
                limit: existing.limit,
                offset: existing.offset,
              }
            : undefined),
        nickname: existing?.nickname,
        messages,
        upsert: async (query, nickname, summary) => {
          const messageId = randomUUID();
          const chatMessages: ChatMessage[] = [
            ...messages,
            {
              id: messageId,
              role: "assistant",
              content: summary,
              queryUpdated: true,
            },
          ];
          let previousHistory = existing?.queryHistory;
          const previousQuery = input.currentQuery ?? existing;
          if (!previousHistory && previousQuery)
            previousHistory = createQueryHistory(previousQuery);
          if (
            previousHistory &&
            previousQuery &&
            !queriesMatch(
              session.schemas,
              previousHistory.present.query,
              previousQuery
            )
          ) {
            previousHistory = appendQueryVersion(
              previousHistory,
              previousQuery
            );
          }
          const queryHistory = previousHistory
            ? queriesMatch(
                session.schemas,
                previousHistory.present.query,
                query
              )
              ? previousHistory
              : appendQueryVersion(previousHistory, query, messageId)
            : { ...createQueryHistory(query), present: { query, messageId } };
          try {
            const metadata = {
              chatMessages,
              lastChatRequestId: input.requestId,
              queryHistory,
            };
            const doc = existing
              ? await savedQueryService.update(context, id, existing._rev, {
                  query,
                  nickname,
                  ...metadata,
                })
              : await savedQueryService.create(
                  context,
                  id,
                  query,
                  nickname,
                  metadata
                );
            saved = { revision: doc.rev, messages: chatMessages, queryHistory };
          } catch (error) {
            if (error instanceof TRPCError) throw error;
            if ((error as { status?: number }).status === 409) throw conflict();
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: "Could not save the query. Please try again.",
            });
          }
        },
      });
      await savedQueryService.assertConnection(context);
      if (saved)
        return {
          messages: saved.messages,
          queryId: id,
          revision: saved.revision,
          queryUpdated: true,
          queryHistory: saved.queryHistory,
        };
      return {
        messages: [
          ...messages,
          { id: randomUUID(), role: "assistant", content: result.text },
        ],
        queryId: input.queryId ?? null,
        revision: existing?._rev ?? null,
        queryUpdated: false,
      };
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      const providerError = RetryError.isInstance(error)
        ? error.lastError
        : error;
      if (APICallError.isInstance(providerError)) {
        if (
          providerError.statusCode === 401 ||
          providerError.statusCode === 403
        )
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message:
              "The AI provider rejected the API key or model access. Check your provider settings in .env.local.",
          });
        if (providerError.statusCode === 429)
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message:
              "The AI provider is rate limited or out of credits. Try again shortly or check your provider account.",
          });
      }
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message:
          "Could not complete the AI request. Check your provider and model settings, then try again. You can also use manual mode.",
      });
    } finally {
      inFlight.delete(id);
    }
  });
