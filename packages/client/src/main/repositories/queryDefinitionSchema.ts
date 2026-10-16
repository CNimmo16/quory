import { validators } from "@quory/stack/server";
import { z } from "zod";
import type { QueryDefinition } from "../../shared/sqlQuery";

export const customSqlSchema = z.object({
  mode: z.literal("sql"),
  sql: z
    .string()
    .min(1)
    .max(200_000)
    .refine((value) => value.trim().length > 0, "Enter a SQL statement."),
  parameters: z
    .array(z.union([z.string(), z.number().finite()]))
    .max(1000)
    .optional(),
  dialect: z.enum(["postgres", "mysql", "sqlite"]).optional(),
});
export const queryDefinitionSchema: z.ZodType<QueryDefinition> = z.union([
  customSqlSchema,
  validators.query.and(
    z.object({ mode: z.literal("relationship").optional() }),
  ),
]);
