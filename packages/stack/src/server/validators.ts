import {
  JoinDef,
  valueConditionOperators,
  booleanConditionOperators,
  listConditionOperators,
  ValueConditionOperator,
  BooleanConditionOperator,
  ListConditionOperator,
} from "@quory/core";
import { Query } from "@quory/core";
import { Condition } from "@quory/core";
import { z } from "zod";

export const condition: z.ZodType<Condition> = z.union([
  z
    .object({
      column: z.string(),
      operator: z.enum(
        valueConditionOperators as unknown as readonly [ValueConditionOperator]
      ),
      value: z.string(),
    })
    .strict(),
  z
    .object({
      operator: z.enum(
        booleanConditionOperators as unknown as readonly [
          BooleanConditionOperator
        ]
      ),
      conditions: z.lazy(() => z.array(condition).min(1)),
    })
    .strict(),
  z
    .object({
      column: z.string(),
      operator: z.enum(
        listConditionOperators as unknown as readonly [ListConditionOperator]
      ),
      values: z.array(z.string()).min(1),
    })
    .strict(),
]);

export const viaStep = z.union([
  z.string(),
  z
    .object({
      tableRef: z.string(),
      fromColumnName: z.string().min(1).optional(),
      toColumnName: z.string().min(1).optional(),
    })
    .strict(),
  z
    .object({ tableRef: z.string(), usingConstraintId: z.string().min(1) })
    .strict(),
]);

export const joinDef: z.ZodType<JoinDef> = z.object({
  tableRef: z.string(),
  via: z.array(viaStep).optional(),
  select: z.union([z.array(z.string()), z.literal("*")]),
  where: condition.optional(),
  joins: z.lazy(() => z.array(joinDef)).optional(),
  orderBy: z
    .array(
      z
        .object({
          column: z.string(),
          direction: z.enum(["asc", "desc"]),
          priority: z.number().int().nonnegative().optional(),
        })
        .strict()
    )
    .optional(),
});

export const query: z.ZodType<Query> = z.object({
  base: joinDef,
  limit: z.number().int().positive().max(100).default(100),
  offset: z
    .number()
    .int()
    .nonnegative()
    .max(Number.MAX_SAFE_INTEGER)
    .default(0),
});
