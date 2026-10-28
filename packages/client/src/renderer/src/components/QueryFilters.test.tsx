import { type ComponentProps } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { ConditionOperator as Op, type Condition } from "@quory/core";
import {
  QueryFilterPopover,
  countFilters,
  formatCondition,
} from "./QueryFilters";

const x: Condition = { column: "name", operator: Op.EQUALS, value: "Ada" };
const nested: Condition = {
  operator: Op.OR,
  conditions: [
    {
      operator: Op.AND,
      conditions: [x, { column: "id", operator: Op.IS_NOT_NULL }],
    },
    { column: "name", operator: Op.IS_NULL },
  ],
};

function renderPopover(where: Condition) {
  const setCondition = vi.fn();
  const removeCondition = vi.fn();
  const joinActions = vi.fn(() => ({
    setCondition,
    removeCondition,
  })) as unknown as ComponentProps<typeof QueryFilterPopover>["joinActions"];
  render(
    <QueryFilterPopover
      join={{
        tableRef: "main.people",
        joinAlias: "people",
        select: ["id"],
        resultAliases: {},
        joins: [],
        where,
      }}
      columns={["id", "name"].map((name) => ({
        name,
        dataType: "text",
        genericDataType: "text",
        isNullable: true,
        includedInPrimaryKey: false,
        foreignKeys: [],
        foreignKeyReferences: [],
      }))}
      joinActions={joinActions}
    >
      <button>Edit filters</button>
    </QueryFilterPopover>,
  );
  return { setCondition, removeCondition };
}

it("counts leaves and formats grouped null checks without phantom values", () => {
  expect(countFilters(nested)).toBe(3);
  expect(formatCondition(nested)).toBe(
    '(name = "Ada" AND id IS NOT NULL) OR name IS NULL',
  );
});

it("retains nested drafts on validation errors and applies after they are completed", async () => {
  const user = userEvent.setup();
  const { setCondition, removeCondition } = renderPopover(nested);
  await user.click(screen.getByRole("button", { name: "Edit filters" }));
  const group = screen.getAllByRole("group", { name: "Filter group" })[1]!;
  await user.clear(
    within(group).getByRole("textbox", { name: "Filter value" }),
  );
  await user.click(screen.getByRole("button", { name: "Apply" }));
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Complete the filter for name",
  );
  expect(setCondition).not.toHaveBeenCalled();
  expect(removeCondition).not.toHaveBeenCalled();
  await user.type(
    within(group).getByRole("textbox", { name: "Filter value" }),
    "Grace",
  );
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Apply" }));
  expect(setCondition).toHaveBeenCalledWith({
    operator: Op.OR,
    conditions: [
      {
        operator: Op.AND,
        conditions: [
          { ...x, value: "Grace" },
          { column: "id", operator: Op.IS_NOT_NULL },
        ],
      },
      { column: "name", operator: Op.IS_NULL },
    ],
  });
});

it("ignores untouched nested groups and cancels edits without changing applied filters", async () => {
  const user = userEvent.setup();
  const { setCondition, removeCondition } = renderPopover(nested);
  await user.click(screen.getByRole("button", { name: "Edit filters" }));
  await user.click(
    screen.getAllByRole("button", { name: "Add group" }).at(-1)!,
  );
  await user.keyboard("{Escape}");
  await user.click(screen.getByRole("button", { name: "Apply" }));
  expect(setCondition).toHaveBeenLastCalledWith(nested);
  setCondition.mockClear();
  await user.click(screen.getByRole("button", { name: "Edit filters" }));
  await user.click(screen.getByRole("button", { name: "Delete group" }));
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  expect(setCondition).not.toHaveBeenCalled();
  expect(removeCondition).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Edit filters" }));
  expect(screen.getByRole("textbox", { name: "Filter value" })).toHaveValue(
    "Ada",
  );
});

it("clears the filter when its last nested group is emptied", async () => {
  const user = userEvent.setup();
  const { removeCondition, setCondition } = renderPopover({
    operator: Op.OR,
    conditions: [{ operator: Op.AND, conditions: [x] }],
  });
  await user.click(screen.getByRole("button", { name: "Edit filters" }));
  await user.click(screen.getByRole("button", { name: "Delete filter" }));
  await user.click(screen.getByRole("button", { name: "Apply" }));
  expect(removeCondition).toHaveBeenCalledOnce();
  expect(setCondition).not.toHaveBeenCalled();
});
