import { createFileRoute, redirect } from "@tanstack/react-router";
import { trpcClient } from "../GlobalProviders";

export const Route = createFileRoute("/")({
  loader: async () => {
    const res = await trpcClient.connections.fetchActiveConnection.query();
    if (res.connection) {
      throw redirect({ from: "/", to: "/queries" });
    } else {
      throw redirect({ from: "/", to: "/connections" });
    }
  },
});
