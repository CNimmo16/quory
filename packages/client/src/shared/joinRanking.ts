import { z } from "zod";

const tableRef = z.string().min(1).max(1024);
export const joinRankingRequestSchema = z
  .object({
    kind: z.enum(["tables", "paths", "columns"]),
    sourceTable: tableRef,
    targetTable: tableRef.optional(),
    joinedTables: z.array(tableRef).max(32),
    selectedColumns: z
      .array(
        z.object({
          tableRef,
          columns: z.array(z.string().min(1).max(1024)).max(32),
        }),
      )
      .max(32)
      .optional(),
    joinPath: z.string().max(12000).optional(),
    candidates: z
      .array(
        z.object({
          id: z.string().min(1).max(4096),
          description: z.string().min(1).max(12000),
        }),
      )
      .min(1)
      .max(32),
  })
  .superRefine((request, ctx) => {
    if (
      new Set(request.candidates.map(({ id }) => id)).size !==
      request.candidates.length
    )
      ctx.addIssue({
        code: "custom",
        message: "Candidate IDs must be unique.",
      });
    if (
      (request.kind === "paths" || request.kind === "columns") &&
      !request.targetTable
    )
      ctx.addIssue({
        code: "custom",
        message: "A destination table is required.",
      });
  });
export type JoinRankingRequest = z.infer<typeof joinRankingRequestSchema>;
