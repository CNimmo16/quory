import type { SavedFilterset } from "../../shared/queryFiltersets";
import makeRepo from "../util/makeRepo";

// Always app-local, including for projects whose query definitions live in .quory.
let repo: ReturnType<typeof makeRepo<SavedFilterset>> | undefined;
export function queryFiltersetRepo() {
  return (repo ??= makeRepo<SavedFilterset>("query-filtersets"));
}
