import type { ComponentType } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { MainDimensionsContext } from "../hooks/useMainDimensions";
import type { QueryChatResult } from "../../../shared/queryChat";

const mocks = vi.hoisted(() => ({
  connectionId: "connection-1",
  chat: vi.fn(),
  create: vi.fn(),
  navigate: vi.fn(),
  invalidate: vi.fn(),
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({
    options,
    useLoaderData: () => ({ connectionId: mocks.connectionId }),
  }),
  useNavigate: () => mocks.navigate,
  redirect: vi.fn(),
}));
vi.mock("../GlobalProviders", () => ({ trpcClient: {} }));
vi.mock("@quory/stack/react", () => ({
  useFetchSchema: () => ({
    data: { schemas: [{ name: "public", tables: [{ name: "orders" }] }] },
  }),
}));
vi.mock("../util/tprc", () => ({
  default: {
    useUtils: () => ({
      queries: { listSavedQueries: { invalidate: mocks.invalidate } },
    }),
    queries: {
      chat: { useMutation: () => ({ mutateAsync: mocks.chat }) },
      createQuery: {
        useMutation: () => ({
          mutate: mocks.create,
          isPending: false,
          error: null,
        }),
      },
    },
  },
}));
import { Route } from "../routes/queries/index";
const Page = Route.options.component as ComponentType;

beforeEach(() => {
  vi.resetAllMocks();
  mocks.connectionId = "connection-1";
});
function mount() {
  return render(
    <MainDimensionsContext.Provider value={{ width: 900, height: 800 }}>
      <Page />
    </MainDimensionsContext.Provider>
  );
}
it("starts with a description and retains the original table picker in secondary manual mode", async () => {
  const user = userEvent.setup();
  mount();
  expect(
    screen.getByRole("textbox", { name: "Describe your query" })
  ).toBeVisible();
  expect(screen.getByRole("button", { name: "Build query" })).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Manual mode" }));
  await user.click(screen.getByRole("option", { name: "orders" }));
  await user.click(screen.getByRole("button", { name: "Go" }));
  expect(mocks.create).toHaveBeenCalledWith({
    connectionId: "connection-1",
    query: {
      base: { tableRef: "public.orders", select: "*", joins: [] },
      limit: 100,
    },
  });
  expect(mocks.chat).not.toHaveBeenCalled();
});
it("asks for clarification in the left chat before navigating to the created query", async () => {
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
    "Latest orders"
  );
  await user.click(screen.getByRole("button", { name: "Build query" }));
  expect(await screen.findByText("Which date should I use?")).toBeVisible();
  expect(mocks.navigate).not.toHaveBeenCalled();
  const input = screen.getByRole("textbox", { name: "Amend your query" });
  expect(input).toHaveValue("");
  await user.type(input, "Use created_at{Enter}");
  await waitFor(() =>
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/queries/$queryId",
      params: { queryId: "saved-query" },
    })
  );
  expect(mocks.chat.mock.calls[1]![0].history).toEqual(clarification.messages);
});
it("retains the description on failure and retries with the same request id", async () => {
  const user = userEvent.setup();
  mocks.chat.mockRejectedValue(new Error("Provider unavailable"));
  mount();
  await user.type(
    screen.getByRole("textbox", { name: "Describe your query" }),
    "Latest orders"
  );
  await user.click(screen.getByRole("button", { name: "Build query" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Provider unavailable"
  );
  expect(screen.getByRole("textbox", { name: "Amend your query" })).toHaveValue(
    "Latest orders"
  );
  await user.click(screen.getByRole("button", { name: "Send" }));
  expect(mocks.chat.mock.calls[1]![0].requestId).toBe(
    mocks.chat.mock.calls[0]![0].requestId
  );
});

it("discards an old chat response and draft after switching connections", async () => {
  const user = userEvent.setup();
  let finish!: (result: QueryChatResult) => void;
  mocks.chat.mockImplementation(
    () =>
      new Promise<QueryChatResult>((resolve) => {
        finish = resolve;
      })
  );
  const view = mount();
  await user.type(
    screen.getByRole("textbox", { name: "Describe your query" }),
    "Latest orders"
  );
  await user.click(screen.getByRole("button", { name: "Build query" }));
  expect(mocks.chat.mock.calls[0]![0].connectionId).toBe("connection-1");
  mocks.connectionId = "connection-2";
  view.rerender(
    <MainDimensionsContext.Provider value={{ width: 900, height: 800 }}>
      <Page />
    </MainDimensionsContext.Provider>
  );
  finish({
    queryId: "old-query",
    revision: "1-saved",
    queryUpdated: true,
    messages: [],
  });
  await waitFor(() =>
    expect(
      screen.getByRole("textbox", { name: "Describe your query" })
    ).toHaveValue("")
  );
  expect(mocks.navigate).not.toHaveBeenCalled();
  await user.type(
    screen.getByRole("textbox", { name: "Describe your query" }),
    "New orders"
  );
  await user.click(screen.getByRole("button", { name: "Build query" }));
  expect(mocks.chat.mock.calls[1]![0].connectionId).toBe("connection-2");
  expect(mocks.chat.mock.calls[1]![0].requestId).not.toBe(
    mocks.chat.mock.calls[0]![0].requestId
  );
});
