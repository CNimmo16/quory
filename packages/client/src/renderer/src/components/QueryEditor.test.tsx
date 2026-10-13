import type { ComponentType } from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import type { Query, PreparedQuery } from "@quory/core";
import { ConditionOperator } from "@quory/core";
import type { SavedQuery } from "../../../main/repositories/queryRepo";
import { schemas } from "../../../../test/queryFixtures";
import type { QueryChatResult } from "../../../shared/queryChat";
import {
  appendQueryVersion,
  createQueryHistory,
  moveQueryHistory,
  type QueryHistory,
  type QueryHistoryAction,
} from "../../../shared/queryHistory";
import type { ChatMessage } from "../../../shared/queryChat";

const mocks = vi.hoisted(() => ({
  chat: vi.fn(),
  invalidate: vi.fn(),
  changeHistory: vi.fn(),
  refresh: () => {},
  doc: {} as SavedQuery & { _id: string; _rev: string },
}));
vi.mock("@tanstack/react-router", async () => {
  const { useState, useEffect } = await import("react");
  return {
    createFileRoute: () => (options: unknown) => ({
      options,
      useParams: () => ({ queryId: "query-1" }),
      useLoaderData: () => {
        const [, refresh] = useState(0);
        useEffect(() => {
          mocks.refresh = () => refresh((value) => value + 1);
        }, []);
        return { query: mocks.doc };
      },
    }),
    useNavigate: () => vi.fn(),
    useBlocker: () => {},
    redirect: vi.fn(),
    useRouter: () => ({ invalidate: mocks.invalidate }),
  };
});
vi.mock("../GlobalProviders", () => ({ trpcClient: {} }));
vi.mock("@quory/stack/react", () => ({
  useFetchSchema: () => ({ data: { schemas } }),
}));
vi.mock("../util/tprc", () => ({
  default: {
    useUtils: () => ({
      queries: { listSavedQueries: { invalidate: async () => {} } },
    }),
    queries: {
      chat: { useMutation: () => ({ mutateAsync: mocks.chat }) },
      deleteQuery: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
      updateQuery: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
      changeQueryHistory: {
        useMutation: ({
          onSuccess,
        }: {
          onSuccess: (
            result: {
              queryHistory: QueryHistory;
              messages: ChatMessage[];
              revision: string;
            },
            input: { action: QueryHistoryAction }
          ) => Promise<void>;
        }) => ({
          mutate: async (input: {
            queryHistory: QueryHistory;
            action: QueryHistoryAction;
            messages: ChatMessage[];
          }) => {
            const result = await mocks.changeHistory(input);
            await onSuccess(result, input);
          },
          isPending: false,
        }),
      },
      updateQueryNickname: {
        useMutation: ({ onSuccess }: { onSuccess: () => Promise<void> }) => ({
          mutate: async ({ nickname }: { nickname: string }) => {
            mocks.doc = { ...mocks.doc, nickname, _rev: "2-renamed" };
            await onSuccess();
          },
          isPending: false,
        }),
      },
    },
  },
}));
vi.mock("./QueryView", async () => {
  const { useState } = await import("react");
  return {
    default: function MockQueryView({
      initialQuery,
      onQueryChange,
      showQueryText,
    }: {
      initialQuery: Query;
      onQueryChange: (query: PreparedQuery) => void;
      showQueryText?: boolean;
    }) {
      const [limit, setLimit] = useState(initialQuery.limit);
      return (
        <>
          <p>View: {showQueryText ? "Raw query" : "Query tree"}</p>
          <p>Displayed row limit: {limit}</p>
          <button
            onClick={() => {
              setLimit(7);
              onQueryChange({
                ...initialQuery,
                limit: 7,
                base: {
                  ...initialQuery.base,
                  select: ["id", "user_id", "created_at", "status"],
                  joinAlias: "public__orders__1",
                  resultAliases: {},
                  where: {
                    column: "status",
                    operator: ConditionOperator.EQUALS,
                    value: "paid",
                  },
                  joins: [],
                },
              });
            }}
          >
            Set manual row limit
          </button>
        </>
      );
    },
  };
});
import { Route } from "../routes/queries/$queryId";
import { TooltipProvider } from "./ui/tooltip";
const Page = Route.options.component as ComponentType;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.doc = {
    _id: "query-1",
    _rev: "1-saved",
    connectionId: "connection-1",
    nickname: "Orders",
    base: { tableRef: "public.orders", select: "*" },
    limit: 100,
    chatMessages: [
      { id: "a", role: "assistant", content: "Your orders query is ready." },
    ],
  };
  mocks.invalidate.mockImplementation(async () => {
    mocks.refresh();
  });
  mocks.changeHistory.mockImplementation(
    async (input: {
      queryHistory: QueryHistory;
      action: QueryHistoryAction;
      messages: ChatMessage[];
    }) => {
      const queryHistory = moveQueryHistory(input.queryHistory, input.action)!;
      const changed =
        input.action === "undo"
          ? input.queryHistory.present
          : queryHistory.present;
      const messages: ChatMessage[] = [
        ...input.messages,
        {
          id: crypto.randomUUID(),
          role: "user",
          historyAction: input.action,
          ...(changed.messageId ? { relatedMessageId: changed.messageId } : {}),
          content: `The user ${
            input.action === "undo" ? "undid" : "redid"
          } the query change.`,
        },
      ];
      mocks.doc = {
        ...mocks.doc,
        ...queryHistory.present.query,
        queryHistory,
        chatMessages: messages,
        _rev: `${mocks.doc._rev}-history`,
      };
      return { queryHistory, messages, revision: mocks.doc._rev };
    }
  );
});
function mount() {
  return render(
    <TooltipProvider>
      <Page />
    </TooltipProvider>
  );
}

it("opens manual queries with a placeholder and preserves drafts and edits when chat is toggled", async () => {
  const user = userEvent.setup();
  delete mocks.doc.chatMessages;
  mount();
  expect(screen.getByText("Refine your query with AI")).toBeVisible();
  expect(mocks.chat).not.toHaveBeenCalled();
  await user.click(
    screen.getByRole("button", { name: "Set manual row limit" })
  );
  await user.type(
    screen.getByRole("textbox", { name: "Amend your query" }),
    "Show only paid orders"
  );
  await user.click(screen.getByRole("button", { name: "Close AI chat" }));
  expect(
    screen.queryByRole("complementary", { name: "Query assistant" })
  ).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Open AI chat" })).toHaveAttribute(
    "aria-expanded",
    "false"
  );
  expect(screen.getByText("Displayed row limit: 7")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Open AI chat" }));
  expect(screen.getByRole("button", { name: "Close AI chat" })).toHaveAttribute(
    "aria-expanded",
    "true"
  );
  expect(screen.getByText("Refine your query with AI")).toBeVisible();
  expect(screen.getByRole("textbox", { name: "Amend your query" })).toHaveValue(
    "Show only paid orders"
  );
  expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled();
  mocks.chat.mockResolvedValue({
    queryId: "query-1",
    revision: "1-saved",
    queryUpdated: false,
    messages: [{ id: "a", role: "assistant", content: "Which date range?" }],
  });
  await user.click(screen.getByRole("button", { name: "Send" }));
  expect(await screen.findByText("Which date range?")).toBeVisible();
  expect(
    screen.queryByText("Refine your query with AI")
  ).not.toBeInTheDocument();
  expect(mocks.chat).toHaveBeenCalledWith(
    expect.objectContaining({
      queryId: "query-1",
      currentQuery: expect.objectContaining({ limit: 7 }),
      history: [],
    })
  );
});

it("can close and reopen chat during a request without losing the conversation", async () => {
  const user = userEvent.setup();
  let finish!: (result: QueryChatResult) => void;
  mocks.chat.mockImplementation(
    () =>
      new Promise<QueryChatResult>((resolve) => {
        finish = resolve;
      })
  );
  mount();
  await user.type(
    screen.getByRole("textbox", { name: "Amend your query" }),
    "Show recent orders{Enter}"
  );
  expect(screen.getByRole("button", { name: "Edit nickname" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Delete query" })).toBeDisabled();
  expect(
    screen.getByRole("button", { name: "Set manual row limit" })
  ).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Close AI chat" }));
  expect(screen.getByRole("button", { name: "Open AI chat" })).toBeEnabled();
  await user.click(screen.getByRole("button", { name: "Open AI chat" }));
  expect(screen.getByText("Your orders query is ready.")).toBeVisible();
  expect(screen.getByRole("status")).toHaveTextContent("Working on your query");
  await user.click(screen.getByRole("button", { name: "Close AI chat" }));
  await act(async () => {
    finish({
      queryId: "query-1",
      revision: "1-saved",
      queryUpdated: false,
      messages: [
        ...mocks.doc.chatMessages!,
        { id: "b", role: "assistant", content: "Which date range?" },
      ],
    });
  });
  await user.click(screen.getByRole("button", { name: "Open AI chat" }));
  expect(screen.getByText("Your orders query is ready.")).toBeVisible();
  expect(screen.getByText("Which date range?")).toBeVisible();
  expect(screen.getByRole("textbox", { name: "Amend your query" })).toHaveValue(
    ""
  );
  expect(mocks.chat).toHaveBeenCalledTimes(1);
});

it("includes unsaved manual edits in chat, then refreshes results from the saved amendment", async () => {
  const user = userEvent.setup();
  mocks.chat.mockImplementation(
    async ({ queryHistory }: { queryHistory: QueryHistory }) => {
      mocks.doc = { ...mocks.doc, limit: 2, _rev: "2-updated" };
      return {
        queryId: "query-1",
        revision: "2-updated",
        queryUpdated: true,
        messages: [
          { id: "b", role: "assistant", content: "Showing two rows." },
        ],
        queryHistory: appendQueryVersion(queryHistory, mocks.doc, "b"),
      };
    }
  );
  mount();
  await user.click(
    screen.getByRole("button", { name: "Set manual row limit" })
  );
  await user.type(
    screen.getByRole("textbox", { name: "Amend your query" }),
    "Only two rows{Enter}"
  );
  await waitFor(() =>
    expect(screen.getByText("Displayed row limit: 2")).toBeVisible()
  );
  expect(mocks.chat.mock.calls[0]![0]).toMatchObject({
    queryId: "query-1",
    revision: "1-saved",
    currentQuery: { limit: 7 },
  });
  expect(screen.getByText("Showing two rows.")).toBeVisible();
  expect(
    screen.queryByRole("button", { name: "Save changes" })
  ).not.toBeInTheDocument();
});

it("keeps unsaved manual edits when renaming the saved query", async () => {
  const user = userEvent.setup();
  mount();
  await user.click(
    screen.getByRole("button", { name: "Set manual row limit" })
  );
  await user.click(screen.getByRole("button", { name: "Edit nickname" }));
  await user.clear(screen.getByRole("textbox", { name: "Query nickname" }));
  await user.type(
    screen.getByRole("textbox", { name: "Query nickname" }),
    "Renamed orders"
  );
  await user.click(screen.getByRole("button", { name: "Save nickname" }));
  expect(
    await screen.findByRole("heading", { name: "Renamed orders" })
  ).toBeVisible();
  expect(screen.getByText("Displayed row limit: 7")).toBeVisible();
  expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled();
});

it("undoes and redoes manual edits, retaining history after reopening", async () => {
  const user = userEvent.setup();
  const view = mount();
  expect(
    screen.getByRole("button", { name: "Undo query change" })
  ).toBeDisabled();
  expect(
    screen.getByRole("button", { name: "Redo query change" })
  ).toBeDisabled();
  await user.click(
    screen.getByRole("button", { name: "Set manual row limit" })
  );
  await user.click(screen.getByRole("button", { name: "Undo query change" }));
  expect(await screen.findByText("Displayed row limit: 100")).toBeVisible();
  expect(
    screen.getByRole("button", { name: "Undo query change" })
  ).toBeDisabled();
  expect(
    screen.getByRole("button", { name: "Redo query change" })
  ).toBeEnabled();
  expect(screen.getByRole("status")).toHaveTextContent("Query change undone.");
  view.unmount();
  mount();
  await user.click(screen.getByRole("button", { name: "Redo query change" }));
  expect(await screen.findByText("Displayed row limit: 7")).toBeVisible();
  expect(
    screen.getByRole("button", { name: "Redo query change" })
  ).toBeDisabled();
  expect(
    screen.queryByRole("button", { name: "Save changes" })
  ).not.toBeInTheDocument();
});

it("keeps the original AI request visible and sends undo and redo notices with the restored query", async () => {
  const user = userEvent.setup();
  mocks.chat.mockImplementationOnce(
    async ({
      queryHistory,
      history,
      message,
    }: {
      queryHistory: QueryHistory;
      history: ChatMessage[];
      message: string;
    }) => {
      const messages: ChatMessage[] = [
        ...history,
        { id: "request", role: "user", content: message },
        {
          id: "amendment",
          role: "assistant",
          content: "Showing two rows.",
          queryUpdated: true,
        },
      ];
      const next = appendQueryVersion(
        queryHistory,
        { ...queryHistory.present.query, limit: 2 },
        "amendment"
      );
      mocks.doc = {
        ...mocks.doc,
        ...next.present.query,
        chatMessages: messages,
        queryHistory: next,
        _rev: "2-amended",
      };
      return {
        queryId: "query-1",
        revision: mocks.doc._rev,
        queryUpdated: true,
        messages,
        queryHistory: next,
      };
    }
  );
  mount();
  expect(screen.getByText("View: Query tree")).toBeVisible();
  await user.click(
    screen.getByRole("button", { name: "Show raw query (JSON)" })
  );
  expect(screen.getByText("View: Raw query")).toBeVisible();
  await user.click(
    screen.getByRole("button", { name: "Set manual row limit" })
  );
  await user.type(
    screen.getByRole("textbox", { name: "Amend your query" }),
    "Only two rows{Enter}"
  );
  expect(await screen.findByText("Displayed row limit: 2")).toBeVisible();
  expect(screen.getByText("View: Raw query")).toBeVisible();
  await user.type(
    screen.getByRole("textbox", { name: "Amend your query" }),
    "Keep the paid filter"
  );
  await user.click(screen.getByRole("button", { name: "Undo query change" }));
  expect(await screen.findByText("Displayed row limit: 7")).toBeVisible();
  expect(screen.getByText("View: Raw query")).toBeVisible();
  expect(
    screen.getByRole("button", { name: "Show query tree" })
  ).toHaveAttribute("aria-pressed", "true");
  await user.click(screen.getByRole("button", { name: "Show query tree" }));
  expect(screen.getByText("View: Query tree")).toBeVisible();
  expect(screen.getByText("Only two rows")).toBeVisible();
  expect(screen.getByText("Showing two rows.")).toBeVisible();
  expect(screen.getByText("Change undone")).toBeVisible();
  expect(screen.getByRole("textbox", { name: "Amend your query" })).toHaveValue(
    "Keep the paid filter"
  );
  await user.click(screen.getByRole("button", { name: "Redo query change" }));
  expect(await screen.findByText("Displayed row limit: 2")).toBeVisible();
  expect(screen.getByText("Change restored")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Undo query change" }));
  await screen.findByText("Displayed row limit: 7");
  mocks.chat.mockImplementationOnce(
    async ({ history }: { history: ChatMessage[] }) => ({
      queryId: "query-1",
      revision: mocks.doc._rev,
      queryUpdated: false,
      messages: [
        ...history,
        {
          id: "clarification",
          role: "assistant",
          content: "Which date range?",
        },
      ],
    })
  );
  await user.click(screen.getByRole("button", { name: "Send" }));
  expect(await screen.findByText("Which date range?")).toBeVisible();
  expect(mocks.chat.mock.calls[1]![0]).toMatchObject({
    currentQuery: { limit: 7, base: { where: { value: "paid" } } },
    revision: mocks.doc._rev,
    history: expect.arrayContaining([
      expect.objectContaining({ id: "request", content: "Only two rows" }),
      expect.objectContaining({
        historyAction: "undo",
        relatedMessageId: "amendment",
      }),
      expect.objectContaining({
        historyAction: "redo",
        relatedMessageId: "amendment",
      }),
    ]),
  });
});

it("discards redo after a new manual edit without erasing undone chat messages", async () => {
  const user = userEvent.setup();
  mocks.doc.queryHistory = appendQueryVersion(
    createQueryHistory({ ...mocks.doc, limit: 10 }),
    mocks.doc,
    "a"
  );
  mount();
  await user.click(screen.getByRole("button", { name: "Undo query change" }));
  expect(await screen.findByText("Displayed row limit: 10")).toBeVisible();
  await user.click(
    screen.getByRole("button", { name: "Set manual row limit" })
  );
  expect(
    screen.getByRole("button", { name: "Redo query change" })
  ).toBeDisabled();
  expect(screen.getByText("Your orders query is ready.")).toBeVisible();
  expect(screen.getByText("Query change undone")).toBeVisible();
});
