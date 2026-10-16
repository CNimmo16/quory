import { act, renderHook } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  pathname: "/queries/current",
  blocked: false,
  navigate: vi.fn(),
  open: vi.fn(),
  connect: vi.fn(),
  refreshProjects: vi.fn(),
  refreshConnections: vi.fn(),
  refreshQueries: vi.fn(),
  invalidate: vi.fn(),
}));
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
  useRouter: () => ({
    state: {
      location: {
        get pathname() {
          return mocks.pathname;
        },
      },
    },
    invalidate: mocks.invalidate,
  }),
}));
vi.mock("../util/tprc", () => ({
  default: {
    projects: { open: { useMutation: () => ({ mutateAsync: mocks.open }) } },
    connections: {
      connectToDatabase: {
        useMutation: () => ({ mutateAsync: mocks.connect }),
      },
    },
    useUtils: () => ({
      projects: {
        list: { invalidate: mocks.refreshProjects },
        listQueries: { invalidate: mocks.refreshQueries },
      },
      connections: { invalidate: mocks.refreshConnections },
    }),
  },
}));
import { useOpenProject } from "./useOpenProject";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.pathname = "/queries/current";
  mocks.blocked = false;
  mocks.open.mockResolvedValue(undefined);
  mocks.connect.mockResolvedValue(undefined);
  mocks.navigate.mockImplementation(async ({ to }: { to: string }) => {
    if (!mocks.blocked) mocks.pathname = to;
  });
});
it("opens the chosen query after activating its project", async () => {
  const { result } = renderHook(() => useOpenProject());
  await act(() => result.current.openProject("team", "orders", "staging"));
  expect(mocks.open).toHaveBeenCalledWith({ projectId: "team" });
  expect(mocks.connect).toHaveBeenCalledWith({ connectionId: "staging" });
  expect(mocks.navigate).toHaveBeenLastCalledWith({
    to: "/queries/$queryId",
    params: { queryId: "orders" },
  });
  expect(mocks.refreshQueries).toHaveBeenCalledOnce();
  expect(mocks.refreshConnections).toHaveBeenCalledOnce();
  expect(mocks.invalidate).toHaveBeenCalledOnce();
});
it("does not switch projects when leaving the current query is blocked", async () => {
  mocks.blocked = true;
  const { result } = renderHook(() => useOpenProject());
  await act(() => result.current.openProject("team", "orders"));
  expect(mocks.open).not.toHaveBeenCalled();
  expect(mocks.refreshConnections).not.toHaveBeenCalled();
  expect(mocks.pathname).toBe("/queries/current");
});
it("shows global query creation after creating a project without activating it", async () => {
  const { result } = renderHook(() => useOpenProject());
  await act(() => result.current.showCreatedProject("team"));
  expect(mocks.navigate).toHaveBeenCalledWith({
    to: "/queries",
  });
  expect(mocks.refreshProjects).toHaveBeenCalledOnce();
  expect(mocks.open).not.toHaveBeenCalled();
  expect(mocks.refreshConnections).not.toHaveBeenCalled();
});
it("does not open the query before connecting completes", async () => {
  let finish!: () => void;
  mocks.connect.mockReturnValue(
    new Promise<void>((resolve) => {
      finish = resolve;
    }),
  );
  const { result } = renderHook(() => useOpenProject());
  let opening!: Promise<void>;
  await act(async () => {
    opening = result.current.openProject("team", "orders", "staging");
  });
  expect(mocks.navigate).not.toHaveBeenCalledWith(
    expect.objectContaining({ to: "/queries/$queryId" }),
  );
  expect(result.current.isPending).toBe(true);
  await act(async () => {
    finish();
    await opening;
  });
  expect(mocks.navigate).toHaveBeenLastCalledWith({
    to: "/queries/$queryId",
    params: { queryId: "orders" },
  });
});
it("keeps failed connections out of the query view", async () => {
  mocks.connect.mockRejectedValue(new Error("Connection unavailable"));
  const { result } = renderHook(() => useOpenProject());
  await act(async () => {
    await expect(
      result.current.openProject("team", "orders", "staging"),
    ).rejects.toThrow("Connection unavailable");
  });
  expect(mocks.navigate).not.toHaveBeenCalledWith(
    expect.objectContaining({ to: "/queries/$queryId" }),
  );
  expect(mocks.refreshConnections).toHaveBeenCalledOnce();
});
it("opens connection creation with the intended query retained", async () => {
  const { result } = renderHook(() => useOpenProject());
  await act(() => result.current.openProject("team", "orders"));
  expect(mocks.connect).not.toHaveBeenCalled();
  expect(mocks.navigate).toHaveBeenLastCalledWith({
    to: "/connections",
    search: { queryId: "orders", create: true },
  });
});
