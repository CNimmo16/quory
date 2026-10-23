import { useMemo } from "react";
import CodeMirror, { EditorView } from "@uiw/react-codemirror";
import { sql } from "@codemirror/lang-sql";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import { autocompletion } from "@codemirror/autocomplete";
import { createSqlCompletion, sqlDialect } from "./sqlCompletion";
import { format } from "sql-formatter";
import type { DatabaseSchema, SqlDialect } from "@quory/core";

export function formatSql(value: string, dialect: SqlDialect = "postgres") {
  try {
    return format(value, {
      language: dialect === "postgres" ? "postgresql" : dialect,
      keywordCase: "upper",
    });
  } catch {
    return value;
  }
}
const EMPTY_SCHEMAS: DatabaseSchema[] = [];
export function SqlEditor({
  value,
  onChange,
  readOnly = false,
  dialect = "postgres",
  height = "280px",
  label = "SQL query",
  onRequestEdit,
  autoFocus = false,
  schemas = EMPTY_SCHEMAS,
}: {
  value: string;
  onChange?: ((value: string) => void) | undefined;
  readOnly?: boolean;
  dialect?: SqlDialect;
  height?: string;
  label?: string;
  onRequestEdit?: (() => void) | undefined;
  autoFocus?: boolean;
  schemas?: DatabaseSchema[] | undefined;
}) {
  const extensions = useMemo(
    () => [
      sql({ dialect: sqlDialect(dialect) }),
      autocompletion({
        override: readOnly ? [] : [createSqlCompletion(schemas, dialect)],
      }),
      EditorView.contentAttributes.of({
        "aria-label": label,
        spellcheck: "false",
        autocorrect: "off",
        autocapitalize: "off",
      }),
      syntaxHighlighting(
        HighlightStyle.define([
          { tag: tags.keyword, color: "rgb(var(--primary-emphasis))" },
          {
            tag: [tags.string, tags.number, tags.bool],
            color: "rgb(var(--secondary-emphasis))",
          },
          { tag: tags.comment, color: "rgb(var(--muted-foreground))" },
          {
            tag: [tags.operator, tags.punctuation],
            color: "rgb(var(--foreground))",
          },
        ]),
      ),
      EditorView.theme({
        "&": {
          fontSize: "var(--editor-font-size, 13px)",
          color: "rgb(var(--foreground))",
          backgroundColor: "rgb(var(--card))",
        },
        ".cm-gutters": {
          backgroundColor: "rgb(var(--muted))",
          color: "rgb(var(--muted-foreground))",
          borderColor: "rgb(var(--border))",
        },
        ".cm-activeLine, .cm-activeLineGutter": {
          backgroundColor: "rgb(var(--primary) / 0.08)",
        },
        ".cm-cursor": { borderLeftColor: "rgb(var(--foreground))" },
        "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection":
          { backgroundColor: "rgb(var(--secondary) / 0.25)" },
        ".cm-tooltip": {
          backgroundColor: "rgb(var(--popover))",
          color: "rgb(var(--popover-foreground))",
          borderColor: "rgb(var(--border))",
        },
        ".cm-tooltip-autocomplete ul li[aria-selected]": {
          backgroundColor: "rgb(var(--accent))",
          color: "rgb(var(--accent-foreground))",
        },
        ".cm-scroller": {
          fontFamily: "var(--font-mono)",
        },
        ".cm-focused": { outline: "none" },
      }),
    ],
    [dialect, label, schemas, readOnly],
  );
  return (
    <div
      className="overflow-hidden rounded-md border border-border bg-card"
      {...(onRequestEdit
        ? {
            role: "button",
            tabIndex: 0,
            "aria-label": "Edit SQL query",
            onClick: onRequestEdit,
            onKeyDown: (event: React.KeyboardEvent) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onRequestEdit();
              }
            },
          }
        : {})}
    >
      <CodeMirror
        value={value}
        {...(onChange ? { onChange } : {})}
        height={height}
        readOnly={readOnly}
        editable={!readOnly}
        autoFocus={autoFocus}
        extensions={extensions}
        placeholder="SELECT * FROM your_table LIMIT 100;"
        basicSetup={{ foldGutter: false, highlightActiveLine: !readOnly }}
      />
    </div>
  );
}
