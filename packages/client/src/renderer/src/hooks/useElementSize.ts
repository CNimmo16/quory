import { useLayoutEffect, useState } from "react";

export default function useElementSize() {
  const [element, setElement] = useState<HTMLElement | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    if (!element) return;
    const updateSize = () => {
      const { width, height } = element.getBoundingClientRect();
      setSize({ width, height });
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);

  return { ref: setElement, ...size };
}
