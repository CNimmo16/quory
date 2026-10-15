import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  data: {} as {
    query: { nickname: string; mode?: string };
    connectionId: null;
  },
  active: vi.fn(),
  projects: vi.fn(),
  queries: vi.fn(),
  fetch: vi.fn(),
  view: vi.fn(),
  assistant: vi.fn(),
  sql: vi.fn(),
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({
    options,
    useParams: () => ({ queryId: "orders" }),
    useLoaderData: () => mocks.data,
  }),
  useNavigate: vi.fn(),
  useRouter: vi.fn(),
  useBlocker: vi.fn(),
  redirect: (options: unknown) => options,
}));
vi.mock("../GlobalProviders", () => ({
  trpcClient: {
    connections: { fetchActiveConnection: { query: mocks.active } },
    projects: {
      list: { query: mocks.projects },
      listQueries: { query: mocks.queries },
    },
    queries: { fetchQuery: { query: mocks.fetch } },
  },
}));
vi.mock("./ConnectionBadge", () => ({
  ConnectionBadge: () => <button>Select connection badge</button>,
}));
vi.mock("./QueryView", () => ({ default: mocks.view }));
vi.mock("./QueryChat", () => ({ QueryChatPane: mocks.assistant }));
vi.mock("./SqlQueryWorkspace", () => ({ SqlQueryWorkspace: mocks.sql }));
vi.mock("../util/tprc", () => ({ default: {} }));
import { Route } from "../routes/queries/$queryId";
const load = Route.options.loader as (options: {
  params: { queryId: string };
}) => Promise<unknown>;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.data = { query: { nickname: "Saved orders" }, connectionId: null };
  mocks.active.mockResolvedValue({ connection: null });
  mocks.projects.mockResolvedValue({ activeProject: { _id: "app" } });
  mocks.queries.mockResolvedValue({
    queries: [{ id: "orders", query: mocks.data.query }],
  });
});
it("redirects disconnected query URLs to the global query screen without loading the query", async () => {
  await expect(load({ params: { queryId: "orders" } })).rejects.toEqual({
    to: "/queries",
  });
  expect(mocks.fetch).not.toHaveBeenCalled();
  expect(mocks.queries).not.toHaveBeenCalled();
});
it("loads the query against the chosen connection once connected", async () => {
  mocks.active.mockResolvedValue({
    connection: { _id: "staging", type: "postgres" },
  });
  mocks.fetch.mockResolvedValue({ query: mocks.data.query });
  expect(await load({ params: { queryId: "orders" } })).toEqual({
    query: mocks.data.query,
    connectionId: "staging",
    dialect: "postgres",
  });
  expect(mocks.fetch).toHaveBeenCalledWith({
    connectionId: "staging",
    queryId: "orders",
  });
  expect(mocks.queries).not.toHaveBeenCalled();
});
