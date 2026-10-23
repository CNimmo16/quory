import { BrowserWindow, nativeTheme } from "electron";
import palette from "../../../../config/theme/palette.json";
import type { Preferences } from "../../shared/settings";

export function titleBarColors() {
  const theme = nativeTheme.shouldUseDarkColors ? palette.dark : palette.light;
  return { color: theme.background, symbolColor: theme.foreground, height: 44 };
}
export function applyNativeAppearance(appearance: Preferences["appearance"]) {
  nativeTheme.themeSource = appearance.theme;
  if (process.platform === "win32") {
    for (const window of BrowserWindow.getAllWindows())
      window.setTitleBarOverlay(titleBarColors());
  }
}
