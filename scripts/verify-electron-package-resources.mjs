#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const DEFAULT_PACKAGE_ROOT = "release-electron";

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

function walkDirectories(rootDir) {
  if (!existsSync(rootDir)) {
    return [];
  }
  const result = [];
  const stack = [rootDir];
  while (stack.length > 0) {
    const current = stack.pop();
    result.push(current);
    for (const entry of safeReadDir(current)) {
      if (entry.isDirectory()) {
        stack.push(path.join(current, entry.name));
      }
    }
  }
  return result.sort();
}

function safeReadDir(dir) {
  try {
    return statSync(dir).isDirectory()
      ? Array.from(readdirSync(dir, { withFileTypes: true }))
      : [];
  } catch {
    return [];
  }
}

function findResourceRoots(packageRoot) {
  const roots = walkDirectories(packageRoot).filter((dir) => {
    const manifest = path.join(dir, "app-server.release.json");
    const assets = path.join(dir, "desktop-assets");
    return existsSync(manifest) && existsSync(assets);
  });
  return roots.sort();
}

function platformKey(platform = process.platform, arch = process.arch) {
  if (platform === "win32") {
    return "win32-x64";
  }
  if (platform === "darwin" && arch === "arm64") {
    return "darwin-arm64";
  }
  if (platform === "darwin") {
    return "darwin-x64";
  }
  if (platform === "linux") {
    return "linux-x64";
  }
  return `${platform}-${arch}`;
}

function binaryName(platform = process.platform) {
  return platform === "win32" ? "app-server.exe" : "app-server";
}

function sha256(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function isMacCodeSigned(filePath) {
  try {
    execFileSync("codesign", ["--verify", "--strict", filePath], {
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

function assertFile(filePath, label) {
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    throw new Error(`${label} is missing: ${filePath}`);
  }
}

function verifyResourceRoot(root, { platform, arch }) {
  const manifestPath = path.join(root, "app-server.release.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const key = platformKey(platform, arch);
  const artifact = Array.isArray(manifest.artifacts)
    ? manifest.artifacts.find((item) => item?.platform === key)
    : null;
  if (!artifact) {
    throw new Error(`app-server manifest is missing platform ${key}`);
  }

  const sidecarPath = path.join(root, "app-server", key, binaryName(platform));
  assertFile(sidecarPath, "app-server sidecar");
  const sidecarSha256 = sha256(sidecarPath);
  const sha256Matches = artifact.sha256 === sidecarSha256;
  const signedMacSidecar =
    platform === "darwin" && !sha256Matches && isMacCodeSigned(sidecarPath);
  if (!sha256Matches && !signedMacSidecar) {
    throw new Error(`app-server sidecar sha256 mismatch: ${sidecarPath}`);
  }

  for (const name of [
    "icon.png",
    "trayTemplate.png",
    "trayTemplate@2x.png",
    "tray-running.png",
    "tray-stopped.png",
    "tray-warning.png",
    "tray-error.png",
  ]) {
    assertFile(path.join(root, "desktop-assets", name), `desktop asset ${name}`);
  }

  return {
    platform: key,
    resourceRoot: root,
    sidecarPath,
    sha256: {
      manifest: artifact.sha256,
      packaged: sidecarSha256,
      matches: sha256Matches,
      acceptedBecause: signedMacSidecar ? "macos-signed-sidecar" : "sha256",
    },
  };
}

function verifyMainBundle(repoRoot) {
  const mainBundle = path.resolve(repoRoot, "dist-electron/main/main.js");
  assertFile(mainBundle, "Electron main bundle");
  const content = readFileSync(mainBundle, "utf8");
  if (/from\s+["']app-server-client["']/.test(content)) {
    throw new Error("Electron main bundle still imports bare app-server-client");
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = process.cwd();
  const packageRoot = path.resolve(args["package-root"] || DEFAULT_PACKAGE_ROOT);
  const platform = args.platform || process.platform;
  const arch = args.arch || process.arch;

  verifyMainBundle(repoRoot);
  const resourceRoots = findResourceRoots(packageRoot);
  if (resourceRoots.length === 0) {
    throw new Error(`no Electron packaged resource root found under ${packageRoot}`);
  }

  const verified = resourceRoots.map((root) =>
    verifyResourceRoot(root, { platform, arch }),
  );
  console.log(
    JSON.stringify(
      {
        packageRoot,
        verified,
      },
      null,
      2,
    ),
  );
}

main();
