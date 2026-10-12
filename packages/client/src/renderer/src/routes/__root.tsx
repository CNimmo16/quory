import { Alert, AlertDescription } from "../components/ui/alert";
import { LoadingState } from "../components/LoadingState";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import useElementSize from "../hooks/useElementSize";
import {
  createRootRoute,
  Outlet,
  useMatchRoute,
  useNavigate,
} from "@tanstack/react-router";
import { AiOutlinePlus, AiOutlinePoweroff } from "react-icons/ai";
import { BsDatabaseFillGear } from "react-icons/bs";
import NavLink, { navigationItemClassName } from "../components/NavLink";
import { MainDimensionsContext } from "../hooks/useMainDimensions";
import trpc from "../util/tprc";
import { TbPlus } from "react-icons/tb";

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  const { ref, width, height } = useElementSize();

  const {
    data: savedConnectionsData,
    error: savedConnectionsError,
    refetch: refetchSavedConnections,
  } = trpc.connections.listSavedConnections.useQuery();

  const activeConnection = savedConnectionsData?.connections.find(
    ({ isActive }) => isActive
  );

  const { data: savedQueriesData, error: savedQueriesError } =
    trpc.queries.listSavedQueries.useQuery(undefined, {
      enabled: !!activeConnection,
    });

  const navigate = useNavigate();

  const utils = trpc.useUtils();

  const { mutate: disconnectFromDatabase } =
    trpc.connections.disconnectFromDatabase.useMutation({
      onSuccess: () => {
        refetchSavedConnections();
        utils.connections.fetchActiveConnection.invalidate();
        navigate({ to: "/connections" });
      },
      onError: () => {
        // TODO: nicer error alert
        alert("Could not disconnect from database");
      },
    });

  const { mutate: connectToDatabase } =
    trpc.connections.connectToDatabase.useMutation({
      onSuccess: () => {
        utils.connections.fetchActiveConnection.invalidate();
        utils.connections.listSavedConnections.invalidate();
        navigate({ to: "/queries" });
      },
    });

  const matchRoute = useMatchRoute();

  if (savedConnectionsError || savedQueriesError) {
    return (
      <div className="flex h-full items-center justify-center">
        <Alert variant="destructive" className="max-w-lg">
          <AlertDescription>
            {savedConnectionsError?.message || savedQueriesError?.message}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!savedConnectionsData) {
    return <LoadingState />;
  }

  return (
    <div className="flex h-full border-t">
      <aside
        className="flex h-full w-[300px] shrink-0 flex-col border-r bg-background"
        aria-label="Sidebar"
      >
        <nav
          className="flex min-h-0 flex-1 flex-col overflow-y-auto"
          aria-label={activeConnection ? "Queries" : "Connections"}
        >
          {activeConnection ? (
            <>
              <NavLink to="/queries" activeOptions={{ exact: true }}>
                <AiOutlinePlus aria-hidden="true" />
                New query
              </NavLink>
              {savedQueriesData ? (
                savedQueriesData.queries.map(({ id, query }) => (
                  <NavLink
                    key={id}
                    to="/queries/$queryId"
                    params={{ queryId: id }}
                  >
                    {query.nickname}
                  </NavLink>
                ))
              ) : (
                <LoadingState label="Loading saved queries…" />
              )}
            </>
          ) : (
            <>
              <NavLink to="/connections" activeOptions={{ exact: true }}>
                <TbPlus aria-hidden="true" />
                New connection
              </NavLink>
              {savedConnectionsData.connections.map(
                ({ id: connectionId, connection }) => {
                  const active = !!matchRoute({
                    to: "/connections/$connectionId",
                    params: { connectionId },
                  });
                  return (
                    <button
                      key={connectionId}
                      type="button"
                      className={navigationItemClassName}
                      data-status={active ? "active" : undefined}
                      aria-current={active ? "page" : undefined}
                      onDoubleClick={() => connectToDatabase({ connectionId })}
                      onClick={() =>
                        navigate({
                          to: "/connections/$connectionId",
                          params: { connectionId },
                        })
                      }
                    >
                      <span className="min-w-0">
                        <span className="block truncate">
                          {connection.nickname}
                        </span>
                        {active && (
                          <span className="block text-xs text-muted-foreground">
                            Double click to connect
                          </span>
                        )}
                      </span>
                    </button>
                  );
                }
              )}
            </>
          )}
        </nav>
        {activeConnection && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={navigationItemClassName}
                aria-label="Connection options"
              >
                <BsDatabaseFillGear className="shrink-0" aria-hidden="true" />
                <span className="flex min-w-0 flex-1 justify-between gap-2">
                  <span className="truncate">{activeConnection.id}</span>
                  <span className="text-muted-foreground">
                    ({activeConnection.connection.type})
                  </span>
                </span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start">
              <DropdownMenuLabel>{activeConnection.id}</DropdownMenuLabel>
              <DropdownMenuItem onSelect={() => disconnectFromDatabase()}>
                <AiOutlinePoweroff />
                Disconnect
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </aside>
      <main ref={ref} className="relative h-full min-w-0 flex-1 overflow-auto">
        <MainDimensionsContext.Provider value={{ width, height }}>
          <Outlet />
        </MainDimensionsContext.Provider>
      </main>
    </div>
  );
}
