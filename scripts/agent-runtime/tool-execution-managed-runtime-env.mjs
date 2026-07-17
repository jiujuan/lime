import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const TEMP_CLEANUP_RETRY_COUNT = 8;
const TEMP_CLEANUP_RETRY_DELAY_MS = 250;

export function createToolExecutionTempRuntimeEnv() {
  const tempRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "tool-execution-managed-electron-"),
  );
  const home = path.join(tempRoot, "home");
  const xdgDataHome = path.join(tempRoot, "xdg-data");
  const localAppData = path.join(tempRoot, "local-app-data");
  const roamingAppData = path.join(tempRoot, "roaming-app-data");
  const electronUserDataDir = path.join(tempRoot, "electron-user-data");
  const agentRoot = path.join(tempRoot, "agent");

  for (const dir of [
    home,
    xdgDataHome,
    localAppData,
    roamingAppData,
    electronUserDataDir,
    agentRoot,
  ]) {
    fs.mkdirSync(dir, { recursive: true });
  }

  return {
    tempRoot,
    electronUserDataDir,
    env: {
      ...process.env,
      HOME: home,
      XDG_DATA_HOME: xdgDataHome,
      APPDATA: roamingAppData,
      LOCALAPPDATA: localAppData,
      LIME_AGENT_RUNTIME_ROOT: agentRoot,
    },
  };
}

export function cleanupToolExecutionTempRoot(
  tempRoot,
  { logPrefix, sanitizeText },
) {
  try {
    fs.rmSync(tempRoot, {
      recursive: true,
      force: true,
      maxRetries: TEMP_CLEANUP_RETRY_COUNT,
      retryDelay: TEMP_CLEANUP_RETRY_DELAY_MS,
    });
  } catch (error) {
    console.warn(
      `${logPrefix} temp cleanup skipped path=${tempRoot} error=${sanitizeText(error)}`,
    );
  }
}
