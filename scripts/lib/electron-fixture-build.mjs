import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { electronAppServerBinaryDestination } from "./electron-app-server-assets.mjs";

const BUILD_READY_ENV = "LIME_ELECTRON_FIXTURE_BUILD_READY";
const SOURCE_EXTENSIONS = new Set([
  ".cjs",
  ".css",
  ".html",
  ".ico",
  ".gif",
  ".js",
  ".jpeg",
  ".jpg",
  ".json",
  ".json5",
  ".jsx",
  ".less",
  ".md",
  ".mdx",
  ".mjs",
  ".mp3",
  ".png",
  ".rs",
  ".sass",
  ".scss",
  ".svg",
  ".toml",
  ".ts",
  ".tsx",
  ".wav",
  ".wasm",
  ".webp",
  ".woff",
  ".woff2",
  ".yaml",
  ".yml",
]);
const BUILD_SOURCE_DIRS = [
  "src",
  "electron",
  "public",
  "packages/app-server-client/src",
  "lime-rs/crates",
];
const BUILD_SOURCE_FILES = [
  "forge.config.mjs",
  "index.html",
  "package-lock.json",
  "package.json",
  "tsconfig.electron.json",
  "tsconfig.json",
  "tsconfig.node.json",
  "tsconfig.renderer.json",
  "vite.config.ts",
  "lime-rs/Cargo.lock",
  "lime-rs/Cargo.toml",
  "packages/app-server-client/package.json",
  "packages/app-server-client/tsconfig.json",
  "scripts/electron/build-host.mjs",
  "scripts/electron/build-renderer-smoke.mjs",
  "scripts/electron/build-renderer.mjs",
  "scripts/electron/copy-desktop-assets.mjs",
  "scripts/electron/prepare-app-server-assets.mjs",
  "scripts/generate-extension-site-adapter-runners.mjs",
  "scripts/lib/electron-app-server-assets.mjs",
  "scripts/lib/electron-dev-sidecar.mjs",
];
const IGNORED_DIR_NAMES = new Set([
  ".git",
  ".next",
  ".turbo",
  "coverage",
  "dist",
  "dist-electron",
  "node_modules",
  "target",
]);
const IGNORED_SOURCE_FILE_PATTERNS = [
  /(^|[/\\])__snapshots__([/\\]|$)/,
  /(^|[/\\])tests([/\\]|$)/,
  /\.spec\.[cm]?[jt]sx?$/,
  /\.test\.[cm]?[jt]sx?$/,
  /_test\.rs$/,
];

function npmCommand() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

export function electronFixtureBuildReadyEnv() {
  return BUILD_READY_ENV;
}

export function electronFixtureBuildRequiredFiles({ rootDir }) {
  return [
    path.join(rootDir, "dist", "index.html"),
    path.join(rootDir, "dist-electron", "main", "main.js"),
    path.join(rootDir, "dist-electron", "preload", "preload.cjs"),
    path.join(rootDir, "dist-electron", "app-server.release.json"),
    electronAppServerBinaryDestination({
      outputRoot: path.join(rootDir, "dist-electron"),
    }),
  ];
}

function isIgnoredSourceFile(filePath) {
  return IGNORED_SOURCE_FILE_PATTERNS.some((pattern) =>
    pattern.test(filePath),
  );
}

function statFile(filePath) {
  try {
    return statSync(filePath);
  } catch {
    return null;
  }
}

function createMtimeEntry(rootDir, filePath, stats) {
  return {
    path: filePath,
    relativePath: path.relative(rootDir, filePath),
    mtimeMs: stats.mtimeMs,
  };
}

function pickOlder(left, right) {
  if (!left) {
    return right;
  }
  if (!right) {
    return left;
  }
  return right.mtimeMs < left.mtimeMs ? right : left;
}

function pickNewer(left, right) {
  if (!left) {
    return right;
  }
  if (!right) {
    return left;
  }
  return right.mtimeMs > left.mtimeMs ? right : left;
}

function findOldestRequiredArtifact(rootDir, requiredFiles) {
  return requiredFiles.reduce((oldest, filePath) => {
    const stats = statFile(filePath);
    if (!stats?.isFile()) {
      return oldest;
    }
    return pickOlder(oldest, createMtimeEntry(rootDir, filePath, stats));
  }, null);
}

function findNewestBuildInputInDir(rootDir, sourceDir) {
  const absoluteDir = path.join(rootDir, sourceDir);
  const rootStats = statFile(absoluteDir);
  if (!rootStats?.isDirectory()) {
    return null;
  }

  const stack = [absoluteDir];
  let newest = null;
  while (stack.length > 0) {
    const currentDir = stack.pop();
    const entries = readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        if (!IGNORED_DIR_NAMES.has(entry.name)) {
          stack.push(entryPath);
        }
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      if (
        !SOURCE_EXTENSIONS.has(path.extname(entry.name)) ||
        isIgnoredSourceFile(entryPath)
      ) {
        continue;
      }
      const stats = statFile(entryPath);
      if (stats?.isFile()) {
        newest = pickNewer(
          newest,
          createMtimeEntry(rootDir, entryPath, stats),
        );
      }
    }
  }
  return newest;
}

function findNewestBuildInput(rootDir) {
  let newest = null;
  for (const sourceFile of BUILD_SOURCE_FILES) {
    const filePath = path.join(rootDir, sourceFile);
    const stats = statFile(filePath);
    if (stats?.isFile()) {
      newest = pickNewer(newest, createMtimeEntry(rootDir, filePath, stats));
    }
  }
  for (const sourceDir of BUILD_SOURCE_DIRS) {
    newest = pickNewer(
      newest,
      findNewestBuildInputInDir(rootDir, sourceDir),
    );
  }
  return newest;
}

export function inspectElectronFixtureBuildFreshness({ rootDir }) {
  const requiredFiles = electronFixtureBuildRequiredFiles({ rootDir });
  const missingFiles = requiredFiles.filter((filePath) => !existsSync(filePath));
  if (missingFiles.length > 0) {
    return {
      ready: false,
      reason: "missing-artifacts",
      requiredFiles,
      missingFiles,
      newestSource: findNewestBuildInput(rootDir),
      oldestArtifact: null,
    };
  }

  const oldestArtifact = findOldestRequiredArtifact(rootDir, requiredFiles);
  const newestSource = findNewestBuildInput(rootDir);
  if (
    oldestArtifact &&
    newestSource &&
    newestSource.mtimeMs > oldestArtifact.mtimeMs
  ) {
    return {
      ready: false,
      reason: "stale-source",
      requiredFiles,
      missingFiles: [],
      newestSource,
      oldestArtifact,
    };
  }

  return {
    ready: true,
    reason: "fresh-artifacts",
    requiredFiles,
    missingFiles: [],
    newestSource,
    oldestArtifact,
  };
}

export function ensureElectronFixtureBuild({
  appUrl = "",
  logPrefix,
  rootDir,
}) {
  if (appUrl) {
    return {
      status: "skipped",
      reason: "app-url",
    };
  }

  if (process.env[BUILD_READY_ENV] === "1") {
    return {
      status: "skipped",
      reason: BUILD_READY_ENV,
    };
  }

  const freshness = inspectElectronFixtureBuildFreshness({ rootDir });
  if (freshness.ready) {
    console.log(
      `[${logPrefix}] reusing fresh packaged fixture assets; oldest=${freshness.oldestArtifact?.relativePath ?? "unknown"} newestSource=${freshness.newestSource?.relativePath ?? "none"}`,
    );
    process.env[BUILD_READY_ENV] = "1";
    return {
      status: "reused",
      reason: freshness.reason,
      freshness,
    };
  }

  console.log(
    `\n[${logPrefix}] > Electron fixture packaged renderer/assets build`,
  );
  if (freshness.missingFiles.length > 0) {
    console.log(
      `[${logPrefix}] missing build artifacts: ${freshness.missingFiles
        .map((filePath) => path.relative(rootDir, filePath))
        .join(", ")}`,
    );
  } else {
    console.log(
      `[${logPrefix}] rebuilding packaged fixture assets to avoid stale dist; newestSource=${freshness.newestSource?.relativePath ?? "unknown"} oldestArtifact=${freshness.oldestArtifact?.relativePath ?? "unknown"}`,
    );
  }

  const result = spawnSync(npmCommand(), ["run", "electron:build:smoke"], {
    cwd: rootDir,
    stdio: "inherit",
    env: {
      ...process.env,
      LIME_ALLOW_LIVE_PROVIDER_SMOKE: "0",
      LIME_REAL_API_TEST: "0",
    },
  });

  if (result.error) {
    throw result.error;
  }
  if (typeof result.status === "number" && result.status !== 0) {
    const error = new Error(
      `[${logPrefix}] Electron fixture packaged renderer/assets build 失败`,
    );
    error.exitCode = result.status;
    throw error;
  }

  process.env[BUILD_READY_ENV] = "1";
  return {
    status: freshness.missingFiles.length > 0 ? "built" : "rebuilt",
    missingFiles: freshness.missingFiles,
    freshness,
  };
}
