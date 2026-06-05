#!/usr/bin/env node

import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

function printHelp() {
  console.log(`
Lime GUI 冒烟入口

用途:
  验证 Electron Desktop Host current GUI smoke。
  旧 GUI 宿主已在当前版本下线，本入口不再启动旧 GUI 宿主。

用法:
  npm run verify:gui-smoke
  node scripts/verify-gui-smoke.mjs

说明:
  该脚本保留文件名用于旧自动化入口兼容，实际执行 npm run smoke:electron。
`);
}

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  printHelp();
  process.exit(0);
}

const child = spawn(npmCommand, ["run", "smoke:electron"], {
  cwd: rootDir,
  env: process.env,
  stdio: "inherit",
  shell: process.platform === "win32",
});

child.once("exit", (code, signal) => {
  if (signal) {
    console.error(`[verify:gui-smoke] Electron smoke terminated by ${signal}`);
    process.exit(1);
  }
  process.exit(code ?? 0);
});

child.once("error", (error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
