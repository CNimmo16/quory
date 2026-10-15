import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { ProjectForm } from "../../components/ProjectForm";
import { Button } from "../../components/ui/button";
import { useOpenProject } from "../../hooks/useOpenProject";

export const Route = createFileRoute("/projects/new")({
  component: NewProjectScreen,
});
function NewProjectScreen() {
  const navigate = useNavigate();
  const router = useRouter();
  const { showCreatedProject } = useOpenProject();
  return (
    <div className="mx-auto max-w-xl px-8 py-12">
      <Button
        variant="ghost"
        className="mb-6"
        onClick={() => {
          if (router.history.canGoBack()) router.history.back();
          else void navigate({ to: "/projects", replace: true });
        }}
      >
        <ArrowLeft aria-hidden="true" />
        Back
      </Button>
      <h1 className="mb-3 text-2xl font-semibold">New project</h1>
      <p className="mb-8 text-sm text-slate-500">
        Choose where to store the queries shared by this project’s connections.
      </p>
      <ProjectForm onCreated={showCreatedProject} />
    </div>
  );
}
