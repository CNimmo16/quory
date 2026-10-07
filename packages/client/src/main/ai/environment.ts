import { config } from "dotenv";
import { resolve } from "node:path";

// Read at runtime in the main process, never through Vite's renderer env/define.
export function loadAIEnvironment() {
  config({ path: resolve(__dirname, "../../../..", ".env.local") });
}
