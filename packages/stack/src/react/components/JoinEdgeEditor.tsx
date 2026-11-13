import { useMemo, useState } from "react";
import { Check, Pencil } from "lucide-react";
import type {
  DatabaseSchema,
  RelationshipConstraint,
  ViaTableStep,
} from "@quory/core";
import { MAX_QUERY_TABLES } from "@quory/core";
import { Button } from "./ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { getJoinRouteOptions } from "./joinRouteOptions";
import type { DiagramPoint } from "./tableNavigatorLayout";

type Props = {
  schemas: DatabaseSchema[];
  source: string;
  target: string;
  tableCount: number;
  current: RelationshipConstraint | undefined;
  onSelect: (steps: ViaTableStep[]) => void;
};

export function JoinEdgeEditor({
  points,
  ...props
}: Props & { points: DiagramPoint[] }) {
  const [open, setOpen] = useState(false);
  // The final segment belongs to this destination even when sibling edges share a rail.
  const end = points[points.length - 1]!;
  const beforeEnd = points[points.length - 2]!;
  const center = { x: (end.x + beforeEnd.x) / 2, y: (end.y + beforeEnd.y) / 2 };
  const label = `Edit join from ${props.source} to ${props.target}`;
  return (
    <foreignObject
      x={center.x - 12}
      y={center.y - 12}
      width={24}
      height={24}
      className="pointer-events-none overflow-visible"
    >
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label={label}
            className="bg-card text-primary-emphasis pointer-events-none size-6 rounded-md opacity-0 transition-opacity group-hover/edge:pointer-events-auto group-hover/edge:opacity-100 group-focus-within/edge:pointer-events-auto group-focus-within/edge:opacity-100 data-[state=open]:pointer-events-auto data-[state=open]:opacity-100 motion-reduce:transition-none [&_svg]:size-3.5"
          >
            <Pencil aria-hidden="true" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          aria-label={label}
          className="bg-card max-h-[var(--radix-popover-content-available-height)] w-80 max-w-[calc(100vw-2rem)] overflow-y-auto p-3"
        >
          <JoinChoices
            {...props}
            onSelect={(steps) => {
              props.onSelect(steps);
              setOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>
    </foreignObject>
  );
}

function JoinChoices({
  schemas,
  source,
  target,
  current,
  tableCount,
  onSelect,
}: Props) {
  const { direct, routes } = useMemo(
    () => getJoinRouteOptions(schemas, source, target),
    [schemas, source, target],
  );
  return (
    <div className="space-y-3">
      <section>
        <h3 className="text-muted-foreground mb-1 text-xs font-semibold">
          Join columns
        </h3>
        {direct.map(({ relationship, step, forward }) => {
          const selected =
            relationship.constraintId === current?.constraintId &&
            relationship.localSchema === current.localSchema &&
            relationship.localTable === current.localTable;
          return (
            <Button
              key={JSON.stringify(step)}
              type="button"
              variant="ghost"
              disabled={selected}
              className="h-auto w-full justify-start whitespace-normal px-2 py-1.5 text-left text-xs disabled:opacity-100"
              onClick={() => onSelect([step])}
            >
              <span className="min-w-0 grow break-all font-mono">
                {relationship.columnPairs.map(
                  ({ localColumn, foreignColumn }, i) => (
                    <span key={i} className="block">
                      {source}.{forward ? localColumn : foreignColumn} ={" "}
                      {target}.{forward ? foreignColumn : localColumn}
                    </span>
                  ),
                )}
              </span>
              {selected && (
                <Check
                  aria-label="Current relationship"
                  className="text-primary-emphasis"
                />
              )}
            </Button>
          );
        })}
        {!direct.length && (
          <p className="text-muted-foreground text-xs">
            No direct relationship available.
          </p>
        )}
      </section>
      <section>
        <h3 className="text-muted-foreground mb-1 text-xs font-semibold">
          Insert intermediate table
        </h3>
        {routes.map((route) => (
          <Button
            key={route[0]!.step.tableRef}
            disabled={tableCount + route.length - 1 > MAX_QUERY_TABLES}
            title={
              tableCount + route.length - 1 > MAX_QUERY_TABLES
                ? `Queries support up to ${MAX_QUERY_TABLES} tables`
                : undefined
            }
            type="button"
            variant="ghost"
            className="h-auto w-full justify-start whitespace-normal break-all px-2 py-1.5 text-left text-xs"
            onClick={() => onSelect(route.map((hop) => hop.step))}
          >
            {route
              .slice(0, -1)
              .map((hop) => hop.step.tableRef)
              .join(" → ")}
          </Button>
        ))}
        {!routes.length && (
          <p className="text-muted-foreground text-xs">
            No alternate path connects these tables.
          </p>
        )}
      </section>
    </div>
  );
}
