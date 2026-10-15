import { createFileRoute, redirect } from "@tanstack/react-router";
import { FolderKanban } from "lucide-react";
import { trpcClient } from "../../GlobalProviders";
import trpc from "../../util/tprc";
import { ProjectForm } from "../../components/ProjectForm";
import { Alert, AlertDescription } from "../../components/ui/alert";
import { LoadingState } from "../../components/LoadingState";
import { useOpenProject } from "../../hooks/useOpenProject";

export const Route = createFileRoute("/projects/")({
  validateSearch: (
    search: Record<string, unknown>
  ): { expand?: string | undefined } => ({
    expand: typeof search.expand === "string" ? search.expand : undefined,
  }),
  beforeLoad: async () => {
    const { projects } = await trpcClient.projects.list.query();
    if (projects.length) throw redirect({ to: "/queries" });
  },
  component: ProjectsScreen,
});

function ProjectsScreen() {
  const { data, error } = trpc.projects.list.useQuery();
  const opening = useOpenProject();
  if (!data)
    return error ? (
      <Alert variant="destructive">
        <AlertDescription>{error.message}</AlertDescription>
      </Alert>
    ) : (
      <LoadingState label="Loading projects…" />
    );
  return (
    <div className="mx-auto flex min-h-full max-w-2xl flex-col justify-center px-8 py-12">
      <FolderKanban aria-hidden="true" className="mb-5 size-9 text-teal-700" />
      <div className="mb-8 space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
          Create your first project
        </h1>
        <p className="max-w-lg text-sm leading-relaxed text-slate-500">
          Keep a set of queries together and run them against local, staging, or
          production connections.
        </p>
      </div>
      {opening.error && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{opening.error.message}</AlertDescription>
        </Alert>
      )}
      <ProjectForm onCreated={opening.showCreatedProject} />
    </div>
  );
}
