import { act, renderHook } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  pathname: "/queries/current",
  blocked: false,
  navigate: vi.fn(),
  open: vi.fn(),
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
  mocks.navigate.mockImplementation(async ({ to }: { to: string }) => {
    if (!mocks.blocked) mocks.pathname = to;
  });
});
it("opens the chosen query after activating its project", async () => {
  const { result } = renderHook(() => useOpenProject());
  await act(() => result.current.openProject("team", "orders"));
  expect(mocks.open).toHaveBeenCalledWith({ projectId: "team" });
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
