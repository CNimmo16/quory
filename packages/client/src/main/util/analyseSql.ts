/** Conservatively identify reads, including writable CTEs and executable MySQL
 * comments. Database read-only transactions provide the final enforcement; this
 * classification controls the write-confirmation UI, never replaces that guard.
 */
export function analyseSql(
  sql: string,
  dialect: "postgres" | "mysql" | "sqlite" = "postgres",
) {
  const words: string[] = [];
  let terminated = false;
  let executableComment = false;
  for (let i = 0; i < sql.length;) {
    const c = sql[i]!;
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (
      (sql.startsWith("--", i) &&
        (dialect !== "mysql" || /\s|$/.test(sql[i + 2] ?? ""))) ||
      (dialect === "mysql" && c === "#")
    ) {
      const end = sql.indexOf("\n", i);
      i = end < 0 ? sql.length : end + 1;
      continue;
    }
    if (sql.startsWith("/*", i)) {
      if (sql[i + 2] === "!" || sql[i + 2] === "+") executableComment = true;
      let depth = 1;
      i += 2;
      while (i < sql.length && depth) {
        if (sql.startsWith("/*", i)) {
          depth++;
          i += 2;
        } else if (sql.startsWith("*/", i)) {
          depth--;
          i += 2;
        } else i++;
      }
      if (depth) throw new Error("Unclosed SQL comment.");
      continue;
    }
    if (terminated) throw new Error("Run one SQL statement at a time.");
    if (c === ";") {
      terminated = true;
      i++;
      continue;
    }
    const dollar =
      c === "$"
        ? sql.slice(i).match(/^\$(?:[a-zA-Z_][a-zA-Z0-9_]*)?\$/)?.[0]
        : undefined;
    if (dollar) {
      const end = sql.indexOf(dollar, i + dollar.length);
      if (end < 0) throw new Error("Unclosed SQL string.");
      i = end + dollar.length;
      continue;
    }
    if (c === "'" || c === '"' || c === "`" || c === "[") {
      const quote = c === "[" ? "]" : c;
      i++;
      let closed = false;
      while (i < sql.length) {
        if (sql[i] === "\\") {
          i += 2;
          continue;
        }
        if (sql[i] === quote) {
          if (sql[i + 1] === quote) {
            i += 2;
            continue;
          }
          i++;
          closed = true;
          break;
        }
        i++;
      }
      if (!closed) throw new Error("Unclosed SQL string or identifier.");
      continue;
    }
    const word = sql.slice(i).match(/^[a-zA-Z_][a-zA-Z0-9_$]*/)?.[0];
    if (word) {
      words.push(word.toUpperCase());
      i += word.length;
    } else i++;
  }
  if (!words.length) throw new Error("Enter a SQL statement.");
  if (
    [
      "BEGIN",
      "START",
      "COMMIT",
      "END",
      "ROLLBACK",
      "SAVEPOINT",
      "RELEASE",
      "SET",
      "RESET",
      "USE",
      "ATTACH",
      "DETACH",
    ].includes(words[0]!)
  )
    throw new Error(
      "Transaction and session control statements are not supported. Each run uses its own transaction.",
    );
  const writes = new Set([
    "INSERT",
    "UPDATE",
    "DELETE",
    "MERGE",
    "UPSERT",
    "REPLACE",
    "CREATE",
    "ALTER",
    "DROP",
    "TRUNCATE",
    "INTO",
    "COPY",
    "CALL",
    "EXEC",
    "EXECUTE",
    "DO",
    "GRANT",
    "REVOKE",
    "VACUUM",
    "ANALYZE",
    "LOCK",
    "UNLOCK",
    "NEXTVAL",
    "SETVAL",
    "SET_CONFIG",
    "DBLINK_EXEC",
    "LO_IMPORT",
    "LO_EXPORT",
    "PG_NOTIFY",
    "SYS_EXEC",
    "SYS_EVAL",
  ]);
  const readOnly =
    !executableComment &&
    [
      "SELECT",
      "WITH",
      "VALUES",
      "SHOW",
      "DESCRIBE",
      "DESC",
      "EXPLAIN",
    ].includes(words[0]!) &&
    !words.some((word) => writes.has(word));
  return { readOnly };
}
