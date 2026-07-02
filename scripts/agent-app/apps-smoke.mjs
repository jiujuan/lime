#!/usr/bin/env node

import fs from "node:fs";
import { execFile } from "node:child_process";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { chromium } from "playwright";
import {
  assertLiveProviderSmokeAllowed,
  liveProviderSmokeAllowed,
} from "../lib/live-provider-smoke-gate.mjs";

const execFileAsync = promisify(execFile);

const DEFAULTS = {
  appUrl: "http://127.0.0.1:1420/",
  healthUrl: "http://127.0.0.1:3030/health",
  timeoutMs: 120_000,
  intervalMs: 1_000,
  evidenceDir: path.join(
    process.cwd(),
    ".lime",
    "qc",
    "gui-evidence",
    "agent-apps",
  ),
  prefix: "agent-apps-smoke",
  includeContentFactoryActionE2e: false,
  includeContentFactoryCompletionE2e: false,
  completionTimeoutMs: 90_000,
  contentFactoryAction: "build-store",
  allowLiveProvider: liveProviderSmokeAllowed(),
};

const ACCOUNT_MENU_BUTTON_SELECTOR =
  '[data-testid="app-sidebar-account-button"]';
const AGENT_APPS_NAV_SELECTOR =
  'button[aria-label="Agent Apps"], button[title="Agent Apps"]';
const AGENT_APP_LAB_NAV_SELECTOR =
  'button[aria-label="Agent App Lab"], button[title="Agent App Lab"]';
const CONTENT_FACTORY_APP_ID = "content-factory-app";
const CONTENT_FACTORY_RUNTIME_FIXTURE_ROOT = path.join(
  process.cwd(),
  ".lime",
  "qc",
  "agent-apps-runtime-fixtures",
);
const CONTENT_FACTORY_SAMPLE_PROJECT_ID = "sample_content_factory_spring";
const CONTENT_FACTORY_ACTIONS = {
  "build-store": {
    action: "build-store",
    page: "start",
    pageText: /资料|资料原文或摘要|确认资料版本/,
    label: "整理资料",
    expectedSkills: ["knowledge-builder", "content-reviewer"],
    runningPattern:
      /正在整理资料|整理当前项目内容|当前进度|正在连接 Lime AI 同事/,
  },
  "run-scenarios": {
    action: "run-scenarios",
    page: "scenes",
    pageText: /场景整理|场景概览|优先场景/,
    label: "生成/更新场景包",
    expectedSkills: ["knowledge-builder", "content-reviewer"],
    runningPattern:
      /正在准备场景|整理当前项目内容|当前进度|正在连接 Lime AI 同事/,
  },
  "run-production": {
    action: "run-production",
    page: "produce",
    pageText: /本轮内容画布|整理本轮内容|脚本和图片需求/,
    campaignStep: "setup",
    label: "生成本轮内容包",
    expectedSkills: ["article-writer", "content-reviewer"],
    runningPattern:
      /正在整理本轮内容|整理当前项目内容|当前进度|正在连接 Lime AI 同事/,
  },
  "only-copy": {
    action: "only-copy",
    page: "produce",
    pageText: /本轮内容画布|整理草稿|脚本和图片需求/,
    campaignStep: "copy",
    seedSampleWorkspace: true,
    label: "只重写文案批次",
    expectedSkills: ["article-writer", "content-reviewer"],
    runningPattern:
      /正在重写草稿|整理当前项目内容|当前进度|正在连接 Lime AI 同事/,
  },
  "run-scripts": {
    action: "run-scripts",
    page: "produce",
    pageText: /本轮内容画布|生成脚本|图片需求/,
    campaignStep: "derivatives",
    seedSampleWorkspace: true,
    label: "生成脚本批次",
    expectedSkills: ["article-writer", "content-reviewer"],
    runningPattern:
      /正在生成脚本|整理当前项目内容|当前进度|正在连接 Lime AI 同事/,
  },
  "run-strategy": {
    action: "run-strategy",
    page: "deliver",
    pageText: /交付出口|交付包工作台|交付物清单/,
    seedSampleWorkspace: true,
    label: "更新交付结论",
    expectedSkills: ["article-writer", "content-reviewer"],
    runningPattern:
      /正在准备交付|整理当前项目内容|当前进度|正在连接 Lime AI 同事/,
  },
  "run-review": {
    action: "run-review",
    page: "review",
    pageText: /复盘出口|复盘决策室|生成下一轮判断/,
    label: "生成判断",
    expectedSkills: ["content-reviewer"],
    runningPattern:
      /正在分析复盘|整理当前项目内容|当前进度|正在连接 Lime AI 同事/,
  },
};

function parseArgs(argv) {
  const options = { ...DEFAULTS };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--app-url" && argv[index + 1]) {
      options.appUrl = String(argv[index + 1]).trim();
      index += 1;
      continue;
    }
    if (arg === "--health-url" && argv[index + 1]) {
      options.healthUrl = String(argv[index + 1]).trim();
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
    if (arg === "--evidence-dir" && argv[index + 1]) {
      options.evidenceDir = path.resolve(String(argv[index + 1]).trim());
      index += 1;
      continue;
    }
    if (arg === "--prefix" && argv[index + 1]) {
      options.prefix = String(argv[index + 1]).trim();
      index += 1;
      continue;
    }
    if (arg === "--include-content-factory-action-e2e") {
      options.includeContentFactoryActionE2e = true;
    }
    if (arg === "--include-content-factory-completion-e2e") {
      options.includeContentFactoryActionE2e = true;
      options.includeContentFactoryCompletionE2e = true;
    }
    if (arg === "--allow-live-provider") {
      options.allowLiveProvider = true;
      continue;
    }
    if (arg === "--completion-timeout-ms" && argv[index + 1]) {
      options.completionTimeoutMs = Number(argv[index + 1]);
      index += 1;
      continue;
    }
    if (arg === "--content-factory-action" && argv[index + 1]) {
      options.contentFactoryAction = String(argv[index + 1]).trim();
      index += 1;
    }
  }
  return options;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function getContentFactoryActionConfig(actionName) {
  const action = CONTENT_FACTORY_ACTIONS[actionName];
  if (!action) {
    throw new Error(
      `Unsupported content factory action: ${actionName}. Supported: ${Object.keys(
        CONTENT_FACTORY_ACTIONS,
      ).join(", ")}`,
    );
  }
  return action;
}

function logStage(stage) {
  console.log(`[smoke:agent-apps] stage=${stage}`);
}

function resolveInvokeUrl(healthUrl) {
  try {
    const url = new URL(healthUrl);
    url.pathname = "/invoke";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return "http://127.0.0.1:3030/invoke";
  }
}

function sanitizeDiagnosticText(value) {
  const sanitized = String(value ?? "")
    .replace(
      /((?:api[_-]?key|authorization|password|secret|session|token)[^=\s]*=)(["']?)[^\s"']+/gi,
      "$1$2[redacted]",
    )
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, "$1[redacted]");
  return sanitized.length > 1_600
    ? `${sanitized.slice(0, 1_600)}... [truncated ${sanitized.length - 1_600} chars]`
    : sanitized;
}

function sanitizeDiagnosticJson(value, depth = 0) {
  if (depth > 5) {
    return "[truncated-depth]";
  }
  if (typeof value === "string") {
    return sanitizeDiagnosticText(value);
  }
  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    value === null ||
    value === undefined
  ) {
    return value ?? null;
  }
  if (Array.isArray(value)) {
    return value
      .slice(0, 25)
      .map((item) => sanitizeDiagnosticJson(item, depth + 1));
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 80)
        .map(([key, item]) => [key, sanitizeDiagnosticJson(item, depth + 1)]),
    );
  }
  return sanitizeDiagnosticText(String(value));
}

function isBenignDevBridgeEventAbortText(value) {
  const text = String(value ?? "");
  return (
    text.includes("net::ERR_ABORTED") &&
    (text.includes("/events?") ||
      text.includes("127.0.0.1:3030/events") ||
      text.includes("lime-open-voice-model-settings") ||
      text.includes("app-update%3A%2F%2Fsession"))
  );
}

function isBenignDevBridgeEventAbortRequest(request) {
  return (
    request.failure()?.errorText === "net::ERR_ABORTED" &&
    request.url().includes("/events?")
  );
}

function recordConsoleError(message, consoleErrors, ignoredConsoleErrors) {
  if (message.type() !== "error") {
    return;
  }
  const text = message.text();
  if (isBenignDevBridgeEventAbortText(text)) {
    ignoredConsoleErrors.push(text);
    return;
  }
  consoleErrors.push(text);
}

function contentFactoryRuntimeHtml() {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>内容工厂</title>
    <style>
      body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f8fafc; color: #0f172a; }
      main { padding: 24px; }
      nav { display: flex; flex-wrap: wrap; gap: 8px; margin: 16px 0; }
      button { border: 1px solid #cbd5e1; border-radius: 8px; background: #fff; padding: 8px 12px; cursor: pointer; }
      button:hover { background: #f1f5f9; }
      .panel { border: 1px solid #e2e8f0; border-radius: 8px; background: #fff; padding: 16px; }
      .muted { color: #64748b; }
    </style>
  </head>
  <body>
    <main>
      <h1>内容工厂</h1>
      <p class="muted">项目作战室 · 工作台状态 · 当前进度</p>
      <nav>
        <button data-page="start">资料</button>
        <button data-page="scenes">场景</button>
        <button data-page="produce">生产</button>
        <button data-page="deliver">交付</button>
        <button data-page="review">复盘</button>
        <button data-page="projects">项目</button>
      </nav>
      <section class="panel" id="content"></section>
    </main>
    <script>
      const callLog = [];
      const hostTaskRecords = {};
      const pages = {
        start: "资料 资料原文或摘要 确认资料版本 当前进度 工作台状态",
        scenes: "场景整理 场景概览 优先场景 当前进度 工作台状态",
        produce: "本轮内容画布 整理本轮内容 脚本和图片需求 当前进度 工作台状态",
        deliver: "交付出口 交付包工作台 交付物清单 当前进度 工作台状态",
        review: "复盘出口 复盘决策室 生成下一轮判断 当前进度 工作台状态",
        projects: "项目列表 春季新品内容项目 当前进度 工作台状态",
      };

      function recordCapability(capability, method) {
        callLog.push({ capability, method, calledAt: new Date().toISOString() });
      }

      function buildTaskRecord(action) {
        return {
          taskId: "agent-app-task-smoke",
          sessionId: "agent-app-runtime-smoke",
          taskStatus: "completed",
          hasRuntimeFacts: true,
          runtimeFacts: {
            modelRouting: { model: "smoke-model", routes: ["smoke"] },
            tokenUsage: { totals: { input: 1, output: 1 } },
            costSummary: { cost: 0 },
            skills: { skills: ["knowledge-builder", "content-reviewer", "article-writer"] },
          },
          runtimeProcess: {
            routingCount: 1,
            executionCount: 1,
            artifactCount: 1,
            timeline: [{ type: "task.completed", message: action }],
            usage: { totalTokens: 2 },
            cost: { total: 0 },
            model: { label: "smoke-model" },
            skillNames: ["knowledge-builder", "content-reviewer", "article-writer"],
            invokedSkillNames: ["knowledge-builder", "content-reviewer", "article-writer"],
            terminal: true,
          },
          completion: {
            modelReady: true,
            usageReady: true,
            costReady: true,
            skillInvocationReady: true,
            artifactReady: true,
            evidenceReady: true,
            workspacePatchReady: true,
            terminalReady: true,
          },
          events: [
            { type: "skill.invoked", message: "knowledge-builder" },
            { type: "artifact.created", message: "content_factory.workspace_patch" },
            { type: "evidence.recorded", message: "skillEvidence" },
          ],
        };
      }

      function runAction(action) {
        [
          ["lime.agent", "startTask"],
          ["lime.models", "getRouting"],
          ["lime.usage", "getTokenUsage"],
          ["lime.usage", "getCostSummary"],
          ["lime.skills", "list"],
          ["lime.agent", "streamTask"],
        ].forEach(([capability, method]) => recordCapability(capability, method));
        const record = buildTaskRecord(action);
        hostTaskRecords.contentFactoryProduction = record;
        hostTaskRecords[record.taskId] = record;
        document.querySelector("#status").textContent =
          "正在连接 Lime AI 同事 · 正在整理当前项目内容 · 当前进度已记录";
      }

      function renderPage(page) {
        const content = document.querySelector("#content");
        const campaignControls = page === "produce"
          ? '<button data-campaign-step="setup">整理本轮内容</button><button data-campaign-step="copy">整理草稿</button><button data-campaign-step="derivatives">生成脚本</button>'
          : "";
        const projectControls = page === "projects"
          ? '<button data-open-project="sample_content_factory_spring">春季新品内容项目</button>'
          : "";
        content.innerHTML =
          '<h2>' + pages[page] + '</h2>' +
          '<p id="status">Lime AI 运行现场 · 当前进度等待启动</p>' +
          campaignControls +
          projectControls +
          '<div><button data-action="build-store">整理资料</button>' +
          '<button data-action="run-scenarios">生成/更新场景包</button>' +
          '<button data-action="run-production">生成本轮内容包</button>' +
          '<button data-action="only-copy">只重写文案批次</button>' +
          '<button data-action="run-scripts">生成脚本批次</button>' +
          '<button data-action="run-strategy">更新交付结论</button>' +
          '<button data-action="run-review">生成判断</button></div>';
        content.querySelectorAll("[data-action]").forEach((button) => {
          button.addEventListener("click", () => runAction(button.dataset.action));
        });
      }

      window.limeAgentAppBridge = {
        protocol: "lime.agentApp.bridge",
        refreshHostCapabilityProfile() {
          return { available: true };
        },
        getSdkCallLog() {
          return callLog;
        },
        getHostTaskRunRecord(id) {
          return hostTaskRecords[id] || hostTaskRecords.contentFactoryProduction || null;
        },
      };
      window.addEventListener("message", () => undefined);
      document.querySelectorAll("[data-page]").forEach((button) => {
        button.addEventListener("click", () => renderPage(button.dataset.page));
      });
      renderPage("start");
    </script>
  </body>
</html>`;
}

function createContentFactoryRuntimeFixture(rootDir) {
  const appDir = path.join(rootDir, CONTENT_FACTORY_APP_ID);
  fs.mkdirSync(appDir, { recursive: true });
  fs.writeFileSync(
    path.join(appDir, "APP.md"),
    `---
manifestVersion: 0.3.0
name: ${CONTENT_FACTORY_APP_ID}
displayName: 内容工厂
version: 0.3.0
entries:
  - key: dashboard
    kind: page
    title: 项目首页
    route: /dashboard
---
# 内容工厂
`,
  );
  fs.writeFileSync(
    path.join(appDir, "package.json"),
    `${JSON.stringify(
      {
        private: true,
        type: "module",
        scripts: {
          dev: "node server.mjs",
        },
      },
      null,
      2,
    )}\n`,
  );
  fs.writeFileSync(
    path.join(appDir, "server.mjs"),
    `import http from "node:http";

const html = ${JSON.stringify(contentFactoryRuntimeHtml())};
const port = Number(process.env.PORT || 4173);

const server = http.createServer((request, response) => {
  const url = new URL(request.url || "/", "http://127.0.0.1");
  if (url.pathname === "/api/bootstrap") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: true, appId: "${CONTENT_FACTORY_APP_ID}" }));
    return;
  }
  if (url.pathname === "/api/sample/load") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: true }));
    return;
  }
  response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  response.end(html);
});

server.listen(port, "127.0.0.1");
`,
  );
  return appDir;
}

async function execFileText(command, args, options = {}) {
  try {
    const result = await execFileAsync(command, args, {
      maxBuffer: options.maxBuffer ?? 1024 * 1024,
      timeout: options.timeoutMs ?? 2_000,
      windowsHide: true,
    });
    return {
      ok: true,
      stdout: String(result.stdout ?? ""),
      stderr: String(result.stderr ?? ""),
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      stdout:
        typeof error === "object" && error !== null && "stdout" in error
          ? String(error.stdout ?? "")
          : "",
      stderr:
        typeof error === "object" && error !== null && "stderr" in error
          ? String(error.stderr ?? "")
          : "",
    };
  }
}

function parseUnixProcessLine(line) {
  const match = line.match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(\S+)\s+(.*)$/);
  if (!match) {
    return null;
  }
  return {
    pid: Number(match[1]),
    ppid: Number(match[2]),
    pgid: Number(match[3]),
    stat: match[4],
    etime: match[5],
    command: sanitizeDiagnosticText(match[6]),
    cwd: null,
  };
}

function shouldProbeUnixCwd(processInfo) {
  const command = processInfo.command.toLowerCase();
  return (
    command.includes("content-factory-app") ||
    command.includes("agent-apps-smoke") ||
    command.includes("verify-gui-smoke") ||
    /\b(npm|node|pnpm|yarn|vite)\b/.test(command)
  );
}

function processMatchReasons(processInfo) {
  const command = String(processInfo.command ?? "").toLowerCase();
  const cwd = String(processInfo.cwd ?? "")
    .replaceAll("\\", "/")
    .toLowerCase();
  const shellWrapper = /^\/bin\/(?:ba|z|c|k)?sh\b.*\s-c\s/.test(command);
  const reasons = [];

  if (command.includes("content-factory-app")) {
    reasons.push("command:content-factory-app");
  }
  if (!shellWrapper && command.includes("agent-apps-smoke")) {
    reasons.push("command:agent-apps-smoke");
  }
  if (!shellWrapper && command.includes("verify-gui-smoke")) {
    reasons.push("command:verify-gui-smoke");
  }
  if (command.includes(" 3030") || command.includes(":3030")) {
    reasons.push("command:3030");
  }
  if (command.includes(" 1420") || command.includes(":1420")) {
    reasons.push("command:1420");
  }
  if (
    cwd.endsWith("/content-factory-app") ||
    cwd.includes("/content-factory-app/")
  ) {
    reasons.push("cwd:content-factory-app");
  }

  return reasons;
}

async function readUnixProcessCwd(pid) {
  const result = await execFileText(
    "lsof",
    ["-a", "-p", String(pid), "-d", "cwd", "-Fn"],
    {
      maxBuffer: 64 * 1024,
      timeoutMs: 1_000,
    },
  );
  if (!result.ok) {
    return null;
  }
  const match = result.stdout.match(/^n(.+)$/m);
  return match ? sanitizeDiagnosticText(match[1]) : null;
}

async function collectUnixProcessSnapshot() {
  const errors = [];
  const result = await execFileText(
    "ps",
    ["-axo", "pid,ppid,pgid,stat,etime,command"],
    {
      maxBuffer: 4 * 1024 * 1024,
      timeoutMs: 2_000,
    },
  );

  if (!result.ok) {
    return {
      platform: process.platform,
      collectedAt: new Date().toISOString(),
      processCount: 0,
      probedCwdCount: 0,
      processes: [],
      errors: [
        {
          command: "ps",
          error: result.error,
          stderr: sanitizeDiagnosticText(result.stderr),
        },
      ],
    };
  }

  const processes = result.stdout
    .split("\n")
    .slice(1)
    .map(parseUnixProcessLine)
    .filter(Boolean);
  const cwdCandidates = processes.filter(shouldProbeUnixCwd).slice(0, 160);

  await Promise.all(
    cwdCandidates.map(async (processInfo) => {
      const cwd = await readUnixProcessCwd(processInfo.pid);
      if (cwd) {
        processInfo.cwd = cwd;
      }
    }),
  );

  const matchedProcesses = processes
    .map((processInfo) => ({
      ...processInfo,
      matchReasons: processMatchReasons(processInfo),
    }))
    .filter((processInfo) => processInfo.matchReasons.length > 0)
    .slice(0, 80);

  return {
    platform: process.platform,
    collectedAt: new Date().toISOString(),
    filters: {
      cwdBasename: "content-factory-app",
      commandHints: [
        "content-factory-app",
        "agent-apps-smoke",
        "verify-gui-smoke",
        "3030",
        "1420",
      ],
    },
    processCount: processes.length,
    probedCwdCount: cwdCandidates.length,
    processes: matchedProcesses,
    errors,
  };
}

async function collectWindowsProcessSnapshot() {
  const result = await execFileText(
    "powershell.exe",
    [
      "-NoProfile",
      "-Command",
      "Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,CommandLine,ExecutablePath | ConvertTo-Json -Compress",
    ],
    { maxBuffer: 4 * 1024 * 1024, timeoutMs: 3_000 },
  );

  if (!result.ok) {
    return {
      platform: process.platform,
      collectedAt: new Date().toISOString(),
      processCount: 0,
      probedCwdCount: 0,
      processes: [],
      errors: [
        {
          command: "powershell.exe Get-CimInstance Win32_Process",
          error: result.error,
          stderr: sanitizeDiagnosticText(result.stderr),
        },
      ],
    };
  }

  let parsed = [];
  try {
    const payload = JSON.parse(result.stdout || "[]");
    parsed = Array.isArray(payload) ? payload : [payload];
  } catch (error) {
    return {
      platform: process.platform,
      collectedAt: new Date().toISOString(),
      processCount: 0,
      probedCwdCount: 0,
      processes: [],
      errors: [
        {
          command: "powershell.exe Get-CimInstance Win32_Process",
          error: error instanceof Error ? error.message : String(error),
        },
      ],
    };
  }

  const processes = parsed
    .map((item) => ({
      pid: Number(item.ProcessId),
      ppid: Number(item.ParentProcessId),
      command: sanitizeDiagnosticText(
        item.CommandLine ?? item.ExecutablePath ?? "",
      ),
      cwd: null,
    }))
    .map((processInfo) => ({
      ...processInfo,
      matchReasons: processMatchReasons(processInfo),
    }))
    .filter((processInfo) => processInfo.matchReasons.length > 0)
    .slice(0, 80);

  return {
    platform: process.platform,
    collectedAt: new Date().toISOString(),
    filters: {
      cwdBasename: "content-factory-app",
      commandHints: [
        "content-factory-app",
        "agent-apps-smoke",
        "verify-gui-smoke",
        "3030",
        "1420",
      ],
    },
    processCount: parsed.length,
    probedCwdCount: 0,
    processes,
    errors: [],
  };
}

async function collectExternalDevProcessSnapshot() {
  if (process.platform === "win32") {
    return collectWindowsProcessSnapshot();
  }
  return collectUnixProcessSnapshot();
}

async function readJsonWithTimeout(url, init, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
    });
    const text = await response.text();
    let body = text;
    try {
      body = JSON.parse(text);
    } catch {
      // Keep raw text for diagnostics.
    }
    return {
      ok: response.ok,
      status: response.status,
      body,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function isTransportFailure(response) {
  if (!response || response.ok) {
    return false;
  }
  if (response.error) {
    return true;
  }
  const message =
    typeof response.body?.error === "string"
      ? response.body.error
      : typeof response.body === "string"
        ? response.body
        : "";
  return /failed to fetch|timeout|abort|connection|health check/i.test(message);
}

async function invokeDevBridgeCommand(options, cmd, args, timeoutMs) {
  const invokeUrl = resolveInvokeUrl(options.healthUrl);
  const deadline =
    Date.now() + Math.min(options.timeoutMs, Math.max(timeoutMs, 30_000));
  let lastResponse = null;

  while (Date.now() < deadline) {
    const response = await readJsonWithTimeout(
      invokeUrl,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cmd, args }),
      },
      timeoutMs,
    );
    lastResponse = response;
    const body = response.body;

    if (response.ok && isObjectRecord(body) && !body.error) {
      return body.result;
    }

    if (!isTransportFailure(response)) {
      throw new Error(
        `[smoke:agent-apps] DevBridge command failed: ${cmd}: ${sanitizeDiagnosticText(
          body?.error ?? response.error ?? JSON.stringify(body),
        )}`,
      );
    }

    await sleep(options.intervalMs);
  }

  throw new Error(
    `[smoke:agent-apps] DevBridge command unavailable after retry: ${cmd}: ${sanitizeDiagnosticText(
      lastResponse?.error ??
        lastResponse?.body?.error ??
        "unknown transport failure",
    )}`,
  );
}

async function invokeAppServerJsonRpc(options, method, params, timeoutMs) {
  const response = await invokeDevBridgeCommand(
    options,
    "app_server_handle_json_lines",
    {
      request: {
        lines: [
          JSON.stringify({
            jsonrpc: "2.0",
            id: `${method}-${Date.now()}`,
            method,
            params,
          }),
        ],
      },
    },
    timeoutMs,
  );
  const line = Array.isArray(response?.lines) ? response.lines[0] : null;
  if (!line) {
    throw new Error(
      `[smoke:agent-apps] ${method} did not return JSON-RPC line`,
    );
  }
  const message = JSON.parse(line);
  if (message.error) {
    throw new Error(
      `[smoke:agent-apps] ${method} failed: ${sanitizeDiagnosticText(
        message.error.message ?? JSON.stringify(message.error),
      )}`,
    );
  }
  return message.result;
}

function isObjectRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function findStringByPattern(value, pattern, depth = 0) {
  if (depth > 7 || value == null) {
    return "";
  }
  if (typeof value === "string") {
    return value.match(pattern)?.[0] ?? "";
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findStringByPattern(item, pattern, depth + 1);
      if (found) {
        return found;
      }
    }
    return "";
  }
  if (isObjectRecord(value)) {
    for (const item of Object.values(value)) {
      const found = findStringByPattern(item, pattern, depth + 1);
      if (found) {
        return found;
      }
    }
  }
  return "";
}

function findAgentAppTaskId(value) {
  return findStringByPattern(value, /agent-app-task-[a-z0-9-]+/i);
}

function findAgentAppSessionId(value) {
  return findStringByPattern(value, /agent-app-runtime-[a-z0-9-]+/i);
}

function findValueByKeys(value, keys, depth = 6) {
  if (depth < 0 || value == null) {
    return undefined;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findValueByKeys(item, keys, depth - 1);
      if (found !== undefined && found !== null && found !== "") {
        return found;
      }
    }
    return undefined;
  }
  if (!isObjectRecord(value)) {
    return undefined;
  }
  for (const key of keys) {
    const candidate = value[key];
    if (candidate !== undefined && candidate !== null && candidate !== "") {
      return candidate;
    }
  }
  for (const item of Object.values(value)) {
    const found = findValueByKeys(item, keys, depth - 1);
    if (found !== undefined && found !== null && found !== "") {
      return found;
    }
  }
  return undefined;
}

function findObjectByKeys(value, keys, depth = 6) {
  const found = findValueByKeys(value, keys, depth);
  return isObjectRecord(found) ? found : null;
}

function valueContainsPattern(value, pattern, depth = 0) {
  if (depth > 7 || value == null) {
    return false;
  }
  if (typeof value === "string") {
    return pattern.test(value);
  }
  if (Array.isArray(value)) {
    return value.some((item) => valueContainsPattern(item, pattern, depth + 1));
  }
  if (!isObjectRecord(value)) {
    return false;
  }
  return Object.entries(value).some(
    ([key, item]) =>
      pattern.test(key) || valueContainsPattern(item, pattern, depth + 1),
  );
}

function hasContentFactoryWorkspacePatchValue(value, depth = 0) {
  if (depth > 8 || value == null) {
    return false;
  }
  if (Array.isArray(value)) {
    return value.some((item) =>
      hasContentFactoryWorkspacePatchValue(item, depth + 1),
    );
  }
  if (!isObjectRecord(value)) {
    return false;
  }
  if (
    value.kind === "content_factory.workspace_patch" ||
    value.contentFactoryWorkspacePatch ||
    value.workspacePatch
  ) {
    return true;
  }
  return Object.values(value).some((item) =>
    hasContentFactoryWorkspacePatchValue(item, depth + 1),
  );
}

function hasTokenUsageValue(value) {
  const usage = findObjectByKeys(
    value,
    ["usage", "tokenUsage", "token_usage"],
    7,
  );
  if (!usage) {
    return false;
  }
  return [
    "inputTokens",
    "input_tokens",
    "outputTokens",
    "output_tokens",
    "totalTokens",
    "total_tokens",
    "cachedInputTokens",
    "cached_input_tokens",
  ].some(
    (key) => Number.isFinite(Number(usage[key])) && Number(usage[key]) > 0,
  );
}

function hasCostValue(value) {
  const cost = findObjectByKeys(value, ["cost_state", "costState", "cost"], 7);
  if (!cost) {
    return false;
  }
  return Boolean(
    cost.estimatedCostClass ||
    cost.estimated_cost_class ||
    Number.isFinite(Number(cost.estimatedTotalCost)) ||
    Number.isFinite(Number(cost.estimated_total_cost)) ||
    Number.isFinite(Number(cost.totalCost)) ||
    Number.isFinite(Number(cost.total_cost)),
  );
}

function hasContentFactoryEvidenceValue(value) {
  return valueContainsPattern(
    value,
    /skillEvidence|skill_evidence|evidenceRefs|evidence_refs/,
  );
}

function isTerminalRuntimeStatus(value) {
  return [
    "completed",
    "complete",
    "success",
    "succeeded",
    "failed",
    "failure",
    "error",
    "cancelled",
    "canceled",
    "aborted",
  ].includes(
    String(value ?? "")
      .trim()
      .toLowerCase(),
  );
}

function isSuccessfulRuntimeStatus(value) {
  return ["completed", "complete", "success", "succeeded"].includes(
    String(value ?? "")
      .trim()
      .toLowerCase(),
  );
}

function summarizeRuntimeSnapshotCompletion(snapshot) {
  if (!isObjectRecord(snapshot)) {
    return null;
  }
  const threadRead = isObjectRecord(snapshot.threadRead)
    ? snapshot.threadRead
    : {};
  const taskEvents = Array.isArray(snapshot.taskEvents)
    ? snapshot.taskEvents
    : [];
  const artifacts = Array.isArray(threadRead.artifacts)
    ? threadRead.artifacts
    : [];
  const toolCalls = Array.isArray(threadRead.tool_calls)
    ? threadRead.tool_calls
    : Array.isArray(threadRead.toolCalls)
      ? threadRead.toolCalls
      : [];
  const turns = Array.isArray(threadRead.turns) ? threadRead.turns : [];
  const modelRouting =
    findObjectByKeys(threadRead, [
      "model_routing",
      "modelRouting",
      "routing_decision",
    ]) ??
    findObjectByKeys(snapshot, [
      "model_routing",
      "modelRouting",
      "routing_decision",
    ]);
  const selectedModel =
    modelRouting?.selectedModel ??
    modelRouting?.selected_model ??
    modelRouting?.model ??
    modelRouting?.modelName ??
    "";
  const selectedProvider =
    modelRouting?.selectedProvider ??
    modelRouting?.selected_provider ??
    modelRouting?.provider ??
    "";
  const terminal =
    isTerminalRuntimeStatus(snapshot.taskStatus) ||
    isTerminalRuntimeStatus(threadRead.profile_status) ||
    isTerminalRuntimeStatus(threadRead.status);
  const successful =
    isSuccessfulRuntimeStatus(snapshot.taskStatus) ||
    isSuccessfulRuntimeStatus(threadRead.profile_status) ||
    isSuccessfulRuntimeStatus(threadRead.status);
  const hasRuntimeOutput =
    taskEvents.length > 0 ||
    artifacts.length > 0 ||
    toolCalls.length > 0 ||
    turns.length > 0;
  const workspacePatchReady = hasContentFactoryWorkspacePatchValue(snapshot);
  const evidenceRefs = findValueByKeys(
    threadRead,
    ["evidence_refs", "evidenceRefs"],
    5,
  );
  const evidenceReady = Boolean(
    (Array.isArray(evidenceRefs) && evidenceRefs.length > 0) ||
    valueContainsPattern(taskEvents, /evidence/i) ||
    (workspacePatchReady &&
      (artifacts.length > 0 || hasContentFactoryEvidenceValue(snapshot))),
  );

  return {
    terminalReady: successful,
    modelReady: Boolean(selectedModel || selectedProvider),
    usageReady: hasTokenUsageValue(snapshot) || (terminal && hasRuntimeOutput),
    costReady: hasCostValue(snapshot),
    skillInvocationReady: Boolean(
      toolCalls.some((call) =>
        /Skill/i.test(String(call?.tool_name ?? call?.toolName ?? "")),
      ) ||
      valueContainsPattern(
        taskEvents,
        /skill|knowledge-builder|content-reviewer/i,
      ),
    ),
    artifactReady: Boolean(
      artifacts.length > 0 || valueContainsPattern(taskEvents, /artifact/i),
    ),
    evidenceReady,
    workspacePatchReady,
  };
}

function scoreRuntimeProcessSummary(processView) {
  if (!isObjectRecord(processView)) {
    return -1;
  }
  const modelLabel = String(processView.modelLabel ?? "");
  return [
    Number(processView.timelineCount ?? 0),
    Number(processView.routingCount ?? 0) * 10,
    Number(processView.executionCount ?? 0) * 4,
    Number(processView.artifactCount ?? 0) * 12,
    processView.hasUsage ? 20 : 0,
    processView.hasCost ? 10 : 0,
    modelLabel && !modelLabel.includes("等待") ? 10 : 0,
    Array.isArray(processView.invokedSkillNames)
      ? processView.invokedSkillNames.length * 8
      : 0,
  ].reduce((sum, value) => sum + Number(value || 0), 0);
}

function mergeContentFactoryHostTaskRecords(base, next) {
  if (!base) {
    return next;
  }
  if (!next) {
    return base;
  }
  const completionKeys = [
    "modelReady",
    "usageReady",
    "costReady",
    "skillInvocationReady",
    "artifactReady",
    "evidenceReady",
    "workspacePatchReady",
    "terminalReady",
  ];
  const completion = {};
  for (const key of completionKeys) {
    completion[key] = Boolean(base.completion?.[key] || next.completion?.[key]);
  }
  const directTerminalRecords = [base, next].filter(
    (record) =>
      record?.recordSources?.directGetTask && record?.directRuntimeSnapshot?.ok,
  );
  if (directTerminalRecords.length > 0) {
    completion.terminalReady = directTerminalRecords.some(
      (record) => record.completion?.terminalReady === true,
    );
  }
  return {
    ...base,
    ...next,
    taskId: base.taskId || next.taskId || "",
    sessionId: base.sessionId || next.sessionId || "",
    taskIdSource: base.taskIdSource || next.taskIdSource || "",
    hostRecordTaskId: base.hostRecordTaskId || next.hostRecordTaskId || "",
    sdkTaskId: base.sdkTaskId || next.sdkTaskId || "",
    taskStatus: next.taskStatus || base.taskStatus || "",
    hasRuntimeFacts: Boolean(base.hasRuntimeFacts || next.hasRuntimeFacts),
    runtimeFactKeys: Array.from(
      new Set([
        ...(base.runtimeFactKeys ?? []),
        ...(next.runtimeFactKeys ?? []),
      ]),
    ),
    recordSources: {
      ...(base.recordSources ?? {}),
      ...(next.recordSources ?? {}),
    },
    runtimeProcess:
      scoreRuntimeProcessSummary(next.runtimeProcess) >
      scoreRuntimeProcessSummary(base.runtimeProcess)
        ? next.runtimeProcess
        : (base.runtimeProcess ?? next.runtimeProcess ?? null),
    directRuntimeSnapshot:
      next.directRuntimeSnapshot ?? base.directRuntimeSnapshot,
    completion,
  };
}

async function readContentFactoryDirectRuntimeRecord(options, hostTaskRecord) {
  const taskId = hostTaskRecord?.taskId || findAgentAppTaskId(hostTaskRecord);
  const sessionId =
    hostTaskRecord?.sessionId || findAgentAppSessionId(hostTaskRecord);
  if (!taskId || !sessionId) {
    return null;
  }
  const response = await readJsonWithTimeout(
    resolveInvokeUrl(options.healthUrl),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cmd: "agent_app_runtime_get_task",
        args: {
          request: {
            appId: "content-factory-app",
            taskId,
            sessionId,
          },
        },
      }),
    },
    Math.min(Math.max(options.intervalMs * 10, 10_000), 30_000),
  );
  const body = response.body;
  const snapshot = isObjectRecord(body) ? body.result : null;
  if (!response.ok || !snapshot || body?.error) {
    return {
      taskId,
      sessionId,
      recordSources: { directGetTask: false },
      directRuntimeSnapshot: {
        ok: false,
        status: response.status ?? null,
        error:
          body?.error ??
          response.error ??
          "agent_app_runtime_get_task unavailable",
      },
    };
  }
  const threadRead = isObjectRecord(snapshot.threadRead)
    ? snapshot.threadRead
    : {};
  const artifacts = Array.isArray(threadRead.artifacts)
    ? threadRead.artifacts
    : [];
  const toolCalls = Array.isArray(threadRead.tool_calls)
    ? threadRead.tool_calls
    : [];
  const taskEvents = Array.isArray(snapshot.taskEvents)
    ? snapshot.taskEvents
    : [];
  return {
    taskId,
    sessionId,
    taskStatus: snapshot.taskStatus ?? snapshot.status ?? "",
    hasRuntimeFacts: true,
    runtimeFactKeys: Object.keys(threadRead),
    recordSources: { directGetTask: true },
    completion: summarizeRuntimeSnapshotCompletion(snapshot) ?? {},
    directRuntimeSnapshot: {
      ok: true,
      taskStatus: snapshot.taskStatus ?? snapshot.status ?? "",
      profileStatus: threadRead.profile_status ?? "",
      status: threadRead.status ?? "",
      taskEventCount: taskEvents.length,
      artifactCount: artifacts.length,
      toolCallCount: toolCalls.length,
      telemetryJoinStatus: threadRead.telemetry_summary?.join_status ?? "",
      modelRouting: threadRead.model_routing ?? null,
      costState: threadRead.cost_state ?? null,
      hasWorkspacePatch: hasContentFactoryWorkspacePatchValue(snapshot),
    },
  };
}

async function collectFailureDiagnostics(
  page,
  options,
  error,
  consoleErrors,
  failedRequests,
  ignoredConsoleErrors = [],
  ignoredFailedRequests = [],
) {
  const screenshotPath = path.join(
    options.evidenceDir,
    `${options.prefix}-failure.png`,
  );
  const summaryPath = path.join(
    options.evidenceDir,
    `${options.prefix}-failure.json`,
  );
  const bridgeTimeoutMs = Math.min(
    Math.max(options.intervalMs * 5, 5_000),
    10_000,
  );
  const invokeUrl = resolveInvokeUrl(options.healthUrl);

  let pageState = null;
  try {
    pageState = await page.evaluate(() => ({
      url: window.location.href,
      title: document.title,
      bodyText: document.body.innerText.slice(0, 2_000),
      runtimeSurfaceVisible: Boolean(
        document.querySelector('[data-testid="agent-app-runtime-surface"]'),
      ),
      runtimeFrameVisible: Boolean(
        document.querySelector('[data-testid="agent-app-runtime-frame"]'),
      ),
      launchButtons: Array.from(
        document.querySelectorAll('[data-testid^="agent-apps-launch-entry"]'),
      ).map((element) => ({
        testId: element.getAttribute("data-testid"),
        text: element.textContent?.trim() ?? "",
        disabled: element.hasAttribute("disabled"),
      })),
    }));
  } catch (diagnosticError) {
    pageState = {
      error:
        diagnosticError instanceof Error
          ? diagnosticError.message
          : String(diagnosticError),
    };
  }

  let screenshot = null;
  try {
    await page.screenshot({ path: screenshotPath, fullPage: true });
    screenshot = screenshotPath;
  } catch (diagnosticError) {
    screenshot = {
      error:
        diagnosticError instanceof Error
          ? diagnosticError.message
          : String(diagnosticError),
    };
  }

  let runtimeFrameState = null;
  try {
    const frameHandle = await page.$('[data-testid="agent-app-runtime-frame"]');
    const frame = frameHandle ? await frameHandle.contentFrame() : null;
    if (frame) {
      const [bodyText, sdkCallLog, hostTaskRecord] = await Promise.all([
        frame
          .locator("body")
          .innerText({ timeout: 2_000 })
          .catch((frameError) => ({
            error:
              frameError instanceof Error
                ? frameError.message
                : String(frameError),
          })),
        frame
          .evaluate(() => window.limeAgentAppBridge?.getSdkCallLog?.() ?? [])
          .catch((frameError) => ({
            error:
              frameError instanceof Error
                ? frameError.message
                : String(frameError),
          })),
        frame
          .evaluate(() => {
            const bridge = window.limeAgentAppBridge;
            const bridgeRecord =
              bridge?.getHostTaskRunRecord?.("contentFactoryProduction") ??
              null;
            const callLog = bridge?.getSdkCallLog?.();
            const findTaskId = (value, depth = 0) => {
              if (depth > 6 || value == null) {
                return "";
              }
              if (typeof value === "string") {
                return value.match(/agent-app-task-[a-z0-9-]+/i)?.[0] ?? "";
              }
              if (Array.isArray(value)) {
                return (
                  value
                    .map((item) => findTaskId(item, depth + 1))
                    .find(Boolean) ?? ""
                );
              }
              if (typeof value === "object") {
                if (typeof value.taskId === "string" && value.taskId.trim()) {
                  return value.taskId.trim();
                }
                return (
                  Object.values(value)
                    .map((item) => findTaskId(item, depth + 1))
                    .find(Boolean) ?? ""
                );
              }
              return "";
            };
            const sdkTaskId = Array.isArray(callLog) ? findTaskId(callLog) : "";
            const taskRecord = sdkTaskId
              ? (bridge?.getHostTaskRunRecord?.(sdkTaskId) ?? null)
              : null;
            return { bridgeRecord, taskRecord, sdkTaskId };
          })
          .catch((frameError) => ({
            error:
              frameError instanceof Error
                ? frameError.message
                : String(frameError),
          })),
      ]);
      runtimeFrameState = {
        url: frame.url(),
        bodyText:
          typeof bodyText === "string"
            ? sanitizeDiagnosticText(bodyText)
            : bodyText,
        sdkCallLog: sanitizeDiagnosticJson(sdkCallLog),
        hostTaskRecord: sanitizeDiagnosticJson(hostTaskRecord),
      };
    }
  } catch (diagnosticError) {
    runtimeFrameState = {
      error:
        diagnosticError instanceof Error
          ? diagnosticError.message
          : String(diagnosticError),
    };
  }

  const [bridgeHealth, runtimeStatus, processSnapshot] = await Promise.all([
    readJsonWithTimeout(options.healthUrl, {}, bridgeTimeoutMs),
    readJsonWithTimeout(
      invokeUrl,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cmd: "agent_app_get_ui_runtime_status",
          args: {
            request: {
              appId: "content-factory-app",
              entryKey: "dashboard",
            },
          },
        }),
      },
      bridgeTimeoutMs,
    ),
    collectExternalDevProcessSnapshot(),
  ]);
  let installedStates = null;
  try {
    installedStates = (await listInstalledAgentAppsForSmoke(options)).map(
      summarizeInstalledAgentAppState,
    );
  } catch (diagnosticError) {
    installedStates = {
      error:
        diagnosticError instanceof Error
          ? diagnosticError.message
          : String(diagnosticError),
    };
  }

  const summary = {
    scenarioId: "agent-apps-smoke-failure",
    appUrl: options.appUrl,
    failedAt: new Date().toISOString(),
    error: error instanceof Error ? error.message : String(error),
    pageState,
    runtimeFrameState,
    bridgeHealth,
    runtimeStatus,
    installedStates,
    processSnapshot,
    consoleErrors,
    failedRequests,
    ignoredConsoleErrors,
    ignoredFailedRequests,
    screenshot,
  };
  fs.writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
  console.error(`[smoke:agent-apps] failureSummary=${summaryPath}`);
  if (typeof screenshot === "string") {
    console.error(`[smoke:agent-apps] failureScreenshot=${screenshot}`);
  }
  return summary;
}

async function openAccountMenuForAgentApps(page, timeoutMs) {
  if ((await page.locator(AGENT_APPS_NAV_SELECTOR).count()) > 0) {
    return;
  }
  await page.click(ACCOUNT_MENU_BUTTON_SELECTOR);
  await page.waitForSelector(AGENT_APPS_NAV_SELECTOR, {
    timeout: timeoutMs,
  });
}

async function clickAgentAppsNav(page, timeoutMs) {
  await openAccountMenuForAgentApps(page, timeoutMs);
  await page.locator(AGENT_APPS_NAV_SELECTOR).first().click();
}

async function waitForMainAppStable(page, timeoutMs) {
  await page
    .waitForLoadState("domcontentloaded", { timeout: timeoutMs })
    .catch(() => {});
  await page.waitForSelector('[data-testid="app-sidebar-main-nav"]', {
    timeout: timeoutMs,
  });
}

async function openContentFactoryDetails(page, timeoutMs) {
  await page.click(
    '[data-testid="agent-apps-open-detail-content-factory-app"]',
    {
      timeout: timeoutMs,
    },
  );
  await page.waitForSelector('[data-testid="agent-apps-detail"]', {
    timeout: timeoutMs,
  });
  await page.waitForSelector('[data-testid="agent-apps-lifecycle-actions"]', {
    timeout: timeoutMs,
  });
}

async function getContentFactoryRuntimeFrame(page, timeoutMs) {
  const frameHandle = await page.waitForSelector(
    '[data-testid="agent-app-runtime-frame"]',
    {
      timeout: Math.min(timeoutMs, 30_000),
    },
  );
  const frame = await frameHandle.contentFrame();
  assert(frame, "Content Factory runtime frame should be attached");
  return frame;
}

async function waitForContentFactoryRuntimeSurface(page, timeoutMs) {
  const deadline = Date.now() + Math.min(timeoutMs, 60_000);
  let lastState = null;
  while (Date.now() < deadline) {
    lastState = await page.evaluate(() => {
      const text = document.body.innerText.slice(0, 1_200);
      return {
        runtimeSurfaceVisible: Boolean(
          document.querySelector('[data-testid="agent-app-runtime-surface"]'),
        ),
        runtimeFrameVisible: Boolean(
          document.querySelector('[data-testid="agent-app-runtime-frame"]'),
        ),
        runtimeErrorVisible:
          text.includes("App 打开失败") ||
          text.includes("App open failed") ||
          text.includes("Agent App UI runtime"),
        agentAppsPageVisible: Boolean(
          document.querySelector('[data-testid="agent-apps-page"]'),
        ),
        bodyText: text,
      };
    });
    if (lastState.runtimeSurfaceVisible && lastState.runtimeFrameVisible) {
      return lastState;
    }
    if (lastState.runtimeErrorVisible) {
      throw new Error(
        `Content Factory runtime entered error state: ${lastState.bodyText}`,
      );
    }
    await sleep(500);
  }
  throw new Error(
    `Content Factory runtime surface did not appear: ${JSON.stringify(
      sanitizeDiagnosticJson(lastState),
    )}`,
  );
}

async function readContentFactorySdkCallLog(frame) {
  try {
    return await frame.evaluate(() => {
      const callLog = window.limeAgentAppBridge?.getSdkCallLog?.();
      return Array.isArray(callLog) ? callLog : [];
    });
  } catch {
    return [];
  }
}

async function readContentFactoryHostTaskRecord(frame) {
  try {
    return await frame.evaluate(() => {
      const bridge = window.limeAgentAppBridge;
      const bridgeRecord = bridge?.getHostTaskRunRecord?.(
        "contentFactoryProduction",
      );
      const callLog = bridge?.getSdkCallLog?.();
      const findTaskId = (value, depth = 0) => {
        if (depth > 6 || value == null) {
          return "";
        }
        if (typeof value === "string") {
          const directMatch = value.match(/agent-app-task-[a-z0-9-]+/i);
          return directMatch?.[0] ?? "";
        }
        if (Array.isArray(value)) {
          for (const item of value) {
            const taskId = findTaskId(item, depth + 1);
            if (taskId) {
              return taskId;
            }
          }
          return "";
        }
        if (typeof value === "object") {
          const taskIdValue = value.taskId;
          if (typeof taskIdValue === "string" && taskIdValue.trim()) {
            return taskIdValue.trim();
          }
          for (const item of Object.values(value)) {
            const taskId = findTaskId(item, depth + 1);
            if (taskId) {
              return taskId;
            }
          }
        }
        return "";
      };
      const findSessionId = (value, depth = 0) => {
        if (depth > 6 || value == null) {
          return "";
        }
        if (typeof value === "string") {
          return value.match(/agent-app-runtime-[a-z0-9-]+/i)?.[0] ?? "";
        }
        if (Array.isArray(value)) {
          for (const item of value) {
            const sessionId = findSessionId(item, depth + 1);
            if (sessionId) {
              return sessionId;
            }
          }
          return "";
        }
        if (typeof value === "object") {
          for (const key of [
            "sessionId",
            "session_id",
            "threadId",
            "thread_id",
          ]) {
            const valueForKey = value[key];
            if (typeof valueForKey === "string" && valueForKey.trim()) {
              const sessionId = findSessionId(valueForKey, depth + 1);
              if (sessionId) {
                return sessionId;
              }
            }
          }
          for (const item of Object.values(value)) {
            const sessionId = findSessionId(item, depth + 1);
            if (sessionId) {
              return sessionId;
            }
          }
        }
        return "";
      };
      const sdkTaskId = Array.isArray(callLog) ? findTaskId(callLog) : "";
      const taskRecord = sdkTaskId
        ? bridge?.getHostTaskRunRecord?.(sdkTaskId)
        : null;
      const records = [taskRecord, bridgeRecord].filter(
        (item) => item && typeof item === "object",
      );
      const readNested = (value, path) =>
        path.reduce(
          (cursor, key) =>
            cursor && typeof cursor === "object" ? cursor[key] : undefined,
          value,
        );
      const firstRecordValue = (paths) => {
        for (const record of records) {
          for (const path of paths) {
            const value = readNested(record, path);
            if (value && typeof value === "object") {
              return value;
            }
          }
        }
        return null;
      };
      const collectEvents = (value, depth = 0) => {
        if (depth > 4 || !value || typeof value !== "object") {
          return [];
        }
        const groups = [];
        if (Array.isArray(value.events)) {
          groups.push(value.events);
        }
        if (Array.isArray(value.taskEvents)) {
          groups.push(value.taskEvents);
        }
        for (const key of ["task", "snapshot", "result", "threadRead"]) {
          groups.push(collectEvents(value[key], depth + 1));
        }
        return groups.flat();
      };
      const events = records.flatMap((record) => collectEvents(record));
      const scoreProcess = (process) => {
        if (!process || typeof process !== "object") {
          return -1;
        }
        const modelLabel = String(process.model?.label ?? "");
        return [
          Number(process.routingCount ?? 0) * 10,
          Number(process.executionCount ?? 0) * 4,
          Number(process.artifactCount ?? 0) * 12,
          Array.isArray(process.timeline) ? process.timeline.length : 0,
          process.usage ? 20 : 0,
          process.cost ? 10 : 0,
          modelLabel && !modelLabel.includes("等待") ? 10 : 0,
          Array.isArray(process.invokedSkillNames)
            ? process.invokedSkillNames.length * 8
            : 0,
        ].reduce((sum, value) => sum + Number(value || 0), 0);
      };
      const runtimeProcess =
        records
          .flatMap((record) => [
            record?.runtimeProcess,
            record?.process,
            record?.task?.runtimeProcess,
            record?.task?.process,
            record?.snapshot?.runtimeProcess,
            record?.snapshot?.process,
          ])
          .filter((item) => item && typeof item === "object")
          .sort((left, right) => scoreProcess(right) - scoreProcess(left))[0] ??
        null;
      const task = firstRecordValue([["task"]]);
      const snapshot = firstRecordValue([["snapshot"], ["task"], ["result"]]);
      const runtimeFacts = firstRecordValue([
        ["runtimeFacts"],
        ["task", "runtimeFacts"],
      ]);
      const eventSurface = (event) =>
        `${event?.eventType ?? ""} ${event?.type ?? ""} ${event?.toolName ?? ""} ${event?.message ?? ""} ${event?.evidenceRef ?? ""} ${event?.artifactRef ?? ""}`;
      const anyEvent = (pattern) =>
        events.some((event) => pattern.test(eventSurface(event)));
      const hasWorkspacePatch = (value, depth = 0) => {
        if (depth > 6 || value == null) {
          return false;
        }
        if (Array.isArray(value)) {
          return value.some((item) => hasWorkspacePatch(item, depth + 1));
        }
        if (typeof value !== "object") {
          return false;
        }
        if (
          value.kind === "content_factory.workspace_patch" ||
          value.contentFactoryWorkspacePatch ||
          value.workspacePatch
        ) {
          return true;
        }
        return Object.values(value).some((item) =>
          hasWorkspacePatch(item, depth + 1),
        );
      };
      const hasEvidenceValue = (value, depth = 0) => {
        if (depth > 6 || value == null) {
          return false;
        }
        if (typeof value === "string") {
          return /skillEvidence|skill_evidence|evidenceRefs|evidence_refs/.test(
            value,
          );
        }
        if (Array.isArray(value)) {
          return value.some((item) => hasEvidenceValue(item, depth + 1));
        }
        if (typeof value !== "object") {
          return false;
        }
        return Object.entries(value).some(
          ([key, item]) =>
            /skillEvidence|skill_evidence|evidenceRefs|evidence_refs/.test(
              key,
            ) || hasEvidenceValue(item, depth + 1),
        );
      };
      const hostRecordTaskId =
        [
          task?.taskId,
          taskRecord?.taskId,
          bridgeRecord?.taskId,
          snapshot?.taskId,
          findTaskId(taskRecord),
          findTaskId(bridgeRecord),
        ].find((value) => typeof value === "string" && value.trim()) ?? "";
      const taskId = hostRecordTaskId || sdkTaskId;
      const sessionId =
        [
          task?.sessionId,
          task?.session_id,
          snapshot?.sessionId,
          snapshot?.session_id,
          snapshot?.threadId,
          snapshot?.thread_id,
          findSessionId(taskRecord),
          findSessionId(bridgeRecord),
        ].find((value) => typeof value === "string" && value.trim()) ?? "";
      const taskStatus =
        task?.status ?? snapshot?.taskStatus ?? snapshot?.status ?? "";
      const terminalReady = /completed|complete|success|succeeded/i.test(
        String(taskStatus),
      );
      return {
        taskId,
        sessionId,
        taskIdSource: hostRecordTaskId
          ? "hostTaskRunRecord"
          : sdkTaskId
            ? "sdkCallLog"
            : "",
        hostRecordTaskId,
        sdkTaskId,
        recordSources: {
          bridgeAction: Boolean(bridgeRecord),
          taskId: Boolean(taskRecord),
        },
        taskStatus,
        hasRuntimeFacts: Boolean(runtimeFacts),
        runtimeFactKeys:
          runtimeFacts && typeof runtimeFacts === "object"
            ? Object.keys(runtimeFacts)
            : [],
        runtimeProcess:
          runtimeProcess && typeof runtimeProcess === "object"
            ? {
                timelineCount: Array.isArray(runtimeProcess.timeline)
                  ? runtimeProcess.timeline.length
                  : 0,
                routingCount: runtimeProcess.routingCount ?? 0,
                executionCount: runtimeProcess.executionCount ?? 0,
                artifactCount: runtimeProcess.artifactCount ?? 0,
                hasUsage: Boolean(runtimeProcess.usage),
                hasCost: Boolean(runtimeProcess.cost),
                modelLabel: runtimeProcess.model?.label ?? "",
                skillNames: Array.isArray(runtimeProcess.skillNames)
                  ? runtimeProcess.skillNames
                  : [],
                invokedSkillNames: Array.isArray(
                  runtimeProcess.invokedSkillNames,
                )
                  ? runtimeProcess.invokedSkillNames
                  : [],
                terminal: Boolean(runtimeProcess.terminal),
              }
            : null,
        completion: {
          terminalReady,
          modelReady: Boolean(
            runtimeProcess?.routingCount > 0 ||
            (runtimeProcess?.model?.label &&
              !String(runtimeProcess.model.label).includes("等待")) ||
            runtimeFacts?.modelRouting?.model ||
            runtimeFacts?.modelRouting?.routes?.length ||
            runtimeFacts?.models?.models?.length,
          ),
          usageReady: Boolean(
            runtimeProcess?.usage ||
            runtimeFacts?.tokenUsage?.totals ||
            runtimeFacts?.tokenUsage?.tasks?.length,
          ),
          costReady: Boolean(
            runtimeProcess?.cost ||
            runtimeFacts?.costSummary?.cost ||
            runtimeFacts?.costSummary?.tasks?.length,
          ),
          skillInvocationReady: Boolean(
            runtimeProcess?.invokedSkillNames?.length || anyEvent(/skill/i),
          ),
          artifactReady: Boolean(
            runtimeProcess?.artifactCount > 0 || anyEvent(/artifact/i),
          ),
          evidenceReady:
            anyEvent(/evidence/i) ||
            (hasWorkspacePatch(records) && hasEvidenceValue(records)),
          workspacePatchReady: hasWorkspacePatch(records),
        },
      };
    });
  } catch {
    return {
      taskId: "",
      taskStatus: "",
      hasRuntimeFacts: false,
      runtimeFactKeys: [],
    };
  }
}

async function waitForContentFactoryHostTaskRecord(frame, timeoutMs) {
  const startedAt = Date.now();
  let lastRecord = null;
  while (Date.now() - startedAt < timeoutMs) {
    lastRecord = await readContentFactoryHostTaskRecord(frame);
    if (lastRecord?.taskId) {
      return lastRecord;
    }
    await sleep(500);
  }
  return lastRecord ?? {};
}

function summarizeCapabilityCalls(callLog) {
  return callLog
    .map(
      (call) => `${call?.capability ?? "unknown"}.${call?.method ?? "unknown"}`,
    )
    .filter(Boolean);
}

function summarizeContentFactoryRuntimeFacts(capabilityCalls) {
  const callSet = new Set(capabilityCalls);
  return {
    modelsStarted: callSet.has("lime.models.getRouting"),
    usageStarted:
      callSet.has("lime.usage.getTokenUsage") ||
      callSet.has("lime.usage.getCostSummary"),
    skillsStarted: callSet.has("lime.skills.list"),
    streamOrGetTaskStarted:
      callSet.has("lime.agent.streamTask") || callSet.has("lime.agent.getTask"),
  };
}

function summarizeContentFactoryCompletionReadiness(hostTaskRecord) {
  const completion = hostTaskRecord?.completion ?? {};
  const checks = {
    modelReady: Boolean(completion.modelReady),
    usageReady: Boolean(completion.usageReady),
    costReady: Boolean(completion.costReady),
    skillInvocationReady: Boolean(completion.skillInvocationReady),
    artifactReady: Boolean(completion.artifactReady),
    evidenceReady: Boolean(completion.evidenceReady),
    workspacePatchReady: Boolean(completion.workspacePatchReady),
    terminalReady: Boolean(completion.terminalReady),
  };
  const missing = Object.entries(checks)
    .filter(([, ready]) => !ready)
    .map(([key]) => key);
  return {
    ...checks,
    ready: missing.length === 0,
    missing,
  };
}

async function waitForContentFactoryCompletionE2e(frame, options, timeoutMs) {
  const startedAt = Date.now();
  let latestRecord = null;
  let latestReadiness = null;
  while (Date.now() - startedAt < timeoutMs) {
    const frameRecord = await readContentFactoryHostTaskRecord(frame);
    latestRecord = mergeContentFactoryHostTaskRecords(
      latestRecord,
      frameRecord,
    );
    const directRecord = await readContentFactoryDirectRuntimeRecord(
      options,
      latestRecord,
    );
    latestRecord = mergeContentFactoryHostTaskRecords(
      latestRecord,
      directRecord,
    );
    latestReadiness = summarizeContentFactoryCompletionReadiness(latestRecord);
    if (latestReadiness.ready) {
      return {
        ready: true,
        readiness: latestReadiness,
        hostTaskRecord: latestRecord,
      };
    }
    await sleep(1_000);
  }
  throw new Error(
    `Content Factory completion E2E did not reach completed runtime facts: ${JSON.stringify(
      {
        ...(latestReadiness ?? { missing: ["not_observed"] }),
        taskId: latestRecord?.taskId ?? "",
        sessionId: latestRecord?.sessionId ?? "",
        directRuntimeSnapshot: latestRecord?.directRuntimeSnapshot ?? null,
      },
    )}`,
  );
}

async function inspectContentFactoryRuntimeFrame(page, timeoutMs) {
  const frame = page.frameLocator('[data-testid="agent-app-runtime-frame"]');
  const boundedTimeoutMs = Math.min(timeoutMs, 30_000);
  await frame.locator("body").waitFor({ timeout: boundedTimeoutMs });
  await frame.locator("body").getByText("内容工厂").first().waitFor({
    timeout: boundedTimeoutMs,
  });

  const produceNav = frame.locator('button[data-page="produce"]').first();
  if ((await produceNav.count()) > 0) {
    await produceNav.click({ timeout: boundedTimeoutMs }).catch(() => null);
  }

  const bodyText = await frame
    .locator("body")
    .innerText({ timeout: boundedTimeoutMs });
  const bridgeState = await frame.locator("body").evaluate(() => {
    const bridge = window.limeAgentAppBridge;
    const callLog =
      typeof bridge?.getSdkCallLog === "function" ? bridge.getSdkCallLog() : [];
    return {
      hasBridge: Boolean(bridge?.protocol),
      hasCapabilityRefresh:
        typeof bridge?.refreshHostCapabilityProfile === "function",
      callCount: Array.isArray(callLog) ? callLog.length : 0,
    };
  });
  const hostProfileVisible =
    bridgeState.hasBridge &&
    bridgeState.hasCapabilityRefresh &&
    (bodyText.includes("当前进度") ||
      bodyText.includes("项目作战室") ||
      bodyText.includes("工作台状态"));
  return {
    contentFactoryLoaded: bodyText.includes("内容工厂"),
    hostProfileVisible,
    bridgeState,
    bodyPreview: bodyText.slice(0, 1_000),
  };
}

async function runContentFactoryActionE2e(page, options) {
  const actionConfig = getContentFactoryActionConfig(
    options.contentFactoryAction,
  );
  const frame = await getContentFactoryRuntimeFrame(page, options.timeoutMs);
  const boundedTimeoutMs = Math.min(options.timeoutMs, 45_000);
  if (actionConfig.seedSampleWorkspace) {
    await seedContentFactorySampleWorkspace(frame, boundedTimeoutMs);
  }
  const beforeCallLog = await readContentFactorySdkCallLog(frame);

  await frame
    .locator(`button[data-page="${actionConfig.page}"]`)
    .first()
    .click({
      timeout: boundedTimeoutMs,
    });
  await frame.getByText(actionConfig.pageText).first().waitFor({
    timeout: boundedTimeoutMs,
  });
  if (actionConfig.campaignStep) {
    const stepButton = frame
      .locator(`button[data-campaign-step="${actionConfig.campaignStep}"]`)
      .first();
    await stepButton.waitFor({ state: "visible", timeout: boundedTimeoutMs });
    await stepButton.click({ timeout: boundedTimeoutMs });
  }

  const actionButton = frame
    .locator(`button[data-action="${actionConfig.action}"]`)
    .first();
  await actionButton.waitFor({ state: "visible", timeout: boundedTimeoutMs });
  const actionDisabled = await actionButton.isDisabled().catch(() => false);
  assert(
    !actionDisabled,
    `Content Factory ${actionConfig.action} action should be enabled`,
  );
  await actionButton.click({ timeout: boundedTimeoutMs });

  await frame.waitForFunction(
    () =>
      window.limeAgentAppBridge
        ?.getSdkCallLog?.()
        ?.some(
          (call) =>
            call.capability === "lime.agent" && call.method === "startTask",
        ),
    undefined,
    { timeout: boundedTimeoutMs },
  );
  await frame.waitForFunction(
    () => {
      const record = window.limeAgentAppBridge?.getHostTaskRunRecord?.(
        "contentFactoryProduction",
      );
      const callLog = window.limeAgentAppBridge?.getSdkCallLog?.();
      const findTaskId = (value, depth = 0) => {
        if (depth > 6 || value == null) {
          return "";
        }
        if (typeof value === "string") {
          return value.match(/agent-app-task-[a-z0-9-]+/i)?.[0] ?? "";
        }
        if (Array.isArray(value)) {
          return (
            value.map((item) => findTaskId(item, depth + 1)).find(Boolean) ?? ""
          );
        }
        if (typeof value === "object") {
          if (typeof value.taskId === "string" && value.taskId.trim()) {
            return value.taskId.trim();
          }
          return (
            Object.values(value)
              .map((item) => findTaskId(item, depth + 1))
              .find(Boolean) ?? ""
          );
        }
        return "";
      };
      return Boolean(findTaskId(record) || findTaskId(callLog));
    },
    undefined,
    { timeout: boundedTimeoutMs },
  );
  await frame
    .locator("body")
    .getByText(actionConfig.runningPattern)
    .first()
    .waitFor({
      timeout: boundedTimeoutMs,
    });

  const bodyText = await frame
    .locator("body")
    .innerText({ timeout: boundedTimeoutMs });
  const afterCallLog = await readContentFactorySdkCallLog(frame);
  const hostTaskRecord = await waitForContentFactoryHostTaskRecord(
    frame,
    boundedTimeoutMs,
  );
  const newCalls = summarizeCapabilityCalls(
    afterCallLog.slice(beforeCallLog.length),
  );
  const runtimeFacts = summarizeContentFactoryRuntimeFacts(newCalls);
  const startTaskSeen = newCalls.includes("lime.agent.startTask");
  const taskAccepted = Boolean(
    hostTaskRecord.taskId || hostTaskRecord.sdkTaskId,
  );
  const hostTaskRecordSeen = Boolean(
    hostTaskRecord.hostRecordTaskId || hostTaskRecord.sdkTaskId,
  );
  const runtimeFactsObserved = Boolean(hostTaskRecord.hasRuntimeFacts);
  const expectedSkills = actionConfig.expectedSkills ?? [
    "knowledge-builder",
    "content-reviewer",
  ];
  const skillEvidenceText = [
    bodyText,
    JSON.stringify(hostTaskRecord.runtimeProcess?.skillNames ?? []),
    JSON.stringify(hostTaskRecord.runtimeProcess?.invokedSkillNames ?? []),
    JSON.stringify(afterCallLog.slice(beforeCallLog.length)),
  ].join("\n");
  const requiredSkillsProjected = expectedSkills.every((skillName) =>
    skillEvidenceText.includes(skillName),
  );
  const processPanelVisible =
    bodyText.includes("Lime AI 运行现场") ||
    bodyText.includes("正在连接 Lime AI 同事") ||
    bodyText.includes("AI 同事正在整理知识库") ||
    actionConfig.runningPattern.test(bodyText);
  const hostFallbackVisible = bodyText.includes("Lime AI 同事连接失败");

  assert(
    startTaskSeen,
    `Content Factory ${actionConfig.action} E2E should invoke lime.agent.startTask`,
  );
  assert(
    taskAccepted,
    `Content Factory ${actionConfig.action} E2E should receive a Host task id`,
  );
  assert(
    runtimeFactsObserved,
    `Content Factory ${actionConfig.action} E2E should expose Host runtime facts`,
  );
  assert(
    runtimeFacts.modelsStarted &&
      runtimeFacts.usageStarted &&
      runtimeFacts.skillsStarted,
    `Content Factory ${actionConfig.action} E2E should request Host runtime facts`,
  );
  assert(
    runtimeFacts.streamOrGetTaskStarted,
    `Content Factory ${actionConfig.action} E2E should subscribe to or poll the Host task`,
  );
  assert(
    requiredSkillsProjected,
    `Content Factory ${actionConfig.action} E2E should project required content factory Skills`,
  );
  assert(
    processPanelVisible,
    `Content Factory ${actionConfig.action} E2E should keep the process panel visible`,
  );
  assert(
    !hostFallbackVisible,
    `Content Factory ${actionConfig.action} E2E should not fall back after Host connection`,
  );

  const completionTimeoutMs = Math.min(
    options.timeoutMs,
    Number.isFinite(options.completionTimeoutMs)
      ? options.completionTimeoutMs
      : 90_000,
  );
  const completionE2e = options.includeContentFactoryCompletionE2e
    ? await waitForContentFactoryCompletionE2e(
        frame,
        options,
        completionTimeoutMs,
      )
    : null;
  const completionInvokedSkillNames = Array.isArray(
    completionE2e?.hostTaskRecord?.runtimeProcess?.invokedSkillNames,
  )
    ? completionE2e.hostTaskRecord.runtimeProcess.invokedSkillNames
    : [];
  const expectedSkillsInvoked =
    !completionE2e ||
    expectedSkills.every((skillName) =>
      completionInvokedSkillNames.some(
        (invokedSkillName) =>
          invokedSkillName === skillName ||
          String(invokedSkillName).endsWith(`:${skillName}`),
      ),
    );
  assert(
    expectedSkillsInvoked,
    `Content Factory ${actionConfig.action} E2E should invoke expected content factory Skills: ${expectedSkills.join(", ")}`,
  );

  return {
    actionName: actionConfig.action,
    actionLabel: actionConfig.label,
    expectedSkills,
    startTaskSeen,
    taskAccepted,
    hostTaskRecordSeen,
    runtimeFactsObserved,
    runtimeFactsStarted:
      runtimeFacts.modelsStarted &&
      runtimeFacts.usageStarted &&
      runtimeFacts.skillsStarted,
    streamOrGetTaskStarted: runtimeFacts.streamOrGetTaskStarted,
    requiredSkillsProjected,
    expectedSkillsInvoked,
    processPanelVisible,
    hostFallbackVisible,
    hostTaskRecord,
    completionE2e,
    capabilityCalls: newCalls,
    bodyPreview: bodyText.slice(0, 1_000),
  };
}

async function seedContentFactorySampleWorkspace(frame, timeoutMs) {
  await frame.evaluate(async () => {
    const response = await fetch("/api/sample/load", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    if (!response.ok) {
      throw new Error(`load sample failed: ${response.status}`);
    }
    window.location.reload();
  });
  await frame.waitForLoadState("domcontentloaded", { timeout: timeoutMs });
  await frame
    .locator('button[data-page="projects"]')
    .first()
    .click({ timeout: timeoutMs });
  await frame
    .locator(`button[data-open-project="${CONTENT_FACTORY_SAMPLE_PROJECT_ID}"]`)
    .first()
    .click({ timeout: timeoutMs });
  await frame
    .getByText("春季新品内容项目")
    .first()
    .waitFor({ timeout: timeoutMs });
}

async function launchSmokeContext(userDataDir) {
  try {
    return await chromium.launchPersistentContext(userDataDir, {
      channel: "chrome",
      headless: true,
    });
  } catch (error) {
    console.warn(
      `[smoke:agent-apps] Chrome channel 启动失败，尝试 Playwright Chromium: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return chromium.launchPersistentContext(userDataDir, {
      headless: true,
    });
  }
}

async function waitForHealth(options) {
  const startedAt = Date.now();
  let lastError = null;
  while (Date.now() - startedAt < options.timeoutMs) {
    try {
      const response = await fetch(options.healthUrl);
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      console.log(
        `[smoke:agent-apps] DevBridge 已就绪 (${Date.now() - startedAt}ms) status=${payload?.status ?? "unknown"}`,
      );
      return payload;
    } catch (error) {
      lastError = error;
      await sleep(options.intervalMs);
    }
  }
  throw new Error(
    `[smoke:agent-apps] DevBridge 未就绪: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
  );
}

function activeCloudBootstrapPayload() {
  return {
    schemaVersion: "agent-app-cloud-bootstrap/v1",
    tenantId: "smoke-formal-entry",
    generatedAt: "2026-05-16T00:00:00.000Z",
    apps: [
      {
        appId: "content-factory-app",
        displayName: "内容工厂",
        version: "0.3.0",
        releaseId: "smoke-content-factory-app-0.3.0",
        channel: "smoke",
        licenseState: "active",
        registrationRequired: true,
        registrationState: "active",
        enabled: true,
        packageUrl:
          "https://lime.local/agent-apps/content-factory-app/releases/0.3.0/package.zip",
        packageHash:
          "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        manifestHash:
          "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        capabilityRequirements: {},
        defaultEntries: ["dashboard", "content_scenario_planning"],
        policyDefaults: {},
        toolAvailability: [],
      },
    ],
  };
}

async function runFlagOffRegression(options) {
  logStage("flag-off-regression");
  const userDataDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "lime-agent-apps-flag-off-"),
  );
  const context = await launchSmokeContext(userDataDir);
  const page = await context.newPage();
  const consoleErrors = [];
  const ignoredConsoleErrors = [];
  page.on("console", (message) => {
    recordConsoleError(message, consoleErrors, ignoredConsoleErrors);
  });

  try {
    await page.goto(options.appUrl, {
      waitUntil: "domcontentloaded",
      timeout: options.timeoutMs,
    });
    await page.waitForSelector('[data-testid="app-sidebar-main-nav"]', {
      timeout: options.timeoutMs,
    });
    await openAccountMenuForAgentApps(page, options.timeoutMs);

    const assertions = {
      agentAppsNavVisible:
        (await page.locator(AGENT_APPS_NAV_SELECTOR).count()) > 0,
      labNavHidden:
        (await page.locator(AGENT_APP_LAB_NAV_SELECTOR).count()) === 0,
      noConsoleErrors: consoleErrors.length === 0,
    };

    Object.entries(assertions).forEach(([key, value]) => {
      assert(Boolean(value), `Flag-off assertion failed: ${key}`);
    });

    const screenshotPath = path.join(
      options.evidenceDir,
      `${options.prefix}-flag-off.png`,
    );
    await page.screenshot({ path: screenshotPath, fullPage: true });
    return {
      assertions,
      consoleErrors,
      ignoredConsoleErrors,
      screenshot: screenshotPath,
    };
  } finally {
    await context.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
}

function summarizeInstalledAgentAppState(state) {
  if (!state || typeof state !== "object") {
    return null;
  }
  return {
    appId: state.appId ?? "",
    installMode: state.installMode ?? "",
    disabled: Boolean(state.disabled),
    sourceKind: state.identity?.sourceKind ?? "",
    sourceUri: sanitizeDiagnosticText(state.identity?.sourceUri ?? ""),
    appVersion: state.identity?.appVersion ?? "",
  };
}

function isExpectedContentFactorySmokeState(state, runtimeDir) {
  return (
    state?.appId === CONTENT_FACTORY_APP_ID &&
    state?.installMode === "in_lime" &&
    state?.disabled === false &&
    state?.identity?.sourceKind === "local_folder" &&
    path.resolve(String(state?.identity?.sourceUri ?? "")) ===
      path.resolve(runtimeDir)
  );
}

async function listInstalledAgentAppsForSmoke(options) {
  const list = await invokeAppServerJsonRpc(
    options,
    "agentAppInstalled/list",
    {},
    30_000,
  );
  return Array.isArray(list?.states) ? list.states : [];
}

async function ensureContentFactoryInstalled(
  page,
  options,
  reason,
  runtimeDir,
) {
  const installedSelector =
    '[data-testid="agent-apps-installed-content-factory-app"]';
  const installedStates = await listInstalledAgentAppsForSmoke(options);
  const existingState = installedStates.find(
    (state) => state?.appId === CONTENT_FACTORY_APP_ID,
  );
  if (isExpectedContentFactorySmokeState(existingState, runtimeDir)) {
    if ((await page.locator(installedSelector).count()) === 0) {
      await page.click('[data-testid="agent-apps-refresh"]');
      await page.waitForSelector(installedSelector, {
        timeout: options.timeoutMs,
      });
    }
    return {
      status: "already_installed",
      reason,
      state: summarizeInstalledAgentAppState(existingState),
    };
  }

  const state = await page.evaluate(async (appDir) => {
    const fixtureResponse = await fetch(
      "/src/features/agent-app/testing/fixtures/content-factory-app.json",
    );
    if (!fixtureResponse.ok) {
      throw new Error(
        `Failed to load Content Factory fixture: HTTP ${fixtureResponse.status}`,
      );
    }
    const manifest = await fixtureResponse.json();
    const identityModule =
      await import("/src/features/agent-app/install/packageIdentity.ts");
    const previewModule =
      await import("/src/features/agent-app/install/installedAppPreview.ts");
    const setupModule =
      await import("/src/features/agent-app/install/labInstallFlow.ts");
    const stateModule =
      await import("/src/features/agent-app/install/installedAppState.ts");
    const now = new Date().toISOString();
    const identity = identityModule.buildPackageIdentity({
      manifest,
      sourceKind: "local_folder",
      sourceUri: appDir,
      loadedAt: now,
    });
    const setupPreview = previewModule.buildInstalledAppPreview({
      fixture: manifest,
      identity,
      loadedAt: now,
      checkedAt: now,
      generatedAt: now,
    });
    const setup = setupModule.buildAgentAppLabResolvedSetupState(
      setupPreview.projection,
    );
    const preview = previewModule.buildInstalledAppPreview({
      fixture: manifest,
      identity,
      setup,
      loadedAt: now,
      checkedAt: now,
      generatedAt: now,
    });
    return stateModule.buildInstalledAgentAppState({
      preview,
      setup,
      installedAt: now,
      updatedAt: now,
    });
  }, runtimeDir);
  await invokeAppServerJsonRpc(
    options,
    "agentAppInstalled/save",
    { state },
    30_000,
  );

  await page.click('[data-testid="agent-apps-refresh"]');
  await page.waitForSelector(installedSelector, {
    timeout: options.timeoutMs,
  });
  return {
    status: "seeded_from_fixture",
    reason,
    appId: state?.appId ?? CONTENT_FACTORY_APP_ID,
    previousState: summarizeInstalledAgentAppState(existingState),
    state: summarizeInstalledAgentAppState(state),
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.includeContentFactoryActionE2e) {
    assertLiveProviderSmokeAllowed({
      allowed: options.allowLiveProvider,
      scriptName: options.includeContentFactoryCompletionE2e
        ? "smoke:agent-apps --include-content-factory-completion-e2e"
        : "smoke:agent-apps --include-content-factory-action-e2e",
    });
  }
  fs.mkdirSync(options.evidenceDir, { recursive: true });
  await waitForHealth(options);

  const userDataDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "lime-agent-apps-smoke-"),
  );
  const contentFactoryRuntimeDir = createContentFactoryRuntimeFixture(
    CONTENT_FACTORY_RUNTIME_FIXTURE_ROOT,
  );
  const context = await launchSmokeContext(userDataDir);
  const consoleErrors = [];
  const failedRequests = [];
  const ignoredConsoleErrors = [];
  const ignoredFailedRequests = [];

  const bootstrap = activeCloudBootstrapPayload();
  await context.addInitScript((payload) => {
    window.localStorage.removeItem("lime.agentAppHost.flags");
    window.localStorage.removeItem("lime.agentAppHost.labEnabled");
    window.__LIME_AGENT_APPS_SMOKE_BOOTSTRAP__ = payload;
  }, bootstrap);

  const page = await context.newPage();
  await page.route(
    "https://user.limeai.run/api/v1/public/tenants/*/client/agent-apps",
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(bootstrap),
      });
    },
  );
  page.on("console", (message) => {
    recordConsoleError(message, consoleErrors, ignoredConsoleErrors);
  });
  page.on("requestfailed", (request) => {
    const record = {
      url: request.url(),
      method: request.method(),
      failure: request.failure()?.errorText ?? "unknown",
    };
    if (isBenignDevBridgeEventAbortRequest(request)) {
      ignoredFailedRequests.push(record);
      return;
    }
    failedRequests.push(record);
  });

  try {
    logStage("open-app");
    await page.goto(options.appUrl, {
      waitUntil: "domcontentloaded",
      timeout: options.timeoutMs,
    });
    await page.waitForSelector('[data-testid="app-sidebar-main-nav"]', {
      timeout: options.timeoutMs,
    });
    await openAccountMenuForAgentApps(page, options.timeoutMs);
    assert(
      (await page.locator(AGENT_APPS_NAV_SELECTOR).count()) > 0,
      "Agent Apps nav should be visible",
    );
    assert(
      (await page.locator(AGENT_APP_LAB_NAV_SELECTOR).count()) === 0,
      "Agent App Lab nav should stay hidden in formal smoke",
    );

    logStage("open-agent-apps");
    await clickAgentAppsNav(page, options.timeoutMs);
    await page.waitForSelector('[data-testid="agent-apps-page"]', {
      timeout: options.timeoutMs,
    });
    const initialInstallSeed = await ensureContentFactoryInstalled(
      page,
      options,
      "initial_smoke_state",
      contentFactoryRuntimeDir,
    );
    await page.waitForSelector(
      '[data-testid="agent-apps-installed-content-factory-app"]',
      {
        timeout: options.timeoutMs,
      },
    );

    logStage("verify-registration-required");
    await page.waitForSelector(
      '[data-testid="agent-apps-registration-content-factory-app"]',
      {
        timeout: options.timeoutMs,
      },
    );
    const registrationInstallButton = page.locator(
      '[data-testid="agent-apps-install-cloud-content-factory-app"]',
    );
    const registrationInstallBlocked =
      (await registrationInstallButton.count()) === 0 ||
      (await registrationInstallButton.isDisabled());

    logStage("activate-bootstrap-catalog");
    await page.evaluate((payload) => {
      window.__LIME_OEM_CLOUD__ = {
        enabled: true,
        baseUrl: "https://user.limeai.run",
        tenantId: payload.tenantId,
      };
      window.__LIME_SESSION_TOKEN__ = "smoke-agent-apps-token";
      window.__LIME_BOOTSTRAP__ = { data: { agentAppCatalog: payload } };
    }, bootstrap);
    await page.click('[data-testid="agent-apps-refresh"]');
    if (
      (await page
        .locator('[data-testid="agent-apps-installed-content-factory-app"]')
        .count()) === 0
    ) {
      await page.waitForFunction(
        () => {
          const button = document.querySelector(
            '[data-testid="agent-apps-install-cloud-content-factory-app"]',
          );
          return button instanceof HTMLButtonElement && !button.disabled;
        },
        undefined,
        { timeout: options.timeoutMs },
      );
    }

    logStage("install-cloud-review");
    let cloudInstallReviewVisible = false;
    let cloudInstallAlreadySatisfied = false;
    const installedBeforeCloudAction =
      (await page
        .locator('[data-testid="agent-apps-installed-content-factory-app"]')
        .count()) > 0;
    if (installedBeforeCloudAction) {
      cloudInstallAlreadySatisfied = true;
      console.log(
        "[smoke:agent-apps] install review skipped because content factory is already installed",
      );
    } else {
      await page.click(
        '[data-testid="agent-apps-install-cloud-content-factory-app"]',
        {
          timeout: options.timeoutMs,
        },
      );
      const reviewVisible = await page
        .waitForSelector('[data-testid="agent-apps-install-review"]', {
          timeout: Math.min(options.timeoutMs, 5_000),
        })
        .then(() => true)
        .catch(() => false);
      if (reviewVisible) {
        cloudInstallReviewVisible = true;
        await page.click('[data-testid="agent-apps-install-review-confirm"]');
      } else {
        cloudInstallAlreadySatisfied = true;
        console.log(
          "[smoke:agent-apps] install review skipped because content factory is already installed",
        );
      }
    }
    await page.waitForSelector(
      '[data-testid="agent-apps-installed-content-factory-app"]',
      {
        timeout: options.timeoutMs,
      },
    );

    logStage("disable-enable");
    await openContentFactoryDetails(page, options.timeoutMs);
    await page.click('[data-testid="agent-apps-disable"]');
    await page.waitForFunction(
      () =>
        document
          .querySelector('[data-testid="agent-apps-launch-entry-dashboard"]')
          ?.hasAttribute("disabled") &&
        !document
          .querySelector('[data-testid="agent-apps-enable"]')
          ?.hasAttribute("disabled"),
      undefined,
      { timeout: options.timeoutMs },
    );
    const disabledLaunchBlocked = await page.isDisabled(
      '[data-testid="agent-apps-launch-entry-dashboard"]',
    );
    await page.click('[data-testid="agent-apps-enable"]');
    await page.waitForFunction(
      () =>
        !document
          .querySelector('[data-testid="agent-apps-launch-entry-dashboard"]')
          ?.hasAttribute("disabled"),
      undefined,
      { timeout: options.timeoutMs },
    );

    logStage("launch-runtime-surface");
    await page.click('[data-testid="agent-apps-launch-entry-dashboard"]');
    await waitForContentFactoryRuntimeSurface(page, options.timeoutMs);
    const runtimeFrameSrc = await page.getAttribute(
      '[data-testid="agent-app-runtime-frame"]',
      "src",
    );
    const runtimeFrameInspection = await inspectContentFactoryRuntimeFrame(
      page,
      options.timeoutMs,
    );
    let contentFactoryActionE2e = null;
    if (options.includeContentFactoryActionE2e) {
      logStage("content-factory-action-e2e");
      contentFactoryActionE2e = await runContentFactoryActionE2e(page, options);
    }

    if (options.includeContentFactoryCompletionE2e) {
      const assertions = {
        runtimeSurfaceVisible: Boolean(runtimeFrameSrc),
        runtimeFrameContentFactoryLoaded:
          runtimeFrameInspection.contentFactoryLoaded,
        runtimeFrameHostProfileVisible:
          runtimeFrameInspection.hostProfileVisible,
        contentFactoryActionMatches:
          contentFactoryActionE2e?.actionName === options.contentFactoryAction,
        contentFactoryActionStarted: contentFactoryActionE2e?.startTaskSeen,
        contentFactoryActionTaskAccepted: contentFactoryActionE2e?.taskAccepted,
        contentFactoryActionRuntimeFactsObserved:
          contentFactoryActionE2e?.runtimeFactsObserved,
        contentFactoryActionRuntimeFactsStarted:
          contentFactoryActionE2e?.runtimeFactsStarted,
        contentFactoryActionStreamOrGetTaskStarted:
          contentFactoryActionE2e?.streamOrGetTaskStarted,
        contentFactoryActionRequiredSkillsProjected:
          contentFactoryActionE2e?.requiredSkillsProjected,
        contentFactoryActionExpectedSkillsInvoked:
          contentFactoryActionE2e?.expectedSkillsInvoked,
        contentFactoryActionProcessVisible:
          contentFactoryActionE2e?.processPanelVisible,
        contentFactoryActionNoHostFallback:
          !contentFactoryActionE2e?.hostFallbackVisible,
        contentFactoryCompletionReady:
          contentFactoryActionE2e?.completionE2e?.ready,
      };
      Object.entries(assertions).forEach(([key, value]) => {
        assert(Boolean(value), `Assertion failed: ${key}`);
      });

      logStage("completion-focused-summary");
      const screenshotPath = path.join(
        options.evidenceDir,
        `${options.prefix}.png`,
      );
      const summaryPath = path.join(
        options.evidenceDir,
        `${options.prefix}-summary.json`,
      );
      let screenshot = screenshotPath;
      try {
        await page.screenshot({ path: screenshotPath, timeout: 30_000 });
      } catch (error) {
        screenshot = {
          error: error instanceof Error ? error.message : String(error),
        };
      }
      fs.writeFileSync(
        summaryPath,
        `${JSON.stringify(
          {
            scenarioId: "agent-apps-smoke-content-factory-completion",
            appUrl: options.appUrl,
            assertions,
            runtimeFrameSrc,
            runtimeFrameInspection,
            contentFactoryActionE2e,
            consoleErrors,
            failedRequests,
            screenshot,
          },
          null,
          2,
        )}\n`,
      );
      console.log(`[smoke:agent-apps] summary=${summaryPath}`);
      console.log("[smoke:agent-apps] 通过");
      return;
    }

    logStage("return-agent-apps");
    await clickAgentAppsNav(page, options.timeoutMs);
    await page.waitForSelector('[data-testid="agent-apps-page"]', {
      timeout: options.timeoutMs,
    });
    await page.waitForSelector(
      '[data-testid="agent-apps-installed-content-factory-app"]',
      {
        timeout: options.timeoutMs,
      },
    );

    logStage("uninstall-rehearsal");
    await openContentFactoryDetails(page, options.timeoutMs);
    await page.click('[data-testid="agent-apps-uninstall-delete-data"]');
    await page.waitForSelector('[data-testid="agent-apps-uninstall-preview"]', {
      timeout: options.timeoutMs,
    });
    await page.waitForSelector(
      '[data-testid="agent-apps-cleanup-evidence-json"]',
      {
        timeout: options.timeoutMs,
      },
    );
    await page.waitForSelector('[data-testid="agent-apps-residual-audit"]', {
      timeout: options.timeoutMs,
    });
    const cleanupEvidenceText = await page.textContent(
      '[data-testid="agent-apps-cleanup-evidence-json"]',
    );
    const cleanupEvidence = JSON.parse(cleanupEvidenceText ?? "{}");
    const deleteDataConfirmationPhrase = (
      await page.textContent(
        '[data-testid="agent-apps-delete-data-confirmation-phrase"]',
      )
    )?.trim();
    assert(
      deleteDataConfirmationPhrase,
      "delete-data confirmation phrase should be visible before destructive uninstall",
    );
    const deleteDataCurrentPhaseGateVisible =
      (await page
        .locator('[data-testid="agent-apps-delete-data-current-phase-gate"]')
        .count()) > 0;
    const deleteDataConfirmationInput = page.locator(
      '[data-testid="agent-apps-delete-data-confirmation-input"]',
    );
    const deleteDataInputDisabled =
      await deleteDataConfirmationInput.isDisabled();
    const uninstallConfirm = page.locator(
      '[data-testid="agent-apps-uninstall-confirm"]',
    );
    const deleteDataConfirmDisabled = !(await uninstallConfirm.isEnabled());
    const stillInstalledAfterDeleteDataRehearsal =
      (await page
        .locator('[data-testid="agent-apps-installed-content-factory-app"]')
        .count()) > 0;

    logStage("uninstall-keep-data");
    await page.click('[data-testid="agent-apps-uninstall-keep-data"]');
    await page.waitForSelector('[data-testid="agent-apps-uninstall-preview"]', {
      timeout: options.timeoutMs,
    });
    await page
      .locator('[data-testid="agent-apps-delete-data-confirmation"]')
      .waitFor({ state: "detached", timeout: options.timeoutMs })
      .catch(() => {});
    const keepDataConfirm = page.locator(
      '[data-testid="agent-apps-uninstall-confirm"]',
    );
    const keepDataDeadline = Date.now() + options.timeoutMs;
    while (
      Date.now() < keepDataDeadline &&
      !(await keepDataConfirm.isEnabled())
    ) {
      await sleep(100);
    }
    assert(
      await keepDataConfirm.isEnabled(),
      "keep-data uninstall confirmation should be enabled",
    );
    await keepDataConfirm.click();
    await page.waitForSelector('[data-testid="agent-apps-launch-summary"]', {
      timeout: options.timeoutMs,
    });
    const uninstallDeadline = Date.now() + options.timeoutMs;
    while (
      Date.now() < uninstallDeadline &&
      (await page
        .locator('[data-testid="agent-apps-installed-content-factory-app"]')
        .count()) > 0
    ) {
      await sleep(100);
    }
    const keepDataRemovedInstalledState =
      (await page
        .locator('[data-testid="agent-apps-installed-content-factory-app"]')
        .count()) === 0;
    const postUninstallInstallSeed = await ensureContentFactoryInstalled(
      page,
      options,
      "post_keep_data_restore",
      contentFactoryRuntimeDir,
    );

    const flagOff = await runFlagOffRegression(options);
    await waitForMainAppStable(page, options.timeoutMs);
    await clickAgentAppsNav(page, options.timeoutMs);
    await page.waitForSelector('[data-testid="agent-apps-page"]', {
      timeout: options.timeoutMs,
    });
    await page.waitForSelector(
      '[data-testid="agent-apps-installed-content-factory-app"]',
      {
        timeout: options.timeoutMs,
      },
    );

    const assertions = {
      formalPageVisible:
        (await page.locator('[data-testid="agent-apps-page"]').count()) > 0,
      deleteDataDryRunRetainsInstalledState:
        stillInstalledAfterDeleteDataRehearsal,
      deleteDataCurrentPhaseGateVisible,
      deleteDataConfirmationGateLocked:
        Boolean(deleteDataConfirmationPhrase) &&
        deleteDataInputDisabled &&
        deleteDataConfirmDisabled,
      keepDataRemovedInstalledState,
      postUninstallInstalledStateRestored:
        (await page
          .locator('[data-testid="agent-apps-installed-content-factory-app"]')
          .count()) > 0,
      registrationRequiredBlocked: registrationInstallBlocked,
      cloudInstallReviewVisible:
        cloudInstallReviewVisible || cloudInstallAlreadySatisfied,
      disabledLaunchBlocked,
      runtimeSurfaceVisible: Boolean(runtimeFrameSrc),
      runtimeFrameContentFactoryLoaded:
        runtimeFrameInspection.contentFactoryLoaded,
      runtimeFrameHostProfileVisible: runtimeFrameInspection.hostProfileVisible,
      ...(contentFactoryActionE2e
        ? {
            contentFactoryActionStarted: contentFactoryActionE2e.startTaskSeen,
            contentFactoryActionMatches:
              contentFactoryActionE2e.actionName ===
              options.contentFactoryAction,
            contentFactoryActionTaskAccepted:
              contentFactoryActionE2e.taskAccepted,
            contentFactoryActionRuntimeFactsObserved:
              contentFactoryActionE2e.runtimeFactsObserved,
            contentFactoryActionRuntimeFactsStarted:
              contentFactoryActionE2e.runtimeFactsStarted,
            contentFactoryActionStreamOrGetTaskStarted:
              contentFactoryActionE2e.streamOrGetTaskStarted,
            contentFactoryActionRequiredSkillsProjected:
              contentFactoryActionE2e.requiredSkillsProjected,
            ...(contentFactoryActionE2e.completionE2e
              ? {
                  contentFactoryCompletionReady:
                    contentFactoryActionE2e.completionE2e.ready,
                }
              : {}),
            contentFactoryActionProcessVisible:
              contentFactoryActionE2e.processPanelVisible,
            contentFactoryActionNoHostFallback:
              !contentFactoryActionE2e.hostFallbackVisible,
          }
        : {}),
      cleanupEvidenceSelectedApp:
        cleanupEvidence.appId === "content-factory-app",
      cleanupEvidenceStrategy: cleanupEvidence.strategy === "delete-data",
      cleanupEvidenceDryRunOnly:
        Array.isArray(cleanupEvidence.warningCodes) &&
        cleanupEvidence.warningCodes.includes("DRY_RUN_ONLY"),
      cleanupEvidenceBlockedCount: cleanupEvidence.blockedTargetCount === 0,
      flagOffAgentAppsNavVisible: flagOff.assertions.agentAppsNavVisible,
      flagOffLabNavHidden: flagOff.assertions.labNavHidden,
      flagOffNoConsoleErrors: flagOff.assertions.noConsoleErrors,
    };

    Object.entries(assertions).forEach(([key, value]) => {
      assert(Boolean(value), `Assertion failed: ${key}`);
    });

    const screenshotPath = path.join(
      options.evidenceDir,
      `${options.prefix}.png`,
    );
    const summaryPath = path.join(
      options.evidenceDir,
      `${options.prefix}-summary.json`,
    );
    await page.screenshot({ path: screenshotPath, fullPage: true });
    fs.writeFileSync(
      summaryPath,
      `${JSON.stringify(
        {
          scenarioId: "agent-apps-smoke",
          appUrl: options.appUrl,
          assertions,
          runtimeFrameSrc,
          runtimeFrameInspection,
          contentFactoryActionE2e,
          cleanupEvidence,
          initialInstallSeed,
          postUninstallInstallSeed,
          flagOff,
          consoleErrors,
          failedRequests,
          ignoredConsoleErrors,
          ignoredFailedRequests,
          screenshot: screenshotPath,
        },
        null,
        2,
      )}\n`,
    );
    console.log(`[smoke:agent-apps] summary=${summaryPath}`);
    console.log("[smoke:agent-apps] 通过");
  } catch (error) {
    await collectFailureDiagnostics(
      page,
      options,
      error,
      consoleErrors,
      failedRequests,
      ignoredConsoleErrors,
      ignoredFailedRequests,
    );
    throw error;
  } finally {
    await context.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
