import { useMemo, useState } from "react";
import { Pencil } from "lucide-react";
import type { DatabaseSchema, ViaTableStep } from "@quory/core";
import { MAX_QUERY_TABLES } from "@quory/core";
import { Button } from "./ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { buildJoinGraph, createJoinTableLabel } from "./joinRouteOptions";
import { SuggestedJoinPaths } from "./SuggestedJoinPaths";
import { Hint } from "./Hint";
import type { DiagramPoint } from "./tableNavigatorLayout";

type Props = {
  schemas: DatabaseSchema[];
  source: string;
  target: string;
  joinedTables: string[];
  replacedIntermediates: number;
  onSelect: (steps: ViaTableStep[]) => void;
};

export function JoinEdgeEditor({
  position,
  active,
  onOpenChange,
  ...props
}: Props & {
  position: DiagramPoint;
  active: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const changeOpen = (value: boolean) => {
    setOpen(value);
    onOpenChange(value);
  };
  const label = `Edit join from ${props.source} to ${props.target}`;
  const tableLabel = useMemo(
    () => createJoinTableLabel(props.schemas),
    [props.schemas],
  );
  return (
    <foreignObject
      x={position.x - 12}
      y={position.y - 12}
      width={24}
      height={24}
      className="pointer-events-none overflow-visible"
    >
      <Popover open={open} onOpenChange={changeOpen}>
        <Hint
          content={`Edit path: ${tableLabel(props.source)} to ${tableLabel(props.target)}`}
        >
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label={label}
              className={`bg-card text-primary-emphasis size-6 rounded-md transition-opacity focus:pointer-events-auto focus:opacity-100 motion-reduce:transition-none [&_svg]:size-3.5 ${active || open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"}`}
            >
              <Pencil aria-hidden="true" />
            </Button>
          </PopoverTrigger>
        </Hint>
        <PopoverContent
          aria-label={label}
          className="border-border bg-card flex max-h-[min(480px,var(--radix-popover-content-available-height))] w-[28rem] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-lg p-0 shadow-none"
        >
          <EdgePaths
            {...props}
            onClose={() => changeOpen(false)}
            onSelect={(steps) => {
              props.onSelect(steps);
              changeOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>
    </foreignObject>
  );
}

function EdgePaths({
  schemas,
  source,
  target,
  joinedTables,
  replacedIntermediates,
  onSelect,
  onClose,
}: Props & { onClose: () => void }) {
  const graph = useMemo(() => buildJoinGraph(schemas), [schemas]);
  const tableLabel = useMemo(() => createJoinTableLabel(schemas), [schemas]);
  return (
    <SuggestedJoinPaths
      source={source}
      target={target}
      graph={graph}
      tableLabel={tableLabel}
      joinedTables={joinedTables}
      maxHops={
        MAX_QUERY_TABLES - joinedTables.length + replacedIntermediates + 1
      }
      onJoin={(path) => onSelect(path.map((hop) => hop.step))}
      onCancel={onClose}
      backLabel="Close path options"
    />
  );
}
