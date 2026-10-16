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
    addJoinOnForeignKeyReference: vi.fn(),
    hasCondition: () => false,
  });
  const view = render(
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
    </TooltipProvider>,
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
  it("removes joined tables directly and provides no delete action on the base table", async () => {
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
    expect(
      within(base).queryByRole("button", {
        name: /Remove .* from query|Delete query|Actions for/,
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Actions for/ }),
    ).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Remove orders from query" }),
    );
    expect(removeJoin).toHaveBeenCalledOnce();
  });

  it("keeps removal disabled for implicit tables needed to connect descendants", async () => {
    const { removeJoin } = renderNavigator({
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
    expect(
      screen.getByRole("button", { name: "Remove orders from query" }),
    ).toBeDisabled();
    expect(removeJoin).not.toHaveBeenCalled();
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
    expect(addJoin).toHaveBeenCalledWith("public.order_items");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("navigates results with arrows, skips already joined tables and ignores Enter with no matches", async () => {
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
    expect(screen.getByRole("option", { name: "orders" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(screen.getByRole("option", { name: "order_items" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await user.keyboard("{ArrowDown}");
    expect(
      screen.getByRole("option", { name: "order_archive" }),
    ).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{ArrowUp}");
    expect(screen.getByRole("option", { name: "order_items" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await user.keyboard("{ArrowDown}{Enter}");
    expect(addJoin).toHaveBeenCalledWith("public.order_archive");
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
    expect(addJoin).toHaveBeenCalledWith("public.orders");
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
    ).toEqual(["orders", "shipments"]);
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
