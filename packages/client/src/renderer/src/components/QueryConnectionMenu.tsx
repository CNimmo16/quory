import { useState, type ReactNode } from "react";
import { Plus } from "lucide-react";
import trpc from "../util/tprc";
import { navigationItemClassName } from "./NavLink";
import { connectionColours } from "./connectionColours";
import { Spinner } from "./LoadingState";
import { cn } from "../lib/utils";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "./ui/dropdown-menu";

export function QueryConnectionMenu({
  projectId,
  disabled,
  onOpen,
  children,
}: {
  projectId: string;
  disabled: boolean;
  onOpen: (connectionId?: string) => Promise<void>;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const { data, error } = trpc.connections.listSavedConnections.useQuery(
    { projectId },
    { enabled: open },
  );
  async function choose(connectionId?: string) {
    setPending(connectionId ?? "create");
    setFailure(null);
    try {
      await onOpen(connectionId);
      setOpen(false);
    } catch (cause) {
      setFailure(
        cause instanceof Error
          ? cause.message
          : "Could not connect to the database.",
      );
    } finally {
      setPending(null);
    }
  }
  return (
    <DropdownMenu
      modal={false}
      open={open}
      onOpenChange={(value) => {
        if (!pending) setOpen(value);
      }}
    >
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={`${navigationItemClassName} gap-2 pl-3`}
        >
          {children}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="right"
        align="start"
        sideOffset={8}
        aria-label="Choose query connection"
        className="max-w-xs min-w-56"
      >
        <DropdownMenuLabel>Select a connection</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {!data && !error && (
          <p
            role="status"
            className="flex items-center gap-2 px-2 py-3 text-xs text-muted-foreground"
          >
            <Spinner className="size-3.5" />
            Loading connections…
          </p>
        )}
        {data?.connections.map(({ id, connection }) => (
          <DropdownMenuItem
            key={id}
            aria-label={connection.nickname}
            disabled={disabled || !!pending}
            onSelect={(event) => {
              event.preventDefault();
              void choose(id);
            }}
          >
            {pending === id ? (
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
            <span className="truncate">{connection.nickname}</span>
          </DropdownMenuItem>
        ))}
        {data?.connections.length === 0 && (
          <p className="px-2 py-3 text-xs text-muted-foreground">
            No connections in this project yet.
          </p>
        )}
        {(failure || error) && (
          <p role="alert" className="px-2 py-2 text-xs text-warning">
            {failure ?? error?.message}
          </p>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={disabled || !!pending}
          onSelect={(event) => {
            event.preventDefault();
            void choose();
          }}
        >
          <Plus aria-hidden="true" />
          New connection
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
