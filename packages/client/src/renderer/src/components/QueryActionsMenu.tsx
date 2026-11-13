import { useState } from "react";
import { MoreHorizontal, Pencil, Trash2, X } from "lucide-react";
import {
  ContextMenuItem,
  ContextMenuSub,
  ContextMenuSubTrigger,
  ContextMenuSubContent,
} from "./ui/context-menu";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "./ui/dropdown-menu";

type QueryActionProps = {
  disabled?: boolean;
  ephemeral?: boolean | undefined;
  onRename?: (() => void) | undefined;
  onDelete?: (() => void) | undefined;
};

export function QueryActionsMenuItems({
  menu = "dropdown",
  disabled = false,
  ephemeral = false,
  onRename,
  onDelete,
}: QueryActionProps & { menu?: "dropdown" | "context" }) {
  const [confirming, setConfirming] = useState(false);
  const MenuItem = menu === "context" ? ContextMenuItem : DropdownMenuItem;
  const MenuSub = menu === "context" ? ContextMenuSub : DropdownMenuSub;
  const MenuSubTrigger =
    menu === "context" ? ContextMenuSubTrigger : DropdownMenuSubTrigger;
  const MenuSubContent =
    menu === "context" ? ContextMenuSubContent : DropdownMenuSubContent;
  return (
    <>
      <MenuItem disabled={disabled || !onRename} onSelect={() => onRename?.()}>
        <Pencil aria-hidden="true" className="mr-2 size-4" />
        Rename query
      </MenuItem>
      <MenuSub open={confirming} onOpenChange={setConfirming}>
        <MenuSubTrigger
          disabled={disabled || !onDelete}
          className="text-destructive focus:text-destructive data-disabled:pointer-events-none data-disabled:opacity-50"
        >
          <Trash2 aria-hidden="true" className="mr-2 size-4" />
          {ephemeral ? "Discard query" : "Delete query"}
        </MenuSubTrigger>
        <MenuSubContent className="min-w-48" sideOffset={4}>
          <div className="px-2 py-1.5 text-sm font-medium">
            {ephemeral ? "Discard this unsaved query?" : "Delete this query?"}
          </div>
          <MenuItem
            disabled={disabled || !onDelete}
            onSelect={() => onDelete?.()}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 aria-hidden="true" className="mr-2 size-4" />
            {ephemeral ? "Confirm discard" : "Confirm delete"}
          </MenuItem>
          <MenuItem
            onSelect={(event) => {
              event.preventDefault();
              setConfirming(false);
            }}
          >
            <X aria-hidden="true" className="mr-2 size-4" />
            Cancel
          </MenuItem>
        </MenuSubContent>
      </MenuSub>
    </>
  );
}

export function QueryActionsMenu({
  disabled = false,
  ephemeral = false,
  onRename,
  onDelete,
}: QueryActionProps) {
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
      <DropdownMenuContent align="end" className="min-w-48">
        <QueryActionsMenuItems
          disabled={disabled}
          ephemeral={ephemeral}
          onRename={onRename}
          onDelete={onDelete}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
