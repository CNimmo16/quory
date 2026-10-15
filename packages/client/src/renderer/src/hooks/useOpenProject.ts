import { useRef, useState } from "react";
import { useNavigate, useRouter } from "@tanstack/react-router";
import trpc from "../util/tprc";

export function useOpenProject() {
  const utils = trpc.useUtils();
  const router = useRouter();
  const navigate = useNavigate();
  const open = trpc.projects.open.useMutation();
  const connect = trpc.connections.connectToDatabase.useMutation();
  const [isPending, setPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const running = useRef(false);
  async function openProject(
    projectId: string,
    queryId: string,
    connectionId?: string
  ) {
    if (running.current) return;
    running.current = true;
    setPending(true);
    setError(null);
    let attemptedOpen = false;
    try {
      // Run route blockers before changing the active project or disconnecting.
      await navigate({ to: "/queries" });
      if (router.state.location.pathname.replace(/\/$/, "") !== "/queries")
        return;
      attemptedOpen = true;
      await open.mutateAsync({ projectId });
      if (connectionId) await connect.mutateAsync({ connectionId });
      await refresh();
      attemptedOpen = false;
      await navigate(
        connectionId
          ? { to: "/queries/$queryId", params: { queryId } }
          : { to: "/connections", search: { queryId, create: true } }
      );
      await router.invalidate();
    } catch (cause) {
      const failure =
        cause instanceof Error
          ? cause
          : new Error("Could not open the project.");
      setError(failure);
      throw failure;
    } finally {
      try {
        if (attemptedOpen) await refresh();
      } finally {
        running.current = false;
        setPending(false);
      }
    }
  }
  function refresh() {
    return Promise.all([
      utils.projects.list.invalidate(),
      utils.connections.invalidate(),
      utils.projects.listQueries.invalidate(),
    ]);
  }
  async function showCreatedProject(_projectId: string) {
    await utils.projects.list.invalidate();
    await navigate({ to: "/queries" });
  }
  return { openProject, showCreatedProject, isPending, error };
}
