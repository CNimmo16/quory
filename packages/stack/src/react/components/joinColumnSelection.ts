import type { DatabaseTableInfo, PreparedJoinDef } from "@quory/core";
import type { JoinRanker, JoinRankingRequest } from "../JoinRankingContext";

export function selectedColumnContext(
  join: PreparedJoinDef,
): { tableRef: string; columns: string[] }[] {
  return [
    { tableRef: join.tableRef, columns: join.select.slice(0, 32) },
    ...join.joins.flatMap(selectedColumnContext),
  ].slice(0, 32);
}

/** Bound the decision input, favoring useful fields over payloads and internal IDs. */
export function shortlistJoinColumns(
  table: DatabaseTableInfo,
  selectedNames: string[],
) {
  const selected = new Set(selectedNames);
  const scored = table.columns
    .map((column, index) => {
      const name = column.name
        .replace(/([a-z])([A-Z])/g, "$1_$2")
        .toLowerCase();
      let score = column.includedInPrimaryKey ? 8 : 0;
      if (
        /(^|_)(name|title|label|email|number|code|status|amount|total|price|date)($|_)/.test(
          name,
        )
      )
        score += 6;
      if (selected.has(column.name)) score += 2;
      if (column.foreignKeys.length) score -= 3;
      if (
        column.genericDataType === "binary" ||
        column.genericDataType === "hierarchical"
      )
        score -= 8;
      if (
        /(^|_)(password|secret|token|hash|payload|metadata|deleted|updated|created)($|_)/.test(
          name,
        )
      )
        score -= 10;
      return { column, index, score };
    })
    .sort((a, b) => b.score - a.score || a.index - b.index);
  const shortlist = scored.slice(0, 32);
  const fallbackIds = new Set(
    shortlist
      .filter(({ score }) => score >= 0)
      .slice(0, 6)
      .map(({ column }) => column.name),
  );
  if (!fallbackIds.size && shortlist[0])
    fallbackIds.add(shortlist[0].column.name);
  return {
    candidates: shortlist.map(({ column }) => ({
      id: column.name,
      description: JSON.stringify({
        column: column.name,
        type: column.dataType,
        primaryKey: column.includedInPrimaryKey,
        foreignKeys: column.foreignKeys.map(
          (key) =>
            `${key.foreignSchemaName}.${key.foreignTableName}.${key.foreignColumnName}`,
        ),
      }).slice(0, 12000),
    })),
    fallback: table.columns
      .filter(({ name }) => fallbackIds.has(name))
      .map(({ name }) => name),
  };
}

/** Resolve once; canceled or late model responses can never change a joined table. */
export async function selectJoinColumns(
  ranker: JoinRanker,
  request: JoinRankingRequest,
  fallback: string[],
  schemaOrder: string[],
  signal: AbortSignal,
  timeoutMs = 3000,
): Promise<string[]> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cancel: (() => void) | undefined;
  const timeout = new Promise<string[]>((resolve) => {
    cancel = () => {
      controller.abort();
      resolve(fallback);
    };
    timer = setTimeout(cancel, timeoutMs);
    signal.addEventListener("abort", cancel, { once: true });
    if (signal.aborted) cancel();
  });
  try {
    const attempt = Promise.resolve()
      .then(async () => {
        if (controller.signal.aborted) return fallback;
        const result = await ranker(request, controller.signal);
        const ids = result.selectedIds;
        const allowed = new Set(request.candidates.map(({ id }) => id));
        if (
          !result.ranked ||
          !ids?.length ||
          ids.length > 8 ||
          new Set(ids).size !== ids.length ||
          ids.some((id) => !allowed.has(id))
        )
          return fallback;
        return schemaOrder.filter((name) => ids.includes(name));
      })
      .catch(() => fallback);
    return await Promise.race([attempt, timeout]);
  } finally {
    clearTimeout(timer);
    if (cancel) signal.removeEventListener("abort", cancel);
    controller.abort();
  }
}
