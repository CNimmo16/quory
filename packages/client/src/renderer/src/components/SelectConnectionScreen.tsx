import { useContext } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Database, Plus, ArrowRight } from "lucide-react";
import { ConnectionSelectorContext } from "./ConnectionBadge";
import { connectionColours } from "./connectionColours";
import { Button } from "./ui/button";
import { Alert, AlertDescription } from "./ui/alert";
import { Spinner } from "./LoadingState";
import { cn } from "../lib/utils";

export function SelectConnectionScreen({
  queryId,
}: {
  queryId?: string | undefined;
}) {
  const context = useContext(ConnectionSelectorContext);
  const navigate = useNavigate();
  if (!context)
    throw new Error("Open a project before selecting a connection.");
  return (
    <section
      aria-label="Select connection"
      className="mx-auto flex w-full max-w-xl flex-col gap-6 px-6 py-16"
    >
      <div className="space-y-3">
        <Database aria-hidden="true" className="size-7 text-teal-600" />
        <h1 className="text-2xl font-semibold tracking-tight">
          Select connection
        </h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {queryId
            ? "Choose a connection from this project to run your query."
            : "Choose a connection to explore this project."}
        </p>
      </div>
      {context.connections.length > 0 ? (
        <ul aria-label="Project connections" className="space-y-2">
          {context.connections.map(({ id, connection }) => {
            const connecting =
              context.isConnecting && context.connectingId === id;
            return (
              <li key={id}>
                <Button
                  variant="outline"
                  className="h-auto w-full justify-start gap-3 px-4 py-3 text-left shadow-none"
                  aria-label={`Connect to ${connection.nickname}`}
                  aria-busy={connecting}
                  disabled={context.isBusy}
                  onClick={() => {
                    void context.onSelect(id);
                  }}
                >
                  {connecting ? (
                    <Spinner className="size-4" />
                  ) : (
                    <span
                      aria-hidden="true"
                      className={cn(
                        "size-3 shrink-0 rounded-full",
                        connectionColours[connection.colour ?? "teal"].dot
                      )}
                    />
                  )}
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="truncate font-medium">
                      {connection.nickname}
                    </span>
                    <span className="truncate text-xs font-normal text-muted-foreground">
                      {connection.type} ·{" "}
                      {connection.database ?? connection.hostOrFilePath}
                    </span>
                  </span>
                  {connecting ? (
                    <span role="status" className="text-xs font-normal">
                      Connecting…
                    </span>
                  ) : (
                    <ArrowRight
                      aria-hidden="true"
                      className="size-4 text-muted-foreground"
                    />
                  )}
                </Button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="rounded-lg border bg-slate-50 p-4 text-sm text-muted-foreground">
          No connections in this project yet.{" "}
          {queryId
            ? "Create one to open your query."
            : "Create one to start exploring."}
        </p>
      )}
      {context.error && (
        <Alert variant="destructive">
          <AlertDescription>{context.error}</AlertDescription>
        </Alert>
      )}
      <Button
        className="self-start"
        disabled={context.isBusy}
        onClick={() => {
          void navigate({
            to: "/connections",
            search: queryId
              ? { queryId, create: true }
              : { select: true, create: true },
          });
        }}
      >
        <Plus aria-hidden="true" />
        Create a new connection
      </Button>
    </section>
  );
}
