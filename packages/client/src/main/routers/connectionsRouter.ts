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

import { activeProjectState } from "../state/activeProjectState";
import { CONNECTION_COLOURS } from "../../shared/connectionColour";

async function projectConnection(connectionId: string) {
  const project = activeProjectState.requireActiveProject();
  const generation = activeProjectState.getProjectGeneration();
  const connection = await connectionRepo.get(connectionId);
  activeProjectState.assertCurrent(project._id, generation);
  if (connection.projectId !== project._id)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "This connection belongs to a different project.",
    });
  return connection;
}

const connectionsRouter = router({
  listSavedConnections: publicProcedure
    .input(z.object({ projectId: z.string() }).optional())
    .query(async ({ input }) => {
      const project = activeProjectState.getActiveProject();
      const projectId = input?.projectId ?? project?._id;
      if (!projectId) return { connections: [] };
      const generation = activeProjectState.getProjectGeneration();
      const { rows } = await connectionRepo.allDocs({
        include_docs: true,
      });

      const activeConnectionId =
        await activeConnectionState.getActiveConnectionId();

      if (!input && project)
        activeProjectState.assertCurrent(project._id, generation);
      return {
        connections: rows
          .filter((row) => row.doc?.projectId === projectId)
          .map((row) => ({
            id: row.id,
            connection: row.doc!,
            isActive: activeConnectionId === row.id,
          })),
      };
    }),
  fetchActiveConnection: publicProcedure.query(async () => {
    const project = activeProjectState.getActiveProject();
    const generation = activeProjectState.getProjectGeneration();
    const connection = project
      ? await activeConnectionState.getActiveConnection()
      : null;
    if (project) activeProjectState.assertCurrent(project._id, generation);

    return {
      connection: connection?.projectId === project?._id ? connection : null,
    };
  }),
  fetchConnectionById: publicProcedure
    .input(
      z.object({
        connectionId: z.string(),
      })
    )
    .query(async ({ input: { connectionId } }) => {
      const connection = await projectConnection(connectionId);

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
          colour: z.enum(CONNECTION_COLOURS).optional(),
          writeProtection: z
            .enum(["read-only", "confirm-before-write", "dangerously-write"])
            .default("read-only"),
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
      const project = activeProjectState.requireActiveProject();
      const generation = activeProjectState.getProjectGeneration();
      if (connectionId) await projectConnection(connectionId);
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
              row.doc?.projectId === project._id &&
              row.doc.nickname === config.nickname &&
              row.id !== connectionId
          )
        );
      if (conflicts.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `A database with the nickname "${config.nickname}" already exists. Please choose a different nickname.`,
        });
      }
      activeProjectState.assertCurrent(project._id, generation);
      await connectionRepo.put({
        projectId: project._id,
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
      const project = activeProjectState.requireActiveProject();
      const generation = activeProjectState.getProjectGeneration();
      await projectConnection(connectionId);
      activeProjectState.assertCurrent(project._id, generation);
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
      const project = activeProjectState.requireActiveProject();
      const generation = activeProjectState.getProjectGeneration();
      const connection = await projectConnection(connectionId);
      activeProjectState.assertCurrent(project._id, generation);
      await connectionRepo.remove(connection);
      await activeConnectionState.deleteActiveConnection(connectionId);
    }),
});

export default connectionsRouter;
