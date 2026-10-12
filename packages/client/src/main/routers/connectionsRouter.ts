import { publicProcedure, router } from "../util/trpc";
import { z } from "zod";
import {
  DatabaseConnectionFailedError,
  makeQuoryRequestHandler,
} from "@quory/stack/server";
import { TRPCError } from "@trpc/server";
import { randomUUID } from "crypto";
import activeConnectionState from "../state/activeConnectionState";

export { connectionRepo } from "../state/connectionRepo";
import { connectionRepo } from "../state/connectionRepo";
import { refreshQuorySchema } from "../state/quorySession";

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
          ssl: z
            .object({
              mode: z.enum(["require", "verify-full"]),
              ca: z.string().trim().optional(),
              cert: z.string().trim().optional(),
              key: z.string().trim().optional(),
            })
            .refine((ssl) => Boolean(ssl.cert) === Boolean(ssl.key), {
              message: "Provide both a client certificate and its private key.",
            })
            .optional(),
        }),
      })
    )
    .mutation(async ({ input: { revision, connectionId, config } }) => {
      try {
        const test = await makeQuoryRequestHandler({ database: config });
        await test.dispose();
      } catch (e) {
        if (e instanceof DatabaseConnectionFailedError)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Unable to connect to database: ${e.message}. Please check your connection details and SSL settings.`,
            cause: e,
          });
        throw e;
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
      await activeConnectionState.deleteActiveConnection(connectionId);
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
      try {
        await activeConnectionState.setActiveConnection(connectionId);
      } catch (e) {
        if (e instanceof DatabaseConnectionFailedError)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Unable to connect to database: ${e.message}. Please check your connection details and SSL settings.`,
            cause: e,
          });
        throw e;
      }
    }),
  refreshSchema: publicProcedure.mutation(async () => refreshQuorySchema()),
  disconnectFromDatabase: publicProcedure.mutation(async () => {
    await activeConnectionState.deleteActiveConnection();
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
      await activeConnectionState.deleteActiveConnection(connectionId);
    }),
});

export default connectionsRouter;
