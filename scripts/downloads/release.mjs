import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const targets = JSON.parse(
  readFileSync(
    new URL(
      "../../apps/marketing/src/data/download-targets.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
export function createManifest(directory, version) {
  if (!/^\d+\.\d+\.\d+$/.test(version))
    throw new Error("Expected a stable desktop version");
  const names = readdirSync(directory);
  const assets = targets.map((target) => {
    const filename = `quory-${version}-${target.suffix}`;
    if (!names.includes(filename))
      throw new Error(`Missing required installer: ${filename}`);
    const path = join(directory, filename);
    const size = statSync(path).size;
    if (!size) throw new Error(`Empty installer: ${filename}`);
    return {
      id: target.id,
      filename,
      size,
      sha256: createHash("sha256").update(readFileSync(path)).digest("hex"),
      url: `https://github.com/CNimmo16/quory/releases/download/${encodeURIComponent(`@quory/client@${version}`)}/${filename}`,
    };
  });
  return {
    schemaVersion: 1,
    version,
    publishedAt: new Date().toISOString(),
    assets,
  };
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const [directory, version] = process.argv.slice(2);
  const manifest = createManifest(directory, version);
  writeFileSync(
    join(directory, "downloads.json"),
    JSON.stringify(manifest, null, 2) + "\n",
  );
  writeFileSync(
    join(directory, "SHA256SUMS.txt"),
    manifest.assets.map((a) => `${a.sha256}  ${a.filename}`).join("\n") + "\n",
  );
}
