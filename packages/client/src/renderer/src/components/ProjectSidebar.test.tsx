import { useState, type ComponentType, type ReactNode } from "react";
import { ConnectionBadge } from "./ConnectionBadge";
import { useConnectionSwitchGuard } from "../hooks/useConnectionSwitchGuard";
import userEvent from "@testing-library/user-event";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  pathname: "/connections",
  pendingQuery: undefined as string | undefined,
  connected: false,
  blockSwitch: false,
  localColour: undefined as "red" | undefined,
  activeProject: true,
  hasProjects: true,
  expandedProject: undefined as string | undefined,
  listQueries: vi.fn(),
  openProject: vi.fn(),
  renameProject: vi.fn(),
  deleteProject: vi.fn(),
  renameQuery: vi.fn(),
  deleteQuery: vi.fn(),
  refreshProjects: vi.fn(),
  refreshQueries: vi.fn(),
  navigate: vi.fn(),
  connect: vi.fn(),
  disconnect: vi.fn(),
  invalidateRouter: vi.fn(),
  refreshActive: vi.fn(),
  refreshConnections: vi.fn(),
}));
vi.mock("@tanstack/react-router", () => ({
  createRootRoute: (options: unknown) => ({ options }),
  Outlet: () =>
    mocks.pathname.startsWith("/queries") ? (
      <MockQueryScreen />
    ) : (
      <div>Current screen</div>
    ),
  useMatchRoute: () => () => {
    const match = /^\/queries\/([^/]+)$/.exec(mocks.pathname);
    return match ? { queryId: match[1] } : false;
  },
  useNavigate: () => mocks.navigate,
  useRouter: () => ({
    invalidate: mocks.invalidateRouter,
    state: {
      location: {
        get search() {
          return { queryId: mocks.pendingQuery };
        },
        get pathname() {
          return mocks.pathname;
        },
      },
    },
  }),
  useRouterState: ({
    select,
  }: {
    select: (state: {
      location: { pathname: string; search: { expand: string | undefined } };
    }) => unknown;
  }) =>
    select({
      location: {
        pathname: mocks.pathname,
        search: { expand: mocks.expandedProject },
      },
    }),
  redirect: vi.fn(),
}));
vi.mock("./NavLink", () => ({
  default: ({ children, to }: { children: ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
  navigationItemClassName: "",
}));
vi.mock("../GlobalProviders", () => ({ trpcClient: {} }));
vi.mock("../hooks/useOpenProject", () => ({
  useOpenProject: () => ({ openProject: mocks.openProject, isPending: false }),
}));
vi.mock("../util/tprc", () => ({
  default: {
    projects: {
      rename: {
        useMutation: () => ({
          mutateAsync: mocks.renameProject,
          isPending: false,
        }),
      },
      delete: {
        useMutation: () => ({
          mutateAsync: mocks.deleteProject,
          isPending: false,
        }),
      },
      renameQuery: {
        useMutation: () => ({
          mutateAsync: mocks.renameQuery,
          isPending: false,
        }),
      },
      deleteQuery: {
        useMutation: () => ({
          mutateAsync: mocks.deleteQuery,
          isPending: false,
        }),
      },
      list: {
        useQuery: () => ({
          data: {
            projects: mocks.hasProjects
              ? [
                  {
                    id: "app",
                    project: {
                      name: "Application",
                      storage: "database",
                      _rev: "1-project",
                    },
                  },
                  {
                    id: "team",
                    project: {
                      name: "Team",
                      storage: "database",
                      _rev: "1-team",
                    },
                  },
                ]
              : [],
            activeProject: mocks.activeProject
              ? { _id: "app", name: "Application", storage: "database" }
              : null,
          },
        }),
      },
      listQueries: {
        useQuery: (...args: unknown[]) => {
          mocks.listQueries(...args);
          return {
            data: {
              queries: [
                {
                  id: "orders",
                  query: { nickname: "Orders", _rev: "1-query" },
                },
                {
                  id: "custom",
                  query: {
                    nickname: "Custom query",
                    mode: "sql",
                    _rev: "1-sql",
                  },
                },
              ],
            },
          };
        },
      },
    },
    connections: {
      listSavedConnections: {
        useQuery: () => ({
          data: {
            connections: [
              {
                id: "local",
                connection: {
                  nickname: "Local",
                  type: "postgres",
                  colour: mocks.localColour,
                },
                isActive: mocks.connected,
              },
              {
                id: "staging",
                connection: {
                  nickname: "Staging",
                  type: "postgres",
                  colour: "blue",
                },
                isActive: false,
              },
            ],
          },
          refetch: vi.fn(),
        }),
      },
      disconnectFromDatabase: {
        useMutation: () => ({ mutate: mocks.disconnect }),
      },
      connectToDatabase: {
        useMutation: ({ onSuccess }: { onSuccess: () => Promise<void> }) => {
          const [isPending, setPending] = useState(false);
          const [variables, setVariables] = useState<{
            connectionId: string;
          }>();
          return {
            mutateAsync: async (input: { connectionId: string }) => {
              setVariables(input);
              setPending(true);
              try {
                await mocks.connect(input);
                await onSuccess();
              } finally {
                setPending(false);
              }
            },
            isPending,
            variables,
          };
        },
      },
    },
    useUtils: () => ({
      projects: {
        list: { invalidate: mocks.refreshProjects },
        listQueries: { invalidate: mocks.refreshQueries },
      },
      connections: {
        invalidate: mocks.refreshConnections,
        fetchActiveConnection: { invalidate: mocks.refreshActive },
        listSavedConnections: { invalidate: mocks.refreshConnections },
      },
    }),
  },
}));
import { Route } from "../routes/__root";
const Layout = Route.options.component as ComponentType;
function MockQueryScreen() {
  useConnectionSwitchGuard(() => mocks.blockSwitch);
  return <ConnectionBadge />;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.pathname = "/connections";
  mocks.pendingQuery = undefined;
  mocks.connected = false;
  mocks.blockSwitch = false;
  mocks.localColour = undefined;
  mocks.activeProject = true;
  mocks.hasProjects = true;
  mocks.expandedProject = undefined;
  mocks.connect.mockResolvedValue(undefined);
  mocks.openProject.mockResolvedValue(undefined);
  for (const mutation of [
    mocks.renameProject,
    mocks.deleteProject,
    mocks.renameQuery,
    mocks.deleteQuery,
  ])
    mutation.mockResolvedValue(undefined);
  mocks.navigate.mockImplementation(
    async ({ to, params }: { to: string; params?: { queryId?: string } }) => {
      mocks.pathname = params?.queryId
        ? to.replace("$queryId", params.queryId)
        : to;
    },
  );
});

it("nests saved queries under their project and removes the dedicated queries sidebar", () => {
  mocks.connected = true;
  render(<Layout />);
  const sidebar = screen.getByRole("complementary", { name: "Projects" });
  expect(screen.getAllByRole("complementary")).toHaveLength(1);
  expect(
    within(sidebar).getByRole("list", { name: "Application queries" }),
  ).toBeVisible();
  expect(
    within(sidebar).getAllByRole("button", { name: "New query" }),
  ).toHaveLength(1);
  expect(
    within(
      within(sidebar).getByRole("list", { name: "Application queries" }),
    ).queryByText("New query"),
  ).not.toBeInTheDocument();
  expect(within(sidebar).getByRole("link", { name: "Orders" })).toBeVisible();
  expect(
    within(sidebar).getByRole("link", { name: "Custom query SQL" }),
  ).toBeVisible();
  expect(within(sidebar).queryByText("Local")).not.toBeInTheDocument();
  expect(mocks.listQueries).toHaveBeenCalledWith(
    { projectId: "app" },
    expect.objectContaining({ enabled: true }),
  );
});

it("renames a project from its right-click menu without opening it", async () => {
  render(<Layout />);
  const user = userEvent.setup();
  fireEvent.contextMenu(screen.getByRole("button", { name: "Team" }), {
    clientX: 40,
    clientY: 90,
  });
  await user.click(screen.getByRole("menuitem", { name: "Rename project" }));
  await user.clear(screen.getByRole("textbox", { name: "Name" }));
  await user.type(
    screen.getByRole("textbox", { name: "Name" }),
    "Renamed team",
  );
  await user.click(screen.getByRole("button", { name: "Save name" }));
  await waitFor(() =>
    expect(mocks.renameProject).toHaveBeenCalledWith({
      projectId: "team",
      revision: "1-team",
      name: "Renamed team",
    }),
  );
  expect(mocks.openProject).not.toHaveBeenCalled();
  expect(mocks.connect).not.toHaveBeenCalled();
});

it("renames a query from an inactive project without selecting a connection", async () => {
  render(<Layout />);
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Team" }));
  const list = screen.getByRole("list", { name: "Team queries" });
  fireEvent.contextMenu(within(list).getByRole("button", { name: "Orders" }), {
    clientX: 40,
    clientY: 100,
  });
  await user.click(screen.getByRole("menuitem", { name: "Rename query" }));
  await user.clear(screen.getByRole("textbox", { name: "Name" }));
  await user.type(screen.getByRole("textbox", { name: "Name" }), "Team orders");
  await user.click(screen.getByRole("button", { name: "Save name" }));
  await waitFor(() =>
    expect(mocks.renameQuery).toHaveBeenCalledWith({
      projectId: "team",
      queryId: "orders",
      revision: "1-query",
      nickname: "Team orders",
    }),
  );
  expect(mocks.openProject).not.toHaveBeenCalled();
  expect(mocks.connect).not.toHaveBeenCalled();
});

it("does not delete the open query when leaving unsaved changes is blocked", async () => {
  mocks.connected = true;
  mocks.pathname = "/queries/orders";
  mocks.navigate.mockImplementation(async () => {});
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
  render(<Layout />);
  fireEvent.contextMenu(screen.getByRole("link", { name: "Orders" }), {
    clientX: 40,
    clientY: 100,
  });
  await userEvent
    .setup()
    .click(screen.getByRole("menuitem", { name: "Delete query" }));
  expect(mocks.navigate).toHaveBeenCalledWith({ to: "/queries" });
  expect(mocks.deleteQuery).not.toHaveBeenCalled();
  confirm.mockRestore();
});

it("confirms project deletion and leaves the current query open when deleting another project", async () => {
  mocks.pathname = "/queries/orders";
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  render(<Layout />);
  const user = userEvent.setup();
  fireEvent.contextMenu(screen.getByRole("button", { name: "Team" }), {
    clientX: 40,
    clientY: 100,
  });
  await user.click(screen.getByRole("menuitem", { name: "Delete project" }));
  expect(mocks.deleteProject).not.toHaveBeenCalled();
  confirm.mockReturnValue(true);
  fireEvent.contextMenu(screen.getByRole("button", { name: "Team" }), {
    clientX: 40,
    clientY: 100,
  });
  await user.click(screen.getByRole("menuitem", { name: "Delete project" }));
  await waitFor(() =>
    expect(mocks.deleteProject).toHaveBeenCalledWith({
      projectId: "team",
      revision: "1-team",
    }),
  );
  expect(mocks.navigate).not.toHaveBeenCalled();
  expect(mocks.pathname).toBe("/queries/orders");
  confirm.mockRestore();
});

it("collapses and expands the nested project queries", async () => {
  mocks.connected = true;
  render(<Layout />);
  const user = userEvent.setup();
  await user.click(
    screen.getByRole("button", { name: "Collapse projects sidebar" }),
  );
  expect(
    screen.queryByRole("link", { name: "Orders" }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Connection: Local" }),
  ).toBeVisible();
  await user.click(
    screen.getByRole("button", { name: "Expand projects sidebar" }),
  );
  expect(screen.getByRole("link", { name: "Orders" })).toBeVisible();
  expect(mocks.navigate).not.toHaveBeenCalled();
});

it("highlights the selected project instead of the global New query button", async () => {
  mocks.pathname = "/queries";
  render(<Layout />);
  const button = screen.getByRole("button", { name: "New query" });
  expect(button).not.toHaveAttribute("data-status", "active");
  expect(button).not.toHaveAttribute("aria-current");
  expect(screen.getByRole("button", { name: "Application" })).toHaveAttribute(
    "data-status",
    "active",
  );
  expect(screen.getByRole("button", { name: "Team" })).not.toHaveAttribute(
    "data-status",
    "active",
  );
  await userEvent.setup().click(button);
  expect(mocks.navigate).toHaveBeenCalledWith({ to: "/queries" });
});

it("highlights no project when global query creation has no selected project", () => {
  mocks.pathname = "/queries";
  mocks.activeProject = false;
  render(<Layout />);
  expect(screen.getByRole("button", { name: "New query" })).not.toHaveAttribute(
    "aria-current",
  );
  for (const name of ["Application", "Team"]) {
    expect(screen.getByRole("button", { name })).not.toHaveAttribute(
      "data-status",
      "active",
    );
    expect(screen.getByRole("button", { name })).not.toHaveAttribute(
      "aria-current",
    );
  }
});

it("toggles each project's queries independently without changing the current query or connection", async () => {
  mocks.connected = true;
  mocks.pathname = "/queries/orders";
  render(<Layout />);
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Team" }));
  expect(screen.getByRole("list", { name: "Team queries" })).toBeVisible();
  expect(
    screen.getByRole("list", { name: "Application queries" }),
  ).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Application" }));
  expect(
    screen.queryByRole("list", { name: "Application queries" }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("list", { name: "Team queries" })).toBeVisible();
  expect(mocks.openProject).not.toHaveBeenCalled();
  expect(mocks.navigate).not.toHaveBeenCalled();
  expect(mocks.connect).not.toHaveBeenCalled();
  expect(mocks.pathname).toBe("/queries/orders");
  await user.click(
    within(screen.getByRole("list", { name: "Team queries" })).getByRole(
      "button",
      { name: "Orders" },
    ),
  );
  expect(mocks.openProject).not.toHaveBeenCalled();
  await user.click(screen.getByRole("menuitem", { name: "Local" }));
  expect(mocks.openProject).toHaveBeenCalledWith("team", "orders", "local");
});

it("shows the first-project screen without sidebars when there are no projects", () => {
  mocks.pathname = "/projects";
  mocks.activeProject = false;
  mocks.hasProjects = false;
  render(<Layout />);
  expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
  expect(screen.getByText("Current screen")).toBeVisible();
});

async function openConnections() {
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: /^Connection:/ }));
}

it("shows the projects sidebar on launch without selecting a project or showing a connection badge", async () => {
  mocks.pathname = "/projects";
  mocks.activeProject = false;
  render(<Layout />);
  const sidebar = screen.getByRole("complementary", { name: "Projects" });
  expect(
    within(sidebar).getByRole("button", { name: "Application" }),
  ).toBeVisible();
  expect(
    within(sidebar).getByRole("link", { name: "New project" }),
  ).toBeVisible();
  expect(
    screen.queryByRole("button", { name: /^Connection:/ }),
  ).not.toBeInTheDocument();
  await userEvent
    .setup()
    .click(within(sidebar).getByRole("button", { name: "Application" }));
  const queries = within(sidebar).getByRole("list", {
    name: "Application queries",
  });
  await userEvent
    .setup()
    .click(within(queries).getByRole("button", { name: "Orders" }));
  expect(mocks.openProject).not.toHaveBeenCalled();
  await userEvent
    .setup()
    .click(screen.getByRole("menuitem", { name: "Local" }));
  expect(mocks.openProject).toHaveBeenCalledWith("app", "orders", "local");
});

it("expands a newly created project in the sidebar while waiting for query selection", () => {
  mocks.pathname = "/projects";
  mocks.activeProject = false;
  mocks.expandedProject = "team";
  render(<Layout />);
  expect(screen.getByRole("list", { name: "Team queries" })).toBeVisible();
  expect(
    screen.queryByRole("list", { name: "Application queries" }),
  ).not.toBeInTheDocument();
  expect(mocks.openProject).not.toHaveBeenCalled();
});

it("opens the project connections from the badge and marks the active connection", async () => {
  mocks.connected = true;
  mocks.pathname = "/queries/orders";
  render(<Layout />);
  expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  await openConnections();
  expect(screen.getByRole("menuitem", { name: "Local" })).toHaveAttribute(
    "aria-current",
    "true",
  );
  expect(screen.getByRole("menuitem", { name: "Staging" })).toBeVisible();
  expect(
    screen.getByRole("menuitem", { name: "New connection" }),
  ).toBeVisible();
});

it("shows the configured connection colour as a dot and tinted badge", () => {
  mocks.connected = true;
  mocks.localColour = "red";
  render(<Layout />);
  const badge = screen.getByRole("button", { name: "Connection: Local" });
  expect(badge).toHaveClass("bg-connection-6/10");
  expect(badge.querySelector(".rounded-full.bg-connection-6")).not.toBeNull();
});

it.each(["orders", "custom"])(
  "keeps the saved %s query when selecting another environment from the badge",
  async (queryId) => {
    mocks.connected = true;
    mocks.pathname = `/queries/${queryId}`;
    render(<Layout />);
    await openConnections();
    await userEvent
      .setup()
      .click(screen.getByRole("menuitem", { name: "Staging" }));
    await waitFor(() => expect(mocks.invalidateRouter).toHaveBeenCalledOnce());
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(mocks.pathname).toBe(`/queries/${queryId}`);
    expect(mocks.connect).toHaveBeenCalledWith({ connectionId: "staging" });
    expect(mocks.refreshActive).toHaveBeenCalledOnce();
    expect(mocks.refreshConnections).toHaveBeenCalledOnce();
  },
);

it("does not change connections when the unsaved-query guard blocks switching", async () => {
  mocks.connected = true;
  mocks.pathname = "/queries/orders";
  mocks.blockSwitch = true;
  render(<Layout />);
  await openConnections();
  await userEvent
    .setup()
    .click(screen.getByRole("menuitem", { name: "Staging" }));
  expect(mocks.navigate).not.toHaveBeenCalled();
  expect(mocks.connect).not.toHaveBeenCalled();
});

it("retains right-click edit and disconnect actions for dropdown connections", async () => {
  mocks.connected = true;
  render(<Layout />);
  await openConnections();
  fireEvent.contextMenu(screen.getByRole("menuitem", { name: "Local" }), {
    clientX: 50,
    clientY: 100,
  });
  await userEvent
    .setup()
    .click(screen.getByRole("menuitem", { name: "Edit connection" }));
  expect(mocks.navigate).toHaveBeenCalledWith({
    to: "/connections/$connectionId",
    params: { connectionId: "local" },
  });
  expect(mocks.connect).not.toHaveBeenCalled();
});

it("opens the connection form from the dropdown", async () => {
  render(<Layout />);
  await openConnections();
  await userEvent
    .setup()
    .click(screen.getByRole("menuitem", { name: "New connection" }));
  expect(mocks.navigate).toHaveBeenCalledWith({ to: "/connections" });
});

it("keeps a disconnected query selected when creating a connection from its header badge", async () => {
  mocks.pathname = "/queries/orders";
  render(<Layout />);
  await openConnections();
  await userEvent
    .setup()
    .click(screen.getByRole("menuitem", { name: "New connection" }));
  expect(mocks.navigate).toHaveBeenCalledWith({
    to: "/connections",
    search: { queryId: "orders", create: true },
  });
});

it("leaves the current query open when choosing the active connection", async () => {
  mocks.connected = true;
  mocks.pathname = "/queries/orders";
  render(<Layout />);
  await openConnections();
  await userEvent
    .setup()
    .click(screen.getByRole("menuitem", { name: "Local" }));
  expect(mocks.navigate).not.toHaveBeenCalled();
  expect(mocks.connect).not.toHaveBeenCalled();
});

it("loads the new query screen when selecting the first connection", async () => {
  render(<Layout />);
  await openConnections();
  await userEvent
    .setup()
    .click(screen.getByRole("menuitem", { name: "Staging" }));
  await waitFor(() =>
    expect(mocks.navigate).toHaveBeenLastCalledWith({ to: "/queries" }),
  );
});

it("shows a spinner on the selected connection and badge while connecting", async () => {
  let finish!: () => void;
  mocks.connect.mockReturnValue(
    new Promise<void>((resolve) => {
      finish = resolve;
    }),
  );
  mocks.connected = true;
  mocks.pathname = "/queries/orders";
  render(<Layout />);
  await openConnections();
  await userEvent
    .setup()
    .click(screen.getByRole("menuitem", { name: "Staging" }));
  const selected = screen.getByRole("menuitem", { name: "Staging" });
  expect(
    within(selected).getByRole("status", { name: "Connecting to Staging" }),
  ).toBeVisible();
  expect(selected).toHaveAttribute("aria-disabled", "true");
  expect(
    screen.getByRole("button", { name: "Connecting to Staging" }),
  ).toHaveAttribute("aria-busy", "true");
  expect(mocks.invalidateRouter).not.toHaveBeenCalled();
  expect(mocks.pathname).toBe("/queries/orders");
  expect(mocks.navigate).not.toHaveBeenCalled();
  finish();
  await waitFor(() => expect(mocks.invalidateRouter).toHaveBeenCalledOnce());
  expect(mocks.navigate).not.toHaveBeenCalled();
  expect(mocks.pathname).toBe("/queries/orders");
  expect(
    screen.queryByRole("status", { name: "Connecting to Staging" }),
  ).not.toBeInTheDocument();
});

it("keeps the existing query open if connecting fails", async () => {
  mocks.connect.mockRejectedValue(new Error("Connection unavailable"));
  mocks.connected = true;
  mocks.pathname = "/queries/orders";
  render(<Layout />);
  await openConnections();
  await userEvent
    .setup()
    .click(screen.getByRole("menuitem", { name: "Staging" }));
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Connection: Local" }),
    ).toBeVisible(),
  );
  expect(mocks.navigate).not.toHaveBeenCalled();
  expect(mocks.pathname).toBe("/queries/orders");
  expect(mocks.refreshActive).not.toHaveBeenCalled();
});

it("opens the selected project query after choosing a connection while disconnected", async () => {
  mocks.pendingQuery = "orders";
  render(<Layout />);
  await openConnections();
  await userEvent
    .setup()
    .click(screen.getByRole("menuitem", { name: "Staging" }));
  await waitFor(() =>
    expect(mocks.navigate).toHaveBeenLastCalledWith({
      to: "/queries/$queryId",
      params: { queryId: "orders" },
    }),
  );
});

it("disconnects the active environment through its right-click menu", async () => {
  mocks.connected = true;
  render(<Layout />);
  await openConnections();
  fireEvent.contextMenu(screen.getByRole("menuitem", { name: "Local" }), {
    clientX: 50,
    clientY: 100,
  });
  await userEvent
    .setup()
    .click(screen.getByRole("menuitem", { name: "Disconnect" }));
  await waitFor(() => expect(mocks.disconnect).toHaveBeenCalledOnce());
});
