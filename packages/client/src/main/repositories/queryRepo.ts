import type { Query } from "@quory/core";
import type { ChatMessage } from "../../shared/queryChat";
import type { QueryHistory } from "../../shared/queryHistory";
import makeRepo from "../util/makeRepo";

export type SavedQuery = Query & {
  connectionId: string;
  nickname: string;
  chatMessages?: ChatMessage[];
  lastChatRequestId?: string;
  queryHistory?: QueryHistory;
};
export const queryRepo = makeRepo<SavedQuery>("queries");
