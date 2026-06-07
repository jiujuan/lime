#!/usr/bin/env node

import { spawn } from "node:child_process";

const arch = process.env.npm_config_arch || process.arch;
const platform = process.env.npm_config_platform || process.platform;

const child = spawn(
  "npx",
  ["electron-forge", "package", "--platform", platform, "--arch", arch],
  {
    stdio: "inherit",
    shell: process.platform === "win32",
  },
);

child.once("exit", (code) => {
  process.exit(code ?? 0);
});

child.once("error", (error) => {
  console.error(error);
  process.exit(1);
});
