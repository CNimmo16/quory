import { useState } from "react";
import { useInvalidateQuory } from "@quory/stack/react";
import type { ProjectConfiguration } from "../../../shared/projectConfiguration";
import trpc from "../util/tprc";
import { ProjectConfigurationFields } from "./ProjectConfigurationFields";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Alert, AlertDescription } from "./ui/alert";
import { LoadingState } from "./LoadingState";
import type { DatabaseSchema } from "@quory/core";
import type { Project } from "../../../shared/project";

export function ProjectConfigurationDialog({
  projectId,
  onClose,
}: {
  projectId: string;
  onClose: () => void;
}) {
  const { data, error } = trpc.projects.configuration.useQuery({ projectId });
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogTitle>Project configuration</DialogTitle>
        <DialogDescription>
          Relationship settings belong to this project and apply to all its
          connections.
        </DialogDescription>
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        ) : data ? (
          <ConfigurationEditor
            key={data.project._rev}
            projectId={projectId}
            data={data}
            onClose={onClose}
          />
        ) : (
          <LoadingState label="Loading project configuration…" />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ConfigurationEditor({
  projectId,
  data,
  onClose,
}: {
  projectId: string;
  data: {
    project: Project & { _rev: string };
    schemas: DatabaseSchema[];
    schemaError: string | null;
  };
  onClose: () => void;
}) {
  const [configuration, setConfiguration] = useState<ProjectConfiguration>(
    data.project.configuration ?? {},
  );
  const [error, setError] = useState<string | null>(null);
  const save = trpc.projects.configure.useMutation();
  const utils = trpc.useUtils();
  const invalidate = useInvalidateQuory();
  return (
    <form
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        void (async () => {
          try {
            await save.mutateAsync({
              projectId,
              revision: data.project._rev,
              configuration,
            });
            await Promise.all([
              utils.projects.list.invalidate(),
              utils.projects.configuration.invalidate(),
              invalidate(),
            ]);
            onClose();
          } catch (cause) {
            setError(
              cause instanceof Error
                ? cause.message
                : "Could not save project configuration.",
            );
          }
        })();
      }}
    >
      <fieldset disabled={save.isPending} className="space-y-5">
        {data.schemaError && (
          <Alert variant="destructive">
            <AlertDescription>{data.schemaError}</AlertDescription>
          </Alert>
        )}
        <ProjectConfigurationFields
          value={configuration}
          onChange={setConfiguration}
          schemas={data.schemas}
        />
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit">Save configuration</Button>
        </DialogFooter>
      </fieldset>
    </form>
  );
}
