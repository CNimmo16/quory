import { useState } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import {
  ConditionOperator,
  type Condition,
  type DatabaseTableInfo,
} from "@quory/core";
import ConditionEditor from "./ConditionEditor";

it("converts scalar filters to editable lists and back without losing the column", async () => {
  const user = userEvent.setup();
  const change = vi.fn();
  const columns: DatabaseTableInfo["columns"] = [
    {
      name: "name",
      dataType: "text",
      genericDataType: "text",
      isNullable: false,
      includedInPrimaryKey: false,
      foreignKeys: [],
      foreignKeyReferences: [],
    },
  ];
  function Editor() {
    const [condition, setCondition] = useState<Condition>({
      column: "name",
      operator: ConditionOperator.EQUALS,
      value: "Ada",
    });
    return (
      <ConditionEditor
        columns={columns}
        condition={condition}
        onConditionChange={(next) => {
          change(next);
          setCondition(next);
        }}
        maxDropdownHeight={400}
      />
    );
  }
  render(<Editor />);
  await user.click(screen.getByRole("combobox", { name: "Filter operator" }));
  await user.click(screen.getByRole("option", { name: "in" }));
  expect(change).toHaveBeenLastCalledWith({
    column: "name",
    operator: ConditionOperator.IN,
    values: ["Ada"],
  });
  await user.type(
    screen.getByRole("textbox", { name: "Filter values" }),
    "Grace{Enter}Ada,",
  );
  expect(change).toHaveBeenLastCalledWith({
    column: "name",
    operator: ConditionOperator.IN,
    values: ["Ada", "Grace"],
  });
  await user.paste("Linus, Margaret");
  await user.click(screen.getByRole("button", { name: "Remove Ada" }));
  expect(change).toHaveBeenLastCalledWith({
    column: "name",
    operator: ConditionOperator.IN,
    values: ["Grace", "Linus", "Margaret"],
  });
  await user.click(screen.getByRole("textbox", { name: "Filter values" }));
  await user.keyboard("{Backspace}");
  await user.type(
    screen.getByRole("textbox", { name: "Filter values" }),
    "Alan",
  );
  await user.tab();
  expect(change).toHaveBeenLastCalledWith({
    column: "name",
    operator: ConditionOperator.IN,
    values: ["Grace", "Linus", "Alan"],
  });
  await user.click(screen.getByRole("combobox", { name: "Filter operator" }));
  await user.click(screen.getByRole("option", { name: "=" }));
  expect(screen.getByRole("textbox", { name: "Filter value" })).toHaveValue("");
  expect(change).toHaveBeenLastCalledWith({
    column: "name",
    operator: ConditionOperator.EQUALS,
    value: "",
  });
});

const columns: DatabaseTableInfo["columns"] = ["name", "id"].map((name) => ({
  name,
  dataType: "text",
  genericDataType: "text",
  isNullable: true,
  includedInPrimaryKey: false,
  foreignKeys: [],
  foreignKeyReferences: [],
}));
const x: Condition = {
  column: "name",
  operator: ConditionOperator.EQUALS,
  value: "Ada",
};
const z: Condition = { column: "name", operator: ConditionOperator.IS_NULL };

function renderEditor(initial: Condition) {
  const change = vi.fn();
  const apply = vi.fn();
  function Editor() {
    const [condition, setCondition] = useState(initial);
    return (
      <ConditionEditor
        columns={columns}
        condition={condition}
        onConditionChange={(next) => {
          change(next);
          setCondition(next);
        }}
        maxDropdownHeight={400}
        onApply={apply}
      />
    );
  }
  render(<Editor />);
  return { change, apply };
}

it("switches scalar/list/null operators without retaining incompatible values and applies null checks by keyboard", async () => {
  const user = userEvent.setup();
  const { change, apply } = renderEditor({
    column: "name",
    operator: ConditionOperator.IN,
    values: ["Ada"],
  });
  async function operator(name: string) {
    await user.click(screen.getByRole("combobox", { name: "Filter operator" }));
    await user.click(screen.getByRole("option", { name }));
  }
  await operator("is null");
  expect(change).toHaveBeenLastCalledWith({
    column: "name",
    operator: ConditionOperator.IS_NULL,
  });
  expect(
    screen.queryByRole("textbox", { name: /Filter value/ }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("combobox", { name: "Filter operator" }),
  ).toHaveFocus();
  await user.keyboard("{Enter}");
  expect(apply).toHaveBeenLastCalledWith({
    column: "name",
    operator: ConditionOperator.IS_NULL,
  });
  await operator("is not null");
  expect(change).toHaveBeenLastCalledWith({
    column: "name",
    operator: ConditionOperator.IS_NOT_NULL,
  });
  await operator("=");
  expect(change).toHaveBeenLastCalledWith({
    column: "name",
    operator: ConditionOperator.EQUALS,
    value: "",
  });
  expect(screen.getByRole("textbox", { name: "Filter value" })).toHaveFocus();
  await user.type(
    screen.getByRole("textbox", { name: "Filter value" }),
    "Grace",
  );
  await operator("is null");
  await operator("in");
  expect(change).toHaveBeenLastCalledWith({
    column: "name",
    operator: ConditionOperator.IN,
    values: [],
  });
  expect(screen.getByRole("textbox", { name: "Filter values" })).toHaveFocus();
});

it("creates (X AND Y) OR Z, applies from a nested row, and deletes a group independently", async () => {
  const user = userEvent.setup();
  const { change, apply } = renderEditor({
    operator: ConditionOperator.AND,
    conditions: [x, z],
  });
  expect(change).not.toHaveBeenCalled();
  await user.click(
    screen.getByRole("combobox", { name: "Filter group operator" }),
  );
  await user.click(screen.getByRole("option", { name: "OR" }));
  expect(
    screen.getByRole("combobox", { name: "Filter group operator" }),
  ).toHaveFocus();
  await user.click(
    screen.getAllByRole("button", { name: "Wrap filter in group" })[0]!,
  );
  const nested = screen.getAllByRole("group", { name: "Filter group" })[1]!;
  expect(
    within(nested).getByRole("combobox", { name: "Filter group operator" }),
  ).toHaveTextContent("AND");
  await user.click(within(nested).getByRole("button", { name: "Add filter" }));
  expect(
    await screen.findByRole("combobox", { name: "Search columns" }),
  ).toHaveFocus();
  await user.keyboard("id{Enter}");
  expect(
    await screen.findByRole("combobox", { name: "Search operators" }),
  ).toHaveFocus();
  await user.keyboard(">{Enter}");
  const values = within(nested).getAllByRole("textbox", {
    name: "Filter value",
  });
  await user.type(values[1]!, "10{Enter}");
  const expected = {
    operator: ConditionOperator.OR,
    conditions: [
      {
        operator: ConditionOperator.AND,
        conditions: [
          x,
          {
            column: "id",
            operator: ConditionOperator.GREATER_THAN,
            value: "10",
          },
        ],
      },
      z,
    ],
  };
  expect(change).toHaveBeenLastCalledWith(expected);
  expect(apply).toHaveBeenLastCalledWith(expected);
  expect(
    screen.getAllByRole("combobox", { name: "Filter column" }),
  ).toHaveLength(3);
  await user.click(
    within(nested).getByRole("button", { name: "Delete group" }),
  );
  expect(change).toHaveBeenLastCalledWith({
    operator: ConditionOperator.OR,
    conditions: [z],
  });
});

it("adds a group explicitly, focuses its first filter, and allows an empty group to be deleted", async () => {
  const user = userEvent.setup();
  const { change } = renderEditor({
    operator: ConditionOperator.AND,
    conditions: [x],
  });
  await user.click(screen.getByRole("button", { name: "Add group" }));
  expect(
    await screen.findByRole("combobox", { name: "Search columns" }),
  ).toHaveFocus();
  expect(change).toHaveBeenLastCalledWith({
    operator: ConditionOperator.AND,
    conditions: [
      x,
      {
        operator: ConditionOperator.AND,
        conditions: [
          { column: "", operator: ConditionOperator.EQUALS, value: "" },
        ],
      },
    ],
  });
  await user.keyboard("{Escape}");
  const nested = screen.getAllByRole("group", { name: "Filter group" })[1]!;
  await user.click(
    within(nested).getByRole("button", { name: "Delete filter" }),
  );
  expect(
    within(nested).queryByRole("combobox", { name: "Filter column" }),
  ).not.toBeInTheDocument();
  await user.click(
    within(nested).getByRole("button", { name: "Delete group" }),
  );
  expect(change).toHaveBeenLastCalledWith({
    operator: ConditionOperator.AND,
    conditions: [x],
  });
});
