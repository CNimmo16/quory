import type { ActiveProject } from "../state/activeProjectState";
import { FolderQueryRepo } from "./folderQueryRepo";
import { queryRepo, type SavedQuery } from "./queryRepo";
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
export function projectQueryRepo(project: ActiveProject): QueryRepository {
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
