import { type ComponentProps } from "react";
import {
  createEvent,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { ConditionOperator } from "@quory/core";
import DataTable from "./DataTable";
import { TooltipProvider } from "./ui/tooltip";

type Props = ComponentProps<typeof DataTable>;
function fixture() {
  const visibleJoins: Props["visibleJoins"] = ["customers", "orders"].map(
    (tableName) => ({
      join: {
        tableRef: `public.${tableName}`,
        joinAlias: tableName,
        select: ["id", "name", "notes"],
        resultAliases: {},
        joins: [],
      },
      table: { schemaName: "public", name: tableName, columns: [] },
      foreignKeyReferences: [],
      columns: ["name", "notes"].map((name) => ({
        name,
        readableName: name,
        isPrimaryKey: false,
      })),
    })
  );
  const rows: Props["rows"] = [
    "[1,23]",
    "[1,23]",
    "[12,3]",
    "[12,3]",
    "[1,23]",
  ].map((key, index) =>
    visibleJoins.map(({ join }, joinIndex) =>
      ["id", "name", "notes"].map((name) => ({
        joinAlias: join.joinAlias,
        recordKey: joinIndex === 0 ? key : `[${index}]`,
        isPrimary: name === "id",
        type: "text",
        rawField: name,
        readableField: name,
        rawValue:
          name === "id"
            ? index
            : name === "name"
            ? "Same display name"
            : "A longer note that can be inspected in full",
        readableValue:
          name === "id"
            ? String(index)
            : name === "name"
            ? "Same display name"
            : "A longer note that can be inspected in full",
        foreignKey: undefined,
      }))
    )
  );
  const actions = {
    join: visibleJoins[0]!.join,
    getChildren: () => [],
    getParent: () => undefined,
    getVisibleColumns: () => [],
    setSelectedColumns: vi.fn(),
    setCondition: vi.fn(),
    removeCondition: vi.fn(),
    orderBy: vi.fn(),
    removeJoin: vi.fn(),
    addJoin: vi.fn(),
    addJoinOnForeignKey: vi.fn(),
    addJoinOnForeignKeyReference: vi.fn(),
    hasCondition: () => false,
  };
  return {
    visibleJoins,
    rows,
    actions,
    joinActions: vi
      .fn<NonNullable<Props["joinActions"]>>()
      .mockReturnValue(actions),
  };
}
function show(data = fixture()) {
  const result = render(
    <TooltipProvider>
      <DataTable
        width={400}
        height={320}
        highlightedJoinAlias={null}
        onChangeHighlightedJoinAlias={vi.fn()}
        rows={data.rows}
        visibleJoins={data.visibleJoins}
        joinActions={data.joinActions}
      />
    </TooltipProvider>
  );
  return { ...data, ...result };
}

it("merges consecutive records across every column using hidden composite keys, preserving separate records and row order", () => {
  show();
  const rows = screen.getAllByRole("row").slice(2);
  const cells = rows.map((row) => within(row).getAllByRole("cell"));
  expect(cells.map((row) => row.length)).toEqual([4, 2, 4, 2, 4]);
  expect(
    cells.map((row) => row.map((cell) => cell.getAttribute("rowspan")))
  ).toEqual([
    ["2", "2", "1", "1"],
    ["1", "1"],
    ["2", "2", "1", "1"],
    ["1", "1"],
    ["1", "1", "1", "1"],
  ]);
  expect(
    screen.getAllByRole("button", {
      name: "customers, name: Same display name",
    })
  ).toHaveLength(3);
  expect(
    screen.queryByText("Same marker, same record within a table")
  ).not.toBeInTheDocument();
});

it("does not group matching display values without a complete primary key", () => {
  const data = fixture();
  data.rows.forEach((row) =>
    row.forEach((cells) =>
      cells.forEach((cell) => {
        cell.recordKey = null;
      })
    )
  );
  show(data);
  expect(
    screen.queryByText("Same marker, same record within a table")
  ).not.toBeInTheDocument();
  expect(
    screen
      .getAllByRole("cell")
      .every((cell) => cell.getAttribute("rowspan") === "1")
  ).toBe(true);
});

it("merges each table independently even when all cells in a following row are covered by spans", () => {
  const data = fixture();
  const orderKeys = ["[1,23]", "[1,23]", "[1,23]", "[12,3]", "[12,3]"];
  data.rows.forEach((row, index) =>
    row[1]!.forEach((cell) => {
      cell.recordKey = orderKeys[index]!;
    })
  );
  show(data);
  const cells = screen
    .getAllByRole("row")
    .slice(2)
    .map((row) => within(row).queryAllByRole("cell"));
  expect(
    cells.map((row) => row.map((cell) => cell.getAttribute("rowspan")))
  ).toEqual([["2", "2", "3", "3"], [], ["2", "2"], ["2", "2"], ["1", "1"]]);
  expect(screen.getByText("5 rows")).toBeVisible();
});

it("keeps sorting and hiding columns accessible, including protecting the last visible column", async () => {
  const user = userEvent.setup();
  const data = fixture();
  data.visibleJoins[1]!.columns = [data.visibleJoins[1]!.columns[0]!];
  const { actions } = show(data);
  await user.click(screen.getAllByRole("button", { name: "Sort by name" })[0]!);
  expect(actions.orderBy).toHaveBeenCalledWith(
    [{ column: "name", direction: "asc" }],
    { clearAllExistingOrders: true }
  );
  await user.click(
    screen.getAllByRole("button", { name: "Options for name" })[0]!
  );
  await user.click(screen.getByRole("menuitem", { name: "Hide column" }));
  expect(actions.setSelectedColumns).toHaveBeenCalledWith(["notes"]);
  await user.click(
    screen.getAllByRole("button", { name: "Options for name" })[1]!
  );
  expect(screen.getByRole("menuitem", { name: "Hide column" })).toHaveAttribute(
    "aria-disabled",
    "true"
  );
});

it("inspects full cell values without expanding the grid and adds a filter using the raw value", async () => {
  const user = userEvent.setup();
  const data = fixture();
  data.visibleJoins[0]!.join.where = {
    column: "notes",
    operator: ConditionOperator.IN,
    values: ["first", "second"],
  };
  data.rows[0]![0]![1]!.rawValue = "original-name";
  const { actions } = show(data);
  await user.click(
    screen.getAllByRole("button", {
      name: "customers, name: Same display name",
    })[0]!
  );
  expect(screen.getByRole("dialog")).toHaveTextContent("Same display name");
  await user.click(
    screen.getByRole("button", { name: "Filter on this value" })
  );
  expect(actions.setCondition).toHaveBeenCalledWith({
    operator: ConditionOperator.AND,
    conditions: [
      data.visibleJoins[0]!.join.where,
      {
        column: "name",
        operator: ConditionOperator.EQUALS,
        value: "original-name",
      },
    ],
  });
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  await user.click(
    screen.getAllByRole("button", {
      name: "customers, name: Same display name",
    })[0]!
  );
  fireEvent.scroll(
    screen.getByRole("region", { name: "Scrollable query results" })
  );
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

it("follows foreign keys and safely displays empty values", async () => {
  const user = userEvent.setup();
  const data = fixture();
  data.rows[0]![0]![1]!.foreignKey = {
    foreignColumnName: "id",
    foreignTableName: "people",
    foreignSchemaName: "public",
    hasForeignKeyConstraint: true,
    confidence: 1,
  };
  data.rows[0]![0]![2]!.readableValue = "";
  const { actions } = show(data);
  await user.click(
    screen.getByRole("button", {
      name: "Follow relationship from customers, name: Same display name",
    })
  );
  expect(actions.addJoinOnForeignKey).toHaveBeenCalledWith(
    "name",
    "Same display name"
  );
  await user.click(screen.getByRole("button", { name: "customers, notes:" }));
  expect(screen.getByRole("dialog")).toHaveTextContent("Empty value");
});

it("opens the column selector from the result header and applies the selection", async () => {
  const user = userEvent.setup();
  const data = fixture();
  data.visibleJoins[0]!.table.columns = ["id", "name", "notes"].map((name) => ({
    name,
    dataType: "text",
    genericDataType: "text",
    isNullable: false,
    includedInPrimaryKey: name === "id",
    foreignKeys: [],
    foreignKeyReferences: [],
  }));
  const { actions } = show(data);
  await user.click(
    screen.getByRole("button", { name: "Edit displayed columns for customers" })
  );
  expect(
    screen.getByRole("menuitemcheckbox", { name: "name" })
  ).toHaveAttribute("aria-checked", "true");
  await user.click(screen.getByRole("menuitemcheckbox", { name: "notes" }));
  expect(actions.setSelectedColumns).not.toHaveBeenCalled();
  await user.click(screen.getByRole("menuitemcheckbox", { name: "id" }));
  await user.click(screen.getByRole("menuitem", { name: "Apply" }));
  expect(actions.setSelectedColumns).toHaveBeenCalledWith(["name", "id"]);
});

it("reorders headers and matching cells during dragging, without repeating the swap on drop", () => {
  show();
  const handle = screen.getByRole("button", { name: "Reorder orders table" });
  const target = screen
    .getByRole("button", { name: "Reorder customers table" })
    .closest("th")!;
  expect(handle).toHaveAttribute("draggable", "true");
  expect(
    screen.getByRole("button", { name: "Edit displayed columns for orders" })
  ).not.toHaveAttribute("draggable");
  const dataTransfer = { setData: vi.fn(), effectAllowed: "", dropEffect: "" };
  fireEvent.dragStart(handle, { dataTransfer });
  vi.spyOn(target, "getBoundingClientRect").mockReturnValue({
    left: 0,
    width: 200,
    right: 200,
    top: 0,
    bottom: 36,
    height: 36,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
  function dragOver(clientX: number) {
    const event = createEvent.dragOver(target, { dataTransfer });
    Object.defineProperty(event, "clientX", { value: clientX });
    fireEvent(target, event);
  }
  dragOver(150);
  expect(screen.getAllByRole("row")[0]!.textContent).toMatch(/^customers/);
  dragOver(50);
  expect(screen.getAllByRole("row")[0]!.textContent).toMatch(/^orders/);
  dragOver(50);
  expect(screen.getAllByRole("row")[0]!.textContent).toMatch(/^orders/);
  fireEvent.drop(target, { dataTransfer });
  expect(screen.getAllByRole("row")[0]!.textContent).toMatch(/^orders/);
  expect(screen.getAllByRole("cell")[0]).toHaveAttribute("rowspan", "1");
  expect(screen.getAllByRole("cell")[2]).toHaveAttribute("rowspan", "2");
  fireEvent.keyDown(handle, { key: "ArrowRight" });
  expect(screen.getAllByRole("row")[0]!.textContent).toMatch(/^customers/);
});

it("renders flat results with duplicate headers, nulls and scalars using shared cell inspection", async () => {
  const user = userEvent.setup();
  render(
    <DataTable
      columns={["value", "value", "active", "empty"]}
      rows={[
        ["First", 42, false, ""],
        ["First", null, true, ""],
      ]}
    />
  );
  expect(screen.getAllByRole("columnheader", { name: "value" })).toHaveLength(
    2
  );
  expect(screen.getAllByRole("row")).toHaveLength(3);
  expect(screen.getAllByRole("cell").map((cell) => cell.textContent)).toEqual([
    "First",
    "42",
    "false",
    "",
    "First",
    "NULL",
    "true",
    "",
  ]);
  expect(
    screen
      .getAllByRole("cell")
      .every((cell) => cell.getAttribute("rowspan") === "1")
  ).toBe(true);
  expect(
    screen.queryByRole("button", {
      name: /Sort by|Options for|Reorder|Follow relationship/,
    })
  ).not.toBeInTheDocument();
  expect(
    screen
      .getAllByRole("columnheader")
      .every((header) => !header.hasAttribute("aria-sort"))
  ).toBe(true);
  await user.click(screen.getByRole("button", { name: "value: 42" }));
  expect(screen.getByRole("dialog")).toHaveTextContent("42");
  expect(
    screen.queryByRole("button", { name: "Filter on this value" })
  ).not.toBeInTheDocument();
  await user.keyboard("{Escape}");
  await user.click(screen.getAllByRole("button", { name: "empty:" })[0]!);
  expect(screen.getByRole("dialog")).toHaveTextContent("Empty value");
});

it("keeps flat results visible while loading and shares result summaries and empty states", () => {
  const { rerender } = render(
    <DataTable columns={["name"]} rows={[["Previous result"]]} />
  );
  rerender(
    <DataTable
      columns={["name"]}
      rows={[["Previous result"]]}
      isLoading
      summary={<span>12 ms</span>}
    />
  );
  expect(screen.getByRole("status")).toHaveTextContent("Running query");
  expect(screen.getByRole("table")).toHaveTextContent("Previous result");
  expect(screen.getByText("12 ms")).toBeVisible();
  rerender(
    <DataTable
      columns={[]}
      rows={[]}
      summary={<span>3 affected rows</span>}
      emptyMessage="Statement completed."
    />
  );
  expect(screen.getByText("Statement completed.")).toBeVisible();
  expect(screen.getByText("3 affected rows")).toBeVisible();
});

it("embeds the table without a duplicate results header while retaining its cells", () => {
  render(<DataTable embedded columns={["name"]} rows={[["Order"]]} />);
  expect(screen.getByRole("table")).toHaveTextContent("Order");
  expect(screen.queryByText("Results")).not.toBeInTheDocument();
  expect(screen.queryByText("1 rows")).not.toBeInTheDocument();
});
