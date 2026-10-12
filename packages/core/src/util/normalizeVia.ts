export type ViaTableStep = {
  tableRef: string;
} & (
  | {
      fromColumnName?: string | undefined;
      toColumnName?: string | undefined;
      usingConstraintId?: never;
    }
  | { usingConstraintId: string; fromColumnName?: never; toColumnName?: never }
);

export type ViaStep = string | ViaTableStep;

/** Expand shorthand before validating or planning any route. */
export default function normalizeVia(via: ViaStep[] = []): ViaTableStep[] {
  return via.map((item) => {
    const step = typeof item === "string" ? { tableRef: item } : item;
    if (!step || typeof step.tableRef !== "string" || !step.tableRef.length) {
      throw new Error("Each via step must specify a tableRef.");
    }
    for (const field of [
      "fromColumnName",
      "toColumnName",
      "usingConstraintId",
    ] as const) {
      if (
        step[field] !== undefined &&
        (typeof step[field] !== "string" || !step[field]!.length)
      ) {
        throw new Error(`via.${field} must be a non-empty string.`);
      }
    }
    if (
      step.usingConstraintId !== undefined &&
      (step.fromColumnName !== undefined || step.toColumnName !== undefined)
    ) {
      throw new Error(
        "A via step can specify usingConstraintId or column names, not both."
      );
    }
    return {
      tableRef: step.tableRef,
      ...(step.fromColumnName !== undefined
        ? { fromColumnName: step.fromColumnName }
        : {}),
      ...(step.toColumnName !== undefined
        ? { toColumnName: step.toColumnName }
        : {}),
      ...(step.usingConstraintId !== undefined
        ? { usingConstraintId: step.usingConstraintId }
        : {}),
    } as ViaTableStep;
  });
}
