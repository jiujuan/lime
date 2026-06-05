#!/usr/bin/env node

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const devPort = process.env.LIME_DEV_PORT ?? process.env.PROXYCAST_DEV_PORT ?? "1420";
const projectRoot = path.resolve(process.cwd());
const repoRootMarker = path.join(projectRoot, "package.json");
const nestedRepoRootMarker = path.join(projectRoot, "..", "package.json");

const runningInsideRustWorkspace =
  path.basename(projectRoot) === "lime-rs" &&
  fs.existsSync(nestedRepoRootMarker);

if (runningInsideRustWorkspace) {
  console.error("[lime] 检测到在 lime-rs 子目录启动开发脚本。");
  console.error("[lime] 请回到仓库根目录执行：npm run dev");
  console.error(
    "[lime] 这样可以避免生成 lime-rs/lime-rs/target 目录。",
  );
  process.exit(1);
}

if (!fs.existsSync(repoRootMarker)) {
  console.error(`[lime] 当前目录缺少 package.json: ${projectRoot}`);
  console.error("[lime] 请在 lime 仓库根目录执行开发命令。");
  process.exit(1);
}

function run(command) {
  try {
    return execSync(command, { stdio: ["ignore", "pipe", "pipe"] })
      .toString("utf8")
      .trim();
  } catch {
    return "";
  }
}

function listListenPids(port) {
  const output = run(`lsof -nP -iTCP:${port} -sTCP:LISTEN -t`);
  if (!output) {
    return [];
  }
  return [
    ...new Set(
      output
        .split("\n")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
}

function readCommand(pid) {
  return run(`ps -p ${pid} -o command=`).trim();
}

function killPid(pid, signal) {
  try {
    process.kill(Number(pid), signal);
    return true;
  } catch {
    return false;
  }
}

if (process.platform === "win32") {
  process.exit(0);
}

const occupiedPids = listListenPids(devPort);
if (occupiedPids.length === 0) {
  process.exit(0);
}

const blockedProcesses = [];
const targetPids = [];

for (const pid of occupiedPids) {
  const command = readCommand(pid);
  const isViteProcess = command.includes("vite");
  const inCurrentProject = command.includes(projectRoot);

  if (isViteProcess && inCurrentProject) {
    targetPids.push(pid);
  } else {
    blockedProcesses.push({ pid, command: command || "unknown" });
  }
}

if (blockedProcesses.length > 0) {
  console.error(`[lime] 端口 ${devPort} 被其他进程占用，无法自动清理：`);
  for (const item of blockedProcesses) {
    console.error(`- PID ${item.pid}: ${item.command}`);
  }
  console.error("[lime] 请先结束占用进程后再重试启动。");
  process.exit(1);
}

for (const pid of targetPids) {
  killPid(pid, "SIGTERM");
}

const stillOccupied = listListenPids(devPort);
for (const pid of stillOccupied) {
  if (targetPids.includes(pid)) {
    killPid(pid, "SIGKILL");
  }
}

const unresolved = listListenPids(devPort);
if (unresolved.length > 0) {
  console.error(`[lime] 端口 ${devPort} 仍被占用，请手动清理后重试。`);
  process.exit(1);
}

if (targetPids.length > 0) {
  console.log(
    `[lime] 已清理 ${targetPids.length} 个残留 vite 进程（端口 ${devPort}）。`,
  );
}
