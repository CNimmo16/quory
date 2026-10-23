import {
  createContext,
  useContext,
  useEffect,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { SettingsMenu } from "./SettingsMenu";

const ToolbarTargetContext = createContext<HTMLDivElement | null>(null);
const ToolbarSidebarContext = createContext<((width: number) => void) | null>(
  null,
);

export function useToolbarSidebarWidth(width: number) {
  const setWidth = useContext(ToolbarSidebarContext);
  useEffect(() => {
    setWidth?.(width);
  }, [setWidth, width]);
}

export function WindowToolbarFrame({
  children,
  hasQueryHeader = false,
}: {
  children: ReactNode;
  hasQueryHeader?: boolean;
}) {
  const [target, setTarget] = useState<HTMLDivElement | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState(0);
  const platform = typeof api === "undefined" ? "darwin" : api.platform;
  return (
    <ToolbarTargetContext.Provider value={target}>
      <ToolbarSidebarContext.Provider value={setSidebarWidth}>
        <div className="flex h-full min-h-0 flex-col">
          <header
            aria-label="App toolbar"
            data-platform={platform}
            style={
              {
                "--toolbar-sidebar-width": `${sidebarWidth}px`,
              } as CSSProperties
            }
            className="app-toolbar relative h-11 shrink-0 border-b border-border bg-background"
          >
            {sidebarWidth > 92 && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 border-r border-border"
                style={{ left: sidebarWidth - 1 }}
              />
            )}
            <div className="app-toolbar-safe-area flex h-full min-w-0 items-center px-4">
              <div
                ref={setTarget}
                className="flex h-full min-w-0 flex-1 items-center"
              >
                {!hasQueryHeader && (
                  <span className="text-sm font-medium text-muted-foreground">
                    Quory
                  </span>
                )}
              </div>
              <SettingsMenu />
            </div>
          </header>
          <div className="min-h-0 flex-1">{children}</div>
        </div>
      </ToolbarSidebarContext.Provider>
    </ToolbarTargetContext.Provider>
  );
}

/** Keep the query's controls and state in its route, rendering its header in the window toolbar. */
export function QueryToolbar({ children }: { children: ReactNode }) {
  const target = useContext(ToolbarTargetContext);
  const Header = target ? "div" : "header";
  const header = (
    <Header
      className={
        target
          ? "flex h-full min-w-0 flex-1 items-center gap-2 [&_button]:h-7 [&_button]:px-2 [&_button]:text-xs [&_button]:shadow-none [&_input]:h-7 [&_input]:shadow-none"
          : "flex min-h-16 shrink-0 flex-wrap items-center gap-2 border-b border-border bg-card px-4 py-3 [&_button]:shadow-none [&_input]:shadow-none"
      }
    >
      {children}
    </Header>
  );
  return target ? createPortal(header, target) : header;
}
