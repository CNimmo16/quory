import { useState } from "react";
import { X } from "lucide-react";
import { Badge } from "./ui/badge";
import { Input } from "./ui/input";

export function TagsInput({
  value,
  onChange,
  onFocus,
  onBlur,
}: {
  value: string[];
  onChange: (values: string[]) => void;
  onFocus?: (() => void) | undefined;
  onBlur?: (() => void) | undefined;
}) {
  const [draft, setDraft] = useState("");

  function commit(text: string) {
    const additions = text
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    if (additions.length) onChange([...new Set([...value, ...additions])]);
    setDraft("");
  }

  return (
    <div className="flex min-h-9 min-w-40 flex-1 flex-wrap items-center gap-1 rounded-md border border-input bg-background px-2 py-1 focus-within:ring-1 focus-within:ring-ring">
      {value.map((tag) => (
        <Badge key={tag} variant="secondary" className="gap-1">
          {tag}
          <button
            type="button"
            aria-label={`Remove ${tag}`}
            className="rounded-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onChange(value.filter((item) => item !== tag))}
          >
            <X className="size-3" />
          </button>
        </Badge>
      ))}
      <Input
        aria-label="Filter values"
        placeholder={value.length ? undefined : "Add values"}
        value={draft}
        className="h-6 w-20 min-w-20 flex-1 border-0 p-0 shadow-none focus-visible:ring-0"
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
            commit(draft);
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
