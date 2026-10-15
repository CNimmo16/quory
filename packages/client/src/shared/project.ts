export type Project = {
  name: string;
  storage: "database" | "folder";
  /** Canonical path to the .quory directory, for folder-backed projects. */
  directory?: string;
};
