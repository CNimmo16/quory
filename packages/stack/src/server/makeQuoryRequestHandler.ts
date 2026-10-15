import { cancelAllQueryExecutions } from "./services/QueryExecution";
import routes from "./routes";
import { QuoryRequestHandlerConfig } from "./types";
import * as ClientDatabaseService from "./services/DatabaseService";
import { prepareQuery, type Query, type SqlParameter } from "@quory/core";
import { withQueryExecution } from "./services/QueryExecution";
import { getSchemas } from "@quory/core";
import { z } from "zod";

/** The caller owns this handler and must dispose it when its session ends. */
export default async function makeQuoryRequestHandler(
  config: QuoryRequestHandlerConfig
) {
  const database = await ClientDatabaseService.makeClientDatabase(config);
  let disposed = false;
  let invalidSchema = false;
  let schemaGeneration = 0;
  let refreshing: Promise<typeof database.schemas> | undefined;
  let disposal: Promise<void> | undefined;
  const operations = new Set<Promise<unknown>>();

  function track<T>(operation: () => Promise<T>): Promise<T> {
    if (disposed)
      return Promise.reject(new Error("Database session is disposed."));
    const pending = Promise.resolve().then(operation);
    operations.add(pending);
    void pending.then(
      () => operations.delete(pending),
      () => operations.delete(pending)
    );
    return pending;
  }

  function refresh() {
    if (!refreshing) {
      const generation = schemaGeneration;
      const pending = getSchemas(database.driver).then((schemas) => {
        database.schemas = schemas;
        invalidSchema = generation !== schemaGeneration;
        return schemas;
      });
      refreshing = pending;
      void pending.then(
        () => {
          refreshing = undefined;
        },
        () => {
          refreshing = undefined;
        }
      );
    }
    return refreshing;
  }

  const request = <P extends keyof typeof routes>(body: {
    path: P;
    data: z.infer<(typeof routes)[P]["validate"]>;
  }) =>
    track(async () => {
      if (invalidSchema || refreshing) await (refreshing ?? refresh());
      if (disposed) throw new Error("Database session is disposed.");
      const parsedBody = z
        .object({ path: z.string(), data: z.unknown() })
        .parse(body);
      const route = routes[parsedBody.path as keyof typeof routes];
      if (!route) throw new Error(`No route found for path ${parsedBody.path}`);
      return route.handle({ database }, parsedBody.data);
    });

  return Object.assign(request, {
    compileQuery: (query: Query) =>
      track(async () => {
        if (invalidSchema || refreshing) await (refreshing ?? refresh());
        if (disposed) throw new Error("Database session is disposed.");
        const { sql, parameters } = await prepareQuery(
          database.schemas,
          query,
          database.driver.dialect
        );
        return { sql, parameters, dialect: database.driver.dialect };
      }),
    executeSql: (
      sql: string,
      parameters: SqlParameter[],
      readOnly: boolean,
      executionId: string
    ) =>
      track(() =>
        withQueryExecution(database, executionId, async (signal) => {
          if (!database.driver.execSql)
            throw new Error("This driver does not support custom SQL.");
          const controller = new AbortController();
          const abort = () => controller.abort(signal?.reason);
          signal?.addEventListener("abort", abort, { once: true });
          if (signal?.aborted) abort();
          const timer = setTimeout(
            () => controller.abort(new Error("Query timed out.")),
            15_000
          );
          try {
            return await database.driver.execSql(sql, parameters, {
              readOnly,
              signal: controller.signal,
              timeoutMs: 15_000,
            });
          } finally {
            clearTimeout(timer);
            signal?.removeEventListener("abort", abort);
          }
        })
      ),
    refreshSchema: () =>
      track(() => {
        invalidSchema = true;
        return refresh();
      }),
    invalidateSchema: () => {
      invalidSchema = true;
      ++schemaGeneration;
    },
    dispose: () => {
      disposed = true;
      cancelAllQueryExecutions(database);
      return (disposal ??= (async () => {
        await Promise.allSettled([...operations]);
        await database.driver.teardown();
      })());
    },
  });
}
