import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  open: vi.fn(),
  connections: [
    { id: "staging", connection: { nickname: "Staging", colour: "blue" } },
  ],
}));
vi.mock("../util/tprc", () => ({
  default: {
    connections: {
      listSavedConnections: {
        useQuery: (...args: unknown[]) => {
          mocks.list(...args);
          return { data: { connections: mocks.connections } };
        },
      },
    },
  },
}));
import { QueryConnectionMenu } from "./QueryConnectionMenu";
function mount() {
  return render(
    <QueryConnectionMenu projectId="team" disabled={false} onOpen={mocks.open}>
      Orders
    </QueryConnectionMenu>
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.connections = [
    { id: "staging", connection: { nickname: "Staging", colour: "blue" } },
  ];
  mocks.open.mockResolvedValue(undefined);
});
it("lists the clicked query's project connections and waits for selection before opening", async () => {
  const user = userEvent.setup();
  mount();
  expect(mocks.list).toHaveBeenLastCalledWith(
    { projectId: "team" },
    { enabled: false }
  );
  await user.click(screen.getByRole("button", { name: "Orders" }));
  expect(mocks.list).toHaveBeenLastCalledWith(
    { projectId: "team" },
    { enabled: true }
  );
  expect(mocks.open).not.toHaveBeenCalled();
  await user.click(screen.getByRole("menuitem", { name: "Staging" }));
  expect(mocks.open).toHaveBeenCalledWith("staging");
  await waitFor(() =>
    expect(screen.queryByRole("menu")).not.toBeInTheDocument()
  );
});
it("shows progress and keeps failures in the dropdown so the user can retry", async () => {
  let reject!: (cause: Error) => void;
  mocks.open.mockReturnValue(
    new Promise<void>((_, fail) => {
      reject = fail;
    })
  );
  const user = userEvent.setup();
  mount();
  await user.click(screen.getByRole("button", { name: "Orders" }));
  await user.click(screen.getByRole("menuitem", { name: "Staging" }));
  expect(
    screen.getByRole("status", { name: "Connecting to Staging" })
  ).toBeVisible();
  expect(screen.getByRole("menuitem", { name: "Staging" })).toHaveAttribute(
    "aria-disabled",
    "true"
  );
  await act(async () => reject(new Error("Connection unavailable")));
  expect(screen.getByRole("alert")).toHaveTextContent("Connection unavailable");
  mocks.open.mockResolvedValue(undefined);
  await user.click(screen.getByRole("menuitem", { name: "Staging" }));
  await waitFor(() =>
    expect(screen.queryByRole("menu")).not.toBeInTheDocument()
  );
});
it("offers connection creation when the query's project has no connections", async () => {
  mocks.connections = [];
  const user = userEvent.setup();
  mount();
  await user.click(screen.getByRole("button", { name: "Orders" }));
  expect(screen.getByText("No connections in this project yet.")).toBeVisible();
  await user.click(screen.getByRole("menuitem", { name: "New connection" }));
  expect(mocks.open).toHaveBeenCalledWith(undefined);
});
