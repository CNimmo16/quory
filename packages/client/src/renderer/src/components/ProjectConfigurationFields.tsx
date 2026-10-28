import { useId, useState } from "react";
import {
  getTableRelationships,
  type DatabaseSchema,
  type ManualRelationship,
} from "@quory/core";
import type { ProjectConfiguration } from "../../../shared/projectConfiguration";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

function excludedRelationshipLabel(id: string) {
  try {
    const endpoints: unknown = JSON.parse(id.slice("inferred:".length));
    if (
      Array.isArray(endpoints) &&
      endpoints.length === 6 &&
      endpoints.every((part) => typeof part === "string")
    )
      return `${endpoints[0]}.${endpoints[1]}.${endpoints[2]} → ${endpoints[3]}.${endpoints[4]}.${endpoints[5]}`;
  } catch {
    /* Older or externally supplied IDs may not contain endpoints. */
  }
  return "Previously detected relationship";
}

export function ProjectConfigurationFields({
  value,
  onChange,
  schemas = [],
}: {
  value: ProjectConfiguration;
  onChange: (configuration: ProjectConfiguration) => void;
  schemas?: DatabaseSchema[];
}) {
  const id = useId();
  const inference =
    typeof value.inferRelationships === "object"
      ? value.inferRelationships
      : {};
  const [manual, setManual] = useState({
    localSchema: "public",
    localTable: "",
    foreignSchema: "public",
    foreignTable: "",
    columnPairs: [{ localColumn: "", foreignColumn: "" }],
  });
  const changeInference = (change: Partial<typeof inference>) =>
    onChange({ ...value, inferRelationships: { ...inference, ...change } });
  const inferred = schemas
    .flatMap((schema) =>
      schema.tables.flatMap((table) =>
        getTableRelationships(table, schema.name),
      ),
    )
    .filter((relationship) => relationship.source === "inferred");
  const label = (relationship: ManualRelationship) =>
    `${relationship.localSchema}.${relationship.localTable} (${relationship.columnPairs.map((pair) => pair.localColumn).join(", ")}) → ${relationship.foreignSchema}.${relationship.foreignTable} (${relationship.columnPairs.map((pair) => pair.foreignColumn).join(", ")})`;
  const toggleExcluded = (relationshipId: string) =>
    onChange({
      ...value,
      excludedRelationships: value.excludedRelationships?.includes(
        relationshipId,
      )
        ? value.excludedRelationships.filter((key) => key !== relationshipId)
        : [...(value.excludedRelationships ?? []), relationshipId],
    });
  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Relationship inference</h3>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={!!value.inferRelationships}
            onChange={(event) =>
              onChange({
                ...value,
                inferRelationships: event.target.checked ? {} : false,
              })
            }
          />
          Infer relationships from column names
        </label>
        <p className="text-xs text-muted-foreground">
          Match complete table names and primary keys, such as
          version_image_pkey → version_images.pkey. Inference is off by default.
        </p>
        {!!value.inferRelationships && (
          <div className="space-y-3 rounded-md border p-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={inference.crossSchema ?? false}
                onChange={(event) =>
                  changeInference({ crossSchema: event.target.checked })
                }
              />
              Allow relationships across schemas
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={inference.pluralConversion ?? true}
                onChange={(event) =>
                  changeInference({ pluralConversion: event.target.checked })
                }
              />
              Match singular forms of plural table names
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={inference.identicalDataTypesOnly ?? false}
                onChange={(event) =>
                  changeInference({
                    identicalDataTypesOnly: event.target.checked,
                  })
                }
              />
              Require identical data types
            </label>
            <div className="space-y-1">
              <Label htmlFor={`${id}-ambiguity`}>
                Multiple matching destinations
              </Label>
              <select
                id={`${id}-ambiguity`}
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                value={inference.multipleCandidateBehaviour ?? "skip"}
                onChange={(event) =>
                  changeInference({
                    multipleCandidateBehaviour: event.target.value as
                      "skip" | "error",
                  })
                }
              >
                <option value="skip">Skip ambiguous relationships</option>
                <option value="error">Report an ambiguity error</option>
              </select>
            </div>
          </div>
        )}
        <div className="space-y-1">
          <Label htmlFor={`${id}-confidence`}>
            Minimum relationship confidence
          </Label>
          <Input
            id={`${id}-confidence`}
            type="number"
            min={0}
            max={1}
            step={0.01}
            value={value.minimumRelationshipConfidence ?? 0}
            onChange={(event) =>
              onChange({
                ...value,
                minimumRelationshipConfidence: Number(event.target.value),
              })
            }
          />
          <p className="text-xs text-muted-foreground">
            0–1. Applies to query paths, counts and the assistant. Declared and
            manual relationships score 1; inferred matches score 0.85–0.95.
          </p>
        </div>
      </div>
      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Detected relationships</h3>
        <p className="text-xs text-muted-foreground">
          {schemas.length
            ? "Exclude incorrect matches from this project’s queries."
            : "Connect this project to review inferred relationships."}{" "}
          Exclusions persist when the schema refreshes.
        </p>
        {inferred.map((relationship) => (
          <div
            key={relationship.constraintId}
            className="flex items-center gap-3 rounded-md border p-3"
          >
            <span className="min-w-0 flex-1 break-words text-xs">
              {label(relationship)}
              <span className="block text-muted-foreground">
                Confidence {relationship.confidence?.toFixed(2)}
              </span>
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => toggleExcluded(relationship.constraintId)}
            >
              {value.excludedRelationships?.includes(relationship.constraintId)
                ? "Restore"
                : "Exclude"}
            </Button>
          </div>
        ))}
        {(value.excludedRelationships ?? [])
          .filter(
            (key) =>
              !inferred.some(
                (relationship) => relationship.constraintId === key,
              ),
          )
          .map((key) => (
            <div
              key={key}
              className="flex items-center gap-3 rounded-md border p-3"
            >
              <span className="min-w-0 flex-1 break-all text-xs">
                Excluded: {excludedRelationshipLabel(key)}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => toggleExcluded(key)}
              >
                Restore
              </Button>
            </div>
          ))}
      </div>
      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Manual relationships</h3>
        {(value.relationships ?? []).map((relationship) => (
          <div
            key={relationship.constraintId}
            className="flex items-center gap-3 rounded-md border p-3"
          >
            <span className="min-w-0 flex-1 break-words text-xs">
              {label(relationship)}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                onChange({
                  ...value,
                  relationships: value.relationships!.filter(
                    (key) => key.constraintId !== relationship.constraintId,
                  ),
                })
              }
            >
              Remove
            </Button>
          </div>
        ))}
        <p className="text-xs text-muted-foreground">
          Add compatible column pairs referencing the destination’s complete
          primary key. No database constraint is created.
        </p>
        <div className="grid grid-cols-2 gap-3">
          {(["local", "foreign"] as const).map((side) => (
            <div key={side} className="space-y-2">
              <span className="text-xs font-medium">
                {side === "local" ? "Source" : "Destination"}
              </span>
              {(["Schema", "Table"] as const).map((part) => {
                const key = `${side}${part}` as
                  | "localSchema"
                  | "localTable"
                  | "foreignSchema"
                  | "foreignTable";
                const suggestions =
                  part === "Schema"
                    ? schemas.map((schema) => schema.name)
                    : (schemas
                        .find(
                          (schema) => schema.name === manual[`${side}Schema`],
                        )
                        ?.tables.map((table) => table.name) ?? []);
                return (
                  <div key={key} className="space-y-1">
                    <Label htmlFor={`${id}-${key}`}>
                      {side === "local" ? "Source" : "Destination"}{" "}
                      {part.toLowerCase()}
                    </Label>
                    <Input
                      id={`${id}-${key}`}
                      list={`${id}-${key}-list`}
                      value={manual[key]}
                      onChange={(event) =>
                        setManual({ ...manual, [key]: event.target.value })
                      }
                    />
                    <datalist id={`${id}-${key}-list`}>
                      {suggestions.map((item) => (
                        <option key={item} value={item} />
                      ))}
                    </datalist>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        {manual.columnPairs.map((pair, index) => (
          <div key={index} className="flex items-end gap-2">
            {(["localColumn", "foreignColumn"] as const).map((key) => (
              <div key={key} className="min-w-0 flex-1 space-y-1">
                <Label htmlFor={`${id}-${key}-${index}`}>
                  {key === "localColumn" ? "Source" : "Destination"} column{" "}
                  {index + 1}
                </Label>
                <Input
                  id={`${id}-${key}-${index}`}
                  value={pair[key]}
                  onChange={(event) =>
                    setManual({
                      ...manual,
                      columnPairs: manual.columnPairs.map((item, i) =>
                        i === index
                          ? { ...item, [key]: event.target.value }
                          : item,
                      ),
                    })
                  }
                />
              </div>
            ))}
            {manual.columnPairs.length > 1 && (
              <Button
                type="button"
                variant="ghost"
                onClick={() =>
                  setManual({
                    ...manual,
                    columnPairs: manual.columnPairs.filter(
                      (_, i) => i !== index,
                    ),
                  })
                }
                aria-label={`Remove column pair ${index + 1}`}
              >
                Remove
              </Button>
            )}
          </div>
        ))}
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              setManual({
                ...manual,
                columnPairs: [
                  ...manual.columnPairs,
                  { localColumn: "", foreignColumn: "" },
                ],
              })
            }
          >
            Add column pair
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={
              !manual.localSchema.trim() ||
              !manual.localTable.trim() ||
              !manual.foreignSchema.trim() ||
              !manual.foreignTable.trim() ||
              manual.columnPairs.some(
                (pair) =>
                  !pair.localColumn.trim() || !pair.foreignColumn.trim(),
              )
            }
            onClick={() => {
              onChange({
                ...value,
                relationships: [
                  ...(value.relationships ?? []),
                  {
                    ...manual,
                    constraintId: `manual:${crypto.randomUUID()}`,
                    localSchema: manual.localSchema.trim(),
                    localTable: manual.localTable.trim(),
                    foreignSchema: manual.foreignSchema.trim(),
                    foreignTable: manual.foreignTable.trim(),
                    columnPairs: manual.columnPairs.map((pair) => ({
                      localColumn: pair.localColumn.trim(),
                      foreignColumn: pair.foreignColumn.trim(),
                    })),
                  },
                ],
              });
              setManual({
                ...manual,
                localTable: "",
                foreignTable: "",
                columnPairs: [{ localColumn: "", foreignColumn: "" }],
              });
            }}
          >
            Add relationship
          </Button>
        </div>
      </div>
    </div>
  );
}
