import { type ComponentProps } from "react";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  ConditionOperator,
  type DatabaseSchema,
  type PreparedQuery,
} from "@quory/core";
import { JoinRankingProvider, type JoinRanker } from "@quory/stack/react";
import TableNavigator from "./TableNavigator";
import { QueryFilters } from "./QueryFilters";
import { TooltipProvider } from "./ui/tooltip";

const schemas: DatabaseSchema[] = [
  {
    name: "public",
    tables: [
      {
        name: "customers",
        columns: ["id", "name"].map((name) => ({
          name,
          dataType: "text",
          genericDataType: "text",
          isNullable: false,
          includedInPrimaryKey: name === "id",
          foreignKeys: [],
          foreignKeyReferences:
            name === "id"
              ? [
                  {
                    localSchemaName: "public",
                    localTableName: "orders",
                    localColumnName: "customer_id",
                    hasForeignKeyConstraint: true,
                    confidence: 1,
                  },
                ]
              : [],
        })),
      },
      {
        name: "orders",
        columns: [
          {
            name: "customer_id",
            dataType: "text",
            genericDataType: "text",
            isNullable: false,
            includedInPrimaryKey: true,
            foreignKeys: [
              {
                foreignSchemaName: "public",
                foreignTableName: "customers",
                foreignColumnName: "id",
                hasForeignKeyConstraint: true,
                confidence: 1,
              },
            ],
            foreignKeyReferences: [],
          },
        ],
      },
    ],
  },
];
const query: PreparedQuery = {
  base: {
    tableRef: "public.customers",
    joinAlias: "customers",
    resultAliases: {},
    select: ["id", "name"],
    joins: [],
  },
};

function renderNavigator(
  navigatorQuery: PreparedQuery = query,
  showBreakdown = false,
  navigatorSchemas = schemas,
  ranker?: JoinRanker,
) {
  type JoinActions = ComponentProps<typeof TableNavigator>["joinActions"];
  const setSelectedColumns = vi.fn();
  const setCondition = vi.fn();
  const removeCondition = vi.fn();
  const addJoin = vi.fn();
  const removeJoin = vi.fn();
  const joinActions = vi.fn<JoinActions>().mockReturnValue({
    join: navigatorQuery.base,
    getChildren: () => [],
    getParent: () => undefined,
    getVisibleColumns: () => navigatorQuery.base.select,
    setSelectedColumns,
    setCondition,
    removeCondition,
    orderBy: vi.fn(),
    removeJoin,
    addJoin,
    addJoinOnForeignKey: vi.fn(),
    setJoinRoute: vi.fn(),
    addJoinOnForeignKeyReference: vi.fn(),
    hasCondition: () => false,
  });
  const view = render(
    <JoinRankingProvider value={ranker}>
      <TooltipProvider>
        {showBreakdown && (
          <QueryFilters
            query={navigatorQuery}
            schemas={schemas}
            joinActions={joinActions}
            onHighlight={vi.fn()}
          />
        )}
        <TableNavigator
          width={1000}
          query={navigatorQuery}
          schemas={navigatorSchemas}
          joinActions={joinActions}
          highlightedJoinAlias={null}
          onChangeHighlightedJoinAlias={vi.fn()}
        />
      </TooltipProvider>
    </JoinRankingProvider>,
  );
  return {
    setSelectedColumns,
    setCondition,
    removeCondition,
    addJoin,
    removeJoin,
    view,
  };
}

describe("TableNavigator", () => {
  it.each(["foreign-key", "inferred", "manual"] as const)(
    "shows only the midpoint edit action when hovering a direct %s join",
    async (source) => {
      const user = userEvent.setup();
      const related = structuredClone(schemas);
      const orders = related[0]!.tables[1]!;
      const column = orders.columns[0]!;
      for (const [index, name] of ["billing_id", "billing_name"].entries()) {
        orders.columns.push({
          ...column,
          name,
          foreignKeys: [
            {
              ...column.foreignKeys[0]!,
              foreignColumnName: index === 0 ? "id" : "name",
              source,
              constraintId: "billing_customer",
              columnPosition: index + 1,
              confidence: 0.85,
            },
          ],
        });
      }
      renderNavigator(
        {
          base: {
            ...query.base,
            joins: [
              {
                tableRef: "public.orders",
                joinAlias: "orders",
                select: ["customer_id"],
                resultAliases: {},
                joins: [],
                via: [
                  {
                    tableRef: "public.orders",
                    usingConstraintId: "billing_customer",
                  },
                ],
              },
            ],
          },
        },
        false,
        related,
      );

      const edge = screen.getByRole(
        source === "inferred" ? "button" : "group",
        {
          name: /relationship from public.customers to public.orders/i,
        },
      );
      await user.hover(edge.querySelector("path[pointer-events='stroke']")!);
      expect(screen.queryByRole("tooltip")).toBeNull();
      expect(
        screen.queryByLabelText(
          "Join path from public.customers to public.orders",
        ),
      ).toBeNull();
      const edit = screen.getByRole("button", {
        name: "Edit join from public.customers to public.orders",
      });
      expect(edit).toHaveClass("opacity-100");
      const coordinates = edge
        .querySelector("path")!
        .getAttribute("d")!
        .match(/-?\d+(?:\.\d+)?/g)!
        .map(Number);
      const position = edit.closest("foreignObject")!;
      expect(Number(position.getAttribute("x")) + 12).toBe(
        (coordinates[0]! + coordinates.at(-2)!) / 2,
      );
      expect(Number(position.getAttribute("y")) + 12).toBe(
        (coordinates[1]! + coordinates.at(-1)!) / 2,
      );
      await user.hover(edit);
      expect(await screen.findByRole("tooltip")).toHaveTextContent(
        "Edit path: customers to orders",
      );
    },
  );

  it("allows removing either table when another table remains", async () => {
    const user = userEvent.setup();
    const { removeJoin } = renderNavigator({
      ...query,
      base: {
        ...query.base,
        joins: [
          {
            tableRef: "public.orders",
            joinAlias: "orders",
            select: ["customer_id"],
            resultAliases: {},
            joins: [],
          },
        ],
      },
    });
    const base = screen.getByRole("group", { name: /base table/ });
    await user.click(
      within(base).getByRole("button", { name: "Remove customers from query" }),
    );
    expect(removeJoin).toHaveBeenCalledOnce();
    removeJoin.mockClear();
    expect(
      screen.queryByRole("button", { name: /Actions for/ }),
    ).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Remove orders from query" }),
    );
    expect(removeJoin).toHaveBeenCalledOnce();
  });

  it("does not offer removal for the only table", () => {
    renderNavigator();
    expect(
      screen.queryByRole("button", { name: "Remove customers from query" }),
    ).toBeNull();
  });

  it("shows implicit bridges as labels that add columns on click", async () => {
    const user = userEvent.setup();
    const { removeJoin, setSelectedColumns } = renderNavigator({
      ...query,
      base: {
        ...query.base,
        joins: [
          {
            tableRef: "public.orders",
            joinAlias: "orders",
            select: [],
            resultAliases: {},
            joins: [
              {
                tableRef: "public.customers",
                joinAlias: "other_customers",
                select: ["name"],
                resultAliases: {},
                joins: [],
              },
            ],
          },
        ],
      },
    });
    const label = screen.getByRole("button", {
      name: "Add orders to query",
    });
    const bridge = screen.getByRole("group", {
      name: "public.orders, joined from public.customers",
    });
    expect(bridge).toHaveTextContent(/^orders$/);
    expect(within(bridge).getAllByRole("button")).toEqual([label]);
    expect(
      screen.queryByRole("button", { name: "Add related table to orders" }),
    ).toBeNull();
    await user.hover(label);
    expect(await screen.findByRole("tooltip")).toBeVisible();
    await user.click(label);
    expect(setSelectedColumns).toHaveBeenCalledWith(["customer_id"]);
    expect(removeJoin).not.toHaveBeenCalled();
  });

  it("uses the decision model to choose columns when adding an intermediate table", async () => {
    const user = userEvent.setup();
    const richSchemas = structuredClone(schemas);
    const orders = richSchemas[0]!.tables[1]!;
    orders.columns.push(
      {
        name: "order_number",
        dataType: "text",
        genericDataType: "text",
        isNullable: false,
        includedInPrimaryKey: false,
        foreignKeys: [],
        foreignKeyReferences: [],
      },
      {
        name: "total",
        dataType: "numeric",
        genericDataType: "number",
        isNullable: false,
        includedInPrimaryKey: false,
        foreignKeys: [],
        foreignKeyReferences: [],
      },
      {
        name: "payload",
        dataType: "jsonb",
        genericDataType: "hierarchical",
        isNullable: true,
        includedInPrimaryKey: false,
        foreignKeys: [],
        foreignKeyReferences: [],
      },
    );
    const ranker = vi.fn<JoinRanker>().mockResolvedValue({
      ranked: true,
      orderedIds: [],
      selectedIds: ["total", "order_number"],
    });
    const { setSelectedColumns } = renderNavigator(
      {
        ...query,
        base: {
          ...query.base,
          joins: [
            {
              tableRef: "public.orders",
              joinAlias: "orders",
              select: [],
              resultAliases: {},
              joins: [
                {
                  tableRef: "public.customers",
                  joinAlias: "other_customers",
                  select: ["name"],
                  resultAliases: {},
                  joins: [],
                },
              ],
            },
          ],
        },
      },
      false,
      richSchemas,
      ranker,
    );
    await user.click(
      screen.getByRole("button", { name: "Add orders to query" }),
    );
    await waitFor(() =>
      expect(setSelectedColumns).toHaveBeenCalledWith([
        "order_number",
        "total",
      ]),
    );
    expect(ranker).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "columns",
        sourceTable: "public.customers",
        targetTable: "public.orders",
        joinedTables: [
          "public.customers",
          "public.orders",
          "public.customers",
        ],
        joinPath: "public.customers -> public.orders -> public.customers",
      }),
      expect.any(AbortSignal),
    );
  });

  it("falls back to useful columns without a decision model when adding an intermediate table", async () => {
    const user = userEvent.setup();
    const richSchemas = structuredClone(schemas);
    const orders = richSchemas[0]!.tables[1]!;
    orders.columns.push(
      {
        name: "order_number",
        dataType: "text",
        genericDataType: "text",
        isNullable: false,
        includedInPrimaryKey: false,
        foreignKeys: [],
        foreignKeyReferences: [],
      },
      {
        name: "payload",
        dataType: "jsonb",
        genericDataType: "hierarchical",
        isNullable: true,
        includedInPrimaryKey: false,
        foreignKeys: [],
        foreignKeyReferences: [],
      },
    );
    const { setSelectedColumns } = renderNavigator(
      {
        ...query,
        base: {
          ...query.base,
          joins: [
            {
              tableRef: "public.orders",
              joinAlias: "orders",
              select: [],
              resultAliases: {},
              joins: [
                {
                  tableRef: "public.customers",
                  joinAlias: "other_customers",
                  select: ["name"],
                  resultAliases: {},
                  joins: [],
                },
              ],
            },
          ],
        },
      },
      false,
      richSchemas,
    );
    await user.click(
      screen.getByRole("button", { name: "Add orders to query" }),
    );
    expect(setSelectedColumns).toHaveBeenCalledWith([
      "customer_id",
      "order_number",
    ]);
  });

  async function chooseFilterField(
    user: ReturnType<typeof userEvent.setup>,
    column: string,
    operator: string,
  ) {
    expect(
      await screen.findByRole("combobox", { name: "Search columns" }),
    ).toHaveFocus();
    await user.keyboard(`${column}{Enter}`);
    expect(
      await screen.findByRole("combobox", { name: "Search operators" }),
    ).toHaveFocus();
    await user.keyboard(`${operator}{Enter}`);
  }

  it("builds and applies a filter entirely by keyboard without tabbing", async () => {
    const user = userEvent.setup();
    const { setCondition } = renderNavigator();
    screen.getByRole("button", { name: "Add filter for customers" }).focus();
    await user.keyboard("{Enter}");
    await chooseFilterField(user, "name", "=");
    expect(screen.getByRole("textbox", { name: "Filter value" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(setCondition).not.toHaveBeenCalled();
    await user.keyboard("Ada{Enter}");
    expect(setCondition).toHaveBeenCalledWith({
      operator: ConditionOperator.AND,
      conditions: [
        { column: "name", operator: ConditionOperator.EQUALS, value: "Ada" },
      ],
    });
    expect(
      screen.queryByRole("button", { name: "Apply" }),
    ).not.toBeInTheDocument();
  });

  it("starts another filter with Shift+Enter and applies both without losing the first", async () => {
    const user = userEvent.setup();
    const { setCondition } = renderNavigator();
    screen.getByRole("button", { name: "Add filter for customers" }).focus();
    await user.keyboard("{Enter}");
    await chooseFilterField(user, "name", "=");
    await user.keyboard("Ada{Shift>}{Enter}{/Shift}");
    await chooseFilterField(user, "id", ">");
    expect(
      screen.getAllByRole("textbox", { name: "Filter value" })[1],
    ).toHaveFocus();
    await user.keyboard("42{Enter}");
    expect(setCondition).toHaveBeenCalledWith({
      operator: ConditionOperator.AND,
      conditions: [
        { column: "name", operator: ConditionOperator.EQUALS, value: "Ada" },
        { column: "id", operator: ConditionOperator.GREATER_THAN, value: "42" },
      ],
    });
  });

  it("commits the current list value before applying with Ctrl+Enter", async () => {
    const user = userEvent.setup();
    const { setCondition } = renderNavigator();
    screen.getByRole("button", { name: "Add filter for customers" }).focus();
    await user.keyboard("{Enter}");
    await chooseFilterField(user, "name", "in");
    expect(
      screen.getByRole("textbox", { name: "Filter values" }),
    ).toHaveFocus();
    await user.keyboard("Ada{Enter}Grace{Control>}{Enter}{/Control}");
    expect(setCondition).toHaveBeenCalledWith({
      operator: ConditionOperator.AND,
      conditions: [
        {
          column: "name",
          operator: ConditionOperator.IN,
          values: ["Ada", "Grace"],
        },
      ],
    });
  });

  function keyboardSchemas() {
    const related = structuredClone(schemas);
    const customer = related[0]!.tables[0]!;
    for (const name of ["order_archive", "order_items"]) {
      related[0]!.tables.push({
        ...structuredClone(related[0]!.tables[1]!),
        name,
      });
      customer.columns[0]!.foreignKeyReferences.push({
        ...customer.columns[0]!.foreignKeyReferences[0]!,
        localTableName: name,
      });
    }
    return related;
  }

  it("keeps a sole eligible table interactive without calling the model", async () => {
    const user = userEvent.setup();
    const ranker = vi.fn<JoinRanker>();
    renderNavigator(query, false, schemas, ranker);
    await user.click(
      screen.getByRole("button", { name: "Add related table to customers" }),
    );
    expect(screen.getByRole("option", { name: "orders" })).toBeVisible();
    expect(ranker).not.toHaveBeenCalled();
  });

  it("resets search scroll even when the first match stays selected, including clearing", async () => {
    const user = userEvent.setup();
    const related = keyboardSchemas();
    const customer = related[0]!.tables[0]!;
    for (let index = 0; index < 40; index++) {
      const name = `order_${String(index).padStart(2, "0")}`;
      related[0]!.tables.push({
        ...structuredClone(related[0]!.tables[1]!),
        name,
      });
      customer.columns[0]!.foreignKeyReferences.push({
        ...customer.columns[0]!.foreignKeyReferences[0]!,
        localTableName: name,
      });
    }
    renderNavigator(query, false, related);
    await user.click(
      screen.getByRole("button", { name: "Add related table to customers" }),
    );
    const search = screen.getByRole("combobox", { name: "Filter tables" });
    const list = screen.getByRole("listbox");
    await user.type(search, "order");
    const first = screen.getAllByRole("option")[0]!;
    expect(first).toHaveAttribute("aria-selected", "true");
    list.scrollTop = 900;
    await user.keyboard("{Backspace}");
    expect(first).toHaveAttribute("aria-selected", "true");
    expect(list.scrollTop).toBe(0);
    expect(search).toHaveFocus();

    // Model the browser scroll that cmdk schedules for the old selection.
    const last = screen.getAllByRole("option").at(-1)!;
    const scroll = vi.spyOn(last, "scrollIntoView").mockImplementation(() => {
      list.scrollTop = 900;
    });
    await user.keyboard("{End}");
    expect(scroll).toHaveBeenCalled();
    await user.click(
      screen.getByRole("button", { name: "Clear table search" }),
    );
    await waitFor(() => expect(list.scrollTop).toBe(0));
    scroll.mockRestore();
    expect(search).toHaveFocus();

    await user.type(search, "order");
    list.scrollTop = 900;
    await user.clear(search);
    await waitFor(() => expect(list.scrollTop).toBe(0));
    // Navigating results without changing the search must not reset the scroll.
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve()),
    );
    list.scrollTop = 300;
    await user.keyboard("{ArrowDown}");
    expect(list.scrollTop).toBe(300);
  });

  it("ranks once, retains tables outside the bounded shortlist in search, and keeps search relevance first", async () => {
    const user = userEvent.setup();
    const large = keyboardSchemas();
    const customer = large[0]!.tables[0]!;
    for (let index = 0; index < 40; index++) {
      const name = `extra_${String(index).padStart(2, "0")}`;
      large[0]!.tables.push({ ...structuredClone(large[0]!.tables[1]!), name });
      customer.columns[0]!.foreignKeyReferences.push({
        ...customer.columns[0]!.foreignKeyReferences[0]!,
        localTableName: name,
      });
    }
    const ranker = vi.fn<JoinRanker>().mockImplementation(async (request) => ({
      ranked: true,
      orderedIds: request.candidates.map(({ id }) => id).reverse(),
    }));
    renderNavigator(query, false, large, ranker);
    await user.click(
      screen.getByRole("button", { name: "Add related table to customers" }),
    );
    await waitFor(() =>
      expect(
        screen.queryByText("Finding related tables…"),
      ).not.toBeInTheDocument(),
    );
    expect(ranker).toHaveBeenCalledTimes(1);
    const request = ranker.mock.calls[0]![0];
    expect(request.candidates).toHaveLength(32);
    expect(screen.getAllByRole("option")[0]).toHaveAttribute(
      "aria-label",
      request.candidates.at(-1)!.id.split(".")[1],
    );
    const outside = large[0]!.tables.find(
      ({ name }) =>
        name.startsWith("extra_") &&
        !request.candidates.some(({ id }) => id === `public.${name}`),
    )!;
    const search = screen.getByRole("combobox", { name: "Filter tables" });
    await user.type(search, outside.name);
    expect(screen.getByRole("option", { name: outside.name })).toBeVisible();
    expect(ranker).toHaveBeenCalledTimes(1);
  });

  it("lets the user use local suggestions immediately and ignores a late ranking", async () => {
    const user = userEvent.setup();
    let complete!: (value: { ranked: boolean; orderedIds: string[] }) => void;
    const ranker = vi.fn<JoinRanker>(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    renderNavigator(query, false, keyboardSchemas(), ranker);
    await user.click(
      screen.getByRole("button", { name: "Add related table to customers" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Use local suggestions" }),
    );
    const before = screen
      .getAllByRole("option")
      .map((item) => item.getAttribute("aria-label"));
    complete({ ranked: true, orderedIds: ["public.orders"] });
    await waitFor(() =>
      expect(
        screen
          .getAllByRole("option")
          .map((item) => item.getAttribute("aria-label")),
      ).toEqual(before),
    );
    expect(
      screen.getByRole("combobox", { name: "Filter tables" }),
    ).toBeVisible();
  });

  it("highlights the closest result after searching and joins it with Enter while keeping typing focus", async () => {
    const user = userEvent.setup();
    const { addJoin } = renderNavigator(query, false, keyboardSchemas());
    await user.click(
      screen.getByRole("button", { name: "Add related table to customers" }),
    );
    const search = screen.getByRole("combobox", { name: "Filter tables" });
    expect(search).toHaveFocus();
    await user.type(search, "order_");
    expect(screen.getByRole("option", { name: "order_items" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(search).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(addJoin).toHaveBeenCalledOnce();
    expect(addJoin).toHaveBeenCalledWith(
      "public.order_items",
      [
        {
          tableRef: "public.order_items",
          usingConstraintId: JSON.stringify([
            "customer_id",
            "public",
            "customers",
            "id",
          ]),
        },
      ],
      ["customer_id"],
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("navigates results with arrows, allows already joined tables and ignores Enter with no matches", async () => {
    const user = userEvent.setup();
    const { addJoin } = renderNavigator(
      {
        ...query,
        base: {
          ...query.base,
          joins: [
            {
              tableRef: "public.orders",
              joinAlias: "orders",
              resultAliases: {},
              select: ["customer_id"],
              joins: [],
            },
          ],
        },
      },
      false,
      keyboardSchemas(),
    );
    await user.click(
      screen.getByRole("button", { name: "Add related table to customers" }),
    );
    const search = screen.getByRole("combobox", { name: "Filter tables" });
    await user.type(search, "missing");
    await user.keyboard("{Enter}");
    expect(addJoin).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeVisible();
    await user.clear(search);
    await user.type(search, "order");
    expect(screen.getByRole("option", { name: "orders" })).not.toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(screen.getByRole("option", { name: "orders" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("option", { name: "order_items" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await user.keyboard("{ArrowUp}{Enter}");
    expect(addJoin).toHaveBeenCalledOnce();
    expect(addJoin).toHaveBeenCalledWith(
      "public.orders",
      [
        {
          tableRef: "public.orders",
          usingConstraintId: JSON.stringify([
            "customer_id",
            "public",
            "customers",
            "id",
          ]),
        },
      ],
      ["customer_id"],
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("ignores drags on nodes and their labels but pans the empty canvas between nodes", () => {
    renderNavigator();
    const canvas = screen.getByRole("region", { name: "Relationship diagram" });
    const content = canvas.firstElementChild as HTMLElement;
    const node = screen.getByRole("group", {
      name: "public.customers, base table",
    });
    const addNode = screen
      .getByRole("button", { name: "Add related table to customers" })
      .closest("[data-canvas-node]")!;
    for (const target of [node, within(node).getByText("customers"), addNode]) {
      fireEvent.pointerDown(target, { button: 0, clientX: 100, clientY: 100 });
      fireEvent.pointerMove(canvas, { clientX: 160, clientY: 140 });
      fireEvent.pointerUp(canvas);
      expect(content.style.transform).toBe("translate(16px, 12px) scale(1)");
    }
    fireEvent.pointerDown(content, { button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(canvas, { clientX: 160, clientY: 140 });
    fireEvent.pointerUp(canvas);
    expect(content.style.transform).toBe("translate(76px, 52px) scale(1)");
  });

  it("pans by dragging the canvas and stops on release or cancellation", () => {
    renderNavigator();
    const canvas = screen.getByRole("region", { name: "Relationship diagram" });
    const content = canvas.firstElementChild as HTMLElement;
    fireEvent.pointerDown(canvas, { button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(canvas, { clientX: 160, clientY: 140 });
    expect(content.style.transform).toBe("translate(76px, 52px) scale(1)");
    expect(canvas.style.backgroundPosition).toBe("76px 52px");
    expect(canvas).toHaveClass("overflow-hidden", "cursor-grabbing");
    fireEvent.pointerUp(canvas);
    fireEvent.pointerMove(canvas, { clientX: 200, clientY: 200 });
    expect(content.style.transform).toBe("translate(76px, 52px) scale(1)");
    fireEvent.pointerDown(canvas, { button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerCancel(canvas);
    expect(canvas).toHaveClass("cursor-grab");
  });

  it("zooms around the pointer, prevents page scrolling and limits the zoom range", async () => {
    renderNavigator();
    const canvas = screen.getByRole("region", { name: "Relationship diagram" });
    const content = canvas.firstElementChild as HTMLElement;
    const delta = Math.log(2) / 0.002;
    const wheel = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      deltaY: -delta,
      clientX: 100,
      clientY: 100,
    });
    fireEvent(canvas, wheel);
    expect(wheel.defaultPrevented).toBe(true);
    expect(content.style.transform).toBe("translate(-68px, -76px) scale(2)");
    fireEvent.wheel(canvas, { deltaY: -10000 });
    expect(content.style.transform).toContain("scale(2.5)");
    fireEvent.wheel(canvas, { deltaY: 10000 });
    expect(content.style.transform).toContain("scale(0.35)");
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Reset relationship canvas" }));
    expect(content.style.transform).toBe("translate(16px, 12px) scale(1)");
  });

  it("keeps table controls clickable and supports keyboard canvas navigation", async () => {
    renderNavigator();
    const canvas = screen.getByRole("region", { name: "Relationship diagram" });
    const content = canvas.firstElementChild as HTMLElement;
    const user = userEvent.setup();
    await user.click(
      screen.getByRole("button", { name: "Add related table to customers" }),
    );
    expect(screen.getByRole("dialog")).toBeVisible();
    expect(content.style.transform).toBe("translate(16px, 12px) scale(1)");
    await user.keyboard("{Escape}");
    canvas.focus();
    fireEvent.keyDown(canvas, { key: "ArrowDown" });
    expect(content.style.transform).toBe("translate(16px, -28px) scale(1)");
    fireEvent.keyDown(canvas, { key: "+" });
    expect(content.style.transform).toContain("scale(1.2)");
    fireEvent.keyDown(canvas, { key: "Home" });
    expect(content.style.transform).toBe("translate(16px, 12px) scale(1)");
  });

  it("closes the add-table popup after adding a table", async () => {
    const user = userEvent.setup();
    const { addJoin } = renderNavigator();
    await user.click(
      screen.getByRole("button", { name: "Add related table to customers" }),
    );
    await user.click(
      within(screen.getByRole("dialog")).getByRole("option", {
        name: "orders",
      }),
    );
    expect(addJoin).toHaveBeenCalledOnce();
    expect(addJoin).toHaveBeenCalledWith(
      "public.orders",
      [
        {
          tableRef: "public.orders",
          usingConstraintId: JSON.stringify([
            "customer_id",
            "public",
            "customers",
            "id",
          ]),
        },
      ],
      ["customer_id"],
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("removes nonmatching rows when several relationships point to the same table", async () => {
    const user = userEvent.setup();
    const duplicateSchemas = structuredClone(schemas);
    const references =
      duplicateSchemas[0]!.tables[0]!.columns[0]!.foreignKeyReferences;
    references.push({
      ...references[0]!,
      localColumnName: "billing_customer_id",
    });
    references.push({
      ...references[0]!,
      localColumnName: "shipping_customer_id",
    });
    references.push({ ...references[0]!, localTableName: "user_phone_number" });
    duplicateSchemas[0]!.tables.push({
      ...duplicateSchemas[0]!.tables[1]!,
      name: "user_phone_number",
    });
    renderNavigator(query, false, duplicateSchemas);
    await user.click(
      screen.getByRole("button", { name: "Add related table to customers" }),
    );
    const popup = screen.getByRole("dialog");
    const search = within(popup).getByRole("combobox", {
      name: "Filter tables",
    });
    await user.type(search, "phone");
    expect(
      within(popup).queryAllByRole("option", { name: "orders" }),
    ).toHaveLength(0);
    await user.clear(search);
    expect(
      within(popup).getAllByRole("option", { name: "orders" }),
    ).toHaveLength(1);
  });

  it("filters adjacent and indirectly related tables from the top of the add-table popup", async () => {
    const user = userEvent.setup();
    const relatedSchemas = structuredClone(schemas);
    const orders = relatedSchemas[0]!.tables[1]!;
    orders.columns[0]!.foreignKeyReferences.push({
      localSchemaName: "public",
      localTableName: "shipments",
      localColumnName: "order_id",
      hasForeignKeyConstraint: true,
      confidence: 1,
    });
    relatedSchemas[0]!.tables.push({
      name: "shipments",
      columns: [
        {
          ...orders.columns[0]!,
          name: "order_id",
          foreignKeyReferences: [],
          foreignKeys: [
            {
              foreignSchemaName: "public",
              foreignTableName: "orders",
              foreignColumnName: "customer_id",
              hasForeignKeyConstraint: true,
              confidence: 1,
            },
          ],
        },
      ],
    });
    renderNavigator(query, false, relatedSchemas);
    await user.click(
      screen.getByRole("button", { name: "Add related table to customers" }),
    );
    const popup = screen.getByRole("dialog");
    const search = within(popup).getByRole("combobox", {
      name: "Filter tables",
    });
    expect(popup.querySelector("input, button")).toBe(search);
    expect(within(popup).getByRole("option", { name: "orders" })).toBeVisible();
    expect(
      within(popup).getByRole("option", { name: "shipments" }),
    ).toBeVisible();
    await user.type(search, "s");
    expect(
      within(popup)
        .getAllByRole("option")
        .filter((button) =>
          ["orders", "shipments"].includes(
            button.getAttribute("aria-label") ?? "",
          ),
        )
        .map((button) => button.getAttribute("aria-label")),
    ).toEqual(["shipments", "orders"]);
    await user.clear(search);
    await user.type(search, "SHIP");
    expect(
      within(popup).queryByRole("option", { name: "orders" }),
    ).not.toBeInTheDocument();
    expect(
      within(popup).getByRole("option", { name: "shipments" }),
    ).toBeVisible();
    await user.click(
      within(popup).getByRole("button", { name: "Clear table search" }),
    );
    await user.type(search, "public.orders");
    expect(within(popup).getByRole("option", { name: "orders" })).toBeVisible();
    expect(
      within(popup).queryByRole("option", { name: "shipments" }),
    ).not.toBeInTheDocument();
    await user.clear(search);
    await user.type(search, "missing");
    expect(within(popup).getByText("No matching tables")).toBeVisible();
  });

  it("shows grouped filter values above the diagram and edits them without showing hidden columns", async () => {
    const user = userEvent.setup();
    const { setCondition, setSelectedColumns } = renderNavigator(
      {
        ...query,
        base: {
          ...query.base,
          select: [],
          where: {
            operator: ConditionOperator.AND,
            conditions: [
              {
                column: "id",
                operator: ConditionOperator.GREATER_THAN,
                value: "5",
              },
              {
                operator: ConditionOperator.OR,
                conditions: [
                  {
                    column: "name",
                    operator: ConditionOperator.EQUALS,
                    value: "Ada",
                  },
                  {
                    column: "name",
                    operator: ConditionOperator.EQUALS,
                    value: "Grace",
                  },
                ],
              },
            ],
          },
        },
      },
      true,
    );
    const summary = screen.getByRole("region", { name: "Query filters" });
    expect(summary).toHaveTextContent(
      'id > "5" AND (name = "Ada" OR name = "Grace")',
    );
    expect(
      screen.getByRole("button", { name: "Edit 3 filters for customers" }),
    ).toBeVisible();
    await user.click(within(summary).getByRole("button"));
    const values = screen.getAllByRole("textbox", { name: "Filter value" });
    await user.clear(values[0]!);
    await user.type(values[0]!, "10");
    await user.click(screen.getByRole("button", { name: "Apply" }));
    expect(setCondition).toHaveBeenCalledWith({
      operator: ConditionOperator.AND,
      conditions: [
        { column: "id", operator: ConditionOperator.GREATER_THAN, value: "10" },
        {
          operator: ConditionOperator.OR,
          conditions: [
            {
              column: "name",
              operator: ConditionOperator.EQUALS,
              value: "Ada",
            },
            {
              column: "name",
              operator: ConditionOperator.EQUALS,
              value: "Grace",
            },
          ],
        },
      ],
    });
    expect(setSelectedColumns).not.toHaveBeenCalled();
  });

  it("shows and edits filters on tables without visible columns without adding their columns", async () => {
    const user = userEvent.setup();
    const { setSelectedColumns, setCondition } = renderNavigator({
      ...query,
      base: {
        ...query.base,
        select: [],
        where: {
          column: "name",
          operator: ConditionOperator.EQUALS,
          value: "Ada",
        },
      },
    });
    const filter = screen.getByRole("button", {
      name: "Edit 1 filter for customers",
    });
    expect(screen.queryByText('name = "Ada"')).not.toBeInTheDocument();
    expect(filter).toBeVisible();
    await user.click(filter);
    await user.clear(screen.getByRole("textbox", { name: "Filter value" }));
    await user.type(
      screen.getByRole("textbox", { name: "Filter value" }),
      "Grace",
    );
    await user.click(screen.getByRole("button", { name: "Apply" }));
    expect(setCondition).toHaveBeenCalledWith({
      operator: ConditionOperator.AND,
      conditions: [
        { column: "name", operator: ConditionOperator.EQUALS, value: "Grace" },
      ],
    });
    expect(setSelectedColumns).not.toHaveBeenCalled();
    await user.click(
      screen.getByRole("button", { name: "Show columns for customers" }),
    );
    expect(setSelectedColumns).toHaveBeenCalledWith(["id", "name"]);
  });

  it("opens compound filter values from the keyboard on hidden tables", async () => {
    const user = userEvent.setup();
    const { setSelectedColumns, removeCondition } = renderNavigator({
      ...query,
      base: {
        ...query.base,
        select: [],
        where: {
          operator: ConditionOperator.AND,
          conditions: [
            {
              column: "name",
              operator: ConditionOperator.IN,
              values: ["Ada", "Grace"],
            },
          ],
        },
      },
    });
    const filter = screen.getByRole("button", {
      name: "Edit 1 filter for customers",
    });
    filter.focus();
    await user.keyboard("{Enter}");
    expect(
      screen.getByRole("textbox", { name: "Filter values" }),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Delete filter" }));
    await user.click(screen.getByRole("button", { name: "Apply" }));
    expect(removeCondition).toHaveBeenCalledOnce();
    expect(setSelectedColumns).not.toHaveBeenCalled();
  });

  it("still adds columns from an unfiltered hidden table with the keyboard", async () => {
    const user = userEvent.setup();
    const { setSelectedColumns } = renderNavigator({
      ...query,
      base: { ...query.base, select: [] },
    });
    screen.getByRole("button", { name: "Show columns for customers" }).focus();
    await user.keyboard("{Enter}");
    expect(setSelectedColumns).toHaveBeenCalledWith(["id", "name"]);
  });

  it.each(["individual", "select all"])(
    "allows clearing all columns on an ancestor using %s",
    async (method) => {
      const user = userEvent.setup();
      const { setSelectedColumns } = renderNavigator({
        base: {
          ...query.base,
          joins: [
            {
              tableRef: "public.orders",
              joinAlias: "orders",
              select: ["customer_id"],
              resultAliases: {},
              joins: [],
            },
          ],
        },
      });
      await user.click(
        screen.getByRole("button", {
          name: "Edit displayed columns for customers",
        }),
      );
      if (method === "select all") {
        await user.click(
          screen.getByRole("menuitemcheckbox", { name: "Select all" }),
        );
      } else {
        await user.click(
          screen.getByRole("menuitemcheckbox", { name: "name" }),
        );
        await user.click(screen.getByRole("menuitemcheckbox", { name: "id" }));
      }
      expect(
        screen.getByRole("menuitemcheckbox", { name: "id" }),
      ).not.toBeChecked();
      expect(
        screen.getByRole("menuitemcheckbox", { name: "name" }),
      ).not.toBeChecked();
      expect(setSelectedColumns).not.toHaveBeenCalled();
      await user.click(screen.getByRole("menuitem", { name: "Apply" }));
      expect(setSelectedColumns).toHaveBeenCalledWith([]);
    },
  );

  it("keeps at least one column, discards dismissed edits, and applies column choices only on Apply", async () => {
    const user = userEvent.setup();
    const { setSelectedColumns } = renderNavigator();
    await user.click(
      screen.getByRole("button", {
        name: "Edit displayed columns for customers",
      }),
    );
    // Radix enables pointer events in an effect after mounting its modal menu.
    await waitFor(() =>
      expect(screen.getByRole("menu")).toHaveStyle({ pointerEvents: "auto" }),
    );
    await user.click(screen.getByRole("menuitemcheckbox", { name: "name" }));
    expect(
      screen.getByRole("menuitemcheckbox", { name: "id" }),
    ).toHaveAttribute("aria-disabled", "true");
    await user.click(screen.getByRole("menuitemcheckbox", { name: "id" }));
    expect(screen.getByRole("menuitemcheckbox", { name: "id" })).toBeChecked();
    expect(setSelectedColumns).not.toHaveBeenCalled();
    await user.keyboard("{Escape}");
    await user.click(
      screen.getByRole("button", {
        name: "Edit displayed columns for customers",
      }),
    );
    expect(
      screen.getByRole("menuitemcheckbox", { name: "name" }),
    ).toBeChecked();
    await waitFor(() =>
      expect(screen.getByRole("menu")).toHaveStyle({ pointerEvents: "auto" }),
    );
    await user.click(
      screen.getByRole("menuitemcheckbox", { name: "Select all" }),
    );
    expect(screen.getByRole("menuitem", { name: "Apply" })).toBeVisible();
    await user.keyboard("{End}{Enter}");
    expect(setSelectedColumns).toHaveBeenCalledWith(["id"]);
  });

  it("cancels filter edits and applies complete filters without the trailing empty row", async () => {
    const user = userEvent.setup();
    const { setCondition, removeCondition } = renderNavigator();
    await user.click(
      screen.getByRole("button", { name: "Add filter for customers" }),
    );
    await user.type(
      screen.getByRole("textbox", { name: "Filter value" }),
      "42",
    );
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(setCondition).not.toHaveBeenCalled();
    expect(removeCondition).not.toHaveBeenCalled();
    await user.click(
      screen.getByRole("button", { name: "Add filter for customers" }),
    );
    expect(screen.getByRole("textbox", { name: "Filter value" })).toHaveValue(
      "",
    );
    await user.type(
      screen.getByRole("textbox", { name: "Filter value" }),
      "43",
    );
    await user.click(screen.getByRole("button", { name: "Apply" }));
    expect(setCondition).toHaveBeenCalledWith({
      operator: ConditionOperator.AND,
      conditions: [
        { column: "id", operator: ConditionOperator.EQUALS, value: "43" },
      ],
    });
  });

  it("keeps incomplete filters open while choosing columns and operators, and cancels deletions", async () => {
    const user = userEvent.setup();
    const { setCondition, removeCondition } = renderNavigator();
    await user.click(
      screen.getByRole("button", { name: "Add filter for customers" }),
    );
    await user.click(await screen.findByRole("option", { name: "name" }));
    await user.click(screen.getByRole("option", { name: "in" }));
    await user.type(
      screen.getByRole("textbox", { name: "Filter values" }),
      "Ada{Enter}",
    );
    await user.click(screen.getByRole("button", { name: "Delete filter" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(setCondition).not.toHaveBeenCalled();
    expect(removeCondition).not.toHaveBeenCalled();

    await user.click(
      screen.getByRole("button", { name: "Add filter for customers" }),
    );
    await user.click(screen.getByRole("button", { name: "Delete filter" }));
    await user.click(screen.getByRole("button", { name: "Apply" }));
    expect(removeCondition).toHaveBeenCalledOnce();
  });
});
