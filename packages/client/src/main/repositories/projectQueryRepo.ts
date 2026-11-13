import type { ActiveProject } from "../state/activeProjectState";
import { FolderQueryRepo } from "./folderQueryRepo";
import { queryRepo, type SavedQuery } from "./queryRepo";
import { randomUUID } from "node:crypto";
import { isSqlQuery } from "../../shared/sqlQuery";

type Document = SavedQuery & { _id: string; _rev: string };
interface QueryRepository {
  get(id: string): Promise<Document>;
  allDocs(options: {
    include_docs: true;
  }): Promise<{ rows: { id: string; doc?: Document | undefined }[] }>;
  put(
    doc: SavedQuery & { _id: string; _rev?: string },
  ): Promise<{ rev: string }>;
  remove(doc: Document): Promise<unknown>;
}
function persistentQueryRepo(project: ActiveProject): QueryRepository {
  if (project.storage === "folder") {
    if (!project.directory)
      throw new Error("This project has no query folder configured.");
    return new FolderQueryRepo(project.directory, project._id);
  }
  return {
    get: (id) => queryRepo.get(id),
    allDocs: (options) => queryRepo.allDocs(options),
    put: (doc) => (isSqlQuery(doc) ? queryRepo.put(doc) : queryRepo.put(doc)),
    remove: (doc) => queryRepo.remove(doc),
  };
}

let lastModification = 0;

const drafts = new Map<string, Map<string, Document>>();
const writing = new Set<string>();
const conflict = () =>
  Object.assign(new Error("This query changed. Reopen it before saving."), {
    status: 409,
  });

/** Cleanup is project scoped and never touches a saved query. */
export function discardEphemeralQuery(projectId: string, queryId: string) {
  drafts.get(projectId)?.delete(queryId);
  if (!drafts.get(projectId)?.size) drafts.delete(projectId);
}

export function discardProjectEphemeralQueries(projectId: string) {
  drafts.delete(projectId);
}

export function projectQueryRepo(project: ActiveProject): QueryRepository {
  const persisted = persistentQueryRepo(project);
  const getDraft = (id: string) => drafts.get(project._id)?.get(id);
  return {
    async get(id) {
      const draft = getDraft(id);
      return draft ? structuredClone(draft) : persisted.get(id);
    },
    async allDocs(options) {
      const { rows } = await persisted.allDocs(options);
      return {
        rows: [
          ...rows.filter(({ id }) => !getDraft(id)),
          ...Array.from(drafts.get(project._id)?.values() ?? [], (doc) => ({
            id: doc._id,
            doc: structuredClone(doc),
          })),
        ],
      };
    },
    async put(doc) {
      const modifiedAt = Math.max(
        Date.now(),
        lastModification + 1,
        (doc.modifiedAt ?? 0) + 1,
      );
      lastModification = modifiedAt;
      const updated = { ...doc, modifiedAt };
      const key = JSON.stringify([project._id, doc._id]);
      if (writing.has(key)) throw conflict();
      const draft = getDraft(doc._id);
      if (doc.ephemeral || draft) {
        if (doc.projectId !== project._id)
          throw new Error("This query belongs to a different project.");
        if (draft?._rev !== doc._rev) throw conflict();
      }
      if (doc.ephemeral) {
        const rev = `draft-${randomUUID()}`;
        if (!drafts.has(project._id)) drafts.set(project._id, new Map());
        drafts
          .get(project._id)!
          .set(doc._id, structuredClone({ ...updated, _rev: rev }));
        return { rev };
      }
      if (!draft) return persisted.put(updated);
      if (!doc.nickname.trim()) throw new Error("Enter a query name.");
      writing.add(key);
      try {
        const {
          _rev: _draftRevision,
          ephemeral: _ephemeral,
          ...saved
        } = updated;
        const result = await persisted.put(saved);
        discardEphemeralQuery(project._id, doc._id);
        return result;
      } finally {
        writing.delete(key);
      }
    },
    async remove(doc) {
      const draft = getDraft(doc._id);
      if (!draft) return persisted.remove(doc);
      if (
        draft._rev !== doc._rev ||
        writing.has(JSON.stringify([project._id, doc._id]))
      )
        throw conflict();
      discardEphemeralQuery(project._id, doc._id);
      return undefined;
    },
  };
}
