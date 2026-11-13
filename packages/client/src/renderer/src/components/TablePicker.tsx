import { useState } from "react";
import { defaultFilter } from "cmdk";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "./ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "./ui/command";
import { cn } from "../lib/utils";

function isExactTableMatch(
  tableRef: string,
  search: string,
  names: string[] = [],
) {
  const term = search.trim().toLowerCase();
  return (
    tableRef.toLowerCase() === term ||
    names.some((name) => name.toLowerCase() === term)
  );
}

export function TablePicker({
  id,
  groups,
  value,
  onChange,
  maxHeight,
}: {
  id: string;
  groups: { name: string; tables: { name: string }[] }[];
  value: string | null;
  onChange: (value: string) => void;
  maxHeight: number;
}) {
  const [open, setOpen] = useState(!value);
  const [search, setSearch] = useState("");
  // Schema groups stay intact, with exact-match schemas ahead of partial matches.
  const rankedGroups = groups
    .map((group) => ({
      group,
      exact: group.tables.some((table) =>
        isExactTableMatch(`${group.name}.${table.name}`, search, [table.name]),
      ),
    }))
    .sort((a, b) => Number(b.exact) - Number(a.exact));
  const selectedTable = groups
    .flatMap((group) =>
      group.tables.map((table) => ({
        label: table.name,
        value: `${group.name}.${table.name}`,
      })),
    )
    .find((table) => table.value === value);

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        setSearch("");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          {selectedTable?.label ?? "Select a table"}
          <ChevronsUpDown className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-(--radix-popover-trigger-width) p-0"
        align="start"
      >
        <Command
          label="Search tables"
          filter={(tableRef, term, keywords) => {
            if (isExactTableMatch(tableRef, term, keywords)) return 1;
            // Keep fuzzy matching, but reserve the highest rank for exact names.
            return defaultFilter(tableRef, term) * 0.9;
          }}
        >
          <CommandInput
            value={search}
            onValueChange={setSearch}
            placeholder="Search tables…"
            aria-label="Search tables"
          />
          <CommandList
            style={{
              maxHeight: `min(${Math.max(
                120,
                maxHeight,
              )}px, calc(var(--radix-popover-content-available-height) - 3rem))`,
            }}
          >
            <CommandEmpty>No tables found.</CommandEmpty>
            {rankedGroups.map(({ group }) => (
              <CommandGroup key={group.name} heading={group.name}>
                {group.tables.map((table) => {
                  const tableRef = `${group.name}.${table.name}`;
                  return (
                    <CommandItem
                      key={tableRef}
                      value={tableRef}
                      keywords={[table.name]}
                      onSelect={() => {
                        onChange(tableRef);
                        setOpen(false);
                      }}
                    >
                      <Check
                        className={cn(
                          "mr-2 size-4",
                          value === tableRef ? "opacity-100" : "opacity-0",
                        )}
                      />
                      {table.name}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
