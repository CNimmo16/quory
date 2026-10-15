type TableRef = readonly [schemaName: string, tableName: string];

/** Rank one relationship group; callers keep adjacent and indirect groups separate. */
export function filterRelatedTables(
  tables: TableRef[],
  search: string
): TableRef[] {
  const term = search.trim().toLowerCase();
  if (!term) return tables;
  return tables
    .flatMap((table) => {
      const [schema, name] = table.map((part) => part.toLowerCase());
      const qualified = `${schema}.${name}`;
      if (!qualified.includes(term)) return [];
      const target = term.includes(".") ? qualified : name!;
      const index = target.indexOf(term);
      const rank =
        target === term
          ? 0
          : target.startsWith(term)
          ? 1
          : index > 0 && /[_\s-]/.test(target[index - 1]!)
          ? 2
          : index >= 0
          ? 3
          : 4;
      return [{ table, rank, index, length: target.length }];
    })
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        a.index - b.index ||
        a.length - b.length ||
        a.table[1].localeCompare(b.table[1]) ||
        a.table[0].localeCompare(b.table[0])
    )
    .map(({ table }) => table);
}
