import { expect, it } from "vitest";
import { ConditionOperator, type Query } from "@quory/core";
import { applyFilterset, captureFilterset } from "./queryFiltersets";
const query: Query = {
  base: {
    tableRef: "public.orders",
    select: ["id"],
    where: {
      operator: ConditionOperator.OR,
      conditions: [
        {
          column: "status",
          operator: ConditionOperator.IN,
          values: ["open", "pending"],
        },
        {
          column: "priority",
          operator: ConditionOperator.EQUALS,
          value: "high",
        },
      ],
    },
    orderBy: [{ column: "id", direction: "desc" }],
    joins: [
      {
        tableRef: "public.customers",
        select: ["name"],
        where: {
          column: "name",
          operator: ConditionOperator.EQUALS,
          value: "Alex",
        },
        joins: [],
      },
    ],
  },
  limit: 100,
  offset: 200,
};
it("replaces all filters including nested conditions and child filters, preserving current columns and ordering", () => {
  const snapshot = captureFilterset(query);
  const current = structuredClone(query);
  delete current.base.where;
  current.base.select = ["id", "status"];
  current.base.joins![0]!.where = {
    column: "name",
    operator: ConditionOperator.EQUALS,
    value: "Other",
  };
  const applied = applyFilterset(current, snapshot);
  expect(applied.base.where).toEqual(query.base.where);
  expect(applied.base.joins![0]!.where).toEqual(query.base.joins![0]!.where);
  expect(applied.base.select).toEqual(["id", "status"]);
  expect(applied.base.orderBy).toEqual(current.base.orderBy);
  expect(applied.offset).toBe(0);
  expect(applied.limit).toBe(100);
  expect(current.base.where).toBeUndefined();
  expect(applied.base.where).not.toBe(snapshot.filters[0]!.where);
});
it("can save an unfiltered preset and clears current filters on every table when applied", () => {
  const unfiltered = structuredClone(query);
  delete unfiltered.base.where;
  delete unfiltered.base.joins![0]!.where;
  const applied = applyFilterset(query, captureFilterset(unfiltered));
  expect(applied.base.where).toBeUndefined();
  expect(applied.base.joins![0]!.where).toBeUndefined();
  expect(query.base.where).toBeDefined();
});
it("does not apply filters to a changed relationship or a different instance of a repeated table", () => {
  const current = structuredClone(query);
  current.base.joins![0]!.via = [
    { tableRef: "public.customers", fromColumnName: "billing_customer_id" },
  ];
  expect(() => applyFilterset(current, captureFilterset(query))).toThrow(
    "different tables or relationships",
  );
  expect(current.offset).toBe(200);
});

it("matches equivalent relationship selectors regardless of object field order", () => {
  const saved = structuredClone(query);
  saved.base.joins![0]!.via = [
    {
      tableRef: "public.customers",
      fromColumnName: "customer_id",
      toColumnName: "id",
    },
  ];
  const current = structuredClone(query);
  current.base.joins![0]!.via = [
    {
      toColumnName: "id",
      fromColumnName: "customer_id",
      tableRef: "public.customers",
    },
  ];
  expect(applyFilterset(current, captureFilterset(saved)).base.where).toEqual(
    saved.base.where,
  );
});
