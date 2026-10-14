import { useState } from "react";
import type { DatabaseTableInfo } from "@quory/core";
import { Columns3 } from "lucide-react";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Hint } from "./Hint";
import { cn } from "../lib/utils";

export function TableColumnsMenu({
  table,
  visibleColumns,
  actions,
}: {
  table: DatabaseTableInfo;
  visibleColumns: string[];
  actions: { setSelectedColumns: (columns: string[]) => void };
}) {
  const [open, setOpen] = useState(false);
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
  const tableName = table.name;
  return (
    <DropdownMenu
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) setSelectedColumns(visibleColumns);
      }}
    >
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Edit displayed columns for ${tableName}`}
          className="flex h-6 min-w-0 items-center gap-1 rounded px-1 text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600"
        >
          <Columns3 aria-hidden="true" className="size-3 shrink-0" />
          <span className="truncate">
            {visibleColumns.length}{" "}
            {visibleColumns.length === 1 ? "column" : "columns"}
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="max-h-[var(--radix-dropdown-menu-content-available-height)] min-w-52 max-w-[calc(100vw-2rem)] overflow-auto border-slate-300 shadow-none"
      >
        <DropdownMenuCheckboxItem
          checked={
            selectedColumns.length === table.columns.length
              ? true
              : selectedColumns.length > 0
              ? "indeterminate"
              : false
          }
          onSelect={(event) => event.preventDefault()}
          onCheckedChange={() =>
            setSelectedColumns(
              selectedColumns.length === table.columns.length
                ? [table.columns[0]!.name]
                : table.columns.map((column) => column.name)
            )
          }
        >
          Select all
        </DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        {table.columns.map((column) => {
          const disabled =
            selectedColumns.includes(column.name) &&
            selectedColumns.length === 1;
          return (
            <Hint
              key={column.name}
              disabled={!disabled}
              content="Keep at least one displayed column."
              side="right"
            >
              <DropdownMenuCheckboxItem
                checked={selectedColumns.includes(column.name)}
                aria-disabled={disabled}
                className={cn(
                  "break-all",
                  disabled && "cursor-not-allowed text-slate-400"
                )}
                onSelect={(event) => event.preventDefault()}
                onCheckedChange={(checked) => {
                  if (!disabled)
                    setSelectedColumns(
                      checked
                        ? [...selectedColumns, column.name]
                        : selectedColumns.filter((name) => name !== column.name)
                    );
                }}
              >
                {column.name}
              </DropdownMenuCheckboxItem>
            </Hint>
          );
        })}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          asChild
          disabled={!selectedColumns.length}
          onSelect={() => {
            actions.setSelectedColumns(selectedColumns);
            setOpen(false);
          }}
        >
          <Button
            type="button"
            variant="secondary"
            className="w-full shadow-none"
          >
            Apply
          </Button>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
