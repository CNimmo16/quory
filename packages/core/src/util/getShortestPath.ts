import { Graph, shortestPath } from "graph-data-structure";

export default function getShortestPath(
  graph: Graph,
  sourceRef: string,
  targetRef: string,
  via: string[]
) {
  if (new Set(via).size !== via.length) {
    throw new Error(`Duplicate table refs in "via" path: ${via.join(", ")}`);
  }
  if (via.includes(sourceRef)) {
    throw new Error(`Via path includes source table ref: ${sourceRef}`);
  }
  if (via[via.length - 1] === targetRef) {
    throw new Error(`Via path ends with target table ref: ${targetRef}`);
  }

  const desiredRoute = [sourceRef, ...via, targetRef];
  try {
    return [
      sourceRef,
      ...desiredRoute.flatMap((thisTable, i, arr) => {
        const nextTable = arr[i + 1];
        if (!nextTable) {
          return [];
        }
        const { nodes } = shortestPath(graph, thisTable, nextTable);
        return nodes.slice(1);
      }),
    ];
  } catch {
    throw new Error(`Couldn't find a path from ${sourceRef} to ${targetRef}`);
  }
}
