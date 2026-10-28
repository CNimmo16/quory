import type { ProjectConfiguration } from "../../shared/projectConfiguration";
import { projectRepo } from "./projectRepo";
import { activeProjectState } from "../state/activeProjectState";
import { invalidateQuorySchema, quorySessions } from "../state/quorySession";
import { TRPCError } from "@trpc/server";

export async function saveProjectConfiguration(
  projectId: string,
  revision: string,
  configuration: ProjectConfiguration,
) {
  const project = await projectRepo.get(projectId);
  if (project._rev !== revision)
    throw new TRPCError({
      code: "CONFLICT",
      message: "This project changed. Reopen its configuration before saving.",
    });
  const active =
    activeProjectState.getActiveProject()?._id === projectId &&
    !!quorySessions.connectionId;
  if (active)
    await (
      await quorySessions.get()
    ).request.validateSchemaOptions(configuration);
  const result = await projectRepo.put({ ...project, configuration });
  activeProjectState.updateMetadata({
    ...project,
    configuration,
    _rev: result.rev,
  });
  if (active && activeProjectState.getActiveProject()?._id === projectId)
    await invalidateQuorySchema();
  return { revision: result.rev };
}
