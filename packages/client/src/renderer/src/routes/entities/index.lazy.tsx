import { createLazyFileRoute } from "@tanstack/react-router";

export const Route = createLazyFileRoute("/entities/")({
  component: RouteComponent,
});

function RouteComponent() {
  return <div className="p-10 mx-auto">Coming soon!</div>;
}
