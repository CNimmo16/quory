import { useEffect, useState, type CSSProperties } from "react";
import styles from "./QueryWalkthrough.module.css";

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
  return <span className={styles.spinner} aria-hidden="true" />;
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
      className={styles.walkthrough}
      aria-label="How Quory works"
      data-paused={!animated}
    >
      <div className={styles.demo}>
        <div className={styles.toolbar}>
          <div
            className={styles.examples}
            role="group"
            aria-label="Example queries"
          >
            {examples.map((item, index) => (
              <button
                key={item.label}
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
          className={styles.scene}
          data-exiting={time >= exitAt}
        >
          <div className={styles.promptArea}>
            <div className={styles.stepLabel}>
              <span>1.</span> Prompt for the data you need
            </div>
            <div className={styles.prompt}>
              <span className={styles.sparkle} aria-hidden="true">
                ✧
              </span>
              <p>
                <span className={styles.srOnly}>{example.prompt}</span>
                <span aria-hidden="true">
                  {example.prompt.slice(0, typedCharacters)}
                  {time < submitAt && <span className={styles.caret} />}
                </span>
              </p>
              <button
                className={styles.submit}
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

          <div className={styles.relationships}>
            <div className={styles.panelHeading}>
              <div className={styles.stepLabel}>
                <span>2.</span> Quory knows your data model
              </div>
              <span className={styles.metadata}>
                {joining && <LoadingSpinner />}
                {time >= loadingAt
                  ? "3 tables connected"
                  : joining
                    ? "Joining tables…"
                    : null}
              </span>
            </div>
            <div
              className={styles.graph}
              aria-label="Example table relationships"
            >
              {example.tables.map((table, index) => {
                const visible = time >= nodesAt + index * NODE_DELAY;
                return (
                  <div className={styles.nodeSlot} key={table.name}>
                    {index > 0 && (
                      <span
                        className={styles.connector}
                        data-visible={visible}
                        aria-hidden="true"
                      >
                        <i />
                      </span>
                    )}
                    <div
                      className={styles.node}
                      data-visible={visible}
                      aria-hidden={!visible}
                    >
                      <div className={styles.nodeTitle}>
                        <TableIcon />
                        <strong>{table.name}</strong>
                        <span>{index === 0 ? "Base" : "Joined"}</span>
                      </div>
                      <p className={styles.columns}>{table.columns}</p>
                      <div className={styles.filter}>
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

          <div className={styles.results}>
            <div className={styles.panelHeading}>
              <div className={styles.stepLabel}>
                <span>3.</span> Tabular results, without the SQL
              </div>
              <span className={styles.metadata}>
                {complete
                  ? "3 results"
                  : loading
                    ? "Running query…"
                    : "Results"}
              </span>
            </div>
            <div className={styles.resultBody} aria-busy={loading}>
              {time < loadingAt && (
                <div className={styles.empty}>
                  <TableIcon />
                  <span>Your answer will appear here.</span>
                </div>
              )}
              {loading && (
                <div
                  className={styles.skeleton}
                  aria-label="Loading example results"
                >
                  <div className={styles.skeletonGroups}>
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
                  className={styles.tableScroll}
                  role="region"
                  aria-label="Example query results"
                  tabIndex={0}
                >
                  <table>
                    <caption className={styles.srOnly}>
                      {example.prompt} Illustrative results.
                    </caption>
                    {example.resultGroups.map((group) => (
                      <colgroup key={group.table} span={group.columns.length} />
                    ))}
                    <thead>
                      <tr className={styles.tableGroups}>
                        {example.resultGroups.map((group, index) => (
                          <th
                            key={group.table}
                            scope="colgroup"
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
                      <tr>
                        {columns.map((column, index) => (
                          <th
                            key={`${column.table}.${column.name}`}
                            scope="col"
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
                                rowSpan={rowSpan}
                                data-group-start={column.groupStart}
                                data-first-column={col === 0}
                                aria-label={`${column.table}, ${column.name}: ${cell}`}
                              >
                                {column.name === "status" ? (
                                  <span
                                    className={styles.status}
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
            <div className={styles.resultFooter}>
              <span>Illustrative data</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
