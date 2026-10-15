import type { Project } from "../../shared/project";
import makeRepo from "../util/makeRepo";

export const projectRepo = makeRepo<Project>("projects");
