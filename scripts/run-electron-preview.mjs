import electronPath from "electron";
import { spawn } from "node:child_process";
import { resolveElectronAppServerRuntimeEnv } from "./lib/electron-app-server-assets.mjs";

const appServerEnv = resolveElectronAppServerRuntimeEnv();

const electron = spawn(electronPath, ["."], {
  env: {
    ...process.env,
    ...appServerEnv,
  },
  stdio: "inherit",
  shell: process.platform === "win32",
});

electron.once("exit", (code) => {
  process.exit(code ?? 0);
});
