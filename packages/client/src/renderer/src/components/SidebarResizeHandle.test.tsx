import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it } from "vitest";
import {
  SidebarLayoutProvider,
  useSidebarLayout,
} from "../hooks/useSidebarLayout";
import { SidebarResizeHandle } from "./SidebarResizeHandle";
const originalWidth = window.innerWidth;
function viewport(width: number) {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: width,
  });
}
beforeEach(() => viewport(1200));
afterEach(() => viewport(originalWidth));
function Example() {
  const layout = useSidebarLayout()!;
  return (
    <>
      <button onClick={() => layout.setLeftOpen((open) => !open)}>
        Toggle left
      </button>
      <button onClick={() => layout.setRightOpen((open) => !open)}>
        Toggle right
      </button>
      {layout.leftOpen && (
        <SidebarResizeHandle
          side="left"
          width={layout.leftWidth}
          max={layout.leftMax}
          onResize={layout.setLeftWidth}
        />
      )}
      {layout.rightOpen && (
        <SidebarResizeHandle
          side="right"
          width={layout.rightWidth}
          max={layout.rightMax}
          onResize={layout.setRightWidth}
        />
      )}
    </>
  );
}
function show() {
  return render(
    <SidebarLayoutProvider>
      <Example />
    </SidebarLayoutProvider>
  );
}
it("resizes during dragging and enforces the minimum and half-viewport limit", () => {
  show();
  const divider = screen.getByRole("separator", {
    name: "Resize projects sidebar",
  });
  fireEvent.pointerDown(divider, {
    button: 0,
    clientX: Number(divider.getAttribute("aria-valuenow")),
  });
  fireEvent.pointerMove(divider, { clientX: 500 });
  expect(divider).toHaveAttribute("aria-valuenow", "500");
  fireEvent.pointerMove(divider, { clientX: 1000 });
  expect(divider).toHaveAttribute("aria-valuenow", "600");
  fireEvent.pointerMove(divider, { clientX: 0 });
  expect(divider).toHaveAttribute("aria-valuenow", "200");
  fireEvent.pointerUp(divider);
  expect(document.body.style.cursor).not.toBe("col-resize");
  expect(document.body.style.userSelect).not.toBe("none");
});
it("limits both sidebars to a third when open, and permits half when the opposite sidebar closes", async () => {
  show();
  const user = userEvent.setup();
  const left = screen.getByRole("separator", {
    name: "Resize projects sidebar",
  });
  fireEvent.keyDown(left, { key: "End" });
  expect(left).toHaveAttribute("aria-valuenow", "600");
  await user.click(screen.getByRole("button", { name: "Toggle right" }));
  expect(left).toHaveAttribute("aria-valuenow", "400");
  const right = screen.getByRole("separator", {
    name: "Resize query assistant",
  });
  fireEvent.pointerDown(right, { button: 0, clientX: 800 });
  fireEvent.pointerMove(right, { clientX: 600 });
  expect(right).toHaveAttribute("aria-valuenow", "400");
  fireEvent.pointerUp(right);
  await user.click(screen.getByRole("button", { name: "Toggle left" }));
  expect(right).toHaveAttribute("aria-valuemax", "600");
  fireEvent.keyDown(right, { key: "End" });
  expect(right).toHaveAttribute("aria-valuenow", "600");
  fireEvent.keyDown(right, { key: "Home" });
  expect(right).toHaveAttribute("aria-valuenow", "200");
});
it("recalculates limits when the viewport shrinks and restores text selection if a drag is interrupted", async () => {
  const view = show();
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Toggle right" }));
  const right = screen.getByRole("separator", {
    name: "Resize query assistant",
  });
  fireEvent.keyDown(right, { key: "End" });
  viewport(900);
  fireEvent(window, new Event("resize"));
  expect(right).toHaveAttribute("aria-valuemax", "300");
  expect(right).toHaveAttribute("aria-valuenow", "300");
  fireEvent.pointerDown(right, { button: 0, clientX: 600 });
  expect(document.body.style.cursor).toBe("col-resize");
  view.unmount();
  expect(document.body.style.cursor).not.toBe("col-resize");
  expect(document.body.style.userSelect).not.toBe("none");
});
