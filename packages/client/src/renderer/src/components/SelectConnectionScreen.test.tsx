import type { ContextType } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { ConnectionSelectorContext } from "./ConnectionBadge";
import { SelectConnectionScreen } from "./SelectConnectionScreen";
const mocks = vi.hoisted(() => ({ navigate: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
}));
type Context = NonNullable<ContextType<typeof ConnectionSelectorContext>>;
function fixture(): Context {
  return {
    connections: ["Local", "Staging"].map((nickname, index) => ({
      id: nickname.toLowerCase(),
      isActive: false,
      connection: {
        _id: nickname.toLowerCase(),
        _rev: "1-rev",
        nickname,
        type: "postgres",
        hostOrFilePath: "localhost",
        database: "app",
        colour: index ? "blue" : "teal",
      },
    })),
    isConnecting: false,
    isBusy: false,
    connectingId: undefined,
    error: undefined,
    onSelect: vi.fn().mockResolvedValue(undefined),
    onEdit: vi.fn(),
    onCreate: vi.fn(),
    onDisconnect: vi.fn(),
  };
}
function show(context = fixture()) {
  render(
    <ConnectionSelectorContext.Provider value={context}>
      <SelectConnectionScreen queryId="orders" />
    </ConnectionSelectorContext.Provider>
  );
  return context;
}
beforeEach(() => vi.clearAllMocks());
it("lists available connections and selects the requested environment", async () => {
  const context = show();
  expect(
    screen.getByRole("heading", { name: "Select connection" })
  ).toBeVisible();
  expect(
    screen.getByRole("list", { name: "Project connections" })
  ).toBeVisible();
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Connect to Staging" }));
  expect(context.onSelect).toHaveBeenCalledWith("staging");
});
it("offers creation when the project has no connections and keeps the requested query", async () => {
  show({ ...fixture(), connections: [] });
  expect(screen.getByText(/No connections in this project yet/)).toBeVisible();
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Create a new connection" }));
  expect(mocks.navigate).toHaveBeenCalledWith({
    to: "/connections",
    search: { queryId: "orders", create: true },
  });
});
it("shows progress on the selected connection while preventing another selection", () => {
  show({
    ...fixture(),
    isConnecting: true,
    isBusy: true,
    connectingId: "staging",
  });
  const staging = screen.getByRole("button", { name: "Connect to Staging" });
  expect(staging).toHaveAttribute("aria-busy", "true");
  expect(within(staging).getByRole("status")).toHaveTextContent("Connecting");
  expect(staging).toBeDisabled();
  expect(
    screen.getByRole("button", { name: "Connect to Local" })
  ).toBeDisabled();
  expect(
    screen.getByRole("button", { name: "Create a new connection" })
  ).toBeDisabled();
});
it("displays connection failures alongside the available choices", () => {
  show({ ...fixture(), error: "Unable to connect to staging" });
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Unable to connect to staging"
  );
  expect(
    screen.getByRole("button", { name: "Connect to Local" })
  ).toBeEnabled();
});
