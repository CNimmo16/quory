import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { QueryActionsMenu } from "./QueryActionsMenu";

it("resets confirmation on Escape and reopening, and supports keyboard confirmation", async () => {
  const remove = vi.fn();
  const user = userEvent.setup();
  render(<QueryActionsMenu onRename={vi.fn()} onDelete={remove} />);
  const trigger = screen.getByRole("button", { name: "Query actions" });
  await user.click(trigger);
  await user.click(screen.getByRole("menuitem", { name: "Delete query" }));
  expect(
    screen.getByRole("menuitem", { name: "Confirm delete" }),
  ).toBeVisible();
  await user.keyboard("{Escape}{Escape}");
  expect(remove).not.toHaveBeenCalled();
  await user.click(trigger);
  expect(screen.getByRole("menuitem", { name: "Delete query" })).toBeVisible();
  expect(screen.queryByRole("menuitem", { name: "Confirm delete" })).toBeNull();
  await user.keyboard("{End}{ArrowRight}");
  expect(remove).not.toHaveBeenCalled();
  expect(
    screen.getByRole("menuitem", { name: "Confirm delete" }),
  ).toHaveFocus();
  await user.keyboard("{Enter}");
  expect(remove).toHaveBeenCalledOnce();
});

it("does not allow confirmation after the query becomes busy", async () => {
  const remove = vi.fn();
  const user = userEvent.setup();
  const view = render(<QueryActionsMenu onDelete={remove} />);
  await user.click(screen.getByRole("button", { name: "Query actions" }));
  await user.click(screen.getByRole("menuitem", { name: "Delete query" }));
  view.rerender(<QueryActionsMenu onDelete={remove} disabled />);
  expect(
    screen.getByRole("menuitem", { name: "Confirm delete" }),
  ).toHaveAttribute("aria-disabled", "true");
  await user.click(screen.getByRole("menuitem", { name: "Confirm delete" }));
  expect(remove).not.toHaveBeenCalled();
});
