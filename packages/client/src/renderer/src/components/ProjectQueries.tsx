import { useId, useState } from "react";
import { useMatchRoute } from "@tanstack/react-router";
import {
  ChevronDown,
  ChevronRight,
  FolderKanban,
  Pencil,
  Trash2,
  Settings2,
} from "lucide-react";
import type { Project } from "../../../shared/project";
import trpc from "../util/tprc";
import NavLink, { navigationItemClassName } from "./NavLink";
import { QueryActionsMenuItems } from "./QueryActionsMenu";
import { useSidebarActions } from "../hooks/useSidebarActions";
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
} from "./ui/context-menu";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { LoadingState } from "./LoadingState";
import { Alert, AlertDescription } from "./ui/alert";
import { QueryConnectionMenu } from "./QueryConnectionMenu";
import { QueryConnectionSubmenu } from "./QueryConnectionSubmenu";
import { ProjectConfigurationDialog } from "./ProjectConfigurationDialog";

export function ProjectQueries({
  projectId,
  project,
  revision,
  active = false,
  hasActiveConnection = false,
  initiallyExpanded = active,
  busy = false,
  onExpand,
  onOpenQuery,
}: {
  projectId: string;
  project: Project;
  revision: string;
  active?: boolean;
  hasActiveConnection?: boolean;
  initiallyExpanded?: boolean;
  busy?: boolean;
  onExpand?: () => void;
  onOpenQuery: (
    projectId: string,
    queryId: string,
    connectionId?: string,
  ) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(initiallyExpanded);
  const [configurationOpen, setConfigurationOpen] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const actions = useSidebarActions(projectId, project, revision, active);
  const matchRoute = useMatchRoute();
  const disabled = busy || actions.pending;
  const listId = useId();
  const { data, error } = trpc.projects.listQueries.useQuery(
    { projectId },
    {
      enabled: expanded,
      refetchInterval: expanded && project.storage === "folder" ? 3000 : false,
    },
  );
  const queries = [...(data?.queries ?? [])].sort(
    (a, b) =>
      Number(!!b.query.ephemeral) - Number(!!a.query.ephemeral) ||
      (b.query.modifiedAt ?? 0) - (a.query.modifiedAt ?? 0),
  );
  function queryItem(queryId: string, children: React.ReactNode) {
    return active && hasActiveConnection ? (
      <NavLink
        disabled={disabled}
        to="/queries/$queryId"
        params={{ queryId }}
        className="gap-2 pl-3"
        onClick={(event) => {
          const selected = matchRoute({ to: "/queries/$queryId" });
          if (selected && selected.queryId === queryId) event.preventDefault();
        }}
      >
        {children}
      </NavLink>
    ) : (
      <QueryConnectionMenu
        projectId={projectId}
        disabled={disabled}
        onOpen={(connectionId) => onOpenQuery(projectId, queryId, connectionId)}
      >
        {children}
      </QueryConnectionMenu>
    );
  }
  return (
    <>
      <ContextMenu modal={false}>
        <ContextMenuTrigger asChild disabled={disabled}>
          <button
            type="button"
            className={`${navigationItemClassName} select-none`}
            data-status={active ? "active" : undefined}
            aria-current={active ? "true" : undefined}
            aria-expanded={expanded}
            aria-controls={listId}
            disabled={disabled}
            title={project.directory ?? project.name}
            onClick={() => {
              setExpanded(!expanded);
              if (!expanded) onExpand?.();
            }}
          >
            {expanded ? (
              <ChevronDown aria-hidden="true" className="size-3 shrink-0" />
            ) : (
              <ChevronRight aria-hidden="true" className="size-3 shrink-0" />
            )}
            <FolderKanban aria-hidden="true" className="size-4 shrink-0" />
            <span className="truncate">{project.name}</span>
          </button>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onSelect={() => setConfigurationOpen(true)}>
            <Settings2 aria-hidden="true" />
            Project configuration
          </ContextMenuItem>
          <ContextMenuItem
            onSelect={() =>
              actions.beginRename({ name: project.name, revision })
            }
          >
            <Pencil aria-hidden="true" />
            Rename project
          </ContextMenuItem>
          <ContextMenuItem
            onSelect={() => void actions.remove()}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 aria-hidden="true" />
            Delete project
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      {actions.error && !actions.renameTarget && (
        <Alert variant="destructive" className="mx-2 my-1">
          <AlertDescription>{actions.error}</AlertDescription>
        </Alert>
      )}
      {connectionError && (
        <Alert variant="destructive" className="mx-2 my-1">
          <AlertDescription>{connectionError}</AlertDescription>
        </Alert>
      )}
      {expanded && (
        <ul
          id={listId}
          aria-label={`${project.name} queries`}
          className="ml-5 border-l border-border py-1"
        >
          {error ? (
            <li className="px-3">
              <Alert variant="destructive">
                <AlertDescription>{error.message}</AlertDescription>
              </Alert>
            </li>
          ) : data ? (
            queries.map(({ id, query }) => (
              <li key={id}>
                <ContextMenu modal={false}>
                  <ContextMenuTrigger asChild disabled={disabled}>
                    <div className="select-none">
                      {queryItem(
                        id,
                        <>
                          <span
                            className={`min-w-0 flex-1 truncate ${query.ephemeral ? "text-muted-foreground italic" : ""}`}
                          >
                            {query.nickname || "Unsaved query"}
                          </span>
                          {query.ephemeral && (
                            <span className="rounded-sm border border-dashed px-1 text-[10px] text-muted-foreground">
                              Unsaved
                            </span>
                          )}
                          {query.mode === "sql" && (
                            <span className="rounded-sm border px-1 font-mono text-[10px] font-medium text-primary-emphasis">
                              SQL
                            </span>
                          )}
                        </>,
                      )}
                    </div>
                  </ContextMenuTrigger>
                  <ContextMenuContent>
                    <QueryConnectionSubmenu
                      projectId={projectId}
                      disabled={disabled}
                      onOpen={(connectionId) => {
                        setConnectionError(null);
                        void onOpenQuery(projectId, id, connectionId).catch(
                          (cause) =>
                            setConnectionError(
                              cause instanceof Error
                                ? cause.message
                                : "Could not connect to the database.",
                            ),
                        );
                      }}
                    />
                    <QueryActionsMenuItems
                      menu="context"
                      disabled={disabled}
                      ephemeral={query.ephemeral}
                      onRename={
                        query.ephemeral
                          ? undefined
                          : () =>
                              actions.beginRename({
                                queryId: id,
                                name: query.nickname,
                                revision: query._rev,
                              })
                      }
                      onDelete={() =>
                        void actions.remove({
                          id,
                          nickname: query.nickname || "Unsaved query",
                          ephemeral: query.ephemeral,
                          revision: query._rev,
                        })
                      }
                    />
                  </ContextMenuContent>
                </ContextMenu>
              </li>
            ))
          ) : (
            <li>
              <LoadingState label="Loading saved queries…" />
            </li>
          )}
        </ul>
      )}
      {configurationOpen && (
        <ProjectConfigurationDialog
          projectId={projectId}
          onClose={() => setConfigurationOpen(false)}
        />
      )}
      <Dialog
        open={!!actions.renameTarget}
        onOpenChange={(open) => {
          if (!open && !actions.pending) actions.closeRename();
        }}
      >
        <DialogContent>
          <DialogTitle>
            {actions.renameTarget?.queryId ? "Rename query" : "Rename project"}
          </DialogTitle>
          <DialogDescription>
            Choose a new name for {actions.renameTarget?.name}.
          </DialogDescription>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void actions.saveRename();
            }}
            className="space-y-4"
          >
            <Input
              aria-label="Name"
              autoFocus
              maxLength={100}
              required
              value={actions.name}
              onChange={(event) => actions.setName(event.target.value)}
              disabled={actions.pending}
              className="select-text"
            />
            {actions.error && (
              <Alert variant="destructive">
                <AlertDescription>{actions.error}</AlertDescription>
              </Alert>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={actions.pending}
                onClick={actions.closeRename}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={actions.pending || !actions.name.trim()}
              >
                Save name
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
