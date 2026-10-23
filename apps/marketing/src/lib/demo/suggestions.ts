import {
  ConditionOperator,
  type DatabaseSchema,
  type Query,
  type JoinDef,
} from "@quory/core";
import type { BrowserSqliteDriver } from "./sqlite";

export type Suggestion = {
  label: string;
  detail: string;
  query: Query;
  count: number;
};
const quote = (value: string) => `"${value.replaceAll('"', '""')}"`;
const readable = (name: string) => name.replaceAll("_", " ");
export function tableQuery(table: string): Query {
  return {
    base: { tableRef: `main.${table}`, select: "*" },
    limit: 50,
    offset: 0,
  };
}

type Candidate = Omit<Suggestion, "count"> & {
  kind: "complex" | "relationship" | "issue";
  depth: number;
};

/** Values come from SQLite; every suggested join is executed before display. */
export async function buildSuggestions(
  driver: BrowserSqliteDriver,
  schemas: DatabaseSchema[],
  count: (query: Query) => Promise<number>,
) {
  const tables = schemas.flatMap((s) => s.tables);
  type Table = (typeof tables)[number];
  type Edge = { parent: Table; child: Table; from: string; to: string };
  const candidates: Candidate[] = [];
  const displayColumns = (table: Table) =>
    table.columns
      .filter((column) =>
        /^(id|name|title|status|total|amount|email)$/.test(column.name),
      )
      .map((column) => column.name)
      .slice(0, 4);
  const relationships = (table: Table) =>
    table.columns.flatMap((column) =>
      [
        ...column.foreignKeys.map((ref) => ({
          name: ref.foreignTableName,
          from: column.name,
          to: ref.foreignColumnName,
        })),
        ...column.foreignKeyReferences.map((ref) => ({
          name: ref.localTableName,
          from: column.name,
          to: ref.localColumnName,
        })),
      ].flatMap((edge) => {
        const related = tables.find(
          (candidate) => candidate.name === edge.name,
        );
        return related && related.name !== table.name
          ? [{ related, from: edge.from, to: edge.to }]
          : [];
      }),
    );
  const relatedJoin = (
    edge: ReturnType<typeof relationships>[number],
  ): JoinDef => ({
    tableRef: `main.${edge.related.name}`,
    select: displayColumns(edge.related),
    via: [
      {
        tableRef: `main.${edge.related.name}`,
        fromColumnName: edge.from,
        toColumnName: edge.to,
      },
    ],
  });
  for (const table of tables) {
    const related = relationships(table);
    const email = table.columns.find((column) => /email/i.test(column.name));
    if (email) {
      const people = driver.rows(
        `SELECT ${quote(email.name)} AS value FROM ${quote(table.name)} WHERE ${quote(email.name)} IS NOT NULL LIMIT 3`,
      );
      const queue: { current: Table; path: Edge[] }[] = [
        { current: table, path: [] },
      ];
      while (queue.length) {
        const { current, path } = queue.shift()!;
        if (path.length >= 3) continue;
        for (const column of current.columns) {
          const steps = [
            ...column.foreignKeyReferences.map((ref) => ({
              name: ref.localTableName,
              from: ref.localColumnName,
              to: column.name,
            })),
            ...column.foreignKeys.map((ref) => ({
              name: ref.foreignTableName,
              from: ref.foreignColumnName,
              to: column.name,
            })),
          ];
          for (const step of steps) {
            const child = tables.find(
              (candidate) => candidate.name === step.name,
            );
            if (
              !child ||
              child.name === table.name ||
              path.some((edge) => edge.child.name === child.name)
            )
              continue;
            const nextPath = [
              ...path,
              { parent: current, child, from: step.from, to: step.to },
            ];
            queue.push({ current: child, path: nextPath });
            for (const person of people) {
              let base: JoinDef = {
                tableRef: `main.${table.name}`,
                select: [...new Set([email.name, ...displayColumns(table)])],
                where: {
                  column: email.name,
                  operator: ConditionOperator.EQUALS,
                  value: String(person.value),
                },
              };
              for (const edge of nextPath) {
                base = {
                  tableRef: `main.${edge.child.name}`,
                  select: displayColumns(edge.child),
                  joins: [
                    {
                      ...base,
                      via: [
                        {
                          tableRef: `main.${edge.parent.name}`,
                          fromColumnName: edge.from,
                          toColumnName: edge.to,
                        },
                      ],
                    },
                  ],
                };
              }
              base.select = "*";
              const isComplex = nextPath.length > 1;
              candidates.push({
                label: `Show ${readable(child.name)} for ${person.value}`,
                detail: isComplex
                  ? `Connect ${nextPath.length + 1} tables`
                  : "Follow the relationship",
                kind: isComplex ? "complex" : "relationship",
                depth: nextPath.length,
                query: { base, limit: 50, offset: 0 },
              });
              const visited = new Set([
                table.name,
                ...nextPath.map((edge) => edge.child.name),
              ]);
              const extra = child.columns
                .flatMap((column) =>
                  column.foreignKeys.map((fk) => ({ column, fk })),
                )
                .find(({ fk }) => !visited.has(fk.foreignTableName));
              const related =
                extra &&
                tables.find(
                  (candidate) => candidate.name === extra.fk.foreignTableName,
                );
              if (extra && related)
                candidates.push({
                  label: `Show ${readable(child.name)} with ${readable(related.name)} for ${person.value}`,
                  detail: `Connect ${nextPath.length + 2} tables`,
                  kind: "complex",
                  depth: nextPath.length + 1,
                  query: {
                    base: {
                      ...base,
                      joins: [
                        ...base.joins!,
                        {
                          tableRef: `main.${related.name}`,
                          select: displayColumns(related),
                          via: [
                            {
                              tableRef: `main.${related.name}`,
                              fromColumnName: extra.column.name,
                              toColumnName: extra.fk.foreignColumnName,
                            },
                          ],
                        },
                      ],
                    },
                    limit: 50,
                    offset: 0,
                  },
                });
            }
          }
        }
      }
    }
    const status = table.columns.find((column) =>
      /^(status|state)$/.test(column.name),
    );
    if (status) {
      const values = driver.rows(
        `SELECT DISTINCT ${quote(status.name)} AS value FROM ${quote(table.name)} WHERE ${quote(status.name)} IS NOT NULL ORDER BY ${quote(status.name)} LIMIT 6`,
      );
      const interesting =
        values.find((row) =>
          /fail|cancel|delay|overdue|pending|refund|past_due|blocked/i.test(
            String(row.value),
          ),
        ) ?? values[0];
      if (interesting)
        for (const edge of related)
          candidates.push({
            label: `Show ${readable(table.name)} with ${readable(edge.related.name)} where ${readable(status.name)} is ${interesting.value}`,
            detail: "Investigate a support issue",
            kind: "issue",
            depth: 1,
            query: {
              ...tableQuery(table.name),
              base: {
                ...tableQuery(table.name).base,
                joins: [relatedJoin(edge)],
                where: {
                  column: status.name,
                  operator: ConditionOperator.EQUALS,
                  value: String(interesting.value),
                },
              },
            },
          });
    }
    for (const edge of related)
      candidates.push({
        label: `Show ${readable(table.name)} with ${readable(edge.related.name)}`,
        detail: "Follow the relationship",
        kind: "relationship",
        depth: 1,
        query: {
          ...tableQuery(table.name),
          base: { ...tableQuery(table.name).base, joins: [relatedJoin(edge)] },
        },
      });
  }
  candidates.sort((a, b) => b.depth - a.depth);
  const suggestions: Suggestion[] = [];
  const used = new Set<string>();
  const tried = new Set<Candidate>();
  async function add(candidate: Candidate) {
    if (!candidate.query.base.joins?.length) return false;
    const key = `${candidate.query.base.tableRef}:${candidate.kind}`;
    if (used.has(key) || tried.has(candidate)) return false;
    tried.add(candidate);
    try {
      const total = await count(candidate.query);
      if (total) {
        const { kind: _kind, depth: _depth, ...suggestion } = candidate;
        suggestions.push({ ...suggestion, count: total });
        used.add(key);
        return true;
      }
    } catch {
      /* Skip ambiguous relationships. */
    }
    return false;
  }
  // Show a deep join, an approachable relationship, a support issue, then
  // another deep join. Avoid filling all four slots with the same pattern.
  for (const kind of ["complex", "relationship", "issue", "complex"] as const) {
    for (const candidate of candidates.filter(
      (candidate) => candidate.kind === kind,
    )) {
      if (await add(candidate)) break;
    }
  }
  for (const candidate of candidates) {
    if (suggestions.length >= 4) break;
    await add(candidate);
  }
  return suggestions;
}
