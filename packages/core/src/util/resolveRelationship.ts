import type { DatabaseSchema, RelationshipConstraint } from "..";
import findTableFromSchemas from "./findTableFromSchemas";
import splitTableRef from "./splitTableRef";
import getTableRelationships from "./getTableRelationships";
import type { ViaTableStep } from "./normalizeVia";

export type ResolvedRelationship = {
  relationship: RelationshipConstraint;
  forward: boolean;
  identity: string;
  step: ViaTableStep;
};

export default function resolveRelationship(
  schemas: DatabaseSchema[],
  fromRef: string,
  step: ViaTableStep,
): ResolvedRelationship {
  const [fromSchema, fromTable] = splitTableRef(fromRef);
  const [toSchema, toTable] = splitTableRef(step.tableRef);
  const from = findTableFromSchemas(schemas, fromSchema, fromTable);
  const to = findTableFromSchemas(schemas, toSchema, toTable);
  const candidates = [
    ...getTableRelationships(from, fromSchema)
      .filter(
        (ref) => ref.foreignSchema === toSchema && ref.foreignTable === toTable,
      )
      .map((relationship) => ({ relationship, forward: true })),
    ...getTableRelationships(to, toSchema)
      .filter(
        (ref) =>
          ref.foreignSchema === fromSchema && ref.foreignTable === fromTable,
      )
      .map((relationship) => ({ relationship, forward: false })),
  ];
  const matches = candidates.filter(({ relationship, forward }) => {
    if (step.usingConstraintId !== undefined)
      return relationship.constraintId === step.usingConstraintId;
    return relationship.columnPairs.some(
      (pair) =>
        (step.fromColumnName === undefined ||
          step.fromColumnName ===
            (forward ? pair.localColumn : pair.foreignColumn)) &&
        (step.toColumnName === undefined ||
          step.toColumnName ===
            (forward ? pair.foreignColumn : pair.localColumn)),
    );
  });
  const available = candidates
    .map(
      ({ relationship, forward }) =>
        `${relationship.constraintId} (${relationship.localSchema}.${
          relationship.localTable
        }; ${relationship.columnPairs
          .map((pair) =>
            forward
              ? `${pair.localColumn} → ${pair.foreignColumn}`
              : `${pair.foreignColumn} → ${pair.localColumn}`,
          )
          .join(", ")})`,
    )
    .join("; ");
  const guidance =
    step.usingConstraintId !== undefined
      ? "The constraint ID matches multiple directions; use fromColumnName and/or toColumnName instead."
      : step.fromColumnName !== undefined && step.toColumnName !== undefined
        ? "Use usingConstraintId instead of column names to distinguish constraints sharing this pair."
        : step.fromColumnName !== undefined
          ? "Add toColumnName or replace the column selector with usingConstraintId."
          : step.toColumnName !== undefined
            ? "Add fromColumnName or replace the column selector with usingConstraintId."
            : "Specify fromColumnName, toColumnName, or usingConstraintId to uniquely identify a constraint.";
  if (matches.length !== 1) {
    throw new Error(
      matches.length > 1
        ? `Multiple relationships connect ${fromRef} and ${step.tableRef}. ${guidance} Apply the selector on the via step for ${step.tableRef}. Available relationships: ${available}`
        : `No relationship matches the via step from ${fromRef} to ${
            step.tableRef
          }. Check fromColumnName, toColumnName, or usingConstraintId. Available relationships: ${
            available || "none"
          }`,
    );
  }
  const match = matches[0]!;
  return {
    ...match,
    step,
    identity: JSON.stringify([
      match.relationship.localSchema,
      match.relationship.localTable,
      match.relationship.constraintId,
      match.forward,
    ]),
  };
}
