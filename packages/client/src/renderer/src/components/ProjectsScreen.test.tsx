import type { ComponentType } from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import type { Project } from "../../../shared/project";
const mocks = vi.hoisted(() => ({
  projects: [] as { id: string; project: Project }[],
  open: vi.fn(),
  navigate: vi.fn(),
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({
    options,
    useSearch: () => ({}),
  }),
  useNavigate: () => mocks.navigate,
  redirect: (options: unknown) => options,
}));
vi.mock("../GlobalProviders", () => ({
  trpcClient: {
    projects: { list: { query: async () => ({ projects: mocks.projects }) } },
  },
}));
vi.mock("../util/tprc", () => ({
  default: {
    projects: {
      list: { useQuery: () => ({ data: { projects: mocks.projects } }) },
      listQueries: {
        useQuery: () => ({
          data: { queries: [{ id: "orders", query: { nickname: "Orders" } }] },
        }),
      },
    },
  },
}));
vi.mock("../hooks/useOpenProject", () => ({
  useOpenProject: () => ({
    openProject: mocks.open,
    isPending: false,
    error: null,
  }),
}));
vi.mock("./ProjectForm", () => ({
  ProjectForm: () => <form aria-label="Create project" />,
}));
import { Route } from "../routes/projects/index";
const Screen = Route.options.component as ComponentType;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.projects = [];
  mocks.open.mockResolvedValue(undefined);
});
it("shows dedicated first-project creation when no projects exist", () => {
  render(<Screen />);
  expect(
    screen.getByRole("heading", { name: "Create your first project" }),
  ).toBeVisible();
  expect(screen.getByRole("form", { name: "Create project" })).toBeVisible();
});
it("redirects users with projects to global query creation on launch", async () => {
  mocks.projects = [
    { id: "app", project: { name: "App", storage: "database" } },
  ];
  const beforeLoad = Route.options.beforeLoad as () => Promise<void>;
  await expect(beforeLoad()).rejects.toEqual({ to: "/queries" });
  expect(mocks.open).not.toHaveBeenCalled();
});
