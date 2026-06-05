#!/usr/bin/env node

import { spawn } from "node:child_process";

const env = {
  ...process.env,
  CSC_IDENTITY_AUTO_DISCOVERY: "false",
};

const child = spawn(
  "npx",
  ["electron-builder", "--dir", "--publish", "never"],
  {
    env,
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
