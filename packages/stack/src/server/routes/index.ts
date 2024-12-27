import { z, ZodType } from "zod";
import * as DatabaseService from "../services/DatabaseService";
import * as QueryService from "../services/QueryService";
import * as validators from "../validators";
import { getEntitiesAndJunctions } from "@quory/core";

type RequestContext = {
  database: DatabaseService.ClientDatabase;
};

function route<R extends ZodType, T>(config: {
  handle: (ctx: RequestContext, request: z.infer<R>) => Promise<T>;
  validate: R;
}) {
  return {
    validate: config.validate,
    handle: async (ctx: RequestContext, request: unknown) => {
      const parsedRequest = config.validate.parse(request);
      return config.handle(ctx, parsedRequest);
    },
  };
}

export const routes = {
  query: route({
    validate: z.object({
      query: validators.query,
    }),
    handle: async function ({ database }, request) {
      const data = await QueryService.fetchDataForQuery(
        database,
        request.query
      );
      const { count } = await QueryService.fetchCountForQuery(
        database,
        request.query
      );

      const { rows, preparedQuery, visibleJoins } = data;

      return {
        originalQuery: request.query,
        preparedQuery,
        visibleJoins,
        rows,
        count,
      };
    },
  }),
  queryCount: route({
    validate: z.object({
      query: validators.query,
    }),
    handle: async function ({ database }, request) {
      const { count, preparedQuery } = await QueryService.fetchCountForQuery(
        database,
        request.query
      );

      return {
        originalQuery: request.query,
        preparedQuery,
        count,
      };
    },
  }),
  schema: {
    validate: z.object({}),
    handle: async function ({ database }) {
      const schemas = database.schemas;

      const entitiesAndJunctions = getEntitiesAndJunctions(schemas);

      return {
        schemas,
        entityTableRefs: entitiesAndJunctions.entities,
        junctionTableRefs: entitiesAndJunctions.junctions,
      };
    },
  },
} satisfies Record<string, ReturnType<typeof route>>;

export type RouterPath = keyof typeof routes;

export type RouterRequest<P extends RouterPath> = z.infer<
  (typeof routes)[P]["validate"]
>;

export type RouterResponse<P extends RouterPath> = Awaited<
  ReturnType<(typeof routes)[P]["handle"]>
>;

export default routes;
