import {
  getTableRelationships,
  splitTableRef,
  type DatabaseSchema,
  type RelationshipConstraint,
  type ViaTableStep,
} from "@quory/core";

type Connection = { relationship: RelationshipConstraint; forward: boolean };
export type JoinHop = Connection & { step: ViaTableStep };

function selectableConnections(
  tableRef: string,
  connections: Connection[],
): JoinHop[] {
  return connections.flatMap((connection): JoinHop[] => {
    const { relationship, forward } = connection;
    if (
      connections.filter(
        (item) => item.relationship.constraintId === relationship.constraintId,
      ).length === 1
    ) {
      return [
        {
          ...connection,
          step: { tableRef, usingConstraintId: relationship.constraintId },
        },
      ];
    }

    // Constraint IDs can repeat on opposite sides of the join. In that case
    // the query planner needs a column pair unique in the traversal direction.
    for (const { localColumn, foreignColumn } of relationship.columnPairs) {
      const fromColumnName = forward ? localColumn : foreignColumn;
      const toColumnName = forward ? foreignColumn : localColumn;
      const ambiguous = connections.some(
        (other) =>
          other !== connection &&
          other.relationship.columnPairs.some(
            (pair) =>
              (other.forward ? pair.localColumn : pair.foreignColumn) ===
                fromColumnName &&
              (other.forward ? pair.foreignColumn : pair.localColumn) ===
                toColumnName,
          ),
      );
      if (!ambiguous)
        return [
          { ...connection, step: { tableRef, fromColumnName, toColumnName } },
        ];
    }
    return [];
  });
}

export type JoinGraph = Map<string, Map<string, JoinHop[]>>;

export function buildJoinGraph(schemas: DatabaseSchema[]): JoinGraph {
  const graph = new Map<string, Map<string, Connection[]>>();
  function connect(from: string, to: string, connection: Connection) {
    const neighbors = graph.get(from) ?? new Map<string, Connection[]>();
    graph.set(from, neighbors);
    const connections = neighbors.get(to) ?? [];
    connections.push(connection);
    neighbors.set(to, connections);
  }
  const available = new Set(
    schemas.flatMap((schema) =>
      schema.tables.map((table) => `${schema.name}.${table.name}`),
    ),
  );
  for (const schema of schemas) {
    for (const table of schema.tables) {
      const from = `${schema.name}.${table.name}`;
      for (const relationship of getTableRelationships(table, schema.name)) {
        const to = `${relationship.foreignSchema}.${relationship.foreignTable}`;
        if (from === to || !available.has(to)) continue;
        connect(from, to, { relationship, forward: true });
        connect(to, from, { relationship, forward: false });
      }
    }
  }

  const selectable: JoinGraph = new Map();
  for (const [from, neighbors] of graph) {
    const selectableNeighbors = new Map<string, JoinHop[]>();
    for (const [to, connections] of neighbors) {
      const choices = selectableConnections(to, connections);
      if (choices.length) selectableNeighbors.set(to, choices);
    }
    selectable.set(from, selectableNeighbors);
  }
  return selectable;
}

/** Index shortest paths once per source. Materialize only the destination being previewed. */
export function suggestedJoinPaths(graph: JoinGraph, source: string) {
  const incoming = new Map<
    string,
    { from: string; hop: JoinHop; distance: number }
  >();
  const queue = [source];
  for (let i = 0; i < queue.length; i++) {
    const from = queue[i]!;
    const distance = (incoming.get(from)?.distance ?? 0) + 1;
    for (const [to, choices] of graph.get(from) ?? []) {
      if (to === source || incoming.has(to)) continue;
      incoming.set(to, { from, hop: choices[0]!, distance });
      queue.push(to);
    }
  }
  function pathTo(target: string) {
    const reversed: JoinHop[] = [];
    for (
      let edge = incoming.get(target);
      edge;
      edge = incoming.get(edge.from)
    ) {
      reversed.push(edge.hop);
    }
    return reversed.reverse();
  }
  return { incoming, pathTo };
}

/** Shortest continuation for each first hop, excluding tables already in the path. */
export function routesToTarget(
  graph: JoinGraph,
  source: string,
  target: string,
  visited: string[] = [],
) {
  const neighbors = graph.get(source);
  const direct = neighbors?.get(target) ?? [];
  const blocked = new Set([source, ...visited]);
  const queue = [target];
  const next = new Map<string, JoinHop>();
  for (let index = 0; index < queue.length; index++) {
    const to = queue[index]!;
    for (const from of graph.get(to)?.keys() ?? []) {
      if (blocked.has(from) || from === target || next.has(from)) continue;
      const hop = graph.get(from)?.get(to)?.[0];
      if (!hop) continue;
      next.set(from, hop);
      queue.push(from);
    }
  }

  const routes: JoinHop[][] = [];
  for (const [via, connections] of neighbors ?? []) {
    if (!next.has(via)) continue;
    const continuation: JoinHop[] = [];
    let ref = via;
    while (ref !== target) {
      const hop = next.get(ref)!;
      continuation.push(hop);
      ref = hop.step.tableRef;
    }
    for (const first of connections) routes.push([first, ...continuation]);
  }
  routes.sort(
    (a, b) =>
      a.length - b.length ||
      a[0]!.step.tableRef.localeCompare(b[0]!.step.tableRef),
  );
  return { direct, routes };
}

/** Include schema names only when table names are ambiguous. */
export function createJoinTableLabel(schemas: DatabaseSchema[]) {
  const counts = new Map<string, number>();
  for (const schema of schemas) {
    for (const { name } of schema.tables)
      counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return (ref: string) => {
    const [, name] = splitTableRef(ref);
    return counts.get(name) === 1 ? name : ref;
  };
}
