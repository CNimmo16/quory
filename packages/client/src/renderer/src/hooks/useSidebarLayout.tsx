import {
  createContext,
  useContext,
  useEffect,
  useState,
  type Dispatch,
  type SetStateAction,
  type ReactNode,
} from "react";

type Layout = {
  leftOpen: boolean;
  rightOpen: boolean;
  setLeftOpen: Dispatch<SetStateAction<boolean>>;
  setRightOpen: Dispatch<SetStateAction<boolean>>;
  leftWidth: number;
  rightWidth: number;
  leftMax: number;
  rightMax: number;
  setLeftWidth: (width: number) => void;
  setRightWidth: (width: number) => void;
};
const SidebarLayoutContext = createContext<Layout | null>(null);
export function SidebarLayoutProvider({ children }: { children: ReactNode }) {
  const [viewportWidth, setViewportWidth] = useState(window.innerWidth);
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(false);
  useEffect(() => {
    const resize = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  // Preserve the 200px minimum when a very small viewport cannot satisfy both constraints.
  const leftMax = Math.max(
    200,
    Math.floor(viewportWidth / (rightOpen ? 3 : 2)),
  );
  const rightMax = Math.max(
    300,
    Math.floor(viewportWidth / (leftOpen ? 3 : 2)),
  );
  const [leftWidth, setLeftWidth] = useState(Math.min(260, leftMax));
  const [rightWidth, setRightWidth] = useState(Math.min(400, rightMax));
  const clamp = (width: number, max: number) =>
    Math.max(200, Math.min(max, width));
  return (
    <SidebarLayoutContext.Provider
      value={{
        leftOpen,
        rightOpen,
        setLeftOpen,
        setRightOpen,
        leftWidth: clamp(leftWidth, leftMax),
        rightWidth: clamp(rightWidth, rightMax),
        leftMax,
        rightMax,
        setLeftWidth: (width) => setLeftWidth(clamp(width, leftMax)),
        setRightWidth: (width) => setRightWidth(clamp(width, rightMax)),
      }}
    >
      {children}
    </SidebarLayoutContext.Provider>
  );
}
export function useSidebarLayout() {
  return useContext(SidebarLayoutContext);
}
