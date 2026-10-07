import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { TablePicker } from "./TablePicker";

it("searches grouped tables, selects with the keyboard and allows choosing a different table", async () => {
  const user = userEvent.setup();
  const change = vi.fn();
  function Picker() {
    const [value, setValue] = useState<string | null>(null);
    return (
      <>
        <label htmlFor="tables">Base table</label>
        <TablePicker
          id="tables"
          groups={[
            {
              name: "public",
              tables: [{ name: "customers" }, { name: "orders" }],
            },
            { name: "audit", tables: [{ name: "customers" }] },
          ]}
          value={value}
          onChange={(next) => {
            change(next);
            setValue(next);
          }}
          maxHeight={400}
        />
      </>
    );
  }
  render(<Picker />);
  await user.type(
    screen.getByRole("combobox", { name: "Search tables" }),
    "audit."
  );
  expect(screen.getAllByRole("option")).toHaveLength(1);
  await user.keyboard("{Enter}");
  expect(change).toHaveBeenLastCalledWith("audit.customers");
  expect(
    screen.getByRole("combobox", { name: "Base table" })
  ).toHaveTextContent("customers");
  await user.click(screen.getByRole("combobox", { name: "Base table" }));
  await user.type(
    screen.getByRole("combobox", { name: "Search tables" }),
    "missing"
  );
  expect(screen.getByText("No tables found.")).toBeVisible();
  await user.clear(screen.getByRole("combobox", { name: "Search tables" }));
  await user.click(screen.getByRole("option", { name: "orders" }));
  expect(change).toHaveBeenLastCalledWith("public.orders");
});
