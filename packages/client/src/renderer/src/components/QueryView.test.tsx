import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import {
  ConditionOperator,
  type Query,
  type PreparedJoinDef,
} from "@quory/core";
import { schemas } from "../../../../test/queryFixtures";
import QueryView from "./QueryView";
import { TooltipProvider } from "./ui/tooltip";

const mocks = vi.hoisted(() => ({ useQuery: vi.fn() }));
vi.mock("@quory/stack/react", () => ({
  useFetchSchema: () => ({ data: { schemas } }),
  useQuery: (...args: unknown[]) => mocks.useQuery(...args),
  useQueryCount: (query: Query | null) => ({
    count: query ? 250 : null,
    isLoading: false,
    error: null,
  }),
}));
vi.mock("./TableNavigator", () => ({
  default: ({ query }: { query: Query }) => (
    <div role="region" aria-label="Query tree">
      Row limit: {query.limit}, offset: {query.offset}
    </div>
  ),
}));
vi.mock("./DataTable", () => ({
  default: ({ isLoading }: { isLoading?: boolean }) => (
    <div>
      {isLoading && <span role="status">Running query…</span>}
      <table aria-label="Query results" />
    </div>
  ),
}));

const initialQuery: Query = {
  base: {
    tableRef: "public.orders",
    select: "*",
    joins: [
      {
        tableRef: "public.users",
        select: [],
        where: {
          column: "email",
          operator: ConditionOperator.EQUALS,
          value: "ada@example.com",
        },
      },
    ],
  },
  limit: 100,
  offset: 0,
};

beforeEach(() => {
  mocks.useQuery.mockReset();
  function prepare(join: Query["base"]): PreparedJoinDef {
    return {
      ...join,
      select: join.select === "*" ? ["id"] : join.select,
      joinAlias: join.tableRef,
      resultAliases: {},
      joins: (join.joins ?? []).map(prepare),
    };
  }
  mocks.useQuery.mockImplementation((query: Query) => ({
    query: { ...query, base: prepare(query.base) },
    data: { rows: Array.from({ length: 100 }, () => []), visibleJoins: [] },
    error: null,
    isLoading: false,
    joinActions: vi.fn(),
    cancel: vi.fn(),
    refetch: vi.fn(),
  }));
});

it("replaces only the tree with current query JSON and preserves edits when switching back", async () => {
  const user = userEvent.setup();
  const onQueryChange = vi.fn();
  const view = (showQueryText: boolean) => (
    <TooltipProvider>
      <QueryView
        initialQuery={{ ...initialQuery, limit: 25, offset: 25 }}
        onQueryChange={onQueryChange}
        onDeleteQuery={vi.fn()}
        showQueryText={showQueryText}
        width={900}
        height={700}
      />
    </TooltipProvider>
  );
  const { rerender } = render(view(false));
  expect(screen.getByRole("region", { name: "Query tree" })).toBeVisible();
  rerender(view(true));
  expect(screen.queryByRole("region", { name: "Query tree" })).toBeNull();
  const rawQuery = screen.getByRole("region", { name: "Raw query (JSON)" });
  expect(JSON.parse(rawQuery.textContent!)).toEqual(initialQuery);
  expect(screen.getByRole("table", { name: "Query results" })).toBeVisible();
  expect(onQueryChange).not.toHaveBeenCalled();

  expect(
    screen.queryByRole("spinbutton", { name: "Rows per page" })
  ).toBeNull();
  expect(screen.queryByRole("button", { name: "Apply page size" })).toBeNull();
  expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
  await user.click(
    screen.getByRole("button", { name: "Fetch matching row count" })
  );
  expect(screen.getByText("250 matching rows")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Next" }));
  expect(JSON.parse(rawQuery.textContent!)).toEqual({
    ...initialQuery,
    offset: 100,
  });
  rerender(view(false));
  expect(screen.getByRole("region", { name: "Query tree" })).toHaveTextContent(
    "Row limit: 100, offset: 100"
  );
  expect(onQueryChange).toHaveBeenCalledOnce();
  expect(onQueryChange).toHaveBeenCalledWith({
    ...initialQuery,
    offset: 100,
  });
  expect(screen.getByText("Page 2")).toBeVisible();
  expect(screen.getByText("250 matching rows")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Previous" }));
  expect(onQueryChange).toHaveBeenLastCalledWith(initialQuery);
  expect(screen.getByText("Page 1")).toBeVisible();
});

it("makes the query definition available even when execution fails", () => {
  mocks.useQuery.mockReturnValue({
    query: undefined,
    data: null,
    error: new Error("Query failed"),
    isLoading: false,
  });
  render(
    <TooltipProvider>
      <QueryView
        initialQuery={initialQuery}
        onQueryChange={vi.fn()}
        onDeleteQuery={vi.fn()}
        showQueryText
        width={900}
        height={700}
      />
    </TooltipProvider>
  );
  expect(screen.getByText("Query failed")).toBeVisible();
  expect(
    JSON.parse(
      screen.getByRole("region", { name: "Raw query (JSON)" }).textContent!
    )
  ).toEqual(initialQuery);
});

it("keeps the result table mounted while refreshing and requests previous data", () => {
  const props = {
    initialQuery,
    onQueryChange: vi.fn(),
    onDeleteQuery: vi.fn(),
    width: 900,
    height: 700,
  };
  const { rerender } = render(
    <TooltipProvider>
      <QueryView {...props} />
    </TooltipProvider>
  );
  const table = screen.getByRole("table", { name: "Query results" });
  const previous = mocks.useQuery.mock.results.at(-1)!.value;
  mocks.useQuery.mockReturnValue({ ...previous, isLoading: true });
  rerender(
    <TooltipProvider>
      <QueryView {...props} />
    </TooltipProvider>
  );
  expect(screen.getByRole("table", { name: "Query results" })).toBe(table);
  expect(screen.getByRole("status")).toHaveTextContent("Running query…");
  expect(table.closest("fieldset")).toHaveAttribute("aria-busy", "true");
  const options = mocks.useQuery.mock.calls.at(-1)![3];
  expect(options.placeholderData(previous.data)).toBe(previous.data);
  mocks.useQuery.mockReturnValue({ ...previous, isLoading: false });
  rerender(
    <TooltipProvider>
      <QueryView {...props} />
    </TooltipProvider>
  );
  expect(screen.queryByRole("status")).toBeNull();
  expect(screen.getByRole("table", { name: "Query results" })).toBe(table);
});

it("accepts an external AI amendment without remounting the result table", () => {
  const props = {
    initialQuery,
    onQueryChange: vi.fn(),
    onDeleteQuery: vi.fn(),
    showQueryText: true,
    width: 900,
    height: 700,
  };
  const { rerender } = render(
    <TooltipProvider>
      <QueryView {...props} />
    </TooltipProvider>
  );
  const table = screen.getByRole("table", { name: "Query results" });
  const next = {
    ...initialQuery,
    base: { ...initialQuery.base, select: ["status"] },
  };
  rerender(
    <TooltipProvider>
      <QueryView {...props} initialQuery={next} />
    </TooltipProvider>
  );
  expect(screen.getByRole("table", { name: "Query results" })).toBe(table);
  expect(
    JSON.parse(
      screen.getByRole("region", { name: "Raw query (JSON)" }).textContent!
    )
  ).toEqual(next);
});
