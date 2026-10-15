import makeRepo from "../util/makeRepo";
import type { QuoryRequestHandlerConfig } from "@quory/stack/server";

export const connectionRepo = makeRepo<
  QuoryRequestHandlerConfig["database"] & {
    nickname: string;
    projectId?: string;
    writeProtection?: import("../../shared/sqlQuery").WriteProtection;
    colour?: import("../../shared/connectionColour").ConnectionColour | undefined;
  }
>("connections");
