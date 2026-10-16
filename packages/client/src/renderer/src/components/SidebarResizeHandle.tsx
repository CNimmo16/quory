import { useEffect, useRef } from "react";

export function SidebarResizeHandle({
  side,
  width,
  max,
  onResize,
}: {
  side: "left" | "right";
  width: number;
  max: number;
  onResize: (width: number) => void;
}) {
  const drag = useRef<{
    startX: number;
    width: number;
    cursor: string;
    userSelect: string;
  } | null>(null);
  function finish() {
    if (!drag.current) return;
    document.body.style.cursor = drag.current.cursor;
    document.body.style.userSelect = drag.current.userSelect;
    drag.current = null;
  }
  useEffect(() => () => finish(), []);
  const clamp = (value: number) => Math.max(200, Math.min(max, value));
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      tabIndex={0}
      aria-label={
        side === "left" ? "Resize projects sidebar" : "Resize query assistant"
      }
      aria-valuemin={200}
      aria-valuemax={max}
      aria-valuenow={Math.round(width)}
      aria-controls={
        side === "left" ? "projects-navigation" : "query-chat-content"
      }
      className={`absolute inset-y-0 z-20 w-1.5 cursor-col-resize touch-none select-none hover:bg-primary/20 focus-visible:bg-primary/20 focus-visible:outline-hidden ${
        side === "left" ? "-right-0.5" : "-left-0.5"
      }`}
      onPointerDown={(event) => {
        if (event.button !== 0 || drag.current) return;
        event.preventDefault();
        drag.current = {
          startX: event.clientX,
          width,
          cursor: document.body.style.cursor,
          userSelect: document.body.style.userSelect,
        };
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (!drag.current) return;
        onResize(
          clamp(
            drag.current.width +
              (event.clientX - drag.current.startX) *
                (side === "left" ? 1 : -1),
          ),
        );
      }}
      onPointerUp={finish}
      onPointerCancel={finish}
      onLostPointerCapture={finish}
      onKeyDown={(event) => {
        let next: number;
        if (event.key === "Home") next = 200;
        else if (event.key === "End") next = max;
        else if (event.key === "ArrowLeft" || event.key === "ArrowRight")
          next =
            width +
            (event.key === "ArrowRight" ? 10 : -10) *
              (side === "left" ? 1 : -1);
        else return;
        event.preventDefault();
        onResize(clamp(next));
      }}
    />
  );
}
