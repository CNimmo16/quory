import { z } from "zod";

export const chatMessageSchema = z.object({
  id: z.string(),
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(6000),
  queryUpdated: z.boolean().optional(),
});
export type ChatMessage = z.infer<typeof chatMessageSchema>;

export type QueryChatResult = {
  messages: ChatMessage[];
  queryId: string | null;
  revision: string | null;
  queryUpdated: boolean;
};
