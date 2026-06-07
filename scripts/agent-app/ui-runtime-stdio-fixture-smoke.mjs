#!/usr/bin/env node

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import { localAppServerBinaryPath } from "../lib/electron-dev-sidecar.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../..");

const DEFAULTS = {
  appServerBin:
    process.env.APP_SERVER_BIN?.trim() ||
    localAppServerBinaryPath({ repoRoot }),
  fixtureDir: path.join(
    repoRoot,
    ".lime",
    "qc",
    "agent-apps-runtime-fixtures",
    "content-factory-app",
  ),
  evidenceDir: path.join(
    repoRoot,
    ".lime",
    "qc",
    "gui-evidence",
    "agent-app-ui-runtime-stdio-fixture",
  ),
  prefix: "agent-app-ui-runtime-stdio-fixture",
  timeoutMs: 120_000,
  keepTemp: false,
};

const APP_ID = "content-factory-app";
const ENTRY_KEY = "dashboard";
const ENTRY_ROUTE = "/dashboard";

function printHelp() {
  console.log(`
Agent App UI Runtime Stdio Fixture Smoke

用途:
  用临时 app data 种子 fixture Agent App installed state，
  通过 App Server stdio JSON-RPC current method 验证真实 UI runtime 子进程生命周期：
  agentAppUiRuntime/start -> /api/bootstrap ready -> entryUrl -> status running -> stop。

说明:
  本脚本不调用 legacy agent_app_* 命令，不写真实用户 app data，不消耗 live provider。
  installed state 仅作为测试夹具写入临时 HOME / XDG_DATA_HOME / APPDATA。

用法:
  node scripts/agent-app/ui-runtime-stdio-fixture-smoke.mjs

选项:
  --app-server-bin <path>  app-server 二进制，默认 lime-rs/target/debug/app-server 或 APP_SERVER_BIN
  --fixture-dir <path>     fixture Agent App 目录，默认 .lime/qc/agent-apps-runtime-fixtures/content-factory-app
  --evidence-dir <path>    证据目录，默认 .lime/qc/gui-evidence/agent-app-ui-runtime-stdio-fixture
  --prefix <name>          证据文件前缀
  --timeout-ms <ms>        总超时，默认 120000
  --keep-temp              保留临时 app data 目录便于调试
  -h, --help               显示帮助
`);
}

function parseArgs(argv) {
  const options = { ...DEFAULTS };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "-h" || arg === "--help") {
      printHelp();
      process.exit(0);
    }
    if (arg === "--app-server-bin" && next) {
      options.appServerBin = path.resolve(next.trim());
      index += 1;
      continue;
    }
    if (arg === "--fixture-dir" && next) {
      options.fixtureDir = path.resolve(next.trim());
      index += 1;
      continue;
    }
    if (arg === "--evidence-dir" && next) {
      options.evidenceDir = path.resolve(next.trim());
      index += 1;
      continue;
    }
    if (arg === "--prefix" && next) {
      options.prefix = next.trim();
      index += 1;
      continue;
    }
    if (arg === "--timeout-ms" && next) {
      options.timeoutMs = Number(next);
      index += 1;
      continue;
    }
    if (arg === "--keep-temp") {
      options.keepTemp = true;
    }
  }

  if (!options.appServerBin || !fs.existsSync(options.appServerBin)) {
    throw new Error(
      `app-server binary 不存在: ${options.appServerBin}。请先运行 cargo build --manifest-path "lime-rs/Cargo.toml" -p app-server --bin app-server`,
    );
  }
  if (!fs.existsSync(options.fixtureDir)) {
    throw new Error(`fixture Agent App 目录不存在: ${options.fixtureDir}`);
  }
  for (const fileName of ["APP.md", "package.json", "server.mjs"]) {
    const filePath = path.join(options.fixtureDir, fileName);
    if (!fs.existsSync(filePath)) {
      throw new Error(`fixture Agent App 缺少 ${fileName}: ${filePath}`);
    }
  }
  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs < 30_000) {
    throw new Error("--timeout-ms 必须是 >= 30000 的数字");
  }
  if (!options.evidenceDir || !options.prefix) {
    throw new Error("--evidence-dir / --prefix 均不能为空");
  }
  return options;
}

function createTempRuntimeEnv() {
  const tempRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "agent-app-ui-runtime-stdio-"),
  );
  const home = path.join(tempRoot, "home");
  const xdgDataHome = path.join(tempRoot, "xdg-data");
  const localAppData = path.join(tempRoot, "local-app-data");
  const roamingAppData = path.join(tempRoot, "roaming-app-data");
  for (const dir of [home, xdgDataHome, localAppData, roamingAppData]) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const appDataDir = resolveTempPreferredDataDir({
    home,
    xdgDataHome,
    localAppData,
    platform: process.platform,
  });
  fs.mkdirSync(appDataDir, { recursive: true });

  return {
    tempRoot,
    appDataDir,
    env: {
      ...process.env,
      HOME: home,
      XDG_DATA_HOME: xdgDataHome,
      APPDATA: roamingAppData,
      LOCALAPPDATA: localAppData,
    },
  };
}

function resolveTempPreferredDataDir({
  home,
  xdgDataHome,
  localAppData,
  platform,
}) {
  if (platform === "win32") {
    return path.join(localAppData, "lime");
  }
  if (platform === "darwin") {
    return path.join(home, "Library", "Application Support", "lime");
  }
  return path.join(xdgDataHome, "lime");
}

function buildInstalledState(fixtureDir) {
  const now = new Date().toISOString();
  const entry = {
    appId: APP_ID,
    key: ENTRY_KEY,
    kind: "page",
    title: "项目首页",
    route: ENTRY_ROUTE,
    presentation: "eligible-for-main-entry",
    readiness: "ready",
    requiredCapabilities: [],
    provenance: {
      sourceKind: "agent_app",
      appId: APP_ID,
      appVersion: "0.3.0",
      packageHash: "sha256:fixture-agent-app-ui-runtime",
      manifestHash: "sha256:fixture-agent-app-ui-runtime-manifest",
      entryKey: ENTRY_KEY,
    },
  };
  return {
    appId: APP_ID,
    identity: {
      appId: APP_ID,
      appVersion: "0.3.0",
      sourceKind: "local_folder",
      sourceUri: fixtureDir,
      packageHash: "sha256:fixture-agent-app-ui-runtime",
      manifestHash: "sha256:fixture-agent-app-ui-runtime-manifest",
      loadedAt: now,
    },
    manifest: {
      manifestVersion: "0.3.0",
      name: APP_ID,
      displayName: "内容工厂",
      version: "0.3.0",
      entries: [
        {
          key: ENTRY_KEY,
          kind: "page",
          title: "项目首页",
          route: ENTRY_ROUTE,
        },
      ],
    },
    projection: {
      app: {
        appId: APP_ID,
        displayName: "内容工厂",
        version: "0.3.0",
        status: "ready",
        appType: "domain-app",
        description: "Agent App UI runtime stdio fixture",
      },
      package: {
        appId: APP_ID,
        appVersion: "0.3.0",
        sourceKind: "local_folder",
        sourceUri: fixtureDir,
        packageHash: "sha256:fixture-agent-app-ui-runtime",
        manifestHash: "sha256:fixture-agent-app-ui-runtime-manifest",
      },
      entries: [entry],
      requiredCapabilities: [],
      runtimePackage: { hasUiBundle: true, hasWorkerBundle: false },
      knowledgeBindings: [],
      artifactTypes: [],
      policies: [],
      services: [],
      workflows: [],
      skillRequirements: [],
      toolRequirements: [],
      evals: [],
      events: [],
      secrets: [],
      overlayTemplates: [],
    },
    readiness: {
      appId: APP_ID,
      status: "ready",
      checkedAt: now,
      blockers: [],
      warnings: [],
      installModes: [
        {
          mode: "in_lime",
          status: "ready",
          runtimeVersion: "0.3.0",
          blockers: [],
          warnings: [],
        },
      ],
    },
    setup: {},
    disabled: false,
    installedAt: now,
    updatedAt: now,
  };
}

function seedInstalledState(appDataDir, fixtureDir, evidenceDir, prefix) {
  const state = buildInstalledState(fixtureDir);
  const envelope = {
    schemaVersion: 1,
    savedAt: new Date().toISOString(),
    state,
  };
  const installedDir = path.join(appDataDir, "agent-apps", "installed");
  fs.mkdirSync(installedDir, { recursive: true });
  const installedPath = path.join(installedDir, `${APP_ID}.json`);
  fs.writeFileSync(installedPath, `${JSON.stringify(envelope, null, 2)}\n`);

  const evidenceSeedPath = path.join(
    evidenceDir,
    `${prefix}-installed-state-seed.json`,
  );
  fs.writeFileSync(evidenceSeedPath, `${JSON.stringify(envelope, null, 2)}\n`);

  return { installedPath, evidenceSeedPath, state };
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function sanitizeText(value) {
  const sanitized = String(value ?? "")
    .replace(
      /((?:api[_-]?key|authorization|password|secret|session|token)[^=\s]*=)(["']?)[^\s"']+/gi,
      "$1$2[redacted]",
    )
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, "$1[redacted]");
  return sanitized.length > 2_000
    ? `${sanitized.slice(0, 2_000)}... [truncated ${sanitized.length - 2_000} chars]`
    : sanitized;
}

function sanitizeJson(value, depth = 0) {
  if (depth > 8) {
    return "[truncated-depth]";
  }
  if (typeof value === "string") {
    return sanitizeText(value);
  }
  if (
    value === null ||
    value === undefined ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value ?? null;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 80).map((item) => sanitizeJson(item, depth + 1));
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 120)
        .map(([key, item]) => [key, sanitizeJson(item, depth + 1)]),
    );
  }
  return sanitizeText(String(value));
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function logStage(stage) {
  console.log(`[smoke:agent-app-ui-runtime-stdio-fixture] stage=${stage}`);
}

async function fetchWithTimeout(url, timeoutMs) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(Math.min(timeoutMs, 10_000)),
  });
  const contentType = response.headers.get("content-type") ?? "";
  const body = await response.text();
  return {
    ok: response.ok,
    status: response.status,
    contentType,
    bodyLength: body.length,
    bodyPreview: sanitizeText(body.slice(0, 500)),
  };
}

function startJsonRpcProcess(options, runtimeEnv) {
  const child = spawn(
    options.appServerBin,
    ["--stdio", "--backend", "unavailable"],
    {
      cwd: repoRoot,
      env: runtimeEnv.env,
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
  const stderr = [];
  const messages = [];
  const pending = new Map();
  let nextId = 1;

  child.stderr.on("data", (chunk) => {
    stderr.push(sanitizeText(chunk.toString("utf8")));
  });

  const rl = readline.createInterface({ input: child.stdout });
  rl.on("line", (line) => {
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      messages.push({ raw: sanitizeText(line), parseError: true });
      return;
    }
    messages.push(message);
    const id = message?.id;
    if (id === undefined || id === null) {
      return;
    }
    const key = String(id);
    const waiter = pending.get(key);
    if (!waiter) {
      return;
    }
    pending.delete(key);
    clearTimeout(waiter.timeout);
    if (message.error) {
      waiter.reject(
        new Error(
          `${waiter.method} returned JSON-RPC error: ${message.error.message}`,
        ),
      );
    } else {
      waiter.resolve(message);
    }
  });

  child.on("exit", (code, signal) => {
    const error = new Error(
      `app-server exited before pending requests settled: code=${code} signal=${signal}`,
    );
    for (const waiter of pending.values()) {
      clearTimeout(waiter.timeout);
      waiter.reject(error);
    }
    pending.clear();
  });

  function request(method, params = {}, timeoutMs = 15_000) {
    const id = nextId;
    nextId += 1;
    const payload = {
      jsonrpc: "2.0",
      id,
      method,
      params,
    };
    const line = `${JSON.stringify(payload)}\n`;
    messages.push({ direction: "request", ...payload });
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        pending.delete(String(id));
        reject(new Error(`${method} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      pending.set(String(id), { method, timeout, resolve, reject });
      child.stdin.write(line, "utf8", (error) => {
        if (error) {
          clearTimeout(timeout);
          pending.delete(String(id));
          reject(error);
        }
      });
    });
  }

  function notify(method, params = {}) {
    const payload = {
      jsonrpc: "2.0",
      method,
      params,
    };
    messages.push({ direction: "notification", ...payload });
    child.stdin.write(`${JSON.stringify(payload)}\n`);
  }

  async function close() {
    for (const waiter of pending.values()) {
      clearTimeout(waiter.timeout);
      waiter.reject(new Error("closing app-server stdio process"));
    }
    pending.clear();
    child.stdin.end();
    await new Promise((resolve) => {
      const timeout = setTimeout(() => {
        child.kill();
        resolve();
      }, 2_000);
      child.once("exit", () => {
        clearTimeout(timeout);
        resolve();
      });
    });
  }

  return { child, request, notify, close, stderr, messages };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  fs.mkdirSync(options.evidenceDir, { recursive: true });
  const runtimeEnv = createTempRuntimeEnv();
  const seed = seedInstalledState(
    runtimeEnv.appDataDir,
    options.fixtureDir,
    options.evidenceDir,
    options.prefix,
  );
  const startedAt = Date.now();
  const rpc = startJsonRpcProcess(options, runtimeEnv);
  let summary = null;

  try {
    logStage("initialize");
    const initialize = await rpc.request(
      "initialize",
      {
        clientInfo: {
          name: "agent-app-ui-runtime-stdio-fixture-smoke",
          version: "1.59.0",
        },
        capabilities: {
          experimental: true,
        },
      },
      Math.min(options.timeoutMs, 20_000),
    );
    rpc.notify("initialized");

    logStage("status-before-start");
    const statusBeforeStart = await rpc.request(
      "agentAppUiRuntime/status",
      { appId: APP_ID },
      15_000,
    );

    logStage("start-runtime");
    const start = await rpc.request(
      "agentAppUiRuntime/start",
      { appId: APP_ID, entryKey: ENTRY_KEY },
      Math.min(options.timeoutMs, 60_000),
    );
    const startResult = start.result;

    assert(startResult?.appId === APP_ID, "start result appId mismatch");
    assert(startResult?.status === "running", "start result should be running");
    assert(
      typeof startResult?.baseUrl === "string" && startResult.baseUrl,
      "start result should include baseUrl",
    );
    assert(
      typeof startResult?.entryUrl === "string" && startResult.entryUrl,
      "start result should include entryUrl",
    );
    assert(
      startResult.entryKey === ENTRY_KEY,
      `start result entryKey should be ${ENTRY_KEY}`,
    );

    logStage("probe-bootstrap");
    const bootstrapProbe = await fetchWithTimeout(
      `${startResult.baseUrl}/api/bootstrap`,
      options.timeoutMs,
    );
    assert(bootstrapProbe.ok, "/api/bootstrap should be ready");

    logStage("probe-entry-url");
    const entryProbe = await fetchWithTimeout(
      startResult.entryUrl,
      options.timeoutMs,
    );
    assert(entryProbe.ok, "entryUrl should be reachable");
    assert(
      entryProbe.bodyPreview.includes("内容工厂") ||
        entryProbe.bodyPreview.includes("工作台状态"),
      "entryUrl should return fixture UI HTML",
    );

    logStage("status-running");
    const statusRunning = await rpc.request(
      "agentAppUiRuntime/status",
      { appId: APP_ID },
      15_000,
    );
    assert(
      statusRunning.result?.status === "running",
      "status after start should be running",
    );

    logStage("stop-runtime");
    const stop = await rpc.request(
      "agentAppUiRuntime/stop",
      { appId: APP_ID },
      20_000,
    );
    assert(stop.result?.status === "stopped", "stop result should be stopped");

    logStage("status-after-stop");
    const statusAfterStop = await rpc.request(
      "agentAppUiRuntime/status",
      { appId: APP_ID },
      15_000,
    );
    assert(
      statusAfterStop.result?.status === "stopped",
      "status after stop should be stopped",
    );

    summary = {
      ok: true,
      appId: APP_ID,
      appServerBin: options.appServerBin,
      fixtureDir: options.fixtureDir,
      appDataDir: runtimeEnv.appDataDir,
      tempRoot: options.keepTemp ? runtimeEnv.tempRoot : null,
      installedStatePath: options.keepTemp ? seed.installedPath : null,
      installedStateSeedEvidence: seed.evidenceSeedPath,
      generatedAt: new Date().toISOString(),
      elapsedMs: Date.now() - startedAt,
      initialize: sanitizeJson(initialize.result),
      statusBeforeStart: sanitizeJson(statusBeforeStart.result),
      start: sanitizeJson(startResult),
      bootstrapProbe,
      entryProbe,
      statusRunning: sanitizeJson(statusRunning.result),
      stop: sanitizeJson(stop.result),
      statusAfterStop: sanitizeJson(statusAfterStop.result),
      jsonRpcMessageCount: rpc.messages.length,
      stderr: rpc.stderr,
    };

    const summaryPath = path.join(
      options.evidenceDir,
      `${options.prefix}-summary.json`,
    );
    const jsonRpcPath = path.join(
      options.evidenceDir,
      `${options.prefix}-jsonrpc.json`,
    );
    writeJson(summaryPath, summary);
    writeJson(jsonRpcPath, sanitizeJson(rpc.messages));
    console.log(
      `[smoke:agent-app-ui-runtime-stdio-fixture] summary=${summaryPath}`,
    );
    console.log(
      `[smoke:agent-app-ui-runtime-stdio-fixture] entryUrl=${startResult.entryUrl}`,
    );
  } catch (error) {
    const failurePath = path.join(
      options.evidenceDir,
      `${options.prefix}-failure-summary.json`,
    );
    writeJson(failurePath, {
      ok: false,
      appId: APP_ID,
      failedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error),
      appServerBin: options.appServerBin,
      fixtureDir: options.fixtureDir,
      appDataDir: runtimeEnv.appDataDir,
      tempRoot: options.keepTemp ? runtimeEnv.tempRoot : null,
      installedStatePath: options.keepTemp ? seed.installedPath : null,
      installedStateSeedEvidence: seed.evidenceSeedPath,
      jsonRpcMessages: sanitizeJson(rpc.messages),
      stderr: rpc.stderr,
    });
    console.error(
      `[smoke:agent-app-ui-runtime-stdio-fixture] failureSummary=${failurePath}`,
    );
    throw error;
  } finally {
    await rpc.close().catch(() => {});
    if (!options.keepTemp) {
      fs.rmSync(runtimeEnv.tempRoot, { recursive: true, force: true });
    }
  }

  return summary;
}

main().catch((error) => {
  console.error(
    `[smoke:agent-app-ui-runtime-stdio-fixture] failed: ${
      error instanceof Error ? error.message : String(error)
    }`,
  );
  process.exit(1);
});
