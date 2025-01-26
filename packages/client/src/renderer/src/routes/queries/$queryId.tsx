import {
  createFileRoute,
  redirect,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import QueryView from "../../components/QueryView";
import { useCallback, useState } from "react";
import { areQueriesEqual, PreparedQuery, Query } from "@quory/core";
import trpc from "../../util/tprc";
import {
  ActionIcon,
  Button,
  LoadingOverlay,
  TextInput,
  Tooltip,
} from "@mantine/core";
import useMainDimensions from "../../hooks/useMainDimensions";
import { trpcClient } from "../../GlobalProviders";
import { TbTrash } from "react-icons/tb";
import { useFetchSchema } from "@quory/stack/react";
import { useBlocker } from "@tanstack/react-router";
import { AiFillEdit, AiOutlineCheck } from "react-icons/ai";

export const Route = createFileRoute("/queries/$queryId")({
  component: RouteComponent,
  loader: async ({ params }) => {
    const res = await trpcClient.connections.fetchActiveConnection.query();
    if (!res.connection) {
      throw redirect({ to: "/connections" });
    }

    const data = await trpcClient.queries.fetchQuery.query({
      queryId: params.queryId,
    });

    return data;
  },
});

function RouteComponent() {
  const data = Route.useLoaderData();

  const { queryId } = Route.useParams();

  const navigate = useNavigate({
    from: "/queries/$queryId",
  });

  const utils = trpc.useUtils();

  const { mutate: deleteQuery } = trpc.queries.deleteQuery.useMutation({
    onSuccess: () => {
      utils.queries.listSavedQueries.invalidate();
      navigate({ to: "/queries" });
    },
  });

  const { mutate: updateQuery, isPending } =
    trpc.queries.updateQuery.useMutation({
      onSuccess: () => {
        router.invalidate();
      },
    });

  const [query, setQuery] = useState<PreparedQuery | null>(null);

  const { data: schemaData } = useFetchSchema();

  const unsavedChanges = Boolean(
    schemaData &&
      !areQueriesEqual(schemaData.schemas, data.query, query || data.query)
  );

  useBlocker({
    shouldBlockFn: () => {
      if (!unsavedChanges) return false;

      const shouldLeave = confirm(
        "You have made changes to this query. Are you sure you want to leave without saving?"
      );
      return !shouldLeave;
    },
  });

  const [editingNickname, setEditingNickname] = useState(false);
  const [nickname, setNickname] = useState(data.query.nickname);
  const { mutate: updateQueryNickname } =
    trpc.queries.updateQueryNickname.useMutation({
      onSuccess: () => {
        setEditingNickname(false);
        router.invalidate();
        utils.queries.listSavedQueries.invalidate();
      },
      onError: (e) => {
        // TODO: nicer alert
        alert(e.message);
      },
    });

  const router = useRouter();
  const saveChanges = useCallback(async () => {
    if (!data) {
      throw new Error("No data");
    }
    if (!query) {
      throw new Error("No query");
    }
    await updateQuery({ queryId, query, revision: data.query._rev });
  }, [queryId, data, query, updateQuery]);

  const handleDeleteQuery = useCallback(async () => {
    if (!data) {
      throw new Error("No data");
    }
    const confirmed = confirm(
      "This will permanently delete this query. Do you want to proceed?"
    );
    if (confirmed) {
      await deleteQuery({ queryId });
    }
  }, [queryId, data, deleteQuery]);

  const { width: mainWidth, height: mainHeight } = useMainDimensions()!;

  if (!data) {
    return <LoadingOverlay />;
  }

  const topHeight = 50;

  return (
    <>
      <div
        style={{ height: topHeight }}
        className="flex items-center gap-2 bg-slate-300 px-3"
      >
        {editingNickname ? (
          <form className="flex items-center gap-2 px-3 py-1">
            <TextInput
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              className="min-w-[250px] flex-grow"
            />
            <ActionIcon
              type="submit"
              onClick={() =>
                updateQueryNickname({
                  queryId,
                  nickname,
                  revision: data.query._rev,
                })
              }
            >
              <AiOutlineCheck />
            </ActionIcon>
          </form>
        ) : (
          <>
            <h1>{data.query.nickname}</h1>
            <Tooltip label="Edit nickname">
              <ActionIcon
                variant="light"
                onClick={(e) => {
                  e.preventDefault();
                  setEditingNickname(true);
                  setNickname(data.query.nickname);
                }}
              >
                <AiFillEdit />
              </ActionIcon>
            </Tooltip>
          </>
        )}
        <Tooltip disabled={unsavedChanges} label="No changes to save">
          <Button
            className="ml-auto"
            disabled={!unsavedChanges}
            onClick={saveChanges}
            loading={isPending}
          >
            Save changes
          </Button>
        </Tooltip>
        <Button
          color="red"
          rightSection={<TbTrash size={18} />}
          onClick={handleDeleteQuery}
        >
          Delete query
        </Button>
      </div>
      <QueryView
        key={queryId} // when query id changes load new query view
        initialQuery={data.query}
        onQueryChange={setQuery}
        onDeleteQuery={handleDeleteQuery}
        width={mainWidth}
        height={mainHeight - topHeight}
      />
    </>
  );
}
