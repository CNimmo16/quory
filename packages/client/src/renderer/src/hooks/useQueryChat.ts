import { useEffect, useRef, useState } from "react";
import type { Query } from "@quory/core";
import type { inferRouterInputs } from "@trpc/server";
import type { AppRouter } from "../../../main/ipc";
import type { ChatMessage, QueryChatResult } from "../../../shared/queryChat";
import type { QueryHistory } from "../../../shared/queryHistory";
import trpc from "../util/tprc";

type ChatRequest = inferRouterInputs<AppRouter>["queries"]["chat"];

export function useQueryChat({
  connectionId,
  queryId,
  revision,
  currentQuery,
  queryHistory,
  initialMessages = [],
  onUpsert,
}: {
  connectionId: string;
  queryId?: string;
  revision?: string;
  currentQuery?: Query;
  queryHistory?: QueryHistory;
  initialMessages?: ChatMessage[];
  onUpsert: (result: QueryChatResult) => Promise<void>;
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [draft, setDraft] = useState("");
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const request = useRef<ChatRequest | null>(null);
  const sending = useRef(false);
  const mutation = trpc.queries.chat.useMutation();
  const currentContext = useRef(connectionId);
  currentContext.current = connectionId;
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  async function send(message: string) {
    if (sending.current || !message.trim()) return false;
    sending.current = true;
    setPendingMessage(message.trim());
    setError(null);
    // Retry the same logical request after a transport failure, without creating
    // a second query if the first response was lost after saving.
    if (
      !request.current ||
      request.current.message !== message.trim() ||
      request.current.connectionId !== connectionId ||
      request.current.revision !== revision ||
      request.current.queryHistory !== queryHistory
    ) {
      request.current = {
        connectionId,
        requestId: crypto.randomUUID(),
        message: message.trim(),
        history: messages.slice(-60),
        ...(queryId ? { queryId } : {}),
        ...(revision ? { revision } : {}),
        ...(currentQuery ? { currentQuery } : {}),
        ...(queryHistory ? { queryHistory } : {}),
      };
    }
    const sentConnectionId = connectionId;
    const isCurrent = () =>
      mounted.current && currentContext.current === sentConnectionId;
    try {
      const result = await mutation.mutateAsync(request.current);
      if (!isCurrent()) return false;
      setMessages(result.messages);
      if (result.queryUpdated) await onUpsert(result);
      request.current = null;
      setDraft("");
      return true;
    } catch (cause) {
      if (!isCurrent()) return false;
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not complete the request. Please try again."
      );
      return false;
    } finally {
      sending.current = false;
      setPendingMessage(null);
    }
  }

  return {
    messages,
    replaceMessages: (next: ChatMessage[]) => {
      setMessages(next);
      request.current = null;
      setError(null);
    },
    draft,
    setDraft,
    pendingMessage,
    error,
    send,
    isPending: pendingMessage !== null,
  };
}
