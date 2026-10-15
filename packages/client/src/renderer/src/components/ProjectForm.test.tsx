import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { ProjectForm } from "./ProjectForm";

const mocks = vi.hoisted(() => ({ create: vi.fn(), browse: vi.fn() }));
vi.mock("../util/tprc", () => ({
  default: {
    projects: {
      create: { useMutation: () => ({ mutateAsync: mocks.create }) },
      chooseFolder: {
        useMutation: () => ({ mutateAsync: mocks.browse, isPending: false }),
      },
    },
  },
}));
beforeEach(() => {
  vi.resetAllMocks();
  mocks.create.mockResolvedValue({ projectId: "project-1" });
});

it("creates an app database project and opens it", async () => {
  const user = userEvent.setup();
  const open = vi.fn().mockResolvedValue(undefined);
  render(<ProjectForm onCreated={open} />);
  expect(screen.getByRole("button", { name: "Create project" })).toBeDisabled();
  expect(screen.queryByRole("textbox", { name: "Project folder" })).toBeNull();
  await user.type(
    screen.getByRole("textbox", { name: "Project name" }),
    "Orders app"
  );
  await user.click(screen.getByRole("button", { name: "Create project" }));
  await waitFor(() => expect(open).toHaveBeenCalledWith("project-1"));
  expect(mocks.create).toHaveBeenCalledWith({
    name: "Orders app",
    storage: "database",
  });
});

it("accepts a typed folder or the native picker selection and imports that folder", async () => {
  const user = userEvent.setup();
  const open = vi.fn().mockResolvedValue(undefined);
  mocks.browse.mockResolvedValue({ path: "/repo/.quory" });
  render(<ProjectForm onCreated={open} />);
  await user.type(
    screen.getByRole("textbox", { name: "Project name" }),
    "Team app"
  );
  await user.click(screen.getByRole("radio", { name: /Project folder/ }));
  expect(screen.getByRole("button", { name: "Create project" })).toBeDisabled();
  await user.type(
    screen.getByRole("textbox", { name: "Project folder" }),
    "/typed/repo"
  );
  expect(screen.getByRole("button", { name: "Create project" })).toBeEnabled();
  await user.click(screen.getByRole("button", { name: "Browse…" }));
  expect(screen.getByRole("textbox", { name: "Project folder" })).toHaveValue(
    "/repo/.quory"
  );
  await user.click(screen.getByRole("button", { name: "Create project" }));
  await waitFor(() => expect(open).toHaveBeenCalledWith("project-1"));
  expect(mocks.create).toHaveBeenCalledWith({
    name: "Team app",
    storage: "folder",
    folderPath: "/repo/.quory",
  });
});

it("preserves a typed path when browsing is cancelled and displays file errors", async () => {
  const user = userEvent.setup();
  mocks.browse.mockResolvedValue({ path: null });
  mocks.create.mockRejectedValue(new Error("Could not read query broken.json"));
  const open = vi.fn();
  render(<ProjectForm onCreated={open} />);
  await user.type(
    screen.getByRole("textbox", { name: "Project name" }),
    "Team app"
  );
  await user.click(screen.getByRole("radio", { name: /Project folder/ }));
  await user.type(
    screen.getByRole("textbox", { name: "Project folder" }),
    "/repo"
  );
  await user.click(screen.getByRole("button", { name: "Browse…" }));
  expect(screen.getByRole("textbox", { name: "Project folder" })).toHaveValue(
    "/repo"
  );
  await user.click(screen.getByRole("button", { name: "Create project" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("broken.json");
  expect(open).not.toHaveBeenCalled();
});
