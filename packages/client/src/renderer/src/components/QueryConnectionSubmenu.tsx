import { useState } from "react";
import { Check, Database } from "lucide-react";
import trpc from "../util/tprc";
import { cn } from "../lib/utils";
import { connectionColours } from "./connectionColours";
import { LoadingState } from "./LoadingState";
import {
  ContextMenuItem,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from "./ui/context-menu";

export function QueryConnectionSubmenu({
  projectId,
  disabled,
  onOpen,
}: {
  projectId: string;
  disabled: boolean;
  onOpen: (connectionId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const { data, error } = trpc.connections.listSavedConnections.useQuery(
    { projectId },
    { enabled: open },
  );

  return (
    <ContextMenuSub open={open} onOpenChange={setOpen}>
      <ContextMenuSubTrigger disabled={disabled}>
        <Database aria-hidden="true" />
        Change connection
      </ContextMenuSubTrigger>
      <ContextMenuSubContent
        aria-label="Choose query connection"
        className="max-w-xs min-w-56"
      >
        {!data && !error && <LoadingState label="Loading connections…" />}
        {data?.connections.map(({ id, connection, isActive }) => (
          <ContextMenuItem
            key={id}
            aria-label={connection.nickname}
            aria-current={isActive ? "true" : undefined}
            disabled={disabled}
            onSelect={() => onOpen(id)}
          >
            <span
              aria-hidden="true"
              className={cn(
                "size-2.5 shrink-0 rounded-full",
                connectionColours[connection.colour ?? "teal"].dot,
              )}
            />
            <span className="min-w-0 flex-1 truncate">
              {connection.nickname}
            </span>
            {isActive && <Check aria-hidden="true" />}
          </ContextMenuItem>
        ))}
        {data?.connections.length === 0 && (
          <p className="px-2 py-3 text-xs text-muted-foreground">
            No connections in this project yet.
          </p>
        )}
        {error && (
          <p role="alert" className="px-2 py-2 text-xs text-warning">
            {error.message}
          </p>
        )}
      </ContextMenuSubContent>
    </ContextMenuSub>
  );
}
