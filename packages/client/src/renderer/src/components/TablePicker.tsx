import { useState } from "react";
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
  const selectedTable = groups
    .flatMap((group) =>
      group.tables.map((table) => ({
        label: table.name,
        value: `${group.name}.${table.name}`,
      }))
    )
    .find((table) => table.value === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
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
        className="w-[var(--radix-popover-trigger-width)] p-0"
        align="start"
      >
        <Command label="Search tables">
          <CommandInput
            placeholder="Search tables…"
            aria-label="Search tables"
          />
          <CommandList
            style={{
              maxHeight: `min(${Math.max(
                120,
                maxHeight
              )}px, calc(var(--radix-popover-content-available-height) - 3rem))`,
            }}
          >
            <CommandEmpty>No tables found.</CommandEmpty>
            {groups.map((group) => (
              <CommandGroup key={group.name} heading={group.name}>
                {group.tables.map((table) => {
                  const tableRef = `${group.name}.${table.name}`;
                  return (
                    <CommandItem
                      key={tableRef}
                      value={tableRef}
                      onSelect={() => {
                        onChange(tableRef);
                        setOpen(false);
                      }}
                    >
                      <Check
                        className={cn(
                          "mr-2 size-4",
                          value === tableRef ? "opacity-100" : "opacity-0"
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
