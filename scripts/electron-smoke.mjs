import electronPath from "electron";
import { spawnElectron } from "./lib/electron-launcher.mjs";
import { resolveElectronAppServerRuntimeEnv } from "./lib/electron-app-server-assets.mjs";

const appServerEnv = resolveElectronAppServerRuntimeEnv();

const child = spawnElectron({
  electronPath,
  env: {
    ...process.env,
    ...appServerEnv,
    LIME_ELECTRON_SMOKE: "1",
  },
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
