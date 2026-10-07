import { makeQuoryRequestHandler } from "@quory/stack/server";
import activeConnectionState from "./activeConnectionState";

let cachedKey: string | null = null;
let cachedSession: ReturnType<typeof createSession> | null = null;

async function createSession(
  connection: NonNullable<
    Awaited<ReturnType<typeof activeConnectionState.getActiveConnection>>
  >
) {
  const request = await makeQuoryRequestHandler({ database: connection });
  const result = await request({ path: "schema", data: {} });
  if (!("schemas" in result))
    throw new Error("Could not read the database schema.");
  return { connectionId: connection._id, schemas: result.schemas, request };
}

export async function getQuorySession() {
  const connection = await activeConnectionState.getActiveConnection();
  if (!connection) {
    cachedKey = null;
    cachedSession = null;
    throw new Error("Connect to a database first.");
  }
  const key = `${connection._id}:${connection._rev}`;
  if (cachedKey !== key || !cachedSession) {
    cachedKey = key;
    cachedSession = createSession(connection).catch((error: unknown) => {
      if (cachedKey === key) cachedSession = null;
      throw error;
    });
  }
  return cachedSession;
}
