import {
  PostgreSQL,
  MySQL,
  SQLite,
  schemaCompletionSource,
  keywordCompletionSource,
  type SQLNamespace,
} from "@codemirror/lang-sql";
import {
  CompletionContext,
  type Completion,
  type CompletionSource,
  type CompletionResult,
} from "@codemirror/autocomplete";
import {
  ensureSyntaxTree,
  language as editorLanguage,
  syntaxTree,
} from "@codemirror/language";
import type { DatabaseSchema, SqlDialect } from "@quory/core";
import { quoteIdentifier } from "@quory/core";

export const sqlDialect = (dialect: SqlDialect) =>
  dialect === "mysql" ? MySQL : dialect === "sqlite" ? SQLite : PostgreSQL;

// CodeMirror treats dots in namespace keys as paths. Escape literal dots so
// tables such as "Order.Items" remain a single identifier.
const namespaceKey = (name: string) => name.split(".").join("\\.");
const unquote = (name: string) => {
  if (name.startsWith('"')) return name.slice(1, -1).split('""').join('"');
  if (name.startsWith("`")) return name.slice(1, -1).split("``").join("`");
  if (name.startsWith("[")) return name.slice(1, -1).split("]]").join("]");
  return name;
};

export function createSqlCompletion(
  schemas: DatabaseSchema[],
  dialect: SqlDialect,
): CompletionSource {
  const language = sqlDialect(dialect);
  const identifier = (
    label: string,
    type: string,
    detail?: string,
  ): Completion => ({
    label,
    type,
    apply: quoteIdentifier(label, dialect),
    ...(detail ? { detail } : {}),
  });
  const namespace: SQLNamespace = Object.fromEntries(
    schemas.map((schema) => [
      namespaceKey(schema.name),
      {
        self: identifier(schema.name, "namespace"),
        children: Object.fromEntries(
          schema.tables.map((table) => [
            namespaceKey(table.name),
            {
              self: identifier(table.name, "class"),
              children: table.columns.map((column) =>
                identifier(column.name, "property", column.dataType),
              ),
            },
          ]),
        ),
      },
    ]),
  );
  const preferredSchema =
    dialect === "postgres"
      ? "public"
      : dialect === "sqlite"
        ? "main"
        : undefined;
  const defaultSchema =
    schemas.find((schema) => schema.name === preferredSchema)?.name ??
    (schemas.length === 1 ? schemas[0]!.name : undefined);
  const source = schemaCompletionSource({
    dialect: language,
    schema: namespace,
    ...(defaultSchema ? { defaultSchema } : {}),
  });
  const keywords = keywordCompletionSource(language, true);
  const aliasKey = (name: string) =>
    dialect === "postgres" && name.startsWith('"')
      ? unquote(name)
      : unquote(name).toLowerCase();

  return async (context) => {
    let aborted = context.aborted;
    if (aborted || !context.state.facet(editorLanguage)) return null;
    context.addEventListener(
      "abort",
      () => {
        aborted = true;
      },
      { onDocChange: true },
    );
    // The initial/background parse may stop before FROM (especially while
    // editing SELECT in a long statement). A timed-out parse is incomplete,
    // so keep working in short slices instead of resolving aliases against it.
    let tree = ensureSyntaxTree(context.state, context.state.doc.length, 10);
    while (!tree) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      if (aborted) return null;
      tree = ensureSyntaxTree(context.state, context.state.doc.length, 10);
    }
    const completionContext =
      tree !== syntaxTree(context.state)
        ? new CompletionContext(
            context.state.update({}).state,
            context.pos,
            context.explicit,
          )
        : context;
    let position = context.pos;
    while (
      position > 0 &&
      /\s/.test(context.state.sliceDoc(position - 1, position))
    )
      position--;
    const cursor = tree.resolveInner(position, -1);
    let node = cursor;
    if (/Comment|String/.test(node.name)) return null;
    while (node.parent && node.name !== "Statement") node = node.parent;
    // Inspect the current statement's table references, rather than matching
    // text inside comments, strings, or other SQL statements.
    const referenced = new Set<DatabaseSchema["tables"][number]>();
    const aliases = new Map<string, DatabaseSchema["tables"][number]>();
    let expectsTable = false;
    let inFrom = false;
    let relationPosition = false;
    for (let child = node.firstChild; child; child = child.nextSibling) {
      const text = context.state.sliceDoc(child.from, child.to);
      if (
        child.from < context.pos &&
        child.to <= context.pos &&
        child.name === "Keyword"
      ) {
        if (/^(from|join|update|into)$/i.test(text)) relationPosition = true;
        else relationPosition = false;
      }
      if (child.name === "Keyword") {
        if (/^(from|join|update|into)$/i.test(text)) {
          expectsTable = true;
          inFrom = true;
        } else if (
          /^(where|group|having|order|limit|offset|returning|set|on|union)$/i.test(
            text,
          )
        ) {
          inFrom = false;
          expectsTable = false;
        }
      } else if (inFrom && text === ",") {
        expectsTable = true;
        if (child.to <= context.pos) relationPosition = true;
      } else if (expectsTable && /Identifier$/.test(child.name)) {
        const parts: string[] = [];
        if (child.name === "CompositeIdentifier") {
          for (let part = child.firstChild; part; part = part.nextSibling)
            if (/^(Quoted)?Identifier$/.test(part.name))
              parts.push(unquote(context.state.sliceDoc(part.from, part.to)));
        } else parts.push(unquote(text));
        const schema = parts.length > 1 ? parts[0] : defaultSchema;
        const tableName = parts[parts.length - 1];
        const table = schemas
          .find((item) => item.name === schema)
          ?.tables.find((item) => item.name === tableName);
        if (table) {
          referenced.add(table);
          let alias = child.nextSibling;
          while (alias && /Comment/.test(alias.name)) alias = alias.nextSibling;
          if (
            alias &&
            /^as$/i.test(context.state.sliceDoc(alias.from, alias.to))
          ) {
            alias = alias.nextSibling;
            while (alias && /Comment/.test(alias.name))
              alias = alias.nextSibling;
          }
          if (
            alias &&
            /^(Identifier|QuotedIdentifier|Keyword)$/.test(alias.name)
          ) {
            const name = context.state.sliceDoc(alias.from, alias.to);
            // Some valid aliases (such as "of") are tokenized as keywords.
            // Exclude clause/join boundaries rather than all keyword tokens.
            if (
              alias.name === "QuotedIdentifier" ||
              !/^(inner|outer|left|right|full|cross|natural|join|on|using|where|group|order|having|limit|offset|fetch|for|union|intersect|except|returning|set|values|as)$/i.test(
                name,
              )
            )
              aliases.set(aliasKey(name), table);
          }
        }
        expectsTable = false;
      }
    }
    // Resolve alias-qualified columns ourselves. The built-in resolver ignores
    // keyword aliases and can confuse aliases with tokens inside ON expressions.
    const composite =
      cursor.name === "CompositeIdentifier"
        ? cursor
        : cursor.parent?.name === "CompositeIdentifier"
          ? cursor.parent
          : null;
    let aliasColumns: CompletionResult | undefined;
    if (composite) {
      const parts = [];
      for (
        let part = composite.firstChild;
        part && part.from < context.pos;
        part = part.nextSibling
      )
        if (!/Comment/.test(part.name)) parts.push(part);
      if (parts.length >= 2 && parts[1]!.name === "." && parts.length <= 3) {
        const table = aliases.get(
          aliasKey(context.state.sliceDoc(parts[0]!.from, parts[0]!.to)),
        );
        if (table) {
          const columnToken = parts[2];
          const from = columnToken?.from ?? context.pos;
          const quote = context.state.sliceDoc(from, from + 1);
          aliasColumns = {
            from,
            ...(columnToken?.name === "QuotedIdentifier" &&
            context.state.sliceDoc(context.pos, context.pos + 1) === quote
              ? { to: context.pos + 1 }
              : {}),
            options: table.columns.map((column) =>
              identifier(column.name, "property", column.dataType),
            ),
          };
        }
      }
    }
    const metadata =
      aliasColumns ??
      (await source(
        relationPosition && !context.explicit
          ? new CompletionContext(completionContext.state, context.pos, true)
          : completionContext,
      ));
    const from =
      metadata?.from ?? context.matchBefore(/\w*/)?.from ?? context.pos;
    const quoted = /^["`]/.test(context.state.sliceDoc(from, from + 1));
    function finish(result: CompletionResult | null): CompletionResult | null {
      if (!result) return null;
      const prefix = context.state
        .sliceDoc(result.from, context.pos)
        .replace(/^["`]/, "")
        .toLowerCase();
      const options = result.options
        .map((option) => {
          if (!quoted) return option;
          const original =
            option.apply === undefined
              ? option.label.slice(1, -1)
              : option.label;
          const label = quoteIdentifier(original, dialect);
          return { ...option, label, apply: label };
        })
        .filter((option) =>
          option.label.replace(/^["`]/, "").toLowerCase().startsWith(prefix),
        );
      // Recompute on edits (including backspace) instead of caching a list that
      // has already been filtered for a longer prefix.
      return {
        from: result.from,
        ...(result.to !== undefined ? { to: result.to } : {}),
        options,
      };
    }
    const qualified = context.state.sliceDoc(0, from).trimEnd().endsWith(".");
    if (qualified || relationPosition) return finish(metadata);
    const options = [...(metadata?.options ?? [])];
    for (const table of referenced) {
      for (const column of table.columns) {
        if (!options.some((option) => option.label === column.name))
          options.push(
            identifier(
              column.name,
              "property",
              `${table.name} · ${column.dataType}`,
            ),
          );
      }
    }
    const prefix = context.state
      .sliceDoc(from, context.pos)
      .replace(/^["`]/, "")
      .toLowerCase();
    // Prefer real identifiers when a prefix matches metadata. SQL keywords are
    // still available when starting or extending the SQL statement itself.
    if (
      !quoted &&
      (!prefix ||
        !options.some((option) =>
          option.label.toLowerCase().startsWith(prefix),
        ))
    ) {
      const keywordResult = await keywords(context);
      options.push(...(keywordResult?.options ?? []));
    }
    if (!options.length) return null;
    return finish({
      from,
      ...(metadata?.to !== undefined ? { to: metadata.to } : {}),
      options,
    });
  };
}
