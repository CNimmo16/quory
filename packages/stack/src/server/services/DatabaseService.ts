import { DatabaseDriver, DatabaseSchema, getSchemas } from "@quory/core";
import { SqliteDriver } from "@quory/sqlite";
import { PostgresDriver } from "@quory/postgres";
import { MySQLDriver } from "@quory/mysql";
import sqlite from "better-sqlite3";
import { QuoryRequestHandlerConfig } from "../types";
import { DatabaseConnectionFailedError } from "../errors";

export interface ClientDatabase {
  driver: DatabaseDriver;
  schemas: DatabaseSchema[];
  semantics?: {
    entities: {
      name: string;
      tables: {
        ref: string;
        viaFromUser: string[];
        select: string[];
      }[];
      createdAt?: string | undefined;
      relatedEntities: string[];
    }[];
    lexicon: {
      columnRef: string;
      readableName: string;
      mapping?: {
        [key: string]: string;
      };
      obfuscated?: boolean;
    }[];
  };
}

export async function makeClientDatabase(
  config: QuoryRequestHandlerConfig
): Promise<ClientDatabase> {
  const ca = config.database.ssl?.ca?.trim();
  const cert = config.database.ssl?.cert?.trim();
  const key = config.database.ssl?.key?.trim();
  const ssl = config.database.ssl
    ? {
        rejectUnauthorized: config.database.ssl.mode !== "require",
        ...(ca && { ca }),
        ...(cert && { cert }),
        ...(key && { key }),
      }
    : undefined;
  const driver = await (async () => {
    switch (config.database.type) {
      case "sqlite": {
        const client = sqlite(config.database.hostOrFilePath);
        return new SqliteDriver(client);
      }
      case "postgres":
      case "mysql": {
        if (!config.database.port) {
          throw new Error("Missing port");
        }
        if (!config.database.database) {
          throw new Error("Missing database");
        }
        if (!config.database.username) {
          throw new Error("Missing username");
        }
        if (!config.database.password) {
          throw new Error("Missing password");
        }
        const connection = {
          host: config.database.hostOrFilePath,
          port: config.database.port,
          database: config.database.database,
          password: config.database.password,
        };
        return config.database.type === "postgres"
          ? new PostgresDriver({
              ...connection,
              username: config.database.username,
              ssl: ssl ?? false,
            })
          : new MySQLDriver({
              ...connection,
              user: config.database.username,
              ...(ssl && {
                ssl: { ...ssl, verifyIdentity: ssl.rejectUnauthorized },
              }),
            });
      }
      default:
        throw new Error(`Unsupported database type ${config.database.type}`);
    }
  })();

  try {
    try {
      await driver.testConnection();
    } catch (e) {
      throw new DatabaseConnectionFailedError((e as Error).message);
    }
    const schemas = await getSchemas(driver);
    return { driver, schemas };
  } catch (error) {
    // Preserve the initialization error even if cleanup also fails.
    await driver.teardown().catch(() => undefined);
    throw error;
  }
}
