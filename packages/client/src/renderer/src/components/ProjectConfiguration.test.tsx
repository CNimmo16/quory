import { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import type { DatabaseSchema } from "@quory/core";
import type { ProjectConfiguration } from "../../../shared/projectConfiguration";
import { ProjectConfigurationFields } from "./ProjectConfigurationFields";
import { ProjectConfigurationDialog } from "./ProjectConfigurationDialog";

const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  invalidate: vi.fn(),
  list: vi.fn(),
  configuration: vi.fn(),
}));
vi.mock("@quory/stack/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@quory/stack/react")>()),
  useInvalidateQuory: () => mocks.invalidate,
}));
vi.mock("../util/tprc", () => ({
  default: {
    projects: {
      configuration: {
        useQuery: () => ({
          data: {
            project: {
              _id: "project",
              _rev: "1-project",
              name: "App",
              storage: "database",
              configuration: { inferRelationships: true },
            },
            schemas: [],
            schemaError: null,
          },
        }),
      },
      configure: {
        useMutation: () => ({ mutateAsync: mocks.save, isPending: false }),
      },
    },
    useUtils: () => ({
      projects: {
        list: { invalidate: mocks.list },
        configuration: { invalidate: mocks.configuration },
      },
    }),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.save.mockResolvedValue({ revision: "2-project" });
});

function Fields({
  initial = {},
  schemas = [],
}: {
  initial?: ProjectConfiguration;
  schemas?: DatabaseSchema[];
}) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <ProjectConfigurationFields
        value={value}
        onChange={setValue}
        schemas={schemas}
      />
      <output aria-label="Configuration">{JSON.stringify(value)}</output>
    </>
  );
}

it("adds a complete manual composite relationship and can remove it before saving", async () => {
  const user = userEvent.setup();
  render(<Fields />);
  await user.type(
    screen.getByRole("combobox", { name: "Source table" }),
    "children",
  );
  await user.type(
    screen.getByRole("combobox", { name: "Destination table" }),
    "parents",
  );
  await user.type(
    screen.getByRole("textbox", { name: "Source column 1" }),
    "parent_id",
  );
  await user.type(
    screen.getByRole("textbox", { name: "Destination column 1" }),
    "id",
  );
  await user.click(screen.getByRole("button", { name: "Add column pair" }));
  expect(
    screen.getByRole("button", { name: "Add relationship" }),
  ).toBeDisabled();
  await user.type(
    screen.getByRole("textbox", { name: "Source column 2" }),
    "tenant_id",
  );
  await user.type(
    screen.getByRole("textbox", { name: "Destination column 2" }),
    "tenant_id",
  );
  await user.click(screen.getByRole("button", { name: "Add relationship" }));
  const configuration = JSON.parse(
    screen.getByLabelText("Configuration").textContent!,
  );
  expect(configuration.relationships[0]).toMatchObject({
    constraintId: expect.stringMatching(/^manual:/),
    localTable: "children",
    foreignTable: "parents",
    columnPairs: [
      { localColumn: "parent_id", foreignColumn: "id" },
      { localColumn: "tenant_id", foreignColumn: "tenant_id" },
    ],
  });
  await user.click(screen.getByRole("button", { name: "Remove" }));
  expect(
    JSON.parse(screen.getByLabelText("Configuration").textContent!)
      .relationships,
  ).toEqual([]);
});

it("excludes and restores an inferred relationship using its stable ID", async () => {
  const user = userEvent.setup();
  const schemas: DatabaseSchema[] = [
    {
      name: "public",
      tables: [
        {
          name: "orders",
          columns: [
            {
              name: "user_id",
              dataType: "integer",
              genericDataType: "number",
              isNullable: false,
              includedInPrimaryKey: false,
              foreignKeyReferences: [],
              foreignKeys: [
                {
                  constraintId: "inferred:test",
                  columnPosition: 1,
                  foreignSchemaName: "public",
                  foreignTableName: "users",
                  foreignColumnName: "id",
                  source: "inferred",
                  confidence: 0.9,
                  hasForeignKeyConstraint: false,
                },
              ],
            },
          ],
        },
      ],
    },
  ];
  render(<Fields schemas={schemas} />);
  await user.click(screen.getByRole("button", { name: "Exclude" }));
  expect(
    JSON.parse(screen.getByLabelText("Configuration").textContent!)
      .excludedRelationships,
  ).toEqual(["inferred:test"]);
  await user.click(screen.getByRole("button", { name: "Restore" }));
  expect(
    JSON.parse(screen.getByLabelText("Configuration").textContent!)
      .excludedRelationships,
  ).toEqual([]);
});

it("saves configuration with the project revision and refreshes query metadata", async () => {
  const user = userEvent.setup();
  const close = vi.fn();
  render(<ProjectConfigurationDialog projectId="project" onClose={close} />);
  await user.click(
    screen.getByRole("checkbox", { name: "Require identical data types" }),
  );
  await user.click(screen.getByRole("button", { name: "Save configuration" }));
  await waitFor(() => expect(close).toHaveBeenCalled());
  expect(mocks.save).toHaveBeenCalledWith({
    projectId: "project",
    revision: "1-project",
    configuration: { inferRelationships: { identicalDataTypesOnly: true } },
  });
  expect(mocks.invalidate).toHaveBeenCalledOnce();
  expect(mocks.list).toHaveBeenCalledOnce();
});

it("keeps edits visible when a stale project revision is rejected", async () => {
  const user = userEvent.setup();
  mocks.save.mockRejectedValue(new Error("This project changed."));
  const close = vi.fn();
  render(<ProjectConfigurationDialog projectId="project" onClose={close} />);
  await user.click(
    screen.getByRole("checkbox", {
      name: "Allow relationships across schemas",
    }),
  );
  await user.click(screen.getByRole("button", { name: "Save configuration" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "This project changed.",
  );
  expect(
    screen.getByRole("checkbox", {
      name: "Allow relationships across schemas",
    }),
  ).toBeChecked();
  expect(close).not.toHaveBeenCalled();
});
