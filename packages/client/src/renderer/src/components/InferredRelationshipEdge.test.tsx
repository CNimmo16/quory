import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { prepareQuery, type DatabaseSchema } from "@quory/core";
import type { ComponentProps } from "react";
import TableNavigator from "./TableNavigator";
import { TooltipProvider } from "./ui/tooltip";

const mocks = vi.hoisted(() => ({
  save: vi.fn().mockResolvedValue({}),
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
      list: {
        useQuery: () => ({
          data: {
            activeProject: {
              _id: "project",
              _rev: "1-project",
              configuration: {
                inferRelationships: true,
                minimumRelationshipConfidence: 0.85,
              },
            },
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

it("opens an inferred edge with the keyboard and excludes its exact relationship from the project", async () => {
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
              includedInPrimaryKey: true,
              foreignKeyReferences: [],
              foreignKeys: [
                {
                  constraintId: "inferred:orders-user",
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
        {
          name: "users",
          columns: [
            {
              name: "id",
              dataType: "integer",
              genericDataType: "number",
              isNullable: false,
              includedInPrimaryKey: true,
              foreignKeyReferences: [
                {
                  constraintId: "inferred:orders-user",
                  columnPosition: 1,
                  localSchemaName: "public",
                  localTableName: "orders",
                  localColumnName: "user_id",
                  source: "inferred",
                  confidence: 0.9,
                  hasForeignKeyConstraint: false,
                },
              ],
              foreignKeys: [],
            },
          ],
        },
      ],
    },
  ];
  const { preparedQuery } = await prepareQuery(schemas, {
    base: {
      tableRef: "public.orders",
      select: ["user_id"],
      joins: [{ tableRef: "public.users", select: ["id"] }],
    },
  });
  const joinActions: ComponentProps<typeof TableNavigator>["joinActions"] = (
    alias,
  ) => ({
    join:
      alias === preparedQuery.base.joinAlias
        ? preparedQuery.base
        : preparedQuery.base.joins[0]!,
    getChildren: () => [],
    getParent: () => undefined,
    getVisibleColumns: () =>
      alias === preparedQuery.base.joinAlias ? ["user_id"] : ["id"],
    setSelectedColumns: vi.fn(),
    setCondition: vi.fn(),
    removeCondition: vi.fn(),
    orderBy: vi.fn(),
    removeJoin: vi.fn(),
    addJoin: vi.fn(),
    addJoinOnForeignKey: vi.fn(),
    addJoinOnForeignKeyReference: vi.fn(),
    hasCondition: () => false,
  });
  render(
    <TooltipProvider>
      <TableNavigator
        width={900}
        query={preparedQuery}
        schemas={schemas}
        joinActions={joinActions}
        highlightedJoinAlias={null}
        onChangeHighlightedJoinAlias={vi.fn()}
      />
    </TooltipProvider>,
  );
  const edge = screen.getByRole("button", {
    name: "Configure inferred relationship from public.orders to public.users",
  });
  edge.focus();
  await user.keyboard("{Enter}");
  expect(screen.getByRole("dialog")).toHaveTextContent("Confidence 0.90");
  await user.click(
    screen.getByRole("button", { name: "Exclude relationship" }),
  );
  await waitFor(() =>
    expect(mocks.save).toHaveBeenCalledWith({
      projectId: "project",
      revision: "1-project",
      configuration: {
        inferRelationships: true,
        minimumRelationshipConfidence: 0.85,
        excludedRelationships: ["inferred:orders-user"],
      },
    }),
  );
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(mocks.invalidate).toHaveBeenCalledOnce();
});
