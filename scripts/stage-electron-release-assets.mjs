#!/usr/bin/env node

import { mkdirSync, readdirSync, rmSync, statSync, copyFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const TARGETS = {
  "aarch64-apple-darwin": {
    archLabel: "aarch64",
    installerExtensions: [".dmg"],
    metadataNames: ["latest-mac.yml"],
    metadataExtensions: [".blockmap"],
    installerName: (version) => `Lime_${version}_aarch64.dmg`,
  },
  "x86_64-apple-darwin": {
    archLabel: "x64",
    installerExtensions: [".dmg"],
    metadataNames: ["latest-mac.yml"],
    metadataExtensions: [".blockmap"],
    installerName: (version) => `Lime_${version}_x64.dmg`,
  },
  "x86_64-pc-windows-msvc": {
    archLabel: "x64",
    installerExtensions: [".exe"],
    metadataNames: ["latest.yml"],
    metadataExtensions: [".blockmap"],
    installerName: (version) => `Lime_${version}_x64-setup.exe`,
  },
};

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) {
      continue;
    }
    const key = item.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args[key] = "true";
      continue;
    }
    args[key] = next;
    index += 1;
  }
  return args;
}

function normalizeVersion(value) {
  const version = String(value || "")
    .trim()
    .replace(/^v/, "");
  if (!version) {
    throw new Error("version is required");
  }
  return version;
}

function walkFiles(root) {
  const result = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const filePath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(filePath);
      } else if (entry.isFile()) {
        result.push(filePath);
      }
    }
  }
  return result.sort();
}

function isAllowedAsset(filePath, spec) {
  const basename = path.basename(filePath);
  if (basename.includes("builder-debug")) {
    return false;
  }
  if (spec.metadataNames.includes(basename)) {
    return true;
  }
  return spec.metadataExtensions.some((extension) => basename.endsWith(extension));
}

function scoreInstaller(filePath, targetTriple) {
  const basename = path.basename(filePath).toLowerCase();
  if (targetTriple.endsWith("apple-darwin")) {
    if (!basename.endsWith(".dmg")) {
      return 0;
    }
    return basename.includes("universal") ? 1 : 2;
  }
  if (targetTriple === "x86_64-pc-windows-msvc") {
    if (!basename.endsWith(".exe")) {
      return 0;
    }
    return basename.includes("setup") ? 3 : 2;
  }
  return 0;
}

function isInstaller(filePath, spec) {
  const basename = path.basename(filePath).toLowerCase();
  return spec.installerExtensions.some((extension) => basename.endsWith(extension));
}

function stageElectronReleaseAssets({
  builderDir,
  outDir,
  targetTriple,
  version,
}) {
  const spec = TARGETS[targetTriple];
  if (!spec) {
    throw new Error(`unsupported target triple: ${targetTriple}`);
  }
  const sourceDir = path.resolve(builderDir || "release-electron");
  const stagingDir = path.resolve(outDir || path.join("release-assets", targetTriple));
  const normalizedVersion = normalizeVersion(version);

  const sourceStat = statSync(sourceDir, { throwIfNoEntry: false });
  if (!sourceStat?.isDirectory()) {
    throw new Error(`electron builder output is missing: ${sourceDir}`);
  }

  const allFiles = walkFiles(sourceDir);
  const installer = allFiles
    .filter((filePath) => isInstaller(filePath, spec))
    .map((filePath) => ({
      filePath,
      score: scoreInstaller(filePath, targetTriple),
    }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.filePath.localeCompare(right.filePath))[0]
    ?.filePath;
  if (!installer) {
    throw new Error(`no installer asset found for ${targetTriple} under ${sourceDir}`);
  }

  const metadataAssets = allFiles.filter((filePath) => isAllowedAsset(filePath, spec));
  const assets = [installer, ...metadataAssets].sort();

  rmSync(stagingDir, { recursive: true, force: true });
  mkdirSync(stagingDir, { recursive: true });

  const copied = [];
  for (const asset of assets) {
    const destinationName =
      asset === installer ? spec.installerName(normalizedVersion) : path.basename(asset);
    const destination = path.join(stagingDir, destinationName);
    copyFileSync(asset, destination);
    copied.push({ destination, source: asset });
  }

  return copied.sort((left, right) =>
    left.destination.localeCompare(right.destination),
  );
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const copied = stageElectronReleaseAssets({
    builderDir: args["builder-dir"],
    outDir: args["out-dir"],
    targetTriple: args["target-triple"],
    version: args.version || process.env.RELEASE_TAG || process.env.GITHUB_REF_NAME,
  });
  console.log("Staged Electron release assets:");
  for (const item of copied) {
    console.log(` - ${path.relative(process.cwd(), item.destination)}`);
  }
}

const isCli =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isCli) {
  main();
}

export { stageElectronReleaseAssets };
