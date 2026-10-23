import { app, safeStorage } from "electron";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { createSettingsStore } from "./store";

let store: ReturnType<typeof createSettingsStore> | undefined;
export function settingsStore() {
  if (!store) {
    const directory = app.getPath("userData");
    const file = join(directory, "settings.json");
    store = createSettingsStore(
      {
        read: () =>
          existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : undefined,
        write: (state) => {
          mkdirSync(directory, { recursive: true });
          const temporary = `${file}.tmp`;
          writeFileSync(temporary, JSON.stringify(state), { mode: 0o600 });
          renameSync(temporary, file);
        },
        encrypt: (key) => {
          if (!secureStorageAvailable())
            throw new Error(
              "Secure key storage is unavailable. Unlock your system keychain or configure a Linux secret service, then try again.",
            );
          return safeStorage.encryptString(key).toString("base64");
        },
        decrypt: (value) => {
          if (!secureStorageAvailable())
            throw new Error("Keychain is unavailable");
          return safeStorage.decryptString(Buffer.from(value, "base64"));
        },
      },
      { ...process.env },
    );
  }
  return store;
}
export function secureStorageAvailable() {
  return (
    safeStorage.isEncryptionAvailable() &&
    (process.platform !== "linux" ||
      safeStorage.getSelectedStorageBackend() !== "basic_text")
  );
}
