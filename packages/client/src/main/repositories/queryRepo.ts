import type { Query } from "@quory/core";
import type { ChatMessage } from "../../shared/queryChat";
import makeRepo from "../util/makeRepo";

export type SavedQuery = Query & {
  connectionId: string;
  nickname: string;
  chatMessages?: ChatMessage[];
  lastChatRequestId?: string;
};
export const queryRepo = makeRepo<SavedQuery>("queries");
