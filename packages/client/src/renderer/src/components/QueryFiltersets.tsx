import { useLayoutEffect, useRef, useState } from "react";
import type { Query } from "@quory/core";
import { BookmarkPlus, ChevronDown } from "lucide-react";
import { applyFilterset } from "../../../shared/queryFiltersets";
import trpc from "../util/tprc";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
} from "./ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "./ui/dialog";

export type FiltersetScope = {
  connectionId: string;
  projectId: string;
  queryId: string;
};

export function QueryFiltersets({
  scope,
  query,
  onApply,
}: {
  scope: FiltersetScope;
  query: Query;
  onApply: (query: Query) => void;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const measurementRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState({ count: 0, compactSave: false });
  const utils = trpc.useUtils();
  const filtersets = trpc.queries.listFiltersets.useQuery(scope, {
    retry: false,
  });
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [snapshotQuery, setSnapshotQuery] = useState<Query | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);
  const save = trpc.queries.saveFilterset.useMutation({
    onSuccess: async () => {
      setOpen(false);
      setName("");
      await utils.queries.listFiltersets.invalidate(scope);
    },
  });

  const saved = filtersets.data?.filtersets ?? [];
  const showStatus = filtersets.isLoading || Boolean(filtersets.error);
  useLayoutEffect(() => {
    const row = rowRef.current;
    const measurement = measurementRef.current;
    if (!row || !measurement) return;
    const update = () => {
      const width = row.getBoundingClientRect().width;
      if (width <= 0) return;
      const chipWidths = Array.from(
        measurement.querySelectorAll<HTMLElement>("[data-filterset-width]"),
      ).map((element) => element.getBoundingClientRect().width);
      const saveWidth = measurement
        .querySelector<HTMLElement>("[data-save-width]")!
        .getBoundingClientRect().width;
      const moreWidth = measurement
        .querySelector<HTMLElement>("[data-more-width]")!
        .getBoundingClientRect().width;
      const gap = 4;
      const allFit =
        !showStatus &&
        chipWidths.reduce((sum, size) => sum + size + gap, saveWidth) <= width;
      const compactSave = width < saveWidth + (allFit ? 0 : moreWidth + gap);
      const budget = Math.max(
        0,
        width - (compactSave ? 20 : saveWidth) - moreWidth - gap * 2,
      );
      let count = 0;
      let used = 0;
      if (allFit) count = chipWidths.length;
      else
        for (const size of chipWidths) {
          const next = used + size + (count ? gap : 0);
          if (next > budget) break;
          used = next;
          count++;
        }
      setLayout((previous) =>
        previous.count === count && previous.compactSave === compactSave
          ? previous
          : { count, compactSave },
      );
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(row);
    // Font loading can change label widths without changing the available space.
    Array.from(measurement.children).forEach((element) =>
      observer.observe(element),
    );
    return () => observer.disconnect();
  }, [filtersets.data, showStatus]);

  function apply(snapshot: Parameters<typeof applyFilterset>[1]) {
    try {
      onApply(applyFilterset(query, snapshot));
    } catch (error) {
      setApplyError(
        error instanceof Error
          ? error.message
          : "Could not apply this filterset.",
      );
    }
  }
  const overflow = saved.slice(layout.count);
  const showMore = overflow.length > 0 || showStatus;

  return (
    <div
      ref={rowRef}
      role="group"
      aria-label="Saved filtersets"
      className="relative flex min-w-0 items-center justify-end gap-1"
    >
      {saved.slice(0, layout.count).map((filterset) => (
        <Button
          key={filterset.id}
          type="button"
          variant="outline"
          size="sm"
          className="h-5 max-w-32 shrink-0 px-2 text-xs"
          title={filterset.name}
          aria-label={`Apply filterset ${filterset.name}`}
          onClick={() => apply(filterset.snapshot)}
        >
          <span className="truncate">{filterset.name}</span>
        </Button>
      ))}
      {showMore && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-5 shrink-0 gap-1 px-1.5 text-xs"
              aria-label="View more filtersets"
            >
              View more
              <ChevronDown aria-hidden="true" className="size-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-64 max-w-[calc(100vw-2rem)]"
          >
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              Saved filtersets
            </DropdownMenuLabel>
            {overflow.map((filterset) => (
              <DropdownMenuItem
                key={filterset.id}
                className="text-xs wrap-break-word whitespace-normal"
                aria-label={`Apply filterset ${filterset.name}`}
                onSelect={() => apply(filterset.snapshot)}
              >
                {filterset.name}
              </DropdownMenuItem>
            ))}
            {filtersets.isLoading && (
              <DropdownMenuItem disabled>Loading filtersets…</DropdownMenuItem>
            )}
            {filtersets.error && (
              <>
                <p role="alert" className="px-2 py-1 text-xs text-destructive">
                  {filtersets.error.message}
                </p>
                <DropdownMenuItem
                  onSelect={(event) => {
                    event.preventDefault();
                    void filtersets.refetch();
                  }}
                >
                  Retry
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={
          layout.compactSave
            ? "size-5 shrink-0 p-0"
            : "h-5 shrink-0 gap-1.5 px-1.5 text-xs"
        }
        aria-label="Save current filters"
        title="Save current filters"
        ref={triggerRef}
        onClick={() => {
          save.reset();
          setName("");
          setSnapshotQuery(structuredClone(query));
          setOpen(true);
        }}
      >
        <BookmarkPlus aria-hidden="true" className="size-3.5" />
        <span className={layout.compactSave ? "sr-only" : undefined}>
          Save current filters
        </span>
      </Button>
      <div
        ref={measurementRef}
        aria-hidden="true"
        className="pointer-events-none invisible absolute top-0 left-0 flex h-0 max-w-full gap-1 overflow-hidden whitespace-nowrap"
      >
        {saved.map((filterset) => (
          <span
            key={filterset.id}
            data-filterset-width
            className="inline-flex h-5 max-w-32 shrink-0 items-center rounded-md border px-2 text-xs font-medium"
          >
            <span className="truncate">{filterset.name}</span>
          </span>
        ))}
        <span
          data-save-width
          className="inline-flex h-5 shrink-0 items-center gap-1.5 border border-transparent px-1.5 text-xs font-medium"
        >
          <BookmarkPlus className="size-4" />
          Save current filters
        </span>
        <span
          data-more-width
          className="inline-flex h-5 shrink-0 items-center gap-1 border border-transparent px-1.5 text-xs font-medium"
        >
          View more
          <ChevronDown className="size-4" />
        </span>
      </div>
      <Dialog
        open={Boolean(applyError)}
        onOpenChange={(next) => {
          if (!next) setApplyError(null);
        }}
      >
        <DialogContent
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            triggerRef.current?.focus();
          }}
        >
          <DialogTitle>Could not apply filterset</DialogTitle>
          <DialogDescription role="alert">{applyError}</DialogDescription>
          <DialogFooter>
            <Button type="button" onClick={() => setApplyError(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!save.isPending) setOpen(next);
        }}
      >
        <DialogContent
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            triggerRef.current?.focus();
          }}
        >
          <DialogTitle>Save filterset</DialogTitle>
          <DialogDescription>
            Save the current filters for this query. You can apply them again
            from the recent filtersets or View more menu.
          </DialogDescription>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (name.trim() && snapshotQuery && !save.isPending)
                save.mutate({
                  ...scope,
                  name: name.trim(),
                  query: snapshotQuery,
                });
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="filterset-name">Filterset name</Label>
              <Input
                id="filterset-name"
                autoFocus
                required
                maxLength={80}
                value={name}
                disabled={save.isPending}
                onChange={(event) => setName(event.target.value)}
                placeholder="For example, Recent open orders"
              />
            </div>
            {save.error && (
              <p role="alert" className="text-sm text-destructive">
                {save.error.message}
              </p>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={save.isPending}
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={!name.trim() || save.isPending}>
                {save.isPending ? "Saving…" : "Save filterset"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
