import { Code2, Workflow } from "lucide-react";
import { Hint } from "./Hint";

export function QueryModeSwitch({
  sql,
  onChange,
}: {
  sql: boolean;
  onChange: (sql: boolean) => void;
}) {
  return (
    <Hint content={sql ? "Show relationship view" : "Show SQL query"}>
      <button
        type="button"
        role="switch"
        aria-label="SQL view"
        aria-checked={sql}
        onClick={() => onChange(!sql)}
        className="relative grid h-7 w-16 grid-cols-2 items-center rounded-full border border-border bg-muted p-1 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-hidden"
      >
        <span
          aria-hidden="true"
          className={`absolute top-1 bottom-1 left-1 w-7 rounded-full border border-border bg-card shadow-xs transition-transform duration-200 motion-reduce:transition-none ${
            sql ? "translate-x-7" : "translate-x-0"
          }`}
        />
        <Workflow
          aria-hidden="true"
          className={`relative mx-auto size-3.5 ${
            sql ? "text-muted-foreground" : "text-foreground"
          }`}
        />
        <Code2
          aria-hidden="true"
          className={`relative mx-auto size-3.5 ${
            sql ? "text-foreground" : "text-muted-foreground"
          }`}
        />
      </button>
    </Hint>
  );
}
