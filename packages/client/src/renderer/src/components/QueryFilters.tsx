import { useState, type ReactElement } from "react";
import {
  ConditionOperator,
  findTableFromSchemas,
  isBooleanCondition,
  isConditionComplete,
  isListCondition,
  splitTableRef,
  type Condition,
  type DatabaseSchema,
  type DatabaseTableInfo,
  type PreparedJoinDef,
  type PreparedQuery,
} from "@quory/core";
import type { useQuery } from "@quory/stack/react";
import { SlidersHorizontal, ArrowUpRight } from "lucide-react";
import ConditionEditor from "./ConditionEditor";
import { Button } from "./ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";

type JoinActions = ReturnType<typeof useQuery>["joinActions"];

export function countFilters(condition?: Condition): number {
  if (!condition) return 0;
  return isBooleanCondition(condition)
    ? condition.conditions.reduce((sum, child) => sum + countFilters(child), 0)
    : 1;
}

export function formatCondition(condition: Condition): string {
  if (isBooleanCondition(condition)) {
    return condition.conditions
      .map((child) => {
        const text = formatCondition(child);
        return isBooleanCondition(child) && child.conditions.length > 1
          ? `(${text})`
          : text;
      })
      .join(` ${condition.operator.toUpperCase()} `);
  }
  return `${condition.column} ${condition.operator} ${
    isListCondition(condition)
      ? `(${condition.values.map((value) => JSON.stringify(value)).join(", ")})`
      : JSON.stringify(condition.value)
  }`;
}

function completeCondition(condition: Condition): Condition | null {
  if (!isBooleanCondition(condition))
    return isConditionComplete(condition) ? condition : null;
  const conditions = condition.conditions
    .map(completeCondition)
    .filter((child): child is Condition => child !== null);
  return conditions.length ? { ...condition, conditions } : null;
}

export function QueryFilterPopover({
  join,
  columns,
  joinActions,
  children,
}: {
  join: PreparedJoinDef;
  columns: DatabaseTableInfo["columns"];
  joinActions: JoinActions;
  children: ReactElement;
}) {
  const [open, setOpen] = useState(false);
  const [condition, setCondition] = useState<Condition | null>(null);
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setCondition(
            join.where
              ? isBooleanCondition(join.where)
                ? join.where
                : { operator: ConditionOperator.AND, conditions: [join.where] }
              : {
                  operator: ConditionOperator.AND,
                  conditions: [
                    {
                      column: columns[0]?.name ?? "",
                      operator: ConditionOperator.EQUALS,
                      value: "",
                    },
                  ],
                }
          );
        }
        setOpen(next);
      }}
    >
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        align="start"
        className="flex max-h-[var(--radix-popover-content-available-height)] w-[650px] max-w-[calc(100vw-2rem)] flex-col gap-4 overflow-auto border-slate-300 bg-white shadow-none [&_button]:shadow-none [&_input]:shadow-none"
      >
        <div className="border-b border-slate-200 pb-3">
          <p className="text-sm font-semibold text-slate-900">Filters</p>
          <p className="mt-0.5 break-all font-mono text-xs text-slate-500">
            {join.tableRef}
          </p>
        </div>
        {condition && (
          <ConditionEditor
            columns={columns}
            condition={condition}
            maxDropdownHeight={500}
            onConditionChange={setCondition}
          />
        )}
        <div className="flex justify-end gap-2 border-t border-slate-200 pt-3">
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            disabled={!condition}
            className="bg-slate-900 text-white hover:bg-slate-800"
            onClick={() => {
              if (!condition || !isBooleanCondition(condition)) return;
              const complete = completeCondition(condition);
              if (complete && isBooleanCondition(complete))
                joinActions(join.joinAlias).setCondition(complete);
              else joinActions(join.joinAlias).removeCondition();
              setOpen(false);
            }}
          >
            Apply
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function QueryFilters({
  query,
  schemas,
  joinActions,
  onHighlight,
}: {
  query: PreparedQuery;
  schemas: DatabaseSchema[];
  joinActions: JoinActions;
  onHighlight: (alias: string | null) => void;
}) {
  function collect(join: PreparedJoinDef): PreparedJoinDef[] {
    return [join, ...join.joins.flatMap(collect)];
  }
  const joins = collect(query.base);
  const filtered = joins.filter((join) => join.where);
  const count = filtered.reduce(
    (sum, join) => sum + countFilters(join.where),
    0
  );
  return (
    <section
      aria-label="Query filters"
      className="border-b border-slate-200 bg-white px-4 py-3"
    >
      <div className="flex items-center gap-2 text-xs">
        <SlidersHorizontal
          aria-hidden="true"
          className="size-3.5 text-slate-500"
        />
        <h2 className="font-semibold text-slate-700">Filters</h2>
        <span className="tabular-nums text-slate-400">{count}</span>
        {!count && (
          <span className="ml-1 text-slate-400">No filters applied</span>
        )}
      </div>
      {!!count && (
        <div className="mt-2.5 flex flex-wrap gap-2">
          {filtered.map((join) => {
            const [schema, name] = splitTableRef(join.tableRef);
            const repeated = joins.filter(
              (item) => item.tableRef === join.tableRef
            );
            const label =
              repeated.length > 1
                ? `${join.tableRef} · ${repeated.indexOf(join) + 1}`
                : join.tableRef;
            return (
              <QueryFilterPopover
                key={join.joinAlias}
                join={join}
                columns={findTableFromSchemas(schemas, schema, name).columns}
                joinActions={joinActions}
              >
                <button
                  type="button"
                  aria-label={`Edit filters for ${label}: ${formatCondition(
                    join.where!
                  )}`}
                  onMouseEnter={() => onHighlight(join.joinAlias)}
                  onMouseLeave={() => onHighlight(null)}
                  onFocus={() => onHighlight(join.joinAlias)}
                  onBlur={() => onHighlight(null)}
                  className="group flex max-w-full flex-wrap items-baseline gap-x-2 gap-y-1 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-left text-xs transition-colors hover:border-teal-500 hover:bg-teal-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600"
                >
                  <span className="break-all font-semibold text-slate-600">
                    {label}
                  </span>
                  <span className="min-w-0 break-words text-slate-800 [overflow-wrap:anywhere]">
                    {formatCondition(join.where!)}
                  </span>
                  <ArrowUpRight
                    aria-hidden="true"
                    className="size-3 shrink-0 self-center text-slate-400 group-hover:text-teal-700"
                  />
                </button>
              </QueryFilterPopover>
            );
          })}
        </div>
      )}
    </section>
  );
}
