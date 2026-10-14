import { expect, it } from "vitest";
import { ConditionOperator, prepareQuery, type Query } from "@quory/core";
import { schemas } from "../../../../test/queryFixtures";
import { removeQueryJoin } from "./removeQueryJoin";

it("preserves intermediate relationship selectors, descendant filters, and sibling instances", async () => {
  const filter = {
    column: "email",
    operator: ConditionOperator.EQUALS as const,
    value: "ada@example.com",
  };
  const query: Query = {
    base: {
      tableRef: "public.listings",
      select: ["title"],
      joins: [
        {
          tableRef: "public.orders",
          select: ["status"],
          via: [
            {
              tableRef: "public.orders",
              fromColumnName: "order_id",
              toColumnName: "id",
            },
          ],
          joins: [
            {
              tableRef: "public.users",
              select: ["email"],
              via: [
                {
                  tableRef: "public.users",
                  fromColumnName: "user_id",
                  toColumnName: "id",
                },
              ],
              where: filter,
            },
          ],
        },
        { tableRef: "public.orders", select: ["created_at"] },
      ],
    },
    offset: 100,
    limit: 100,
  };
  const original = await prepareQuery(schemas, query);
  const removed = original.preparedQuery.base.joins[0]!;
  const next = removeQueryJoin(original.preparedQuery, removed.joinAlias);
  expect(next.offset).toBe(0);
  expect(next.base.joins[0]).toMatchObject({
    tableRef: "public.users",
    select: ["email"],
    where: filter,
    via: [
      {
        tableRef: "public.orders",
        fromColumnName: "order_id",
        toColumnName: "id",
      },
      {
        tableRef: "public.users",
        fromColumnName: "user_id",
        toColumnName: "id",
      },
    ],
  });
  expect(next.base.joins[1]).toEqual(original.preparedQuery.base.joins[1]);
  await expect(prepareQuery(schemas, next)).resolves.toBeDefined();
  // Rebuilding can infer the hidden bridge and execute the same user filter.
  const rebuilt = await prepareQuery(schemas, {
    ...next,
    base: { ...next.base, joins: [next.base.joins[0]!] },
  });
  expect(rebuilt.preparedQuery.base.joins[0]!.select).toEqual([]);
  expect(rebuilt.preparedQuery.base.joins[0]!.joins[0]!.where).toEqual(filter);
  expect(original.preparedQuery.offset).toBe(100);
});

it("removes only the requested leaf instance and protects the base", async () => {
  const prepared = await prepareQuery(schemas, {
    base: {
      tableRef: "public.orders",
      select: ["id"],
      joins: [
        { tableRef: "public.users", select: ["email"] },
        { tableRef: "public.users", select: ["id"] },
      ],
    },
  });
  const next = removeQueryJoin(
    prepared.preparedQuery,
    prepared.preparedQuery.base.joins[0]!.joinAlias
  );
  expect(next.base.joins).toEqual([prepared.preparedQuery.base.joins[1]]);
  expect(() =>
    removeQueryJoin(
      prepared.preparedQuery,
      prepared.preparedQuery.base.joinAlias
    )
  ).toThrow("Cannot remove base join");
});
