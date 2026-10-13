import { z } from "zod";
import type { QueryHistory } from "./queryHistory";

export const chatMessageSchema = z.object({
  id: z.string(),
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(6000),
  queryUpdated: z.boolean().optional(),
  historyAction: z.enum(["undo", "redo"]).optional(),
  relatedMessageId: z.string().optional(),
});
export type ChatMessage = z.infer<typeof chatMessageSchema>;

export function mergeChatMessages(
  saved: ChatMessage[],
  incoming: ChatMessage[]
) {
  const known = new Set(saved.map(({ id }) => id));
  return [...saved, ...incoming.filter(({ id }) => !known.has(id))];
}

export type QueryChatResult = {
  messages: ChatMessage[];
  queryId: string | null;
  revision: string | null;
  queryUpdated: boolean;
  queryHistory?: QueryHistory;
};
