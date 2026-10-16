import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import type { CustomSqlQuery } from "../../../shared/sqlQuery";
import { SqlQueryWorkspace } from "./SqlQueryWorkspace";
import { Alert, AlertDescription } from "./ui/alert";
import { Button } from "./ui/button";
import { Spinner } from "./LoadingState";
import trpc from "../util/tprc";

export function NewSqlQuery({
  connectionId,
  query,
  onChange,
}: {
  connectionId: string;
  query: CustomSqlQuery;
  onChange: (query: CustomSqlQuery) => void;
}) {
  const [sqlValid, setSqlValid] = useState(true);
  const create = trpc.queries.createQuery.useMutation();
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="w-full">
      <p className="text-sm text-muted-foreground">
        Write a SQL statement to run against the current connection. Its write
        protection applies to every execution.
      </p>
      <SqlQueryWorkspace
        connectionId={connectionId}
        query={query}
        onChange={onChange}
        onValidityChange={setSqlValid}
      />
      <div className="px-5">
        <Button
          variant="outline"
          disabled={!query.sql.trim() || !sqlValid || create.isPending}
          onClick={async () => {
            setError(null);
            try {
              const { queryId } = await create.mutateAsync({
                connectionId,
                query,
              });
              await utils.projects.listQueries.invalidate();
              await navigate({ to: "/queries/$queryId", params: { queryId } });
            } catch (cause) {
              setError(
                cause instanceof Error
                  ? cause.message
                  : "Could not save SQL query.",
              );
            }
          }}
        >
          {create.isPending && <Spinner />}Save query
        </Button>
        {error && (
          <Alert variant="destructive" className="mt-3">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </div>
    </div>
  );
}
