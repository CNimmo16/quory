import { describe, expect, it, vi } from "vitest";
import { MockLanguageModelV3 } from "ai/test";
import { ConditionOperator, prepareQuery } from "@quory/core";
import { schemas, orderQuery } from "../../../test/queryFixtures";
import { runQueryAssistant } from "./queryAssistant";
import {
  queryFromTool,
  validateAssistantQuery,
  upsertQuerySchema,
} from "./queryTool";
import { validators } from "@quory/stack/server";
import { getQueryModel } from "./model";

type Generation = Awaited<ReturnType<MockLanguageModelV3["doGenerate"]>>;
const response = (content: Generation["content"]): Generation => ({
  content,
  finishReason: {
    unified: content.some((item) => item.type === "tool-call")
      ? "tool-calls"
      : "stop",
    raw: undefined,
  },
  usage: {
    inputTokens: {
      total: 1,
      noCache: 1,
      cacheRead: undefined,
      cacheWrite: undefined,
    },
    outputTokens: { total: 1, text: 1, reasoning: undefined },
  },
  warnings: [],
});
const call = (input = orderQuery) =>
  response([
    {
      type: "tool-call",
      toolCallId: "call-1",
      toolName: "upsert_query",
      input: JSON.stringify(input),
    },
  ]);
const messages = [
  {
    id: "user-1",
    role: "user" as const,
    content: "Latest orders with listings for user cameron@gmail.com",
  },
];

describe("query assistant", () => {
  it("asks a follow-up without saving and includes schema context", async () => {
    const model = new MockLanguageModelV3({
      doGenerate: response([
        { type: "text", text: "Should latest mean created or fulfilled?" },
      ]),
    });
    const upsert = vi.fn();
    const result = await runQueryAssistant({
      model,
      schemas,
      messages,
      upsert,
    });
    expect(result).toEqual({
      queryUpdated: false,
      text: "Should latest mean created or fulfilled?",
    });
    expect(upsert).not.toHaveBeenCalled();
    expect(JSON.stringify(model.doGenerateCalls[0]!.prompt)).toContain(
      "created_at"
    );
  });
  it("creates the joined query through the tool and stops after saving", async () => {
    const model = new MockLanguageModelV3({ doGenerate: call() });
    const upsert = vi.fn().mockResolvedValue(undefined);
    expect(
      await runQueryAssistant({ model, schemas, messages, upsert })
    ).toEqual({ queryUpdated: true, text: orderQuery.summary });
    expect(upsert).toHaveBeenCalledOnce();
    const query = upsert.mock.calls[0]![0];
    const { sql, parameters } = await prepareQuery(schemas, query);
    expect(sql).toContain('INNER JOIN "public"."users"');
    expect(sql).toContain('INNER JOIN "public"."listings"');
    expect(sql).toContain('"email" = ?');
    expect(parameters).toContain("cameron@gmail.com");
    expect(sql).toContain('"created_at" DESC');
    expect(model.doGenerateCalls).toHaveLength(1);
  });
  it("amends the current query with conversation and unsaved filters as context", async () => {
    const currentQuery = queryFromTool(orderQuery);
    currentQuery.base.where = {
      column: "status",
      operator: ConditionOperator.EQUALS,
      value: "paid",
    };
    const amended = structuredClone(orderQuery);
    amended.limit = 10;
    amended.tables[0]!.conditions = [
      {
        column: "status",
        operator: ConditionOperator.EQUALS,
        values: ["paid"],
        children: [],
      },
    ];
    const model = new MockLanguageModelV3({ doGenerate: call(amended) });
    const upsert = vi.fn().mockResolvedValue(undefined);
    await runQueryAssistant({
      model,
      schemas,
      currentQuery,
      messages: [
        ...messages,
        { id: "answer", role: "assistant", content: "Query saved" },
        { id: "edit", role: "user", content: "Only ten rows" },
      ],
      upsert,
    });
    expect(JSON.stringify(model.doGenerateCalls[0]!.prompt)).toContain("paid");
    expect(upsert.mock.calls[0]![0]).toMatchObject({
      limit: 10,
      base: { where: { value: "paid" } },
    });
  });
  it("returns validation errors to the model for repair before writing", async () => {
    const invalid = structuredClone(orderQuery);
    invalid.tables[0]!.orderBy[0]!.column = "invented_date";
    const model = new MockLanguageModelV3({
      doGenerate: [call(invalid), call()],
    });
    const upsert = vi.fn().mockResolvedValue(undefined);
    await runQueryAssistant({ model, schemas, messages, upsert });
    expect(model.doGenerateCalls).toHaveLength(2);
    expect(JSON.stringify(model.doGenerateCalls[1]!.prompt)).toContain(
      "Unknown or unsupported column"
    );
    expect(upsert).toHaveBeenCalledOnce();
  });
  it("does not report a failed save as success", async () => {
    const model = new MockLanguageModelV3({ doGenerate: call() });
    const upsert = vi.fn().mockRejectedValue(new Error("revision conflict"));
    await expect(
      runQueryAssistant({ model, schemas, messages, upsert })
    ).rejects.toThrow("revision conflict");
    expect(model.doGenerateCalls).toHaveLength(1);
  });
  it("persists only once when the model calls the tool twice in parallel", async () => {
    const model = new MockLanguageModelV3({
      doGenerate: response([
        call().content[0]!,
        {
          ...call().content[0]!,
          toolCallId: "call-2",
        } as Generation["content"][number],
      ]),
    });
    const upsert = vi.fn().mockResolvedValue(undefined);
    await runQueryAssistant({ model, schemas, messages, upsert });
    expect(upsert).toHaveBeenCalledOnce();
  });
});

describe("query validation", () => {
  it("accepts standalone tables and rejects invented columns or unrelated joins", async () => {
    await expect(
      validateAssistantQuery(schemas, {
        base: { tableRef: "public.audit_logs", select: "*" },
        limit: 100,
      })
    ).resolves.toBeUndefined();
    await expect(
      validateAssistantQuery(schemas, {
        base: { tableRef: "public.orders", select: ["invented"] },
      })
    ).rejects.toThrow("column");
    await expect(
      validateAssistantQuery(schemas, {
        base: {
          tableRef: "public.orders",
          select: "*",
          joins: [{ tableRef: "public.audit_logs", select: "*" }],
        },
      })
    ).rejects.toThrow();
  });
  it("rejects invalid filter trees and accepts bound escape sequences", async () => {
    const invalid = structuredClone(orderQuery);
    invalid.tables[1]!.conditions.push({
      column: "email",
      operator: ConditionOperator.EQUALS,
      values: ["lost"],
      children: [],
    });
    expect(() => queryFromTool(invalid)).toThrow("not attached");
    const query = queryFromTool(orderQuery);
    query.base.where = {
      column: "status",
      operator: ConditionOperator.EQUALS,
      value: "\\' OR 1=1",
    };
    await expect(
      validateAssistantQuery(schemas, query)
    ).resolves.toBeUndefined();
    const { sql, parameters } = await prepareQuery(schemas, query);
    expect(sql).not.toContain(query.base.where.value);
    expect(parameters).toContain(query.base.where.value);
  });
  it("accepts one composite constraint rather than counting its pairs as parallel keys", async () => {
    const composite = structuredClone(schemas);
    const users = composite[0]!.tables.find((table) => table.name === "users")!;
    const orders = composite[0]!.tables.find(
      (table) => table.name === "orders"
    )!;
    const key = orders.columns.find((column) => column.name === "user_id")!
      .foreignKeys[0]!;
    key.constraintId = "user_fk";
    key.columnPosition = 2;
    orders.columns.push({
      ...orders.columns[0]!,
      name: "tenant_id",
      includedInPrimaryKey: false,
      foreignKeyReferences: [],
      foreignKeys: [
        { ...key, columnPosition: 1, foreignColumnName: "tenant_id" },
      ],
    });
    users.columns.push({
      ...users.columns[0]!,
      name: "tenant_id",
      foreignKeys: [],
      foreignKeyReferences: [],
    });
    await expect(
      validateAssistantQuery(composite, queryFromTool(orderQuery))
    ).resolves.toBeUndefined();
  });
  it("preserves partial via selectors through assistant and web validators", async () => {
    const ambiguous = structuredClone(schemas);
    const orders = ambiguous[0]!.tables.find(
      (table) => table.name === "orders"
    )!;
    orders.columns
      .find((column) => column.name === "status")!
      .foreignKeys.push({
        ...orders.columns.find((column) => column.name === "user_id")!
          .foreignKeys[0]!,
      });
    const input = structuredClone(orderQuery);
    input.tables[1]!.via = [
      { tableRef: "public.users", fromColumnName: "user_id" },
    ];
    const compiled = queryFromTool(upsertQuerySchema.parse(input));
    expect(validators.query.parse(compiled).base.joins![0]!.via).toEqual(
      input.tables[1]!.via
    );
    await expect(
      validateAssistantQuery(ambiguous, compiled)
    ).resolves.toBeUndefined();
    const invalid = {
      ...input,
      tables: input.tables.map((table, i) =>
        i === 1
          ? {
              ...table,
              via: [
                {
                  tableRef: "public.users",
                  fromColumnName: "user_id",
                  usingConstraintId: "fk",
                },
              ],
            }
          : table
      ),
    };
    expect(upsertQuerySchema.safeParse(invalid).success).toBe(false);
    const invalidQuery = structuredClone(compiled);
    Object.assign(invalidQuery.base.joins![0]!.via![0] as object, {
      usingConstraintId: "fk",
    });
    expect(validators.query.safeParse(invalidQuery).success).toBe(false);
  });
  it("rejects ambiguous foreign keys rather than silently choosing one", async () => {
    const ambiguous = structuredClone(schemas);
    ambiguous[0]!.tables[1]!.columns[1]!.foreignKeys.push({
      ...ambiguous[0]!.tables[1]!.columns[1]!.foreignKeys[0]!,
      foreignColumnName: "email",
    });
    await expect(
      validateAssistantQuery(ambiguous, queryFromTool(orderQuery))
    ).rejects.toThrow("Multiple relationships");
  });
});

describe("provider configuration", () => {
  it("selects adapters and model IDs without changing the query assistant", () => {
    for (const [provider, key] of [
      ["openai", "OPENAI_API_KEY"],
      ["anthropic", "ANTHROPIC_API_KEY"],
      ["google", "GOOGLE_GENERATIVE_AI_API_KEY"],
    ]) {
      const model = getQueryModel({
        AI_PROVIDER: provider,
        AI_MODEL: "configured-model",
        [key!]: "test-key",
      });
      expect(model.modelId).toBe("configured-model");
    }
    expect(getQueryModel({ OPEN_AI_API_KEY: "legacy-key" }).modelId).toBe(
      "gpt-6-luna"
    );
  });
  it("fails clearly for missing keys, missing non-default models, and unknown providers", () => {
    expect(() => getQueryModel({})).toThrow("OPENAI_API_KEY");
    expect(() =>
      getQueryModel({ AI_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "test" })
    ).toThrow("AI_MODEL");
    expect(() => getQueryModel({ AI_PROVIDER: "toString" })).toThrow(
      "AI_PROVIDER"
    );
  });
});
