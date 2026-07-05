#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  assertSmoke,
  exportAgentSessionEvidencePackCurrent,
  invokeDevBridge,
  readAgentRuntimeThreadCurrent,
  sleep,
  summarizeThreadRead,
  threadSettled,
  waitForHealth,
} from "./lib/managed-objective-continuation-smoke-core.mjs";
import {
  assertLiveProviderSmokeAllowed,
  liveProviderSmokeAllowed,
} from "./lib/live-provider-smoke-gate.mjs";
import {
  buildAutomationFixtureMarkdown,
  buildAutomationFixtureScriptedResponses,
  buildAutomationJobRequest,
  buildAutomationSmokeEvidence,
  fixtureChatRequestCount,
  metadataFromRun,
  registerAutomationSmokeWorkspaceSkill,
  sessionIdFromRun,
  workspaceIdFromDefaultProject,
  workspaceRootFromDefaultProject,
} from "./lib/managed-objective-automation-smoke-support.mjs";
import { startOpenAiCompatibleFixtureServer } from "./lib/openai-compatible-fixture-server.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const DEFAULT_OUTPUT = path.join(
  rootDir,
  ".lime/qc/managed-objective-automation-smoke.json",
);
const DEFAULT_HEALTH_URL = "http://127.0.0.1:3030/health";
const DEFAULT_INVOKE_URL = "http://127.0.0.1:3030/invoke";
const DEFAULT_TIMEOUT_MS = 180_000;
const DEFAULT_INTERVAL_MS = 1_000;
const LOG_PREFIX = "[smoke:managed-objective-automation]";
const APP_SERVER_EXECUTOR_GAP =
  "automationJob/runNow 尚未迁移到 App Server 执行器";

async function invokeAppServerJsonRpc(
  options,
  method,
  params = {},
  timeoutMs = options.timeoutMs,
) {
  const response = await invokeDevBridge(
    options,
    "app_server_handle_json_lines",
    {
      request: {
        timeoutMs,
        lines: [
          JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method,
            params,
          }),
        ],
      },
    },
    timeoutMs,
  );
  const responseLines = response?.result?.lines ?? response?.lines;
  const lines = Array.isArray(responseLines) ? responseLines : [];
  for (const line of lines) {
    const text = typeof line === "string" ? line.trim() : "";
    if (!text) {
      continue;
    }
    const message = JSON.parse(text);
    if (message?.id !== 1) {
      continue;
    }
    if (message.error) {
      const detail = JSON.stringify(message.error);
      throw new Error(`${method} App Server error: ${detail}`);
    }
    return message.result;
  }
  throw new Error(`${method} did not return App Server JSON-RPC response`);
}

function printHelp() {
  console.log(`
Lime Managed Objective Automation Smoke

用途:
  通过 DevBridge current 命令验证 automation job owner 能默认离线执行 Managed Objective，
  并能从 run history / runtime session / evidence pack 回看 owner 关系。

用法:
  npm run smoke:managed-objective-automation

选项:
  --output <path>       evidence JSON 输出路径，默认 .lime/qc/managed-objective-automation-smoke.json
  --health-url <url>    DevBridge health 地址，默认 ${DEFAULT_HEALTH_URL}
  --invoke-url <url>    DevBridge invoke 地址，默认 ${DEFAULT_INVOKE_URL}
  --timeout-ms <ms>     总等待超时，默认 ${DEFAULT_TIMEOUT_MS}
  --interval-ms <ms>    轮询间隔，默认 ${DEFAULT_INTERVAL_MS}
  --allow-live-provider 保留统一 live gate 语义；本 smoke 默认且推荐使用 localhost fixture
  --no-write            只运行校验并打印摘要，不写 evidence JSON
  -h, --help            显示帮助
`);
}

function parseArgs(argv) {
  const options = {
    output: DEFAULT_OUTPUT,
    healthUrl: DEFAULT_HEALTH_URL,
    invokeUrl: DEFAULT_INVOKE_URL,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    intervalMs: DEFAULT_INTERVAL_MS,
    allowLiveProvider: liveProviderSmokeAllowed(),
    write: true,
    logPrefix: LOG_PREFIX,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
    if (arg === "--output" && argv[index + 1]) {
      options.output = path.resolve(rootDir, String(argv[index + 1]));
      index += 1;
      continue;
    }
    if (arg === "--health-url" && argv[index + 1]) {
      options.healthUrl = String(argv[index + 1]).trim();
      index += 1;
      continue;
    }
    if (arg === "--invoke-url" && argv[index + 1]) {
      options.invokeUrl = String(argv[index + 1]).trim();
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
    if (arg === "--allow-live-provider") {
      options.allowLiveProvider = true;
      continue;
    }
    if (arg === "--no-write") {
      options.write = false;
      continue;
    }
    throw new Error(`未知参数: ${arg}`);
  }

  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs < 30_000) {
    throw new Error("--timeout-ms 必须是 >= 30000 的数字");
  }
  if (!Number.isFinite(options.intervalMs) || options.intervalMs < 100) {
    throw new Error("--interval-ms 必须是 >= 100 的数字");
  }
  if (!options.healthUrl || !options.invokeUrl) {
    throw new Error("--health-url / --invoke-url 不能为空");
  }

  return options;
}

function writeEvidence(outputPath, evidence) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`);
  return outputPath;
}

function writeEvidenceWithFallback(outputPath, evidence) {
  try {
    return writeEvidence(outputPath, evidence);
  } catch (error) {
    if (outputPath !== DEFAULT_OUTPUT) {
      throw error;
    }
    const fallbackPath = path.join(
      os.tmpdir(),
      "managed-objective-automation-smoke.json",
    );
    const writtenPath = writeEvidence(fallbackPath, evidence);
    console.warn(
      `${LOG_PREFIX} default evidence write failed, fallback=${writtenPath}: ${error.message}`,
    );
    return writtenPath;
  }
}

async function resolveWorkspaceRoot(options, workspace, workspaceId) {
  const directRoot = workspaceRootFromDefaultProject(workspace);
  if (directRoot) {
    return directRoot;
  }

  const ensured = await invokeDevBridge(options, "workspace_ensure_ready", {
    id: workspaceId,
  });
  const ensuredRoot = workspaceRootFromDefaultProject(ensured);
  assertSmoke(ensuredRoot, "默认 workspace 缺少 rootPath");
  return ensuredRoot;
}

async function createAutomationThreadLineage(options, workspaceId) {
  const response = await invokeAppServerJsonRpc(options, "agentSession/start", {
    appId: "desktop",
    workspaceId,
    businessObjectRef: {
      kind: "automation_job",
      id: `managed-objective-automation-smoke:${Date.now()}`,
      title: "Managed Objective automation smoke",
      metadata: {
        source: "smoke:managed-objective-automation",
        harness: {
          automation_job: {
            source: "managed_objective_automation_smoke",
            scope: "thread",
          },
        },
      },
    },
  });
  const sessionId = String(
    response?.session?.sessionId || response?.session?.session_id || "",
  ).trim();
  const threadId = String(
    response?.session?.threadId || response?.session?.thread_id || "",
  ).trim();
  assertSmoke(sessionId, "agentSession/start 未返回 automation sessionId");
  assertSmoke(threadId, "agentSession/start 未返回 automation threadId");
  return { session_id: sessionId, thread_id: threadId };
}

async function waitForRuntimeFixtureCompletion(
  options,
  sessionId,
  fixtureRequests,
) {
  const startedAt = Date.now();
  let lastSnapshot = null;

  while (Date.now() - startedAt < options.timeoutMs) {
    const threadRead = await readAgentRuntimeThreadCurrent(options, sessionId);
    lastSnapshot = {
      threadRead: summarizeThreadRead(threadRead),
      fixtureChatRequestCount: fixtureChatRequestCount(fixtureRequests),
    };
    if (
      lastSnapshot.fixtureChatRequestCount > 0 &&
      threadSettled(threadRead) &&
      (lastSnapshot.threadRead.turnCount || 0) >= 1
    ) {
      return lastSnapshot;
    }
    await sleep(options.intervalMs);
  }

  throw new Error(
    `${LOG_PREFIX} wait runtime fixture completion timeout; last=${JSON.stringify(lastSnapshot)}`,
  );
}

async function runSmoke(options) {
  console.log(`${LOG_PREFIX} stage=health`);
  const health = await waitForHealth(options);

  if (options.allowLiveProvider) {
    assertLiveProviderSmokeAllowed({
      allowed: options.allowLiveProvider,
      scriptName: "smoke:managed-objective-automation",
    });
  }

  let fixture = null;
  try {
    console.log(`${LOG_PREFIX} stage=workspace`);
    const workspace = await invokeDevBridge(
      options,
      "get_or_create_default_project",
      {},
      30_000,
    );
    const workspaceId = workspaceIdFromDefaultProject(workspace);
    assertSmoke(workspaceId, "默认 workspace 缺少 id");
    const workspaceRoot = await resolveWorkspaceRoot(
      options,
      workspace,
      workspaceId,
    );

    console.log(`${LOG_PREFIX} stage=register-workspace-skill`);
    const skillBinding = await registerAutomationSmokeWorkspaceSkill(
      options,
      workspaceRoot,
      invokeDevBridge,
    );
    console.log(
      `${LOG_PREFIX} workspace-skill=${skillBinding.skillName} directory=${skillBinding.skillDirectory}`,
    );

    console.log(`${LOG_PREFIX} stage=fixture-provider`);
    fixture = await startOpenAiCompatibleFixtureServer({
      content: buildAutomationFixtureMarkdown(),
      deferScriptedToolCallsUntilAvailable: true,
      scriptedResponses: buildAutomationFixtureScriptedResponses(skillBinding),
    });
    console.log(
      `${LOG_PREFIX} provider=localhost-fixture baseUrl=${fixture.baseUrl}`,
    );

    console.log(`${LOG_PREFIX} stage=create-thread-lineage`);
    const threadLineage = await createAutomationThreadLineage(
      options,
      workspaceId,
    );
    console.log(
      `${LOG_PREFIX} lineage session=${threadLineage.session_id} thread=${threadLineage.thread_id}`,
    );

    console.log(`${LOG_PREFIX} stage=create-automation-job`);
    const jobWrite = await invokeAppServerJsonRpc(
      options,
      "automationJob/create",
      {
        request: buildAutomationJobRequest(
          workspaceId,
          skillBinding,
          fixture.provider,
          threadLineage,
        ),
      },
    );
    const job = jobWrite?.job || null;
    assertSmoke(job?.id, "automationJob/create 未返回 job id");

    console.log(`${LOG_PREFIX} stage=run-automation-job job=${job.id}`);
    let runResult;
    try {
      const runNowResponse = await invokeAppServerJsonRpc(
        options,
        "automationJob/runNow",
        { id: job.id },
        options.timeoutMs,
      );
      runResult = runNowResponse?.result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes(APP_SERVER_EXECUTOR_GAP)) {
        throw new Error(
          `${APP_SERVER_EXECUTOR_GAP}，本 smoke 不能回退退役的 Tauri 自动化命令。请先迁移 App Server 自动化执行器后再运行该 owner smoke。`,
        );
      }
      throw error;
    }
    assertSmoke(runResult, "automationJob/runNow 未返回 result");

    console.log(`${LOG_PREFIX} stage=run-history`);
    const runHistory = await invokeAppServerJsonRpc(
      options,
      "automationJob/runHistory",
      {
        id: job.id,
        limit: 5,
      },
    );
    const runs = Array.isArray(runHistory?.runs) ? runHistory.runs : [];

    const latestRun = Array.isArray(runs) ? runs[0] : null;
    const latestRunMetadata = metadataFromRun(latestRun);
    const runSessionId = sessionIdFromRun(latestRun);
    assertSmoke(runSessionId, "automation run history 缺少 runtime session_id");

    console.log(
      `${LOG_PREFIX} stage=wait-runtime-fixture session=${runSessionId}`,
    );
    const runtimeSnapshot = await waitForRuntimeFixtureCompletion(
      options,
      runSessionId,
      fixture.requests,
    );

    console.log(
      `${LOG_PREFIX} stage=export-evidence-pack session=${runSessionId}`,
    );
    const evidencePack = await exportAgentSessionEvidencePackCurrent(options, {
      sessionId: runSessionId,
    });

    const evidence = buildAutomationSmokeEvidence({
      generatedAt: new Date().toISOString(),
      options,
      health,
      workspace,
      skillBinding,
      provider: fixture.provider,
      providerSessionId: null,
      job,
      runResult,
      latestRun,
      latestRunMetadata,
      runtimeSnapshot,
      evidencePack,
      fixtureRequests: fixture.requests,
    });

    for (const [key, value] of Object.entries(
      evidence.projectThreadAssertions,
    )) {
      assertSmoke(value, `assertion failed: ${key}`);
    }
    assertSmoke(
      evidence.projectThreadStatus === "pass",
      "managed objective automation smoke ProjectThread evidence 未通过",
    );
    if (evidence.completionAuditStatus !== "pass") {
      const failedCompletionAssertions = Object.entries(
        evidence.completionAuditAssertions,
      )
        .filter(([, value]) => !value)
        .map(([key]) => key);
      const failedCompletionSummary =
        failedCompletionAssertions.join(",") || "none";
      console.warn(
        `${LOG_PREFIX} completion-audit-status=${evidence.completionAuditStatus} failed=${failedCompletionSummary}`,
      );
    }

    return evidence;
  } finally {
    if (fixture) {
      await fixture.close();
    }
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const evidence = await runSmoke(options);

  if (options.write) {
    const writtenPath = writeEvidenceWithFallback(options.output, evidence);
    console.log(`${LOG_PREFIX} evidence=${writtenPath}`);
  } else {
    console.log(JSON.stringify(evidence, null, 2));
  }

  const statusSummary = [
    `projectThread=${evidence.projectThreadStatus}`,
    `status=${evidence.status}`,
    `completionAudit=${evidence.completionAuditStatus}`,
    `job=${evidence.automation.jobId}`,
    `session=${evidence.runtime.sessionId}`,
    `fixtureRequests=${evidence.fixture.chatCompletionRequestCount}`,
  ].join(" ");
  console.log(`${LOG_PREFIX} ${statusSummary}`);
}

main().catch((error) => {
  console.error(
    `${LOG_PREFIX} failed: ${error instanceof Error ? error.stack || error.message : String(error)}`,
  );
  process.exitCode = 1;
});
