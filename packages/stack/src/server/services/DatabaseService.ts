import { DatabaseDriver, DatabaseSchema, getSchemas } from "@quory/core";
import { SqliteDriver } from "@quory/sqlite";
import { PostgresDriver } from "@quory/postgres";
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
  const driver = await (async () => {
    switch (config.database.type) {
      case "sqlite": {
        const client = sqlite(config.database.hostOrFilePath);
        return new SqliteDriver(client);
      }
      case "postgres":
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
        return new PostgresDriver({
          host: config.database.hostOrFilePath,
          port: config.database.port,
          database: config.database.database,
          username: config.database.username,
          password: config.database.password,
        });
      default:
        throw new Error(`Unsupported database type ${config.database.type}`);
    }
  })();

  try {
    await driver.testConnection();
  } catch (e) {
    throw new DatabaseConnectionFailedError((e as Error).message);
  }

  const schemas = await getSchemas(driver);

  const ret: ClientDatabase = {
    driver,
    schemas,
  };

  return ret;
}
