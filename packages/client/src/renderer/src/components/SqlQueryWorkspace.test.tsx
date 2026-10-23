import { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { SqlQueryWorkspace } from "./SqlQueryWorkspace";
import type { CustomSqlQuery } from "../../../shared/sqlQuery";
vi.mock("@quory/stack/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@quory/stack/react")>()),
  useFetchSchema: () => ({ data: { schemas: [] } }),
}));
const mocks = vi.hoisted(() => ({ execute: vi.fn(), cancel: vi.fn() }));
vi.mock("../util/tprc", () => ({
  default: {
    queries: {
      executeSql: {
        useMutation: () => ({ mutateAsync: mocks.execute, isPending: false }),
      },
      cancelSql: { useMutation: () => ({ mutateAsync: mocks.cancel }) },
    },
  },
}));
vi.mock("./SqlEditor", () => ({
  formatSql: (value: string) => value,
  SqlEditor: ({
    value,
    onChange,
    readOnly,
  }: {
    value: string;
    onChange?: (value: string) => void;
    readOnly?: boolean;
  }) => (
    <textarea
      aria-label="SQL query"
      value={value}
      readOnly={readOnly}
      onChange={(event) => onChange?.(event.target.value)}
    />
  ),
}));
const result = {
  status: "executed",
  columns: ["value", "value"],
  rows: [
    ["Paid", 1],
    [null, 2],
  ],
  affectedRows: null,
  truncated: false,
  elapsedMs: 12,
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.execute.mockResolvedValue(result);
  mocks.cancel.mockResolvedValue({ cancelled: true });
});
function Show({
  initial = { mode: "sql", sql: "SELECT 1" },
}: {
  initial?: CustomSqlQuery;
}) {
  const [query, setQuery] = useState(initial);
  return (
    <SqlQueryWorkspace connectionId="local" query={query} onChange={setQuery} />
  );
}
it("runs only on request and preserves duplicate column names and null values", async () => {
  const user = userEvent.setup();
  render(<Show />);
  expect(mocks.execute).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Run SQL" }));
  expect(
    await screen.findByRole("region", { name: "Scrollable query results" }),
  ).toHaveTextContent("Paid");
  expect(screen.getAllByRole("columnheader", { name: "value" })).toHaveLength(
    2,
  );
  expect(screen.getByText("NULL")).toBeVisible();
  expect(
    screen.getByRole("table", { name: "Query results table" }),
  ).toBeVisible();
  await user.click(screen.getByRole("button", { name: "value: Paid" }));
  expect(screen.getByRole("dialog")).toHaveTextContent("Paid");
  expect(
    screen.queryByRole("button", { name: "Filter on this value" }),
  ).not.toBeInTheDocument();
  await user.keyboard("{Escape}");
  expect(mocks.execute).toHaveBeenCalledWith(
    expect.objectContaining({
      connectionId: "local",
      sql: "SELECT 1",
      executionId: expect.any(String),
    }),
  );
});
it("requires explicit confirmation of the exact write and allows cancellation", async () => {
  const user = userEvent.setup();
  mocks.execute
    .mockResolvedValueOnce({
      status: "confirmation-required",
      token: "token-1",
      connectionName: "Production",
    })
    .mockResolvedValueOnce({
      status: "confirmation-required",
      token: "token-2",
      connectionName: "Production",
    })
    .mockResolvedValueOnce({ ...result, affectedRows: 3, rows: [] });
  render(<Show initial={{ mode: "sql", sql: "DELETE FROM orders" }} />);
  await user.click(screen.getByRole("button", { name: "Run SQL" }));
  expect(await screen.findByRole("dialog")).toHaveTextContent("Production");
  expect(mocks.execute).toHaveBeenCalledTimes(1);
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  expect(mocks.execute).toHaveBeenCalledTimes(1);
  await user.click(screen.getByRole("button", { name: "Run SQL" }));
  await screen.findByRole("dialog");
  await user.click(screen.getByRole("button", { name: "Run write" }));
  await waitFor(() => expect(mocks.execute).toHaveBeenCalledTimes(3));
  expect(mocks.execute.mock.calls[2]![0]).toMatchObject({
    sql: "DELETE FROM orders",
    confirmationToken: "token-2",
  });
  expect(await screen.findByText("3 affected rows")).toBeVisible();
});
it("allows editing converted parameters and blocks incomplete parameter JSON", async () => {
  const user = userEvent.setup();
  render(
    <Show initial={{ mode: "sql", sql: "SELECT $1", parameters: ["paid"] }} />,
  );
  const parameters = screen.getByRole("textbox", {
    name: /Bound parameters \(JSON/,
  });
  await user.clear(parameters);
  expect(screen.getByRole("button", { name: "Run SQL" })).toBeDisabled();
  await user.paste('["finalised"]');
  await user.click(screen.getByRole("button", { name: "Run SQL" }));
  expect(mocks.execute).toHaveBeenCalledWith(
    expect.objectContaining({ parameters: ["finalised"] }),
  );
});
