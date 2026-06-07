#!/usr/bin/env node

import { prepareElectronAppServerAssets } from "../lib/electron-app-server-assets.mjs";

const result = await prepareElectronAppServerAssets();

console.log(
  `[electron-assets] prepared app-server sidecar ${result.binaryPath} and ${result.manifestPath}`,
);
