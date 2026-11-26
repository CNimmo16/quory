import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import {
  ConditionOperator,
  prepareQuery,
  type PreparedQuery,
} from "@quory/core";
import { schemas } from "../../../../test/queryFixtures";
import QueryView from "./QueryView";
import { TooltipProvider } from "./ui/tooltip";

vi.mock("../../../../../stack/src/react/useQuory", () => ({
  default: (_route: string, input: { query: PreparedQuery }) => ({
    data: { preparedQuery: input.query, visibleJoins: [], rows: [] },
    isFetching: false,
    refetch: vi.fn(),
  }),
}));
vi.mock("../../../../../stack/src/react/hooks/useFetchSchema", () => ({
  default: () => ({ data: { schemas } }),
}));
vi.mock("@quory/stack/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@quory/stack/react")>()),
  useQuery: (await import("../../../../../stack/src/react/hooks/useQuery"))
    .default,
  useFetchSchema: () => ({ data: { schemas } }),
  useQueryCount: () => ({ count: null, isLoading: false }),
}));
vi.mock("../util/tprc", () => ({
  default: { queries: { compileSql: { useQuery: () => ({}) } } },
}));
vi.mock("./DataTable", () => ({ default: () => <div>Query results</div> }));
vi.mock("./SqlEditor", () => ({
  formatSql: (sql: string) => sql,
  SqlEditor: () => null,
}));

it("removes the starting table through the client QueryView and updates the navigator", async () => {
  const filter = {
    column: "email",
    operator: ConditionOperator.EQUALS as const,
    value: "ada@example.com",
  };
  const { preparedQuery } = await prepareQuery(schemas, {
    offset: 100,
    base: {
      tableRef: "public.orders",
      select: ["id"],
      joins: [{ tableRef: "public.users", select: ["email"], where: filter }],
    },
  });
  const onQueryChange = vi.fn();
  render(
    <TooltipProvider>
      <QueryView
        initialQuery={preparedQuery}
        connectionId="connection-1"
        onQueryChange={onQueryChange}
        width={1000}
        height={700}
      />
    </TooltipProvider>,
  );
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Remove orders from query" }));
  expect(onQueryChange).toHaveBeenCalledOnce();
  const next = onQueryChange.mock.calls[0]![0];
  expect(next).toMatchObject({
    offset: 0,
    base: {
      tableRef: "public.users",
      select: ["email"],
      where: filter,
      joins: [],
      via: [],
    },
  });
  expect(screen.queryByRole("group", { name: /public.orders/ })).toBeNull();
  expect(
    screen.getByRole("group", { name: "public.users, base table" }),
  ).toBeVisible();
  expect(
    screen.queryByRole("button", { name: "Remove users from query" }),
  ).toBeNull();
  await expect(prepareQuery(schemas, next)).resolves.toBeDefined();
});

it("removes an unused via table from the navigator when its destination is deleted", async () => {
  const { preparedQuery } = await prepareQuery(schemas, {
    base: {
      tableRef: "public.listings",
      select: ["title"],
      joins: [{ tableRef: "public.users", select: ["email"] }],
    },
  });
  const onQueryChange = vi.fn();
  render(
    <TooltipProvider>
      <QueryView
        initialQuery={preparedQuery}
        connectionId="connection-1"
        onQueryChange={onQueryChange}
        width={1000}
        height={700}
      />
    </TooltipProvider>,
  );
  expect(
    screen.getByRole("group", {
      name: "public.orders, joined from public.listings",
    }),
  ).toBeVisible();
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Remove users from query" }));
  expect(onQueryChange).toHaveBeenCalledOnce();
  const next = onQueryChange.mock.calls[0]![0];
  expect(next.base).toMatchObject({
    tableRef: "public.listings",
    select: ["title"],
    joins: [],
  });
  expect(screen.queryByRole("group", { name: /public.orders/ })).toBeNull();
  expect(screen.queryByRole("group", { name: /public.users/ })).toBeNull();
  expect(
    screen.getByRole("group", { name: "public.listings, base table" }),
  ).toBeVisible();
  await expect(prepareQuery(schemas, next)).resolves.toBeDefined();
});
