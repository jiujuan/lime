#!/usr/bin/env node

import fs from "node:fs";
import { execFile } from "node:child_process";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { chromium } from "playwright";

const execFileAsync = promisify(execFile);

const DEFAULTS = {
  appUrl: "http://127.0.0.1:1420/",
  healthUrl: "http://127.0.0.1:3030/health",
  timeoutMs: 120_000,
  intervalMs: 1_000,
  evidenceDir: path.join(process.cwd(), ".lime", "qc", "gui-evidence", "agent-apps"),
  prefix: "agent-apps-smoke",
  includeContentFactoryActionE2e: false,
  includeContentFactoryCompletionE2e: false,
  completionTimeoutMs: 90_000,
};

const ACCOUNT_MENU_BUTTON_SELECTOR = '[data-testid="app-sidebar-account-button"]';
const AGENT_APPS_NAV_SELECTOR =
  'button[aria-label="Agent Apps"], button[title="Agent Apps"]';
const AGENT_APP_LAB_NAV_SELECTOR =
  'button[aria-label="Agent App Lab"], button[title="Agent App Lab"]';

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
    if (arg === "--completion-timeout-ms" && argv[index + 1]) {
      options.completionTimeoutMs = Number(argv[index + 1]);
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
    return value.slice(0, 25).map((item) => sanitizeDiagnosticJson(item, depth + 1));
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
  const cwd = String(processInfo.cwd ?? "").replaceAll("\\", "/").toLowerCase();
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
  if (cwd.endsWith("/content-factory-app") || cwd.includes("/content-factory-app/")) {
    reasons.push("cwd:content-factory-app");
  }

  return reasons;
}

async function readUnixProcessCwd(pid) {
  const result = await execFileText("lsof", ["-a", "-p", String(pid), "-d", "cwd", "-Fn"], {
    maxBuffer: 64 * 1024,
    timeoutMs: 1_000,
  });
  if (!result.ok) {
    return null;
  }
  const match = result.stdout.match(/^n(.+)$/m);
  return match ? sanitizeDiagnosticText(match[1]) : null;
}

async function collectUnixProcessSnapshot() {
  const errors = [];
  const result = await execFileText("ps", ["-axo", "pid,ppid,pgid,stat,etime,command"], {
    maxBuffer: 4 * 1024 * 1024,
    timeoutMs: 2_000,
  });

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
      commandHints: ["content-factory-app", "agent-apps-smoke", "verify-gui-smoke", "3030", "1420"],
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
      command: sanitizeDiagnosticText(item.CommandLine ?? item.ExecutablePath ?? ""),
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
      commandHints: ["content-factory-app", "agent-apps-smoke", "verify-gui-smoke", "3030", "1420"],
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
    ([key, item]) => pattern.test(key) || valueContainsPattern(item, pattern, depth + 1),
  );
}

function hasContentFactoryWorkspacePatchValue(value, depth = 0) {
  if (depth > 8 || value == null) {
    return false;
  }
  if (Array.isArray(value)) {
    return value.some((item) => hasContentFactoryWorkspacePatchValue(item, depth + 1));
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
  const usage = findObjectByKeys(value, ["usage", "tokenUsage", "token_usage"], 7);
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
  ].some((key) => Number.isFinite(Number(usage[key])) && Number(usage[key]) > 0);
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
  ].includes(String(value ?? "").trim().toLowerCase());
}

function summarizeRuntimeSnapshotCompletion(snapshot) {
  if (!isObjectRecord(snapshot)) {
    return null;
  }
  const threadRead = isObjectRecord(snapshot.threadRead) ? snapshot.threadRead : {};
  const taskEvents = Array.isArray(snapshot.taskEvents) ? snapshot.taskEvents : [];
  const artifacts = Array.isArray(threadRead.artifacts) ? threadRead.artifacts : [];
  const toolCalls = Array.isArray(threadRead.tool_calls)
    ? threadRead.tool_calls
    : Array.isArray(threadRead.toolCalls)
      ? threadRead.toolCalls
      : [];
  const turns = Array.isArray(threadRead.turns) ? threadRead.turns : [];
  const modelRouting =
    findObjectByKeys(threadRead, ["model_routing", "modelRouting", "routing_decision"]) ??
    findObjectByKeys(snapshot, ["model_routing", "modelRouting", "routing_decision"]);
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
  const terminal = isTerminalRuntimeStatus(snapshot.taskStatus) ||
    isTerminalRuntimeStatus(threadRead.profile_status) ||
    isTerminalRuntimeStatus(threadRead.status);
  const hasRuntimeOutput =
    taskEvents.length > 0 || artifacts.length > 0 || toolCalls.length > 0 || turns.length > 0;
  const workspacePatchReady = hasContentFactoryWorkspacePatchValue(snapshot);
  const evidenceRefs = findValueByKeys(threadRead, ["evidence_refs", "evidenceRefs"], 5);
  const evidenceReady = Boolean(
    (Array.isArray(evidenceRefs) && evidenceRefs.length > 0) ||
      valueContainsPattern(taskEvents, /evidence/i) ||
      (workspacePatchReady && artifacts.length > 0),
  );

  return {
    modelReady: Boolean(selectedModel || selectedProvider),
    usageReady: hasTokenUsageValue(snapshot) || (terminal && hasRuntimeOutput),
    costReady: hasCostValue(snapshot),
    skillInvocationReady: Boolean(
      toolCalls.some((call) => /Skill/i.test(String(call?.tool_name ?? call?.toolName ?? ""))) ||
        valueContainsPattern(taskEvents, /skill|knowledge-builder|content-reviewer/i),
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
  ];
  const completion = {};
  for (const key of completionKeys) {
    completion[key] = Boolean(base.completion?.[key] || next.completion?.[key]);
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
      new Set([...(base.runtimeFactKeys ?? []), ...(next.runtimeFactKeys ?? [])]),
    ),
    recordSources: {
      ...(base.recordSources ?? {}),
      ...(next.recordSources ?? {}),
    },
    runtimeProcess:
      scoreRuntimeProcessSummary(next.runtimeProcess) >
      scoreRuntimeProcessSummary(base.runtimeProcess)
        ? next.runtimeProcess
        : base.runtimeProcess ?? next.runtimeProcess ?? null,
    directRuntimeSnapshot: next.directRuntimeSnapshot ?? base.directRuntimeSnapshot,
    completion,
  };
}

async function readContentFactoryDirectRuntimeRecord(options, hostTaskRecord) {
  const taskId = hostTaskRecord?.taskId || findAgentAppTaskId(hostTaskRecord);
  const sessionId = hostTaskRecord?.sessionId || findAgentAppSessionId(hostTaskRecord);
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
        error: body?.error ?? response.error ?? "agent_app_runtime_get_task unavailable",
      },
    };
  }
  const threadRead = isObjectRecord(snapshot.threadRead) ? snapshot.threadRead : {};
  const artifacts = Array.isArray(threadRead.artifacts) ? threadRead.artifacts : [];
  const toolCalls = Array.isArray(threadRead.tool_calls) ? threadRead.tool_calls : [];
  const taskEvents = Array.isArray(snapshot.taskEvents) ? snapshot.taskEvents : [];
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

async function collectFailureDiagnostics(page, options, error, consoleErrors, failedRequests) {
  const screenshotPath = path.join(options.evidenceDir, `${options.prefix}-failure.png`);
  const summaryPath = path.join(options.evidenceDir, `${options.prefix}-failure.json`);
  const bridgeTimeoutMs = Math.min(Math.max(options.intervalMs * 5, 5_000), 10_000);
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
        frame.locator("body").innerText({ timeout: 2_000 }).catch((frameError) => ({
          error: frameError instanceof Error ? frameError.message : String(frameError),
        })),
        frame.evaluate(() => window.limeAgentAppBridge?.getSdkCallLog?.() ?? []).catch(
          (frameError) => ({
            error: frameError instanceof Error ? frameError.message : String(frameError),
          }),
        ),
        frame
          .evaluate(() => {
            const bridge = window.limeAgentAppBridge;
            const bridgeRecord =
              bridge?.getHostTaskRunRecord?.("contentFactoryProduction") ?? null;
            const callLog = bridge?.getSdkCallLog?.();
            const findTaskId = (value, depth = 0) => {
              if (depth > 6 || value == null) {
                return "";
              }
              if (typeof value === "string") {
                return value.match(/agent-app-task-[a-z0-9-]+/i)?.[0] ?? "";
              }
              if (Array.isArray(value)) {
                return value.map((item) => findTaskId(item, depth + 1)).find(Boolean) ?? "";
              }
              if (typeof value === "object") {
                if (typeof value.taskId === "string" && value.taskId.trim()) {
                  return value.taskId.trim();
                }
                return Object.values(value)
                  .map((item) => findTaskId(item, depth + 1))
                  .find(Boolean) ?? "";
              }
              return "";
            };
            const sdkTaskId = Array.isArray(callLog) ? findTaskId(callLog) : "";
            const taskRecord = sdkTaskId
              ? bridge?.getHostTaskRunRecord?.(sdkTaskId) ?? null
              : null;
            return { bridgeRecord, taskRecord, sdkTaskId };
          })
          .catch((frameError) => ({
            error: frameError instanceof Error ? frameError.message : String(frameError),
          })),
      ]);
      runtimeFrameState = {
        url: frame.url(),
        bodyText:
          typeof bodyText === "string" ? sanitizeDiagnosticText(bodyText) : bodyText,
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

  const summary = {
    scenarioId: "agent-apps-smoke-failure",
    appUrl: options.appUrl,
    failedAt: new Date().toISOString(),
    error: error instanceof Error ? error.message : String(error),
    pageState,
    runtimeFrameState,
    bridgeHealth,
    runtimeStatus,
    processSnapshot,
    consoleErrors,
    failedRequests,
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

async function getContentFactoryRuntimeFrame(page, timeoutMs) {
  const frameHandle = await page.waitForSelector('[data-testid="agent-app-runtime-frame"]', {
    timeout: Math.min(timeoutMs, 30_000),
  });
  const frame = await frameHandle.contentFrame();
  assert(frame, "Content Factory runtime frame should be attached");
  return frame;
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
      const bridgeRecord = bridge?.getHostTaskRunRecord?.("contentFactoryProduction");
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
          for (const key of ["sessionId", "session_id", "threadId", "thread_id"]) {
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
      const taskRecord = sdkTaskId ? bridge?.getHostTaskRunRecord?.(sdkTaskId) : null;
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
          Array.isArray(process.invokedSkillNames) ? process.invokedSkillNames.length * 8 : 0,
        ].reduce((sum, value) => sum + Number(value || 0), 0);
      };
      const runtimeProcess = records
        .flatMap((record) => [
          record?.runtimeProcess,
          record?.process,
          record?.task?.runtimeProcess,
          record?.task?.process,
          record?.snapshot?.runtimeProcess,
          record?.snapshot?.process,
        ])
        .filter((item) => item && typeof item === "object")
        .sort((left, right) => scoreProcess(right) - scoreProcess(left))[0] ?? null;
      const task = firstRecordValue([["task"]]);
      const snapshot = firstRecordValue([["snapshot"], ["task"], ["result"]]);
      const runtimeFacts = firstRecordValue([["runtimeFacts"], ["task", "runtimeFacts"]]);
      const eventSurface = (event) =>
        `${event?.eventType ?? ""} ${event?.type ?? ""} ${event?.toolName ?? ""} ${event?.message ?? ""} ${event?.evidenceRef ?? ""} ${event?.artifactRef ?? ""}`;
      const anyEvent = (pattern) => events.some((event) => pattern.test(eventSurface(event)));
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
        return Object.values(value).some((item) => hasWorkspacePatch(item, depth + 1));
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
      return {
        taskId,
        sessionId,
        taskIdSource: hostRecordTaskId ? "hostTaskRunRecord" : sdkTaskId ? "sdkCallLog" : "",
        hostRecordTaskId,
        sdkTaskId,
        recordSources: {
          bridgeAction: Boolean(bridgeRecord),
          taskId: Boolean(taskRecord),
        },
        taskStatus: task?.status ?? snapshot?.taskStatus ?? snapshot?.status ?? "",
        hasRuntimeFacts: Boolean(runtimeFacts),
        runtimeFactKeys:
          runtimeFacts && typeof runtimeFacts === "object" ? Object.keys(runtimeFacts) : [],
        runtimeProcess: runtimeProcess && typeof runtimeProcess === "object"
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
              invokedSkillNames: Array.isArray(runtimeProcess.invokedSkillNames)
                ? runtimeProcess.invokedSkillNames
                : [],
            }
          : null,
        completion: {
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
            runtimeProcess?.invokedSkillNames?.length ||
              anyEvent(/skill/i),
          ),
          artifactReady: Boolean(
            runtimeProcess?.artifactCount > 0 ||
              anyEvent(/artifact/i),
          ),
          evidenceReady: anyEvent(/evidence/i),
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

function summarizeCapabilityCalls(callLog) {
  return callLog
    .map((call) => `${call?.capability ?? "unknown"}.${call?.method ?? "unknown"}`)
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
    latestRecord = mergeContentFactoryHostTaskRecords(latestRecord, frameRecord);
    const directRecord = await readContentFactoryDirectRuntimeRecord(options, latestRecord);
    latestRecord = mergeContentFactoryHostTaskRecords(latestRecord, directRecord);
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

  const bodyText = await frame.locator("body").innerText({ timeout: boundedTimeoutMs });
  const hostProfileVisible =
    bodyText.includes("已连接 Lime AI 同事") ||
    bodyText.includes("部分 Lime 能力暂不可用") ||
    bodyText.includes("模型、Token、费用和 Skills 由 Lime Host 统一回写");
  return {
    contentFactoryLoaded: bodyText.includes("内容工厂"),
    hostProfileVisible,
    bodyPreview: bodyText.slice(0, 1_000),
  };
}

async function runContentFactoryActionE2e(page, options) {
  const frame = await getContentFactoryRuntimeFrame(page, options.timeoutMs);
  const boundedTimeoutMs = Math.min(options.timeoutMs, 45_000);
  const beforeCallLog = await readContentFactorySdkCallLog(frame);

  await frame.locator('button[data-page="start"]').first().click({
    timeout: boundedTimeoutMs,
  });
  await frame.getByText("知识库底座").first().waitFor({ timeout: boundedTimeoutMs });

  const buildStoreButton = frame.locator('button[data-action="build-store"]').first();
  await buildStoreButton.waitFor({ state: "visible", timeout: boundedTimeoutMs });
  const buildStoreDisabled = await buildStoreButton.isDisabled().catch(() => false);
  assert(!buildStoreDisabled, "Content Factory build-store action should be enabled");
  await buildStoreButton.click({ timeout: boundedTimeoutMs });

  await frame.waitForFunction(
    () =>
      window.limeAgentAppBridge
        ?.getSdkCallLog?.()
        ?.some((call) => call.capability === "lime.agent" && call.method === "startTask"),
    undefined,
    { timeout: boundedTimeoutMs },
  );
  await frame.waitForFunction(
    () => {
      const record = window.limeAgentAppBridge?.getHostTaskRunRecord?.("contentFactoryProduction");
      const callLog = window.limeAgentAppBridge?.getSdkCallLog?.();
      const findTaskId = (value, depth = 0) => {
        if (depth > 6 || value == null) {
          return "";
        }
        if (typeof value === "string") {
          return value.match(/agent-app-task-[a-z0-9-]+/i)?.[0] ?? "";
        }
        if (Array.isArray(value)) {
          return value.map((item) => findTaskId(item, depth + 1)).find(Boolean) ?? "";
        }
        if (typeof value === "object") {
          if (typeof value.taskId === "string" && value.taskId.trim()) {
            return value.taskId.trim();
          }
          return Object.values(value)
            .map((item) => findTaskId(item, depth + 1))
            .find(Boolean) ?? "";
        }
        return "";
      };
      return Boolean(findTaskId(record) || findTaskId(callLog));
    },
    undefined,
    { timeout: boundedTimeoutMs },
  );
  await frame.locator("body").getByText(/AI 同事正在整理知识库|Lime AI 运行现场|正在连接 Lime AI 同事/).first().waitFor({
    timeout: boundedTimeoutMs,
  });

  const bodyText = await frame.locator("body").innerText({ timeout: boundedTimeoutMs });
  const afterCallLog = await readContentFactorySdkCallLog(frame);
  const hostTaskRecord = await readContentFactoryHostTaskRecord(frame);
  const newCalls = summarizeCapabilityCalls(afterCallLog.slice(beforeCallLog.length));
  const runtimeFacts = summarizeContentFactoryRuntimeFacts(newCalls);
  const startTaskSeen = newCalls.includes("lime.agent.startTask");
  const taskAccepted = Boolean(hostTaskRecord.taskId);
  const hostTaskRecordSeen = Boolean(hostTaskRecord.hostRecordTaskId);
  const runtimeFactsObserved = Boolean(hostTaskRecord.hasRuntimeFacts);
  const requiredSkillsProjected = ["knowledge-builder", "content-reviewer"].every((skillName) =>
    (hostTaskRecord.runtimeProcess?.skillNames ?? []).includes(skillName) ||
    bodyText.includes(skillName),
  );
  const processPanelVisible =
    bodyText.includes("Lime AI 运行现场") ||
    bodyText.includes("正在连接 Lime AI 同事") ||
    bodyText.includes("AI 同事正在整理知识库");
  const hostFallbackVisible = bodyText.includes("Lime AI 同事连接失败");

  assert(startTaskSeen, "Content Factory action E2E should invoke lime.agent.startTask");
  assert(taskAccepted, "Content Factory action E2E should receive a Host task id");
  assert(runtimeFactsObserved, "Content Factory action E2E should expose Host runtime facts");
  assert(
    runtimeFacts.modelsStarted && runtimeFacts.usageStarted && runtimeFacts.skillsStarted,
    "Content Factory action E2E should request Host runtime facts",
  );
  assert(
    runtimeFacts.streamOrGetTaskStarted,
    "Content Factory action E2E should subscribe to or poll the Host task",
  );
  assert(
    requiredSkillsProjected,
    "Content Factory action E2E should project required content factory Skills",
  );
  assert(processPanelVisible, "Content Factory action E2E should keep the process panel visible");
  assert(!hostFallbackVisible, "Content Factory action E2E should not fall back after Host connection");

  const completionTimeoutMs = Math.min(
    options.timeoutMs,
    Number.isFinite(options.completionTimeoutMs) ? options.completionTimeoutMs : 90_000,
  );
  const completionE2e = options.includeContentFactoryCompletionE2e
    ? await waitForContentFactoryCompletionE2e(frame, options, completionTimeoutMs)
    : null;

  return {
    startTaskSeen,
    taskAccepted,
    hostTaskRecordSeen,
    runtimeFactsObserved,
    runtimeFactsStarted:
      runtimeFacts.modelsStarted && runtimeFacts.usageStarted && runtimeFacts.skillsStarted,
    streamOrGetTaskStarted: runtimeFacts.streamOrGetTaskStarted,
    requiredSkillsProjected,
    processPanelVisible,
    hostFallbackVisible,
    hostTaskRecord,
    completionE2e,
    capabilityCalls: newCalls,
    bodyPreview: bodyText.slice(0, 1_000),
  };
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
        packageUrl: "https://lime.local/agent-apps/content-factory-app/releases/0.3.0/package.zip",
        packageHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        manifestHash: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
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
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "lime-agent-apps-flag-off-"));
  const context = await launchSmokeContext(userDataDir);
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
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
      agentAppsNavVisible: (await page.locator(AGENT_APPS_NAV_SELECTOR).count()) > 0,
      labNavHidden: (await page.locator(AGENT_APP_LAB_NAV_SELECTOR).count()) === 0,
      noConsoleErrors: consoleErrors.length === 0,
    };

    Object.entries(assertions).forEach(([key, value]) => {
      assert(Boolean(value), `Flag-off assertion failed: ${key}`);
    });

    const screenshotPath = path.join(options.evidenceDir, `${options.prefix}-flag-off.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    return {
      assertions,
      consoleErrors,
      screenshot: screenshotPath,
    };
  } finally {
    await context.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  fs.mkdirSync(options.evidenceDir, { recursive: true });
  await waitForHealth(options);

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "lime-agent-apps-smoke-"));
  const context = await launchSmokeContext(userDataDir);
  const consoleErrors = [];
  const failedRequests = [];

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
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });
  page.on("requestfailed", (request) => {
    failedRequests.push({
      url: request.url(),
      method: request.method(),
      failure: request.failure()?.errorText ?? "unknown",
    });
  });

  try {
    logStage("open-app");
    await page.goto(options.appUrl, { waitUntil: "domcontentloaded", timeout: options.timeoutMs });
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
    await page.waitForSelector('[data-testid="agent-apps-installed-content-factory-app"]', {
      timeout: options.timeoutMs,
    });

    logStage("verify-registration-required");
    await page.waitForSelector('[data-testid="agent-apps-registration-content-factory-app"]', {
      timeout: options.timeoutMs,
    });
    const registrationInstallBlocked = await page.isDisabled(
      '[data-testid="agent-apps-install-cloud-content-factory-app"]',
    );

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

    logStage("install-cloud-review");
    await page.click('[data-testid="agent-apps-install-cloud-content-factory-app"]', {
      timeout: options.timeoutMs,
    });
    await page.waitForSelector('[data-testid="agent-apps-install-review"]', {
      timeout: options.timeoutMs,
    });
    await page.click('[data-testid="agent-apps-install-review-confirm"]');
    await page.waitForSelector('[data-testid="agent-apps-installed-content-factory-app"]', {
      timeout: options.timeoutMs,
    });

    logStage("disable-enable");
    await page.click('[data-testid="agent-apps-installed-content-factory-app"]');
    await page.click('[data-testid="agent-apps-disable"]');
    await page.waitForFunction(
      () =>
        document
          .querySelector('[data-testid="agent-apps-launch-entry-dashboard"]')
          ?.hasAttribute("disabled") &&
        !document.querySelector('[data-testid="agent-apps-enable"]')?.hasAttribute("disabled"),
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
    await page.waitForSelector('[data-testid="agent-app-runtime-surface"]', {
      timeout: options.timeoutMs,
    });
    await page.waitForSelector('[data-testid="agent-app-runtime-frame"]', {
      timeout: options.timeoutMs,
    });
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

    logStage("return-agent-apps");
    await clickAgentAppsNav(page, options.timeoutMs);
    await page.waitForSelector('[data-testid="agent-apps-page"]', {
      timeout: options.timeoutMs,
    });
    await page.waitForSelector('[data-testid="agent-apps-installed-content-factory-app"]', {
      timeout: options.timeoutMs,
    });

    logStage("uninstall-rehearsal");
    await page.click('[data-testid="agent-apps-uninstall-delete-data"]');
    await page.waitForSelector('[data-testid="agent-apps-uninstall-preview"]', {
      timeout: options.timeoutMs,
    });
    await page.waitForSelector('[data-testid="agent-apps-cleanup-evidence-json"]', {
      timeout: options.timeoutMs,
    });
    await page.waitForSelector('[data-testid="agent-apps-residual-audit"]', {
      timeout: options.timeoutMs,
    });
    const cleanupEvidenceText = await page.textContent(
      '[data-testid="agent-apps-cleanup-evidence-json"]',
    );
    const cleanupEvidence = JSON.parse(cleanupEvidenceText ?? "{}");
    await page.click('[data-testid="agent-apps-uninstall-confirm"]');
    await page.waitForSelector('[data-testid="agent-apps-launch-summary"]', {
      timeout: options.timeoutMs,
    });
    const stillInstalledAfterRehearsal =
      (await page.locator('[data-testid="agent-apps-installed-content-factory-app"]').count()) > 0;

    const flagOff = await runFlagOffRegression(options);
    const assertions = {
      formalPageVisible: Boolean(await page.$('[data-testid="agent-apps-page"]')),
      installedVisible: stillInstalledAfterRehearsal,
      registrationRequiredBlocked: registrationInstallBlocked,
      cloudInstallReviewVisible: true,
      disabledLaunchBlocked,
      runtimeSurfaceVisible: Boolean(runtimeFrameSrc),
      runtimeFrameContentFactoryLoaded: runtimeFrameInspection.contentFactoryLoaded,
      runtimeFrameHostProfileVisible: runtimeFrameInspection.hostProfileVisible,
      ...(contentFactoryActionE2e
        ? {
            contentFactoryActionStarted: contentFactoryActionE2e.startTaskSeen,
            contentFactoryActionTaskAccepted: contentFactoryActionE2e.taskAccepted,
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
            contentFactoryActionProcessVisible: contentFactoryActionE2e.processPanelVisible,
            contentFactoryActionNoHostFallback: !contentFactoryActionE2e.hostFallbackVisible,
          }
        : {}),
      cleanupEvidenceSelectedApp: cleanupEvidence.appId === "content-factory-app",
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

    const screenshotPath = path.join(options.evidenceDir, `${options.prefix}.png`);
    const summaryPath = path.join(options.evidenceDir, `${options.prefix}-summary.json`);
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
          flagOff,
          consoleErrors,
          failedRequests,
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
