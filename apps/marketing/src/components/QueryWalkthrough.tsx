import { useEffect, useState, type CSSProperties } from "react";

const examples = [
  {
    label: "Trace a payment",
    prompt: "Show Alex Morgan’s orders and their payment status.",
    tables: [
      {
        name: "customers",
        columns: "id, name, email",
        filter: "name = Alex Morgan",
      },
      {
        name: "orders",
        columns: "id, total, created_at",
        filter: "customer_id → id",
      },
      { name: "payments", columns: "amount, status", filter: "order_id → id" },
    ],
    resultGroups: [
      {
        table: "customers",
        columns: ["name"],
        recordKeys: ["1042", "1042", "1042"],
      },
      {
        table: "orders",
        columns: ["id", "total"],
        recordKeys: ["2081", "2094", "2107"],
      },
      {
        table: "payments",
        columns: ["status"],
        recordKeys: ["3102", "3103", "3104"],
      },
    ],
    rows: [
      ["Alex Morgan", "#2081", "£129.00", "Paid"],
      ["Alex Morgan", "#2094", "£48.00", "Pending"],
      ["Alex Morgan", "#2107", "£86.00", "Paid"],
    ],
  },
  {
    label: "Find a delivery",
    prompt: "Find Sam Rivera’s orders that haven’t been delivered.",
    tables: [
      {
        name: "customers",
        columns: "id, name, email",
        filter: "name = Sam Rivera",
      },
      { name: "orders", columns: "id, created_at", filter: "customer_id → id" },
      {
        name: "shipments",
        columns: "carrier, status",
        filter: "status ≠ Delivered",
      },
    ],
    resultGroups: [
      {
        table: "customers",
        columns: ["name"],
        recordKeys: ["1086", "1086", "1086"],
      },
      {
        table: "orders",
        columns: ["id"],
        recordKeys: ["3028", "3041", "3056"],
      },
      {
        table: "shipments",
        columns: ["carrier", "status"],
        recordKeys: ["4001", "4002", "4003"],
      },
    ],
    rows: [
      ["Sam Rivera", "#3028", "DPD", "In transit"],
      ["Sam Rivera", "#3041", "Royal Mail", "Delayed"],
      ["Sam Rivera", "#3056", "DPD", "Processing"],
    ],
  },
  {
    label: "Check an account",
    prompt: "Show the active subscriptions for the team at Acme.",
    tables: [
      { name: "organizations", columns: "id, name", filter: "name = Acme" },
      {
        name: "members",
        columns: "id, name, email",
        filter: "organization_id → id",
      },
      {
        name: "subscriptions",
        columns: "plan, status",
        filter: "status = Active",
      },
    ],
    resultGroups: [
      {
        table: "organizations",
        columns: ["name"],
        recordKeys: ["10", "10", "10"],
      },
      {
        table: "members",
        columns: ["name"],
        recordKeys: ["101", "102", "103"],
      },
      {
        table: "subscriptions",
        columns: ["plan", "status"],
        recordKeys: ["501", "502", "503"],
      },
    ],
    rows: [
      ["Acme", "Jamie Chen", "Pro", "Active"],
      ["Acme", "Taylor Reed", "Pro", "Active"],
      ["Acme", "Jordan Lee", "Team", "Active"],
    ],
  },
];

// Shared cell spacing and boundaries for both header rows and result records.
const resultCellClasses =
  "border-b border-border/60 px-4.5 py-0 data-[first-column=true]:pl-8 data-[group-start=true]:border-l-2 data-[group-start=true]:border-l-border last:pr-8 max-[580px]:data-[first-column=true]:pl-5";

const TYPE_DELAY = 28;
const START_DELAY = 450;
const SUBMIT_DURATION = 500;
const NODE_DELAY = 550;
const LOADING_DURATION = 950;
const RESULT_DURATION = 4300;
const EXIT_DURATION = 400;

// Match DataTable: merge consecutive instances of a record, not equal cell text.
function recordRowSpan(recordKeys: string[], rowIndex: number) {
  const key = recordKeys[rowIndex];
  if (rowIndex > 0 && recordKeys[rowIndex - 1] === key) return 0;
  let span = 1;
  while (
    rowIndex + span < recordKeys.length &&
    recordKeys[rowIndex + span] === key
  )
    span++;
  return span;
}

function TableIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <rect x="3" y="4" width="18" height="16" rx="3" />
      <path d="M3 10h18M9 10v10" />
    </svg>
  );
}

function LoadingSpinner() {
  return (
    <span
      className="inline-block size-3.5 shrink-0 animate-[spin_700ms_linear_infinite] rounded-full border-[1.5px] border-current border-r-transparent"
      aria-hidden="true"
    />
  );
}

export default function QueryWalkthrough() {
  const [exampleIndex, setExampleIndex] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  // Render a complete example before hydration and for reduced-motion visitors.
  const [animated, setAnimated] = useState(false);
  const example = examples[exampleIndex]!;
  const columns = example.resultGroups.flatMap((group, groupIndex) =>
    group.columns.map((name, columnIndex) => ({
      name,
      table: group.table,
      recordKeys: group.recordKeys,
      groupStart: groupIndex > 0 && columnIndex === 0,
    })),
  );
  const submitAt = START_DELAY + example.prompt.length * TYPE_DELAY;
  const nodesAt = submitAt + SUBMIT_DURATION;
  const loadingAt = nodesAt + example.tables.length * NODE_DELAY;
  const resultsAt = loadingAt + LOADING_DURATION;
  const exitAt = resultsAt + RESULT_DURATION;
  const duration = exitAt + EXIT_DURATION;
  const time = animated ? elapsed : resultsAt;
  const submitting = time >= submitAt && time < nodesAt;
  const submitBusy = time >= nodesAt && time < nodesAt + NODE_DELAY;
  const joining = time >= nodesAt + NODE_DELAY && time < loadingAt;
  const loading = time >= loadingAt && time < resultsAt;
  const complete = time >= resultsAt;
  const typedCharacters = Math.max(
    0,
    Math.floor((time - START_DELAY) / TYPE_DELAY),
  );

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncMotion = () => {
      setAnimated(!preference.matches);
      setElapsed(0);
    };
    syncMotion();
    preference.addEventListener("change", syncMotion);
    return () => {
      preference.removeEventListener("change", syncMotion);
    };
  }, []);

  useEffect(() => {
    if (!animated) return;
    const timer = window.setInterval(
      () => setElapsed((value) => value + 40),
      40,
    );
    return () => window.clearInterval(timer);
  }, [animated]);

  useEffect(() => {
    if (!animated || elapsed < duration) return;
    setExampleIndex((index) => (index + 1) % examples.length);
    setElapsed(0);
  }, [elapsed, duration, animated]);

  function selectExample(index: number) {
    setExampleIndex(index);
    setElapsed(0);
  }

  return (
    <section
      className="group/walkthrough mx-auto w-[min(1000px,calc(100%-96px))] pt-5 pb-10 text-foreground data-[paused=true]:**:[animation-play-state:paused] motion-reduce:**:animate-none! motion-reduce:**:transition-none! max-[1100px]:w-[calc(100%-64px)] max-[780px]:w-[calc(100%-40px)] max-[780px]:pt-4 max-[780px]:pb-14 max-[580px]:w-[calc(100%-36px)] data-[paused=true]:[&_*::before]:[animation-play-state:paused] motion-reduce:[&_*::before]:animate-none! motion-reduce:[&_*::before]:transition-none!"
      aria-label="How Quory works"
      data-paused={!animated}
    >
      <div className="grid gap-8">
        <div className="flex items-center justify-center gap-3 max-[780px]:gap-1 max-[580px]:items-stretch">
          <div
            className="flex gap-1.5 max-[780px]:gap-0.5 max-[580px]:flex-1"
            role="group"
            aria-label="Example queries"
          >
            {examples.map((item, index) => (
              <button
                key={item.label}
                className="inline-flex min-h-9 items-center justify-center gap-2 rounded-[999px] border border-primary-subtle bg-transparent px-3 py-1.5 text-xs/[inherit] whitespace-nowrap text-muted-foreground transition-[background,color] duration-180 hover:bg-muted hover:text-foreground aria-pressed:bg-primary-subtle aria-pressed:text-primary-emphasis max-[780px]:px-2.25 max-[780px]:py-1.75 max-[780px]:text-[11px] max-[580px]:flex-1 max-[580px]:p-1.5 max-[580px]:text-[10px] max-[580px]:leading-[1.4] max-[580px]:whitespace-normal"
                type="button"
                aria-pressed={index === exampleIndex}
                onClick={() => selectExample(index)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div
          key={exampleIndex}
          className="grid gap-10 opacity-100 transition-[opacity,transform] duration-350 data-[exiting=true]:-translate-y-1.5 data-[exiting=true]:opacity-0 max-[780px]:gap-8"
          data-exiting={time >= exitAt}
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2.5 text-[15px] font-[550] max-[580px]:gap-1.75 max-[580px]:text-[13px] [&>span]:font-[monospace] [&>span]:text-xs/[inherit] [&>span]:leading-[normal] [&>span]:text-primary-emphasis">
              <span>1.</span> Prompt for the data you need
            </div>
            <div className="mt-3 flex min-h-18 items-center gap-3.5 rounded-[10px] border border-primary/45 bg-background px-4 py-3.5 shadow-[0_0_0_3px_rgb(var(--primary)/0.05)] max-[580px]:min-h-25 max-[580px]:gap-2 max-[580px]:p-3">
              <span
                className="text-[26px] text-primary-emphasis max-[580px]:hidden"
                aria-hidden="true"
              >
                ✧
              </span>
              <p className="m-0 min-w-0 flex-1 text-[15px] leading-[1.6] max-[580px]:text-[13px]">
                <span className="sr-only">{example.prompt}</span>
                <span aria-hidden="true">
                  {example.prompt.slice(0, typedCharacters)}
                  {time < submitAt && (
                    <span className="ml-0.5 inline-block h-4.25 animate-query-caret border-r-2 border-primary align-[-3px]" />
                  )}
                </span>
              </p>
              <button
                className="grid size-9 shrink-0 place-items-center rounded-lg border-0 bg-primary text-primary-foreground hover:bg-primary-hover disabled:cursor-wait data-[flash=true]:animate-query-submit [&>span]:size-3"
                data-flash={submitting}
                type="button"
                aria-label="Run example query"
                aria-busy={submitBusy}
                disabled={submitBusy}
                onClick={() => {
                  setElapsed(submitAt);
                }}
              >
                {submitBusy ? (
                  <LoadingSpinner />
                ) : (
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    aria-hidden="true"
                  >
                    <path
                      d="M5 12h14m-6-6 6 6-6 6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </button>
            </div>
          </div>

          <div className="min-w-0">
            <div className="mb-3.5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 text-[15px] font-[550] max-[580px]:gap-1.75 max-[580px]:text-[13px] [&>span]:font-[monospace] [&>span]:text-xs/[inherit] [&>span]:leading-[normal] [&>span]:text-primary-emphasis">
                <span>2.</span> Quory knows your data model
              </div>
              <span className="inline-flex items-center gap-1.5 font-[monospace] text-[10px] leading-[normal] text-muted-foreground max-[580px]:text-[9px]">
                {joining && <LoadingSpinner />}
                {time >= loadingAt
                  ? "3 tables connected"
                  : joining
                    ? "Joining tables…"
                    : null}
              </span>
            </div>
            <div
              className="flex items-center rounded-xl bg-[radial-gradient(circle,rgb(var(--border))_1px,transparent_1px)] bg-size-[12px_12px] px-8 py-6 max-[780px]:px-5 max-[780px]:pt-4.5 max-[780px]:pb-6.5 max-[580px]:flex-col max-[580px]:items-stretch max-[580px]:px-8 max-[580px]:pt-3 max-[580px]:pb-6"
              aria-label="Example table relationships"
            >
              {example.tables.map((table, index) => {
                const visible = time >= nodesAt + index * NODE_DELAY;
                return (
                  <div
                    className="group/slot relative min-w-0 flex-1 not-first:ml-11 max-[780px]:not-first:ml-6 max-[580px]:not-first:mt-5.5 max-[580px]:not-first:ml-0"
                    key={table.name}
                  >
                    {index > 0 && (
                      <span
                        className="absolute top-1/2 right-full h-px w-11 origin-left transform-[scaleX(0)] bg-primary/60 transition-transform duration-350 ease-out before:absolute before:-top-0.5 before:left-0 before:size-1.25 before:rounded-full before:bg-primary after:absolute after:-top-0.5 after:right-0 after:size-1.25 after:rounded-full after:bg-primary data-[visible=true]:transform-[scaleX(1)] max-[780px]:w-6 max-[580px]:-top-5.5 max-[580px]:left-1/2 max-[580px]:h-5.5 max-[580px]:w-px max-[580px]:origin-top max-[580px]:transform-[scaleY(0)] max-[580px]:before:top-0 max-[580px]:before:-left-0.5 max-[580px]:after:top-auto max-[580px]:after:bottom-0 max-[580px]:after:-left-0.5 max-[580px]:data-[visible=true]:transform-[scaleY(1)]"
                        data-visible={visible}
                        aria-hidden="true"
                      >
                        <i />
                      </span>
                    )}
                    <div
                      className="relative transform-[translateY(12px)_scale(0.96)] rounded-lg border border-muted-foreground/35 bg-card p-3.5 opacity-0 shadow-[0_4px_12px_rgb(var(--foreground)/0.035)] [transition:opacity_420ms,transform_420ms_cubic-bezier(0.2,0.8,0.2,1)] group-first/slot:border-primary/60 data-[visible=true]:transform-[translateY(0)_scale(1)] data-[visible=true]:opacity-100 max-[780px]:px-2.5 max-[780px]:py-3 max-[580px]:px-3.5 max-[580px]:py-2.75"
                      data-visible={visible}
                      aria-hidden={!visible}
                    >
                      <div className="flex items-center gap-1.75 [&_strong]:overflow-hidden [&_strong]:text-xs/[inherit] [&_strong]:text-ellipsis [&_svg]:shrink-0 [&_svg]:text-primary-emphasis [&>span]:ml-auto [&>span]:text-[9px] [&>span]:text-muted-foreground max-[780px]:[&>span]:hidden max-[580px]:[&>span]:block">
                        <TableIcon />
                        <strong>{table.name}</strong>
                        <span>{index === 0 ? "Base" : "Joined"}</span>
                      </div>
                      <p className="mt-2 mb-3.25 overflow-hidden font-[monospace] text-[10px] leading-[1.6] text-ellipsis whitespace-nowrap text-muted-foreground max-[580px]:mt-1.25 max-[580px]:mb-1.75">
                        {table.columns}
                      </p>
                      <div className="flex w-fit max-w-full items-center gap-1.5 rounded bg-primary-subtle px-1.5 py-0.75 text-[10px] whitespace-nowrap text-primary-emphasis max-[780px]:text-[9px] max-[580px]:text-[10px]">
                        <span aria-hidden="true">
                          {index === 0 || (exampleIndex > 0 && index === 2)
                            ? "⌕"
                            : "↳"}
                        </span>
                        {table.filter}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="min-w-0">
            <div className="mb-3.5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 text-[15px] font-[550] max-[580px]:gap-1.75 max-[580px]:text-[13px] [&>span]:font-[monospace] [&>span]:text-xs/[inherit] [&>span]:leading-[normal] [&>span]:text-primary-emphasis">
                <span>3.</span> Tabular results, without the SQL
              </div>
              <span className="inline-flex items-center gap-1.5 font-[monospace] text-[10px] leading-[normal] text-muted-foreground max-[580px]:text-[9px]">
                {complete
                  ? "3 results"
                  : loading
                    ? "Running query…"
                    : "Results"}
              </span>
            </div>
            <div
              className="h-54.25 overflow-hidden rounded-xl bg-card max-[580px]:h-58.5"
              aria-busy={loading}
            >
              {time < loadingAt && (
                <div className="flex h-full items-center justify-center gap-2.25 text-xs/[inherit] text-muted-foreground">
                  <TableIcon />
                  <span>Your answer will appear here.</span>
                </div>
              )}
              {loading && (
                <div
                  className="px-8 max-[580px]:px-5 [&_span]:h-2.5 [&_span]:w-3/4 [&_span]:animate-query-shimmer [&_span]:rounded [&_span]:bg-muted-foreground/13 [&>div]:grid [&>div]:h-12 [&>div]:grid-cols-4 [&>div]:items-center [&>div]:gap-8 [&>div]:border-b [&>div]:border-border/50 max-[580px]:[&>div]:gap-4 [&>div:nth-child(-n+2)]:h-9 [&>div:nth-child(-n+2)_span]:h-2 [&>div:nth-child(-n+2)_span]:w-[55%]"
                  aria-label="Loading example results"
                >
                  <div className="[&>span]:[animation-delay:0ms]">
                    {example.resultGroups.map((group) => (
                      <span
                        key={group.table}
                        style={{ gridColumn: `span ${group.columns.length}` }}
                      />
                    ))}
                  </div>
                  {Array.from({ length: 4 }, (_, row) => (
                    <div key={row}>
                      {columns.map((column, col) => (
                        <span
                          key={`${column.table}.${column.name}`}
                          style={
                            {
                              "--delay": `${(row + col) * 70}ms`,
                            } as CSSProperties
                          }
                        />
                      ))}
                    </div>
                  ))}
                </div>
              )}
              {complete && (
                <div
                  className="h-full overflow-x-auto"
                  role="region"
                  aria-label="Example query results"
                  tabIndex={0}
                >
                  <table className="w-full border-collapse text-left text-xs/[inherit] whitespace-nowrap max-[580px]:min-w-135">
                    <caption className="sr-only">
                      {example.prompt} Illustrative results.
                    </caption>
                    {example.resultGroups.map((group) => (
                      <colgroup key={group.table} span={group.columns.length} />
                    ))}
                    <thead>
                      <tr className="h-9">
                        {example.resultGroups.map((group, index) => (
                          <th
                            key={group.table}
                            scope="colgroup"
                            className={`${resultCellClasses} h-9 bg-background font-semibold text-foreground [&_svg]:text-primary-emphasis [&>span]:flex [&>span]:items-center [&>span]:gap-1.75`}
                            colSpan={group.columns.length}
                            data-group-start={index > 0}
                            data-first-column={index === 0}
                          >
                            <span>
                              <TableIcon />
                              {group.table}
                            </span>
                          </th>
                        ))}
                      </tr>
                      <tr className="h-9">
                        {columns.map((column, index) => (
                          <th
                            key={`${column.table}.${column.name}`}
                            scope="col"
                            className={`${resultCellClasses} h-9 bg-muted/35 font-[monospace] text-[10px] leading-[normal] font-normal text-muted-foreground`}
                            data-group-start={column.groupStart}
                            data-first-column={index === 0}
                          >
                            {column.name}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {example.rows.map((row, index) => (
                        <tr
                          key={row.join()}
                          className="h-12 animate-query-reveal group-data-[paused=true]/walkthrough:animate-none"
                          style={
                            { "--delay": `${index * 110}ms` } as CSSProperties
                          }
                        >
                          {row.map((cell, col) => {
                            const column = columns[col]!;
                            const rowSpan = recordRowSpan(
                              column.recordKeys,
                              index,
                            );
                            if (rowSpan === 0) return null;
                            return (
                              <td
                                key={col}
                                className={`${resultCellClasses} h-12 align-middle text-muted-foreground`}
                                rowSpan={rowSpan}
                                data-group-start={column.groupStart}
                                data-first-column={col === 0}
                                aria-label={`${column.table}, ${column.name}: ${cell}`}
                              >
                                {column.name === "status" ? (
                                  <span
                                    className="inline-flex items-center gap-1.5 text-[11px] text-primary-emphasis before:size-1.25 before:rounded-full before:bg-current data-[attention=true]:text-foreground data-[attention=true]:before:border data-[attention=true]:before:border-current data-[attention=true]:before:bg-transparent"
                                    data-attention={[
                                      "Pending",
                                      "Delayed",
                                      "Processing",
                                    ].includes(cell)}
                                  >
                                    {cell}
                                  </span>
                                ) : (
                                  cell
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div className="flex min-h-12 items-center justify-end gap-4 py-2.5 text-[10px] text-muted-foreground max-[580px]:min-h-17 max-[580px]:items-start max-[580px]:gap-2 [&>span:first-child]:opacity-0 [&>span:first-child]:transition-opacity [&>span:first-child]:duration-300 max-[580px]:[&>span:first-child]:max-w-57.5 [&>span:last-child]:shrink-0 [&>span:last-child]:text-[9px] [&>span[data-visible=true]]:opacity-100">
              <span>Illustrative data</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
