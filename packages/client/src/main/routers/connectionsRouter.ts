import makeRepo from "../util/makeRepo";
import { publicProcedure, router } from "../util/trpc";
import { z } from "zod";
import {
  DatabaseConnectionFailedError,
  makeQuoryRequestHandler,
  QuoryRequestHandlerConfig,
} from "@quory/stack/server";
import { TRPCError } from "@trpc/server";
import { randomUUID } from "crypto";
import { recreateMainWindow } from "..";
import activeConnectionState from "../state/activeConnectionState";

export const connectionRepo = makeRepo<
  QuoryRequestHandlerConfig["database"] & {
    nickname: string;
  }
>("connections");

const connectionsRouter = router({
  listSavedConnections: publicProcedure.query(async () => {
    const { rows } = await connectionRepo.allDocs({
      include_docs: true,
    });

    const activeConnectionId =
      await activeConnectionState.getActiveConnectionId();

    return {
      connections: rows.map((row) => ({
        id: row.id,
        connection: row.doc!,
        isActive: activeConnectionId === row.id,
      })),
    };
  }),
  fetchActiveConnection: publicProcedure.query(async () => {
    const connection = await activeConnectionState.getActiveConnection();

    return {
      connection,
    };
  }),
  fetchConnectionById: publicProcedure
    .input(
      z.object({
        connectionId: z.string(),
      })
    )
    .query(async ({ input: { connectionId } }) => {
      const connection = await connectionRepo.get(connectionId);

      return {
        connection,
      };
    }),
  saveConnection: publicProcedure
    .input(
      z.object({
        connectionId: z.string().optional(),
        revision: z.string().optional(),
        config: z.object({
          nickname: z.string(),
          type: z.enum(["postgres", "mysql", "sqlite"]),
          hostOrFilePath: z.string(),
          port: z.number().optional(),
          username: z.string().optional(),
          password: z.string().optional(),
          database: z.string().optional(),
        }),
      })
    )
    .mutation(async ({ input: { revision, connectionId, config } }) => {
      try {
        await makeQuoryRequestHandler({
          database: config,
        });
      } catch (e) {
        if (e instanceof DatabaseConnectionFailedError)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "Unable to connect to database. Please check your connection details.",
            cause: e,
          });
      }
      if (!connectionId) {
        connectionId = randomUUID();
      }
      const conflicts = await connectionRepo
        .allDocs({ include_docs: true })
        .then(({ rows }) =>
          rows.filter(
            (row) =>
              row.doc!.nickname === config.nickname && row.id !== connectionId
          )
        );
      if (conflicts.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `A database with the nickname "${config.nickname}" already exists. Please choose a different nickname.`,
        });
      }
      await connectionRepo.put({
        _id: connectionId,
        _rev: revision,
        ...config,
      });
      return {
        connectionId: connectionId,
      };
    }),
  connectToDatabase: publicProcedure
    .input(
      z.object({
        connectionId: z.string(),
      })
    )
    .mutation(async ({ input: { connectionId } }) => {
      const config = await connectionRepo.get(connectionId);
      try {
        await makeQuoryRequestHandler({
          database: config,
        });
      } catch (e) {
        if (e instanceof DatabaseConnectionFailedError)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "Unable to connect to database. Please check your connection details.",
            cause: e,
          });
      }
      activeConnectionState.setActiveConnection(connectionId);
      // recreate window to reattach the quory IPC handler with the new database config
      recreateMainWindow();
    }),
  disconnectFromDatabase: publicProcedure.mutation(async () => {
    activeConnectionState.deleteActiveConnection();
  }),
  deleteConnection: publicProcedure
    .input(
      z.object({
        connectionId: z.string(),
      })
    )
    .mutation(async ({ input: { connectionId } }) => {
      const connection = await connectionRepo.get(connectionId);

      await connectionRepo.remove(connection);
    }),
});

export default connectionsRouter;
