import type { ComponentType } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  search: { queryId: "orders", create: false },
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
  },
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({
    options,
    useSearch: () => mocks.search,
    useLoaderData: () => ({ connection: mocks.connection }),
  }),
  useNavigate: () => mocks.navigate,
  useRouter: () => ({ invalidate: mocks.invalidate }),
}));
vi.mock("../GlobalProviders", () => ({ trpcClient: {} }));
vi.mock("./SelectConnectionScreen", () => ({
  SelectConnectionScreen: ({ queryId }: { queryId: string }) => (
    <h1>Select connection for {queryId}</h1>
  ),
}));
vi.mock("./ConnectionForm", () => ({
  ConnectionForm: ({
    onSave,
    onConnect,
    saveText,
  }: {
    onSave: () => void;
    onConnect?: () => void;
    saveText: string;
  }) => (
    <>
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
  mocks.search = { queryId: "orders", create: false };
});
it("opens selection instead of the connection form for a disconnected query", () => {
  render(<IndexPage />);
  expect(
    screen.getByRole("heading", { name: "Select connection for orders" })
  ).toBeVisible();
  expect(
    screen.queryByRole("button", { name: "Create connection" })
  ).not.toBeInTheDocument();
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
    })
  );
  view.rerender(<EditPage />);
  await user.click(screen.getByRole("button", { name: "Connect" }));
  await waitFor(() =>
    expect(mocks.navigate).toHaveBeenLastCalledWith({
      to: "/queries/$queryId",
      params: { queryId: "orders" },
    })
  );
  expect(mocks.connect).toHaveBeenCalledWith({ connectionId: "new-id" });
  expect(mocks.invalidate).toHaveBeenCalledOnce();
});

it("returns to the disconnected query header when backing out of connection creation", async () => {
  mocks.search.create = true;
  render(<IndexPage />);
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Back to connections" }));
  expect(mocks.navigate).toHaveBeenCalledWith({
    to: "/queries/$queryId",
    params: { queryId: "orders" },
  });
});
