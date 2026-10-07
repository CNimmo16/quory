import { expect, it } from "vitest";
import { ConditionOperator, type DatabaseSchema } from ".";
import prepareQuery from "./prepareQuery";
import getRelationsForTable from "./getRelationsForTable";

const schemas: DatabaseSchema[] = [
  {
    name: "public",
    tables: [
      {
        name: "notes",
        columns: [
          {
            name: "text",
            dataType: "text",
            genericDataType: "text",
            includedInPrimaryKey: false,
            isNullable: false,
            foreignKeys: [],
            foreignKeyReferences: [],
          },
        ],
      },
    ],
  },
];

it("compiles standalone entities and offers no relationships", async () => {
  const { sql } = await prepareQuery(schemas, {
    base: { tableRef: "public.notes", select: "*" },
  });
  expect(sql).toContain("FROM public.notes");
  expect(getRelationsForTable(schemas, "public", "notes")).toEqual([]);
});

it("escapes apostrophes in scalar and list filters", async () => {
  const { sql } = await prepareQuery(schemas, {
    base: {
      tableRef: "public.notes",
      select: "*",
      where: {
        operator: ConditionOperator.AND,
        conditions: [
          {
            column: "text",
            operator: ConditionOperator.EQUALS,
            value: "O'Connor",
          },
          {
            column: "text",
            operator: ConditionOperator.IN,
            values: ["x' OR 1=1 --", "it's fine"],
          },
        ],
      },
    },
  });
  expect(sql).toContain("= 'O''Connor'");
  expect(sql).toContain("IN ('x'' OR 1=1 --','it''s fine')");
});
