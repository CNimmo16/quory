import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from "react";
import { ArrowLeft, ArrowRight, Check, Table2, Undo2 } from "lucide-react";
import { Button } from "./ui/button";
import {
  routesToTarget,
  type JoinGraph,
  type JoinHop,
} from "./joinRouteOptions";

export function TableBranches({ children }: { children: ReactNode }) {
  return <ul className="ml-3">{children}</ul>;
}

export function TableBranch({ children }: { children: ReactNode }) {
  return (
    <li className="relative pt-2 pl-4 before:absolute before:inset-y-0 before:left-0 before:border-l before:border-border last:before:bottom-auto last:before:h-6 after:absolute after:top-6 after:left-0 after:w-4 after:border-t after:border-border">
      {children}
    </li>
  );
}

function TableNode({ name }: { name: string }) {
  return (
    <span className="border-border bg-card inline-flex min-h-8 max-w-full items-center gap-2 rounded-md border px-2 text-xs font-semibold">
      <Table2
        aria-hidden="true"
        className="text-primary-emphasis size-3.5 shrink-0"
      />
      <span className="break-all">{name}</span>
    </span>
  );
}

function HopCard({ hop, name }: { hop: JoinHop; name: string }) {
  return (
    <>
      <span className="flex items-center gap-2 font-semibold">
        <Table2
          aria-hidden="true"
          className="size-3.5 shrink-0 text-primary-emphasis"
        />
        {name}
      </span>
      <span className="text-muted-foreground text-[11px] font-normal">
        {hop.relationship.constraintId}
      </span>
      {hop.relationship.columnPairs.map(({ localColumn, foreignColumn }) => {
        const [from, to] = hop.forward
          ? [localColumn, foreignColumn]
          : [foreignColumn, localColumn];
        return (
          <span
            key={JSON.stringify([from, to])}
            className="text-muted-foreground flex items-center gap-1.5 font-mono text-[11px] font-normal"
          >
            <span>{from}</span>
            <ArrowRight aria-label="joins to" className="size-3 shrink-0" />
            <span>{to}</span>
          </span>
        );
      })}
    </>
  );
}

export function JoinPath({
  source,
  path,
  tableLabel,
  choices = [],
  onChoose,
  nextChoice,
}: {
  source: string;
  path: JoinHop[];
  tableLabel: (ref: string) => string;
  choices?: JoinHop[];
  onChoose?: (hop: JoinHop) => void;
  nextChoice?: Ref<HTMLButtonElement>;
}) {
  const nodeStyle =
    "inline-flex w-fit max-w-full flex-col items-start gap-1 rounded-md border px-2.5 py-1.5 text-left text-xs break-all";
  let branches: ReactNode = choices.length > 0 && (
    <TableBranches>
      {choices.map((hop, index) => (
        <TableBranch key={JSON.stringify(hop.step)}>
          <button
            type="button"
            ref={index === 0 ? nextChoice : undefined}
            className={
              nodeStyle +
              " bg-card border-dashed border-muted-foreground/50 hover:border-primary hover:bg-primary-subtle focus-visible:outline-primary"
            }
            onClick={() => onChoose?.(hop)}
          >
            <HopCard hop={hop} name={tableLabel(hop.step.tableRef)} />
          </button>
        </TableBranch>
      ))}
    </TableBranches>
  );
  for (const hop of [...path].reverse()) {
    branches = (
      <TableBranches>
        <TableBranch>
          <div className={nodeStyle + " bg-primary-subtle border-primary/30"}>
            <HopCard hop={hop} name={tableLabel(hop.step.tableRef)} />
          </div>
          {branches}
        </TableBranch>
      </TableBranches>
    );
  }
  return (
    <div className="w-max min-w-fit">
      <TableNode name={tableLabel(source)} />
      {branches}
    </div>
  );
}

export function CustomJoinPath({
  source,
  target,
  tableLabel,
  graph,
  maxHops,
  onCancel,
  onJoin,
  backLabel = "Back to tables",
}: {
  source: string;
  target: string;
  tableLabel: (ref: string) => string;
  graph: JoinGraph;
  maxHops: number;
  onCancel: () => void;
  onJoin: (path: JoinHop[]) => void;
  backLabel?: string;
}) {
  const [path, setPath] = useState<JoinHop[]>([]);
  const nextChoice = useRef<HTMLButtonElement>(null);
  const submit = useRef<HTMLButtonElement>(null);
  const from = path[path.length - 1]?.step.tableRef ?? source;
  const complete = from === target;
  useEffect(() => {
    (complete ? submit : nextChoice).current?.focus();
  }, [complete, path]);
  const choices = useMemo(() => {
    if (complete) return [];
    const visited = [source, ...path.map((hop) => hop.step.tableRef)];
    const { direct, routes } = routesToTarget(graph, from, target, visited);
    return [...direct.map((hop) => [hop]), ...routes]
      .filter((route) => path.length + route.length <= maxHops)
      .map((route) => route[0]!);
  }, [complete, graph, source, path, from, target, maxHops]);

  return (
    <>
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label={backLabel}
          onClick={onCancel}
        >
          <ArrowLeft />
        </Button>
        <h3 className="break-all text-sm font-semibold">
          Custom path to {tableLabel(target)}
        </h3>
      </div>
      <div className="bg-muted/20 min-h-0 overflow-auto p-4">
        <JoinPath
          source={source}
          path={path}
          tableLabel={tableLabel}
          choices={choices}
          onChoose={(hop) => setPath([...path, hop])}
          nextChoice={nextChoice}
        />
      </div>
      <div className="flex items-center justify-between border-t px-3 py-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={!path.length}
          onClick={() => setPath(path.slice(0, -1))}
        >
          <Undo2 />
          Undo step
        </Button>
        <Button
          type="button"
          size="sm"
          ref={submit}
          disabled={!complete}
          onClick={() => onJoin(path)}
        >
          <Check />
          Join table
        </Button>
      </div>
    </>
  );
}
