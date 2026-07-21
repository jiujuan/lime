#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  assertSmoke,
  buildSmokeEvidence,
  createAgentSessionCurrent,
  exportAgentSessionEvidencePackCurrent,
  guardSummaryText,
  invokeDevBridge,
  objectiveReachedBudgetLimit,
  resolveProviderPreference,
  setAgentSessionObjectiveCurrent,
  startAgentSessionTurnCurrent,
  threadSettled,
  updateAgentSessionRuntimeCurrent,
  waitForHealth,
  waitForObjectiveState,
} from "./lib/managed-objective-continuation-smoke-core.mjs";
import {
  assertLiveProviderSmokeAllowed,
  liveProviderSmokeAllowed,
} from "./lib/live-provider-smoke-gate.mjs";
import { startOpenAiCompatibleFixtureServer } from "./lib/openai-compatible-fixture-server.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const DEFAULT_OUTPUT = path.join(
  rootDir,
  ".lime/qc/managed-objective-continuation-smoke.json",
);
const DEFAULT_HEALTH_URL = "http://127.0.0.1:3030/health";
const DEFAULT_INVOKE_URL = "http://127.0.0.1:3030/invoke";
const DEFAULT_TIMEOUT_MS = 180_000;
const DEFAULT_INTERVAL_MS = 1_000;
const DEFAULT_MAX_AUTO_TURNS = 1;
const LIVE_PROVIDER_ENV_PREFERENCE =
  process.env.LIME_AGENT_QC_PROVIDER ||
  process.env.LIME_E2E_PROVIDER ||
  process.env.LIME_DEFAULT_PROVIDER ||
  "";
const LIVE_MODEL_ENV_PREFERENCE =
  process.env.LIME_AGENT_QC_MODEL ||
  process.env.LIME_E2E_MODEL ||
  process.env.LIME_DEFAULT_MODEL ||
  "";
const DEFAULT_ALLOW_LIVE_PROVIDER = liveProviderSmokeAllowed();
const LOG_PREFIX = "[smoke:managed-objective-continuation]";

function printHelp() {
  console.log(`
Lime Managed Objective Continuation Smoke

用途:
  通过 DevBridge current 命令验证 Managed Objective 的受控自动续跑：
  首轮 turn/start current JSON-RPC 完成后自动投递下一轮，随后在 maxAutoTurns 下进入 budget_limited。

用法:
  npm run smoke:managed-objective-continuation
  npm run smoke:managed-objective-continuation -- --allow-live-provider --provider-preference deepseek --model-preference deepseek-v4-flash

选项:
  --output <path>              evidence JSON 输出路径，默认 .lime/qc/managed-objective-continuation-smoke.json
  --health-url <url>           DevBridge health 地址，默认 ${DEFAULT_HEALTH_URL}
  --invoke-url <url>           DevBridge invoke 地址，默认 ${DEFAULT_INVOKE_URL}
  --timeout-ms <ms>            总等待超时，默认 ${DEFAULT_TIMEOUT_MS}
  --interval-ms <ms>           轮询间隔，默认 ${DEFAULT_INTERVAL_MS}
  --provider-preference <id>   live 模式可选，显式指定 provider id
  --model-preference <model>   live 模式可选，显式指定 model
  --allow-live-provider        确认允许调用真实模型 Provider；默认使用 localhost fixture
  --max-auto-turns <n>         自动续跑最大轮数，默认 ${DEFAULT_MAX_AUTO_TURNS}
  --no-write                   只运行校验并打印摘要，不写 evidence JSON
  -h, --help                   显示帮助
`);
}

function parseArgs(argv) {
  const options = {
    output: DEFAULT_OUTPUT,
    healthUrl: DEFAULT_HEALTH_URL,
    invokeUrl: DEFAULT_INVOKE_URL,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    intervalMs: DEFAULT_INTERVAL_MS,
    providerPreference: "",
    modelPreference: "",
    allowLiveProvider: DEFAULT_ALLOW_LIVE_PROVIDER,
    maxAutoTurns: DEFAULT_MAX_AUTO_TURNS,
    write: true,
    logPrefix: LOG_PREFIX,
    explicitProviderPreference: false,
    explicitModelPreference: false,
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
    if (arg === "--provider-preference" && argv[index + 1]) {
      options.providerPreference = String(argv[index + 1]).trim();
      options.explicitProviderPreference = true;
      index += 1;
      continue;
    }
    if (arg === "--model-preference" && argv[index + 1]) {
      options.modelPreference = String(argv[index + 1]).trim();
      options.explicitModelPreference = true;
      index += 1;
      continue;
    }
    if (arg === "--allow-live-provider") {
      options.allowLiveProvider = true;
      continue;
    }
    if (arg === "--max-auto-turns" && argv[index + 1]) {
      options.maxAutoTurns = Number.parseInt(
        String(argv[index + 1]).trim(),
        10,
      );
      index += 1;
      continue;
    }
    if (arg === "--no-write") {
      options.write = false;
      continue;
    }
  }

  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs < 30_000) {
    throw new Error("--timeout-ms 必须是 >= 30000 的数字");
  }
  if (!Number.isFinite(options.intervalMs) || options.intervalMs < 100) {
    throw new Error("--interval-ms 必须是 >= 100 的数字");
  }
  if (!Number.isInteger(options.maxAutoTurns) || options.maxAutoTurns < 1) {
    throw new Error("--max-auto-turns 必须是 >= 1 的整数");
  }
  if (!options.healthUrl || !options.invokeUrl) {
    throw new Error("--health-url / --invoke-url 不能为空");
  }

  if (options.allowLiveProvider) {
    options.providerPreference =
      options.providerPreference ||
      String(LIVE_PROVIDER_ENV_PREFERENCE || "").trim();
    options.modelPreference =
      options.modelPreference || String(LIVE_MODEL_ENV_PREFERENCE || "").trim();
  }
  options.providerMode = options.allowLiveProvider ? "live" : "fixture";

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
      "managed-objective-continuation-smoke.json",
    );
    const writtenPath = writeEvidence(fallbackPath, evidence);
    console.warn(
      `${LOG_PREFIX} default evidence write failed, fallback=${writtenPath}: ${error.message}`,
    );
    return writtenPath;
  }
}

function workspaceIdFromDefaultProject(workspace) {
  return String(
    workspace?.id || workspace?.workspace_id || workspace?.workspaceId || "",
  ).trim();
}

function buildObjectivePolicy(options) {
  return {
    autoIdle: true,
    maxAutoTurns: options.maxAutoTurns,
    maxElapsedMs: Math.max(options.timeoutMs, 60_000),
    maxEstimatedTotalCost: 1,
  };
}

function buildInitialTurnMetadata() {
  return {
    harness: {
      managed_objective_smoke: {
        scenario_id: "managed-objective-auto-continuation",
        source: "smoke:managed-objective-continuation",
      },
    },
  };
}

async function resolveSmokeProvider(options) {
  if (options.providerMode === "live") {
    assertLiveProviderSmokeAllowed({
      allowed: options.allowLiveProvider,
      scriptName: "smoke:managed-objective-continuation",
    });
    return {
      provider: await resolveProviderPreference(options),
      close: async () => {},
    };
  }

  if (options.explicitProviderPreference || options.explicitModelPreference) {
    assertLiveProviderSmokeAllowed({
      allowed: false,
      scriptName: "smoke:managed-objective-continuation",
    });
  }

  const fixture = await startOpenAiCompatibleFixtureServer();
  console.log(
    `${LOG_PREFIX} provider=localhost-fixture baseUrl=${fixture.baseUrl}`,
  );
  return {
    provider: fixture.provider,
    close: fixture.close,
  };
}

async function createManagedObjectiveSession(options, provider) {
  const workspace = await invokeDevBridge(
    options,
    "get_or_create_default_project",
    {},
    30_000,
  );
  const workspaceId = workspaceIdFromDefaultProject(workspace);
  assertSmoke(workspaceId, "默认 workspace 缺少 id");

  const sessionId = await createAgentSessionCurrent(options, {
    workspaceId,
    title: `MO continuation smoke ${new Date().toISOString()}`,
  });
  assertSmoke(sessionId, "thread/start 未返回 sessionId");

  await updateAgentSessionRuntimeCurrent(options, { sessionId, provider });

  const objective = await setAgentSessionObjectiveCurrent(options, {
    sessionId,
    workspaceId,
    objectiveText:
      "Managed Objective 自动续跑 smoke：完成首轮、自动续跑一轮，并在预算限制下停止。",
    successCriteria: [
      "首轮 turn/start current JSON-RPC 完成",
      "空闲后自动 continuation 至少提交一次",
      "达到 maxAutoTurns 后目标进入 budget_limited",
    ],
    continuationPolicy: buildObjectivePolicy(options),
    budgetPolicy: {
      maxTurns: options.maxAutoTurns,
    },
    riskPolicy: {
      allowAutoContinuation: true,
    },
  });

  return { workspace, workspaceId, sessionId, objective };
}

async function submitInitialTurn(options, sessionId, workspaceId, provider) {
  const turnId = `mo-continuation-smoke-${Date.now()}-${process.pid}`;
  await startAgentSessionTurnCurrent(options, {
    sessionId,
    workspaceId,
    message: "请只回复 MO_OK，不要解释。",
    eventName: `managed_objective_continuation_smoke_${turnId}`,
    turnId,
    runtimeRequest: {
      providerPreference: provider.providerPreference,
      modelPreference: provider.modelPreference,
      ...(provider.providerConfig
        ? {
            providerConfig: provider.providerConfig,
          }
        : {}),
      approvalPolicy: "never",
      sandboxPolicy: "read-only",
      metadata: buildInitialTurnMetadata(),
    },
    skipPreSubmitResume: true,
  });
  return turnId;
}

async function waitForAutoContinuationAllow(options, sessionId) {
  return waitForObjectiveState(
    options,
    sessionId,
    ({ objective, sessionDetail }) => {
      const summary = guardSummaryText(objective);
      const turns = Array.isArray(sessionDetail?.turns)
        ? sessionDetail.turns
        : [];
      return (
        summary.includes("auto_continuation_guard") &&
        summary.includes("decision=allow") &&
        turns.length >= 1
      );
    },
    "wait auto continuation allow guard",
    { failFast: true },
  );
}

async function waitForBudgetLimitedStop(options, sessionId) {
  return waitForObjectiveState(
    options,
    sessionId,
    ({ threadRead, objective, sessionDetail }) => {
      const turns = Array.isArray(sessionDetail?.turns)
        ? sessionDetail.turns
        : [];
      return (
        objectiveReachedBudgetLimit(objective) &&
        threadSettled(threadRead) &&
        turns.length >= 2
      );
    },
    "wait budget limited guard",
    { failFast: true },
  );
}

async function runSmoke(options) {
  console.log(`${LOG_PREFIX} stage=health`);
  const health = await waitForHealth(options);

  console.log(`${LOG_PREFIX} stage=provider`);
  const providerRuntime = await resolveSmokeProvider(options);
  const { provider } = providerRuntime;

  try {
    console.log(`${LOG_PREFIX} stage=session`);
    const { workspace, workspaceId, sessionId } =
      await createManagedObjectiveSession(options, provider);

    console.log(`${LOG_PREFIX} stage=submit-initial-turn session=${sessionId}`);
    const turnId = await submitInitialTurn(
      options,
      sessionId,
      workspaceId,
      provider,
    );

    console.log(`${LOG_PREFIX} stage=wait-auto-allow`);
    const allowState = await waitForAutoContinuationAllow(options, sessionId);

    console.log(`${LOG_PREFIX} stage=wait-budget-limited`);
    const finalState = await waitForBudgetLimitedStop(options, sessionId);

    console.log(`${LOG_PREFIX} stage=export-evidence-pack`);
    const evidencePack = await exportAgentSessionEvidencePackCurrent(options, {
      sessionId,
    });

    const evidence = buildSmokeEvidence({
      generatedAt: new Date().toISOString(),
      options,
      workspace,
      provider,
      sessionId,
      turnId,
      objective: finalState.objective,
      allowSnapshot: allowState.snapshot,
      finalSnapshot: finalState.snapshot,
      evidencePack,
    });
    evidence.devBridge = {
      healthStatus: health?.status || null,
    };

    assertSmoke(
      evidence.assertions.objectiveBudgetLimited,
      "objective 未进入 budget_limited",
    );
    assertSmoke(
      evidence.assertions.guardSummaryPresent,
      "objective guard summary 缺少 auto_continuation_guard",
    );
    assertSmoke(
      evidence.assertions.evidencePackExplainsFinalState,
      "evidence pack 缺少 completion audit summary，无法解释最终状态",
    );
    assertSmoke(
      evidence.assertions.atLeastTwoTurnsObserved,
      "未观察到首轮 + 自动续跑两轮 turn",
    );
    assertSmoke(evidence.coverage.evidencePackExported, "未导出 evidence pack");
    assertSmoke(
      evidence.status === "pass",
      "managed objective continuation smoke evidence 未通过全部断言",
    );

    return evidence;
  } finally {
    await providerRuntime.close();
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (
    !options.allowLiveProvider &&
    (options.explicitProviderPreference || options.explicitModelPreference)
  ) {
    assertLiveProviderSmokeAllowed({
      allowed: false,
      scriptName: "smoke:managed-objective-continuation",
    });
  }
  const evidence = await runSmoke(options);

  if (options.write) {
    const writtenPath = writeEvidenceWithFallback(options.output, evidence);
    console.log(`${LOG_PREFIX} evidence=${writtenPath}`);
  } else {
    console.log(JSON.stringify(evidence, null, 2));
  }

  console.log(
    `${LOG_PREFIX} pass session=${evidence.runtime.sessionId} turns=${evidence.evidencePack?.turnCount ?? "unknown"} status=${evidence.objective?.status}`,
  );
}

main().catch((error) => {
  console.error(
    `${LOG_PREFIX} failed: ${error instanceof Error ? error.stack || error.message : String(error)}`,
  );
  process.exitCode = 1;
});
