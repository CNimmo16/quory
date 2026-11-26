vi.mock("./ConnectionBadge", async () => {
  const { createContext } = await import("react");
  return {
    ConnectionBadge: () => <span>Connection badge</span>,
    ConnectionSelectorContext: createContext(null),
  };
});
import type { ComponentType } from "react";
import { WindowToolbarFrame } from "./WindowToolbar";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import type { Query, PreparedQuery } from "@quory/core";
import { ConditionOperator } from "@quory/core";
import type { CustomSqlQuery, QueryDefinition } from "../../../shared/sqlQuery";
import type { SavedQuery } from "../../../main/repositories/queryRepo";
import { schemas } from "../../../../test/queryFixtures";
import type { QueryChatResult } from "../../../shared/queryChat";
import {
  appendQueryVersion,
  createQueryHistory,
} from "../../../shared/queryHistory";

const mocks = vi.hoisted(() => ({
  customSql: false,
  sqlQuery: {
    mode: "sql",
    sql: "SELECT 1",
    dialect: "postgres",
  } as CustomSqlQuery,
  chat: vi.fn(),
  renderQueryView: vi.fn(),
  save: vi.fn(),
  update: vi.fn(),
  block: null as null | (() => boolean),
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
        return {
          query: mocks.customSql
            ? {
                ...mocks.sqlQuery,
                projectId: mocks.doc.projectId,
                nickname: mocks.doc.nickname,
                ephemeral: mocks.doc.ephemeral,
                _id: mocks.doc._id,
                _rev: mocks.doc._rev,
              }
            : mocks.doc,
          connectionId: "connection-1",
          dialect: "postgres",
        };
      },
    }),
    useNavigate: () => vi.fn(),
    useBlocker: ({ shouldBlockFn }: { shouldBlockFn: () => boolean }) => {
      mocks.block = shouldBlockFn;
    },
    redirect: vi.fn(),
    useRouter: () => ({ invalidate: mocks.invalidate }),
  };
});
vi.mock("../util/trpcClient", () => ({ trpcClient: {} }));
vi.mock("@quory/stack/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@quory/stack/react")>()),
  useFetchSchema: () => ({ data: { schemas } }),
}));
vi.mock("../util/tprc", () => ({
  default: {
    useUtils: () => ({
      projects: { listQueries: { invalidate: async () => {} } },
    }),
    queries: {
      saveQuery: {
        useMutation: ({ onSuccess }: { onSuccess: () => Promise<void> }) => ({
          isPending: false,
          mutate: async (input: {
            query: QueryDefinition;
            nickname: string;
          }) => {
            mocks.save(input);
            if (input.query.mode === "sql") mocks.sqlQuery = input.query;
            else mocks.doc = { ...mocks.doc, ...input.query };
            mocks.doc = {
              ...mocks.doc,
              nickname: input.nickname,
              ephemeral: false,
              _rev: "1-saved",
            };
            await onSuccess();
          },
        }),
      },
      chat: { useMutation: () => ({ mutateAsync: mocks.chat }) },
      deleteQuery: {
        useMutation: () => ({ mutate: mocks.remove, isPending: false }),
      },
      updateQuery: {
        useMutation: () => ({ mutate: mocks.update, isPending: false }),
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
vi.mock("./SqlQueryWorkspace", () => ({
  SqlQueryWorkspace: ({
    query,
    onChange,
  }: {
    query: CustomSqlQuery;
    onChange: (query: CustomSqlQuery) => void;
  }) => (
    <textarea
      aria-label="SQL query"
      value={query.sql}
      onChange={(event) => onChange({ ...query, sql: event.target.value })}
    />
  ),
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
      mocks.renderQueryView();
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
  mocks.customSql = false;
  mocks.sqlQuery = { mode: "sql", sql: "SELECT 1", dialect: "postgres" };
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
    </TooltipProvider>,
  );
}

it("opens manual queries with a placeholder and preserves drafts and edits when chat is toggled", async () => {
  const user = userEvent.setup();
  delete mocks.doc.chatMessages;
  mount();
  expect(screen.getByText("Refine your query with Quory")).toBeVisible();
  expect(
    screen.queryByRole("button", { name: /^(Open|Close) Quory chat$/ }),
  ).not.toBeInTheDocument();
  expect(mocks.chat).not.toHaveBeenCalled();
  await user.click(
    screen.getByRole("button", { name: "Set manual row limit" }),
  );
  await user.type(
    screen.getByRole("textbox", { name: "Amend your query" }),
    "Show only paid orders",
  );
  await user.click(screen.getByRole("button", { name: "Collapse Quory chat" }));
  expect(screen.getByRole("complementary", { name: "Quory" })).toBeVisible();
  expect(
    screen.queryByRole("textbox", { name: "Amend your query" }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Expand Quory chat" }),
  ).toHaveAttribute("aria-expanded", "false");
  expect(screen.getByText("Displayed row limit: 7")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Expand Quory chat" }));
  expect(
    screen.getByRole("button", { name: "Collapse Quory chat" }),
  ).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByText("Refine your query with Quory")).toBeVisible();
  expect(screen.getByRole("textbox", { name: "Amend your query" })).toHaveValue(
    "Show only paid orders",
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
    screen.queryByText("Refine your query with Quory"),
  ).not.toBeInTheDocument();
  expect(mocks.chat).toHaveBeenCalledWith(
    expect.objectContaining({
      queryId: "query-1",
      currentQuery: expect.objectContaining({ limit: 7 }),
      history: [],
    }),
  );
});

it("can close and reopen chat during a request without losing the conversation", async () => {
  const user = userEvent.setup();
  let finish!: (result: QueryChatResult) => void;
  mocks.chat.mockImplementation(
    () =>
      new Promise<QueryChatResult>((resolve) => {
        finish = resolve;
      }),
  );
  mount();
  await user.type(
    screen.getByRole("textbox", { name: "Amend your query" }),
    "Show recent orders{Enter}",
  );
  expect(screen.getByRole("button", { name: "Query actions" })).toBeDisabled();
  expect(
    screen.getByRole("button", { name: "Set manual row limit" }),
  ).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Collapse Quory chat" }));
  expect(
    screen.getByRole("button", { name: "Expand Quory chat" }),
  ).toBeEnabled();
  await user.click(screen.getByRole("button", { name: "Expand Quory chat" }));
  expect(screen.getByText("Your orders query is ready.")).toBeVisible();
  expect(screen.getByRole("status")).toHaveTextContent(
    "Quory is working on your query",
  );
  await user.click(screen.getByRole("button", { name: "Collapse Quory chat" }));
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
  await user.click(screen.getByRole("button", { name: "Expand Quory chat" }));
  expect(screen.getByText("Your orders query is ready.")).toBeVisible();
  expect(screen.getByText("Which date range?")).toBeVisible();
  expect(screen.getByRole("textbox", { name: "Amend your query" })).toHaveValue(
    "",
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
          "b",
        ),
      };
    },
  );
  mount();
  await user.click(
    screen.getByRole("button", { name: "Set manual row limit" }),
  );
  await user.type(
    screen.getByRole("textbox", { name: "Amend your query" }),
    "Only two rows{Enter}",
  );
  await waitFor(() =>
    expect(screen.getByText("Displayed row limit: 2")).toBeVisible(),
  );
  expect(mocks.chat.mock.calls[0]![0]).toMatchObject({
    queryId: "query-1",
    revision: "1-saved",
    currentQuery: { limit: 7 },
  });
  expect(screen.getByText("Showing two rows.")).toBeVisible();
  expect(
    screen.queryByRole("button", { name: "Save changes" }),
  ).not.toBeInTheDocument();
});

it("keeps unsaved manual edits when renaming the saved query", async () => {
  const user = userEvent.setup();
  mount();
  await user.click(
    screen.getByRole("button", { name: "Set manual row limit" }),
  );
  await user.click(screen.getByRole("button", { name: "Query actions" }));
  await user.click(screen.getByRole("menuitem", { name: "Rename query" }));
  await user.clear(screen.getByRole("textbox", { name: "Query nickname" }));
  await user.type(
    screen.getByRole("textbox", { name: "Query nickname" }),
    "Renamed orders",
  );
  await user.click(screen.getByRole("button", { name: "Save nickname" }));
  expect(
    await screen.findByRole("heading", { name: "Renamed orders" }),
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
    screen.getByRole("button", { name: "Set manual row limit" }),
  );
  await user.click(screen.getByRole("button", { name: "Undo" }));
  expect(screen.getByText("Displayed row limit: 100")).toBeVisible();
  expect(
    screen.queryByRole("button", { name: "Save changes" }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Redo" })).toBeEnabled();
  await user.click(screen.getByRole("button", { name: "Redo" }));
  expect(screen.getByText("Displayed row limit: 7")).toBeVisible();
  expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled();
  await user.click(screen.getByRole("button", { name: "Undo" }));
  await user.click(
    screen.getByRole("button", { name: "Set manual row limit" }),
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
    screen.queryByRole("button", { name: "Edit nickname" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Delete query" }),
  ).not.toBeInTheDocument();
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  await user.click(actions);
  const deleteItem = screen.getByRole("menuitem", { name: "Delete query" });
  await user.click(deleteItem);
  expect(mocks.remove).not.toHaveBeenCalled();
  expect(
    screen
      .getByRole("menuitem", { name: "Confirm delete" })
      .closest('[role="menu"]'),
  ).not.toBe(deleteItem.closest('[role="menu"]'));
  // jsdom has no submenu geometry for pointer movement between menus.
  fireEvent.click(screen.getByRole("menuitem", { name: "Cancel" }));
  expect(mocks.remove).not.toHaveBeenCalled();
  expect(screen.queryByRole("menuitem", { name: "Confirm delete" })).toBeNull();
  await user.click(screen.getByRole("menuitem", { name: "Delete query" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Confirm delete" }));
  expect(mocks.remove).toHaveBeenCalledWith({
    queryId: "query-1",
    connectionId: "connection-1",
    revision: "1-saved",
  });
  expect(confirm).not.toHaveBeenCalled();
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
    screen.queryByRole("button", { name: "Undo query change" }),
  ).toBeNull();
  expect(
    screen.queryByRole("button", { name: "Redo query change" }),
  ).toBeNull();
  expect(screen.queryByText("Undid an old query change")).toBeNull();
  await user.click(
    screen.getByRole("button", { name: "Set manual row limit" }),
  );
  mocks.chat.mockResolvedValue({
    queryUpdated: false,
    queryId: "query-1",
    revision: mocks.doc._rev,
    messages: mocks.doc.chatMessages,
  });
  await user.type(
    screen.getByRole("textbox", { name: "Amend your query" }),
    "Keep the filter{Enter}",
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

it.each(["", "Recent paid orders"])(
  "requires a name when saving the ephemeral query %j",
  async (suggestedName) => {
    mocks.doc.ephemeral = true;
    mocks.doc.nickname = suggestedName;
    const user = userEvent.setup();
    mount();
    expect(
      screen.getByRole("heading", { name: suggestedName || "Unsaved query" }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Save query" })).toBeEnabled();
    await user.click(
      screen.getByRole("button", { name: "Set manual row limit" }),
    );
    await user.click(screen.getByRole("button", { name: "Save query" }));
    const dialog = screen.getByRole("dialog", { name: "Save query" });
    const name = within(dialog).getByRole("textbox", { name: "Query name" });
    expect(name).toHaveValue(suggestedName);
    await user.clear(name);
    await user.type(name, "   ");
    expect(
      within(dialog).getByRole("button", { name: "Save query" }),
    ).toBeDisabled();
    expect(mocks.save).not.toHaveBeenCalled();
    await user.clear(name);
    await user.type(name, "  My orders  ");
    await user.click(
      within(dialog).getByRole("button", { name: "Save query" }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(mocks.save).toHaveBeenCalledWith(
      expect.objectContaining({
        nickname: "My orders",
        query: expect.objectContaining({ limit: 7 }),
        queryHistory: expect.any(Object),
      }),
    );
    expect(screen.getByRole("heading", { name: "My orders" })).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Save query" }),
    ).not.toBeInTheDocument();
  },
);

it("cancelling the name dialog keeps the query unsaved", async () => {
  mocks.doc.ephemeral = true;
  mocks.doc.nickname = "";
  const user = userEvent.setup();
  mount();
  await user.click(screen.getByRole("button", { name: "Save query" }));
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  expect(mocks.save).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Save query" })).toBeVisible();
});

it("warns about discarding the entire ephemeral query even without edits", () => {
  mocks.doc.ephemeral = true;
  mount();
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  expect(mocks.block!()).toBe(true);
  expect(confirm).toHaveBeenCalledWith(
    "This query hasn’t been saved. Leave and discard the entire query?",
  );
  confirm.mockReturnValue(true);
  expect(mocks.block!()).toBe(false);
  confirm.mockRestore();
});

it("retains the changes-only warning for a saved query", async () => {
  mount();
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  expect(mocks.block!()).toBe(false);
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Set manual row limit" }));
  expect(mocks.block!()).toBe(true);
  expect(confirm).toHaveBeenCalledWith(
    "You have made changes to this query. Are you sure you want to leave without saving?",
  );
  confirm.mockRestore();
});

it("saves an ephemeral SQL query with a required name and the latest SQL", async () => {
  mocks.customSql = true;
  mocks.doc.ephemeral = true;
  mocks.doc.nickname = "";
  mount();
  const user = userEvent.setup();
  await user.clear(screen.getByRole("textbox", { name: "SQL query" }));
  await user.type(
    screen.getByRole("textbox", { name: "SQL query" }),
    "SELECT 42",
  );
  await user.click(screen.getByRole("button", { name: "Save query" }));
  const dialog = screen.getByRole("dialog", { name: "Save query" });
  expect(
    within(dialog).getByRole("textbox", { name: "Query name" }),
  ).toHaveValue("");
  expect(
    within(dialog).getByRole("button", { name: "Save query" }),
  ).toBeDisabled();
  await user.type(
    within(dialog).getByRole("textbox", { name: "Query name" }),
    "Answer",
  );
  await user.click(within(dialog).getByRole("button", { name: "Save query" }));
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
  expect(mocks.save).toHaveBeenCalledWith(
    expect.objectContaining({
      nickname: "Answer",
      query: {
        mode: "sql",
        sql: "SELECT 42",
        dialect: "postgres",
        parameters: undefined,
      },
    }),
  );
  expect(mocks.block!()).toBe(false);
});

it.each([true, false])(
  "uses the appropriate SQL departure warning (ephemeral: %s)",
  async (ephemeral) => {
    mocks.customSql = true;
    mocks.doc.ephemeral = ephemeral;
    mount();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    if (!ephemeral) {
      expect(mocks.block!()).toBe(false);
      await userEvent
        .setup()
        .type(screen.getByRole("textbox", { name: "SQL query" }), "0");
    }
    expect(mocks.block!()).toBe(true);
    expect(confirm).toHaveBeenCalledWith(
      ephemeral
        ? "This query hasn’t been saved. Leave and discard the entire query?"
        : "You have unsaved SQL changes. Leave without saving?",
    );
    confirm.mockRestore();
  },
);

it.each([false, true])(
  "opening and refreshing a query never modifies it (SQL: %s)",
  (sql) => {
    mocks.customSql = sql;
    mocks.doc.modifiedAt = 100;
    const original = structuredClone(mocks.doc);
    const view = mount();
    act(() => mocks.refresh());
    view.unmount();
    mount();
    expect(mocks.doc).toEqual(original);
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
  },
);

it.each([
  { sql: true, ephemeral: false },
  { sql: false, ephemeral: true },
  { sql: true, ephemeral: true },
])(
  "confirms deletion in the popup for SQL=$sql, unsaved=$ephemeral",
  async ({ sql, ephemeral }) => {
    mocks.customSql = sql;
    mocks.doc.ephemeral = ephemeral;
    mount();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Query actions" }));
    await user.click(
      screen.getByRole("menuitem", {
        name: ephemeral ? "Discard query" : "Delete query",
      }),
    );
    expect(mocks.remove).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("menuitem", {
        name: ephemeral ? "Confirm discard" : "Confirm delete",
      }),
    );
    expect(mocks.remove).toHaveBeenCalledOnce();
    expect(confirm).not.toHaveBeenCalled();
    confirm.mockRestore();
  },
);

it("keeps follow-up typing out of the query workspace render path", async () => {
  const user = userEvent.setup();
  mount();
  const input = screen.getByRole("textbox", { name: "Amend your query" });
  mocks.renderQueryView.mockClear();
  await user.type(input, "Show only paid orders");
  expect(input).toHaveValue("Show only paid orders");
  expect(mocks.renderQueryView).not.toHaveBeenCalled();
  expect(mocks.chat).not.toHaveBeenCalled();
});
