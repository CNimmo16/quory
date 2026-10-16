import { useState } from "react";
import { render, screen } from "@testing-library/react";
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
