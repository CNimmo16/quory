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
  const deleteQuery = trpc.projects.deleteQuery.useMutation();
  const utils = trpc.useUtils();
  const navigate = useNavigate();
  const router = useRouter();
  const matchRoute = useMatchRoute();
  const pending =
    renameProject.isPending ||
    deleteProject.isPending ||
    renameQuery.isPending ||
    deleteQuery.isPending;
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
  }) {
    if (pending) return;
    const message = query
      ? `Delete "${query.nickname}"? This permanently deletes the saved query.`
      : `Delete project "${
          project.name
        }"? Its connections and queries stored in Quory will be deleted.${
          project.storage === "folder"
            ? " Shared .quory files will remain on disk."
            : ""
        }`;
    if (!confirm(message)) return;
    setError(null);
    try {
      const selected = matchRoute({ to: "/queries/$queryId" });
      if (active && (!query || (selected && selected.queryId === query.id))) {
        // Let the current editor's unsaved-change blocker run before deletion.
        await navigate({ to: "/queries" });
        if (router.state.location.pathname.replace(/\/$/, "") !== "/queries")
          return;
      }
      if (query)
        await deleteQuery.mutateAsync({
          projectId,
          queryId: query.id,
          revision: query.revision,
        });
      else await deleteProject.mutateAsync({ projectId, revision });
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
