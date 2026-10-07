import { getSchemas } from "@quory/core";
import { PostgresDriver } from "@quory/postgres";
import { MySQLDriver } from "@quory/mysql";
import { makeClientDatabase } from "./DatabaseService";
import type { QuoryRequestHandlerConfig } from "../types";

jest.mock("@quory/core", () => ({ getSchemas: jest.fn() }));
jest.mock("@quory/postgres", () => ({ PostgresDriver: jest.fn() }));
jest.mock("@quory/mysql", () => ({ MySQLDriver: jest.fn() }));
jest.mock("@quory/sqlite", () => ({ SqliteDriver: jest.fn() }));
jest.mock("better-sqlite3", () => jest.fn());

const testConnection = jest.fn();
const database: QuoryRequestHandlerConfig["database"] = {
  type: "postgres",
  hostOrFilePath: "db.example.com",
  port: 5432,
  username: "db-user",
  password: "secret",
  database: "app",
};

beforeEach(() => {
  jest.resetAllMocks();
  testConnection.mockResolvedValue(undefined);
  jest.mocked(getSchemas).mockResolvedValue([]);
  jest
    .mocked(PostgresDriver)
    .mockImplementation(
      () => ({ testConnection } as unknown as PostgresDriver)
    );
  jest
    .mocked(MySQLDriver)
    .mockImplementation(() => ({ testConnection } as unknown as MySQLDriver));
});

describe.each(["postgres", "mysql"] as const)("%s SSL connections", (type) => {
  const Driver = type === "postgres" ? PostgresDriver : MySQLDriver;

  it("keeps existing connections without SSL working", async () => {
    await makeClientDatabase({ database: { ...database, type } });
    const options = jest.mocked(Driver).mock.calls[0]![0];
    expect(options.ssl).toBe(type === "postgres" ? false : undefined);
    expect(testConnection).toHaveBeenCalledTimes(1);
  });

  it("verifies the server and passes through custom client certificates", async () => {
    await makeClientDatabase({
      database: {
        ...database,
        type,
        ssl: {
          mode: "verify-full",
          ca: " CA PEM \n",
          cert: "CERT PEM",
          key: "KEY PEM",
        },
      },
    });
    expect(Driver).toHaveBeenCalledWith(
      expect.objectContaining({
        host: "db.example.com",
        ssl: {
          rejectUnauthorized: true,
          ca: "CA PEM",
          cert: "CERT PEM",
          key: "KEY PEM",
          ...(type === "mysql" && { verifyIdentity: true }),
        },
      })
    );
  });

  it("only disables certificate checks when explicitly requested", async () => {
    await makeClientDatabase({
      database: { ...database, type, ssl: { mode: "require" } },
    });
    expect(Driver).toHaveBeenCalledWith(
      expect.objectContaining({
        ssl: expect.objectContaining({
          rejectUnauthorized: false,
          ...(type === "mysql" && { verifyIdentity: false }),
        }),
      })
    );
  });

  it("uses default trust roots when certificate fields are blank", async () => {
    await makeClientDatabase({
      database: { ...database, type, ssl: { mode: "verify-full", ca: " \n " } },
    });
    expect(Driver).toHaveBeenCalledWith(
      expect.objectContaining({
        ssl: expect.objectContaining({
          rejectUnauthorized: true,
        }),
      })
    );
    expect(jest.mocked(Driver).mock.calls[0]![0].ssl).not.toHaveProperty("ca");
  });

  it("rejects a failed TLS connection without falling back to plaintext", async () => {
    testConnection.mockRejectedValue(new Error("self-signed certificate"));
    await expect(
      makeClientDatabase({
        database: { ...database, type, ssl: { mode: "verify-full" } },
      })
    ).rejects.toMatchObject({ name: "DatabaseConnectionFailedError" });
    expect(Driver).toHaveBeenCalledTimes(1);
    expect(getSchemas).not.toHaveBeenCalled();
  });
});
