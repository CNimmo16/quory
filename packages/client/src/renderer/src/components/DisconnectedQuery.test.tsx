import type { ComponentType } from "react";
import { WindowToolbarFrame } from "./WindowToolbar";
import { render, screen, within } from "@testing-library/react";
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
vi.mock("./SelectConnectionScreen", () => ({
  SelectConnectionScreen: ({ queryId }: { queryId: string }) => (
    <section aria-label="Select connection">Connections for {queryId}</section>
  ),
}));
vi.mock("./QueryView", () => ({ default: mocks.view }));
vi.mock("./QueryChat", () => ({ QueryChatPane: mocks.assistant }));
vi.mock("./SqlQueryWorkspace", () => ({ SqlQueryWorkspace: mocks.sql }));
vi.mock("../util/tprc", () => ({ default: {} }));
import { Route } from "../routes/queries/$queryId";
const Page = Route.options.component as ComponentType;
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
it.each(["relationship", "sql"])(
  "shows the %s query header above connection selection without results or assistant",
  (mode) => {
    mocks.data.query.mode = mode;
    render(<Page />);
    const header = screen
      .getByRole("heading", { name: "Saved orders" })
      .closest("header")!;
    expect(
      within(header).getByRole("button", { name: "Select connection badge" })
    ).toBeVisible();
    expect(
      screen.getByRole("region", { name: "Select connection" })
    ).toHaveTextContent("Connections for orders");
    expect(header.nextElementSibling).toContainElement(
      screen.getByRole("region", { name: "Select connection" })
    );
    expect(mocks.view).not.toHaveBeenCalled();
    expect(mocks.assistant).not.toHaveBeenCalled();
    expect(mocks.sql).not.toHaveBeenCalled();
  }
);
it("loads the saved query from its project without requiring a connection or redirecting", async () => {
  expect(await load({ params: { queryId: "orders" } })).toEqual(mocks.data);
  expect(mocks.queries).toHaveBeenCalledWith({ projectId: "app" });
  expect(mocks.fetch).not.toHaveBeenCalled();
});

it("keeps the disconnected query header in the window toolbar above the connection screen", () => {
  render(
    <WindowToolbarFrame hasQueryHeader>
      <Page />
    </WindowToolbarFrame>
  );
  const toolbar = screen.getByRole("banner", { name: "App toolbar" });
  expect(
    within(toolbar).getByRole("heading", { name: "Saved orders" })
  ).toBeVisible();
  expect(
    within(toolbar).getByRole("button", { name: "Select connection badge" })
  ).toBeVisible();
  expect(
    within(toolbar).getByRole("button", { name: "Query actions" })
  ).toBeDisabled();
  expect(
    within(toolbar).queryByRole("region", { name: "Select connection" })
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("region", { name: "Select connection" })
  ).toBeVisible();
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
it("does not display a query from outside the open project", async () => {
  mocks.queries.mockResolvedValue({ queries: [] });
  await expect(load({ params: { queryId: "orders" } })).rejects.toThrow(
    "could not be found in the project"
  );
});
