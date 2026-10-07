import {
  createFileRoute,
  redirect,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import QueryView from "../../components/QueryView";
import { useCallback, useState } from "react";
import { areQueriesEqual, PreparedQuery } from "@quory/core";
import trpc from "../../util/tprc";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Hint } from "../../components/Hint";
import { LoadingState, Spinner } from "../../components/LoadingState";
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
    return <LoadingState />;
  }

  const topHeight = 50;

  return (
    <>
      <div
        style={{ height: topHeight }}
        className="flex items-center gap-2 bg-slate-300 px-3"
      >
        {editingNickname ? (
          <form
            className="flex items-center gap-2 px-3 py-1"
            onSubmit={(event) => {
              event.preventDefault();
              updateQueryNickname({
                queryId,
                nickname,
                revision: data.query._rev,
              });
            }}
          >
            <Input
              aria-label="Query nickname"
              autoFocus
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              className="min-w-[250px] flex-grow"
            />
            <Button type="submit" size="icon" aria-label="Save nickname">
              <AiOutlineCheck />
            </Button>
          </form>
        ) : (
          <>
            <h1>{data.query.nickname}</h1>
            <Hint content="Edit nickname">
              <Button
                size="icon"
                aria-label="Edit nickname"
                variant="secondary"
                onClick={(e) => {
                  e.preventDefault();
                  setEditingNickname(true);
                  setNickname(data.query.nickname);
                }}
              >
                <AiFillEdit />
              </Button>
            </Hint>
          </>
        )}
        <div className="ml-auto">
          <Hint disabled={unsavedChanges} content="No changes to save">
            <Button
              disabled={!unsavedChanges || isPending}
              onClick={saveChanges}
              aria-busy={isPending}
            >
              {isPending && <Spinner />}Save changes
            </Button>
          </Hint>
        </div>
        <Button variant="destructive" onClick={handleDeleteQuery}>
          Delete query <TbTrash aria-hidden="true" />
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
