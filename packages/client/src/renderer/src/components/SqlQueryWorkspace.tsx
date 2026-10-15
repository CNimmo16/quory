import { useEffect, useRef, useState } from "react";
import type { CustomSqlQuery } from "../../../shared/sqlQuery";
import { Button } from "./ui/button";
import { Alert, AlertDescription } from "./ui/alert";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "./ui/dialog";
import { Spinner } from "./LoadingState";
import { SqlEditor, formatSql } from "./SqlEditor";
import trpc from "../util/tprc";
import { Play, AlignLeft } from "lucide-react";
import DataTable from "./DataTable";
import { useFetchSchema } from "@quory/stack/react";

type Result = Extract<
  Awaited<
    ReturnType<
      ReturnType<typeof trpc.queries.executeSql.useMutation>["mutateAsync"]
    >
  >,
  { status: "executed" }
>;
export function SqlQueryWorkspace({
  connectionId,
  query,
  onChange,
  autoFocus = false,
  onValidityChange,
}: {
  connectionId: string;
  query: CustomSqlQuery;
  onChange: (query: CustomSqlQuery) => void;
  autoFocus?: boolean;
  onValidityChange?: (valid: boolean) => void;
}) {
  const { data: schemaData } = useFetchSchema();
  const execute = trpc.queries.executeSql.useMutation();
  const cancel = trpc.queries.cancelSql.useMutation();
  const [result, setResult] = useState<Result | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<{
    token: string;
    connectionName: string;
    query: CustomSqlQuery;
  } | null>(null);
  const [parametersText, setParametersText] = useState(() =>
    JSON.stringify(query.parameters ?? [])
  );
  const [showParameters, setShowParameters] = useState(
    Boolean(query.parameters?.length)
  );
  const execution = useRef<string | null>(null);
  const requestSequence = useRef(0);
  const cancelExecution = cancel.mutateAsync;
  useEffect(
    () => () => {
      ++requestSequence.current;
      if (execution.current)
        void cancelExecution({
          connectionId,
          executionId: execution.current,
        }).catch(() => {});
    },
    [connectionId, cancelExecution]
  );
  async function run(definition = query, token?: string) {
    const sequence = ++requestSequence.current;
    const id = crypto.randomUUID();
    execution.current = id;
    setFailure(null);
    try {
      const response = await execute.mutateAsync({
        connectionId,
        sql: definition.sql,
        parameters: definition.parameters ?? [],
        executionId: id,
        ...(token ? { confirmationToken: token } : {}),
      });
      if (requestSequence.current !== sequence) return;
      if (response.status === "confirmation-required")
        setConfirmation({
          token: response.token,
          connectionName: response.connectionName,
          query: structuredClone(definition),
        });
      else setResult(response);
    } catch (error) {
      if (requestSequence.current === sequence)
        setFailure(
          error instanceof Error ? error.message : "Could not execute SQL."
        );
    } finally {
      if (requestSequence.current === sequence) execution.current = null;
    }
  }
  function change(next: CustomSqlQuery) {
    setConfirmation(null);
    onChange(next);
  }
  let parametersValid = true;
  try {
    const parsed: unknown = JSON.parse(parametersText);
    parametersValid =
      Array.isArray(parsed) &&
      parsed.every(
        (value) =>
          typeof value === "string" ||
          (typeof value === "number" && Number.isFinite(value))
      );
  } catch {
    parametersValid = false;
  }
  useEffect(() => {
    onValidityChange?.(parametersValid);
  }, [onValidityChange, parametersValid]);
  return (
    <div className="space-y-4 p-5">
      <SqlEditor
        schemas={schemaData?.schemas}
        value={query.sql}
        onChange={(sql) => change({ ...query, sql })}
        dialect={query.dialect ?? "postgres"}
        autoFocus={autoFocus}
      />
      <details
        open={showParameters}
        onToggle={(event) => setShowParameters(event.currentTarget.open)}
        className="space-y-2 text-xs text-slate-600"
      >
        <summary className="cursor-pointer">
          Bound parameters (optional)
        </summary>
        <div className="space-y-1">
          <label
            htmlFor="sql-parameters"
            className="text-xs font-medium text-slate-600"
          >
            Bound parameters (JSON array, in placeholder order)
          </label>
          <textarea
            id="sql-parameters"
            className="w-full rounded border p-2 font-mono text-xs"
            value={parametersText}
            onChange={(event) => {
              setParametersText(event.target.value);
              try {
                const parameters: unknown = JSON.parse(event.target.value);
                if (
                  Array.isArray(parameters) &&
                  parameters.every(
                    (value) =>
                      typeof value === "string" ||
                      (typeof value === "number" && Number.isFinite(value))
                  )
                )
                  change({ ...query, parameters });
              } catch {
                /* Keep incomplete parameter edits local. */
              }
            }}
          />
          {!parametersValid && (
            <p role="alert" className="text-xs text-red-700">
              Enter an array of strings or numbers.
            </p>
          )}
        </div>
      </details>
      <div className="flex items-center gap-3">
        <Button
          disabled={!query.sql.trim() || !parametersValid || execute.isPending}
          onClick={() => {
            void run();
          }}
        >
          {execute.isPending ? <Spinner /> : <Play aria-hidden="true" />}Run SQL
        </Button>
        <Button
          variant="outline"
          disabled={execute.isPending}
          onClick={() =>
            change({ ...query, sql: formatSql(query.sql, query.dialect) })
          }
        >
          <AlignLeft aria-hidden="true" />
          Format SQL
        </Button>
        {execute.isPending && (
          <Button
            variant="ghost"
            onClick={() => {
              if (execution.current) {
                void cancel
                  .mutateAsync({ connectionId, executionId: execution.current })
                  .catch((error: unknown) =>
                    setFailure(
                      error instanceof Error
                        ? error.message
                        : "Could not cancel SQL."
                    )
                  );
              }
            }}
          >
            Cancel query
          </Button>
        )}
        <span className="text-xs text-slate-500">One statement per run.</span>
      </div>
      {execute.isPending && !result && (
        <p
          role="status"
          className="flex items-center gap-2 text-sm text-slate-500"
        >
          <Spinner />
          Running SQL…
        </p>
      )}
      {failure && (
        <Alert variant="destructive">
          <AlertDescription>{failure}</AlertDescription>
        </Alert>
      )}
      {result && (
        <DataTable
          columns={result.columns}
          rows={result.rows}
          isLoading={execute.isPending}
          summary={
            <>
              {result.affectedRows !== null && (
                <span>{result.affectedRows} affected rows</span>
              )}
              <span>{result.elapsedMs} ms</span>
              {result.truncated && <span>Showing the first 1,000 rows</span>}
            </>
          }
          emptyMessage={
            result.affectedRows === null
              ? "No records found"
              : "Statement completed."
          }
        />
      )}

      <Dialog
        open={confirmation !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmation(null);
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogTitle>Confirm database write</DialogTitle>
          <DialogDescription>
            This statement may change or delete data in{" "}
            <strong>{confirmation?.connectionName}</strong>. Run this exact
            statement?
          </DialogDescription>
          <SqlEditor
            value={confirmation?.query.sql ?? ""}
            readOnly
            dialect={confirmation?.query.dialect ?? "postgres"}
            height="200px"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmation(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                const approved = confirmation;
                setConfirmation(null);
                if (approved) void run(approved.query, approved.token);
              }}
            >
              Run write
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
