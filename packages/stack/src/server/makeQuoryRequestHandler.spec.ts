import makeQuoryRequestHandler from "./makeQuoryRequestHandler";
import { makeClientDatabase } from "./services/DatabaseService";
import { getSchemas } from "@quory/core";
import routes from "./routes";
import { withQueryExecution } from "./services/QueryExecution";
import type { DatabaseSchema } from "@quory/core";

jest.mock("./services/DatabaseService", () => ({
  makeClientDatabase: jest.fn(),
}));
jest.mock("@quory/core", () => ({
  ...jest.requireActual("@quory/core"),
  getSchemas: jest.fn(),
}));
jest.mock("./routes", () => ({
  __esModule: true,
  default: { schema: { handle: jest.fn() } },
}));

const teardown = jest.fn();
const config = {
  database: { type: "sqlite" as const, hostOrFilePath: ":memory:" },
};
beforeEach(() => {
  jest.resetAllMocks();
  teardown.mockResolvedValue(undefined);
  jest
    .mocked(makeClientDatabase)
    .mockResolvedValue({ driver: { teardown } as never, schemas: [] });
  jest
    .mocked(routes.schema.handle)
    .mockImplementation(async ({ database }) => ({
      schemas: database.schemas,
      entityTableRefs: [],
      junctionTableRefs: [],
    }));
});

it("drains accepted requests, rejects new work and disposes exactly once", async () => {
  let release!: () => void;
  const work = new Promise<void>((resolve) => {
    release = resolve;
  });
  jest.mocked(routes.schema.handle).mockImplementation(async () => {
    await work;
    return { schemas: [], entityTableRefs: [], junctionTableRefs: [] };
  });
  const handler = await makeQuoryRequestHandler(config);
  const request = handler({ path: "schema", data: {} });
  await Promise.resolve(); // Let accepted work enter the route.
  const dispose = handler.dispose();
  expect(handler.dispose()).toBe(dispose);
  await expect(handler({ path: "schema", data: {} })).rejects.toThrow(
    "disposed",
  );
  expect(teardown).not.toHaveBeenCalled();
  release();
  await request;
  await dispose;
  expect(teardown).toHaveBeenCalledTimes(1);
});

it("refreshes schema without replacing the driver and retries failed invalidation", async () => {
  const handler = await makeQuoryRequestHandler(config);
  jest.mocked(getSchemas).mockRejectedValueOnce(new Error("metadata failed"));
  handler.invalidateSchema();
  await expect(handler({ path: "schema", data: {} })).rejects.toThrow(
    "metadata failed",
  );
  const schemas = [{ name: "updated", tables: [] }];
  jest.mocked(getSchemas).mockResolvedValue(schemas);
  expect(await handler({ path: "schema", data: {} })).toMatchObject({
    schemas,
  });
  expect(getSchemas).toHaveBeenCalledTimes(2);
  expect(teardown).not.toHaveBeenCalled();
  await handler.dispose();
});

it("reloads project options on refresh and applies the threshold while keeping inspection unfiltered", async () => {
  let minimum = 0.9;
  const schemaOptions = jest.fn(async () => ({
    inferRelationships: true,
    minimumRelationshipConfidence: minimum,
    excludedRelationships: ["inferred:excluded"],
  }));
  const schemas: DatabaseSchema[] = [
    {
      name: "public",
      tables: [
        {
          name: "orders",
          columns: [
            {
              name: "user_id",
              dataType: "integer",
              genericDataType: "number",
              isNullable: false,
              includedInPrimaryKey: false,
              foreignKeyReferences: [],
              foreignKeys: [
                {
                  constraintId: "inferred:users",
                  columnPosition: 1,
                  foreignSchemaName: "public",
                  foreignTableName: "users",
                  foreignColumnName: "id",
                  hasForeignKeyConstraint: false,
                  source: "inferred",
                  confidence: 0.9,
                },
              ],
            },
          ],
        },
      ],
    },
  ];
  jest.mocked(getSchemas).mockResolvedValue(schemas);
  const handler = await makeQuoryRequestHandler({ ...config, schemaOptions });
  expect(
    (await handler.refreshSchema())[0]!.tables[0]!.columns[0]!.foreignKeys,
  ).toHaveLength(1);
  minimum = 0.91;
  handler.invalidateSchema();
  const response = await handler({ path: "schema", data: {} });
  if (!("schemas" in response)) throw new Error("Expected schema response");
  expect(response.schemas[0]!.tables[0]!.columns[0]!.foreignKeys).toEqual([]);
  expect(await handler.inspectRelationships()).toEqual(schemas);
  expect(getSchemas).toHaveBeenLastCalledWith(
    expect.anything(),
    expect.objectContaining({
      minimumRelationshipConfidence: 0.91,
      excludedRelationships: [],
    }),
  );
  expect(makeClientDatabase).toHaveBeenCalledTimes(1);
  await handler.dispose();
});

it("deduplicates concurrent refresh and waits for it during disposal", async () => {
  let release!: (schemas: []) => void;
  jest.mocked(getSchemas).mockReturnValue(
    new Promise((resolve) => {
      release = resolve;
    }),
  );
  const handler = await makeQuoryRequestHandler(config);
  const first = handler.refreshSchema(),
    second = handler.refreshSchema();
  await Promise.resolve();
  expect(getSchemas).toHaveBeenCalledTimes(1);
  const dispose = handler.dispose();
  expect(teardown).not.toHaveBeenCalled();
  release([]);
  await Promise.all([first, second, dispose]);
  expect(teardown).toHaveBeenCalledTimes(1);
});

it("rejects queued requests when disposal begins before dispatch", async () => {
  const handler = await makeQuoryRequestHandler(config);
  const request = handler({ path: "schema", data: {} });
  const dispose = handler.dispose();
  await expect(request).rejects.toThrow("disposed");
  await dispose;
  expect(routes.schema.handle).not.toHaveBeenCalled();
  expect(teardown).toHaveBeenCalledTimes(1);
});

it.each(["execution-id", undefined])(
  "cancels running queries before teardown (execution ID: %s)",
  async (id) => {
    let started!: () => void;
    const running = new Promise<void>((resolve) => {
      started = resolve;
    });
    jest.mocked(routes.schema.handle).mockImplementation(({ database }) =>
      withQueryExecution(
        database,
        id,
        (signal) =>
          new Promise((_resolve, reject) => {
            signal!.addEventListener("abort", () => reject(signal!.reason), {
              once: true,
            });
            started();
          }),
      ),
    );
    const handler = await makeQuoryRequestHandler(config);
    const request = handler({ path: "schema", data: {} });
    const rejected = expect(request).rejects.toThrow("disposed");
    await running;
    await handler.dispose();
    await rejected;
    expect(teardown).toHaveBeenCalledTimes(1);
  },
);
