vi.mock("./ConnectionBadge", () => ({
  ConnectionBadge: ({
    invalid,
    errorId,
  }: {
    invalid?: boolean;
    errorId?: string;
  }) => (
    <button type="button" aria-invalid={invalid} aria-describedby={errorId}>
      Connection badge
    </button>
  ),
}));
import type { ComponentType } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import type { DatabaseSchema } from "@quory/core";
import { JoinRankingProvider, type JoinRanker } from "@quory/stack/react";
import { NewQueryDraftProvider } from "../hooks/useNewQueryDraft";
import { TooltipProvider } from "./ui/tooltip";
import { MainDimensionsContext } from "../hooks/useMainDimensions";
import type { QueryChatResult } from "../../../shared/queryChat";

const defaultSchemas: DatabaseSchema[] = [
  { name: "public", tables: [{ name: "orders", columns: [] }] },
];

const mocks = vi.hoisted(() => ({
  connectionId: "connection-1",
  projectId: "app" as string | undefined,
  open: vi.fn(),
  invalidateRouter: vi.fn(),
  listProjects: vi.fn(),
  activeConnection: vi.fn(),
  projects: [
    { id: "app", project: { name: "Application", storage: "database" } },
    { id: "team", project: { name: "Team", storage: "database" } },
  ],
  schemas: [] as DatabaseSchema[],
  ranker: undefined as JoinRanker | undefined,
  chat: vi.fn(),
  create: vi.fn(),
  navigate: vi.fn(),
  invalidate: vi.fn(),
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({
    options,
    useLoaderData: () => ({
      connectionId: mocks.connectionId,
      projectId: mocks.projectId,
      projects: mocks.projects,
    }),
  }),
  useNavigate: () => mocks.navigate,
  useRouter: () => ({ invalidate: mocks.invalidateRouter }),
  redirect: (options: unknown) => options,
}));
vi.mock("../util/trpcClient", () => ({
  trpcClient: {
    projects: { list: { query: mocks.listProjects } },
    connections: { fetchActiveConnection: { query: mocks.activeConnection } },
  },
}));
vi.mock("@quory/stack/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@quory/stack/react")>()),
  useFetchSchema: () => ({
    data: { schemas: mocks.schemas },
  }),
}));
vi.mock("../util/tprc", () => ({
  default: {
    useUtils: () => ({
      projects: {
        list: { invalidate: mocks.invalidate },
        listQueries: { invalidate: mocks.invalidate },
      },
      connections: { invalidate: mocks.invalidate },
    }),
    projects: {
      open: {
        useMutation: () => ({ mutateAsync: mocks.open, isPending: false }),
      },
    },
    queries: {
      chat: { useMutation: () => ({ mutateAsync: mocks.chat }) },
      createQuery: {
        useMutation: () => ({
          mutate: mocks.create,
          mutateAsync: mocks.create,
          isPending: false,
          error: null,
        }),
      },
    },
  },
}));
vi.mock("./SqlQueryWorkspace", () => ({
  SqlQueryWorkspace: ({
    query,
    onChange,
  }: {
    query: { mode: "sql"; sql: string };
    onChange: (query: { mode: "sql"; sql: string }) => void;
  }) => (
    <textarea
      aria-label="SQL query"
      value={query.sql}
      onChange={(event) => onChange({ ...query, sql: event.target.value })}
    />
  ),
}));
import { Route } from "../routes/queries/index";
const Page = Route.options.component as ComponentType;

beforeEach(() => {
  vi.resetAllMocks();
  window.localStorage.clear();
  mocks.connectionId = "connection-1";
  mocks.projectId = "app";
  mocks.schemas = structuredClone(defaultSchemas);
  mocks.ranker = undefined;
  mocks.open.mockResolvedValue(undefined);
  mocks.create.mockResolvedValue({ queryId: "manual-query" });
  mocks.listProjects.mockResolvedValue({
    projects: mocks.projects,
    activeProject: null,
  });
  mocks.activeConnection.mockResolvedValue({ connection: null });
});

it("loads global query creation without an active project or connection", async () => {
  const load = Route.options.loader as () => Promise<unknown>;
  expect(await load()).toEqual({
    projects: mocks.projects,
    projectId: undefined,
    connectionId: "",
    dialect: "postgres",
  });
  expect(mocks.open).not.toHaveBeenCalled();
});

it("uses first-project creation when no projects exist", async () => {
  mocks.listProjects.mockResolvedValue({ projects: [], activeProject: null });
  const load = Route.options.loader as () => Promise<unknown>;
  await expect(load()).rejects.toEqual({ to: "/projects" });
  expect(mocks.activeConnection).not.toHaveBeenCalled();
});
function queryPage() {
  return (
    <JoinRankingProvider value={mocks.ranker}>
      <NewQueryDraftProvider>
        <TooltipProvider delayDuration={0}>
          <MainDimensionsContext.Provider value={{ width: 900, height: 800 }}>
            <Page />
          </MainDimensionsContext.Provider>
        </TooltipProvider>
      </NewQueryDraftProvider>
    </JoinRankingProvider>
  );
}
function mount() {
  return render(queryPage());
}

it("requires a project and connection before building a query", async () => {
  mocks.projectId = undefined;
  mocks.connectionId = "";
  mount();
  expect(screen.getByRole("button", { name: /^Project:/ })).toHaveTextContent(
    "Choose project",
  );
  expect(
    screen.getByRole("button", { name: "Connection badge" }),
  ).toBeDisabled();
  expect(screen.getByRole("button", { name: /^Project:/ })).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  expect(
    screen.getByRole("button", { name: "Connection badge" }),
  ).toHaveAttribute("aria-invalid", "true");
  expect(
    screen.getByRole("textbox", { name: "Describe your query" }),
  ).toBeEnabled();
  expect(screen.getByRole("button", { name: "Build query" })).toBeDisabled();
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: /^Project:/ }));
  await user.click(screen.getByRole("menuitem", { name: "Team" }));
  await waitFor(() =>
    expect(mocks.open).toHaveBeenCalledWith({ projectId: "team" }),
  );
  await waitFor(() => expect(mocks.invalidateRouter).toHaveBeenCalledOnce());
  expect(mocks.chat).not.toHaveBeenCalled();
  expect(mocks.create).not.toHaveBeenCalled();
});

it("keeps creation disabled when a project is selected without a connection", () => {
  mocks.connectionId = "";
  mount();
  expect(screen.getByRole("button", { name: /^Project:/ })).toHaveTextContent(
    "Application",
  );
  expect(
    screen.getByRole("button", { name: "Connection badge" }),
  ).toBeEnabled();
  expect(screen.getByRole("button", { name: "Build query" })).toBeDisabled();
  expect(screen.getByText("Select a connection.")).toBeVisible();
});

it("defaults to AI creation with selectors inside the prompt form", async () => {
  mount();
  expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Go" })).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Run SQL" }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: /^Project:/ }).closest("form"),
  ).toBe(
    screen
      .getByRole("textbox", { name: "Describe your query" })
      .closest("form"),
  );
  expect(screen.getByRole("button", { name: "Build query" })).toBeDisabled();
  await userEvent
    .setup()
    .type(
      screen.getByRole("textbox", { name: "Describe your query" }),
      "Latest orders",
    );
  expect(screen.getByRole("button", { name: "Build query" })).toBeEnabled();
});

it("creates a manual query from a starting table and opens the query editor", async () => {
  mount();
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Manual" }));
  expect(screen.getByRole("button", { name: "Manual" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(screen.getByText(/Add related tables, choose columns/)).toBeVisible();
  expect(screen.getByRole("button", { name: /^Project:/ })).toBeVisible();
  expect(
    screen.getByRole("button", { name: "Connection badge" }),
  ).toBeVisible();
  await user.click(screen.getByRole("option", { name: "orders" }));
  expect(mocks.create).toHaveBeenCalledWith({
    connectionId: "connection-1",
    query: { base: { tableRef: "public.orders", select: "*" } },
  });
  await waitFor(() =>
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/queries/$queryId",
      params: { queryId: "manual-query" },
    }),
  );
  expect(mocks.invalidate).toHaveBeenCalled();
  expect(mocks.chat).not.toHaveBeenCalled();
});

it("retains manual mode while selecting a connection and requires it before listing tables", async () => {
  mocks.connectionId = "";
  const view = mount();
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Manual" }));
  expect(screen.queryByRole("option")).not.toBeInTheDocument();
  expect(
    screen.getByText("Select a connection to create a query."),
  ).toBeVisible();
  expect(mocks.create).not.toHaveBeenCalled();
  mocks.connectionId = "connection-2";
  view.rerender(queryPage());
  await user.click(screen.getByRole("option", { name: "orders" }));
  expect(mocks.create).toHaveBeenCalledWith(
    expect.objectContaining({ connectionId: "connection-2" }),
  );
});

it("retains the AI draft when switching to manual mode and back", async () => {
  mount();
  const user = userEvent.setup();
  await user.type(
    screen.getByRole("textbox", { name: "Describe your query" }),
    "Latest orders",
  );
  await user.click(screen.getByRole("button", { name: "Manual" }));
  await user.keyboard("{Escape}");
  await user.click(screen.getByRole("button", { name: "AI" }));
  expect(
    screen.getByRole("textbox", { name: "Describe your query" }),
  ).toHaveValue("Latest orders");
});

it("shows manual creation failures and retries the chosen table", async () => {
  mocks.create.mockRejectedValueOnce(new Error("Could not save query"));
  mount();
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Manual" }));
  await user.click(screen.getByRole("option", { name: "orders" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Could not save query",
  );
  expect(mocks.navigate).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Try again" }));
  await waitFor(() =>
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/queries/$queryId",
      params: { queryId: "manual-query" },
    }),
  );
  expect(mocks.create).toHaveBeenCalledTimes(2);
});

it("does not open an old manual query after switching connections", async () => {
  let finish!: (result: { queryId: string }) => void;
  mocks.create.mockReturnValue(
    new Promise<{ queryId: string }>((resolve) => {
      finish = resolve;
    }),
  );
  const view = mount();
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Manual" }));
  await user.click(screen.getByRole("option", { name: "orders" }));
  expect(screen.getByText("Opening query…")).toBeVisible();
  mocks.connectionId = "connection-2";
  view.rerender(queryPage());
  finish({ queryId: "old-query" });
  await waitFor(() =>
    expect(screen.getByRole("option", { name: "orders" })).toBeVisible(),
  );
  expect(mocks.navigate).not.toHaveBeenCalled();
});

it("uses the decision model to choose initial columns for a manual starting table and falls back without one", async () => {
  const column = (name: string, overrides = {}) => ({
    name,
    dataType: "text",
    genericDataType: "text" as const,
    isNullable: false,
    includedInPrimaryKey: name === "id",
    foreignKeys: [],
    foreignKeyReferences: [],
    ...overrides,
  });
  mocks.schemas = [
    {
      name: "public",
      tables: [
        {
          name: "orders",
          columns: [
            column("id"),
            column("order_number"),
            column("status"),
            column("payload", {
              dataType: "jsonb",
              genericDataType: "hierarchical",
            }),
          ],
        },
      ],
    },
  ];
  const ranker = vi.fn<JoinRanker>().mockResolvedValue({
    ranked: true,
    orderedIds: [],
    selectedIds: ["status", "order_number"],
  });
  mocks.ranker = ranker;

  const user = userEvent.setup();
  const view = mount();
  await user.click(screen.getByRole("button", { name: "Manual" }));
  await user.click(screen.getByRole("option", { name: "orders" }));
  await waitFor(() =>
    expect(mocks.create).toHaveBeenCalledWith({
      connectionId: "connection-1",
      query: {
        base: {
          tableRef: "public.orders",
          select: ["order_number", "status"],
        },
      },
    }),
  );
  expect(ranker).toHaveBeenCalledWith(
    expect.objectContaining({
      kind: "columns",
      sourceTable: "public.orders",
      targetTable: "public.orders",
      joinedTables: ["public.orders"],
      selectedColumns: [],
    }),
    expect.any(AbortSignal),
  );

  // Without a decision model, use the useful fallback columns rather than "*".
  view.unmount();
  window.localStorage.clear();
  mocks.create.mockClear();
  mocks.ranker = undefined;
  mount();
  await user.click(screen.getByRole("button", { name: "Manual" }));
  await user.click(screen.getByRole("option", { name: "orders" }));
  await waitFor(() =>
    expect(mocks.create).toHaveBeenCalledWith({
      connectionId: "connection-1",
      query: {
        base: {
          tableRef: "public.orders",
          select: ["id", "order_number", "status"],
        },
      },
    }),
  );
});

it("starts with no recent pills, populates up to 5 from manual mode usage, and still allows selecting from the dropdown", async () => {
  const table = (name: string) => ({ name, columns: [] });
  mocks.schemas = [
    {
      name: "public",
      tables: [
        table("orders"),
        table("customers"),
        table("products"),
        table("invoices"),
        table("shipments"),
        table("payments"),
        table("returns"),
      ],
    },
    {
      name: "audit",
      tables: [table("orders")],
    },
  ];

  const user = userEvent.setup();
  let view = mount();
  await user.click(screen.getByRole("button", { name: "Manual" }));

  // Starts empty with no recent pills and the dropdown open.
  expect(
    screen.queryByRole("group", { name: "Recent starting tables" }),
  ).not.toBeInTheDocument();

  // Select 6 tables in manual mode (repeating one to test deduplication/reordering).
  const pickFromDropdown = async (search: string, optionName: string) => {
    const trigger = screen.getByRole("combobox", { name: "Starting table" });
    if (trigger.getAttribute("aria-expanded") !== "true") {
      await user.click(trigger);
    }
    const input = screen.getByRole("combobox", { name: "Search tables" });
    await user.clear(input);
    await user.type(input, search);
    await user.click(screen.getAllByRole("option", { name: optionName })[0]!);
    await waitFor(() => expect(mocks.create).toHaveBeenCalled());
    mocks.create.mockClear();
  };

  for (const [search, optionName] of [
    ["payments", "payments"],
    ["shipments", "shipments"],
    ["invoices", "invoices"],
    ["audit.orders", "orders"],
    ["customers", "customers"],
    ["public.orders", "orders"],
    ["invoices", "invoices"],
  ] as const) {
    await pickFromDropdown(search, optionName);
  }

  // Reopening manual mode shows the 5 most recent unique manual starting tables.
  view.unmount();
  view = mount();
  await user.click(screen.getByRole("button", { name: "Manual" }));

  const recentGroup = screen.getByRole("group", {
    name: "Recent starting tables",
  });
  const pills = within(recentGroup).getAllByRole("button");
  expect(pills.map((button) => button.textContent)).toEqual([
    "invoices",
    "public.orders",
    "customers",
    "audit.orders",
    "shipments",
  ]);
  // Dropdown stays closed by default when recent pills are shown.
  expect(screen.queryByRole("option")).not.toBeInTheDocument();

  // Clicking a pill opens a query starting from that table.
  await user.click(
    within(recentGroup).getByRole("button", { name: "customers" }),
  );
  await waitFor(() =>
    expect(mocks.create).toHaveBeenCalledWith({
      connectionId: "connection-1",
      query: { base: { tableRef: "public.customers", select: "*" } },
    }),
  );

  // Alternatively, the user can open the dropdown and choose another table.
  mocks.create.mockClear();
  await user.click(screen.getByRole("combobox", { name: "Starting table" }));
  await user.click(screen.getByRole("option", { name: "returns" }));
  await waitFor(() =>
    expect(mocks.create).toHaveBeenCalledWith({
      connectionId: "connection-1",
      query: { base: { tableRef: "public.returns", select: "*" } },
    }),
  );
  view.unmount();
});

it("explains missing selectors on the disabled submit button and blocks Enter submission", async () => {
  mocks.projectId = undefined;
  mocks.connectionId = "";
  mount();
  const user = userEvent.setup();
  await user.type(
    screen.getByRole("textbox", { name: "Describe your query" }),
    "Latest orders{Enter}",
  );
  const submit = screen.getByRole("button", { name: "Build query" });
  expect(submit).toBeDisabled();
  await user.hover(submit.parentElement!);
  expect(await screen.findByRole("tooltip")).toHaveTextContent(
    "Select a project and connection to create a query.",
  );
  expect(mocks.chat).not.toHaveBeenCalled();
});

it("preserves an unsent prompt while selecting a project and connection", async () => {
  mocks.projectId = undefined;
  mocks.connectionId = "";
  const view = mount();
  await userEvent
    .setup()
    .type(
      screen.getByRole("textbox", { name: "Describe your query" }),
      "Latest orders",
    );
  mocks.projectId = "team";
  view.rerender(queryPage());
  expect(
    screen.getByRole("textbox", { name: "Describe your query" }),
  ).toHaveValue("Latest orders");
  mocks.connectionId = "connection-2";
  view.rerender(queryPage());
  expect(
    screen.getByRole("textbox", { name: "Describe your query" }),
  ).toHaveValue("Latest orders");
  expect(screen.getByRole("button", { name: "Build query" })).toBeEnabled();
});

it("asks for clarification in the query assistant before navigating to the created query", async () => {
  const user = userEvent.setup();
  const clarification: QueryChatResult = {
    messages: [
      { id: "1", role: "user", content: "Latest orders" },
      { id: "2", role: "assistant", content: "Which date should I use?" },
    ],
    queryId: null,
    revision: null,
    queryUpdated: false,
  };
  mocks.chat.mockResolvedValueOnce(clarification).mockResolvedValueOnce({
    ...clarification,
    queryId: "saved-query",
    revision: "1-saved",
    queryUpdated: true,
  });
  mount();
  await user.type(
    screen.getByRole("textbox", { name: "Describe your query" }),
    "Latest orders",
  );
  await user.click(screen.getByRole("button", { name: "Build query" }));
  expect(await screen.findByText("Which date should I use?")).toBeVisible();
  expect(mocks.navigate).not.toHaveBeenCalled();
  const input = screen.getByRole("textbox", { name: "Amend your query" });
  expect(input).toHaveValue("");
  await user.type(input, "Use created_at");
  await user.click(screen.getByRole("button", { name: "Collapse Quory chat" }));
  expect(screen.getByRole("complementary", { name: "Quory" })).toBeVisible();
  expect(
    screen.queryByRole("textbox", { name: "Amend your query" }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Expand Quory chat" }),
  ).toHaveFocus();
  await user.click(screen.getByRole("button", { name: "Expand Quory chat" }));
  expect(screen.getByText("Which date should I use?")).toBeVisible();
  const restoredInput = screen.getByRole("textbox", {
    name: "Amend your query",
  });
  expect(restoredInput).toHaveValue("Use created_at");
  await user.type(restoredInput, "{Enter}");
  await waitFor(() =>
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/queries/$queryId",
      params: { queryId: "saved-query" },
    }),
  );
  expect(mocks.chat.mock.calls[1]![0].history).toEqual(clarification.messages);
});
it("retains the description on failure and retries with the same request id", async () => {
  const user = userEvent.setup();
  mocks.chat.mockRejectedValue(new Error("Provider unavailable"));
  mount();
  await user.type(
    screen.getByRole("textbox", { name: "Describe your query" }),
    "Latest orders",
  );
  await user.click(screen.getByRole("button", { name: "Build query" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Provider unavailable",
  );
  expect(screen.getByRole("textbox", { name: "Amend your query" })).toHaveValue(
    "Latest orders",
  );
  await user.click(screen.getByRole("button", { name: "Send" }));
  expect(mocks.chat.mock.calls[1]![0].requestId).toBe(
    mocks.chat.mock.calls[0]![0].requestId,
  );
});

it("discards an old chat response and draft after switching connections", async () => {
  const user = userEvent.setup();
  let finish!: (result: QueryChatResult) => void;
  mocks.chat.mockImplementation(
    () =>
      new Promise<QueryChatResult>((resolve) => {
        finish = resolve;
      }),
  );
  const view = mount();
  await user.type(
    screen.getByRole("textbox", { name: "Describe your query" }),
    "Latest orders",
  );
  await user.click(screen.getByRole("button", { name: "Build query" }));
  expect(mocks.chat.mock.calls[0]![0].connectionId).toBe("connection-1");
  expect(
    screen.getByRole("heading", { name: "Finding the right query" }),
  ).toBeVisible();
  expect(
    screen.queryByRole("heading", { name: "What would you like to explore?" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByText(/Your request and database schema are shared/),
  ).not.toBeInTheDocument();
  mocks.connectionId = "connection-2";
  view.rerender(queryPage());
  finish({
    queryId: "old-query",
    revision: "1-saved",
    queryUpdated: true,
    messages: [],
  });
  await waitFor(() =>
    expect(
      screen.getByRole("textbox", { name: "Describe your query" }),
    ).toHaveValue(""),
  );
  expect(mocks.navigate).not.toHaveBeenCalled();
  await user.type(
    screen.getByRole("textbox", { name: "Describe your query" }),
    "New orders",
  );
  await user.click(screen.getByRole("button", { name: "Build query" }));
  expect(mocks.chat.mock.calls[1]![0].connectionId).toBe("connection-2");
  expect(mocks.chat.mock.calls[1]![0].requestId).not.toBe(
    mocks.chat.mock.calls[0]![0].requestId,
  );
});
