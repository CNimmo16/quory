import {
  ConditionOperator,
  type DatabaseSchema,
  type DatabaseTableInfo,
} from "@quory/core";
import type { UpsertQueryInput } from "../src/main/ai/queryTool";

function makeTable(tableName: string, names: string[]): DatabaseTableInfo {
  return {
    name: tableName,
    columns: names.map((name) => ({
      name,
      dataType: "text",
      genericDataType: "text",
      isNullable: false,
      includedInPrimaryKey: name === "id",
      foreignKeys: [],
      foreignKeyReferences: [],
    })),
  };
}
export const schemas: DatabaseSchema[] = [
  {
    name: "public",
    tables: [
      makeTable("users", ["id", "email"]),
      makeTable("orders", ["id", "user_id", "created_at", "status"]),
      makeTable("listings", ["id", "order_id", "title"]),
      makeTable("audit_logs", ["id", "message"]),
    ],
  },
];
for (const [source, column, target] of [
  ["orders", "user_id", "users"],
  ["listings", "order_id", "orders"],
] as const) {
  schemas[0]!.tables
    .find((table) => table.name === source)!
    .columns.find((item) => item.name === column)!
    .foreignKeys.push({
      foreignSchemaName: "public",
      foreignTableName: target,
      foreignColumnName: "id",
      confidence: 1,
      hasForeignKeyConstraint: true,
    });
  schemas[0]!.tables
    .find((table) => table.name === target)!
    .columns[0]!.foreignKeyReferences.push({
      localSchemaName: "public",
      localTableName: source,
      localColumnName: column,
      confidence: 1,
      hasForeignKeyConstraint: true,
    });
}
export const orderQuery: UpsertQueryInput = {
  nickname: "Cameron’s latest orders",
  summary:
    "Orders for cameron@gmail.com with their listings, newest first. Showing up to 100 rows.",
  limit: 100,
  tables: [
    {
      tableRef: "public.orders",
      parent: null,
      columns: ["*"],
      via: [],
      conditions: [],
      orderBy: [{ column: "created_at", direction: "desc", priority: 0 }],
    },
    {
      tableRef: "public.users",
      parent: 0,
      columns: [],
      via: [],
      conditions: [
        {
          column: "email",
          operator: ConditionOperator.EQUALS,
          values: ["cameron@gmail.com"],
          children: [],
        },
      ],
      orderBy: [],
    },
    {
      tableRef: "public.listings",
      parent: 0,
      columns: ["*"],
      via: [],
      conditions: [],
      orderBy: [],
    },
  ],
};
