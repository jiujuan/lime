import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import {
  chmod,
  copyFile,
  mkdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import {
  appServerBinaryName,
  resolveDevAppServerBinary,
} from "./electron-dev-sidecar.mjs";

const execFileAsync = promisify(execFile);
const MACOS_LAUNCH_BLOCKING_XATTRS = [
  "com.apple.quarantine",
  "com.apple.provenance",
];

export const APP_SERVER_RELEASE_MANIFEST_NAME = "app-server.release.json";
export const APP_SERVER_PROTOCOL_VERSION = "appserver.v0";

export function appServerResourceBinaryName(platform = process.platform) {
  return appServerBinaryName(platform);
}

export function appServerResourcePlatformKey(
  platform = process.platform,
  arch = process.arch,
) {
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

export function electronAppServerResourcesRoot(repoRoot = process.cwd()) {
  return path.resolve(repoRoot, "dist-electron");
}

export function electronAppServerManifestPath({
  outputRoot = electronAppServerResourcesRoot(),
} = {}) {
  return path.resolve(outputRoot, APP_SERVER_RELEASE_MANIFEST_NAME);
}

export function electronAppServerBinaryDestination({
  outputRoot = electronAppServerResourcesRoot(),
  platform = process.platform,
  arch = process.arch,
} = {}) {
  const platformKey = appServerResourcePlatformKey(platform, arch);
  return path.resolve(
    outputRoot,
    "app-server",
    platformKey,
    appServerResourceBinaryName(platform),
  );
}

export async function buildElectronAppServerReleaseManifest({
  binaryPath,
  version,
  platform = appServerResourcePlatformKey(),
  sha256File = hashFile,
}) {
  const normalizedBinaryPath = path.resolve(requiredValue(binaryPath, "binaryPath"));
  const normalizedVersion = requiredValue(version, "version");
  const normalizedPlatform = requiredValue(platform, "platform");

  return {
    version: normalizedVersion,
    protocolVersion: APP_SERVER_PROTOCOL_VERSION,
    artifacts: [
      {
        platform: normalizedPlatform,
        url: `app-resource://app-server/${normalizedPlatform}/${path.basename(normalizedBinaryPath)}`,
        sha256: await sha256File(normalizedBinaryPath),
      },
    ],
  };
}

export async function prepareElectronAppServerAssets({
  repoRoot = process.cwd(),
  outputRoot = electronAppServerResourcesRoot(repoRoot),
  platform = process.platform,
  arch = process.arch,
  sourceBinary = resolveDevAppServerBinary({
    repoRoot,
    platform,
    forceBuild: true,
  }),
  readPackageJson = readJsonFile,
  copy = copyFile,
  makeDir = mkdir,
  write = writeFile,
  getStat = stat,
  changeMode = chmod,
  sha256File = hashFile,
} = {}) {
  const packageJson = await readPackageJson(path.resolve(repoRoot, "package.json"));
  const version = requiredValue(packageJson.version, "package version");
  const destination = electronAppServerBinaryDestination({
    outputRoot,
    platform,
    arch,
  });
  const manifestPath = electronAppServerManifestPath({ outputRoot });

  await makeDir(path.dirname(destination), { recursive: true });
  await rm(destination, { force: true });
  await copy(path.resolve(sourceBinary), destination);
  await clearMacLaunchBlockingXattrs(destination, platform);
  const sourceStat = await getStat(path.resolve(sourceBinary));
  await changeMode(destination, sourceStat.mode);

  const manifest = await buildElectronAppServerReleaseManifest({
    binaryPath: destination,
    version,
    platform: appServerResourcePlatformKey(platform, arch),
    sha256File,
  });
  await write(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  return {
    sourceBinary: path.resolve(sourceBinary),
    binaryPath: destination,
    manifestPath,
    manifest,
  };
}

export function resolveElectronAppServerRuntimeEnv({
  env = process.env,
  repoRoot = process.cwd(),
  platform = process.platform,
  manifestPath = electronAppServerManifestPath({
    outputRoot: electronAppServerResourcesRoot(repoRoot),
  }),
  exists = existsSync,
  resolveBinary = resolveDevAppServerBinary,
} = {}) {
  const envBinary = env.APP_SERVER_BIN?.trim();
  if (envBinary) {
    return { APP_SERVER_BIN: envBinary };
  }
  if (exists(manifestPath)) {
    return {};
  }
  return {
    APP_SERVER_BIN: resolveBinary({ env, repoRoot, platform }),
  };
}

async function hashFile(filePath) {
  const content = await readFile(filePath);
  return createHash("sha256").update(content).digest("hex");
}

async function readJsonFile(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function clearMacLaunchBlockingXattrs(filePath, platform) {
  if (platform !== "darwin") {
    return;
  }

  for (const attribute of MACOS_LAUNCH_BLOCKING_XATTRS) {
    try {
      await execFileAsync("xattr", ["-d", attribute, filePath]);
    } catch (error) {
      const stderr = String(error?.stderr || "");
      if (stderr.includes("No such xattr") || stderr.includes("No such file")) {
        continue;
      }
      throw error;
    }
  }
}

function requiredValue(value, name) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    throw new Error(`${name} is required`);
  }
  return normalized;
}
