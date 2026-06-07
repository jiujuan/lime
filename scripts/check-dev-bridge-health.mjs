#!/usr/bin/env node

import process from "node:process";

const DEFAULTS = {
  url: "http://127.0.0.1:3030/health",
  timeoutMs: 60000,
  intervalMs: 1000,
};

function printHelp() {
  console.log(`
Lime DevBridge 健康检查

用法:
  node scripts/check-dev-bridge-health.mjs [选项]

选项:
  --url <health_url>      健康检查地址，默认 http://127.0.0.1:3030/health
  --timeout-ms <ms>       超时时间，默认 60000
  --interval-ms <ms>      轮询间隔，默认 1000
  -h, --help              显示帮助

示例:
  npm run bridge:health
  npm run bridge:health -- --timeout-ms 120000
`);
}

function parseArgs(argv) {
  const options = { ...DEFAULTS };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if ((arg === "--help") || (arg === "-h")) {
      printHelp();
      process.exit(0);
    }
    if (arg === "--url" && argv[index + 1]) {
      options.url = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--timeout-ms" && argv[index + 1]) {
      options.timeoutMs = Number(argv[index + 1]);
      index += 1;
      continue;
    }
    if (arg === "--interval-ms" && argv[index + 1]) {
      options.intervalMs = Number(argv[index + 1]);
      index += 1;
      continue;
    }
  }

  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs < 1000) {
    throw new Error("--timeout-ms 必须是 >= 1000 的数字");
  }
  if (!Number.isFinite(options.intervalMs) || options.intervalMs < 100) {
    throw new Error("--interval-ms 必须是 >= 100 的数字");
  }

  return options;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function checkOnce(url) {
  const response = await fetch(url, { method: "GET" });
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }

  return payload;
}

async function main() {
  if (typeof fetch !== "function") {
    throw new Error("当前 Node 运行时不支持 fetch，请使用 Node 18+");
  }

  const options = parseArgs(process.argv.slice(2));
  const startedAt = Date.now();
  let lastError = null;

  console.log(`[bridge:health] 开始检查: ${options.url}`);

  while (Date.now() - startedAt < options.timeoutMs) {
    try {
      const payload = await checkOnce(options.url);
      const elapsed = Date.now() - startedAt;
      const status = payload && typeof payload === "object" ? payload.status : undefined;
      console.log(
        `[bridge:health] 就绪: ${options.url} (${elapsed}ms)${status ? ` status=${status}` : ""}`
      );
      return;
    } catch (error) {
      lastError = error;
      await sleep(options.intervalMs);
    }
  }

  const detail = lastError instanceof Error ? lastError.message : String(lastError || "unknown error");
  throw new Error(
    `[bridge:health] 超时未就绪: ${options.url}。请先启动 npm run electron:dev，并确认 DevBridge 已监听 3030。最后错误: ${detail}`
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
