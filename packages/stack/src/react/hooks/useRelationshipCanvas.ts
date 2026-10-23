import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent,
  type KeyboardEvent,
} from "react";

const INITIAL_VIEW = { x: 16, y: 12, scale: 1 };
const MIN_ZOOM = 0.35;
const MAX_ZOOM = 2.5;

export function useRelationshipCanvas() {
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const [view, setView] = useState(INITIAL_VIEW);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ pointerId: number; x: number; y: number } | null>(null);

  const zoom = useCallback(
    (factor: number, anchor?: { x: number; y: number }) => {
      setView((current) => {
        const scale = Math.max(
          MIN_ZOOM,
          Math.min(MAX_ZOOM, current.scale * factor),
        );
        const point = anchor ?? {
          x: (element?.clientWidth ?? 0) / 2,
          y: (element?.clientHeight ?? 0) / 2,
        };
        const ratio = scale / current.scale;
        return {
          x: point.x - (point.x - current.x) * ratio,
          y: point.y - (point.y - current.y) * ratio,
          scale,
        };
      });
    },
    [element],
  );

  useEffect(() => {
    if (!element) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const bounds = element.getBoundingClientRect();
      const delta =
        event.deltaY *
        (event.deltaMode === 1
          ? 16
          : event.deltaMode === 2
            ? element.clientHeight
            : 1);
      zoom(Math.exp(-delta * 0.002), {
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      });
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  }, [element, zoom]);

  function finish() {
    drag.current = null;
    setDragging(false);
  }
  return {
    ref: setElement,
    view,
    dragging,
    zoom,
    reset: () => setView(INITIAL_VIEW),
    handlers: {
      onPointerDown(event: PointerEvent<HTMLDivElement>) {
        if (
          event.button !== 0 ||
          drag.current ||
          !event.currentTarget.contains(event.target as Node)
        )
          return;
        if (
          (event.target as Element).closest(
            "[data-canvas-node], button, input, textarea, select, a, [role='button'], [contenteditable]",
          )
        )
          return;
        event.preventDefault();
        event.currentTarget.focus({ preventScroll: true });
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = {
          pointerId: event.pointerId,
          x: event.clientX,
          y: event.clientY,
        };
        setDragging(true);
      },
      onPointerMove(event: PointerEvent<HTMLDivElement>) {
        const start = drag.current;
        if (!start || event.pointerId !== start.pointerId) return;
        const dx = event.clientX - start.x;
        const dy = event.clientY - start.y;
        start.x = event.clientX;
        start.y = event.clientY;
        setView((current) => ({
          ...current,
          x: current.x + dx,
          y: current.y + dy,
        }));
      },
      onPointerUp: finish,
      onPointerCancel: finish,
      onLostPointerCapture: finish,
      onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
        if (event.target !== event.currentTarget) return;
        const movement = {
          ArrowLeft: [40, 0],
          ArrowRight: [-40, 0],
          ArrowUp: [0, 40],
          ArrowDown: [0, -40],
        }[event.key];
        if (movement)
          setView((current) => ({
            ...current,
            x: current.x + movement[0]!,
            y: current.y + movement[1]!,
          }));
        else if (event.key === "+" || event.key === "=") zoom(1.2);
        else if (event.key === "-") zoom(1 / 1.2);
        else if (event.key === "0" || event.key === "Home")
          setView(INITIAL_VIEW);
        else return;
        event.preventDefault();
      },
    },
  };
}
