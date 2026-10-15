import {
  createFileRoute,
  redirect,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { useState } from "react";
import {
  MessageSquare,
  Sparkles,
  Folder,
  ChevronDown,
  CircleAlert,
  Check,
} from "lucide-react";
import type { Project } from "../../../../shared/project";
import { Button } from "../../components/ui/button";
import { Hint } from "../../components/Hint";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "../../components/ui/dropdown-menu";
import { Spinner } from "../../components/LoadingState";
import { ConnectionBadge } from "../../components/ConnectionBadge";
import { QueryChatPane, QueryComposer } from "../../components/QueryChat";
import { useQueryChat } from "../../hooks/useQueryChat";
import { useNewQueryDraft } from "../../hooks/useNewQueryDraft";
import trpc from "../../util/tprc";
import { trpcClient } from "../../GlobalProviders";

export const Route = createFileRoute("/queries/")({
  component: RouteComponent,
  loader: async () => {
    const { projects, activeProject } = await trpcClient.projects.list.query();
    if (!projects.length) throw redirect({ to: "/projects" });
    const res = await trpcClient.connections.fetchActiveConnection.query();
    return {
      projects,
      projectId: activeProject?._id,
      connectionId: res.connection?._id ?? "",
      dialect: res.connection?.type ?? "postgres",
    };
  },
});

function RouteComponent() {
  const data = Route.useLoaderData();
  const utils = trpc.useUtils();
  const router = useRouter();
  const opening = trpc.projects.open.useMutation();
  async function selectProject(projectId: string) {
    if (projectId === data.projectId || opening.isPending) return;
    try {
      await opening.mutateAsync({ projectId });
      await Promise.all([
        utils.projects.list.invalidate(),
        utils.projects.listQueries.invalidate(),
        utils.connections.invalidate(),
      ]);
      await router.invalidate();
    } catch {
      // The mutation error is shown alongside the project selector.
    }
  }
  return (
    <QueryLaunch
      key={`${data.projectId ?? ""}:${data.connectionId}`}
      {...data}
      onSelectProject={selectProject}
      selectingProject={opening.isPending}
      projectError={opening.error?.message}
    />
  );
}

function QueryLaunch({
  connectionId,
  projects,
  projectId,
  onSelectProject,
  selectingProject,
  projectError,
}: {
  connectionId: string;
  projects: { id: string; project: Project }[];
  projectId: string | undefined;
  onSelectProject: (id: string) => Promise<void>;
  selectingProject: boolean;
  projectError: string | undefined;
}) {
  const [started, setStarted] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const { draft, setDraft } = useNewQueryDraft();
  const navigate = useNavigate({ from: "/queries" });
  const utils = trpc.useUtils();
  const chat = useQueryChat({
    connectionId,
    onUpsert: async ({ queryId }) => {
      await utils.projects.listQueries.invalidate();
      if (queryId)
        await navigate({ to: "/queries/$queryId", params: { queryId } });
    },
  });
  const disabledReason = selectingProject
    ? "Wait for the project to finish loading."
    : !projectId
    ? "Select a project and connection to create a query."
    : !connectionId
    ? "Select a connection to create a query."
    : undefined;
  return (
    <div className="flex h-full min-h-0">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-auto px-6 py-8">
        <section
          aria-label="Create a new query"
          className="m-auto w-full max-w-2xl space-y-6"
        >
          {!chat.isPending && (
            <div className="space-y-3">
              <Sparkles aria-hidden="true" className="size-7 text-primary" />
              <h1 className="text-2xl font-semibold tracking-tight">
                What would you like to explore?
              </h1>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Describe the records you want, related tables to include,
                columns to show, filters, and sorting. Quory uses your database
                schema and asks when something needs clarification.
              </p>
            </div>
          )}
          {started ? (
            <div
              role={chat.isPending ? "status" : undefined}
              aria-busy={chat.isPending}
              className="flex min-h-64 flex-col items-center justify-center gap-3 text-center"
            >
              {chat.isPending ? (
                <div
                  aria-hidden="true"
                  className="relative mb-2 flex size-16 items-center justify-center"
                >
                  <div className="absolute inset-0 rounded-full border-2 border-primary/15 border-t-primary motion-safe:animate-spin" />
                  <Sparkles className="size-7 text-primary motion-safe:animate-pulse" />
                </div>
              ) : (
                <MessageSquare
                  aria-hidden="true"
                  className="size-8 text-muted-foreground"
                />
              )}
              <h2 className="text-xl font-semibold">
                {chat.isPending
                  ? "Finding the right query"
                  : chat.error
                  ? "Your query hasn’t been created yet"
                  : "Let’s clarify your query"}
              </h2>
              <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
                {chat.isPending
                  ? "Matching your request to the tables and relationships in your database."
                  : chat.error
                  ? "Try again in the query assistant."
                  : "Answer in the query assistant to help Quory choose the right tables and columns."}
              </p>
            </div>
          ) : (
            <QueryComposer
              initial
              draft={draft}
              onDraftChange={setDraft}
              pending={chat.isPending}
              disabledReason={disabledReason}
              onSend={(message) => {
                if (disabledReason) return Promise.resolve(false);
                chat.setDraft(message);
                setDraft("");
                setStarted(true);
                setAssistantOpen(true);
                return chat.send(message);
              }}
              controls={
                <fieldset
                  disabled={selectingProject || chat.isPending}
                  className="flex min-w-0 flex-wrap items-start gap-x-3 gap-y-1 border-0 p-0"
                >
                  <div className="min-w-0">
                    <DropdownMenu>
                      <Hint
                        content={
                          projectError ??
                          (!projectId
                            ? "Select a project to choose its connections."
                            : "Change project")
                        }
                      >
                        <span className="inline-flex">
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={selectingProject || chat.isPending}
                              aria-label={`Project: ${
                                projects.find(({ id }) => id === projectId)
                                  ?.project.name ?? "Choose project"
                              }`}
                              aria-invalid={!projectId || !!projectError}
                              aria-describedby={
                                !projectId || projectError
                                  ? "new-query-project-error"
                                  : undefined
                              }
                              className={`h-8 max-w-full gap-2 rounded-full border border-slate-200 bg-slate-100 px-3 hover:bg-slate-200 ${
                                !projectId ? "text-muted-foreground" : ""
                              }`}
                            >
                              {selectingProject ? (
                                <Spinner className="size-4" />
                              ) : (
                                <Folder
                                  aria-hidden="true"
                                  className="size-4 shrink-0"
                                />
                              )}
                              <span className="max-w-48 truncate">
                                {projects.find(({ id }) => id === projectId)
                                  ?.project.name ?? "Choose project"}
                              </span>
                              {(!projectId || projectError) && (
                                <CircleAlert
                                  aria-hidden="true"
                                  className="size-3.5 text-orange-600"
                                />
                              )}
                              <ChevronDown
                                aria-hidden="true"
                                className="size-3 text-muted-foreground"
                              />
                            </Button>
                          </DropdownMenuTrigger>
                        </span>
                      </Hint>
                      <DropdownMenuContent
                        align="start"
                        aria-label="Projects"
                        className="min-w-56"
                      >
                        {projects.map(({ id, project }) => (
                          <DropdownMenuItem
                            key={id}
                            aria-label={project.name}
                            aria-current={id === projectId ? "true" : undefined}
                            onSelect={() => void onSelectProject(id)}
                          >
                            <Folder
                              aria-hidden="true"
                              className="mr-2 size-4"
                            />
                            <span className="min-w-0 flex-1 truncate">
                              {project.name}
                            </span>
                            {id === projectId && (
                              <Check
                                aria-hidden="true"
                                className="ml-3 size-3.5 text-teal-600"
                              />
                            )}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                    {(!projectId || projectError) && (
                      <p
                        id="new-query-project-error"
                        className={
                          projectError
                            ? "px-2 text-xs text-orange-700"
                            : "sr-only"
                        }
                      >
                        {projectError ?? "Select a project."}
                      </p>
                    )}
                  </div>
                  <div className="min-w-0">
                    <Hint
                      content={
                        !projectId
                          ? "Select a project first."
                          : !connectionId
                          ? "Select the database to run this query against"
                          : "Change connection"
                      }
                    >
                      <span className="inline-flex">
                        <fieldset
                          disabled={!projectId}
                          className="min-w-0 border-0 p-0"
                        >
                          <ConnectionBadge
                            appearance="prompt"
                            invalid={!connectionId}
                            errorId={
                              !connectionId
                                ? "new-query-connection-error"
                                : undefined
                            }
                          />
                        </fieldset>
                      </span>
                    </Hint>
                    {!connectionId && (
                      <p id="new-query-connection-error" className="sr-only">
                        {projectId
                          ? "Select a connection."
                          : "Select a project first."}
                      </p>
                    )}
                  </div>
                </fieldset>
              }
            />
          )}
          {!chat.isPending && (
            <p className="text-xs leading-relaxed text-muted-foreground">
              Your request and database schema are shared with your configured
              AI provider. Row data stays in Quory.
            </p>
          )}
        </section>
      </div>
      <QueryChatPane
        collapsed={!assistantOpen}
        onToggle={() => setAssistantOpen((open) => !open)}
        messages={chat.messages}
        pendingMessage={chat.pendingMessage}
        error={chat.error}
        onSend={(message) =>
          disabledReason ? Promise.resolve(false) : chat.send(message)
        }
        draft={chat.draft}
        onDraftChange={chat.setDraft}
        disabled={!!disabledReason}
      />
    </div>
  );
}
