import { useState } from "react";
import { Database, FolderOpen } from "lucide-react";
import trpc from "../util/tprc";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Alert, AlertDescription } from "./ui/alert";
import { Spinner } from "./LoadingState";

export function ProjectForm({
  onCreated,
}: {
  onCreated: (projectId: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [storage, setStorage] = useState<"database" | "folder">("database");
  const [folderPath, setFolderPath] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const create = trpc.projects.create.useMutation();
  const browse = trpc.projects.chooseFolder.useMutation();
  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const result = await create.mutateAsync(
        storage === "folder"
          ? { name: name.trim(), storage, folderPath: folderPath.trim() }
          : { name: name.trim(), storage }
      );
      await onCreated(result.projectId);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not create the project."
      );
    } finally {
      setSubmitting(false);
    }
  }
  return (
    <form
      className="space-y-6"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <fieldset disabled={submitting} className="space-y-6 border-0 p-0">
        <div className="space-y-2">
          <Label htmlFor="project-name">Project name</Label>
          <Input
            id="project-name"
            autoFocus
            required
            maxLength={100}
            placeholder="My application"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <fieldset className="space-y-3">
          <legend className="mb-2 text-sm font-medium">
            Where should queries be stored?
          </legend>
          {(
            [
              {
                value: "database",
                title: "App database",
                description: "Keep queries in Quory’s local database.",
                Icon: Database,
              },
              {
                value: "folder",
                title: "Project folder",
                description:
                  "Share query files with your team alongside your source code.",
                Icon: FolderOpen,
              },
            ] as const
          ).map(({ value, title, description, Icon }) => (
            <label
              key={value}
              className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 ${
                storage === value
                  ? "border-teal-600 bg-teal-50"
                  : "border-slate-200 bg-white"
              }`}
            >
              <input
                type="radio"
                name="query-storage"
                value={value}
                checked={storage === value}
                onChange={() => setStorage(value)}
                className="mt-1 accent-teal-600"
              />
              <Icon
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0 text-slate-500"
              />
              <span>
                <span className="block text-sm font-medium">{title}</span>
                <span className="mt-1 block text-xs leading-relaxed text-slate-500">
                  {description}
                </span>
              </span>
            </label>
          ))}
        </fieldset>
        {storage === "folder" && (
          <div className="space-y-2">
            <Label htmlFor="project-folder">Project folder</Label>
            <div className="flex gap-2">
              <Input
                id="project-folder"
                required
                value={folderPath}
                placeholder="Absolute path to your repository"
                onChange={(event) => setFolderPath(event.target.value)}
              />
              <Button
                type="button"
                variant="outline"
                disabled={browse.isPending}
                onClick={async () => {
                  setError(null);
                  try {
                    const result = await browse.mutateAsync();
                    if (result.path) setFolderPath(result.path);
                  } catch (cause) {
                    setError(
                      cause instanceof Error
                        ? cause.message
                        : "Could not open the folder picker."
                    );
                  }
                }}
              >
                <FolderOpen aria-hidden="true" />
                Browse…
              </Button>
            </div>
            <p className="text-xs leading-relaxed text-slate-500">
              Queries are saved in a .quory folder here. Select an existing
              project folder or its .quory folder to load shared queries.
              Connection details stay on this machine.
            </p>
          </div>
        )}
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <Button
          type="submit"
          disabled={
            submitting ||
            !name.trim() ||
            (storage === "folder" && !folderPath.trim())
          }
          aria-busy={submitting}
        >
          {submitting && <Spinner />}Create project
        </Button>
      </fieldset>
    </form>
  );
}
