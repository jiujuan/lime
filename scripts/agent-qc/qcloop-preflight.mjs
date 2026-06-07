#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

import { buildQCLoopPreflightReport } from "../lib/agent-qc-qcloop-preflight-core.mjs";

function parseArgs(argv) {
  const result = {
    check: false,
    expectedCwd: "",
    format: "summary",
    help: false,
    healthUrl: "http://127.0.0.1:3030/health",
    requireDevBridge: false,
    timeoutMs: 15000,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--expected-cwd" && argv[index + 1]) {
      result.expectedCwd = String(argv[index + 1]).trim();
      index += 1;
      continue;
    }
    if (arg === "--health-url" && argv[index + 1]) {
      result.healthUrl = String(argv[index + 1]).trim();
      index += 1;
      continue;
    }
    if (arg === "--timeout-ms" && argv[index + 1]) {
      result.timeoutMs = Number(argv[index + 1]);
      index += 1;
      continue;
    }
    if (arg === "--format" && argv[index + 1]) {
      result.format = String(argv[index + 1]).trim();
      index += 1;
      continue;
    }
    if (arg === "--require-devbridge") {
      result.requireDevBridge = true;
      continue;
    }
    if (arg === "--check") {
      result.check = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      result.help = true;
    }
  }

  return result;
}

function printHelp() {
  console.log(`
Lime Agent QC qcloop Worker Preflight

用法:
  npm run agent-qc:qcloop-preflight -- --check
  npm run agent-qc:qcloop-preflight -- --require-devbridge --timeout-ms 15000 --check

选项:
  --expected-cwd PATH     预期仓库 cwd；不传则只检查 cwd 存在
  --require-devbridge    要求 http://127.0.0.1:3030/health 可访问
  --health-url URL       DevBridge health 地址，默认 http://127.0.0.1:3030/health
  --timeout-ms N         DevBridge health 超时，默认 15000
  --format FMT           summary | json
  --check                preflight blocked 时非 0 退出
  -h, --help             显示帮助
`);
}

function checkTmpWritable() {
  const filePath = path.join(
    os.tmpdir(),
    `lime-agent-qc-preflight-${process.pid}-${Date.now()}.tmp`,
  );
  try {
    fs.writeFileSync(filePath, "ok", "utf8");
    fs.unlinkSync(filePath);
    return true;
  } catch {
    return false;
  }
}

async function checkDevBridgeHealth({ url, timeoutMs }) {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    Number.isFinite(timeoutMs) ? timeoutMs : 15000,
  );
  try {
    const response = await fetch(url, { signal: controller.signal });
    const body = await response.text();
    let status = response.ok ? "ok" : `http-${response.status}`;
    try {
      const parsed = JSON.parse(body);
      status = parsed?.status || status;
    } catch {
      // health body 不是 JSON 时保留 HTTP 状态。
    }
    return { ok: response.ok, status, url };
  } catch (error) {
    return {
      ok: false,
      error: `${error.name || "Error"}: ${error.message}`,
      url,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function renderSummary(report) {
  const lines = [
    `status=${report.status}`,
    `summary=${report.summary}`,
    `QCLOOP_PREFLIGHT_RESULT=${report.status === "pass" ? "PASS" : "BLOCKED"}`,
  ];
  for (const check of report.checks) {
    lines.push(
      `- ${check.id} ${check.passed ? "PASS" : "BLOCKED"}: ${check.detail}`,
    );
  }
  return `${lines.join("\n")}\n`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const devBridge = options.requireDevBridge
    ? await checkDevBridgeHealth({
        url: options.healthUrl,
        timeoutMs: options.timeoutMs,
      })
    : null;
  const report = buildQCLoopPreflightReport({
    cwd: process.cwd(),
    expectedCwd: options.expectedCwd,
    tmpWritable: checkTmpWritable(),
    devBridge,
  });
  const content =
    options.format === "json"
      ? `${JSON.stringify(report, null, 2)}\n`
      : renderSummary(report);
  process.stdout.write(content);

  if (options.check && report.status !== "pass") {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(`[agent-qc-qcloop-preflight] ${error.message}`);
  process.exit(1);
});
