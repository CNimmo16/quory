import { describe, expect, it } from "vitest";
import type { PreparedJoinDef } from "@quory/core";
import {
  layoutTableDiagram,
  type TableDiagramNode,
} from "./tableNavigatorLayout";

function table(alias: string, joins: PreparedJoinDef[] = []): PreparedJoinDef {
  return {
    tableRef: `public.${alias}`,
    joinAlias: alias,
    select: ["id"],
    resultAliases: {},
    joins,
  };
}
function chain(length: number, prefix = "chain"): PreparedJoinDef {
  return table(
    `${prefix}_${length}`,
    length > 1 ? [chain(length - 1, prefix)] : [],
  );
}
const branch = table("root", [
  chain(8, "first"),
  table("second", [table("second_a"), chain(4, "second_b"), table("second_c")]),
  ...Array.from({ length: 8 }, (_, i) => table(`sibling_${i}`)),
]);
type Rectangle = Pick<TableDiagramNode, "x" | "y" | "width" | "height">;
function overlaps(a: Rectangle, b: Rectangle) {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

describe("responsive relationship layout", () => {
  it.each([200, 280, 360, 480, 720, 1000, 1600])(
    "keeps every node and connector in bounds without crossing cards at %ipx",
    (width) => {
      for (const base of [table("single"), chain(20), branch]) {
        const layout = layoutTableDiagram(base, width);
        expect(
          new Set(layout.nodes.map((node) => node.join.joinAlias)).size,
        ).toBe(layout.nodes.length);
        expect(layout.edges).toHaveLength(layout.nodes.length - 1);
        expect(layout.placeholders).toHaveLength(layout.nodes.length);
        for (const placeholder of layout.placeholders) {
          expect(placeholder.x).toBeGreaterThanOrEqual(0);
          expect(placeholder.x + placeholder.width).toBeLessThanOrEqual(width);
          expect(placeholder.y + placeholder.height).toBeLessThanOrEqual(
            layout.height,
          );
          const source = layout.nodes.find(
            (node) => node.join.joinAlias === placeholder.join.joinAlias,
          )!;
          expect(placeholder.points[0]!.y).toBe(source.y + source.height);
          expect(placeholder.points[1]!.y).toBe(placeholder.y);
          for (const node of [...layout.nodes, ...layout.placeholders]) {
            if (node !== placeholder)
              expect(overlaps(placeholder, node)).toBe(false);
          }
        }
        for (const [i, node] of layout.nodes.entries()) {
          expect(node.x).toBeGreaterThanOrEqual(0);
          expect(node.x + node.width).toBeLessThanOrEqual(width);
          expect(node.y + node.height).toBeLessThanOrEqual(layout.height);
          for (const other of layout.nodes.slice(i + 1))
            expect(overlaps(node, other)).toBe(false);
        }
        for (const edge of layout.edges) {
          const target = layout.nodes.find(
            (node) => node.join.joinAlias === edge.target,
          )!;
          expect(target.parent?.joinAlias).toBe(edge.source);
          for (const [i, point] of edge.points.entries()) {
            expect(point.x).toBeGreaterThanOrEqual(0);
            expect(point.x).toBeLessThanOrEqual(width);
            expect(point.y).toBeGreaterThanOrEqual(0);
            expect(point.y).toBeLessThanOrEqual(layout.height);
            const next = edge.points[i + 1];
            if (!next) continue;
            for (const node of [...layout.nodes, ...layout.placeholders]) {
              const crosses =
                point.x === next.x
                  ? point.x > node.x &&
                    point.x < node.x + node.width &&
                    Math.max(point.y, next.y) > node.y &&
                    Math.min(point.y, next.y) < node.y + node.height
                  : point.y > node.y &&
                    point.y < node.y + node.height &&
                    Math.max(point.x, next.x) > node.x &&
                    Math.min(point.x, next.x) < node.x + node.width;
              expect(
                crosses,
                `${edge.source} → ${edge.target} crosses ${node.join.joinAlias}`,
              ).toBe(false);
            }
          }
        }
      }
    },
  );

  it("wraps deep relationships onto lower rows as available space decreases", () => {
    const base = chain(4);
    const wide = layoutTableDiagram(base, 1100);
    const medium = layoutTableDiagram(base, 560);
    const narrow = layoutTableDiagram(base, 300);
    expect(new Set(wide.nodes.map((node) => node.row)).size).toBe(1);
    expect(new Set(medium.nodes.map((node) => node.row)).size).toBe(2);
    expect(new Set(narrow.nodes.map((node) => node.row)).size).toBe(4);
    expect(narrow.nodes.map((node) => node.join.joinAlias)).toEqual(
      wide.nodes.map((node) => node.join.joinAlias),
    );
  });
});
