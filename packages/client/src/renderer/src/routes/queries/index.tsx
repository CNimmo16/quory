import {
  Alert,
  Button,
  Container,
  InputLabel,
  LoadingOverlay,
  Select,
  Stack,
} from "@mantine/core";
import { useFetchSchema } from "@quory/stack/react";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import useMainDimensions from "../../hooks/useMainDimensions";
import { useState } from "react";
import trpc from "../../util/tprc";
import { trpcClient } from "../../GlobalProviders";

export const Route = createFileRoute("/queries/")({
  component: RouteComponent,
  loader: async () => {
    const res = await trpcClient.connections.fetchActiveConnection.query();
    if (!res.connection) {
      throw redirect({ to: "/connections" });
    }
  },
});

function RouteComponent() {
  const { data: schemaData } = useFetchSchema();

  const { width: mainWidth, height: mainHeight } = useMainDimensions()!;

  const [baseTableRef, setBaseTableRef] = useState<string | null>(null);

  const navigate = useNavigate({
    from: "/queries",
  });

  const utils = trpc.useUtils();

  const {
    isPending,
    error,
    mutate: createQuery,
  } = trpc.queries.createQuery.useMutation({
    onSuccess: ({ queryId }) => {
      utils.queries.listSavedQueries.invalidate();
      navigate({ to: `/queries/$queryId`, params: { queryId } });
    },
  });

  const dropdownOpen = !baseTableRef;

  if (!schemaData) {
    return <LoadingOverlay />;
  }

  return (
    <form
      onSubmit={(e) => {
        if (!baseTableRef) {
          return;
        }
        e.preventDefault();
        createQuery({
          query: {
            base: {
              tableRef: baseTableRef,
              select: "*",
              joins: [],
            },
            limit: 100,
          },
        });
      }}
    >
      <Container h={mainHeight - 200} w={Math.min(mainWidth, 1000)} pt={70}>
        <Stack>
          <InputLabel>Choose a table to start from</InputLabel>
          <Select
            data={schemaData.schemas.map((schema) => {
              return {
                group: schema.name,
                items: schema.tables.map((table) => ({
                  label: table.name,
                  value: `${schema.name}.${table.name}`,
                })),
              };
            })}
            dropdownOpened={dropdownOpen}
            className="w-full"
            maxDropdownHeight={mainHeight - 300}
            value={baseTableRef}
            onChange={setBaseTableRef}
            multiple={false}
            searchable
            placeholder="Select a table"
          />
          {error && <Alert color="red">{error.message}</Alert>}
          <Button type="submit" loading={isPending} disabled={!baseTableRef}>
            Go
          </Button>
        </Stack>
      </Container>
    </form>
  );
}
