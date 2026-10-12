import makeRepo from "../util/makeRepo";
import type { QuoryRequestHandlerConfig } from "@quory/stack/server";

export const connectionRepo = makeRepo<
  QuoryRequestHandlerConfig["database"] & {
    nickname: string;
  }
>("connections");
