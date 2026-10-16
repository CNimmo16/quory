import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { ConditionOperator, type Query } from "@quory/core";
import { captureFilterset } from "../../../shared/queryFiltersets";
import { QueryFiltersets } from "./QueryFiltersets";
const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  save: vi.fn(),
  reset: vi.fn(),
  invalidate: vi.fn(),
  onSaved: undefined as undefined | (() => Promise<void>),
}));
vi.mock("../util/tprc", () => ({
  default: {
    useUtils: () => ({
      queries: { listFiltersets: { invalidate: mocks.invalidate } },
    }),
    queries: {
      listFiltersets: { useQuery: () => mocks.list() },
      saveFilterset: {
        useMutation: (options: { onSuccess: () => Promise<void> }) => {
          mocks.onSaved = options.onSuccess;
          return { mutate: mocks.save, reset: mocks.reset, isPending: false };
        },
      },
    },
  },
}));
const scope = {
  connectionId: "connection",
  projectId: "project",
  queryId: "query",
};
const query: Query = {
  base: {
    tableRef: "public.orders",
    select: ["id"],
    where: {
      column: "status",
      operator: ConditionOperator.EQUALS,
      value: "open",
    },
    joins: [],
  },
  offset: 100,
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.list.mockReturnValue({ data: { filtersets: [] }, isLoading: false });
});
it("saves a trimmed name and the filters captured when the save dialog opened", async () => {
  const user = userEvent.setup();
  const view = render(
    <QueryFiltersets scope={scope} query={query} onApply={vi.fn()} />,
  );
  await user.click(
    screen.getByRole("button", { name: "Save current filters" }),
  );
  const changed = structuredClone(query);
  delete changed.base.where;
  view.rerender(
    <QueryFiltersets scope={scope} query={changed} onApply={vi.fn()} />,
  );
  const dialog = screen.getByRole("dialog");
  expect(
    within(dialog).getByRole("button", { name: "Save filterset" }),
  ).toBeDisabled();
  await user.type(
    within(dialog).getByRole("textbox", { name: "Filterset name" }),
    "  Open orders  ",
  );
  await user.click(
    within(dialog).getByRole("button", { name: "Save filterset" }),
  );
  expect(mocks.save).toHaveBeenCalledWith({
    ...scope,
    name: "Open orders",
    query,
  });
});
it("loads a saved filterset into the current query without overwriting columns or leaving pagination behind", async () => {
  const user = userEvent.setup();
  mocks.list.mockReturnValue({
    data: {
      filtersets: [
        { id: "saved", name: "Open orders", snapshot: captureFilterset(query) },
      ],
    },
  });
  const current = structuredClone(query);
  current.base.select = ["status"];
  delete current.base.where;
  const onApply = vi.fn();
  render(<QueryFiltersets scope={scope} query={current} onApply={onApply} />);
  expect(
    screen.queryByRole("menuitem", { name: "Apply filterset Open orders" }),
  ).not.toBeInTheDocument();
  await user.click(
    screen.getByRole("button", { name: "View more filtersets" }),
  );
  await user.click(
    screen.getByRole("menuitem", { name: "Apply filterset Open orders" }),
  );
  expect(onApply).toHaveBeenCalledWith({
    ...current,
    base: { ...current.base, where: query.base.where },
    offset: 0,
  });
});
it("shows a useful error instead of applying a filterset to a changed relationship tree", async () => {
  const user = userEvent.setup();
  mocks.list.mockReturnValue({
    data: {
      filtersets: [
        { id: "saved", name: "Open orders", snapshot: captureFilterset(query) },
      ],
    },
  });
  const current = structuredClone(query);
  current.base.tableRef = "public.customers";
  const onApply = vi.fn();
  render(<QueryFiltersets scope={scope} query={current} onApply={onApply} />);
  expect(
    screen.queryByRole("menuitem", { name: "Apply filterset Open orders" }),
  ).not.toBeInTheDocument();
  await user.click(
    screen.getByRole("button", { name: "View more filtersets" }),
  );
  await user.click(
    screen.getByRole("menuitem", { name: "Apply filterset Open orders" }),
  );
  expect(screen.getByRole("alert")).toHaveTextContent(
    "different tables or relationships",
  );
  expect(onApply).not.toHaveBeenCalled();
});

it("refreshes the query's saved filtersets and closes the dialog after persistence succeeds", async () => {
  const user = userEvent.setup();
  mocks.save.mockImplementation(() => void mocks.onSaved?.());
  render(<QueryFiltersets scope={scope} query={query} onApply={vi.fn()} />);
  await user.click(
    screen.getByRole("button", { name: "Save current filters" }),
  );
  const dialog = screen.getByRole("dialog");
  await user.type(
    within(dialog).getByRole("textbox", { name: "Filterset name" }),
    "Open",
  );
  await user.click(
    within(dialog).getByRole("button", { name: "Save filterset" }),
  );
  expect(mocks.invalidate).toHaveBeenCalledWith(scope);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

it("returns focus to the save button after dismissing the save dialog", async () => {
  const user = userEvent.setup();
  render(<QueryFiltersets scope={scope} query={query} onApply={vi.fn()} />);
  await user.click(
    screen.getByRole("button", { name: "Save current filters" }),
  );
  await user.click(
    within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }),
  );
  expect(
    screen.getByRole("button", { name: "Save current filters" }),
  ).toHaveFocus();
});

it("fits recent filtersets to the available width and moves the remainder into View more on resize", async () => {
  const user = userEvent.setup();
  let width = 350;
  let resize = () => {};
  const originalObserver = globalThis.ResizeObserver;
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(private callback: ResizeObserverCallback) {}
      observe(element: Element) {
        if (element.getAttribute("aria-label") === "Saved filtersets")
          resize = () => this.callback([], this);
      }
      unobserve() {}
      disconnect() {}
    },
  );
  const rect = vi
    .spyOn(HTMLElement.prototype, "getBoundingClientRect")
    .mockImplementation(function (this: HTMLElement) {
      const size =
        this.getAttribute("aria-label") === "Saved filtersets"
          ? width
          : this.hasAttribute("data-filterset-width")
            ? 80
            : this.hasAttribute("data-save-width")
              ? 130
              : this.hasAttribute("data-more-width")
                ? 80
                : 0;
      return {
        width: size,
        height: 20,
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        bottom: 20,
        right: size,
        toJSON: () => ({}),
      };
    });
  mocks.list.mockReturnValue({
    data: {
      filtersets: ["Newest", "Previous", "Oldest"].map((name, index) => ({
        id: String(index),
        name,
        snapshot: captureFilterset(query),
      })),
    },
  });
  const onApply = vi.fn();
  const view = render(
    <QueryFiltersets scope={scope} query={query} onApply={onApply} />,
  );
  try {
    expect(
      screen.getByRole("button", { name: "Apply filterset Newest" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Apply filterset Previous" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Filtersets" }),
    ).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Apply filterset Newest" }),
    );
    expect(onApply).toHaveBeenCalled();
    await user.click(
      screen.getByRole("button", { name: "View more filtersets" }),
    );
    expect(
      screen.getByRole("menuitem", { name: "Apply filterset Previous" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("menuitem", { name: "Apply filterset Newest" }),
    ).not.toBeInTheDocument();
    await user.keyboard("{Escape}");
    act(() => {
      width = 500;
      resize();
    });
    expect(
      screen.getByRole("button", { name: "Apply filterset Oldest" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "View more filtersets" }),
    ).not.toBeInTheDocument();
    act(() => {
      width = 180;
      resize();
    });
    expect(
      screen.queryByRole("button", { name: "Apply filterset Newest" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "View more filtersets" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Save current filters" }),
    ).toBeVisible();
  } finally {
    view.unmount();
    rect.mockRestore();
    vi.stubGlobal("ResizeObserver", originalObserver);
  }
});
