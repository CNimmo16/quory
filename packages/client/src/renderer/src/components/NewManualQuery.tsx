import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { splitTableRef } from "@quory/core";
import {
  selectJoinColumns,
  shortlistJoinColumns,
  useFetchSchema,
  useJoinRanker,
} from "@quory/stack/react";
import { Table2 } from "lucide-react";
import trpc from "../util/tprc";
import {
  MAX_RECENT_MANUAL_TABLES,
  readRecentManualTables,
  recordRecentManualTable,
} from "../util/recentManualTables";
import { TablePicker } from "./TablePicker";
import { LoadingState } from "./LoadingState";
import { Alert, AlertDescription } from "./ui/alert";
import { Button } from "./ui/button";

export function NewManualQuery({
  projectId,
  connectionId,
}: {
  projectId: string;
  connectionId: string;
}) {
  const { data, error: schemaError } = useFetchSchema();
  const ranker = useJoinRanker();
  const create = trpc.queries.createQuery.useMutation();
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const [recentRefs, setRecentRefs] = useState<string[]>(() =>
    readRecentManualTables(projectId, connectionId),
  );
  const [table, setTable] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [choosingColumns, setChoosingColumns] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  const running = useRef(false);
  const pendingColumns = useRef<AbortController | null>(null);
  useEffect(() => {
    setRecentRefs(readRecentManualTables(projectId, connectionId));
  }, [projectId, connectionId]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      pendingColumns.current?.abort();
      pendingColumns.current = null;
    };
  }, []);

  const recentTables = useMemo(() => {
    if (!data?.schemas.length || !recentRefs.length) return [];
    const available = new Set<string>();
    const nameCounts = new Map<string, number>();
    for (const schema of data.schemas) {
      for (const entry of schema.tables) {
        available.add(`${schema.name}.${entry.name}`);
        nameCounts.set(entry.name, (nameCounts.get(entry.name) ?? 0) + 1);
      }
    }
    const recent: { tableRef: string; label: string }[] = [];
    for (const tableRef of recentRefs) {
      if (!available.has(tableRef)) continue;
      const [, tableName] = splitTableRef(tableRef);
      recent.push({
        tableRef,
        label: (nameCounts.get(tableName) ?? 0) > 1 ? tableRef : tableName,
      });
      if (recent.length === MAX_RECENT_MANUAL_TABLES) break;
    }
    return recent;
  }, [data?.schemas, recentRefs]);

  async function openTable(tableRef: string) {
    if (running.current) return;
    running.current = true;
    setTable(tableRef);
    setPending(true);
    setError(null);
    try {
      const [schemaName, tableName] = splitTableRef(tableRef);
      const tableInfo = data?.schemas
        .find(({ name }) => name === schemaName)
        ?.tables.find(({ name }) => name === tableName);
      let select: "*" | string[] = "*";
      if (tableInfo?.columns?.length) {
        const { candidates, fallback } = shortlistJoinColumns(tableInfo, []);
        select = fallback;
        if (ranker && candidates.length > 1) {
          const controller = new AbortController();
          pendingColumns.current = controller;
          setChoosingColumns(true);
          select = await selectJoinColumns(
            ranker,
            {
              kind: "columns",
              sourceTable: tableRef,
              targetTable: tableRef,
              joinedTables: [tableRef],
              selectedColumns: [],
              candidates,
            },
            fallback,
            tableInfo.columns.map(({ name }) => name),
            controller.signal,
          );
          if (controller.signal.aborted || !mounted.current) return;
          pendingColumns.current = null;
          setChoosingColumns(false);
        }
      }
      const { queryId } = await create.mutateAsync({
        connectionId,
        query: { base: { tableRef, select } },
      });
      if (!mounted.current) return;
      setRecentRefs(recordRecentManualTable(projectId, connectionId, tableRef));
      await utils.projects.listQueries.invalidate();
      if (!mounted.current) return;
      await navigate({ to: "/queries/$queryId", params: { queryId } });
    } catch (cause) {
      if (mounted.current)
        setError(
          cause instanceof Error ? cause.message : "Could not create query.",
        );
    } finally {
      pendingColumns.current = null;
      running.current = false;
      if (mounted.current) {
        setChoosingColumns(false);
        setPending(false);
      }
    }
  }

  if (schemaError)
    return (
      <Alert variant="destructive">
        <AlertDescription>{schemaError.message}</AlertDescription>
      </Alert>
    );
  if (!data) return <LoadingState label="Loading tables…" />;
  if (!data.schemas.some((schema) => schema.tables.length))
    return (
      <p className="text-sm text-muted-foreground">
        No tables found in this connection.
      </p>
    );

  return (
    <div className="space-y-4">
      {recentTables.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Recent starting tables</p>
          <div
            role="group"
            aria-label="Recent starting tables"
            className="flex flex-wrap gap-2"
          >
            {recentTables.map(({ tableRef, label }) => (
              <Button
                key={tableRef}
                type="button"
                variant="outline"
                size="sm"
                disabled={pending}
                className="h-8 max-w-full gap-1.5 rounded-full px-3 font-normal"
                onClick={() => void openTable(tableRef)}
              >
                <Table2
                  aria-hidden="true"
                  className="size-3.5 shrink-0 text-muted-foreground"
                />
                <span className="truncate">{label}</span>
              </Button>
            ))}
          </div>
        </div>
      )}
      <fieldset disabled={pending} className="space-y-2 border-0 p-0">
        <label htmlFor="new-query-start-table" className="text-sm font-medium">
          Starting table
        </label>
        <TablePicker
          id="new-query-start-table"
          groups={data.schemas}
          value={table}
          onChange={(value) => void openTable(value)}
          maxHeight={320}
          defaultOpen={recentTables.length === 0}
        />
      </fieldset>
      {pending && (
        <LoadingState
          label={choosingColumns ? "Choosing columns…" : "Opening query…"}
        />
      )}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
          <Button
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={() => table && void openTable(table)}
          >
            Try again
          </Button>
        </Alert>
      )}
    </div>
  );
}
