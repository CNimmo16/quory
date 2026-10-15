import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { EditorView } from "@uiw/react-codemirror";
import { startCompletion } from "@codemirror/autocomplete";
import { schemas } from "../../../../test/queryFixtures";
import { SqlEditor, formatSql } from "./SqlEditor";
beforeEach(() => {
  // JSDOM has no layout implementation for CodeMirror's selection measurement.
  vi.spyOn(document, "createRange").mockImplementation(() => {
    const range = new Range();
    range.getClientRects = () => [] as unknown as DOMRectList;
    range.getBoundingClientRect = () => new DOMRect();
    return range;
  });
});
afterEach(() => vi.restoreAllMocks());
it("formats SQL while preserving bound placeholders and quoted values", () => {
  const formatted = formatSql(
    "select * from orders where status=$1 limit $2",
    "postgres"
  );
  expect(formatted).toContain("SELECT");
  expect(formatted).toContain("$1");
  expect(formatted).toContain("$2");
});
it("renders highlighted, locked SQL and requests conversion when clicked", async () => {
  const user = userEvent.setup();
  const edit = vi.fn();
  render(
    <SqlEditor
      value="SELECT id FROM orders WHERE id = $1"
      readOnly
      onRequestEdit={edit}
    />
  );
  const editor = screen.getByRole("button", { name: "Edit SQL query" });
  const content = editor.querySelector(".cm-content")!;
  expect(content).toHaveAttribute("contenteditable", "false");
  expect(content.querySelector("span")).not.toBeNull();
  await user.click(editor);
  expect(edit).toHaveBeenCalledOnce();
});

it("uses current database metadata in the editor popup and disables spelling suggestions", async () => {
  const { container, rerender } = render(
    <SqlEditor value="SELECT * FROM public.or" schemas={schemas} />
  );
  const content = container.querySelector(".cm-content")!;
  expect(content).toHaveAttribute("spellcheck", "false");
  const view = EditorView.findFromDOM(container.querySelector(".cm-editor")!)!;
  act(() => {
    view.dispatch({ selection: { anchor: view.state.doc.length } });
    view.focus();
    startCompletion(view);
  });
  expect(await screen.findByRole("option")).toHaveTextContent("orders");
  expect(
    screen.queryByRole("option", { name: /ORDER BY/ })
  ).not.toBeInTheDocument();
  rerender(
    <SqlEditor
      value="SELECT * FROM public.or"
      schemas={[
        {
          name: "public",
          tables: [{ ...schemas[0]!.tables[0]!, name: "organisations" }],
        },
      ]}
    />
  );
  act(() => {
    startCompletion(view);
  });
  await waitFor(() =>
    expect(screen.getByRole("option")).toHaveTextContent("organisations")
  );
  expect(
    screen.getAllByRole("option").map((option) => option.textContent)
  ).not.toContain("orders");
});
