import { splitTableRef, type PreparedJoinDef } from "@quory/core";

export const TABLE_NODE_WIDTH = 208;
export const TABLE_NODE_HEIGHT = 80;
const COLUMN_GAP = 112;
const ROW_GAP = 80;
const ADD_NODE_GAP = 16;
const ADD_NODE_HEIGHT = 32;
const GUTTER = 16;

export type DiagramPoint = { x: number; y: number };
export type TableDiagramNode = DiagramPoint & {
  join: PreparedJoinDef;
  parent: PreparedJoinDef | null;
  width: number;
  height: number;
  row: number;
  column: number;
  compact: boolean;
};

/** Pack the tree into available columns, folding deeper joins onto lower rows.
 * Connector channels live between rows/columns, never through a table card.
 */
export function layoutTableDiagram(
  base: PreparedJoinDef,
  availableWidth: number,
) {
  const width = Math.max(1, availableWidth);
  const gutter = Math.min(GUTTER, width / 10);
  const nodeWidth = Math.min(TABLE_NODE_WIDTH, width - gutter * 2);
  type Dimensions = {
    depth: number;
    width: number;
    height: number;
    compact: boolean;
    parent: PreparedJoinDef | null;
  };
  const dimensions = new Map<string, Dimensions>();
  function measure(
    join: PreparedJoinDef,
    parent: PreparedJoinDef | null,
    depth: number,
  ) {
    const compact = Boolean(
      parent &&
      !join.select.length &&
      !join.where &&
      !join.orderBy?.length &&
      join.joins.length,
    );
    const label = splitTableRef(join.tableRef)[1];
    dimensions.set(join.joinAlias, {
      depth,
      parent,
      compact,
      width: compact
        ? Math.min(nodeWidth, Math.max(80, label.length * 8 + 40))
        : nodeWidth,
      height: compact ? 32 : TABLE_NODE_HEIGHT,
    });
    join.joins.forEach((child) => measure(child, join, depth + 1));
  }
  measure(base, null, 0);
  // Use the widest actual node in each column so branches remain aligned and
  // their connector lanes stay clear. A chain of labels needs no card-sized slots.
  let columns =
    Math.max(...Array.from(dimensions.values(), (node) => node.depth)) + 1;
  let columnWidths: number[] = [];
  let gaps: number[] = [];
  let usedWidth = 0;
  for (; columns >= 1; columns--) {
    columnWidths = Array<number>(columns).fill(0);
    gaps = Array<number>(columns - 1).fill(0);
    for (const node of dimensions.values()) {
      const column = node.depth % columns;
      columnWidths[column] = Math.max(columnWidths[column]!, node.width);
      if (column && node.parent) {
        const parent = dimensions.get(node.parent.joinAlias)!;
        // Halve the former visible gap, including the empty space left when
        // both labels were centered inside full card-width slots.
        const gap =
          node.compact && parent.compact
            ? (COLUMN_GAP + nodeWidth - (parent.width + node.width) / 2) / 2
            : COLUMN_GAP;
        gaps[column - 1] = Math.max(gaps[column - 1]!, gap);
      }
    }
    usedWidth =
      columnWidths.reduce((sum, value) => sum + value, 0) +
      gaps.reduce((sum, value) => sum + value, 0);
    if (usedWidth <= width - gutter * 2) break;
  }
  const left = (width - usedWidth) / 2;
  const columnX = columnWidths.map(
    (_, column) =>
      left +
      columnWidths
        .slice(0, column)
        .reduce((sum, value, index) => sum + value + gaps[index]!, 0),
  );
  const nextRow = Array<number>(columns).fill(0);
  const nodes: TableDiagramNode[] = [];
  const edges: { source: string; target: string; points: DiagramPoint[] }[] =
    [];

  function place(join: PreparedJoinDef, parent: TableDiagramNode | null) {
    const column = parent ? (parent.column + 1) % columns : 0;
    const wrapped = parent !== null && column === 0;
    const row = Math.max(
      nextRow[column]!,
      parent ? parent.row + Number(wrapped) : 0,
    );
    nextRow[column] = row + 1;
    const size = dimensions.get(join.joinAlias)!;
    const node: TableDiagramNode = {
      join,
      parent: parent?.join ?? null,
      x: columnX[column]! + (columnWidths[column]! - size.width) / 2,
      y:
        row * (TABLE_NODE_HEIGHT + ROW_GAP) +
        (TABLE_NODE_HEIGHT - size.height) / 2,
      width: size.width,
      height: size.height,
      row,
      column,
      compact: size.compact,
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
          { x: parent.x + parent.width / 2, y: parent.y + parent.height },
          { x: node.x + node.width / 2, y: node.y },
        ];
      } else if (wrapped) {
        const sourceX = parent.x + parent.width / 2;
        const laneY =
          parent.row * (TABLE_NODE_HEIGHT + ROW_GAP) +
          TABLE_NODE_HEIGHT +
          ROW_GAP -
          12;
        const targetY = node.y + node.height / 2;
        points = [
          { x: sourceX, y: parent.y + parent.height },
          { x: sourceX, y: laneY },
          { x: left - gutter / 2, y: laneY },
          { x: left - gutter / 2, y: targetY },
          { x: node.x, y: targetY },
        ];
      } else {
        const sourceX = parent.x + parent.width;
        const sourceY = parent.y + parent.height / 2;
        const targetY = node.y + node.height / 2;
        const channelX =
          columnX[parent.column]! +
          columnWidths[parent.column]! +
          gaps[parent.column]! / 2;
        points = [
          { x: sourceX, y: sourceY },
          { x: channelX, y: sourceY },
          { x: channelX, y: targetY },
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
      existing.end = Math.max(existing.end, target.y + target.height / 2);
    else
      group.push({
        source: edge.source,
        start: source.y + source.height / 2,
        end: target.y + target.height / 2,
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
        : columnX[source.column]! +
          columnWidths[source.column]! +
          ((lane + 1) * gaps[source.column]!) / (ends.length + 1);
      if (wrapped) edge.points[2]!.x = edge.points[3]!.x = x;
      else edge.points[1]!.x = edge.points[2]!.x = x;
    }
  }
  const placeholders = nodes
    .filter((node) => !node.compact)
    .map((node) => {
      const placeholderWidth = Math.min(100, node.width / 2);
      const x = node.x + node.width - placeholderWidth;
      const y = node.y + node.height + ADD_NODE_GAP;
      return {
        join: node.join,
        x,
        y,
        width: placeholderWidth,
        height: ADD_NODE_HEIGHT,
        points: [
          { x: x + placeholderWidth / 2, y: node.y + node.height },
          { x: x + placeholderWidth / 2, y },
        ],
      };
    });
  return {
    nodes,
    edges,
    placeholders,
    width,
    height:
      Math.max(...nextRow) * (TABLE_NODE_HEIGHT + ROW_GAP) -
      ROW_GAP +
      ADD_NODE_GAP +
      ADD_NODE_HEIGHT,
  };
}
