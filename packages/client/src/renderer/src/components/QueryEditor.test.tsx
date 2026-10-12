import type { ComponentType } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import type { Query, PreparedQuery } from "@quory/core";
import { ConditionOperator } from "@quory/core";
import type { SavedQuery } from "../../../main/repositories/queryRepo";
import { schemas } from "../../../../test/queryFixtures";

const mocks = vi.hoisted(() => ({
  chat: vi.fn(),
  invalidate: vi.fn(),
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
    }: {
      initialQuery: Query;
      onQueryChange: (query: PreparedQuery) => void;
    }) {
      const [limit, setLimit] = useState(initialQuery.limit);
      return (
        <>
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
      <Page />
    </TooltipProvider>
  );
}

it("includes unsaved manual edits in chat, then refreshes results from the saved amendment", async () => {
  const user = userEvent.setup();
  mocks.chat.mockImplementation(async () => {
    mocks.doc = { ...mocks.doc, limit: 2, _rev: "2-updated" };
    return {
      queryId: "query-1",
      revision: "2-updated",
      queryUpdated: true,
      messages: [{ id: "b", role: "assistant", content: "Showing two rows." }],
    };
  });
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
