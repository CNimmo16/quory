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
import type useQuery from "../hooks/useQuery";
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
  function apply(updated = condition) {
    if (!updated || !isBooleanCondition(updated)) return;
    const complete = completeCondition(updated);
    if (complete && isBooleanCondition(complete))
      joinActions(join.joinAlias).setCondition(complete);
    else joinActions(join.joinAlias).removeCondition();
    setOpen(false);
  }
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
                },
          );
        }
        setOpen(next);
      }}
    >
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        align="start"
        className="border-border bg-card flex max-h-(--radix-popover-content-available-height) w-162.5 max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-lg p-0 shadow-none [&_button]:shadow-none [&_input]:shadow-none"
      >
        <div className="border-border bg-background/60 flex shrink-0 items-center gap-2 border-b px-3 py-2.5">
          <SlidersHorizontal
            aria-hidden="true"
            className="text-muted-foreground size-3.5 shrink-0"
          />
          <h3 className="text-foreground text-xs font-semibold">Filters</h3>
          <span
            className="text-muted-foreground ml-auto truncate text-[11px]"
            title={join.tableRef}
          >
            {join.tableRef}
          </span>
        </div>
        <div className="min-h-0 overflow-y-auto overscroll-contain p-3">
          {condition && (
            <ConditionEditor
              columns={columns}
              condition={condition}
              maxDropdownHeight={500}
              onConditionChange={setCondition}
              autoFocus={!join.where}
              onApply={apply}
            />
          )}
        </div>
        <div className="border-border bg-background/60 flex shrink-0 items-center justify-end gap-2 border-t px-3 py-2">
          <span className="text-muted-foreground mr-auto text-[10px]">
            Enter to apply · Shift+Enter for another filter · ⌘/Ctrl+Enter to
            apply lists
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:bg-muted hover:text-foreground h-7 px-2 text-xs"
            onClick={() => setOpen(false)}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={!condition}
            className="bg-primary text-primary-foreground hover:bg-primary-hover h-7 px-3 text-xs"
            onClick={() => apply()}
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
  actions,
}: {
  actions?: ReactElement | undefined;
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
    0,
  );
  return (
    <section
      aria-label="Query filters"
      className="border-border bg-card border-b px-4 py-3"
    >
      <div className="flex items-center gap-2 text-xs">
        <SlidersHorizontal
          aria-hidden="true"
          className="text-muted-foreground size-3.5 shrink-0"
        />
        <h2 className="text-foreground shrink-0 font-semibold">Filters</h2>
        <span className="text-muted-foreground shrink-0 tabular-nums">
          {count}
        </span>
        {!count && !actions && (
          <span className="text-muted-foreground ml-1">No filters applied</span>
        )}
        {actions && <div className="ml-auto min-w-0 flex-1">{actions}</div>}
      </div>
      {!!count && (
        <div className="mt-2.5 flex flex-wrap gap-2">
          {filtered.map((join) => {
            const [schema, name] = splitTableRef(join.tableRef);
            const repeated = joins.filter(
              (item) => item.tableRef === join.tableRef,
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
                    join.where!,
                  )}`}
                  onMouseEnter={() => onHighlight(join.joinAlias)}
                  onMouseLeave={() => onHighlight(null)}
                  onFocus={() => onHighlight(join.joinAlias)}
                  onBlur={() => onHighlight(null)}
                  className="group border-border bg-background hover:border-primary hover:bg-primary-subtle focus-visible:outline-primary flex max-w-full flex-wrap items-baseline gap-x-2 gap-y-1 rounded-md border px-2.5 py-1.5 text-left text-xs transition-colors focus-visible:outline focus-visible:outline-2"
                >
                  <span className="text-muted-foreground font-semibold break-all">
                    {label}
                  </span>
                  <span className="text-foreground min-w-0 wrap-anywhere wrap-break-word">
                    {formatCondition(join.where!)}
                  </span>
                  <ArrowUpRight
                    aria-hidden="true"
                    className="text-muted-foreground group-hover:text-primary-emphasis size-3 shrink-0 self-center"
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
