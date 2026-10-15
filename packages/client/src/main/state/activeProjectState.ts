import { TRPCError } from "@trpc/server";
import { projectRepo } from "../repositories/projectRepo";
import activeConnectionState from "./activeConnectionState";

import { FolderQueryRepo } from "../repositories/folderQueryRepo";
import type { Project } from "../../shared/project";

export type ActiveProject = Project & { _id: string; _rev: string };
let active: ActiveProject | null = null;
let generation = 0;

export const activeProjectState = {
  getActiveProject() {
    return active;
  },
  updateMetadata(project: ActiveProject) {
    if (active?._id === project._id) active = project;
  },
  getProjectGeneration() {
    return generation;
  },
  requireActiveProject() {
    if (!active)
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Open a project first.",
      });
    return active;
  },
  assertCurrent(projectId: string, expectedGeneration: number) {
    if (active?._id !== projectId || generation !== expectedGeneration)
      throw new TRPCError({
        code: "CONFLICT",
        message:
          "The active project changed. Open the query again before continuing.",
      });
  },
  async open(projectId: string) {
    const openingGeneration = ++generation;
    active = null;
    await activeConnectionState.deleteActiveConnection();
    const project = await projectRepo.get(projectId);
    if (project.storage === "folder") {
      if (!project.directory)
        throw new Error("This project has no query folder configured.");
      await new FolderQueryRepo(project.directory, project._id).allDocs({
        include_docs: true,
      });
    }
    if (openingGeneration !== generation)
      throw new TRPCError({
        code: "CONFLICT",
        message: "Project selection was superseded.",
      });
    active = project;
    return project;
  },
  async close() {
    ++generation;
    active = null;
    await activeConnectionState.deleteActiveConnection();
  },
};
