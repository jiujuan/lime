import electronPath from "electron";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnElectron } from "../lib/electron-launcher.mjs";
import { resolveElectronAppServerRuntimeEnv } from "../lib/electron-app-server-assets.mjs";

const appServerEnv = resolveElectronAppServerRuntimeEnv();
const userDataDir =
  process.env.ELECTRON_E2E_USER_DATA_DIR?.trim() ||
  mkdtempSync(path.join(os.tmpdir(), "lime-electron-smoke-userdata-"));
const shouldRemoveUserDataDir = !process.env.ELECTRON_E2E_USER_DATA_DIR?.trim();
const smokeVisible = process.env.LIME_ELECTRON_SMOKE_VISIBLE?.trim() === "1";

function cleanupUserDataDir() {
  if (!shouldRemoveUserDataDir) {
    return;
  }
  rmSync(userDataDir, { recursive: true, force: true });
}

const child = spawnElectron({
  electronPath,
  args: ["--use-mock-keychain", "."],
  env: {
    ...process.env,
    ...appServerEnv,
    ELECTRON_E2E_USER_DATA_DIR: userDataDir,
    LIME_ELECTRON_E2E: "1",
    LIME_ELECTRON_SMOKE: "1",
    LIME_ELECTRON_SMOKE_VISIBLE: smokeVisible ? "1" : "0",
  },
});

const timeout = setTimeout(() => {
  child.kill();
  console.error("[electron-smoke] timed out waiting for renderer/workbench");
  cleanupUserDataDir();
  process.exit(1);
}, 120_000);

child.once("exit", (code) => {
  clearTimeout(timeout);
  cleanupUserDataDir();
  process.exit(code ?? 0);
});

child.once("error", (error) => {
  clearTimeout(timeout);
  console.error(error);
  cleanupUserDataDir();
  process.exit(1);
});
