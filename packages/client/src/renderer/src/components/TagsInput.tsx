import { useState, type Ref } from "react";
import { X } from "lucide-react";
import { Badge } from "./ui/badge";
import { Input } from "./ui/input";

export function TagsInput({
  value,
  onChange,
  onFocus,
  onBlur,
  inputRef,
  onSubmit,
}: {
  value: string[];
  onChange: (values: string[]) => void;
  onFocus?: (() => void) | undefined;
  onBlur?: (() => void) | undefined;
  inputRef?: Ref<HTMLInputElement>;
  onSubmit?: ((values: string[], next: boolean) => void) | undefined;
}) {
  const [draft, setDraft] = useState("");

  function commit(text: string) {
    const additions = text
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    const values = [...new Set([...value, ...additions])];
    if (additions.length) onChange(values);
    setDraft("");
    return values;
  }

  return (
    <div className="flex min-h-8 min-w-40 flex-1 flex-wrap items-center gap-1 rounded-md border border-border bg-card px-2 py-1 focus-within:ring-1 focus-within:ring-primary">
      {value.map((tag) => (
        <Badge
          key={tag}
          variant="secondary"
          className="gap-1 border border-primary bg-primary-subtle text-[10px] font-medium text-primary-emphasis hover:bg-primary-subtle"
        >
          {tag}
          <button
            type="button"
            aria-label={`Remove ${tag}`}
            className="rounded-sm focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-hidden"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onChange(value.filter((item) => item !== tag))}
          >
            <X className="size-3" />
          </button>
        </Badge>
      ))}
      <Input
        ref={inputRef}
        aria-label="Filter values"
        placeholder={value.length ? undefined : "Add values"}
        value={draft}
        className="h-5 w-20 min-w-20 flex-1 border-0 p-0 text-xs text-foreground shadow-none focus-visible:ring-0"
        onChange={(event) => setDraft(event.target.value)}
        onFocus={onFocus}
        onBlur={() => {
          commit(draft);
          onBlur?.();
        }}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === "Enter" || event.key === ",") {
            event.preventDefault();
            const values = commit(draft);
            if (
              event.key === "Enter" &&
              (event.shiftKey || event.metaKey || event.ctrlKey)
            )
              onSubmit?.(values, event.shiftKey);
          } else if (event.key === "Backspace" && !draft) {
            onChange(value.slice(0, -1));
          }
        }}
        onPaste={(event) => {
          const text = event.clipboardData.getData("text");
          if (text.includes(",")) {
            event.preventDefault();
            commit(draft + text);
          }
        }}
      />
    </div>
  );
}
