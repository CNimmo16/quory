import { randomUUID } from "node:crypto";
import { APICallError, RetryError } from "ai";
import { TRPCError } from "@trpc/server";
import { validators } from "@quory/stack/server";
import { z } from "zod";
import {
  chatMessageSchema,
  type ChatMessage,
  type QueryChatResult,
} from "../../shared/queryChat";
import { queryRepo } from "../repositories/queryRepo";
import activeConnectionState from "../state/activeConnectionState";
import { getQuorySession } from "../state/quorySession";
import { publicProcedure } from "../util/trpc";
import { getQueryModel } from "./model";
import { runQueryAssistant } from "./queryAssistant";

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
      requestId: z.string().uuid(),
      message: z.string().trim().min(1).max(6000),
      history: z.array(chatMessageSchema).max(60),
      queryId: z.string().optional(),
      revision: z.string().optional(),
      currentQuery: validators.query.optional(),
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
      const session = await getQuorySession();
      const existing = await queryRepo.get(id).catch((error: unknown) => {
        if ((error as { status?: number }).status === 404 && !input.queryId)
          return undefined;
        throw error;
      });
      if (existing && existing.connectionId !== session.connectionId)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This query belongs to a different connection.",
        });
      if (existing?.lastChatRequestId === input.requestId) {
        return {
          messages: existing.chatMessages ?? [],
          queryId: id,
          revision: existing._rev,
          queryUpdated: true,
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
        ...input.history,
        { id: input.requestId, role: "user", content: input.message },
      ];
      let saved: { revision: string; messages: ChatMessage[] } | undefined;
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
          if (
            (await activeConnectionState.getActiveConnectionId()) !==
            session.connectionId
          )
            throw new TRPCError({
              code: "CONFLICT",
              message:
                "The active connection changed. Start again on the current connection.",
            });
          const chatMessages: ChatMessage[] = [
            ...messages,
            {
              id: randomUUID(),
              role: "assistant",
              content: summary,
              queryUpdated: true,
            },
          ];
          try {
            const doc = await queryRepo.put({
              ...existing,
              ...query,
              _id: id,
              connectionId: session.connectionId,
              nickname,
              chatMessages,
              lastChatRequestId: input.requestId,
            });
            saved = { revision: doc.rev, messages: chatMessages };
          } catch (error) {
            if ((error as { status?: number }).status === 409) throw conflict();
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: "Could not save the query. Please try again.",
            });
          }
        },
      });
      if (saved)
        return {
          messages: saved.messages,
          queryId: id,
          revision: saved.revision,
          queryUpdated: true,
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
