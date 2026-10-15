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
        className="relative grid h-7 w-16 grid-cols-2 items-center rounded-full border border-slate-200 bg-slate-100 p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <span
          aria-hidden="true"
          className={`absolute bottom-1 left-1 top-1 w-7 rounded-full border border-slate-200 bg-white shadow-sm transition-transform duration-200 motion-reduce:transition-none ${
            sql ? "translate-x-7" : "translate-x-0"
          }`}
        />
        <Workflow
          aria-hidden="true"
          className={`relative mx-auto size-3.5 ${
            sql ? "text-slate-400" : "text-slate-800"
          }`}
        />
        <Code2
          aria-hidden="true"
          className={`relative mx-auto size-3.5 ${
            sql ? "text-slate-800" : "text-slate-400"
          }`}
        />
      </button>
    </Hint>
  );
}
