import {
  act,
  render,
  renderHook,
  screen,
  within,
} from "@testing-library/react";
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
import { JoinRankingProvider, type JoinRanker } from "@quory/stack/react";

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

async function mountNavigator(query: Query, ranker?: JoinRanker) {
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
  render(
    <JoinRankingProvider value={ranker}>
      <Navigator />
    </JoinRankingProvider>,
  );
  return { user: userEvent.setup(), onChange };
}

async function openEditor(ranker?: JoinRanker) {
  const { user, onChange } = await mountNavigator(initialQuery, ranker);
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
    popup.getByRole("heading", { name: "orders to people" }),
  ).toBeVisible();
  expect(popup.queryByText("Join columns")).not.toBeInTheDocument();
  expect(
    popup.queryByText("Insert intermediate table"),
  ).not.toBeInTheDocument();
  expect(
    popup.getByRole("button", { name: /orders.buyer → people.id/ }),
  ).toBeVisible();
  await user.click(
    popup.getByRole("button", { name: /orders.seller → people.id/ }),
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

it("ranks edge paths with the decision model and inserts the chosen route on just that branch", async () => {
  const ranker = vi.fn<JoinRanker>().mockImplementation(async (request) => ({
    ranked: true,
    orderedIds: request.candidates.map(({ id }) => id).reverse(),
  }));
  const { user, popup, onChange } = await openEditor(ranker);
  await popup.findByText("Suggested paths ranked by your decision model.");
  expect(ranker).toHaveBeenCalledOnce();
  expect(ranker.mock.calls[0]![0]).toMatchObject({
    kind: "paths",
    sourceTable: "main.orders",
    targetTable: "main.people",
    joinedTables: ["main.details", "main.orders", "main.people", "main.people"],
  });
  const options = within(
    popup.getByRole("group", { name: "Suggested join paths" }),
  ).getAllByRole("button");
  expect(options).toHaveLength(3);
  expect(options[0]).toHaveTextContent("stores");
  await user.click(options[0]!);
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

it("uses the shared loading and custom-path flow when editing an edge", async () => {
  const ranker = vi.fn<JoinRanker>(() => new Promise(() => {}));
  const { user, popup, onChange } = await openEditor(ranker);
  expect(popup.getByRole("status")).toHaveTextContent(
    "Ranking suggested paths…",
  );
  expect(
    popup.queryByRole("group", { name: "Suggested join paths" }),
  ).not.toBeInTheDocument();
  await user.click(popup.getByRole("button", { name: "Custom path" }));
  await user.click(popup.getByRole("button", { name: /^people seller .*id$/ }));
  await user.click(popup.getByRole("button", { name: "Join table" }));
  expect(onChange).toHaveBeenCalledOnce();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  const { preparedQuery: result } = await prepareQuery(
    schemas,
    onChange.mock.calls[0]![0],
  );
  expect(result.base.joins[0]).toEqual({
    ...preparedQuery.base.joins[0],
    via: [seller],
  });
});

it("closes edge path options without editing the query", async () => {
  const { user, popup, onChange } = await openEditor();
  await user.click(popup.getByRole("button", { name: "Close path options" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(onChange).not.toHaveBeenCalled();
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

it("joins a single direct relationship immediately even when longer routes exist", async () => {
  const { user, onChange, popup } = await openTablePicker();
  // Accounts is also reachable through stores, but has one direct relationship.
  await user.click(popup.getByRole("option", { name: "accounts" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(onChange).toHaveBeenCalledOnce();
  const { preparedQuery: result } = await prepareQuery(
    schemas,
    onChange.mock.calls[0]![0],
  );
  expect(result.base.joins).toHaveLength(1);
  expect(result.base.joins[0]).toMatchObject({
    tableRef: "main.accounts",
    via: [{ tableRef: "main.accounts", usingConstraintId: "account" }],
    joins: [],
  });
});

it("keeps path choices for ambiguous direct relationships", async () => {
  const { user, onChange, popup } = await openTablePicker();
  await user.click(popup.getByRole("option", { name: "people" }));
  expect(onChange).not.toHaveBeenCalled();
  expect(popup.getByText("orders to people")).toBeVisible();
  expect(
    within(
      popup.getByRole("group", { name: "Suggested join paths" }),
    ).getAllByRole("button").length,
  ).toBeGreaterThan(1);
});

it("still opens a custom path for a table with a single direct relationship", async () => {
  const { user, onChange, popup } = await openTablePicker();
  await user.click(
    popup.getByRole("button", { name: "Custom path to accounts" }),
  );
  expect(onChange).not.toHaveBeenCalled();
  expect(popup.getByText("Custom path to accounts")).toBeVisible();
});

it("lists table names without path previews and applies the chosen path's exact relationships", async () => {
  const { user, onChange, popup } = await openTablePicker();
  expect(popup.getByRole("option", { name: "people" })).toHaveTextContent(
    /^people$/,
  );
  const details = popup.getByRole("option", { name: "details" });
  expect(details).toHaveTextContent(/^details$/);
  expect(details).not.toHaveAttribute("aria-description");
  expect(onChange).not.toHaveBeenCalled();
  await user.click(details);
  expect(onChange).not.toHaveBeenCalled();
  await user.click(
    within(
      popup.getByRole("group", { name: "Suggested join paths" }),
    ).getAllByRole("button")[0]!,
  );
  expect(onChange).toHaveBeenCalledOnce();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
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
    popup.getByRole("button", { name: /^details person id .*person$/ }),
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
    select: ["id"],
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
    popup.getByRole("button", {
      name: /^archive\.tags order_id id .*order_id$/,
    }),
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

it.each([1, 2])(
  "edits a full route across %i intermediate tables and removes the obsolete bridges",
  async (count) => {
    const via = [
      ...(count === 2
        ? [{ tableRef: "main.stores", usingConstraintId: "store" }]
        : []),
      { tableRef: "main.accounts", usingConstraintId: "account" },
      { tableRef: "main.people", usingConstraintId: "owner" },
    ];
    const destination = { ...initialQuery.base.joins![0]!, via };
    const { user, onChange } = await mountNavigator({
      ...initialQuery,
      base: { ...initialQuery.base, joins: [destination] },
    });
    expect(
      screen.queryByRole("button", { name: /Edit join.*accounts/ }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: /Edit join.*stores/ }),
    ).toBeNull();
    const hoverArea = screen.getByLabelText(
      "Join path from main.orders to main.people",
    );
    await user.hover(hoverArea);
    expect(hoverArea).toHaveClass("opacity-100");
    const edit = screen.getByRole("button", {
      name: "Edit join from main.orders to main.people",
    });
    expect(edit).toHaveClass("opacity-100");
    await user.hover(
      screen.getByRole("button", { name: "Add all columns from accounts" }),
    );
    expect(hoverArea).toHaveClass("opacity-0");
    expect(edit).toHaveClass("opacity-0");
    expect(document.querySelector(".stroke-primary-emphasis")).toBeNull();
    await user.hover(hoverArea);
    expect(hoverArea).toHaveClass("opacity-100");
    await user.click(edit);
    const popup = within(screen.getByRole("dialog"));
    expect(
      popup.getByRole("heading", { name: "orders to people" }),
    ).toBeVisible();
    await user.click(
      popup.getByRole("button", { name: /orders.seller → people.id/ }),
    );
    const { preparedQuery: next } = await prepareQuery(
      schemas,
      onChange.mock.calls[0]![0],
    );
    expect(next.base.joins).toHaveLength(1);
    expect(next.base.joins[0]).toMatchObject({
      tableRef: "main.people",
      select: destination.select,
      where: destination.where,
      via: [seller],
      joins: [{ tableRef: "main.details", select: ["id"] }],
    });
  },
);

it("keeps shared intermediate branches when one displayed destination changes route", async () => {
  const { user, onChange } = await mountNavigator({
    base: {
      tableRef: "main.orders",
      select: ["id"],
      joins: [
        {
          tableRef: "main.accounts",
          select: [],
          via: [{ tableRef: "main.accounts", usingConstraintId: "account" }],
          joins: [
            {
              ...initialQuery.base.joins![0]!,
              via: [{ tableRef: "main.people", usingConstraintId: "owner" }],
            },
            {
              tableRef: "main.people",
              select: ["id"],
              via: [{ tableRef: "main.people", usingConstraintId: "owner" }],
              where: {
                column: "id",
                operator: ConditionOperator.EQUALS,
                value: "9",
              },
            },
          ],
        },
      ],
    },
  });
  const originalSibling = preparedQuery.base.joins[0]!.joins[1]!;
  await user.click(
    screen.getAllByRole("button", {
      name: "Edit join from main.orders to main.people",
    })[0]!,
  );
  const popup = within(screen.getByRole("dialog"));
  await user.click(
    popup.getByRole("button", { name: /orders.seller → people.id/ }),
  );
  const next = onChange.mock.calls[0]![0];
  expect(next.base.joins![0]).toMatchObject({
    tableRef: "main.accounts",
    select: [],
    joins: [originalSibling],
  });
  expect(next.base.joins![1]).toMatchObject({
    tableRef: "main.people",
    via: [seller],
    where: initialQuery.base.joins![0]!.where,
  });
  await expect(prepareQuery(schemas, next)).resolves.toBeDefined();
});

it.each([false, true])(
  "adds another instance of an already joined table without changing the existing instances (custom: %s)",
  async (custom) => {
    const { user, onChange } = await mountNavigator(initialQuery);
    await user.click(
      screen.getByRole("button", { name: "Add related table to orders" }),
    );
    const popup = within(screen.getByRole("dialog"));
    const people = popup.getByRole("option", { name: "people" });
    expect(people).not.toHaveAttribute("aria-disabled", "true");
    if (custom) {
      await user.click(
        popup.getByRole("button", { name: "Custom path to people" }),
      );
      await user.click(
        popup.getByRole("button", { name: /^people seller .*id$/ }),
      );
      await user.click(popup.getByRole("button", { name: "Join table" }));
    } else {
      await user.click(people);
      await user.click(
        popup.getByRole("button", { name: /orders.seller → people.id/ }),
      );
    }
    const { preparedQuery: next } = await prepareQuery(
      schemas,
      onChange.mock.calls[0]![0],
    );
    expect(next.base.joins).toHaveLength(3);
    expect(next.base.joins.slice(0, 2)).toEqual(preparedQuery.base.joins);
    expect(next.base.joins[2]).toMatchObject({
      tableRef: "main.people",
      select: ["id"],
      via: [seller],
      joins: [],
    });
    expect(new Set(next.base.joins.map((join) => join.joinAlias)).size).toBe(3);
  },
);

it("adds a repeated table through a single direct relationship without overwriting its filters or columns", async () => {
  const { user, onChange } = await mountNavigator({
    base: {
      tableRef: "main.orders",
      select: ["id"],
      joins: [
        {
          tableRef: "main.accounts",
          select: ["owner"],
          where: {
            column: "id",
            operator: ConditionOperator.EQUALS,
            value: "7",
          },
        },
      ],
    },
  });
  await user.click(
    screen.getByRole("button", { name: "Add related table to orders" }),
  );
  await user.click(screen.getByRole("option", { name: "accounts" }));
  const { preparedQuery: next } = await prepareQuery(
    schemas,
    onChange.mock.calls[0]![0],
  );
  expect(next.base.joins).toHaveLength(2);
  expect(next.base.joins[0]).toEqual(preparedQuery.base.joins[0]);
  expect(next.base.joins[1]).toMatchObject({
    tableRef: "main.accounts",
    select: ["id"],
    joins: [],
  });
  expect(next.base.joins[1]!.where).toBeUndefined();
});

it("can join another instance of an ancestor instead of reusing the ancestor", async () => {
  const { user, onChange } = await mountNavigator({
    base: {
      tableRef: "main.orders",
      select: ["id"],
      joins: [{ tableRef: "main.people", select: ["id"], via: [buyer] }],
    },
  });
  await user.click(
    screen.getByRole("button", { name: "Add related table to people" }),
  );
  const popup = within(screen.getByRole("dialog"));
  await user.click(popup.getByRole("option", { name: "orders" }));
  await user.click(
    popup.getByRole("button", { name: /people.id → orders.seller/ }),
  );
  const { preparedQuery: next } = await prepareQuery(
    schemas,
    onChange.mock.calls[0]![0],
  );
  expect(next.base.select).toEqual(["id"]);
  expect(next.base.joins[0]!.joins[0]).toMatchObject({
    tableRef: "main.orders",
    via: [{ tableRef: "main.orders", usingConstraintId: "seller" }],
  });
  expect(next.base.joins[0]!.joins[0]!.joinAlias).not.toBe(next.base.joinAlias);
});

it("keeps hidden columns specific to each instance of a repeated table", async () => {
  preparedQuery = (await prepareQuery(schemas, initialQuery)).preparedQuery;
  const first = preparedQuery.base.joins[0]!;
  const second = preparedQuery.base.joins[1]!;
  const { result } = renderHook(() => useQuery(initialQuery, vi.fn()));
  act(() => result.current.joinActions(first.joinAlias).setSelectedColumns([]));
  expect(
    result.current.joinActions(first.joinAlias).getVisibleColumns(),
  ).toEqual([]);
  expect(
    result.current.joinActions(second.joinAlias).getVisibleColumns(),
  ).toEqual(["id"]);
});

it("selects columns for a new repeated table using query and path metadata only", async () => {
  const ranker = vi.fn<JoinRanker>().mockImplementation(async (request) => ({
    ranked: true,
    orderedIds: request.candidates.map(({ id }) => id),
    ...(request.kind === "columns" ? { selectedIds: ["owner"] } : {}),
  }));
  const { user, onChange } = await mountNavigator(
    {
      base: {
        tableRef: "main.orders",
        select: ["id"],
        joins: [
          {
            tableRef: "main.accounts",
            select: ["id"],
            where: {
              column: "id",
              operator: ConditionOperator.EQUALS,
              value: "private-filter-value",
            },
          },
        ],
      },
    },
    ranker,
  );
  await user.click(
    screen.getByRole("button", { name: "Add related table to orders" }),
  );
  await user.click(screen.getByRole("option", { name: "accounts" }));
  const { preparedQuery: next } = await prepareQuery(
    schemas,
    onChange.mock.calls[0]![0],
  );
  expect(next.base.joins[0]).toEqual(preparedQuery.base.joins[0]);
  expect(next.base.joins[1]!.select).toEqual(["owner"]);
  const request = ranker.mock.calls.find(
    ([candidateRequest]) => candidateRequest.kind === "columns",
  )![0];
  expect(request).toMatchObject({
    sourceTable: "main.orders",
    targetTable: "main.accounts",
    selectedColumns: [
      { tableRef: "main.orders", columns: ["id"] },
      { tableRef: "main.accounts", columns: ["id"] },
    ],
  });
  expect(request.joinPath).toContain("orders");
  expect(JSON.stringify(request)).not.toContain("private-filter-value");
});

it("shows a cancelable column-selection spinner and never joins after cancellation", async () => {
  let resolve!: (result: Awaited<ReturnType<JoinRanker>>) => void;
  const ranker: JoinRanker = async (request) =>
    request.kind === "columns"
      ? new Promise((done) => {
          resolve = done;
        })
      : { ranked: true, orderedIds: request.candidates.map(({ id }) => id) };
  const { user, onChange } = await mountNavigator(initialQuery, ranker);
  await user.click(
    screen.getByRole("button", { name: "Add related table to orders" }),
  );
  await user.click(screen.getByRole("option", { name: "accounts" }));
  expect(screen.getByRole("status")).toHaveTextContent("Choosing columns");
  expect(screen.queryByRole("option")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  await act(async () =>
    resolve({ ranked: true, orderedIds: [], selectedIds: ["owner"] }),
  );
  expect(onChange).not.toHaveBeenCalled();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
