import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useFetchSchema } from "@quory/stack/react";
import trpc from "../util/tprc";
import { TablePicker } from "./TablePicker";
import { LoadingState } from "./LoadingState";
import { Alert, AlertDescription } from "./ui/alert";
import { Button } from "./ui/button";

export function NewManualQuery({ connectionId }: { connectionId: string }) {
  const { data, error: schemaError } = useFetchSchema();
  const create = trpc.queries.createQuery.useMutation();
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const [table, setTable] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  const running = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  async function openTable(tableRef: string) {
    if (running.current) return;
    running.current = true;
    setTable(tableRef);
    setPending(true);
    setError(null);
    try {
      const { queryId } = await create.mutateAsync({
        connectionId,
        query: { base: { tableRef, select: "*" } },
      });
      if (!mounted.current) return;
      await utils.projects.listQueries.invalidate();
      if (!mounted.current) return;
      await navigate({ to: "/queries/$queryId", params: { queryId } });
    } catch (cause) {
      if (mounted.current)
        setError(
          cause instanceof Error ? cause.message : "Could not create query.",
        );
    } finally {
      running.current = false;
      if (mounted.current) setPending(false);
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
    <div className="space-y-3">
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
        />
      </fieldset>
      {pending && <LoadingState label="Opening query…" />}
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
