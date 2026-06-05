import electronPath from "electron";
import { spawn } from "node:child_process";
import { resolveElectronAppServerRuntimeEnv } from "./lib/electron-app-server-assets.mjs";

const appServerEnv = resolveElectronAppServerRuntimeEnv();

const child = spawn(electronPath, ["."], {
  env: {
    ...process.env,
    ...appServerEnv,
    LIME_ELECTRON_SMOKE: "1",
  },
  stdio: "inherit",
  shell: process.platform === "win32",
});

const timeout = setTimeout(() => {
  child.kill();
  console.error("[electron-smoke] timed out waiting for renderer");
  process.exit(1);
}, 45_000);

child.once("exit", (code) => {
  clearTimeout(timeout);
  process.exit(code ?? 0);
});

child.once("error", (error) => {
  clearTimeout(timeout);
  console.error(error);
  process.exit(1);
});
