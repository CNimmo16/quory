import { type ComponentProps } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  ConditionOperator,
  type DatabaseSchema,
  type PreparedQuery,
} from "@quory/core";
import TableNavigator from "./TableNavigator";
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

function renderNavigator() {
  type JoinActions = ComponentProps<typeof TableNavigator>["joinActions"];
  const setSelectedColumns = vi.fn();
  const setCondition = vi.fn();
  const removeCondition = vi.fn();
  const joinActions = vi.fn<JoinActions>().mockReturnValue({
    join: query.base,
    getChildren: () => [],
    getParent: () => undefined,
    getVisibleColumns: () => ["id", "name"],
    setSelectedColumns,
    setCondition,
    removeCondition,
    orderBy: vi.fn(),
    removeJoin: vi.fn(),
    addJoin: vi.fn(),
    addJoinOnForeignKey: vi.fn(),
    addJoinOnForeignKeyReference: vi.fn(),
    hasCondition: () => false,
  });
  render(
    <TooltipProvider>
      <TableNavigator
        padding={20}
        width={1000}
        query={query}
        schemas={schemas}
        joinActions={joinActions}
        onHeightChange={vi.fn()}
        highlightedJoinAlias={null}
        onChangeHighlightedJoinAlias={vi.fn()}
        onDeleteQuery={vi.fn()}
      />
    </TooltipProvider>
  );
  return { setSelectedColumns, setCondition, removeCondition };
}

describe("TableNavigator", () => {
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
    await user.click(screen.getByRole("button", { name: "Add filter" }));
    await user.type(
      screen.getByRole("textbox", { name: "Filter value" }),
      "42"
    );
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(setCondition).not.toHaveBeenCalled();
    expect(removeCondition).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Add filter" }));
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
    await user.click(screen.getByRole("button", { name: "Add filter" }));
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

    await user.click(screen.getByRole("button", { name: "Add filter" }));
    await user.click(screen.getByRole("button", { name: "Delete filter" }));
    await user.click(screen.getByRole("button", { name: "Apply" }));
    expect(removeCondition).toHaveBeenCalledOnce();
  });
});
