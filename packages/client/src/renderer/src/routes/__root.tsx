import { useCallback, useRef } from "react";
import { Button } from "../components/ui/button";
import { Alert, AlertDescription } from "../components/ui/alert";
import { LoadingState } from "../components/LoadingState";
import useElementSize from "../hooks/useElementSize";
import {
  createRootRoute,
  Outlet,
  useNavigate,
  redirect,
  useRouter,
  useRouterState,
  useMatchRoute,
} from "@tanstack/react-router";
import {
  ConnectionBadge,
  ConnectionSelectorContext,
} from "../components/ConnectionBadge";
import NavLink from "../components/NavLink";
import { ProjectQueries } from "../components/ProjectQueries";
import { MainDimensionsContext } from "../hooks/useMainDimensions";
import trpc from "../util/tprc";
import {
  FolderKanban,
  Plus,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { trpcClient } from "../GlobalProviders";
import {
  SidebarLayoutProvider,
  useSidebarLayout,
} from "../hooks/useSidebarLayout";
import { SidebarResizeHandle } from "../components/SidebarResizeHandle";
import { useOpenProject } from "../hooks/useOpenProject";
import {
  WindowToolbarFrame,
  useToolbarSidebarWidth,
} from "../components/WindowToolbar";

export const Route = createRootRoute({
  component: RootFrame,
  beforeLoad: async ({ location }) => {
    if (
      location.pathname === "/" ||
      location.pathname.replace(/\/$/, "") === "/queries" ||
      location.pathname.startsWith("/projects")
    )
      return;
    const { activeProject } = await trpcClient.projects.list.query();
    if (!activeProject) throw redirect({ to: "/projects" });
  },
});

function RootFrame() {
  const hasQueryHeader = useRouterState({
    select: (state) => /^\/queries\/[^/]+\/?$/.test(state.location.pathname),
  });
  const layout = useSidebarLayout();
  const frame = (
    <WindowToolbarFrame hasQueryHeader={hasQueryHeader}>
      <RootLayout />
    </WindowToolbarFrame>
  );
  return layout ? (
    frame
  ) : (
    <SidebarLayoutProvider>{frame}</SidebarLayoutProvider>
  );
}

function RootLayout() {
  const switchGuard = useRef<(() => boolean) | null>(null);
  const registerSwitchGuard = useCallback((canSwitch: () => boolean) => {
    switchGuard.current = canSwitch;
    return () => {
      if (switchGuard.current === canSwitch) switchGuard.current = null;
    };
  }, []);
  const layout = useSidebarLayout()!;
  const projectsCollapsed = !layout.leftOpen;
  const { ref, width, height } = useElementSize();
  const { data: projectsData, error: projectsError } =
    trpc.projects.list.useQuery();
  const activeProject = projectsData?.activeProject;
  useToolbarSidebarWidth(
    projectsData?.projects.length
      ? projectsCollapsed
        ? 48
        : layout.leftWidth
      : 0
  );
  const selectingProject = useRouterState({
    select: (state) => state.location.pathname.startsWith("/projects"),
  });
  const expandedProject = useRouterState({
    select: (state) => state.location.search?.expand,
  });
  const queryScreen = useRouterState({
    select: (state) => state.location.pathname.startsWith("/queries"),
  });
  const router = useRouter();
  const matchRoute = useMatchRoute();
  const opening = useOpenProject();

  const {
    data: savedConnectionsData,
    error: savedConnectionsError,
    refetch: refetchSavedConnections,
  } = trpc.connections.listSavedConnections.useQuery();

  const activeConnection = savedConnectionsData?.connections.find(
    ({ isActive }) => isActive
  );

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

  const {
    mutateAsync: connectToDatabase,
    isPending: isConnecting,
    variables: connectingInput,
    error: connectionError,
  } = trpc.connections.connectToDatabase.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.connections.fetchActiveConnection.invalidate(),
        utils.connections.listSavedConnections.invalidate(),
      ]);
      // Refresh query loaders with the new connection ID so an open query
      // runs against the new environment without navigating away.
      await router.invalidate();
    },
  });

  async function selectConnection(connectionId: string) {
    if (connectionId === activeConnection?.id) {
      return;
    }
    const selectedQuery = matchRoute({ to: "/queries/$queryId" });
    const query =
      selectedQuery ||
      (router.state.location.search?.queryId
        ? { queryId: router.state.location.search.queryId }
        : false);
    if (switchGuard.current?.() === false) return;
    try {
      await connectToDatabase({ connectionId });
    } catch {
      // Keep the current view and draft; the badge/selection screen shows errors.
      return;
    }
    // Reloading the current query is handled by onSuccess's router invalidation.
    // Do not visit the selection screen or add an extra navigation history entry.
    if (selectedQuery) return;
    await navigate(
      query ? { to: "/queries/$queryId", params: query } : { to: "/queries" }
    );
  }

  async function disconnect() {
    await navigate({ to: "/connections" });
    if (router.state.location.pathname.replace(/\/$/, "") === "/connections") {
      disconnectFromDatabase();
    }
  }

  if (projectsError || (!selectingProject && savedConnectionsError)) {
    return (
      <div className="flex h-full items-center justify-center">
        <Alert variant="destructive" className="max-w-lg">
          <AlertDescription>
            {projectsError?.message || savedConnectionsError?.message}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!projectsData || (!selectingProject && !savedConnectionsData)) {
    return <LoadingState />;
  }

  if (projectsData.projects.length === 0)
    return (
      <main ref={ref} className="h-full overflow-auto bg-slate-50">
        <MainDimensionsContext.Provider value={{ width, height }}>
          {opening.error && (
            <Alert variant="destructive" className="mx-auto mt-6 max-w-xl">
              <AlertDescription>{opening.error.message}</AlertDescription>
            </Alert>
          )}
          <Outlet />
        </MainDimensionsContext.Provider>
      </main>
    );

  return (
    <ConnectionSelectorContext.Provider
      value={{
        connections: savedConnectionsData?.connections ?? [],
        isConnecting,
        isBusy: isConnecting || opening.isPending,
        connectingId: connectingInput?.connectionId,
        error: connectionError?.message,
        onSelect: selectConnection,
        onEdit: (connectionId) =>
          navigate({
            to: "/connections/$connectionId",
            params: { connectionId },
          }),
        onCreate: () => {
          const query = matchRoute({ to: "/queries/$queryId" });
          return navigate({
            to: "/connections",
            ...(query
              ? { search: { queryId: query.queryId, create: true } }
              : {}),
          });
        },
        onDisconnect: disconnect,
        registerSwitchGuard,
      }}
    >
      <div className="flex h-full">
        <aside
          aria-label="Projects"
          style={{ width: projectsCollapsed ? 48 : layout.leftWidth }}
          className="relative flex h-full shrink-0 select-none flex-col border-r bg-slate-50"
        >
          <div
            className={`flex h-14 shrink-0 items-center gap-2 border-b text-xs font-semibold text-slate-500 ${
              projectsCollapsed ? "justify-center px-1" : "px-3"
            }`}
          >
            {!projectsCollapsed && (
              <>
                <FolderKanban aria-hidden="true" className="size-4" />
                Projects
              </>
            )}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={`size-7 ${projectsCollapsed ? "" : "ml-auto"}`}
              aria-label={
                projectsCollapsed
                  ? "Expand projects sidebar"
                  : "Collapse projects sidebar"
              }
              title={
                projectsCollapsed
                  ? "Expand projects sidebar"
                  : "Collapse projects sidebar"
              }
              aria-expanded={!projectsCollapsed}
              aria-controls="projects-navigation"
              onClick={() => layout.setLeftOpen((open) => !open)}
            >
              {projectsCollapsed ? (
                <PanelLeftOpen aria-hidden="true" />
              ) : (
                <PanelLeftClose aria-hidden="true" />
              )}
            </Button>
          </div>
          <div
            id="projects-navigation"
            hidden={projectsCollapsed}
            className={
              projectsCollapsed ? "hidden" : "flex min-h-0 flex-1 flex-col"
            }
          >
            <nav
              aria-label="Projects"
              className="min-h-0 flex-1 overflow-y-auto py-2"
            >
              <Button
                variant="ghost"
                className="w-full justify-start gap-3 rounded-none px-3 font-normal"
                disabled={isConnecting || opening.isPending}
                onClick={() => void navigate({ to: "/queries" })}
              >
                <Plus aria-hidden="true" className="size-4" />
                New query
              </Button>
              <ul>
                {projectsData.projects.map(({ id, project }) => (
                  <li key={`${id}:${expandedProject === id}`}>
                    <ProjectQueries
                      projectId={id}
                      project={project}
                      revision={project._rev}
                      active={id === activeProject?._id}
                      hasActiveConnection={!!activeConnection}
                      initiallyExpanded={
                        id === expandedProject || id === activeProject?._id
                      }
                      busy={opening.isPending || isConnecting}
                      onOpenQuery={opening.openProject}
                    />
                  </li>
                ))}
              </ul>
            </nav>
            <NavLink
              to="/projects/new"
              disabled={isConnecting || opening.isPending}
            >
              <Plus aria-hidden="true" />
              New project
            </NavLink>
          </div>
          {!projectsCollapsed && (
            <SidebarResizeHandle
              side="left"
              width={layout.leftWidth}
              max={layout.leftMax}
              onResize={layout.setLeftWidth}
            />
          )}
        </aside>
        <main
          ref={ref}
          className="relative h-full min-w-0 flex-1 overflow-auto"
        >
          <MainDimensionsContext.Provider value={{ width, height }}>
            {!selectingProject && !queryScreen && (
              <div className="flex justify-end border-b bg-white px-5 py-3">
                <ConnectionBadge />
              </div>
            )}
            {opening.error && (
              <Alert variant="destructive" className="m-5">
                <AlertDescription>{opening.error.message}</AlertDescription>
              </Alert>
            )}
            <Outlet />
          </MainDimensionsContext.Provider>
        </main>
      </div>
    </ConnectionSelectorContext.Provider>
  );
}
