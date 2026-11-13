import makeRepo from "../util/makeRepo";
import type { QuoryRequestHandlerConfig } from "@quory/stack/server";
import { randomUUID } from "crypto";

type Connection = QuoryRequestHandlerConfig["database"] & {
  nickname: string;
  projectId?: string;
  temporary?: boolean | undefined;
  writeProtection?: import("../../shared/sqlQuery").WriteProtection;
  colour?: import("../../shared/connectionColour").ConnectionColour | undefined;
};
type ConnectionDocument = Connection &
  PouchDB.Core.IdMeta &
  PouchDB.Core.GetMeta;
const savedConnections = makeRepo<Connection>("connections");
// Temporary credentials never reach the on-disk repository.
const temporaryConnections = new Map<string, ConnectionDocument>();

export const connectionRepo = {
  async get(id: string): Promise<ConnectionDocument> {
    const temporary = temporaryConnections.get(id);
    return temporary ? structuredClone(temporary) : savedConnections.get(id);
  },
  async allDocs(options: { include_docs: true }) {
    const result = await savedConnections.allDocs(options);
    return {
      ...result,
      rows: [
        ...result.rows,
        ...Array.from(temporaryConnections.values(), (doc) => ({
          id: doc._id,
          key: doc._id,
          value: { rev: doc._rev },
          doc: structuredClone(doc),
        })),
      ],
    };
  },
  async put(
    doc: Connection & PouchDB.Core.IdMeta & { _rev?: string | undefined },
  ): Promise<PouchDB.Core.Response> {
    if (!doc.temporary) return savedConnections.put(doc);
    if (!doc.projectId)
      throw new Error("Temporary connections require a project.");
    const existing = temporaryConnections.get(doc._id);
    if (existing && existing._rev !== doc._rev)
      throw new Error("Connection changed. Reload it before saving again.");
    const rev = `${Number(existing?._rev.split("-")[0] ?? 0) + 1}-${randomUUID()}`;
    temporaryConnections.set(doc._id, structuredClone({ ...doc, _rev: rev }));
    return { ok: true, id: doc._id, rev };
  },
  async remove(doc: ConnectionDocument): Promise<PouchDB.Core.Response> {
    if (temporaryConnections.delete(doc._id))
      return { ok: true, id: doc._id, rev: doc._rev };
    return savedConnections.remove(doc);
  },
  forgetTemporary(id: string) {
    temporaryConnections.delete(id);
  },
};
