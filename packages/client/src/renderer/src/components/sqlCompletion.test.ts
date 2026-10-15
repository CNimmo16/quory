import { EditorState } from "@uiw/react-codemirror";
import { CompletionContext } from "@codemirror/autocomplete";
import { sql } from "@codemirror/lang-sql";
import { expect, it } from "vitest";
import type { DatabaseSchema, SqlDialect } from "@quory/core";
import { schemas as fixture } from "../../../../test/queryFixtures";
import { createSqlCompletion, sqlDialect } from "./sqlCompletion";

const schemas: DatabaseSchema[] = [
  ...fixture,
  { name: "audit", tables: [{ ...fixture[0]!.tables[0]!, name: "events" }] },
];
async function complete(
  text: string,
  metadata = schemas,
  dialect: SqlDialect = "postgres"
) {
  const pos = text.indexOf("|");
  const state = EditorState.create({
    doc: text.replace("|", ""),
    extensions: [sql({ dialect: sqlDialect(dialect) })],
  });
  const result = await createSqlCompletion(
    metadata,
    dialect
  )(new CompletionContext(state, pos, false));
  const options = result?.options ?? [];
  return { result, options, labels: options.map((option) => option.label) };
}
it("suggests schemas by prefix after FROM, excluding unrelated SQL keywords", async () => {
  const result = await complete("SELECT * FROM pu|");
  expect(result.labels).toEqual(["public"]);
  expect(result.options[0]!.apply).toBe('"public"');
});
it("suggests tables within the specified schema and filters their prefix", async () => {
  expect((await complete("SELECT * FROM public.or|")).labels).toEqual([
    "orders",
  ]);
  expect((await complete("SELECT * FROM audit.|")).labels).toEqual(["events"]);
  expect((await complete("SELECT * FROM missing.|")).labels).toEqual([]);
});
it("opens database suggestions immediately after FROM and schema qualification", async () => {
  expect((await complete("SELECT * FROM |")).labels).toContain("public");
  expect((await complete("SELECT * FROM public.|")).labels).toContain("orders");
});
it("suggests qualified columns, including table aliases and implicit aliases", async () => {
  expect(
    (await complete("SELECT public.orders.cr| FROM public.orders")).labels
  ).toEqual(["created_at"]);
  expect(
    (await complete("SELECT o.cr| FROM public.orders AS o")).labels
  ).toEqual(["created_at"]);
  expect((await complete("SELECT o.st| FROM public.orders o")).labels).toEqual([
    "status",
  ]);
});

it("resolves aliases declared beyond the initial parse viewport", async () => {
  expect(
    (
      await complete(
        `SELECT o.cr| ${", 1".repeat(1500)} FROM public.orders AS o`
      )
    ).labels
  ).toEqual(["created_at"]);
});
it("suggests unqualified columns from tables in the current statement", async () => {
  expect((await complete("SELECT cr| FROM public.orders")).labels).toEqual([
    "created_at",
  ]);
  expect(
    (await complete("SELECT * FROM public.orders WHERE st|")).labels
  ).toEqual(["status"]);
  expect(
    (
      await complete(
        "SELECT em| FROM public.orders o JOIN public.users u ON u.id = o.user_id"
      )
    ).labels
  ).toEqual(["email"]);
  expect(
    (await complete("SELECT em| FROM public.orders")).labels
  ).not.toContain("email");
});
it("does not take column suggestions from comments, strings, or other statements", async () => {
  expect(
    (
      await complete(
        "SELECT em| FROM public.orders; SELECT * FROM public.users"
      )
    ).labels
  ).not.toContain("email");
  expect(
    (await complete("SELECT em| FROM public.orders -- JOIN public.users"))
      .labels
  ).not.toContain("email");
  expect((await complete("SELECT 'public.or|'")).labels).toEqual([]);
  expect(
    (await complete("SELECT * FROM public.orders -- public.or|")).labels
  ).toEqual([]);
});
it.each(["postgres", "mysql", "sqlite"] as const)(
  "supports %s quoted metadata and escapes inserted identifiers",
  async (dialect) => {
    const quote = dialect === "mysql" ? "`" : '"';
    const name = `Order.Items${quote}Archive`;
    const metadata: DatabaseSchema[] = [
      { name: "public", tables: [{ ...fixture[0]!.tables[0]!, name }] },
    ];
    const result = await complete(
      "SELECT * FROM public.Or|",
      metadata,
      dialect
    );
    expect(result.labels).toEqual([name]);
    expect(result.options[0]!.apply).toBe(
      quote + name.split(quote).join(quote + quote) + quote
    );
    const quoted = await complete(
      `SELECT * FROM ${quote}public${quote}.${quote}Or|${quote}`,
      metadata,
      dialect
    );
    expect(quoted.labels).toHaveLength(1);
    expect(quoted.options[0]!.apply).toBe(
      quote + name.split(quote).join(quote + quote) + quote
    );
  }
);
it("updates suggestions when database metadata changes", async () => {
  expect((await complete("SELECT * FROM audit.ev|")).labels).toEqual([
    "events",
  ]);
  expect((await complete("SELECT * FROM audit.ev|", fixture)).labels).toEqual(
    []
  );
});
it("keeps SQL keyword completion outside identifier positions", async () => {
  expect((await complete("SEL|")).labels).toContain("SELECT");
});

it("filters by prefix rather than offering fuzzy matches from other names", async () => {
  const metadata: DatabaseSchema[] = [
    {
      name: "public",
      tables: [
        { ...fixture[0]!.tables[0]!, name: "orders" },
        { ...fixture[0]!.tables[0]!, name: "purchase_orders" },
      ],
    },
  ];
  expect((await complete("SELECT * FROM public.or|", metadata)).labels).toEqual(
    ["orders"]
  );
});

const fulfilmentSchemas: DatabaseSchema[] = [
  {
    name: "fulfilment",
    tables: [
      { ...fixture[0]!.tables[1]!, name: "order_fulfilment" },
      { ...fixture[0]!.tables[0]!, name: "shipping_label" },
    ],
  },
];
it("resolves the order fulfilment alias in a JOIN ON expression", async () => {
  const result = await complete(
    `select * from "fulfilment"."order_fulfilment" of
inner join "fulfilment"."shipping_label" sl on of.|`,
    fulfilmentSchemas
  );
  expect(result.labels).toEqual(["id", "user_id", "created_at", "status"]);
});

it.each([
  ["of", "of.cr|", ["created_at"]],
  ["AS of", "of.st|", ["status"]],
  ["OF", "of.st|", ["status"]],
  ['"Order Fulfilment"', '"Order Fulfilment".cr|', ["created_at"]],
  ["/* alias */ of", 'of."cr|"', ['"created_at"']],
] as const)(
  "resolves %s aliases with qualified column prefixes",
  async (alias, expression, expected) => {
    const result = await complete(
      `select * from "fulfilment"."order_fulfilment" ${alias}
inner join "fulfilment"."shipping_label" sl on ${expression}`,
      fulfilmentSchemas
    );
    expect(result.labels).toEqual(expected);
  }
);

it("keeps each joined table alias distinct and does not leak aliases between statements", async () => {
  expect(
    (
      await complete(
        `select * from "fulfilment"."order_fulfilment" of
inner join "fulfilment"."shipping_label" sl on sl.|`,
        fulfilmentSchemas
      )
    ).labels
  ).toEqual(["id", "email"]);
  expect(
    (
      await complete(
        `select * from "fulfilment"."order_fulfilment" of;
select * from "fulfilment"."shipping_label" sl where of.|`,
        fulfilmentSchemas
      )
    ).labels
  ).toEqual([]);
});
