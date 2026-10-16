import { act, renderHook } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import {
  ConditionOperator,
  type PreparedQuery,
  type DatabaseSchema,
} from "@quory/core";
import useQuery from "../../../../../stack/src/react/hooks/useQuery";

const state = vi.hoisted(() => ({ query: null as PreparedQuery | null }));
vi.mock("../../../../../stack/src/react/useQuory", () => ({
  default: () => ({
    data: {
      preparedQuery: state.query,
      visibleJoins: [],
      rows: [],
      count: null,
    },
    isFetching: false,
    refetch: vi.fn(),
  }),
}));
vi.mock("../../../../../stack/src/react/hooks/useFetchSchema", () => ({
  default: () => ({ data: { schemas } }),
}));
const schemas: DatabaseSchema[] = [
  {
    name: "public",
    tables: [
      {
        name: "customers",
        columns: ["id", "name"].map((name) => ({
          name,
          dataType: "text",
          genericDataType: "text",
          isNullable: false,
          includedInPrimaryKey: name === "id",
          foreignKeys: [],
          foreignKeyReferences: [],
        })),
      },
    ],
  },
];

it("turns an ancestor into an implicit join without retaining a primary-key selection or losing descendants", () => {
  const descendant = {
    tableRef: "public.orders",
    joinAlias: "orders",
    select: ["id"],
    resultAliases: {},
    joins: [],
  };
  state.query = {
    base: {
      tableRef: "public.customers",
      joinAlias: "customers",
      select: ["id", "name"],
      resultAliases: {},
      joins: [descendant],
      where: {
        operator: ConditionOperator.AND,
        conditions: [
          {
            column: "name",
            operator: ConditionOperator.EQUALS,
            value: "Alex",
          },
        ],
      },
    },
  };
  const setQuery = vi.fn();
  const { result } = renderHook(() => useQuery(state.query, setQuery));
  act(() => result.current.joinActions("customers").setSelectedColumns([]));
  expect(setQuery).toHaveBeenCalledWith({
    base: { ...state.query.base, select: [] },
  });
  expect(state.query.base.select).toEqual(["id", "name"]);
  expect(setQuery.mock.calls[0]![0].base.joins).toEqual([descendant]);
});
