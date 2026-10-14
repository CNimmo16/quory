import { randomUUID } from "node:crypto";
import { APICallError, RetryError } from "ai";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { schemas, orderQuery } from "../../../test/queryFixtures";
import { queryFromTool } from "./queryTool";
import type { ChatMessage } from "../../shared/queryChat";
import type { SavedQuery } from "../repositories/queryRepo";

const mocks = vi.hoisted(() => ({
  generation: 0,
  get: vi.fn(),
  put: vi.fn(),
  session: vi.fn(),
  connection: vi.fn(),
  assistant: vi.fn(),
  model: vi.fn(),
}));
vi.mock("../repositories/queryRepo", () => ({
  queryRepo: { get: mocks.get, put: mocks.put },
}));
vi.mock("../state/quorySession", () => ({ getQuorySession: mocks.session }));
vi.mock("../state/activeConnectionState", () => ({
  default: {
    getActiveConnectionId: mocks.connection,
    getConnectionGeneration: () => mocks.generation,
  },
}));
vi.mock("./queryAssistant", () => ({ runQueryAssistant: mocks.assistant }));
vi.mock("./model", () => ({ getQueryModel: mocks.model }));
import { queryChatProcedure } from "./queryChat";
import { router } from "../util/trpc";
import queryRouter from "../routers/queryRouter";

const caller = router({ chat: queryChatProcedure }).createCaller({});
const historyCaller = queryRouter.createCaller({});
let docs: Map<string, SavedQuery & { _id: string; _rev: string }>;
const input = () => ({
  connectionId: "connection-1",
  requestId: randomUUID(),
  message: "Latest orders with listings for cameron@gmail.com",
  history: [],
});

beforeEach(() => {
  vi.resetAllMocks();
  mocks.generation = 0;
  docs = new Map();
  mocks.session.mockResolvedValue({ connectionId: "connection-1", schemas });
  mocks.connection.mockResolvedValue("connection-1");
  mocks.get.mockImplementation(async (id: string) => {
    const doc = docs.get(id);
    if (!doc) throw { status: 404 };
    return structuredClone(doc);
  });
  mocks.put.mockImplementation(async (doc) => {
    if (docs.get(doc._id)?._rev !== doc._rev) throw { status: 409 };
    const rev = `${Number(doc._rev?.split("-")[0] ?? 0) + 1}-saved`;
    docs.set(doc._id, structuredClone({ ...doc, _rev: rev }));
    return { rev };
  });
  mocks.assistant.mockImplementation(async ({ upsert }) => {
    await upsert(
      queryFromTool(orderQuery),
      orderQuery.nickname,
      orderQuery.summary
    );
    return { queryUpdated: true, text: orderQuery.summary };
  });
});

describe("chat persistence", () => {
  it("surfaces provider quota errors even when the SDK wraps retry failures", async () => {
    mocks.assistant.mockRejectedValue(
      new RetryError({
        message: "Retries exhausted",
        reason: "maxRetriesExceeded",
        errors: [
          new APICallError({
            message: "No credits",
            url: "https://api.openai.com/v1/responses",
            requestBodyValues: {},
            statusCode: 429,
          }),
        ],
      })
    );
    await expect(caller.chat(input())).rejects.toThrow("out of credits");
    expect(mocks.put).not.toHaveBeenCalled();
  });
  it("creates a single saved query and returns the same result for a transport retry", async () => {
    const request = input();
    const result = await caller.chat(request);
    expect(result.queryId).toBe(request.requestId);
    expect(result.messages.map((message) => message.role)).toEqual([
      "user",
      "assistant",
    ]);
    expect(await caller.chat(request)).toEqual(result);
    expect(mocks.put).toHaveBeenCalledOnce();
    expect(mocks.assistant).toHaveBeenCalledOnce();
  });
  it("keeps the same query id when amending and persists the conversation", async () => {
    const initial = await caller.chat(input());
    const result = await caller.chat({
      ...input(),
      queryId: initial.queryId!,
      revision: initial.revision!,
      message: "Only ten rows",
      history: initial.messages,
    });
    expect(result.queryId).toBe(initial.queryId);
    expect(result.messages).toHaveLength(4);
    expect(result.revision).not.toBe(initial.revision);
    expect(docs.size).toBe(1);
  });
  it("does not create a query while clarifying", async () => {
    mocks.assistant.mockResolvedValue({
      queryUpdated: false,
      text: "Which date should I use?",
    });
    const result = await caller.chat(input());
    expect(result.queryUpdated).toBe(false);
    expect(result.queryId).toBeNull();
    expect(mocks.put).not.toHaveBeenCalled();
  });
  it("supplies the latest query and conversation without legacy undo notices", async () => {
    const initial = await caller.chat(input());
    const draft = { ...queryFromTool(orderQuery), limit: 7 };
    mocks.assistant.mockImplementationOnce(async ({ upsert }) => {
      await upsert({ ...draft, limit: 2 }, "Orders", "Showing two rows.");
      return { queryUpdated: true, text: "Showing two rows." };
    });
    const amended = await caller.chat({
      ...input(),
      queryId: initial.queryId!,
      revision: initial.revision!,
      message: "Only two rows",
      currentQuery: draft,
      history: initial.messages,
    });
    expect(amended.queryHistory?.present.query.limit).toBe(2);
    expect(amended.queryHistory?.past.at(-1)?.query.limit).toBe(7);
    const undone = await historyCaller.changeQueryHistory({
      connectionId: "connection-1",
      queryId: amended.queryId!,
      revision: amended.revision!,
      action: "undo",
      queryHistory: amended.queryHistory!,
      messages: amended.messages,
    });
    expect(mocks.assistant).toHaveBeenCalledTimes(2);
    expect(docs.get(amended.queryId!)?.limit).toBe(7);
    mocks.assistant.mockImplementationOnce(
      async ({ currentQuery, messages }) => {
        expect(currentQuery.limit).toBe(7);
        expect(messages).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ role: "user", content: "Only two rows" }),
            expect.objectContaining({
              role: "assistant",
              content: "Showing two rows.",
            }),
          ])
        );
        expect(
          messages.some((message: ChatMessage) => message.historyAction)
        ).toBe(false);
        return { queryUpdated: false, text: "Which date range?" };
      }
    );
    const next = await caller.chat({
      ...input(),
      queryId: amended.queryId!,
      revision: undone.revision,
      message: "Filter by date",
      history: [],
    });
    expect(next.messages).toHaveLength(amended.messages.length + 2);
    expect(next.messages.at(-1)?.content).toBe("Which date range?");
  });
  it("rejects a query owned by another connection and stale revisions", async () => {
    const initial = await caller.chat(input());
    await expect(
      caller.chat({ ...input(), queryId: initial.queryId!, revision: "stale" })
    ).rejects.toThrow("changed");
    mocks.connection.mockResolvedValue("another-connection");
    mocks.session.mockResolvedValue({
      connectionId: "another-connection",
      schemas,
    });
    await expect(
      caller.chat({
        ...input(),
        connectionId: "another-connection",
        queryId: initial.queryId!,
        revision: initial.revision!,
      })
    ).rejects.toThrow("different connection");
    expect(mocks.assistant).toHaveBeenCalledOnce();
  });
  it("does not overwrite an edit made during generation", async () => {
    const initial = await caller.chat(input());
    mocks.assistant.mockImplementation(async ({ upsert }) => {
      docs.get(initial.queryId!)!._rev = "2-manual-edit";
      await upsert(
        queryFromTool(orderQuery),
        orderQuery.nickname,
        orderQuery.summary
      );
    });
    await expect(
      caller.chat({
        ...input(),
        queryId: initial.queryId!,
        revision: initial.revision!,
      })
    ).rejects.toThrow("changed");
    expect(docs.get(initial.queryId!)!._rev).toBe("2-manual-edit");
  });
  it("does not save after the active connection changes", async () => {
    mocks.connection.mockResolvedValue("connection-2");
    await expect(caller.chat(input())).rejects.toThrow(
      "active connection changed"
    );
    expect(mocks.put).not.toHaveBeenCalled();
  });
});

it("rejects switching away and back during chat generation", async () => {
  mocks.assistant.mockImplementation(async ({ upsert }) => {
    mocks.generation += 2;
    await upsert(
      queryFromTool(orderQuery),
      orderQuery.nickname,
      orderQuery.summary
    );
  });
  await expect(caller.chat(input())).rejects.toThrow(
    "active connection changed"
  );
  expect(mocks.put).not.toHaveBeenCalled();
});
