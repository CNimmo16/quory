const STORAGE_PREFIX = "quory:recent-manual-tables:";
export const MAX_RECENT_MANUAL_TABLES = 5;

function storageKey(projectId: string, connectionId: string) {
  return `${STORAGE_PREFIX}${projectId}:${connectionId}`;
}

export function readRecentManualTables(
  projectId: string,
  connectionId: string,
): string[] {
  try {
    const raw = window.localStorage.getItem(
      storageKey(projectId, connectionId),
    );
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    const tables: string[] = [];
    for (const entry of parsed) {
      if (typeof entry !== "string" || !entry || seen.has(entry)) continue;
      seen.add(entry);
      tables.push(entry);
      if (tables.length === MAX_RECENT_MANUAL_TABLES) break;
    }
    return tables;
  } catch {
    return [];
  }
}

export function recordRecentManualTable(
  projectId: string,
  connectionId: string,
  tableRef: string,
): string[] {
  const next = [
    tableRef,
    ...readRecentManualTables(projectId, connectionId).filter(
      (entry) => entry !== tableRef,
    ),
  ].slice(0, MAX_RECENT_MANUAL_TABLES);
  try {
    window.localStorage.setItem(
      storageKey(projectId, connectionId),
      JSON.stringify(next),
    );
  } catch {
    // Ignore storage write errors (e.g. quota or unavailable storage).
  }
  return next;
}
