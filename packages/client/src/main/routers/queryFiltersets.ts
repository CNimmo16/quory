import { createHash } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { validators } from "@quory/stack/server";
import { z } from "zod";
import { captureFilterset } from "../../shared/queryFiltersets";
import { isSqlQuery } from "../../shared/sqlQuery";
import { savedQueryService } from "../repositories/savedQueryService";
import { queryFiltersetRepo } from "../repositories/queryFiltersetRepo";
import { publicProcedure } from "../util/trpc";

const scope = z.object({
  connectionId: z.string(),
  projectId: z.string(),
  queryId: z.string(),
});
async function assertQuery(input: z.infer<typeof scope>) {
  const context = await savedQueryService.assertConnection(input.connectionId);
  if (context.projectId !== input.projectId)
    throw new TRPCError({
      code: "CONFLICT",
      message: "The active project changed. Reopen this query.",
    });
  const query = await savedQueryService.fetch(context, input.queryId);
  if (isSqlQuery(query))
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Filtersets are available for relationship queries only.",
    });
  return context;
}

export const queryFiltersetProcedures = {
  listFiltersets: publicProcedure.input(scope).query(async ({ input }) => {
    const context = await assertQuery(input);
    const { rows } = await queryFiltersetRepo().allDocs({ include_docs: true });
    await savedQueryService.assertConnection(context);
    return {
      filtersets: rows
        .flatMap(({ doc }) =>
          doc &&
          doc.projectId === context.projectId &&
          doc.queryId === input.queryId
            ? [
                {
                  id: doc._id,
                  name: doc.name,
                  createdAt: doc.createdAt,
                  snapshot: doc.snapshot,
                },
              ]
            : [],
        )
        .sort(
          (a, b) =>
            b.createdAt.localeCompare(a.createdAt) ||
            a.name.localeCompare(b.name),
        ),
    };
  }),
  saveFilterset: publicProcedure
    .input(
      scope.extend({
        name: z.string().trim().min(1, "Enter a filterset name.").max(80),
        query: validators.query,
      }),
    )
    .mutation(async ({ input }) => {
      const context = await assertQuery(input);
      // A deterministic ID also prevents concurrent saves from duplicating a name.
      const id = createHash("sha256")
        .update(
          JSON.stringify([
            context.projectId,
            input.queryId,
            input.name.normalize("NFKC").toLowerCase(),
          ]),
        )
        .digest("hex");
      await savedQueryService.assertConnection(context);
      try {
        savedQueryService.assertCurrent(context);
        await queryFiltersetRepo().put({
          _id: id,
          projectId: context.projectId,
          queryId: input.queryId,
          name: input.name,
          createdAt: new Date().toISOString(),
          snapshot: captureFilterset(input.query),
        });
      } catch (error) {
        if ((error as { status?: number }).status === 409)
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "A filterset with this name already exists. Choose another name.",
          });
        throw error;
      }
      return { id };
    }),
};
