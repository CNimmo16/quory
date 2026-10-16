export type SqlDialect = "postgres" | "mysql" | "sqlite";
export type SqlParameter = string | number;

export function quoteIdentifier(name: string, dialect: SqlDialect): string {
  const quote = dialect === "mysql" ? "`" : '"';
  return quote + name.split(quote).join(quote + quote) + quote;
}

export function parameterPlaceholder(
  index: number,
  dialect: SqlDialect,
): string {
  return dialect === "postgres" ? `$${index}` : "?";
}
