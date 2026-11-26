import { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { TablePicker } from "./TablePicker";

it("resets search scroll even when the first result stays selected and after clearing", async () => {
  const user = userEvent.setup();
  render(
    <TablePicker
      id="tables"
      groups={[
        {
          name: "public",
          tables: Array.from({ length: 60 }, (_, index) => ({
            name: `table_${String(index).padStart(2, "0")}`,
          })),
        },
      ]}
      value={null}
      onChange={vi.fn()}
      maxHeight={320}
    />,
  );
  const search = screen.getByRole("combobox", { name: "Search tables" });
  const list = screen.getByRole("listbox");
  await user.type(search, "table_");
  const first = screen.getAllByRole("option")[0]!;
  list.scrollTop = 900;
  await user.keyboard("{Backspace}");
  expect(first).toHaveAttribute("aria-selected", "true");
  await waitFor(() => expect(list.scrollTop).toBe(0));
  expect(search).toHaveFocus();

  const last = screen.getAllByRole("option").at(-1)!;
  const scroll = vi.spyOn(last, "scrollIntoView").mockImplementation(() => {
    list.scrollTop = 900;
  });
  await user.keyboard("{End}");
  expect(scroll).toHaveBeenCalled();
  await user.clear(search);
  await waitFor(() => expect(list.scrollTop).toBe(0));
  scroll.mockRestore();
  expect(search).toHaveFocus();

  await new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  );
  list.scrollTop = 300;
  await user.keyboard("{ArrowDown}");
  expect(list.scrollTop).toBe(300);
});

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
    "audit.",
  );
  expect(screen.getAllByRole("option")).toHaveLength(1);
  await user.keyboard("{Enter}");
  expect(change).toHaveBeenLastCalledWith("audit.customers");
  expect(
    screen.getByRole("combobox", { name: "Base table" }),
  ).toHaveTextContent("customers");
  await user.click(screen.getByRole("combobox", { name: "Base table" }));
  await user.type(
    screen.getByRole("combobox", { name: "Search tables" }),
    "missing",
  );
  expect(screen.getByText("No tables found.")).toBeVisible();
  await user.clear(screen.getByRole("combobox", { name: "Search tables" }));
  await user.click(screen.getByRole("option", { name: "orders" }));
  expect(change).toHaveBeenLastCalledWith("public.orders");
});

it.each(["user", "USER", "public.user"])(
  "ranks the exact table first for %j across schemas and selects it with Enter",
  async (search) => {
    const change = vi.fn();
    const user = userEvent.setup();
    render(
      <TablePicker
        id="tables"
        groups={[
          {
            name: "audit",
            tables: [{ name: "user_events" }, { name: "superuser" }],
          },
          {
            name: "public",
            tables: [
              { name: "users" },
              { name: "user_settings" },
              { name: "user" },
            ],
          },
        ]}
        value={null}
        onChange={change}
        maxHeight={400}
      />,
    );
    await user.type(
      screen.getByRole("combobox", { name: "Search tables" }),
      search,
    );
    expect(screen.getAllByRole("option")[0]).toHaveTextContent(/^user$/);
    expect(screen.getByRole("option", { name: "user_settings" })).toBeVisible();
    await user.keyboard("{Enter}");
    expect(change).toHaveBeenCalledWith("public.user");
  },
);
