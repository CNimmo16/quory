import { useState } from "react";
import { useMatchRoute, useNavigate, useRouter } from "@tanstack/react-router";
import trpc from "../util/tprc";
import type { Project } from "../../../shared/project";

type RenameTarget = { queryId?: string; name: string; revision: string };
export function useSidebarActions(
  projectId: string,
  project: Project,
  revision: string,
  active: boolean,
) {
  const [renameTarget, setRenameTarget] = useState<RenameTarget | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const renameProject = trpc.projects.rename.useMutation();
  const deleteProject = trpc.projects.delete.useMutation();
  const renameQuery = trpc.projects.renameQuery.useMutation();
  const discardQuery = trpc.queries.discardEphemeralQuery.useMutation();
  const deleteQuery = trpc.projects.deleteQuery.useMutation();
  const utils = trpc.useUtils();
  const navigate = useNavigate();
  const router = useRouter();
  const matchRoute = useMatchRoute();
  const pending =
    renameProject.isPending ||
    deleteProject.isPending ||
    renameQuery.isPending ||
    deleteQuery.isPending ||
    discardQuery.isPending;
  async function refresh(connections = false) {
    await Promise.all([
      utils.projects.list.invalidate(),
      utils.projects.listQueries.invalidate(),
      ...(connections ? [utils.connections.invalidate()] : []),
    ]);
    await router.invalidate();
  }
  function beginRename(target: RenameTarget) {
    setError(null);
    setName(target.name);
    setRenameTarget(target);
  }
  async function saveRename() {
    if (!renameTarget || !name.trim() || pending) return;
    setError(null);
    try {
      if (renameTarget.queryId)
        await renameQuery.mutateAsync({
          projectId,
          queryId: renameTarget.queryId,
          revision: renameTarget.revision,
          nickname: name.trim(),
        });
      else
        await renameProject.mutateAsync({
          projectId,
          revision: renameTarget.revision,
          name: name.trim(),
        });
      setRenameTarget(null);
      await refresh();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not rename this item.",
      );
    }
  }
  async function remove(query?: {
    id: string;
    nickname: string;
    revision: string;
    ephemeral?: boolean | undefined;
  }) {
    if (pending) return;
    if (
      !query &&
      !confirm(
        `Delete project "${project.name}"? Its connections and queries stored in Quory will be deleted.${project.storage === "folder" ? " Shared .quory files will remain on disk." : ""}`,
      )
    )
      return;
    setError(null);
    try {
      const selected = matchRoute({ to: "/queries/$queryId" });
      if (active && !query) {
        // Project deletion still uses the editor's unsaved-change guard.
        await navigate({ to: "/queries" });
        if (router.state.location.pathname.replace(/\/$/, "") !== "/queries")
          return;
      }
      if (query?.ephemeral)
        await discardQuery.mutateAsync({ projectId, queryId: query.id });
      else if (query)
        await deleteQuery.mutateAsync({
          projectId,
          queryId: query.id,
          revision: query.revision,
        });
      else await deleteProject.mutateAsync({ projectId, revision });
      if (query && active && selected && selected.queryId === query.id) {
        // The in-menu confirmation already authorized discarding this query.
        // Navigate only after deletion succeeds, without a second dialog.
        await navigate({ to: "/queries", ignoreBlocker: true });
      }
      await refresh(!query);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not delete this item.",
      );
    }
  }
  return {
    renameTarget,
    name,
    setName,
    error,
    pending,
    beginRename,
    saveRename,
    remove,
    closeRename: () => setRenameTarget(null),
  };
}
