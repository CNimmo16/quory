import { LoaderCircle } from "lucide-react";
import { cn } from "../lib/utils";

export function Spinner({ className }: { className?: string }) {
  return (
    <LoaderCircle
      aria-hidden="true"
      className={cn("size-4 animate-spin", className)}
    />
  );
}

export function LoadingState({
  label = "Loading…",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      role="status"
      className={cn(
        "text-muted-foreground flex h-full min-h-24 items-center justify-center gap-2 p-5",
        className,
      )}
    >
      <Spinner className="size-5" />
      <span className="sr-only">{label}</span>
    </div>
  );
}
