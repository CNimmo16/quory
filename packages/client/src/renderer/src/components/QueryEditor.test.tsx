vi.mock("./ConnectionBadge", async () => {
  const { createContext } = await import("react");
  return {
    ConnectionBadge: () => <span>Connection badge</span>,
    ConnectionSelectorContext: createContext(null),
  };
});
import type { ComponentType } from "react";
import { WindowToolbarFrame } from "./WindowToolbar";
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
} from "../../../shared/queryHistory";

const mocks = vi.hoisted(() => ({
  chat: vi.fn(),
  invalidate: vi.fn(),
  remove: vi.fn(),
  refresh: () => {},
  doc: {} as Extract<SavedQuery, { mode?: "relationship" | undefined }> & {
    _id: string;
    _rev: string;
  },
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
        return { query: mocks.doc, connectionId: "connection-1" };
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
      projects: { listQueries: { invalidate: async () => {} } },
    }),
    queries: {
      chat: { useMutation: () => ({ mutateAsync: mocks.chat }) },
      deleteQuery: {
        useMutation: () => ({ mutate: mocks.remove, isPending: false }),
      },
      updateQuery: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
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
  const { useState, useEffect } = await import("react");
  return {
    default: function MockQueryView({
      initialQuery,
      onQueryChange,
      showQueryText,
      historyControls,
    }: {
      initialQuery: Query;
      onQueryChange: (query: PreparedQuery) => void;
      showQueryText?: boolean;
      historyControls?: {
        canUndo: boolean;
        canRedo: boolean;
        onUndo: () => void;
        onRedo: () => void;
      };
    }) {
      const [limit, setLimit] = useState(initialQuery.limit);
      useEffect(() => setLimit(initialQuery.limit), [initialQuery]);
      return (
        <>
          <button
            disabled={!historyControls?.canUndo}
            onClick={historyControls?.onUndo}
          >
            Undo
          </button>
          <button
            disabled={!historyControls?.canRedo}
            onClick={historyControls?.onRedo}
          >
            Redo
          </button>
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
});
function mount() {
  return render(
    <TooltipProvider>
      <WindowToolbarFrame hasQueryHeader>
        <Page />
      </WindowToolbarFrame>
    </TooltipProvider>
  );
}

it("opens manual queries with a placeholder and preserves drafts and edits when chat is toggled", async () => {
  const user = userEvent.setup();
  delete mocks.doc.chatMessages;
  mount();
  expect(screen.getByText("Refine your query with AI")).toBeVisible();
  expect(
    screen.queryByRole("button", { name: /^(Open|Close) query assistant$/ })
  ).not.toBeInTheDocument();
  expect(mocks.chat).not.toHaveBeenCalled();
  await user.click(
    screen.getByRole("button", { name: "Set manual row limit" })
  );
  await user.type(
    screen.getByRole("textbox", { name: "Amend your query" }),
    "Show only paid orders"
  );
  await user.click(
    screen.getByRole("button", { name: "Collapse query assistant" })
  );
  expect(
    screen.getByRole("complementary", { name: "Query assistant" })
  ).toBeVisible();
  expect(
    screen.queryByRole("textbox", { name: "Amend your query" })
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Expand query assistant" })
  ).toHaveAttribute("aria-expanded", "false");
  expect(screen.getByText("Displayed row limit: 7")).toBeVisible();
  await user.click(
    screen.getByRole("button", { name: "Expand query assistant" })
  );
  expect(
    screen.getByRole("button", { name: "Collapse query assistant" })
  ).toHaveAttribute("aria-expanded", "true");
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
  expect(screen.getByRole("button", { name: "Query actions" })).toBeDisabled();
  expect(
    screen.getByRole("button", { name: "Set manual row limit" })
  ).toBeDisabled();
  await user.click(
    screen.getByRole("button", { name: "Collapse query assistant" })
  );
  expect(
    screen.getByRole("button", { name: "Expand query assistant" })
  ).toBeEnabled();
  await user.click(
    screen.getByRole("button", { name: "Expand query assistant" })
  );
  expect(screen.getByText("Your orders query is ready.")).toBeVisible();
  expect(screen.getByRole("status")).toHaveTextContent("Working on your query");
  await user.click(
    screen.getByRole("button", { name: "Collapse query assistant" })
  );
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
  await user.click(
    screen.getByRole("button", { name: "Expand query assistant" })
  );
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
    async ({ currentQuery }: { currentQuery: Query }) => {
      mocks.doc = { ...mocks.doc, limit: 2, _rev: "2-updated" };
      return {
        queryId: "query-1",
        revision: "2-updated",
        queryUpdated: true,
        messages: [
          { id: "b", role: "assistant", content: "Showing two rows." },
        ],
        queryHistory: appendQueryVersion(
          createQueryHistory(currentQuery),
          mocks.doc,
          "b"
        ),
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
  await user.click(screen.getByRole("button", { name: "Query actions" }));
  await user.click(screen.getByRole("menuitem", { name: "Rename query" }));
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

it("undoes and redoes query edits without adding chat messages, and clears redo after a new edit", async () => {
  mount();
  const user = userEvent.setup();
  expect(screen.getByRole("button", { name: "Undo" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Redo" })).toBeDisabled();
  await user.click(
    screen.getByRole("button", { name: "Set manual row limit" })
  );
  await user.click(screen.getByRole("button", { name: "Undo" }));
  expect(screen.getByText("Displayed row limit: 100")).toBeVisible();
  expect(
    screen.queryByRole("button", { name: "Save changes" })
  ).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Redo" })).toBeEnabled();
  await user.click(screen.getByRole("button", { name: "Redo" }));
  expect(screen.getByText("Displayed row limit: 7")).toBeVisible();
  expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled();
  await user.click(screen.getByRole("button", { name: "Undo" }));
  await user.click(
    screen.getByRole("button", { name: "Set manual row limit" })
  );
  expect(screen.getByRole("button", { name: "Redo" })).toBeDisabled();
  expect(mocks.chat).not.toHaveBeenCalled();
});

it("places query actions after the connection badge and confirms deletion from the menu", async () => {
  mount();
  const user = userEvent.setup();
  const actions = screen.getByRole("button", { name: "Query actions" });
  expect(actions.previousElementSibling).toHaveTextContent("Connection badge");
  expect(
    screen.queryByRole("button", { name: "Edit nickname" })
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Delete query" })
  ).not.toBeInTheDocument();
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  await user.click(actions);
  await user.click(screen.getByRole("menuitem", { name: "Delete query" }));
  expect(mocks.remove).not.toHaveBeenCalled();
  confirm.mockReturnValue(true);
  await user.click(actions);
  await user.click(screen.getByRole("menuitem", { name: "Delete query" }));
  expect(mocks.remove).toHaveBeenCalledWith({
    queryId: "query-1",
    connectionId: "connection-1",
    revision: "1-saved",
  });
  confirm.mockRestore();
});

it("hides legacy undo notices and sends only conversation plus the latest query", async () => {
  const user = userEvent.setup();
  mocks.doc.chatMessages!.push({
    id: "legacy-undo",
    role: "user",
    content: "Undid an old query change",
    historyAction: "undo",
    relatedMessageId: "a",
  });
  mount();
  expect(
    screen.queryByRole("button", { name: "Undo query change" })
  ).toBeNull();
  expect(
    screen.queryByRole("button", { name: "Redo query change" })
  ).toBeNull();
  expect(screen.queryByText("Undid an old query change")).toBeNull();
  await user.click(
    screen.getByRole("button", { name: "Set manual row limit" })
  );
  mocks.chat.mockResolvedValue({
    queryUpdated: false,
    queryId: "query-1",
    revision: mocks.doc._rev,
    messages: mocks.doc.chatMessages,
  });
  await user.type(
    screen.getByRole("textbox", { name: "Amend your query" }),
    "Keep the filter{Enter}"
  );
  await waitFor(() => expect(mocks.chat).toHaveBeenCalledOnce());
  const request = mocks.chat.mock.calls[0]![0];
  expect(request.currentQuery).toMatchObject({
    limit: 7,
    base: { where: { value: "paid" } },
  });
  expect(request).not.toHaveProperty("queryHistory");
  expect(request.history).toEqual([
    { id: "a", role: "assistant", content: "Your orders query is ready." },
  ]);
});
