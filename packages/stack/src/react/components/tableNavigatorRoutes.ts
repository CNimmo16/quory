import type { DiagramPoint, layoutTableDiagram } from "./tableNavigatorLayout";

type Layout = ReturnType<typeof layoutTableDiagram>;

function trimStart(points: DiagramPoint[], distance: number): DiagramPoint[] {
  const result = points.map((point) => ({ ...point }));
  while (result.length > 1) {
    const [first, next] = result as [DiagramPoint, DiagramPoint];
    const length = Math.hypot(next.x - first.x, next.y - first.y);
    if (length <= distance) {
      distance -= length;
      result.shift();
    } else {
      first.x += ((next.x - first.x) * distance) / length;
      first.y += ((next.y - first.y) * distance) / length;
      break;
    }
  }
  return result;
}

/** One editable route per full destination card, across any implicit bridges. */
export function tableNavigatorRoutes(layout: Layout) {
  const nodes = new Map(
    layout.nodes.map((node) => [node.join.joinAlias, node]),
  );
  const incoming = new Map(layout.edges.map((edge) => [edge.target, edge]));
  return layout.nodes
    .filter((node) => !node.compact && node.parent)
    .map((target) => {
      const intermediate: Layout["nodes"] = [];
      const edges = [incoming.get(target.join.joinAlias)!];
      let source = nodes.get(target.parent!.joinAlias)!;
      while (source.compact) {
        intermediate.unshift(source);
        edges.unshift(incoming.get(source.join.joinAlias)!);
        source = nodes.get(source.parent!.joinAlias)!;
      }
      const points: DiagramPoint[] = [];
      for (const [index, edge] of edges.entries()) {
        if (index > 0) {
          const bridge = intermediate[index - 1]!;
          points.push({
            x: bridge.x + bridge.width / 2,
            y: bridge.y + bridge.height / 2,
          });
        }
        points.push(...edge.points);
      }
      const distinct = points.filter(
        (point, index) =>
          !index ||
          point.x !== points[index - 1]!.x ||
          point.y !== points[index - 1]!.y,
      );
      const length = distinct
        .slice(1)
        .reduce(
          (sum, point, index) =>
            sum +
            Math.hypot(
              point.x - distinct[index]!.x,
              point.y - distinct[index]!.y,
            ),
          0,
        );
      // 36px rounded ends plus 16px of clear space beside the full cards.
      const inset = Math.min(52, Math.max(0, (length - 1) / 2));
      const bubble = trimStart(
        trimStart(distinct, inset).reverse(),
        inset,
      ).reverse();
      const end = bubble[bubble.length - 1]!;
      const previous = bubble[bubble.length - 2] ?? end;
      const button =
        intermediate.length === 0
          ? trimStart(distinct, length / 2)[0]!
          : end.x === previous.x
            ? { x: end.x + 18, y: end.y }
            : { x: end.x, y: end.y - 18 };
      return { source, target, intermediate, edges, bubble, button };
    });
}
