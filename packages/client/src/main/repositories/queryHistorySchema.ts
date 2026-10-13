import { validators } from "@quory/stack/server";
import { z } from "zod";
import { QUERY_HISTORY_LIMIT } from "../../shared/queryHistory";

const version = z.object({
  query: validators.query,
  messageId: z.string().optional(),
});

export const queryHistorySchema = z.object({
  past: z.array(version).max(QUERY_HISTORY_LIMIT),
  present: version,
  future: z.array(version).max(QUERY_HISTORY_LIMIT),
});
