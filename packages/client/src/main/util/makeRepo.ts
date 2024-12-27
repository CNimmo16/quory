import { app } from "electron";
import { existsSync, mkdirSync } from "fs";
import { join } from "path";
import PouchDB from "pouchdb";

export default function makeRepo<T extends object>(namespace: string) {
  const loc = join(app.getPath("userData"), "pouchdb", namespace);
  const exists = existsSync(loc);
  if (!exists) {
    mkdirSync(loc, { recursive: true });
  }
  return new PouchDB<T>(loc, {
    adapter: "leveldb",
  });
}
