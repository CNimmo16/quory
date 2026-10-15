import { useRef } from "react";
import { ChevronsUpDown } from "lucide-react";
import { Button } from "./ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import {
  Command,
  CommandInput,
  CommandList,
  CommandItem,
  CommandEmpty,
} from "./ui/command";
import { cn } from "../lib/utils";

export function FilterFieldPicker({
  label,
  searchLabel,
  value,
  placeholder,
  options,
  open,
  onOpenChange,
  onSelect,
  className,
  maxHeight,
  onFocus,
  onBlur,
}: {
  label: string;
  searchLabel: string;
  value: string;
  placeholder?: string;
  options: readonly string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (value: string) => void;
  className?: string;
  maxHeight: number;
  onFocus?: (() => void) | undefined;
  onBlur?: (() => void) | undefined;
}) {
  const input = useRef<HTMLInputElement>(null);
  const advancing = useRef(false);
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-label={label}
          aria-expanded={open}
          onFocus={onFocus}
          onBlur={onBlur}
          className={cn(
            "h-8 justify-between gap-2 border-slate-200 px-3 text-xs font-normal text-slate-700 shadow-none focus-visible:ring-teal-600",
            className
          )}
        >
          <span className="truncate">{value || placeholder}</span>
          <ChevronsUpDown
            aria-hidden="true"
            className="size-3 shrink-0 text-slate-400"
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-64 max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border-slate-200 bg-white p-0 shadow-none"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          advancing.current = false;
          input.current?.focus();
        }}
        onCloseAutoFocus={(event) => {
          if (advancing.current) event.preventDefault();
        }}
      >
        <Command label={searchLabel} defaultValue={value} loop>
          <CommandInput
            ref={input}
            placeholder={searchLabel + "…"}
            className="h-9 py-2 text-xs"
          />
          <CommandList
            style={{ maxHeight: Math.min(280, maxHeight) }}
            className="overscroll-contain p-1"
          >
            <CommandEmpty>No matches</CommandEmpty>
            {options.map((option) => (
              <CommandItem
                key={option}
                value={option}
                className="text-xs data-[selected=true]:bg-teal-50 data-[selected=true]:text-teal-900"
                onSelect={() => {
                  advancing.current = true;
                  onOpenChange(false);
                  onSelect(option);
                }}
              >
                {option}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
