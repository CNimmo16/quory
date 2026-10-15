import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { validators } from "@quory/stack/server";
import { publicProcedure } from "../util/trpc";
import {
  savedQueryService,
  type SavedQueryContext,
} from "../repositories/savedQueryService";
import activeConnectionState from "../state/activeConnectionState";
import { getQuorySession, invalidateQuorySchema } from "../state/quorySession";
import { analyseSql } from "../util/analyseSql";
import { customSqlSchema } from "../repositories/queryDefinitionSchema";

const confirmations = new Map<
  string,
  {
    context: SavedQueryContext;
    sql: string;
    parameters: string;
    expires: number;
  }
>();
const sqlInput = customSqlSchema
  .omit({ mode: true, dialect: true })
  .extend({
    connectionId: z.string(),
    executionId: z.string().uuid(),
    confirmationToken: z.string().uuid().optional(),
  });
function cell(value: unknown): string | number | boolean | null {
  if (value == null) return null;
  if (
    typeof value === "string" ||
    typeof value === "boolean" ||
    typeof value === "number"
  )
    return value;
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Uint8Array) return Buffer.from(value).toString("hex");
  return (
    JSON.stringify(value, (_key, item: unknown) =>
      typeof item === "bigint" ? item.toString() : item
    ) ?? String(value)
  );
}
export const sqlProcedures = {
  compileSql: publicProcedure
    .input(z.object({ connectionId: z.string(), query: validators.query }))
    .query(async ({ input }) => {
      const context = await savedQueryService.assertConnection(
        input.connectionId
      );
      const session = await getQuorySession();
      await savedQueryService.assertConnection(context);
      const result = await session.request.compileQuery(input.query);
      await savedQueryService.assertConnection(context);
      return result;
    }),
  executeSql: publicProcedure.input(sqlInput).mutation(async ({ input }) => {
    const context = await savedQueryService.assertConnection(
      input.connectionId
    );
    const connection = await activeConnectionState.getActiveConnection();
    await savedQueryService.assertConnection(context);
    if (!connection || connection._id !== input.connectionId)
      throw new TRPCError({
        code: "CONFLICT",
        message: "The active connection changed.",
      });
    let readOnly: boolean;
    try {
      readOnly = analyseSql(input.sql, connection.type).readOnly;
    } catch (error) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: (error as Error).message,
      });
    }
    const protection =
      connection.writeProtection === "confirm-before-write" ||
      connection.writeProtection === "dangerously-write"
        ? connection.writeProtection
        : "read-only";
    if (!readOnly && protection === "read-only")
      throw new TRPCError({
        code: "FORBIDDEN",
        message:
          "This connection is read only. Change its write protection setting before running a write.",
      });
    const parameters = input.parameters ?? [];
    if (!readOnly && protection === "confirm-before-write") {
      for (const [key, entry] of confirmations)
        if (entry.expires < Date.now()) confirmations.delete(key);
      if (input.confirmationToken) {
        const approved = confirmations.get(input.confirmationToken);
        confirmations.delete(input.confirmationToken);
        if (
          !approved ||
          approved.expires < Date.now() ||
          approved.sql !== input.sql ||
          approved.parameters !== JSON.stringify(parameters) ||
          JSON.stringify(approved.context) !== JSON.stringify(context)
        )
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "The statement or connection changed. Run it again to confirm the current write.",
          });
      } else {
        if (confirmations.size >= 1000)
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message: "Too many pending SQL confirmations.",
          });
        const token = randomUUID();
        confirmations.set(token, {
          context,
          sql: input.sql,
          parameters: JSON.stringify(parameters),
          expires: Date.now() + 5 * 60_000,
        });
        return {
          status: "confirmation-required" as const,
          token,
          connectionName: connection.nickname,
        };
      }
    }
    const session = await getQuorySession();
    await savedQueryService.assertConnection(context);
    const started = Date.now();
    try {
      const result = await session.request.executeSql(
        input.sql,
        parameters,
        protection !== "dangerously-write" && readOnly,
        input.executionId
      );
      await savedQueryService.assertConnection(context);
      if (!readOnly) await invalidateQuorySchema();
      return {
        status: "executed" as const,
        columns: result.columns,
        rows: result.rows.map((row) => row.map(cell)),
        affectedRows: result.affectedRows,
        truncated: result.truncated,
        elapsedMs: Date.now() - started,
      };
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      throw new TRPCError({
        code: "BAD_REQUEST",
        message:
          error instanceof Error ? error.message : "Could not execute SQL.",
      });
    }
  }),
  cancelSql: publicProcedure
    .input(
      z.object({ connectionId: z.string(), executionId: z.string().uuid() })
    )
    .mutation(async ({ input }) => {
      const context = await savedQueryService.assertConnection(
        input.connectionId
      );
      const session = await getQuorySession();
      await savedQueryService.assertConnection(context);
      return session.request({
        path: "cancelQuery",
        data: { executionId: input.executionId },
      });
    }),
};
