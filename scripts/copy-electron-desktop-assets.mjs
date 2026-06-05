import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";

const outputDir = path.resolve("dist-electron/desktop-assets");

const assets = [
  ["lime-rs/icons/icon.png", "icon.png"],
  ["lime-rs/icons/tray/trayTemplate.png", "trayTemplate.png"],
  ["lime-rs/icons/tray/trayTemplate@2x.png", "trayTemplate@2x.png"],
  ["lime-rs/icons/tray/tray-running.png", "tray-running.png"],
  ["lime-rs/icons/tray/tray-stopped.png", "tray-stopped.png"],
  ["lime-rs/icons/tray/tray-warning.png", "tray-warning.png"],
  ["lime-rs/icons/tray/tray-error.png", "tray-error.png"],
];

await mkdir(outputDir, { recursive: true });

for (const [source, filename] of assets) {
  await copyFile(path.resolve(source), path.join(outputDir, filename));
}

console.log(`[electron-assets] copied ${assets.length} assets to ${outputDir}`);
