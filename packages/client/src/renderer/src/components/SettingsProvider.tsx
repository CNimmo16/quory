import { createContext, useContext, useEffect } from "react";
import trpc from "../util/tprc";
import { defaultPreferences } from "../../../shared/settings";
import { initializeTelemetry } from "../telemetry";

export const SettingsContext = createContext<ReturnType<
  typeof useSettingsQuery
> | null>(null);
function useSettingsQuery() {
  return trpc.settings.get.useQuery(undefined, {
    staleTime: Infinity,
    retry: false,
  });
}
export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const settings = useSettingsQuery();
  useEffect(() => {
    if (!settings.data) return;
    const { appearance, privacy } = settings.data.preferences;
    const root = document.documentElement;
    root.classList.toggle("dark", appearance.theme === "dark");
    root.classList.toggle("light", appearance.theme === "light");
    root.style.setProperty(
      "--editor-font-size",
      `${appearance.editorFontSize}px`,
    );
    initializeTelemetry(privacy);
  }, [settings.data]);
  return (
    <SettingsContext.Provider value={settings}>
      {children}
    </SettingsContext.Provider>
  );
}
export const useAppSettings = () => useContext(SettingsContext);
export function useAppearance() {
  return (
    useAppSettings()?.data?.preferences.appearance ??
    defaultPreferences.appearance
  );
}
