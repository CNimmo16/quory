import { useState, type ComponentProps } from "react";
import {
  TableNavigator as Navigator,
  useInvalidateQuory,
} from "@quory/stack/react";
import type { RelationshipConstraint } from "@quory/core";
import trpc from "../util/tprc";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Alert, AlertDescription } from "./ui/alert";

export default function TableNavigator(
  props: ComponentProps<typeof Navigator>,
) {
  const [selected, setSelected] = useState<RelationshipConstraint | null>(null);
  return (
    <>
      <Navigator {...props} onRelationshipClick={setSelected} />
      {selected && (
        <ExcludeRelationship
          relationship={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}

function ExcludeRelationship({
  relationship,
  onClose,
}: {
  relationship: RelationshipConstraint;
  onClose: () => void;
}) {
  const { data } = trpc.projects.list.useQuery();
  const save = trpc.projects.configure.useMutation();
  const utils = trpc.useUtils();
  const invalidate = useInvalidateQuory();
  const [error, setError] = useState<string | null>(null);
  const project = data?.activeProject;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !save.isPending) onClose();
      }}
    >
      <DialogContent>
        <DialogTitle>Inferred relationship</DialogTitle>
        <DialogDescription>
          {relationship.localSchema}.{relationship.localTable} (
          {relationship.columnPairs.map((pair) => pair.localColumn).join(", ")})
          → {relationship.foreignSchema}.{relationship.foreignTable} (
          {relationship.columnPairs
            .map((pair) => pair.foreignColumn)
            .join(", ")}
          ). Confidence {relationship.confidence?.toFixed(2)}.
        </DialogDescription>
        <p className="text-sm text-muted-foreground">
          Exclude this relationship if it was detected incorrectly. Queries
          using it will need another relationship path. You can restore it in
          project configuration.
        </p>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <DialogFooter>
          <Button variant="outline" disabled={save.isPending} onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!project || save.isPending}
            onClick={() => {
              if (!project) return;
              setError(null);
              void (async () => {
                try {
                  await save.mutateAsync({
                    projectId: project._id,
                    revision: project._rev,
                    configuration: {
                      ...project.configuration,
                      excludedRelationships: [
                        ...new Set([
                          ...(project.configuration?.excludedRelationships ??
                            []),
                          relationship.constraintId,
                        ]),
                      ],
                    },
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
                      : "Could not exclude relationship.",
                  );
                }
              })();
            }}
          >
            Exclude relationship
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
