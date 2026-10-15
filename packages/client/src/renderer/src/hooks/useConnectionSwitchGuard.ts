import { useContext, useEffect, useRef } from "react";
import { ConnectionSelectorContext } from "../components/ConnectionBadge";

/** Reuse the editor's unsaved-change check without navigating away to run it. */
export function useConnectionSwitchGuard(shouldBlock: () => boolean) {
  const selector = useContext(ConnectionSelectorContext);
  const currentGuard = useRef(shouldBlock);
  currentGuard.current = shouldBlock;
  const register = selector?.registerSwitchGuard;
  useEffect(() => register?.(() => !currentGuard.current()), [register]);
  return selector?.isConnecting ?? false;
}
