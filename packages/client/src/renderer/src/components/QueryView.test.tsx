import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { type Query, type PreparedJoinDef } from "@quory/core";
import { schemas } from "../../../../test/queryFixtures";
import QueryView from "./QueryView";
import { TooltipProvider } from "./ui/tooltip";
const mocks = vi.hoisted(() => ({ useQuery: vi.fn(), compile: vi.fn() }));
vi.mock("../util/tprc", () => ({
  default: {
    queries: {
      compileSql: { useQuery: (...args: unknown[]) => mocks.compile(...args) },
    },
  },
}));
vi.mock("./SqlEditor", () => ({
  formatSql: (sql: string) => sql,
  SqlEditor: ({
    value,
    onRequestEdit,
  }: {
    value: string;
    onRequestEdit?: () => void;
  }) => (
    <button type="button" aria-label="Edit SQL query" onClick={onRequestEdit}>
      <code>{value}</code>
    </button>
  ),
}));
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
  default: ({
    isLoading,
    embedded,
  }: {
    isLoading?: boolean;
    embedded?: boolean;
  }) => (
    <div>
      {isLoading && !embedded && <span role="status">Running query…</span>}
      <table aria-label="Query results" />
    </div>
  ),
}));
const initialQuery: Query = {
  base: { tableRef: "public.orders", select: "*", joins: [] },
  limit: 100,
  offset: 0,
};
beforeEach(() => {
  vi.resetAllMocks();
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
  mocks.compile.mockImplementation(({ query }: { query: Query }) => ({
    data: {
      sql: `SELECT ${
        query.base.select === "*" ? "*" : query.base.select.join(", ")
      } FROM public.orders LIMIT $1 OFFSET $2`,
      parameters: [query.limit, query.offset],
      dialect: "postgres",
    },
    isFetching: false,
  }));
});
const props = () => ({
  initialQuery,
  connectionId: "connection-1",
  onQueryChange: vi.fn(),
  width: 900,
  height: 700,
});

it("separates query controls from results and switches representations without replacing results", async () => {
  render(
    <TooltipProvider>
      <QueryView {...props()} />
    </TooltipProvider>
  );
  const definition = screen.getByRole("region", { name: "Query" });
  const results = screen.getByRole("region", { name: "Results" });
  const toggle = within(definition).getByRole("switch", { name: "SQL view" });
  const table = within(results).getByRole("table", { name: "Query results" });
  expect(toggle).toHaveAttribute("aria-checked", "false");
  expect(within(results).getByText("100 rows")).toBeVisible();
  expect(
    within(definition).getByRole("region", { name: "Query tree" })
  ).toBeVisible();
  expect(
    within(results).getByRole("region", { name: "Results pagination" })
  ).toBeVisible();
  const user = userEvent.setup();
  await user.click(toggle);
  expect(toggle).toHaveAttribute("aria-checked", "true");
  expect(
    within(definition).getByText(
      "SELECT * FROM public.orders LIMIT $1 OFFSET $2"
    )
  ).toBeVisible();
  expect(within(results).getByRole("table", { name: "Query results" })).toBe(
    table
  );
  await user.keyboard("{Enter}");
  expect(toggle).toHaveAttribute("aria-checked", "false");
  expect(
    within(definition).getByRole("region", { name: "Query tree" })
  ).toBeVisible();
  expect(within(results).getByRole("table", { name: "Query results" })).toBe(
    table
  );
});

it("places undo and redo in the Query header and disables unavailable history actions", async () => {
  const controls = {
    canUndo: true,
    canRedo: false,
    onUndo: vi.fn(),
    onRedo: vi.fn(),
  };
  render(
    <TooltipProvider>
      <QueryView {...props()} historyControls={controls} />
    </TooltipProvider>
  );
  const query = screen.getByRole("region", { name: "Query" });
  await userEvent
    .setup()
    .click(within(query).getByRole("button", { name: "Undo" }));
  expect(controls.onUndo).toHaveBeenCalledOnce();
  expect(within(query).getByRole("button", { name: "Redo" })).toBeDisabled();
  expect(
    within(screen.getByRole("region", { name: "Results" })).queryByRole(
      "button",
      { name: "Undo" }
    )
  ).not.toBeInTheDocument();
});
it("shows underlying bound SQL, retains the results, and preserves pagination when switching views", async () => {
  const user = userEvent.setup();
  const base = props();
  const view = (showQueryText: boolean) => (
    <TooltipProvider>
      <QueryView {...base} showQueryText={showQueryText} />
    </TooltipProvider>
  );
  const { rerender } = render(view(false));
  expect(screen.getByRole("region", { name: "Query tree" })).toBeVisible();
  rerender(view(true));
  expect(screen.queryByRole("region", { name: "Query tree" })).toBeNull();
  expect(
    screen.getByText("SELECT * FROM public.orders LIMIT $1 OFFSET $2")
  ).toBeVisible();
  expect(screen.getByText("Bound parameters: [100,0]")).toBeVisible();
  expect(screen.getByRole("table", { name: "Query results" })).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Next" }));
  expect(screen.getByText("Bound parameters: [100,100]")).toBeVisible();
  rerender(view(false));
  expect(screen.getByRole("region", { name: "Query tree" })).toHaveTextContent(
    "offset: 100"
  );
  expect(base.onQueryChange).toHaveBeenCalledWith({
    ...initialQuery,
    offset: 100,
  });
});
it("converts only after modal confirmation, retaining SQL and parameters", async () => {
  const user = userEvent.setup();
  const convert = vi.fn();
  render(
    <TooltipProvider>
      <QueryView {...props()} showQueryText onConvertToSql={convert} />
    </TooltipProvider>
  );
  await user.click(screen.getByRole("button", { name: "Edit SQL query" }));
  expect(screen.getByRole("dialog")).toHaveTextContent("cannot be undone");
  expect(convert).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  expect(convert).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Edit SQL query" }));
  await user.click(screen.getByRole("button", { name: "Convert to SQL" }));
  expect(convert).toHaveBeenCalledWith({
    mode: "sql",
    sql: "SELECT * FROM public.orders LIMIT $1 OFFSET $2",
    parameters: [100, 0],
    dialect: "postgres",
  });
});
it("makes SQL available when relationship execution fails", () => {
  mocks.useQuery.mockReturnValue({
    query: undefined,
    data: null,
    error: new Error("Query failed"),
    isLoading: false,
  });
  render(
    <TooltipProvider>
      <QueryView {...props()} showQueryText />
    </TooltipProvider>
  );
  expect(screen.getByText("Query failed")).toBeVisible();
  expect(
    screen.getByText("SELECT * FROM public.orders LIMIT $1 OFFSET $2")
  ).toBeVisible();
});
it("keeps the result table mounted while refreshing and requests previous data", () => {
  const base = props();
  const view = () => (
    <TooltipProvider>
      <QueryView {...base} />
    </TooltipProvider>
  );
  const { rerender } = render(view());
  const table = screen.getByRole("table", { name: "Query results" });
  const previous = mocks.useQuery.mock.results.at(-1)!.value;
  mocks.useQuery.mockReturnValue({ ...previous, isLoading: true });
  rerender(view());
  expect(screen.getByRole("table", { name: "Query results" })).toBe(table);
  expect(screen.getByRole("status")).toHaveTextContent("Running query…");
  expect(
    mocks.useQuery.mock.calls.at(-1)![3].placeholderData(previous.data)
  ).toBe(previous.data);
});
it("accepts external amendments without remounting results", () => {
  const base = props();
  const { rerender } = render(
    <TooltipProvider>
      <QueryView {...base} showQueryText />
    </TooltipProvider>
  );
  const table = screen.getByRole("table", { name: "Query results" });
  rerender(
    <TooltipProvider>
      <QueryView
        {...base}
        initialQuery={{
          ...initialQuery,
          base: { ...initialQuery.base, select: ["status"] },
        }}
        showQueryText
      />
    </TooltipProvider>
  );
  expect(screen.getByRole("table", { name: "Query results" })).toBe(table);
  expect(
    screen.getByText("SELECT status FROM public.orders LIMIT $1 OFFSET $2")
  ).toBeVisible();
});
