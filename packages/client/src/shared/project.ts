export type Project = {
  configuration?: import("./projectConfiguration").ProjectConfiguration;
  name: string;
  storage: "database" | "folder";
  /** Canonical path to the .quory directory, for folder-backed projects. */
  directory?: string;
};
