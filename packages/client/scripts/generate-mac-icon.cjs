// Generate the DMG and development Dock assets with Apple's native compiler.
const { execFileSync } = require("node:child_process");
const { mkdtemp, writeFile, copyFile, rm } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const { resolve, join } = require("node:path");
const {
  generateAssetCatalogForIcon,
} = require("app-builder-lib/out/util/macosIconComposer");

async function main() {
  if (process.platform !== "darwin")
    throw new Error("Native icon generation requires macOS and Xcode 26+");
  const root = resolve(__dirname, "..");
  const { icnsFile } = await generateAssetCatalogForIcon(
    join(root, "build/Quory.icon"),
  );
  const temporary = await mkdtemp(join(tmpdir(), "quory-icon-"));
  try {
    const icon = join(temporary, "icon.icns");
    const iconset = join(temporary, "icon.iconset");
    await writeFile(icon, icnsFile);
    execFileSync("iconutil", ["-c", "iconset", icon, "-o", iconset]);
    await copyFile(
      join(iconset, "icon_128x128@2x.png"),
      join(root, "resources/icon-mac.png"),
    );
    await copyFile(icon, join(root, "build/icon.icns"));
    process.stdout.write("Generated native macOS icon fallbacks\n");
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
