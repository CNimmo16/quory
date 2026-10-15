import { useMemo } from "react";
import CodeMirror, { EditorView } from "@uiw/react-codemirror";
import { sql } from "@codemirror/lang-sql";
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
      EditorView.theme({
        "&": { fontSize: "13px" },
        ".cm-scroller": {
          fontFamily: "ui-monospace, SFMono-Regular, monospace",
        },
        ".cm-focused": { outline: "none" },
      }),
    ],
    [dialect, label, schemas, readOnly]
  );
  return (
    <div
      className="overflow-hidden rounded-md border border-slate-200 bg-white"
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
