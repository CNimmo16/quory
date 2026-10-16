import { createContext, useContext, useState } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../main/ipc";
import {
  Check,
  ChevronDown,
  Database,
  Pencil,
  Plus,
  Power,
  CircleAlert,
} from "lucide-react";
import { Button } from "./ui/button";
import { Spinner } from "./LoadingState";
import { connectionColours } from "./connectionColours";
import { cn } from "../lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "./ui/context-menu";

type Connections =
  inferRouterOutputs<AppRouter>["connections"]["listSavedConnections"]["connections"];
export const ConnectionSelectorContext = createContext<{
  connections: Connections;
  isConnecting: boolean;
  isBusy: boolean;
  connectingId: string | undefined;
  error: string | undefined;
  onSelect: (id: string) => Promise<void>;
  onEdit: (id: string) => Promise<void>;
  onCreate: () => Promise<void>;
  onDisconnect: () => Promise<void>;
  registerSwitchGuard?: (canSwitch: () => boolean) => () => void;
} | null>(null);

export function ConnectionBadge({
  invalid = false,
  errorId,
  appearance = "badge",
}: {
  invalid?: boolean;
  errorId?: string | undefined;
  appearance?: "badge" | "prompt";
}) {
  const context = useContext(ConnectionSelectorContext);
  if (!context)
    throw new Error(
      "ConnectionBadge requires the project connection selector.",
    );
  const [open, setOpen] = useState(false);
  const { connections, isConnecting, connectingId, isBusy } = context;
  const active = connections.find((item) => item.isActive);
  const pending = connections.find((item) => item.id === connectingId);
  const selected = isConnecting ? pending : active;
  const colours =
    connectionColours[
      selected?.connection.colour ?? (selected ? "teal" : "slate")
    ];
  const name =
    (isConnecting ? pending : active)?.connection.nickname ??
    "Select connection";
  return (
    <div className="flex min-w-0 flex-col items-start gap-1">
      <DropdownMenu
        modal={false}
        open={open || isConnecting}
        onOpenChange={setOpen}
      >
        <DropdownMenuTrigger asChild>
          <Button
            variant={appearance === "prompt" ? "ghost" : "outline"}
            size="sm"
            className={cn(
              "max-w-full gap-2 rounded-full shadow-none",
              appearance === "prompt"
                ? cn(
                    "h-8 rounded-full border border-border bg-muted px-3 hover:bg-border",
                    selected && colours.badge,
                  )
                : colours.badge,
              appearance === "prompt" && !selected && "text-muted-foreground",
              invalid &&
                appearance === "badge" &&
                "border-warning bg-warning-subtle text-warning",
            )}
            aria-label={
              isConnecting ? `Connecting to ${name}` : `Connection: ${name}`
            }
            aria-busy={isConnecting}
            aria-invalid={invalid || undefined}
            aria-describedby={errorId}
            disabled={isBusy}
          >
            {isConnecting ? (
              <Spinner className="size-3.5" />
            ) : selected ? (
              <span
                aria-hidden="true"
                className={cn("size-2.5 shrink-0 rounded-full", colours.dot)}
              />
            ) : (
              <Database aria-hidden="true" className="size-3.5" />
            )}
            <span className="max-w-48 truncate">{name}</span>
            {invalid && appearance === "prompt" && (
              <CircleAlert
                aria-hidden="true"
                className="size-3.5 text-warning"
              />
            )}
            <ChevronDown aria-hidden="true" className="size-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          aria-label="Project connections"
          className="min-w-56"
        >
          {connections.map(({ id, connection, isActive }) => (
            <ContextMenu key={id}>
              <ContextMenuTrigger asChild disabled={isBusy}>
                <DropdownMenuItem
                  aria-label={connection.nickname}
                  aria-current={isActive ? "true" : undefined}
                  disabled={isBusy}
                  onSelect={(event) => {
                    if (isActive) {
                      setOpen(false);
                      return;
                    }
                    event.preventDefault();
                    void context.onSelect(id).then(() => setOpen(false));
                  }}
                >
                  {isConnecting && connectingId === id ? (
                    <span
                      role="status"
                      aria-label={`Connecting to ${connection.nickname}`}
                    >
                      <Spinner className="size-3.5" />
                    </span>
                  ) : (
                    <span
                      aria-hidden="true"
                      className={cn(
                        "size-2.5 shrink-0 rounded-full",
                        connectionColours[connection.colour ?? "teal"].dot,
                      )}
                    />
                  )}
                  <span className="min-w-0 flex-1 truncate">
                    {connection.nickname}
                  </span>
                  {isActive && (
                    <Check
                      aria-hidden="true"
                      className="ml-3 size-3.5 text-primary-emphasis"
                    />
                  )}
                </DropdownMenuItem>
              </ContextMenuTrigger>
              <ContextMenuContent>
                <ContextMenuItem
                  onSelect={() => {
                    void context.onEdit(id);
                  }}
                >
                  <Pencil aria-hidden="true" />
                  Edit connection
                </ContextMenuItem>
                {isActive && (
                  <ContextMenuItem
                    onSelect={() => {
                      void context.onDisconnect();
                    }}
                  >
                    <Power aria-hidden="true" />
                    Disconnect
                  </ContextMenuItem>
                )}
              </ContextMenuContent>
            </ContextMenu>
          ))}
          {connections.length === 0 && (
            <p className="px-2 py-3 text-xs text-muted-foreground">
              No connections in this project yet.
            </p>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={isBusy}
            onSelect={() => {
              void context.onCreate();
            }}
          >
            <Plus aria-hidden="true" />
            New connection
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {context.error && (
        <p role="alert" className="max-w-sm text-xs text-warning">
          {context.error}
        </p>
      )}
    </div>
  );
}
