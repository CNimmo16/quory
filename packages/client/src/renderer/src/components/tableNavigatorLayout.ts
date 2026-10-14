import type { PreparedJoinDef } from "@quory/core";

export const TABLE_NODE_WIDTH = 208;
export const TABLE_NODE_HEIGHT = 80;
const COLUMN_GAP = 40;
const ROW_GAP = 40;
const GUTTER = 16;

export type DiagramPoint = { x: number; y: number };
export type TableDiagramNode = DiagramPoint & {
  join: PreparedJoinDef;
  parent: PreparedJoinDef | null;
  width: number;
  height: number;
  row: number;
  column: number;
};

/** Pack the tree into available columns, folding deeper joins onto lower rows.
 * Connector channels live between rows/columns, never through a table card.
 */
export function layoutTableDiagram(
  base: PreparedJoinDef,
  availableWidth: number
) {
  const width = Math.max(1, availableWidth);
  const gutter = Math.min(GUTTER, width / 10);
  const nodeWidth = Math.min(TABLE_NODE_WIDTH, width - gutter * 2);
  const depth = (join: PreparedJoinDef): number =>
    1 + Math.max(0, ...join.joins.map(depth));
  const columns = Math.min(
    depth(base),
    Math.max(
      1,
      Math.floor((width - gutter * 2 + COLUMN_GAP) / (nodeWidth + COLUMN_GAP))
    )
  );
  const usedWidth = columns * nodeWidth + (columns - 1) * COLUMN_GAP;
  const left = (width - usedWidth) / 2;
  const nextRow = Array<number>(columns).fill(0);
  const nodes: TableDiagramNode[] = [];
  const edges: { source: string; target: string; points: DiagramPoint[] }[] =
    [];

  function place(join: PreparedJoinDef, parent: TableDiagramNode | null) {
    const column = parent ? (parent.column + 1) % columns : 0;
    const wrapped = parent !== null && column === 0;
    const row = Math.max(
      nextRow[column]!,
      parent ? parent.row + Number(wrapped) : 0
    );
    nextRow[column] = row + 1;
    const node: TableDiagramNode = {
      join,
      parent: parent?.join ?? null,
      x: left + column * (nodeWidth + COLUMN_GAP),
      y: row * (TABLE_NODE_HEIGHT + ROW_GAP),
      width: nodeWidth,
      height: TABLE_NODE_HEIGHT,
      row,
      column,
    };
    nodes.push(node);
    if (parent) {
      let points: DiagramPoint[];
      if (
        wrapped &&
        columns === 1 &&
        parent.join.joins.length === 1 &&
        row === parent.row + 1
      ) {
        points = [
          { x: parent.x + nodeWidth / 2, y: parent.y + TABLE_NODE_HEIGHT },
          { x: node.x + nodeWidth / 2, y: node.y },
        ];
      } else if (wrapped) {
        const sourceX = parent.x + nodeWidth / 2;
        const laneY = parent.y + TABLE_NODE_HEIGHT + ROW_GAP / 2;
        const targetY = node.y + TABLE_NODE_HEIGHT / 2;
        points = [
          { x: sourceX, y: parent.y + TABLE_NODE_HEIGHT },
          { x: sourceX, y: laneY },
          { x: left - gutter / 2, y: laneY },
          { x: left - gutter / 2, y: targetY },
          { x: node.x, y: targetY },
        ];
      } else {
        const sourceX = parent.x + nodeWidth;
        const sourceY = parent.y + TABLE_NODE_HEIGHT / 2;
        const targetY = node.y + TABLE_NODE_HEIGHT / 2;
        points = [
          { x: sourceX, y: sourceY },
          { x: sourceX + COLUMN_GAP / 2, y: sourceY },
          { x: sourceX + COLUMN_GAP / 2, y: targetY },
          { x: node.x, y: targetY },
        ];
      }
      edges.push({
        source: parent.join.joinAlias,
        target: join.joinAlias,
        points,
      });
    }
    join.joins.forEach((child) => place(child, node));
  }
  place(base, null);

  // Give overlapping branches separate channels. Crossing lines are visually
  // separated by the renderer; only branches from the same parent share a rail.
  const byAlias = new Map(nodes.map((node) => [node.join.joinAlias, node]));
  const channels = new Map<
    string,
    { source: string; start: number; end: number }[]
  >();
  for (const edge of edges) {
    const source = byAlias.get(edge.source)!;
    const target = byAlias.get(edge.target)!;
    if (edge.points.length === 2 || source.row === target.row) continue;
    const key = target.column === 0 ? "wrapped" : `column-${source.column}`;
    const group = channels.get(key) ?? [];
    const existing = group.find((span) => span.source === edge.source);
    if (existing)
      existing.end = Math.max(existing.end, target.y + TABLE_NODE_HEIGHT / 2);
    else
      group.push({
        source: edge.source,
        start: source.y + TABLE_NODE_HEIGHT / 2,
        end: target.y + TABLE_NODE_HEIGHT / 2,
      });
    channels.set(key, group);
  }
  for (const [key, spans] of channels) {
    const ends: number[] = [];
    const lanes = new Map<string, number>();
    for (const span of spans.sort((a, b) => a.start - b.start)) {
      const available = ends.findIndex((end) => end < span.start);
      const lane = available < 0 ? ends.length : available;
      ends[lane] = span.end;
      lanes.set(span.source, lane);
    }
    for (const edge of edges) {
      const lane = lanes.get(edge.source);
      const source = byAlias.get(edge.source)!;
      const target = byAlias.get(edge.target)!;
      if (lane === undefined || edge.points.length === 2) continue;
      const wrapped = target.column === 0;
      if ((key === "wrapped") !== wrapped) continue;
      const x = wrapped
        ? left - gutter + ((lane + 1) * gutter) / (ends.length + 1)
        : source.x + nodeWidth + ((lane + 1) * COLUMN_GAP) / (ends.length + 1);
      if (wrapped) edge.points[2]!.x = edge.points[3]!.x = x;
      else edge.points[1]!.x = edge.points[2]!.x = x;
    }
  }
  return {
    nodes,
    edges,
    width,
    height: Math.max(...nextRow) * (TABLE_NODE_HEIGHT + ROW_GAP) - ROW_GAP,
  };
}
