import { createLazyFileRoute } from "@tanstack/react-router";

export const Route = createLazyFileRoute("/entities/")({
  component: RouteComponent,
});

function RouteComponent() {
  return <div className="mx-auto p-10">Coming soon!</div>;
}
