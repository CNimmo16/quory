import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "./ui/dropdown-menu";

export function QueryActionsMenu({
  disabled = false,
  onRename,
  onDelete,
}: {
  disabled?: boolean;
  onRename?: () => void;
  onDelete?: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 shrink-0"
          aria-label="Query actions"
          disabled={disabled}
        >
          <MoreHorizontal aria-hidden="true" className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem disabled={!onRename} onSelect={() => onRename?.()}>
          <Pencil aria-hidden="true" className="mr-2 size-4" />
          Rename query
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={!onDelete}
          onSelect={() => onDelete?.()}
          className="text-destructive focus:text-destructive"
        >
          <Trash2 aria-hidden="true" className="mr-2 size-4" />
          Delete query
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
