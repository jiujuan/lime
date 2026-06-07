import electronPath from "electron";
import { spawnElectron } from "../lib/electron-launcher.mjs";
import { resolveElectronAppServerRuntimeEnv } from "../lib/electron-app-server-assets.mjs";

const appServerEnv = resolveElectronAppServerRuntimeEnv();

const electron = spawnElectron({
  electronPath,
  env: {
    ...process.env,
    ...appServerEnv,
  },
});

electron.once("exit", (code) => {
  process.exit(code ?? 0);
});
