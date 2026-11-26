import {
  act,
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SuggestedJoinPaths } from "../../../../../stack/src/react/components/SuggestedJoinPaths";
import {
  JoinRankingProvider,
  type JoinRanker,
  type JoinRankingResult,
} from "../../../../../stack/src/react/JoinRankingContext";
import type {
  JoinGraph,
  JoinHop,
} from "../../../../../stack/src/react/components/joinRouteOptions";

const hops: JoinHop[] = ["owner", "reviewer", "creator", "editor"].map(
  (id) => ({
    forward: true,
    step: { tableRef: "b", usingConstraintId: id },
    relationship: {
      constraintId: id,
      localSchema: "public",
      localTable: "a",
      foreignSchema: "public",
      foreignTable: "b",
      columnPairs: [{ localColumn: `${id}_id`, foreignColumn: "id" }],
    },
  }),
);
const graph: JoinGraph = new Map([["a", new Map([["b", hops]])]]);
const base = {
  source: "a",
  target: "b",
  graph,
  maxHops: 3,
  tableLabel: (ref: string) => ref,
  joinedTables: ["a"],
  onJoin: vi.fn(),
  onCancel: vi.fn(),
};

function pathChoices() {
  const group = screen.queryByRole("group", { name: "Suggested join paths" });
  return group ? within(group).queryAllByRole("button") : [];
}

describe("suggested exact join paths", () => {
  it("shows only the model's top three and joins the clicked path immediately", async () => {
    const ranker: JoinRanker = async (request) => ({
      ranked: true,
      orderedIds: request.candidates.map((candidate) => candidate.id).reverse(),
    });
    const onJoin = vi.fn();
    render(
      <JoinRankingProvider value={ranker}>
        <SuggestedJoinPaths {...base} onJoin={onJoin} />
      </JoinRankingProvider>,
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Ranking suggested paths…",
    );
    expect(pathChoices()).toHaveLength(0);
    await screen.findByText(/ranked by your decision model/);
    const choices = pathChoices();
    expect(choices).toHaveLength(3);
    expect(choices[0]).toHaveTextContent("reviewer");
    expect(
      screen.queryByRole("button", { name: "Join table" }),
    ).not.toBeInTheDocument();
    expect(onJoin).not.toHaveBeenCalled();
    fireEvent.click(choices[0]!);
    expect(onJoin).toHaveBeenCalledOnce();
    expect(onJoin.mock.calls[0]![0][0].relationship.constraintId).toBe(
      "reviewer",
    );
  });
  it("shows a spinner without local paths and allows custom paths while the model is pending", () => {
    const ranker: JoinRanker = () => new Promise(() => {});
    render(
      <JoinRankingProvider value={ranker}>
        <SuggestedJoinPaths {...base} />
      </JoinRankingProvider>,
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Ranking suggested paths…",
    );
    expect(screen.getByRole("status").querySelector("svg")).toHaveClass(
      "animate-spin",
    );
    expect(
      screen.queryByRole("group", { name: "Suggested join paths" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Use local suggestions" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Custom path" }));
    expect(screen.getByText("Custom path to b")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Back to suggested paths" }),
    );
    expect(screen.getByText("a to b")).toBeInTheDocument();
  });
  it("falls back after three seconds and ignores a later model response", async () => {
    vi.useFakeTimers();
    let resolve!: (result: JoinRankingResult) => void;
    let signal: AbortSignal | undefined;
    const ranker: JoinRanker = (_, receivedSignal) => {
      signal = receivedSignal;
      return new Promise((done) => {
        resolve = done;
      });
    };
    try {
      render(
        <JoinRankingProvider value={ranker}>
          <SuggestedJoinPaths {...base} />
        </JoinRankingProvider>,
      );
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2999);
      });
      expect(pathChoices()).toHaveLength(0);
      expect(screen.getByRole("status")).toHaveTextContent(
        "Ranking suggested paths…",
      );
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });
      expect(screen.getByRole("status")).toHaveTextContent("local order");
      const choices = pathChoices();
      expect(choices).toHaveLength(3);
      expect(signal?.aborted).toBe(true);
      const localOrder = choices.map((choice) => choice.textContent);
      await act(async () => {
        resolve({
          ranked: true,
          orderedIds: ["path-3", "path-2", "path-1", "path-0"],
        });
      });
      expect(pathChoices().map((choice) => choice.textContent)).toEqual(
        localOrder,
      );
    } finally {
      vi.useRealTimers();
    }
  });
  it("opens the pencil directly in custom mode without ranking", () => {
    const ranker = vi.fn<JoinRanker>();
    render(
      <JoinRankingProvider value={ranker}>
        <SuggestedJoinPaths {...base} initialCustom />
      </JoinRankingProvider>,
    );
    expect(screen.getByText("Custom path to b")).toBeInTheDocument();
    expect(ranker).not.toHaveBeenCalled();
  });
  it("ignores a stale model response after changing targets", async () => {
    let resolve!: (result: JoinRankingResult) => void;
    const ranker: JoinRanker = () =>
      new Promise((done) => {
        resolve = done;
      });
    const { rerender } = render(
      <JoinRankingProvider value={ranker}>
        <SuggestedJoinPaths {...base} />
      </JoinRankingProvider>,
    );
    rerender(
      <JoinRankingProvider value={ranker}>
        <SuggestedJoinPaths {...base} target="missing" />
      </JoinRankingProvider>,
    );
    resolve({
      ranked: true,
      orderedIds: ["path-3", "path-2", "path-1", "path-0"],
    });
    await waitFor(() =>
      expect(screen.getByText("a to missing")).toBeInTheDocument(),
    );
    expect(pathChoices()).toHaveLength(0);
  });
});
