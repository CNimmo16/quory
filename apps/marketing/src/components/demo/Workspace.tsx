import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  DataTable,
  TableNavigator,
  useElementSize,
  useQuery,
  useQueryCount,
} from "@quory/stack/react";
import { prepareQuery, type Query } from "@quory/core";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Code2,
  Database,
  History,
  KeyRound,
  Link2,
  LoaderCircle,
  Play,
  RotateCcw,
  Search,
  Sparkles,
  Table2,
  X,
} from "lucide-react";
import { demoRequest, type DemoDatabase } from "../../lib/demo/session";
import { tableQuery, type Suggestion } from "../../lib/demo/suggestions";

type Props = {
  database: DemoDatabase;
  description: string;
  example: boolean;
  onReset: () => void;
};
const subtleButton =
  "inline-flex items-center justify-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40";
export default function Workspace({
  database,
  description,
  example,
  onReset,
}: Props) {
  const [query, setQuery] = useState<Query | null>(null);
  const [prompt, setPrompt] = useState("");
  const [pendingSuggestion, setPendingSuggestion] = useState<Suggestion | null>(
    null,
  );
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<{ label: string; query: Query }[]>([]);
  const [showSql, setShowSql] = useState(false);
  const [sql, setSql] = useState("");
  const [parameters, setParameters] = useState("");
  const [schemaOpen, setSchemaOpen] = useState<string | null>(null);
  const [sidebar, setSidebar] = useState(false);
  const [showRestart, setShowRestart] = useState(false);
  const [copied, setCopied] = useState(false);
  const [highlightedJoinAlias, setHighlightedJoinAlias] = useState<
    string | null
  >(null);
  const navigatorSize = useElementSize();
  const restartDialog = useRef<HTMLDialogElement>(null);
  const controller = useRef<AbortController | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const result = useQuery(query, setQuery, false, { staleTime: Infinity });
  const total = useQueryCount(query);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    if (showRestart) restartDialog.current?.showModal();
  }, [showRestart]);
  useEffect(() => {
    let active = true;
    if (!query) {
      setSql("");
      return;
    }
    void prepareQuery(database.schemas, query, "sqlite")
      .then(({ sql, parameters }) => {
        if (active) {
          setSql(`${sql} LIMIT ? OFFSET ?`);
          setParameters(
            JSON.stringify([
              ...parameters,
              query.limit ?? 50,
              query.offset ?? 0,
            ]),
          );
        }
      })
      .catch(() => {
        if (active) setSql("");
      });
    return () => {
      active = false;
    };
  }, [query, database.schemas]);
  const tableCount = database.tables.length;
  const rowCount = database.tables.reduce((sum, t) => sum + t.count, 0);
  function run(next: Query, label: string) {
    controller.current?.abort();
    setAsking(false);
    setError("");
    setHighlightedJoinAlias(null);
    setQuery(next);
    setPrompt(label);
    setPendingSuggestion(null);
    setSidebar(false);
    setHistory((items) =>
      [{ label, query: next }, ...items.filter((x) => x.label !== label)].slice(
        0,
        6,
      ),
    );
  }
  async function ask(event: FormEvent) {
    event.preventDefault();
    const value = prompt.trim();
    if (!value || asking) return;
    const suggestion =
      pendingSuggestion ??
      database.suggestions.find(
        (s) => s.label.toLowerCase() === value.toLowerCase(),
      );
    if (suggestion) {
      run(suggestion.query, value);
      return;
    }
    const allTable = database.tables.find(
      (t) => `show all ${t.name.replaceAll("_", " ")}` === value.toLowerCase(),
    );
    if (allTable) {
      run(tableQuery(allTable.name), value);
      return;
    }
    controller.current?.abort();
    const next = new AbortController();
    controller.current = next;
    setAsking(true);
    setError("");
    try {
      const response = await demoRequest(
        "query",
        { prompt: value, schemas: database.schemas },
        next.signal,
      );
      if (!next.signal.aborted) run(response.query, value);
    } catch (cause) {
      if (!next.signal.aborted)
        setError(
          cause instanceof Error
            ? cause.message
            : "Couldn’t run that question. Please try again.",
        );
    } finally {
      if (!next.signal.aborted) setAsking(false);
    }
  }
  function suggest(s: Suggestion) {
    controller.current?.abort();
    setAsking(false);
    setPrompt(s.label);
    setPendingSuggestion(s);
    setError("");
    input.current?.focus();
  }
  async function copySql() {
    try {
      await navigator.clipboard.writeText(
        sql + "\n-- Parameters: " + parameters,
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Clipboard access is unavailable. Select the SQL to copy it.");
    }
  }
  return (
    <section
      className="mx-auto w-[min(1240px,calc(100%-40px))] pt-8 pb-14 sm:pt-12 sm:pb-20"
      aria-labelledby="playground-title"
    >
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-2 flex items-center gap-2 text-[10px] font-semibold tracking-[.16em] text-primary-emphasis uppercase">
            <span className="size-1.5 rounded-full bg-primary" />
            Quory Playground
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowRestart(true)}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <RotateCcw className="size-3.5" />
          Start over
        </button>
      </div>
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-muted/30 px-4 py-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary-subtle text-primary-emphasis">
              <Database className="size-4" />
            </div>
            <div className="min-w-0">
              <p
                className="max-w-100 truncate text-xs font-semibold"
                title={description}
              >
                {description}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {tableCount} tables<span className="mx-1.5">·</span>
                {rowCount} records<span className="mx-1.5">·</span>
                {example ? "Example data" : "Generated for you"}
              </p>
            </div>
          </div>
          <span className="flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary-subtle px-2.5 py-1 text-[10px] font-medium text-primary-emphasis">
            <span className="size-1.5 rounded-full bg-primary" />
            SQLite · in your browser
          </span>
        </div>
        <div className="flex min-h-140 min-w-0 flex-col md:flex-row">
          <aside
            className={`${sidebar ? "block" : "hidden"} w-full shrink-0 border-b border-border bg-muted/15 md:block md:w-52 md:border-r md:border-b-0 lg:w-60`}
            aria-label="Database explorer"
          >
            <div className="flex items-center justify-between px-4 pt-5 pb-3">
              <h2 className="text-[10px] font-semibold tracking-[.12em] text-muted-foreground uppercase">
                Your database
              </h2>
              <span className="text-[10px] text-muted-foreground">main</span>
            </div>
            <div className="space-y-1 px-2">
              {database.tables.map((table) => (
                <div key={table.name}>
                  <div
                    className={`flex items-center rounded-md ${query?.base.tableRef === `main.${table.name}` ? "bg-primary-subtle text-primary-emphasis" : "hover:bg-muted"}`}
                  >
                    <button
                      type="button"
                      onClick={() =>
                        run(
                          tableQuery(table.name),
                          `Show all ${table.name.replaceAll("_", " ")}`,
                        )
                      }
                      className="flex min-w-0 flex-1 items-center gap-2 px-2 py-2 text-left text-xs"
                    >
                      <Table2 className="size-3.5 shrink-0 text-primary-emphasis" />
                      <span className="truncate font-medium">{table.name}</span>
                      <span className="ml-auto text-[10px] text-muted-foreground">
                        {table.count}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setSchemaOpen(
                          schemaOpen === table.name ? null : table.name,
                        )
                      }
                      aria-label={`Show columns in ${table.name}`}
                      aria-expanded={schemaOpen === table.name}
                      className="p-2 text-muted-foreground"
                    >
                      <ChevronRight
                        className={`size-3 transition ${schemaOpen === table.name ? "rotate-90" : ""}`}
                      />
                    </button>
                  </div>
                  {schemaOpen === table.name && (
                    <ul className="ml-5 space-y-2 border-l border-border py-2 pr-2 pl-3 text-[10px] text-muted-foreground">
                      {table.columns.map((c) => (
                        <li
                          key={c.name}
                          className="flex items-center gap-1.5"
                          title={c.foreignKeys
                            .map(
                              (f) =>
                                `→ ${f.foreignTableName}.${f.foreignColumnName}`,
                            )
                            .join(", ")}
                        >
                          {c.includedInPrimaryKey ? (
                            <KeyRound className="size-3 text-secondary-emphasis" />
                          ) : c.foreignKeys.length ? (
                            <Link2 className="size-3 text-primary-emphasis" />
                          ) : (
                            <span className="size-3" />
                          )}
                          <span className="truncate">{c.name}</span>
                          <span className="ml-auto text-[9px] opacity-60">
                            {c.dataType.toLowerCase()}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
            {history.length > 0 && (
              <div className="mt-6 border-t border-border px-3 pt-4">
                <h2 className="mb-2 flex items-center gap-2 px-1 text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">
                  <History className="size-3" />
                  Recent questions
                </h2>
                {history.map((item, i) => (
                  <button
                    type="button"
                    key={i}
                    onClick={() => run(item.query, item.label)}
                    title={item.label}
                    className="block w-full truncate rounded-md px-2 py-2 text-left text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            )}
            <div className="mt-6 border-t border-border p-4">
              <p className="text-[10px] leading-relaxed text-muted-foreground/70">
                Fictional data. Real relationships.
                <br />
                Refresh the page for a clean slate.
              </p>
            </div>
          </aside>
          <div className="min-w-0 flex-1">
            <button
              type="button"
              onClick={() => setSidebar(!sidebar)}
              className="flex w-full items-center gap-2 border-b border-border px-4 py-2 text-xs text-muted-foreground md:hidden"
              aria-expanded={sidebar}
            >
              <Database className="size-3.5" />
              Browse {tableCount} tables
              <ChevronDown className="ml-auto size-3" />
            </button>
            <div className="p-4 sm:p-6">
              <form
                onSubmit={ask}
                className="rounded-xl border border-primary/30 bg-background p-4 transition focus-within:ring-4 focus-within:ring-primary/5"
              >
                <div className="mb-3 flex items-center justify-between">
                  <label
                    htmlFor="query-prompt"
                    className="flex items-center gap-2 text-xs font-semibold"
                  >
                    <Sparkles className="size-3.5 text-primary-emphasis" />
                    Ask your database
                  </label>
                  <span className="text-[10px] text-muted-foreground">
                    Plain English. Real queries.
                  </span>
                </div>
                <textarea
                  ref={input}
                  id="query-prompt"
                  value={prompt}
                  onChange={(e) => {
                    setPrompt(e.target.value);
                    setPendingSuggestion(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      e.currentTarget.form?.requestSubmit();
                    }
                  }}
                  rows={2}
                  maxLength={500}
                  placeholder={
                    database.suggestions[0]?.label ??
                    "What would you like to find?"
                  }
                  className="min-h-15 w-full resize-none bg-transparent text-sm leading-relaxed outline-none placeholder:text-muted-foreground/60"
                />
                <div className="mt-2 flex items-center justify-between gap-3">
                  <span className="text-[10px] text-muted-foreground">
                    {asking
                      ? "Understanding your question…"
                      : pendingSuggestion
                        ? `${pendingSuggestion.count} matching records. Ready to run.`
                        : "Try a suggestion below, or ask your own question."}
                  </span>
                  {asking ? (
                    <button
                      type="button"
                      onClick={() => {
                        controller.current?.abort();
                        setAsking(false);
                      }}
                      className={subtleButton}
                    >
                      <X className="size-3" />
                      Cancel
                    </button>
                  ) : (
                    <button
                      type="submit"
                      disabled={!prompt.trim() || result.isLoading}
                      className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-40"
                    >
                      {result.isLoading ? (
                        <LoaderCircle className="size-3.5 animate-spin" />
                      ) : (
                        <Play className="size-3 fill-current" />
                      )}
                      Run query
                    </button>
                  )}
                </div>
              </form>
              <div
                className={`mt-4 grid gap-2 ${query ? "sm:grid-cols-2" : "lg:grid-cols-2"}`}
                aria-label="Suggested questions"
              >
                {database.suggestions.map((s, i) => (
                  <button
                    type="button"
                    key={s.label}
                    onClick={() => suggest(s)}
                    onDoubleClick={() => run(s.query, s.label)}
                    className={`group flex min-w-0 items-start gap-2.5 rounded-lg border p-3 text-left transition hover:border-primary/40 hover:bg-primary-subtle ${pendingSuggestion?.label === s.label ? "border-primary/40 bg-primary-subtle" : "border-border bg-card"}`}
                  >
                    <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded bg-primary-subtle text-[9px] font-semibold text-primary-emphasis">
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[11px] leading-relaxed wrap-break-word">
                        {s.label}
                      </span>
                      {!query && (
                        <span className="mt-1 block text-[9px] text-muted-foreground">
                          {s.detail} · {s.count} matches
                        </span>
                      )}
                    </span>
                    <ArrowUpRight className="mt-0.5 size-3 shrink-0 text-muted-foreground group-hover:text-primary-emphasis" />
                  </button>
                ))}
              </div>
              {error && (
                <p
                  role="alert"
                  className="mt-4 rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-xs"
                >
                  {error}
                </p>
              )}
            </div>
            {query ? (
              <div className="border-t border-border">
                <div className="flex flex-wrap items-center justify-between gap-3 bg-muted/20 px-4 py-3 sm:px-6">
                  <div className="flex items-center gap-2">
                    <Table2 className="size-3.5 text-primary-emphasis" />
                    <h2 className="text-xs font-semibold">Results</h2>
                    <span
                      role="status"
                      aria-live="polite"
                      className="text-[10px] text-muted-foreground"
                    >
                      {result.isLoading
                        ? "Running…"
                        : `${result.data?.rows.length ?? 0} of ${total.count ?? "…"} records`}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className={subtleButton}
                      onClick={() => setShowSql(!showSql)}
                      aria-expanded={showSql}
                    >
                      <Code2 className="size-3.5" />
                      {showSql ? "Hide SQL" : "View SQL"}
                    </button>
                  </div>
                </div>
                {showSql && (
                  <div className="border-y border-border bg-muted/40 p-4 sm:px-6">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <p className="text-[10px] text-muted-foreground">
                        SQL compiled by Quory · values bound as parameters
                      </p>
                      <button
                        type="button"
                        onClick={copySql}
                        className={subtleButton}
                      >
                        {copied ? (
                          <>
                            <Check className="size-3" />
                            Copied
                          </>
                        ) : (
                          "Copy"
                        )}
                      </button>
                    </div>
                    <pre className="overflow-auto text-[11px] leading-relaxed text-foreground">
                      <code>{sql}</code>
                    </pre>
                    <p className="mt-3 font-mono text-[10px] break-all text-muted-foreground">
                      Parameters: {parameters}
                    </p>
                  </div>
                )}
                {result.query && !result.error && (
                  <div
                    ref={navigatorSize.ref}
                    className="min-w-0 border-b border-border"
                  >
                    <TableNavigator
                      width={navigatorSize.width}
                      maxHeight={360}
                      query={result.query}
                      schemas={database.schemas}
                      joinActions={result.joinActions}
                      highlightedJoinAlias={highlightedJoinAlias}
                      onChangeHighlightedJoinAlias={setHighlightedJoinAlias}
                    />
                  </div>
                )}
                {result.error ? (
                  <div role="alert" className="p-6 text-sm">
                    <p>That query couldn’t run: {result.error.message}</p>
                    <button
                      type="button"
                      onClick={() => void result.refetch()}
                      className={`${subtleButton} mt-3`}
                    >
                      Try again
                    </button>
                  </div>
                ) : (
                  <DataTable
                    key={query.base.tableRef}
                    rows={result.data?.rows ?? []}
                    visibleJoins={result.data?.visibleJoins ?? []}
                    joinActions={result.data ? result.joinActions : undefined}
                    isLoading={result.isLoading}
                    highlightedJoinAlias={highlightedJoinAlias}
                    onChangeHighlightedJoinAlias={setHighlightedJoinAlias}
                    embedded
                    height={390}
                    emptyMessage="No matching records. Try a different filter or choose a suggestion."
                  />
                )}
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 text-[10px] text-muted-foreground sm:px-6">
                  <p>
                    Click a value to inspect or filter. Drag a table heading to
                    reorder.
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      aria-label="Previous page"
                      className={subtleButton}
                      disabled={result.isLoading || (query.offset ?? 0) === 0}
                      onClick={() =>
                        setQuery({
                          ...query,
                          offset: Math.max(
                            0,
                            (query.offset ?? 0) - (query.limit ?? 50),
                          ),
                        })
                      }
                    >
                      <ChevronLeft className="size-3.5" />
                    </button>
                    <span>
                      Page{" "}
                      {Math.floor((query.offset ?? 0) / (query.limit ?? 50)) +
                        1}
                    </span>
                    <button
                      type="button"
                      aria-label="Next page"
                      className={subtleButton}
                      disabled={
                        result.isLoading ||
                        !result.data?.rows.length ||
                        total.count === null ||
                        (query.offset ?? 0) + (query.limit ?? 50) >= total.count
                      }
                      onClick={() =>
                        setQuery({
                          ...query,
                          offset: (query.offset ?? 0) + (query.limit ?? 50),
                        })
                      }
                    >
                      <ChevronRight className="size-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex min-h-58 flex-col items-center justify-center border-t border-dashed border-border px-6 py-10 text-center">
                <div className="mb-4 flex size-12 items-center justify-center rounded-xl bg-primary-subtle text-primary-emphasis">
                  <Search className="size-5" />
                </div>
                <h2 className="text-sm font-medium">
                  There’s a story in your data.
                </h2>
                <p className="mt-2 max-w-xs text-xs leading-relaxed text-muted-foreground">
                  Choose a question above to find it, or open a table in the
                  sidebar and start exploring.
                </p>
                <span className="mt-5 flex items-center gap-1.5 text-[10px] text-primary-emphasis">
                  <Check className="size-3" />
                  Every suggestion uses records in your database
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="mt-7 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
        <p className="text-muted-foreground">
          That’s Quory in action. Now imagine it with your data.
        </p>
        <a
          href="/downloads/"
          className="inline-flex items-center gap-2 font-medium text-primary-emphasis hover:underline"
        >
          Make it your daily driver
          <ArrowRight className="size-3.5" />
        </a>
      </div>
      {showRestart && (
        <dialog
          ref={restartDialog}
          onCancel={() => setShowRestart(false)}
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowRestart(false);
          }}
          aria-labelledby="restart-title"
          className="fixed inset-0 m-auto w-[calc(100%-40px)] max-w-sm rounded-2xl border border-border bg-card p-0 text-foreground shadow-lg backdrop:bg-foreground/20 backdrop:backdrop-blur-sm"
        >
          <div className="p-6">
            <h2 id="restart-title" className="text-lg font-semibold">
              A new playground?
            </h2>
            <p className="mt-3 text-sm text-muted-foreground">
              Your current database and questions will be cleared.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                autoFocus
                type="button"
                className={subtleButton}
                onClick={() => setShowRestart(false)}
              >
                Keep exploring
              </button>
              <button
                type="button"
                onClick={onReset}
                className="rounded-lg bg-primary px-4 py-2 text-xs font-medium text-primary-foreground"
              >
                Start over
              </button>
            </div>
          </div>
        </dialog>
      )}
    </section>
  );
}
