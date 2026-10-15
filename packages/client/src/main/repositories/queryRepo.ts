import type { QueryDefinition } from "../../shared/sqlQuery";
import type { ChatMessage } from "../../shared/queryChat";
import type { QueryHistory } from "../../shared/queryHistory";
import makeRepo from "../util/makeRepo";

export type SavedQuery = QueryDefinition & {
  projectId?: string;
  /** Only present on legacy documents until project migration. */
  connectionId?: string;
  nickname: string;
  chatMessages?: ChatMessage[];
  lastChatRequestId?: string;
  queryHistory?: QueryHistory;
};
export const queryRepo = makeRepo<SavedQuery>("queries");
