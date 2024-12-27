import useQuory from "../useQuory";

export default function useFetchSchema() {
  const { data, isLoading, error } = useQuory("schema", {});

  return {
    data: data
      ? {
          ...data,
          tables: data.schemas.flatMap((schema) =>
            schema.tables.map((table) => ({
              ...table,
              schemaName: schema.name,
            }))
          ),
        }
      : null,
    isLoading,
    error,
  };
}
