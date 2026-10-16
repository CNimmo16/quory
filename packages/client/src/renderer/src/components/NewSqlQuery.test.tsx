import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  navigate: vi.fn(),
  invalidate: vi.fn(),
}));
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
}));
vi.mock("../util/tprc", () => ({
  default: {
    useUtils: () => ({
      projects: { listQueries: { invalidate: mocks.invalidate } },
    }),
    queries: {
      createQuery: {
        useMutation: () => ({ mutateAsync: mocks.create, isPending: false }),
      },
    },
  },
}));
vi.mock("./SqlQueryWorkspace", () => ({
  SqlQueryWorkspace: () => <div>SQL workspace</div>,
}));
import { NewSqlQuery } from "./NewSqlQuery";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.create.mockResolvedValue({ queryId: "custom-sql" });
});
it("keeps custom SQL creation available as a component without the global entrypoint", async () => {
  const query = {
    mode: "sql" as const,
    sql: "SELECT * FROM orders",
    dialect: "postgres" as const,
  };
  render(<NewSqlQuery connectionId="local" query={query} onChange={vi.fn()} />);
  expect(screen.getByText("SQL workspace")).toBeVisible();
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Save query" }));
  await waitFor(() =>
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/queries/$queryId",
      params: { queryId: "custom-sql" },
    }),
  );
  expect(mocks.create).toHaveBeenCalledWith({ connectionId: "local", query });
  expect(mocks.invalidate).toHaveBeenCalledOnce();
});
