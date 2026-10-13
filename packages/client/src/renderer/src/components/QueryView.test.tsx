import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { ConditionOperator, type Query } from "@quory/core";
import { schemas } from "../../../../test/queryFixtures";
import QueryView from "./QueryView";
import { TooltipProvider } from "./ui/tooltip";

const mocks = vi.hoisted(() => ({ useQuery: vi.fn() }));
vi.mock("@quory/stack/react", () => ({
  useFetchSchema: () => ({ data: { schemas } }),
  useQuery: (...args: unknown[]) => mocks.useQuery(...args),
  useQueryCount: () => ({ count: null, isLoading: false, error: null }),
}));
vi.mock("./TableNavigator", () => ({
  default: ({ query }: { query: Query }) => (
    <div role="region" aria-label="Query tree">
      Row limit: {query.limit}
    </div>
  ),
}));
vi.mock("./DataTable", () => ({
  default: () => <table aria-label="Query results" />,
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
  mocks.useQuery.mockImplementation((query: Query) => ({
    query,
    data: { rows: [[]], visibleJoins: [] },
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
        initialQuery={initialQuery}
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

  const pageSize = screen.getByRole("spinbutton", { name: "Rows per page" });
  await user.clear(pageSize);
  await user.type(pageSize, "25");
  await user.click(screen.getByRole("button", { name: "Apply page size" }));
  expect(JSON.parse(rawQuery.textContent!)).toEqual({
    ...initialQuery,
    limit: 25,
  });
  rerender(view(false));
  expect(screen.getByRole("region", { name: "Query tree" })).toHaveTextContent(
    "Row limit: 25"
  );
  expect(onQueryChange).toHaveBeenCalledOnce();
  expect(onQueryChange).toHaveBeenCalledWith({
    ...initialQuery,
    limit: 25,
  });
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
