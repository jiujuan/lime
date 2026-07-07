import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const BUILD_READY_ENV = "LIME_ELECTRON_FIXTURE_BUILD_READY";

function npmCommand() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

export function electronFixtureBuildReadyEnv() {
  return BUILD_READY_ENV;
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

  const requiredFiles = [
    path.join(rootDir, "dist", "index.html"),
    path.join(rootDir, "dist-electron", "main", "main.js"),
    path.join(rootDir, "dist-electron", "app-server.release.json"),
  ];
  const missingFiles = requiredFiles.filter(
    (filePath) => !existsSync(filePath),
  );

  console.log(
    `\n[${logPrefix}] > Electron fixture packaged renderer/assets build`,
  );
  if (missingFiles.length > 0) {
    console.log(
      `[${logPrefix}] missing build artifacts: ${missingFiles
        .map((filePath) => path.relative(rootDir, filePath))
        .join(", ")}`,
    );
  } else {
    console.log(
      `[${logPrefix}] rebuilding packaged fixture assets to avoid stale dist`,
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
    status: missingFiles.length > 0 ? "built" : "rebuilt",
    missingFiles,
  };
}
