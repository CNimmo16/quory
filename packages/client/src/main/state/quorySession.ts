import { makeQuoryRequestHandler } from "@quory/stack/server";
import { connectionRepo } from "./connectionRepo";
import { SessionOwner } from "./SessionOwner";

async function createSession(connectionId: string) {
  const connection = await connectionRepo.get(connectionId);
  const request = await makeQuoryRequestHandler({ database: connection });
  try {
    const result = await request({ path: "schema", data: {} });
    if (!("schemas" in result))
      throw new Error("Could not read the database schema.");
    const schemas = result.schemas;
    return {
      connectionId,
      schemas,
      schemaGeneration: 0,
      refreshedGeneration: 0,
      request,
      dispose: request.dispose,
      async refreshSchema() {
        const generation = this.schemaGeneration;
        this.schemas = await request.refreshSchema();
        this.refreshedGeneration = generation;
        return this.schemas;
      },
    };
  } catch (error) {
    await request.dispose().catch(() => undefined);
    throw error;
  }
}

export const quorySessions = new SessionOwner<
  Awaited<ReturnType<typeof createSession>>
>();
export async function getQuorySession() {
  const session = await quorySessions.get();
  while (session.refreshedGeneration !== session.schemaGeneration) {
    await session.refreshSchema();
  }
  return session;
}
export async function invalidateQuorySchema() {
  const session = await quorySessions.get();
  session.request.invalidateSchema();
  ++session.schemaGeneration;
}
export const connectQuorySession = (id: string) =>
  quorySessions.connect(id, () => createSession(id));
export async function refreshQuorySchema() {
  return (await getQuorySession()).refreshSchema();
}
export const shutdownQuorySessions = () => quorySessions.shutdown();
