import { useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  EyeOff,
  Filter,
  MoreHorizontal,
} from "lucide-react";
import type { DatabaseTableInfo, PreparedJoinDef } from "@quory/core";
import type useQuery from "../hooks/useQuery";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { QueryFilterPopover } from "./QueryFilters";

export function ColumnHeaderMenu({
  join,
  table,
  column,
  readableName,
  visibleColumns,
  joinActions,
  onSort,
}: {
  join: PreparedJoinDef;
  table: DatabaseTableInfo;
  column: string;
  readableName: string;
  visibleColumns: string[];
  joinActions: ReturnType<typeof useQuery>["joinActions"];
  onSort: (direction: "asc" | "desc") => void;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const bounds = useRef<DOMRect | null>(null);
  const anchor = useRef({
    getBoundingClientRect: () =>
      bounds.current ?? trigger.current!.getBoundingClientRect(),
  });
  const [filterOpen, setFilterOpen] = useState(false);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            ref={trigger}
            type="button"
            aria-label={`Options for ${readableName}`}
            className="text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-primary rounded-sm p-1"
          >
            <MoreHorizontal className="size-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="shadow-none"
          onCloseAutoFocus={(event) => {
            // Let the filter popup take focus when the menu closes.
            if (filterOpen) event.preventDefault();
          }}
        >
          <DropdownMenuItem onSelect={() => onSort("asc")}>
            <ArrowUp />
            Sort ascending
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onSort("desc")}>
            <ArrowDown />
            Sort descending
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={(event) => {
              // Keep the clicked action's position after the menu unmounts.
              bounds.current = (
                event.currentTarget as HTMLElement
              ).getBoundingClientRect();
              setFilterOpen(true);
            }}
          >
            <Filter />
            Filter by value…
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={visibleColumns.length === 1 && join.joins.length === 0}
            onSelect={() =>
              joinActions(join.joinAlias).setSelectedColumns(
                visibleColumns.filter((name) => name !== column),
              )
            }
          >
            <EyeOff />
            Hide column
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {filterOpen && (
        <QueryFilterPopover
          join={join}
          columns={table.columns}
          joinActions={joinActions}
          initialColumn={column}
          defaultOpen
          anchorRef={anchor}
          onOpenChange={setFilterOpen}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            trigger.current?.focus();
          }}
        />
      )}
    </>
  );
}
