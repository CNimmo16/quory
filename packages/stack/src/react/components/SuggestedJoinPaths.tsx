import { Fragment, useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Pencil } from "lucide-react";
import { useJoinRanker } from "../JoinRankingContext";
import { Button } from "./ui/button";
import { CustomJoinPath } from "./JoinPathPicker";
import { Badge } from "./ui/badge";
import { Spinner } from "./LoadingState";
import type { JoinGraph, JoinHop } from "./joinRouteOptions";
import {
  describeJoinPath,
  orderJoinPathIds,
  shortlistJoinPaths,
} from "./joinPathSuggestions";

export function SuggestedJoinPaths({
  source,
  target,
  graph,
  maxHops,
  tableLabel,
  joinedTables,
  onJoin,
  onCancel,
  initialCustom = false,
  backLabel = "Back to tables",
}: {
  source: string;
  target: string;
  graph: JoinGraph;
  maxHops: number;
  tableLabel: (ref: string) => string;
  joinedTables: string[];
  onJoin: (path: JoinHop[]) => void;
  onCancel: () => void;
  initialCustom?: boolean;
  backLabel?: string;
}) {
  const ranker = useJoinRanker();
  const paths = useMemo(
    () => shortlistJoinPaths(graph, source, target, maxHops),
    [graph, source, target, maxHops],
  );
  const ids = useMemo(() => paths.map((_, index) => `path-${index}`), [paths]);
  const [custom, setCustom] = useState(initialCustom);
  const [ranking, setRanking] = useState<{
    paths: JoinHop[][];
    ids: string[];
    loading: boolean;
    ranked: boolean;
  }>();
  const joinedKey = JSON.stringify(joinedTables);
  useEffect(() => {
    setCustom(initialCustom);
  }, [source, target, initialCustom]);
  useEffect(() => {
    if (custom) return;
    const controller = new AbortController();
    setRanking({
      paths,
      ids: ids.slice(0, 3),
      loading: !!ranker && paths.length > 1,
      ranked: false,
    });
    if (!ranker || paths.length < 2) return () => controller.abort();
    const useLocal = () => {
      controller.abort();
      setRanking({
        paths,
        ids: ids.slice(0, 3),
        loading: false,
        ranked: false,
      });
    };
    const timeout = setTimeout(useLocal, 3000);
    if (ranker && paths.length > 1) {
      void ranker(
        {
          kind: "paths",
          sourceTable: source,
          targetTable: target,
          joinedTables: JSON.parse(joinedKey) as string[],
          candidates: paths.map((path, index) => ({
            id: ids[index]!,
            description: describeJoinPath(source, path),
          })),
        },
        controller.signal,
      )
        .then((result) => {
          if (controller.signal.aborted) return;
          clearTimeout(timeout);
          const ordered = orderJoinPathIds(ids, result);
          setRanking({
            paths,
            ids: ordered,
            loading: false,
            ranked:
              result.ranked &&
              result.orderedIds.length === ids.length &&
              new Set(result.orderedIds).size === ids.length &&
              result.orderedIds.every((id) => ids.includes(id)),
          });
        })
        .catch(() => {
          clearTimeout(timeout);
          if (!controller.signal.aborted)
            setRanking({
              paths,
              ids: ids.slice(0, 3),
              loading: false,
              ranked: false,
            });
        });
    }
    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [paths, ids, ranker, source, target, joinedKey, custom]);
  if (custom)
    return (
      <CustomJoinPath
        key={`${source}:${target}`}
        source={source}
        target={target}
        graph={graph}
        maxHops={maxHops}
        tableLabel={tableLabel}
        onJoin={onJoin}
        backLabel="Back to suggested paths"
        onCancel={() => setCustom(false)}
      />
    );
  const current = ranking?.paths === paths ? ranking : undefined;
  const loading = current?.loading ?? (!!ranker && paths.length > 1);
  const visible = current?.ids ?? ids.slice(0, 3);
  return (
    <>
      <div className="border-border flex shrink-0 items-center gap-2 border-b px-3 py-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label={backLabel}
          onClick={onCancel}
        >
          <ArrowLeft />
        </Button>
        <h3 className="break-all text-sm font-semibold">
          {tableLabel(source)} to {tableLabel(target)}
        </h3>
      </div>
      <div className="bg-muted/20 min-h-0 overflow-auto p-3">
        {loading ? (
          <div
            role="status"
            className="text-muted-foreground flex min-h-40 flex-col items-center justify-center gap-3 py-6 text-xs"
          >
            <Spinner className="text-primary-emphasis size-6" />
            <span>Ranking suggested paths…</span>
          </div>
        ) : (
          <>
            <p className="text-muted-foreground mb-3 text-xs" role="status">
              {current?.ranked
                ? "Suggested paths ranked by your decision model."
                : "Suggested paths in local order."}
            </p>
            {!visible.length && (
              <p className="text-muted-foreground text-xs">
                No suggested paths within the hop limit. Try a custom path.
              </p>
            )}
            <div
              className="space-y-2"
              role="group"
              aria-label="Suggested join paths"
            >
              {visible.map((id) => (
                <button
                  key={id}
                  type="button"
                  className="border-border bg-card hover:border-primary hover:bg-primary-subtle focus-visible:outline-primary block w-full overflow-auto rounded-md border p-3 text-left"
                  onClick={() => onJoin(paths[ids.indexOf(id)]!)}
                >
                  <span className="mb-2 flex flex-wrap items-center gap-1">
                    {[
                      source,
                      ...paths[ids.indexOf(id)]!.map(
                        (hop) => hop.step.tableRef,
                      ),
                    ].map((ref, hopIndex) => (
                      <Fragment key={ref}>
                        {hopIndex > 0 && (
                          <ArrowRight
                            aria-hidden="true"
                            className="text-muted-foreground size-3 shrink-0"
                          />
                        )}
                        <Badge
                          variant="outline"
                          className="border-primary/30 bg-primary-subtle text-primary-emphasis max-w-full break-all px-1.5 py-0.5 text-[11px] font-medium"
                        >
                          {tableLabel(ref)}
                        </Badge>
                      </Fragment>
                    ))}
                  </span>
                  <span className="text-muted-foreground block space-y-1 font-mono text-[10px]">
                    {paths[ids.indexOf(id)]!.map((hop, hopIndex, path) => {
                      const from = tableLabel(
                        hopIndex === 0
                          ? source
                          : path[hopIndex - 1]!.step.tableRef,
                      );
                      const to = tableLabel(hop.step.tableRef);
                      return (
                        <span
                          key={hopIndex}
                          className="block break-all"
                          title={hop.relationship.constraintId}
                        >
                          {hop.relationship.columnPairs
                            .map(
                              ({ localColumn, foreignColumn }) =>
                                `${from}.${hop.forward ? localColumn : foreignColumn} → ${to}.${hop.forward ? foreignColumn : localColumn}`,
                            )
                            .join(" · ")}
                        </span>
                      );
                    })}
                  </span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
      <div className="border-border flex shrink-0 items-center border-t px-3 py-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setCustom(true)}
        >
          <Pencil />
          Custom path
        </Button>
      </div>
    </>
  );
}
