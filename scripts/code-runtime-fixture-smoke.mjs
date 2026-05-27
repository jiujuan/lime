#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  assertSmoke,
  invokeDevBridge,
  sleep,
  summarizeEvidencePack,
  summarizeThreadRead,
  threadSettled,
  waitForHealth,
} from "./lib/managed-objective-continuation-smoke-core.mjs";
import {
  fixtureChatRequestCount,
  workspaceIdFromDefaultProject,
  workspaceRootFromDefaultProject,
} from "./lib/managed-objective-automation-smoke-support.mjs";
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
  ".lime/qc/code-runtime-fixture-smoke.json",
);
const DEFAULT_HEALTH_URL = "http://127.0.0.1:3030/health";
const DEFAULT_INVOKE_URL = "http://127.0.0.1:3030/invoke";
const DEFAULT_TIMEOUT_MS = 180_000;
const DEFAULT_INTERVAL_MS = 1_000;
const LOG_PREFIX = "[smoke:code-runtime-fixture]";
const FIXTURE_RELATIVE_PATH = ".lime/qc/code-runtime-fixture/src/greeting.ts";
const INITIAL_CONTENT = [
  "export function greeting() {",
  "  return 'Hello from initial fixture';",
  "}",
  "",
].join("\n");
const UPDATED_CONTENT = [
  "export function greeting() {",
  "  return 'Hello Lime Runtime';",
  "}",
  "",
  "export const runtimeVerified = true;",
  "",
].join("\n");

function printHelp() {
  console.log(`
Lime Code Runtime Fixture Smoke

用途:
  通过 localhost fixture 验证自然语言编程请求默认进入 Agent Runtime 编程底座，
  并完成 Read/Write/Bash、文件落盘、checkpoint/diff/evidence pack 的离线闭环。

用法:
  npm run smoke:code-runtime-fixture

选项:
  --output <path>       evidence JSON 输出路径，默认 .lime/qc/code-runtime-fixture-smoke.json
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
    const fallbackPath = path.join(os.tmpdir(), "code-runtime-fixture-smoke.json");
    const writtenPath = writeEvidence(fallbackPath, evidence);
    console.warn(
      `${LOG_PREFIX} default evidence write failed, fallback=${writtenPath}: ${error.message}`,
    );
    return writtenPath;
  }
}

function resolveWorkspaceRelativePath(relativePath) {
  return relativePath.split("/").join(path.sep);
}

function prepareFixtureFile(workspaceRoot) {
  const targetPath = path.join(
    workspaceRoot,
    resolveWorkspaceRelativePath(FIXTURE_RELATIVE_PATH),
  );
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, INITIAL_CONTENT, "utf8");
  return targetPath;
}

function buildCodeRuntimeMetadata() {
  return {
    artifactKind: "code_file",
    artifactTitle: "Code Runtime Fixture Greeting",
    artifactStatus: "ready",
    artifactVersionNo: 2,
    artifactVersionId: "code-runtime-fixture:greeting:v2",
    artifactVersions: [
      {
        id: "code-runtime-fixture:greeting:v1",
        versionNo: 1,
      },
      {
        id: "code-runtime-fixture:greeting:v2",
        versionNo: 2,
      },
    ],
    artifactVersionDiff: {
      summary: "Update greeting() to return Hello Lime Runtime.",
      changedFiles: [FIXTURE_RELATIVE_PATH],
      hunks: [
        {
          path: FIXTURE_RELATIVE_PATH,
          before: "Hello from initial fixture",
          after: "Hello Lime Runtime",
        },
      ],
    },
    previewText: "export function greeting() returns Hello Lime Runtime.",
  };
}

function buildFixtureResponses() {
  const nodeCommand = [
    "const fs = require('node:fs');",
    `const text = fs.readFileSync('${FIXTURE_RELATIVE_PATH}', 'utf8');`,
    "if (!text.includes('Hello Lime Runtime')) {",
    "  throw new Error('updated greeting was not written');",
    "}",
    "console.log('CODE_RUNTIME_TEST_OK');",
  ].join(" ");

  return [
    {
      type: "tool_call",
      id: "call-code-runtime-read",
      name: "Read",
      arguments: {
        path: FIXTURE_RELATIVE_PATH,
      },
    },
    {
      type: "tool_call",
      id: "call-code-runtime-write",
      name: "Write",
      arguments: {
        path: FIXTURE_RELATIVE_PATH,
        content: UPDATED_CONTENT,
        metadata: buildCodeRuntimeMetadata(),
      },
    },
    {
      type: "tool_call",
      id: "call-code-runtime-bash",
      name: "Bash",
      arguments: {
        command: `node -e "${nodeCommand}"`,
        timeout: 30,
      },
    },
    {
      type: "text",
      content: "CODE_RUNTIME_DONE",
    },
  ];
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

function requestMessagesText(body) {
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  return messages
    .map((message) => {
      if (typeof message?.content === "string") {
        return message.content;
      }
      return JSON.stringify(message?.content || "");
    })
    .join("\n");
}

function requestBodyText(fixtureRequests) {
  return fixtureRequests
    .map((request) => JSON.stringify(request?.body || {}))
    .join("\n");
}

function valueContains(value, needle) {
  return JSON.stringify(value || {}).includes(needle);
}

function checkpointIdFromList(checkpointList) {
  const checkpoints = Array.isArray(checkpointList?.checkpoints)
    ? checkpointList.checkpoints
    : [];
  const match =
    checkpoints.find(
      (checkpoint) =>
        checkpoint?.path === FIXTURE_RELATIVE_PATH &&
        (checkpoint?.version_id || checkpoint?.versionId || checkpoint?.kind),
    ) ||
    checkpoints.find((checkpoint) => checkpoint?.path === FIXTURE_RELATIVE_PATH) ||
    checkpoints[0];
  return String(match?.checkpoint_id || match?.checkpointId || "").trim();
}

function checkpointDiffContainsExpectedChange(checkpointDiff) {
  const diff =
    checkpointDiff?.diff ||
    checkpointDiff?.artifactVersionDiff ||
    checkpointDiff?.checkpoint?.metadata?.artifactVersionDiff;
  const text = JSON.stringify(diff || {});
  return (
    text.includes(FIXTURE_RELATIVE_PATH) &&
    text.includes("Hello from initial fixture") &&
    text.includes("Hello Lime Runtime")
  );
}

function summarizeCheckpointList(checkpointList) {
  const checkpoints = Array.isArray(checkpointList?.checkpoints)
    ? checkpointList.checkpoints
    : [];
  return {
    checkpointCount:
      checkpointList?.checkpoint_count ?? checkpointList?.checkpointCount ?? 0,
    paths: checkpoints.map((checkpoint) => checkpoint?.path).filter(Boolean),
  };
}

async function waitForRuntimeCompletion(options, sessionId, fixture, targetPath) {
  const startedAt = Date.now();
  let lastSnapshot = null;

  while (Date.now() - startedAt < options.timeoutMs) {
    const [threadRead, sessionDetail] = await Promise.all([
      invokeDevBridge(options, "agent_runtime_get_thread_read", { sessionId }),
      invokeDevBridge(options, "agent_runtime_get_session", {
        sessionId,
        resumeSessionStartHooks: false,
        historyLimit: 50,
      }),
    ]);
    const fileContent = fs.existsSync(targetPath)
      ? fs.readFileSync(targetPath, "utf8")
      : "";
    lastSnapshot = {
      threadRead: summarizeThreadRead(threadRead),
      session: {
        id: sessionDetail?.id || null,
        executionStrategy:
          sessionDetail?.execution_strategy || sessionDetail?.executionStrategy || null,
        itemCount: Array.isArray(sessionDetail?.items)
          ? sessionDetail.items.length
          : 0,
        turnCount: Array.isArray(sessionDetail?.turns)
          ? sessionDetail.turns.length
          : 0,
      },
      fixtureChatRequestCount: fixtureChatRequestCount(fixture.requests),
      fileUpdated: fileContent.includes("Hello Lime Runtime"),
    };

    if (
      lastSnapshot.fixtureChatRequestCount >= 4 &&
      lastSnapshot.fileUpdated &&
      threadSettled(threadRead)
    ) {
      return { threadRead, sessionDetail, snapshot: lastSnapshot };
    }

    await sleep(options.intervalMs);
  }

  throw new Error(
    `${LOG_PREFIX} wait runtime completion timeout; last=${JSON.stringify(lastSnapshot)}`,
  );
}

async function runSmoke(options) {
  console.log(`${LOG_PREFIX} stage=health`);
  const health = await waitForHealth(options);

  console.log(`${LOG_PREFIX} stage=fixture-provider`);
  if (options.allowLiveProvider) {
    assertLiveProviderSmokeAllowed({
      allowed: options.allowLiveProvider,
      scriptName: "smoke:code-runtime-fixture",
    });
  }
  const fixture = await startOpenAiCompatibleFixtureServer({
    scriptedResponses: buildFixtureResponses(),
  });
  console.log(`${LOG_PREFIX} provider=localhost-fixture baseUrl=${fixture.baseUrl}`);

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
    const workspaceRoot = await resolveWorkspaceRoot(options, workspace, workspaceId);
    const targetPath = prepareFixtureFile(workspaceRoot);

    console.log(`${LOG_PREFIX} stage=session`);
    const sessionId = await invokeDevBridge(options, "agent_runtime_create_session", {
      workspaceId,
      name: `Code runtime fixture ${new Date().toISOString()}`,
      runStartHooks: false,
    });
    assertSmoke(sessionId, "agent_runtime_create_session 未返回 sessionId");

    await invokeDevBridge(options, "agent_runtime_update_session", {
      request: {
        sessionId,
        providerSelector: fixture.provider.providerPreference,
        providerName: fixture.provider.providerName,
        modelName: fixture.provider.modelPreference,
      },
    });

    console.log(`${LOG_PREFIX} stage=submit-turn session=${sessionId}`);
    const turnId = `code-runtime-fixture-${Date.now()}-${process.pid}`;
    await invokeDevBridge(options, "agent_runtime_submit_turn", {
      request: {
        message:
          "请修复这个 TypeScript fixture，让 greeting() 返回 Hello Lime Runtime，然后运行一个最小校验命令。",
        sessionId,
        workspaceId,
        eventName: `code_runtime_fixture_${turnId}`,
        turnId,
        turnConfig: {
          providerPreference: fixture.provider.providerPreference,
          modelPreference: fixture.provider.modelPreference,
          providerConfig: fixture.provider.providerConfig,
          approvalPolicy: "never",
          sandboxPolicy: "danger-full-access",
          metadata: {
            harness: {
              access_mode: "full-access",
              skip_mcp_prewarm: true,
              code_runtime_fixture: {
                scenario_id: "natural-language-code-runtime-fixture",
                source: "smoke:code-runtime-fixture",
              },
            },
          },
        },
        skipPreSubmitResume: true,
      },
    });

    console.log(`${LOG_PREFIX} stage=wait-runtime`);
    const finalState = await waitForRuntimeCompletion(
      options,
      sessionId,
      fixture,
      targetPath,
    );

    console.log(`${LOG_PREFIX} stage=file-checkpoints`);
    const checkpointList = await invokeDevBridge(
      options,
      "agent_runtime_list_file_checkpoints",
      {
        request: { sessionId },
      },
    );
    const checkpointId = checkpointIdFromList(checkpointList);
    assertSmoke(checkpointId, "未找到 runtime file checkpoint");
    const checkpointDiff = await invokeDevBridge(
      options,
      "agent_runtime_diff_file_checkpoint",
      {
        request: {
          sessionId,
          checkpointId,
        },
      },
    );

    console.log(`${LOG_PREFIX} stage=export-evidence-pack`);
    const evidencePack = await invokeDevBridge(
      options,
      "agent_runtime_export_evidence_pack",
      { sessionId },
    );

    const finalContent = fs.readFileSync(targetPath, "utf8");
    const fixtureBodyText = requestBodyText(fixture.requests);
    const firstRequestText = requestMessagesText(fixture.requests[0]?.body);
    const detailText = JSON.stringify(finalState.sessionDetail || {});
    const threadReadText = JSON.stringify(finalState.threadRead || {});
    const evidencePackText = JSON.stringify(evidencePack || {});
    const checkpointDiffText = JSON.stringify(checkpointDiff || {});
    const assertions = {
      fixtureProviderUsed: fixtureChatRequestCount(fixture.requests) >= 4,
      naturalLanguageWithoutAtCode:
        firstRequestText.includes("Hello Lime Runtime") &&
        !firstRequestText.includes("@代码") &&
        !firstRequestText.includes("@code"),
      noHarnessCodeCommand: !fixtureBodyText.includes("code_command"),
      sessionDefaultedToAuto:
        finalState.sessionDetail?.execution_strategy === "auto" ||
        finalState.sessionDetail?.executionStrategy === "auto",
      effectiveCodeRuntimeObserved:
        detailText.includes("code_orchestrated") ||
        threadReadText.includes("code_orchestrated"),
      readToolObserved: valueContains(finalState.sessionDetail, "Read"),
      writeToolObserved: valueContains(finalState.sessionDetail, "Write"),
      bashToolObserved: valueContains(finalState.sessionDetail, "Bash"),
      workspaceFileUpdated: finalContent.includes("Hello Lime Runtime"),
      checkpointCreated:
        Number(
          checkpointList?.checkpoint_count ?? checkpointList?.checkpointCount ?? 0,
        ) > 0,
      checkpointDiffAvailable: checkpointDiffContainsExpectedChange(checkpointDiff),
      evidencePackExported: Boolean(evidencePack),
      evidencePackMentionsCodeFile: evidencePackText.includes(FIXTURE_RELATIVE_PATH),
    };

    for (const [key, passed] of Object.entries(assertions)) {
      assertSmoke(passed, `断言失败: ${key}`);
    }

    const evidence = {
      schemaVersion: "v1",
      scenarioId: "natural-language-code-runtime-fixture",
      status: "pass",
      generatedAt: new Date().toISOString(),
      command: "smoke:code-runtime-fixture",
      coverage: {
        usesCurrentRuntimeSubmitTurn: true,
        usesDefaultSessionExecutionStrategy: true,
        usesLocalhostFixtureProvider: true,
        avoidsAtCodeCommandRoute: true,
        verifiesReadWriteBashTools: true,
        verifiesWorkspaceFileMutation: true,
        verifiesCheckpointDiff: true,
        verifiesEvidencePack: true,
      },
      devBridge: {
        healthStatus: health?.status || null,
      },
      workspace: {
        id: workspaceId,
        root: workspaceRoot,
        fixturePath: FIXTURE_RELATIVE_PATH,
      },
      provider: {
        providerPreference: fixture.provider.providerPreference,
        providerName: fixture.provider.providerName,
        modelPreference: fixture.provider.modelPreference,
        source: fixture.provider.source,
      },
      runtime: {
        sessionId,
        turnId,
        finalSnapshot: finalState.snapshot,
        checkpointList: summarizeCheckpointList(checkpointList),
        checkpointId,
        checkpointDiff,
      },
      evidencePack: summarizeEvidencePack(evidencePack),
      assertions,
    };

    if (options.write) {
      const writtenPath = writeEvidenceWithFallback(options.output, evidence);
      console.log(`${LOG_PREFIX} evidence=${writtenPath}`);
    }

    console.log(`${LOG_PREFIX} pass session=${sessionId}`);
    return evidence;
  } finally {
    await fixture.close();
  }
}

runSmoke(parseArgs(process.argv.slice(2))).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
