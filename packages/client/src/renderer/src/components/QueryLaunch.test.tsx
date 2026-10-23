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
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { NewQueryDraftProvider } from "../hooks/useNewQueryDraft";
import { TooltipProvider } from "./ui/tooltip";
import { MainDimensionsContext } from "../hooks/useMainDimensions";
import type { QueryChatResult } from "../../../shared/queryChat";

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
vi.mock("../GlobalProviders", () => ({
  trpcClient: {
    projects: { list: { query: mocks.listProjects } },
    connections: { fetchActiveConnection: { query: mocks.activeConnection } },
  },
}));
vi.mock("@quory/stack/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@quory/stack/react")>()),
  useFetchSchema: () => ({
    data: { schemas: [{ name: "public", tables: [{ name: "orders" }] }] },
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
  mocks.connectionId = "connection-1";
  mocks.projectId = "app";
  mocks.open.mockResolvedValue(undefined);
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
    <NewQueryDraftProvider>
      <TooltipProvider delayDuration={0}>
        <MainDimensionsContext.Provider value={{ width: 900, height: 800 }}>
          <Page />
        </MainDimensionsContext.Provider>
      </TooltipProvider>
    </NewQueryDraftProvider>
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

it("offers only AI creation with selectors inside the prompt form", async () => {
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
  await user.click(
    screen.getByRole("button", { name: "Collapse query assistant" }),
  );
  expect(
    screen.getByRole("complementary", { name: "Query assistant" }),
  ).toBeVisible();
  expect(
    screen.queryByRole("textbox", { name: "Amend your query" }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Expand query assistant" }),
  ).toHaveFocus();
  await user.click(
    screen.getByRole("button", { name: "Expand query assistant" }),
  );
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
