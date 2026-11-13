import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import {
  ConditionOperator,
  prepareQuery,
  type DatabaseSchema,
  type DatabaseTableInfo,
  type PreparedQuery,
  type Query,
} from "@quory/core";
import useQuery from "../../../../../stack/src/react/hooks/useQuery";
import TableNavigator from "./TableNavigator";
import { TooltipProvider } from "./ui/tooltip";

let preparedQuery: PreparedQuery;
vi.mock("../../../../../stack/src/react/useQuory", () => ({
  default: () => ({ data: { preparedQuery, visibleJoins: [], rows: [] } }),
}));
vi.mock("../../../../../stack/src/react/hooks/useFetchSchema", () => ({
  default: () => ({ data: { schemas } }),
}));

function column(
  name: string,
  references?: string,
): DatabaseTableInfo["columns"][number] {
  return {
    name,
    genericDataType: "number",
    dataType: "integer",
    isNullable: false,
    includedInPrimaryKey: name === "id",
    foreignKeyReferences: [],
    foreignKeys: references
      ? [
          {
            constraintId: name,
            columnPosition: 1,
            foreignSchemaName: "main",
            foreignTableName: references,
            foreignColumnName: "id",
            hasForeignKeyConstraint: true,
            confidence: 1,
          },
        ]
      : [],
  };
}

const schemas: DatabaseSchema[] = [
  {
    name: "main",
    tables: [
      {
        name: "orders",
        columns: [
          column("id"),
          column("buyer", "people"),
          column("seller", "people"),
          column("account", "accounts"),
          column("store", "stores"),
          column("tag", "tags"),
        ],
      },
      { name: "accounts", columns: [column("id"), column("owner", "people")] },
      {
        name: "stores",
        columns: [column("id"), column("account", "accounts")],
      },
      { name: "people", columns: [column("id")] },
      { name: "details", columns: [column("id"), column("person", "people")] },
      { name: "audit", columns: [column("id"), column("detail", "details")] },
      { name: "tags", columns: [column("id")] },
    ],
  },
  {
    name: "archive",
    tables: [
      { name: "tags", columns: [column("id"), column("order_id", "orders")] },
    ],
  },
];

const buyer = { tableRef: "main.people", usingConstraintId: "buyer" };
const seller = { tableRef: "main.people", usingConstraintId: "seller" };
const initialQuery: Query = {
  offset: 20,
  base: {
    tableRef: "main.orders",
    select: ["id"],
    joins: [
      {
        tableRef: "main.people",
        select: ["id"],
        via: [buyer],
        joins: [
          {
            tableRef: "main.details",
            select: ["id"],
            via: [{ tableRef: "main.details", usingConstraintId: "person" }],
          },
        ],
        where: { column: "id", operator: ConditionOperator.EQUALS, value: "4" },
      },
      { tableRef: "main.people", select: ["id"], via: [seller] },
    ],
  },
};

async function mountNavigator(query: Query) {
  preparedQuery = (await prepareQuery(schemas, query)).preparedQuery;
  const onChange = vi.fn<(query: Query) => void>();
  function Navigator() {
    const { joinActions } = useQuery(query, onChange);
    return (
      <TooltipProvider>
        <TableNavigator
          query={preparedQuery}
          schemas={schemas}
          joinActions={joinActions}
          width={1000}
          highlightedJoinAlias={null}
          onChangeHighlightedJoinAlias={vi.fn()}
        />
      </TooltipProvider>
    );
  }
  render(<Navigator />);
  return { user: userEvent.setup(), onChange };
}

async function openEditor() {
  const { user, onChange } = await mountNavigator(initialQuery);
  const edge = screen.getAllByRole("group", {
    name: "Relationship from main.orders to main.people",
  })[0]!;
  await user.hover(edge.querySelector("path")!);
  await user.click(
    screen.getAllByRole("button", {
      name: "Edit join from main.orders to main.people",
    })[0]!,
  );
  return { user, popup: within(screen.getByRole("dialog")), onChange };
}

it("switches the selected edge to a different foreign key and compiles the edited query", async () => {
  const { user, popup, onChange } = await openEditor();
  expect(
    popup.getByRole("button", { name: /main.orders.buyer = main.people.id/ }),
  ).toBeDisabled();
  await user.click(
    popup.getByRole("button", { name: /main.orders.seller = main.people.id/ }),
  );
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(onChange).toHaveBeenCalledOnce();
  const next = onChange.mock.calls[0]![0];
  expect(next.offset).toBe(0);
  const result = await prepareQuery(schemas, next);
  expect(result.preparedQuery.base.joins[0]).toEqual({
    ...preparedQuery.base.joins[0],
    via: [seller],
  });
  expect(result.preparedQuery.base.joins[1]).toEqual(
    preparedQuery.base.joins[1],
  );
});

it("ranks alternate paths by length and inserts the chosen route on just that branch", async () => {
  const { user, popup, onChange } = await openEditor();
  const options = popup.getAllByRole("button").slice(2);
  expect(options.map((option) => option.textContent)).toEqual([
    "main.accounts",
    "main.stores → main.accounts",
  ]);
  await user.click(options[1]!);
  const result = await prepareQuery(schemas, onChange.mock.calls[0]![0]);
  const [stores, sibling] = result.preparedQuery.base.joins;
  expect(stores).toMatchObject({
    tableRef: "main.stores",
    select: [],
    joins: [
      {
        tableRef: "main.accounts",
        select: [],
        joins: [
          {
            tableRef: "main.people",
            select: ["id"],
            where: initialQuery.base.joins![0]!.where,
            joins: [{ tableRef: "main.details", select: ["id"] }],
            via: [{ tableRef: "main.people", usingConstraintId: "owner" }],
          },
        ],
      },
    ],
  });
  expect(sibling).toMatchObject({ tableRef: "main.people", via: [seller] });
});

async function openTablePicker() {
  const { user, onChange } = await mountNavigator({
    base: { tableRef: "main.orders", select: ["id"] },
  });
  await user.click(
    screen.getByRole("button", { name: "Add related table to orders" }),
  );
  return { user, onChange, popup: within(screen.getByRole("dialog")) };
}

it("shows inline routes and applies their exact relationships", async () => {
  const { user, onChange, popup } = await openTablePicker();
  expect(popup.getByRole("option", { name: "people" })).toHaveTextContent(
    /^people$/,
  );
  const details = popup.getByRole("option", { name: "details" });
  expect(details).toHaveTextContent("via people");
  expect(details).not.toHaveTextContent("main.");
  expect(onChange).not.toHaveBeenCalled();
  await user.click(details);
  const { preparedQuery: result } = await prepareQuery(
    schemas,
    onChange.mock.calls[0]![0],
  );
  expect(result.base.joins[0]).toMatchObject({
    tableRef: "main.people",
    via: [buyer],
    joins: [
      {
        tableRef: "main.details",
        via: [{ tableRef: "main.details", usingConstraintId: "person" }],
      },
    ],
  });
});

it("builds a custom path, supports undo, and compiles the selected relationships", async () => {
  const { user, onChange, popup } = await openTablePicker();
  await user.hover(popup.getByRole("option", { name: "people" }));
  await user.click(
    popup.getByRole("button", { name: "Custom path to details" }),
  );
  expect(
    popup.getByRole("heading", { name: "Custom path to details" }),
  ).toBeVisible();
  expect(onChange).not.toHaveBeenCalled();
  const join = popup.getByRole("button", { name: "Join table" });
  expect(join).toBeDisabled();
  await user.click(popup.getByRole("button", { name: /^people buyer .*id$/ }));
  await user.click(popup.getByRole("button", { name: "Undo step" }));
  await user.click(popup.getByRole("button", { name: /^stores store .*id$/ }));
  await user.click(
    popup.getByRole("button", {
      name: /^accounts account .*id$/,
    }),
  );
  await user.click(popup.getByRole("button", { name: /^people owner .*id$/ }));
  await user.click(
    popup.getByRole("button", { name: /^details id .*person$/ }),
  );
  expect(onChange).not.toHaveBeenCalled();
  await user.click(join);
  expect(screen.queryByRole("dialog")).toBeNull();
  const next = onChange.mock.calls[0]![0];
  expect(next.base.joins![0]!.via).toEqual([
    { tableRef: "main.stores", usingConstraintId: "store" },
    { tableRef: "main.accounts", usingConstraintId: "account" },
    { tableRef: "main.people", usingConstraintId: "owner" },
    { tableRef: "main.details", usingConstraintId: "person" },
  ]);
  const { preparedQuery: result } = await prepareQuery(schemas, next);
  expect(result.base.joins[0]!.joins[0]!.joins[0]!.joins[0]).toMatchObject({
    tableRef: "main.details",
    select: ["id", "person"],
  });
});

it("can choose another foreign key to the same table from the keyboard", async () => {
  const { user, onChange, popup } = await openTablePicker();
  await user.type(
    popup.getByRole("combobox", { name: "Filter tables" }),
    "people",
  );
  await user.tab(); // Clear search
  await user.tab();
  expect(
    popup.getByRole("button", { name: "Custom path to people" }),
  ).toHaveFocus();
  await user.keyboard("{Enter}");
  expect(
    popup.getByRole("button", { name: /^people buyer .*id$/ }),
  ).toHaveFocus();
  await user.tab();
  expect(
    popup.getByRole("button", { name: /^people seller .*id$/ }),
  ).toHaveFocus();
  await user.keyboard("{Enter}");
  expect(popup.getByRole("button", { name: "Join table" })).toHaveFocus();
  await user.keyboard("{Enter}");
  const { preparedQuery: result } = await prepareQuery(
    schemas,
    onChange.mock.calls[0]![0],
  );
  expect(result.base.joins[0]!.via).toEqual([seller]);
});

it("qualifies duplicate table names throughout the picker and commits the selected schema", async () => {
  const { user, onChange, popup } = await openTablePicker();
  const archive = popup.getByRole("option", { name: "archive.tags" });
  expect(popup.getByRole("option", { name: "main.tags" })).toBeVisible();
  await user.hover(archive);
  expect(archive).toHaveTextContent("archive.tags");
  expect(archive).toHaveTextContent(/^archive\.tags$/);
  await user.click(
    popup.getByRole("button", { name: "Custom path to archive.tags" }),
  );
  expect(
    popup.getByRole("heading", { name: "Custom path to archive.tags" }),
  ).toBeVisible();
  await user.click(
    popup.getByRole("button", { name: /^archive\.tags id .*order_id$/ }),
  );
  await user.click(popup.getByRole("button", { name: "Join table" }));
  const { preparedQuery: result } = await prepareQuery(
    schemas,
    onChange.mock.calls[0]![0],
  );
  expect(result.base.joins[0]!.tableRef).toBe("archive.tags");
});

it("removes the starting table and preserves the remaining table's filters, columns and sorting", async () => {
  const remaining = {
    ...initialQuery.base.joins![0]!,
    joins: [],
    orderBy: [{ column: "id", direction: "desc" as const }],
  };
  const { user, onChange } = await mountNavigator({
    ...initialQuery,
    limit: 50,
    base: {
      ...initialQuery.base,
      where: { column: "id", operator: ConditionOperator.EQUALS, value: "10" },
      orderBy: [{ column: "id", direction: "asc" }],
      joins: [remaining],
    },
  });
  await user.click(
    screen.getByRole("button", { name: "Remove orders from query" }),
  );
  expect(onChange).toHaveBeenCalledOnce();
  const next = onChange.mock.calls[0]![0];
  expect(next).toMatchObject({
    offset: 0,
    limit: 50,
    base: {
      ...remaining,
      via: [],
    },
  });
  const result = await prepareQuery(schemas, next);
  expect(result.preparedQuery.base.tableRef).toBe("main.people");
  expect(result.preparedQuery.base.joins).toEqual([]);
  // The previous query remains intact until the edit is applied.
  expect(preparedQuery.base.tableRef).toBe("main.orders");
  expect(preparedQuery.base.where).toMatchObject({ value: "10" });
});

it("prunes unused intermediate tables when promoting a distant selected table", async () => {
  const { user, onChange } = await mountNavigator({
    base: {
      tableRef: "main.orders",
      select: ["id"],
      joins: [
        {
          tableRef: "main.details",
          select: ["id", "person"],
          via: [
            buyer,
            { tableRef: "main.details", usingConstraintId: "person" },
          ],
        },
      ],
    },
  });
  await user.click(
    screen.getByRole("button", { name: "Remove orders from query" }),
  );
  const result = await prepareQuery(schemas, onChange.mock.calls[0]![0]);
  expect(result.preparedQuery.base).toMatchObject({
    tableRef: "main.details",
    select: ["id", "person"],
    via: [],
    joins: [],
  });
});

it("preserves sibling instances and their exact relationships when removing a branched starting table", async () => {
  const { user, onChange } = await mountNavigator({
    ...initialQuery,
    base: {
      ...initialQuery.base,
      where: { column: "id", operator: ConditionOperator.EQUALS, value: "10" },
      orderBy: [{ column: "id", direction: "asc" }],
    },
  });
  await user.click(
    screen.getByRole("button", { name: "Remove orders from query" }),
  );
  const result = await prepareQuery(schemas, onChange.mock.calls[0]![0]);
  expect(result.preparedQuery.base).toMatchObject({
    tableRef: "main.people",
    select: ["id"],
    via: [],
    where: initialQuery.base.joins![0]!.where,
    joins: [
      { tableRef: "main.details", select: ["id"] },
      {
        tableRef: "main.orders",
        select: [],
        where: undefined,
        orderBy: undefined,
        via: [{ tableRef: "main.orders", usingConstraintId: "buyer" }],
        joins: [{ tableRef: "main.people", select: ["id"], via: [seller] }],
      },
    ],
  });
});

it("selects columns when the only remaining table was used just for filtering", async () => {
  const { user, onChange } = await mountNavigator({
    base: {
      ...initialQuery.base,
      joins: [
        {
          tableRef: "main.people",
          select: [],
          via: [buyer],
          where: {
            column: "id",
            operator: ConditionOperator.EQUALS,
            value: "4",
          },
        },
      ],
    },
  });
  await user.click(
    screen.getByRole("button", { name: "Remove orders from query" }),
  );
  const result = await prepareQuery(schemas, onChange.mock.calls[0]![0]);
  expect(result.preparedQuery.base).toMatchObject({
    tableRef: "main.people",
    select: ["id"],
    joins: [],
    where: { value: "4" },
  });
});
