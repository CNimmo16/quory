import { type ComponentProps } from "react";
import { render, screen, within } from "@testing-library/react";
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
  navigatorSchemas = schemas
) {
  type JoinActions = ComponentProps<typeof TableNavigator>["joinActions"];
  const setSelectedColumns = vi.fn();
  const setCondition = vi.fn();
  const removeCondition = vi.fn();
  const addJoin = vi.fn();
  const joinActions = vi.fn<JoinActions>().mockReturnValue({
    join: navigatorQuery.base,
    getChildren: () => [],
    getParent: () => undefined,
    getVisibleColumns: () => navigatorQuery.base.select,
    setSelectedColumns,
    setCondition,
    removeCondition,
    orderBy: vi.fn(),
    removeJoin: vi.fn(),
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
        onDeleteQuery={vi.fn()}
      />
    </TooltipProvider>
  );
  return { setSelectedColumns, setCondition, removeCondition, addJoin, view };
}

describe("TableNavigator", () => {
  it("closes the add-table popup after adding a table", async () => {
    const user = userEvent.setup();
    const { addJoin } = renderNavigator();
    await user.click(
      screen.getByRole("button", { name: "Add related table to customers" })
    );
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "orders" })
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
      screen.getByRole("button", { name: "Add related table to customers" })
    );
    const popup = screen.getByRole("dialog");
    const search = within(popup).getByRole("searchbox", {
      name: "Filter tables",
    });
    await user.type(search, "phone");
    expect(
      within(popup).queryAllByRole("button", { name: "orders" })
    ).toHaveLength(0);
    await user.clear(search);
    expect(
      within(popup).getAllByRole("button", { name: "orders" })
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
      screen.getByRole("button", { name: "Add related table to customers" })
    );
    const popup = screen.getByRole("dialog");
    const search = within(popup).getByRole("searchbox", {
      name: "Filter tables",
    });
    expect(popup.querySelector("input, button")).toBe(search);
    expect(within(popup).getByRole("button", { name: "orders" })).toBeVisible();
    expect(
      within(popup).getByRole("button", { name: "shipments" })
    ).toBeVisible();
    await user.type(search, "s");
    expect(
      within(popup)
        .getAllByRole("button")
        .filter((button) =>
          ["orders", "shipments"].includes(button.textContent ?? "")
        )
        .map((button) => button.textContent)
    ).toEqual(["orders", "shipments"]);
    await user.clear(search);
    await user.type(search, "SHIP");
    expect(
      within(popup).queryByRole("button", { name: "orders" })
    ).not.toBeInTheDocument();
    expect(
      within(popup).getByRole("button", { name: "shipments" })
    ).toBeVisible();
    await user.click(
      within(popup).getByRole("button", { name: "Clear table search" })
    );
    await user.type(search, "public.orders");
    expect(within(popup).getByRole("button", { name: "orders" })).toBeVisible();
    expect(
      within(popup).queryByRole("button", { name: "shipments" })
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
      true
    );
    const summary = screen.getByRole("region", { name: "Query filters" });
    expect(summary).toHaveTextContent(
      'id > "5" AND (name = "Ada" OR name = "Grace")'
    );
    expect(
      screen.getByRole("button", { name: "Edit 3 filters for customers" })
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
      "Grace"
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
      screen.getByRole("button", { name: "Show columns for customers" })
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
      screen.getByRole("textbox", { name: "Filter values" })
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

  it("keeps at least one column, discards dismissed edits, and applies column choices only on Apply", async () => {
    const user = userEvent.setup();
    const { setSelectedColumns } = renderNavigator();
    await user.click(
      screen.getByRole("button", {
        name: "Edit displayed columns for customers",
      })
    );
    await user.click(screen.getByRole("menuitemcheckbox", { name: "name" }));
    expect(
      screen.getByRole("menuitemcheckbox", { name: "id" })
    ).toHaveAttribute("aria-disabled", "true");
    await user.click(screen.getByRole("menuitemcheckbox", { name: "id" }));
    expect(screen.getByRole("menuitemcheckbox", { name: "id" })).toBeChecked();
    expect(setSelectedColumns).not.toHaveBeenCalled();
    await user.keyboard("{Escape}");
    await user.click(
      screen.getByRole("button", {
        name: "Edit displayed columns for customers",
      })
    );
    expect(
      screen.getByRole("menuitemcheckbox", { name: "name" })
    ).toBeChecked();
    await user.click(
      screen.getByRole("menuitemcheckbox", { name: "Select all" })
    );
    expect(screen.getByRole("menuitem", { name: "Apply" })).toBeVisible();
    await user.keyboard("{End}{Enter}");
    expect(setSelectedColumns).toHaveBeenCalledWith(["id"]);
  });

  it("cancels filter edits and applies complete filters without the trailing empty row", async () => {
    const user = userEvent.setup();
    const { setCondition, removeCondition } = renderNavigator();
    await user.click(
      screen.getByRole("button", { name: "Add filter for customers" })
    );
    await user.type(
      screen.getByRole("textbox", { name: "Filter value" }),
      "42"
    );
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(setCondition).not.toHaveBeenCalled();
    expect(removeCondition).not.toHaveBeenCalled();
    await user.click(
      screen.getByRole("button", { name: "Add filter for customers" })
    );
    expect(screen.getByRole("textbox", { name: "Filter value" })).toHaveValue(
      ""
    );
    await user.type(
      screen.getByRole("textbox", { name: "Filter value" }),
      "43"
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
      screen.getByRole("button", { name: "Add filter for customers" })
    );
    await user.click(screen.getByRole("combobox", { name: "Filter column" }));
    await user.click(screen.getByRole("option", { name: "name" }));
    await user.click(screen.getByRole("combobox", { name: "Filter operator" }));
    await user.click(screen.getByRole("option", { name: "in" }));
    await user.type(
      screen.getByRole("textbox", { name: "Filter values" }),
      "Ada{Enter}"
    );
    await user.click(screen.getByRole("button", { name: "Delete filter" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(setCondition).not.toHaveBeenCalled();
    expect(removeCondition).not.toHaveBeenCalled();

    await user.click(
      screen.getByRole("button", { name: "Add filter for customers" })
    );
    await user.click(screen.getByRole("button", { name: "Delete filter" }));
    await user.click(screen.getByRole("button", { name: "Apply" }));
    expect(removeCondition).toHaveBeenCalledOnce();
  });
});
