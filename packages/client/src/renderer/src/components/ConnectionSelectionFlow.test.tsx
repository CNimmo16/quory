import type { ComponentType } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  search: {
    queryId: "orders",
    create: false,
    sourceConnectionId: undefined as string | undefined,
  },
  listConnections: vi.fn(),
  extraNicknames: [] as string[],
  navigate: vi.fn(),
  invalidate: vi.fn(),
  save: vi.fn(),
  connect: vi.fn(),
  refreshActive: vi.fn(),
  refreshConnections: vi.fn(),
  connection: {
    _id: "new-id",
    _rev: "1-rev",
    nickname: "Staging",
    type: "postgres",
    hostOrFilePath: "localhost",
    database: "app",
    username: "app",
    password: "secret",
    port: 5432,
    colour: "red",
    writeProtection: "confirm-before-write",
    temporary: true,
    ssl: {
      mode: "verify-full",
      ca: "CA PEM",
      cert: "CERT PEM",
      key: "KEY PEM",
    },
  },
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: (path: string) => (options: unknown) => ({
    options,
    useSearch: () => mocks.search,
    useLoaderData: () =>
      path === "/connections/"
        ? {
            connections: [
              { id: "new-id", connection: mocks.connection },
              ...mocks.extraNicknames.map((nickname) => ({
                id: nickname,
                connection: { ...mocks.connection, nickname },
              })),
            ],
            source: mocks.search.sourceConnectionId
              ? { id: "new-id", connection: mocks.connection }
              : undefined,
          }
        : { connection: mocks.connection },
  }),
  useNavigate: () => mocks.navigate,
  useRouter: () => ({ invalidate: mocks.invalidate }),
}));
vi.mock("../GlobalProviders", () => ({
  trpcClient: {
    connections: { listSavedConnections: { query: mocks.listConnections } },
  },
}));
vi.mock("./ConnectionForm", () => ({
  ConnectionForm: ({
    onSave,
    onConnect,
    saveText,
    config,
  }: {
    onSave: () => void;
    onConnect?: () => void;
    saveText: string;
    config: unknown;
  }) => (
    <>
      <output data-testid="config">{JSON.stringify(config)}</output>
      <button onClick={onSave}>{saveText}</button>
      {onConnect && <button onClick={onConnect}>Connect</button>}
    </>
  ),
}));
vi.mock("../util/tprc", () => ({
  default: {
    useUtils: () => ({
      connections: {
        listSavedConnections: { invalidate: mocks.refreshConnections },
        fetchActiveConnection: { invalidate: mocks.refreshActive },
      },
    }),
    connections: {
      saveConnection: {
        useMutation: ({
          onSuccess,
        }: {
          onSuccess: (data: { connectionId: string }) => void | Promise<void>;
        }) => ({
          mutate: async (input: unknown) => {
            mocks.save(input);
            await onSuccess({ connectionId: "new-id" });
          },
          isPending: false,
        }),
      },
      connectToDatabase: {
        useMutation: ({ onSuccess }: { onSuccess: () => Promise<void> }) => ({
          mutate: async (input: unknown) => {
            mocks.connect(input);
            await onSuccess();
          },
          isPending: false,
        }),
      },
      deleteConnection: { useMutation: () => ({ mutate: vi.fn() }) },
    },
  },
}));
import { Route as IndexRoute } from "../routes/connections/index";
import { Route as EditRoute } from "../routes/connections/$connectionId";
const IndexPage = IndexRoute.options.component as ComponentType;
const EditPage = EditRoute.options.component as ComponentType;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.extraNicknames = [];
  mocks.search = {
    queryId: "orders",
    create: false,
    sourceConnectionId: undefined,
  };
});
it("opens the connection form directly without the removed selection screen", () => {
  render(<IndexPage />);
  expect(screen.getByRole("heading", { name: "New connection" })).toBeVisible();
  expect(
    screen.getByRole("button", { name: "Create connection" }),
  ).toBeVisible();
});
it("preserves the target query through creation and connecting", async () => {
  mocks.search.create = true;
  const user = userEvent.setup();
  const view = render(<IndexPage />);
  await user.click(screen.getByRole("button", { name: "Create connection" }));
  await waitFor(() =>
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/connections/$connectionId",
      params: { connectionId: "new-id" },
      search: { queryId: "orders" },
    }),
  );
  view.rerender(<EditPage />);
  await user.click(screen.getByRole("button", { name: "Connect" }));
  await waitFor(() =>
    expect(mocks.navigate).toHaveBeenLastCalledWith({
      to: "/queries/$queryId",
      params: { queryId: "orders" },
    }),
  );
  expect(mocks.connect).toHaveBeenCalledWith({ connectionId: "new-id" });
  expect(mocks.invalidate).toHaveBeenCalledOnce();
});

it("returns to the global query screen when backing out of connection creation", async () => {
  mocks.search.create = true;
  render(<IndexPage />);
  await userEvent.setup().click(screen.getByRole("button", { name: "Back" }));
  expect(mocks.navigate).toHaveBeenCalledWith({
    to: "/queries",
  });
});

it("duplicates settings into a new identity and keeps the source unchanged", async () => {
  mocks.search.sourceConnectionId = "new-id";
  render(<IndexPage />);
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Create connection" }));
  expect(mocks.save).toHaveBeenCalledWith({
    config: expect.objectContaining({
      nickname: "Staging copy",
      hostOrFilePath: "localhost",
      password: "secret",
      temporary: false,
      colour: "red",
      writeProtection: "confirm-before-write",
      ssl: mocks.connection.ssl,
    }),
  });
  const input = mocks.save.mock.calls[0]![0];
  expect(input.connectionId).toBeUndefined();
  expect(input.config._id).toBeUndefined();
  expect(input.config._rev).toBeUndefined();
  expect(input.config.projectId).toBeUndefined();
  expect(mocks.connection.nickname).toBe("Staging");
});

it("prefills a new connection from the project's selector and can start over", async () => {
  const user = userEvent.setup();
  render(<IndexPage />);
  await user.click(
    screen.getByRole("combobox", { name: "Start from an existing connection" }),
  );
  await user.click(screen.getByRole("option", { name: "Staging" }));
  expect(JSON.parse(screen.getByTestId("config").textContent!)).toMatchObject({
    nickname: "Staging copy",
    database: "app",
    username: "app",
    password: "secret",
  });
  await user.click(
    screen.getByRole("combobox", { name: "Start from an existing connection" }),
  );
  await user.click(screen.getByRole("option", { name: "Start from scratch" }));
  expect(JSON.parse(screen.getByTestId("config").textContent!)).toEqual({
    hostOrFilePath: "localhost",
    temporary: false,
  });
});

it("chooses an unused nickname for a duplicate", async () => {
  mocks.search.sourceConnectionId = "new-id";
  mocks.extraNicknames = ["Staging copy", "Staging copy 2"];
  render(<IndexPage />);
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Create connection" }));
  expect(mocks.save).toHaveBeenCalledWith({
    config: expect.objectContaining({ nickname: "Staging copy 3" }),
  });
});

it("rejects a duplicate source outside the active project's connections", async () => {
  mocks.listConnections.mockResolvedValue({
    connections: [{ id: "local", connection: mocks.connection }],
  });
  const loader = IndexRoute.options.loader as (context: {
    deps: { sourceConnectionId: string };
  }) => Promise<unknown>;
  await expect(
    loader({ deps: { sourceConnectionId: "other-project-connection" } }),
  ).rejects.toThrow("current project");
  expect(mocks.listConnections).toHaveBeenCalledWith();
});
