#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";

const DEFAULTS = {
  appUrl: "http://127.0.0.1:1420/",
  healthUrl: "http://127.0.0.1:3030/health",
  invokeUrl: "http://127.0.0.1:3030/invoke",
  timeoutMs: 180_000,
  intervalMs: 1_000,
};

const POST_HEALTH_SETTLE_MS = 1_500;
const ONBOARDING_VERSION = "1.1.0";
const PROMPT_TEXT = "请修复消息历史切换后图片卡片丢失的问题，并补一个回归测试";
const QUEUED_PROMPT_TEXT = "再补一个历史切换后附件预览不丢失的断言";
const CODE_FIXTURE_TURN_ID = "turn-code-runtime-smoke";
const CODE_FIXTURE_QUEUED_TURN_ID = "queued-code-runtime-followup";
const CODE_FIXTURE_SOURCE_FILE_PATH = "src/components/ImageCard.tsx";
const CODE_FIXTURE_FILE_PATH = "src/components/ImageCard.test.tsx";
const CODE_FIXTURE_CHECKPOINT_ID = "checkpoint-code-runtime-image-card";
const CODE_FIXTURE_CHECKPOINT_SNAPSHOT_PATH =
  ".lime/checkpoints/session-code-runtime-smoke/image-card-v1.json";
const CODE_FIXTURE_RESTORE_BACKUP_PATH =
  ".lime/checkpoints/session-code-runtime-smoke/image-card-live-backup.json";
const CODE_FIXTURE_TEST_OUTPUT = "PASS ImageCard.test.tsx\n1 test passed";
const CODE_FIXTURE_APPROVAL_REQUEST_ID = "approval-code-runtime-write";
const CODE_FIXTURE_APPROVAL_PROMPT =
  "确认写入图片卡片历史切换回归测试";
const CODE_FIXTURE_FILE_EVENT_PREVIEW = "新增图片卡片历史切换回归测试";
const CODE_FIXTURE_UNIFIED_DIFF = [
  `diff --git a/${CODE_FIXTURE_SOURCE_FILE_PATH} b/${CODE_FIXTURE_SOURCE_FILE_PATH}`,
  `--- a/${CODE_FIXTURE_SOURCE_FILE_PATH}`,
  `+++ b/${CODE_FIXTURE_SOURCE_FILE_PATH}`,
  "@@ -1,2 +1,3 @@",
  '-const title = "oldTitle";',
  '+const title = "newTitle";',
  "+const keepsHistory = true;",
].join("\n");
const CODE_FIXTURE_PATCH_PREVIEW = [
  CODE_FIXTURE_FILE_EVENT_PREVIEW,
  "*** Begin Patch",
  `*** Update File: ${CODE_FIXTURE_SOURCE_FILE_PATH}`,
  "@@",
  '-const title = "oldTitle";',
  '+const title = "newTitle";',
  "+const keepsHistory = true;",
  `*** Update File: ${CODE_FIXTURE_FILE_PATH}`,
  "@@",
  "-it('drops history cards', () => {})",
  "+it('keeps history cards', () => {})",
  "*** End Patch",
].join("\n");
const CODE_FIXTURE_LIVE_WRITE_PREVIEW =
  "it('keeps image cards after history switch', () => {})";
const CODE_FIXTURE_SESSION_ID = "session-code-runtime-smoke";
const CODE_FIXTURE_THREAD_ID = "thread-code-runtime-smoke";
const CODE_FIXTURE_WORKSPACE_ID = "workspace-code-runtime-smoke";
const CODE_FIXTURE_PROVIDER_ID = "smoke-openai";
const CODE_FIXTURE_MODEL_ID = "gpt-5-codex-smoke";
const CODE_FIXTURE_WRITE_TOOL_ID = "tool-code-runtime-write";
const CODE_FIXTURE_TEST_TOOL_ID = "tool-code-runtime-test";
const WORKSPACE_HARNESS_DEBUG_OVERRIDE_KEY =
  "lime:debug:workspace-harness-enabled:v1";
const RUNTIME_TOOL_AVAILABILITY_OVERRIDE = {
  known: true,
  agentInitialized: true,
  source: "runtime_tools",
  availableToolCount: 12,
  webSearch: true,
  subagentCore: true,
  subagentTeamTools: true,
  subagentRuntime: true,
  taskRuntime: true,
  missingSubagentCoreTools: [],
  missingSubagentTeamTools: [],
  missingTaskTools: [],
};
const REQUIRED_RUNTIME_SUMMARY_FLAGS = [
  "hasWorkbench",
  "hasRuntimeSummary",
  "hasWebSearchReady",
  "hasSubagentReady",
  "hasTeamReady",
  "hasTaskReady",
  "hasReadyBanner",
];
const REQUIRED_AGENT_RUNTIME_TASK_FLAGS = [
  "hasPlainCodingPrompt",
  "hasAgentRuntimeStrip",
  "hasReactRuntimeStrategy",
  "hasRuntimeOutputs",
  "hasPendingApprovalStatus",
  "hasHarnessWritesSection",
  "hasHarnessOutputsSection",
  "hasHarnessApprovalsSection",
  "hasHarnessFilesSection",
  "hasImageCardFile",
  "hasVitestOutput",
  "hasWriteApprovalPrompt",
  "hasFileEventPreview",
  "hasApprovalApproveButton",
  "hasCodeDiffOverview",
  "hasCodeDiffSideBySide",
  "hasFileReviewSection",
  "hasFileReviewControls",
];
const FORBIDDEN_PAGE_WARNINGS = [
  "当前 runtime tool surface 还没有暴露 WebSearch，联网搜索偏好本轮可能不会生效。",
  "当前 runtime tool surface 缺少 Agent / SendMessage / Team* current tools，任务拆分偏好本轮可能不会完全生效。",
];

function printHelp() {
  console.log(`
Lime Runtime Tool Surface Page Smoke

用途:
  通过真实 Lime 页面验证 runtime inventory -> Harness -> Runtime 能力摘要的主链，
  同时确认自然语言工具任务从输入框进入 current Agent runtime，不需要 @代码 或前置策略选择。

用法:
  node scripts/agent-runtime-tool-surface-page-smoke.mjs [选项]

选项:
  --app-url <url>          前端地址，默认 http://127.0.0.1:1420/
  --health-url <url>       DevBridge 健康检查地址，默认 http://127.0.0.1:3030/health
  --invoke-url <url>       DevBridge invoke 地址，默认 http://127.0.0.1:3030/invoke
  --timeout-ms <ms>        总超时，默认 180000
  --interval-ms <ms>       轮询间隔，默认 1000
  --allow-live-provider    保留统一 live gate 语义；默认只使用页面内 DevBridge fixture，不提交真实 Provider
  -h, --help               显示帮助
`);
}

function parseArgs(argv) {
  const options = { ...DEFAULTS, allowLiveProvider: false };

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

    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
  }

  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs < 30_000) {
    throw new Error("--timeout-ms 必须是 >= 30000 的数字");
  }
  if (!Number.isFinite(options.intervalMs) || options.intervalMs < 100) {
    throw new Error("--interval-ms 必须是 >= 100 的数字");
  }
  if (!options.appUrl) {
    throw new Error("--app-url 不能为空");
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

function logStage(label) {
  console.log(`[smoke:agent-runtime-tool-surface-page] stage=${label}`);
}

async function waitForHealth(options) {
  const startedAt = Date.now();
  let lastError = null;

  while (Date.now() - startedAt < options.timeoutMs) {
    try {
      const response = await fetch(options.healthUrl, { method: "GET" });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      console.log(
        `[smoke:agent-runtime-tool-surface-page] DevBridge 已就绪 (${Date.now() - startedAt}ms)${
          payload?.status ? ` status=${payload.status}` : ""
        }`,
      );
      return;
    } catch (error) {
      lastError = error;
      await sleep(options.intervalMs);
    }
  }

  const detail =
    lastError instanceof Error
      ? lastError.message
      : String(lastError || "unknown error");
  throw new Error(
    `[smoke:agent-runtime-tool-surface-page] DevBridge 未就绪，请先启动 npm run electron:dev。最后错误: ${detail}`,
  );
}

function buildHarnessBootstrapScript() {
  return `(() => {
    localStorage.setItem("lime_onboarding_complete", "true");
    localStorage.setItem("lime_onboarding_version", ${JSON.stringify(ONBOARDING_VERSION)});
    localStorage.setItem("lime_user_profile", "developer");
    localStorage.setItem(
      ${JSON.stringify(WORKSPACE_HARNESS_DEBUG_OVERRIDE_KEY)},
      "true"
    );
    localStorage.setItem("lime.chat.harness-panel.visible.v1", "true");
    localStorage.setItem(
      "lime:debug:runtime-tool-availability:v1",
      JSON.stringify(${JSON.stringify(RUNTIME_TOOL_AVAILABILITY_OVERRIDE)})
    );
    return true;
  })()`;
}

function buildPageStorageReadyScript(appUrl) {
  return `(() => {
    try {
      const href = window.location.href;
      const readyState = document.readyState;
      void window.localStorage;
      return {
        ok: href.startsWith(${JSON.stringify(appUrl)}) && readyState !== "loading",
        href,
        readyState,
        title: document.title,
      };
    } catch (error) {
      return {
        ok: false,
        href: window.location.href,
        readyState: document.readyState,
        title: document.title,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  })()`;
}

function buildEnsureAgentHomeScript() {
  return `(() => {
    const textarea = Array.from(
      document.querySelectorAll(
        '[data-testid="inputbar-core-container"] textarea, textarea',
      ),
    ).find(
      (candidate) =>
        candidate instanceof HTMLTextAreaElement && !candidate.disabled,
    );
    const send = document.querySelector(
      'button[aria-label="发送"], button[title="发送"]',
    );
    if (textarea && send) {
      return {
        ok: true,
        navigated: false,
        reason: "composer-ready",
        url: window.location.href,
      };
    }

    const settingsHomeButton = document.querySelector(
      '[data-testid="settings-home-button"]',
    );
    const fallbackHomeButton =
      settingsHomeButton ||
      Array.from(document.querySelectorAll("button")).find((button) => {
        const text = (button.textContent || "").trim();
        const aria = button.getAttribute("aria-label") || "";
        const title = button.getAttribute("title") || "";
        return (
          text === "回到首页" ||
          aria === "回到首页" ||
          aria.includes("Lime 首页") ||
          title.includes("Lime 首页")
        );
      });

    if (fallbackHomeButton instanceof HTMLButtonElement) {
      fallbackHomeButton.click();
      return {
        ok: false,
        navigated: true,
        reason: "clicked-home-entry",
        buttonText: (fallbackHomeButton.textContent || "").trim(),
        aria: fallbackHomeButton.getAttribute("aria-label"),
        url: window.location.href,
      };
    }

    return {
      ok: false,
      navigated: false,
      reason: "composer-and-home-entry-missing",
      url: window.location.href,
      title: document.title,
      buttons: Array.from(document.querySelectorAll("button"))
        .slice(0, 40)
        .map((button) => ({
          text: (button.textContent || "").trim(),
          aria: button.getAttribute("aria-label"),
          title: button.getAttribute("title"),
          disabled: Boolean(button.disabled),
        })),
    };
  })()`;
}

function buildCodeRuntimeFileCheckpointSummary(
  nowIso = new Date().toISOString(),
) {
  return {
    checkpoint_id: CODE_FIXTURE_CHECKPOINT_ID,
    turn_id: CODE_FIXTURE_TURN_ID,
    path: CODE_FIXTURE_SOURCE_FILE_PATH,
    source: "write_file",
    updated_at: nowIso,
    version_no: 1,
    version_id: "image-card-v1",
    request_id: CODE_FIXTURE_APPROVAL_REQUEST_ID,
    title: "ImageCard 历史切换前快照",
    kind: "code",
    status: "ready",
    preview_text: 'const title = "oldTitle";',
    snapshot_path: CODE_FIXTURE_CHECKPOINT_SNAPSHOT_PATH,
    validation_issue_count: 0,
  };
}

function buildCodeRuntimeFileCheckpointDetail(
  nowIso = new Date().toISOString(),
) {
  const checkpoint = buildCodeRuntimeFileCheckpointSummary(nowIso);
  return {
    session_id: CODE_FIXTURE_SESSION_ID,
    thread_id: CODE_FIXTURE_THREAD_ID,
    checkpoint,
    live_path: CODE_FIXTURE_SOURCE_FILE_PATH,
    snapshot_path: CODE_FIXTURE_CHECKPOINT_SNAPSHOT_PATH,
    checkpoint_document: {
      path: CODE_FIXTURE_SOURCE_FILE_PATH,
      content: 'const title = "oldTitle";',
    },
    live_document: {
      path: CODE_FIXTURE_SOURCE_FILE_PATH,
      content: 'const title = "newTitle";\nconst keepsHistory = true;',
    },
    version_history: [
      {
        version_id: "image-card-v1",
        updated_at: nowIso,
      },
    ],
    validation_issues: [],
    metadata: {
      patch: CODE_FIXTURE_UNIFIED_DIFF,
    },
    content: CODE_FIXTURE_UNIFIED_DIFF,
  };
}

function buildCodeRuntimeFileCheckpointDiff(nowIso = new Date().toISOString()) {
  return {
    session_id: CODE_FIXTURE_SESSION_ID,
    thread_id: CODE_FIXTURE_THREAD_ID,
    checkpoint: buildCodeRuntimeFileCheckpointSummary(nowIso),
    current_version_id: "image-card-live",
    previous_version_id: "image-card-v1",
    diff: CODE_FIXTURE_UNIFIED_DIFF,
  };
}

function buildCodeRuntimeQueuedTurn(nowSeconds = Math.floor(Date.now() / 1000)) {
  return {
    queued_turn_id: CODE_FIXTURE_QUEUED_TURN_ID,
    message_preview: QUEUED_PROMPT_TEXT,
    message_text: QUEUED_PROMPT_TEXT,
    created_at: nowSeconds,
    image_count: 0,
    position: 1,
  };
}

function buildCodeRuntimeSessionFixture(
  sessionId = CODE_FIXTURE_SESSION_ID,
  workspaceId = CODE_FIXTURE_WORKSPACE_ID,
) {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const nowIso = new Date().toISOString();
  const userMessageId = "message-code-runtime-user";
  const assistantMessageId = "message-code-runtime-assistant";
  const approvalItemId = "item-code-runtime-approval";
  const diffItemId = "item-code-runtime-diff";
  const commandItemId = "item-code-runtime-command";
  const fileItemId = "item-code-runtime-file";

  return {
    id: sessionId,
    thread_id: CODE_FIXTURE_THREAD_ID,
    name: "自然语言任务 runtime smoke",
    created_at: nowSeconds,
    updated_at: nowSeconds,
    model: "gpt-5-codex",
    workspace_id: workspaceId,
    working_dir: "",
    execution_strategy: "react",
    execution_runtime: {
      session_id: sessionId,
      provider_name: "codex",
      model_name: "gpt-5-codex",
      execution_strategy: "react",
      source: "session",
      mode: "runtime",
      latest_turn_id: CODE_FIXTURE_TURN_ID,
      latest_turn_status: "running",
      recent_preferences: {
        webSearch: false,
        thinking: true,
        task: true,
        subagent: false,
      },
      recent_access_mode: "current",
    },
    messages: [
      {
        id: userMessageId,
        role: "user",
        content: [{ type: "text", text: PROMPT_TEXT }],
        timestamp: nowSeconds,
      },
      {
        id: assistantMessageId,
        role: "assistant",
        content: [
          {
            type: "text",
            text: "已进入编程运行时，正在写入回归测试并等待确认。",
          },
        ],
        timestamp: nowSeconds,
      },
    ],
    turns: [
      {
        id: CODE_FIXTURE_TURN_ID,
        thread_id: CODE_FIXTURE_THREAD_ID,
        prompt_text: PROMPT_TEXT,
        status: "running",
        started_at: nowIso,
        created_at: nowIso,
        updated_at: nowIso,
      },
    ],
    items: [
      {
        id: "item-code-runtime-user",
        thread_id: CODE_FIXTURE_THREAD_ID,
        turn_id: CODE_FIXTURE_TURN_ID,
        sequence: 1,
        status: "completed",
        started_at: nowIso,
        completed_at: nowIso,
        updated_at: nowIso,
        type: "user_message",
        content: PROMPT_TEXT,
      },
      {
        id: approvalItemId,
        thread_id: CODE_FIXTURE_THREAD_ID,
        turn_id: CODE_FIXTURE_TURN_ID,
        sequence: 2,
        status: "in_progress",
        started_at: nowIso,
        updated_at: nowIso,
        type: "approval_request",
        request_id: CODE_FIXTURE_APPROVAL_REQUEST_ID,
        action_type: "tool_confirmation",
        prompt: CODE_FIXTURE_APPROVAL_PROMPT,
        tool_name: "write_file",
        arguments: {
          filePath: CODE_FIXTURE_FILE_PATH,
        },
      },
      {
        id: diffItemId,
        thread_id: CODE_FIXTURE_THREAD_ID,
        turn_id: CODE_FIXTURE_TURN_ID,
        sequence: 3,
        status: "completed",
        started_at: nowIso,
        completed_at: nowIso,
        updated_at: nowIso,
        type: "tool_call",
        tool_name: "apply_patch",
        output: CODE_FIXTURE_UNIFIED_DIFF,
        success: true,
        metadata: {
          patch: CODE_FIXTURE_UNIFIED_DIFF,
        },
      },
      {
        id: commandItemId,
        thread_id: CODE_FIXTURE_THREAD_ID,
        turn_id: CODE_FIXTURE_TURN_ID,
        sequence: 4,
        status: "completed",
        started_at: nowIso,
        completed_at: nowIso,
        updated_at: nowIso,
        type: "command_execution",
        command:
          "npm exec vitest run src/components/agent/chat/ImageCard.test.tsx",
        cwd: "",
        aggregated_output: CODE_FIXTURE_TEST_OUTPUT,
        exit_code: 0,
      },
      {
        id: fileItemId,
        thread_id: CODE_FIXTURE_THREAD_ID,
        turn_id: CODE_FIXTURE_TURN_ID,
        sequence: 5,
        status: "completed",
        started_at: nowIso,
        completed_at: nowIso,
        updated_at: nowIso,
        type: "file_artifact",
        path: CODE_FIXTURE_FILE_PATH,
        source: "write_file",
        content: CODE_FIXTURE_PATCH_PREVIEW,
      },
    ],
    queued_turns: [],
    thread_read: {
      thread_id: CODE_FIXTURE_THREAD_ID,
      status: "running",
      active_turn_id: CODE_FIXTURE_TURN_ID,
      queued_turns: [],
      pending_requests: [
        {
          id: CODE_FIXTURE_APPROVAL_REQUEST_ID,
          thread_id: CODE_FIXTURE_THREAD_ID,
          turn_id: CODE_FIXTURE_TURN_ID,
          item_id: approvalItemId,
          request_type: "tool_confirmation",
          status: "pending",
          title: CODE_FIXTURE_APPROVAL_PROMPT,
          payload: {
            tool_name: "write_file",
            arguments: {
              filePath: CODE_FIXTURE_FILE_PATH,
            },
          },
          created_at: nowIso,
        },
      ],
      file_checkpoint_summary: {
        count: 1,
        latest_checkpoint: buildCodeRuntimeFileCheckpointSummary(nowIso),
      },
      updated_at: nowIso,
    },
    todo_items: [],
    child_subagent_sessions: [],
  };
}

function buildCodeRuntimeProviderFixture() {
  const nowIso = new Date().toISOString();
  return {
    id: CODE_FIXTURE_PROVIDER_ID,
    name: "Smoke OpenAI",
    type: "openai",
    api_host: "http://127.0.0.1:9/v1",
    is_system: false,
    group: "custom",
    enabled: true,
    sort_order: 0,
    custom_models: [CODE_FIXTURE_MODEL_ID],
    prompt_cache_mode: null,
    api_key_count: 1,
    created_at: nowIso,
    updated_at: nowIso,
    api_keys: [
      {
        id: "smoke-openai-key",
        provider_id: CODE_FIXTURE_PROVIDER_ID,
        api_key_masked: "sk-smoke-****",
        alias: "smoke",
        enabled: true,
        usage_count: 0,
        error_count: 0,
        created_at: nowIso,
      },
    ],
  };
}

function buildCodeRuntimeModelFixture() {
  const nowSeconds = Math.floor(Date.now() / 1000);
  return {
    id: CODE_FIXTURE_MODEL_ID,
    display_name: "GPT-5 Codex Smoke",
    provider_id: CODE_FIXTURE_PROVIDER_ID,
    provider_name: "Smoke OpenAI",
    family: "gpt-5",
    tier: "pro",
    capabilities: {
      vision: true,
      tools: true,
      streaming: true,
      json_mode: true,
      function_calling: true,
      reasoning: true,
    },
    task_families: ["chat", "reasoning"],
    input_modalities: ["text", "image", "file"],
    output_modalities: ["text", "json"],
    runtime_features: [
      "streaming",
      "tool_calling",
      "reasoning",
      "responses_api",
      "chat_completions_api",
    ],
    deployment_source: "user_cloud",
    management_plane: "local_settings",
    canonical_model_id: CODE_FIXTURE_MODEL_ID,
    provider_model_id: CODE_FIXTURE_MODEL_ID,
    alias_source: "local",
    pricing: null,
    limits: {
      context_length: null,
      max_output_tokens: null,
      requests_per_minute: null,
      tokens_per_minute: null,
    },
    status: "active",
    release_date: null,
    is_latest: true,
    description: "Smoke fixture model for natural-language code runtime.",
    source: "custom",
    created_at: nowSeconds,
    updated_at: nowSeconds,
  };
}

function deriveBridgeEventsUrl(invokeUrl) {
  const url = new URL(invokeUrl);
  if (url.pathname.endsWith("/invoke")) {
    url.pathname = url.pathname.replace(/\/invoke$/, "/events");
  } else {
    url.pathname = "/events";
  }
  url.search = "";
  url.hash = "";
  return url.toString();
}

function parseSubscribedBridgeEvents(requestUrl) {
  const url = new URL(requestUrl);
  const singleEvent = url.searchParams.get("event");
  const events = [];
  if (singleEvent && singleEvent.trim()) {
    events.push(singleEvent.trim());
  }

  const encodedEvents = url.searchParams.get("events");
  if (encodedEvents) {
    try {
      const parsed = JSON.parse(encodedEvents);
      if (Array.isArray(parsed)) {
        for (const eventName of parsed) {
          if (typeof eventName === "string" && eventName.trim()) {
            events.push(eventName.trim());
          }
        }
      }
    } catch {
      // DevBridge 只会发送 JSON 数组；格式异常时保持空订阅，交给 smoke 诊断输出。
    }
  }

  return Array.from(new Set(events));
}

function buildCodeRuntimeTurnContextEvent() {
  return {
    type: "turn_context",
    session_id: CODE_FIXTURE_SESSION_ID,
    thread_id: CODE_FIXTURE_THREAD_ID,
    turn_id: CODE_FIXTURE_TURN_ID,
    execution_strategy: "react",
  };
}

function buildCodeRuntimeArtifactSnapshotEvent() {
  return {
    type: "artifact_snapshot",
    artifact: {
      artifactId: "artifact-code-runtime-live-write",
      filePath: CODE_FIXTURE_FILE_PATH,
      content: CODE_FIXTURE_PATCH_PREVIEW,
      metadata: {
        complete: false,
        language: "tsx",
        previewText: CODE_FIXTURE_LIVE_WRITE_PREVIEW,
        latestChunk: "keeps image cards after history switch",
      },
    },
  };
}

function buildCodeRuntimeActionRequiredEvent() {
  return {
    type: "action_required",
    request_id: CODE_FIXTURE_APPROVAL_REQUEST_ID,
    action_type: "tool_confirmation",
    scope: {
      session_id: CODE_FIXTURE_SESSION_ID,
      thread_id: CODE_FIXTURE_THREAD_ID,
      turn_id: CODE_FIXTURE_TURN_ID,
    },
    tool_name: "write_file",
    arguments: {
      filePath: CODE_FIXTURE_FILE_PATH,
    },
    prompt: CODE_FIXTURE_APPROVAL_PROMPT,
  };
}

function buildCodeRuntimeWriteToolStartEvent() {
  return {
    type: "tool_start",
    tool_id: CODE_FIXTURE_WRITE_TOOL_ID,
    tool_name: "write_file",
    arguments: JSON.stringify({
      filePath: CODE_FIXTURE_FILE_PATH,
      content: CODE_FIXTURE_PATCH_PREVIEW,
    }),
  };
}

function buildCodeRuntimeTestToolStartEvent() {
  return {
    type: "tool_start",
    tool_id: CODE_FIXTURE_TEST_TOOL_ID,
    tool_name: "bash",
    arguments: JSON.stringify({
      command:
        "npm exec vitest run src/components/agent/chat/ImageCard.test.tsx",
    }),
  };
}

function buildCodeRuntimeTestToolEndEvent() {
  return {
    type: "tool_end",
    tool_id: CODE_FIXTURE_TEST_TOOL_ID,
    result: {
      success: true,
      output: `${CODE_FIXTURE_TEST_OUTPUT}\nexit_code: 0`,
      metadata: {
        exit_code: 0,
        stdout_length: CODE_FIXTURE_TEST_OUTPUT.length,
        sandboxed: true,
      },
    },
  };
}

function buildCodeRuntimeQueueAddedEvent() {
  return {
    type: "queue_added",
    session_id: CODE_FIXTURE_SESSION_ID,
    queued_turn: buildCodeRuntimeQueuedTurn(),
  };
}

function buildCodeRuntimeStreamEvents() {
  return [
    buildCodeRuntimeTurnContextEvent(),
    buildCodeRuntimeWriteToolStartEvent(),
    buildCodeRuntimeArtifactSnapshotEvent(),
    buildCodeRuntimeActionRequiredEvent(),
    buildCodeRuntimeTestToolStartEvent(),
    buildCodeRuntimeTestToolEndEvent(),
  ];
}

function formatBridgeSseMessage(eventName, payload) {
  return `data: ${JSON.stringify({ event: eventName, payload })}\n\n`;
}

function buildCodeRuntimeSseBody(
  eventNames,
  payloads = buildCodeRuntimeStreamEvents(),
) {
  const runtimeEventNames = eventNames.filter((eventName) =>
    eventName.startsWith("aster_stream_"),
  );
  const messages = runtimeEventNames.flatMap((eventName) =>
    payloads.map((payload) => formatBridgeSseMessage(eventName, payload)),
  );
  return `: lime-agent-runtime-smoke\n\n${messages.join("")}`;
}

function buildCodeRuntimeEventSourceFixtureScript(eventsUrl) {
  const runtimePayloads = buildCodeRuntimeStreamEvents();
  const queuePayloads = [buildCodeRuntimeQueueAddedEvent()];
  return `(() => {
    const fixtureEventsUrl = ${JSON.stringify(eventsUrl)};
    const runtimePayloads = ${JSON.stringify(runtimePayloads)};
    const queuePayloads = ${JSON.stringify(queuePayloads)};
    const NativeEventSource = window.EventSource;
    const diagnostics = {
      connections: [],
      eventsSent: [],
      subscribedEvents: [],
      mainRuntimeStreamSent: false,
    };

    const parseSubscribedEvents = (requestUrl) => {
      const url = new URL(requestUrl, window.location.href);
      const events = [];
      const singleEvent = url.searchParams.get("event");
      if (singleEvent && singleEvent.trim()) {
        events.push(singleEvent.trim());
      }
      const encodedEvents = url.searchParams.get("events");
      if (encodedEvents) {
        try {
          const parsed = JSON.parse(encodedEvents);
          if (Array.isArray(parsed)) {
            for (const eventName of parsed) {
              if (typeof eventName === "string" && eventName.trim()) {
                events.push(eventName.trim());
              }
            }
          }
        } catch {
          // DevBridge 事件订阅只接受 JSON 数组；格式异常交给诊断快照体现。
        }
      }
      return Array.from(new Set(events));
    };

    function SmokeEventSource(url, init) {
      const requestUrl = String(url || "");
      if (!requestUrl.startsWith(fixtureEventsUrl)) {
        if (NativeEventSource) {
          return new NativeEventSource(url, init);
        }
        throw new Error("EventSource is unavailable");
      }

      this.url = requestUrl;
      this.withCredentials = Boolean(init?.withCredentials);
      this.readyState = SmokeEventSource.CONNECTING;
      this.onopen = null;
      this.onmessage = null;
      this.onerror = null;
      this.__listeners = new Map();
      const subscribedEvents = parseSubscribedEvents(requestUrl);
      diagnostics.connections.push({
        url: requestUrl,
        events: subscribedEvents,
        at: new Date().toISOString(),
      });
      diagnostics.connections = diagnostics.connections.slice(-20);
      diagnostics.subscribedEvents = Array.from(
        new Set([...diagnostics.subscribedEvents, ...subscribedEvents]),
      );

      window.setTimeout(() => {
        if (this.readyState === SmokeEventSource.CLOSED) {
          return;
        }
        this.readyState = SmokeEventSource.OPEN;
        const openEvent = new Event("open");
        this.onopen?.(openEvent);
        this.dispatchEvent(openEvent);

        const runtimeEventNames = subscribedEvents.filter((eventName) =>
          eventName.startsWith("aster_stream_"),
        );
        const queueModeEnabled = Boolean(
          window.__limeCodeRuntimeQueueModeEnabled,
        );
        const payloadsToSend = diagnostics.mainRuntimeStreamSent
          ? queueModeEnabled
            ? queuePayloads
            : []
          : runtimePayloads;
        for (const eventName of runtimeEventNames) {
          for (const payload of payloadsToSend) {
            if (this.readyState === SmokeEventSource.CLOSED) {
              return;
            }
            const message = new MessageEvent("message", {
              data: JSON.stringify({ event: eventName, payload }),
            });
            this.onmessage?.(message);
            this.dispatchEvent(message);
          }
        }
        if (runtimeEventNames.length > 0) {
          diagnostics.mainRuntimeStreamSent = true;
          diagnostics.eventsSent.push({
            events: runtimeEventNames,
            eventTypes: payloadsToSend.map((payload) => payload.type),
            queueModeEnabled,
            at: new Date().toISOString(),
          });
          diagnostics.eventsSent = diagnostics.eventsSent.slice(-20);
        }
      }, 0);
    }

    SmokeEventSource.CONNECTING = 0;
    SmokeEventSource.OPEN = 1;
    SmokeEventSource.CLOSED = 2;
    SmokeEventSource.prototype.CONNECTING = 0;
    SmokeEventSource.prototype.OPEN = 1;
    SmokeEventSource.prototype.CLOSED = 2;
    SmokeEventSource.prototype.addEventListener = function addEventListener(
      type,
      listener,
    ) {
      if (typeof listener !== "function") {
        return;
      }
      const key = String(type);
      const listeners = this.__listeners.get(key) || new Set();
      listeners.add(listener);
      this.__listeners.set(key, listeners);
    };
    SmokeEventSource.prototype.removeEventListener = function removeEventListener(
      type,
      listener,
    ) {
      const listeners = this.__listeners.get(String(type));
      listeners?.delete(listener);
    };
    SmokeEventSource.prototype.dispatchEvent = function dispatchEvent(event) {
      const listeners = this.__listeners.get(event.type);
      if (!listeners) {
        return true;
      }
      for (const listener of Array.from(listeners)) {
        listener.call(this, event);
      }
      return true;
    };
    SmokeEventSource.prototype.close = function close() {
      this.readyState = SmokeEventSource.CLOSED;
    };

    window.__limeCodeRuntimeEventSourceFixtureDiagnostics = diagnostics;
    window.EventSource = SmokeEventSource;
  })()`;
}

async function installCodeRuntimeDevBridgeFixture(page, options) {
  let fixture = buildCodeRuntimeSessionFixture();
  let sessionCreated = false;
  const eventsUrl = deriveBridgeEventsUrl(options.invokeUrl);
  const providerFixture = buildCodeRuntimeProviderFixture();
  const modelFixture = buildCodeRuntimeModelFixture();
  const commandCounts = new Map();
  const commands = [];
  const createSessionRequests = [];
  const submitTurnRequests = [];
  const respondActionRequests = [];
  const restoreFileCheckpointRequests = [];
  const eventConnections = [];
  const eventsSent = [];
  const subscribedEvents = new Set();
  let mainRuntimeSseSent = false;
  const recordCommand = (command, args = null) => {
    if (typeof command !== "string" || !command) {
      return;
    }
    commandCounts.set(command, (commandCounts.get(command) || 0) + 1);
    commands.push({ command, args, at: new Date().toISOString() });
    if (commands.length > 50) {
      commands.shift();
    }
  };
  await page.route(`${eventsUrl}**`, async (route) => {
    const request = route.request();
    if (request.method() !== "GET") {
      await route.fallback();
      return;
    }

    const eventNames = parseSubscribedBridgeEvents(request.url());
    for (const eventName of eventNames) {
      subscribedEvents.add(eventName);
    }
    eventConnections.push({
      url: request.url(),
      events: eventNames,
      at: new Date().toISOString(),
    });
    if (eventConnections.length > 20) {
      eventConnections.shift();
    }

    const runtimeEventNames = eventNames.filter((eventName) =>
      eventName.startsWith("aster_stream_"),
    );
    const ssePayloads =
      runtimeEventNames.length > 0 && mainRuntimeSseSent
        ? [buildCodeRuntimeQueueAddedEvent()]
        : buildCodeRuntimeStreamEvents();
    const body = buildCodeRuntimeSseBody(eventNames, ssePayloads);
    if (runtimeEventNames.length > 0) {
      mainRuntimeSseSent = true;
      eventsSent.push({
        events: runtimeEventNames,
        eventTypes: ssePayloads.map((payload) => payload.type),
        at: new Date().toISOString(),
      });
    }
    if (eventsSent.length > 20) {
      eventsSent.shift();
    }

    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      headers: {
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
      body,
    });
  });
  await page.route(`${options.invokeUrl}**`, async (route) => {
    const request = route.request();
    if (request.method() !== "POST") {
      await route.fallback();
      return;
    }

    let payload = null;
    try {
      payload = JSON.parse(request.postData() || "{}");
    } catch {
      await route.fallback();
      return;
    }

    const command = payload?.cmd;
    const args = payload?.args || {};
    recordCommand(command, args);
    if (command === "get_api_key_providers") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ result: [providerFixture] }),
      });
      return;
    }
    if (command === "get_provider_ui_state") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ result: null }),
      });
      return;
    }
    if (command === "get_default_provider") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ result: CODE_FIXTURE_PROVIDER_ID }),
      });
      return;
    }
    if (command === "get_model_registry") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ result: [modelFixture] }),
      });
      return;
    }
    if (command === "get_model_preferences") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ result: [] }),
      });
      return;
    }
    if (command === "get_model_sync_state") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          result: {
            last_sync_at: null,
            model_count: 1,
            is_syncing: false,
            last_error: null,
          },
        }),
      });
      return;
    }
    if (command === "fetch_provider_models_auto") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          result: {
            models: [modelFixture],
            source: "Api",
            error: null,
          },
        }),
      });
      return;
    }
    if (command === "aster_agent_init" || command === "aster_agent_status") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          result: {
            initialized: true,
            provider_configured: true,
            provider_name: CODE_FIXTURE_PROVIDER_ID,
            provider_selector: CODE_FIXTURE_PROVIDER_ID,
            model_name: CODE_FIXTURE_MODEL_ID,
          },
        }),
      });
      return;
    }
    if (command === "agent_runtime_create_session") {
      createSessionRequests.push(args);
      if (createSessionRequests.length > 20) {
        createSessionRequests.shift();
      }
      const requestedWorkspaceId =
        typeof args?.workspaceId === "string"
          ? args.workspaceId
          : typeof args?.workspace_id === "string"
            ? args.workspace_id
            : CODE_FIXTURE_WORKSPACE_ID;
      fixture = buildCodeRuntimeSessionFixture(
        CODE_FIXTURE_SESSION_ID,
        requestedWorkspaceId,
      );
      sessionCreated = true;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ result: fixture.id }),
      });
      return;
    }
    if (command === "agent_runtime_update_session") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ result: null }),
      });
      return;
    }
    if (command === "agent_runtime_submit_turn") {
      const submitRequest = args?.request ?? null;
      submitTurnRequests.push(submitRequest);
      if (submitTurnRequests.length > 20) {
        submitTurnRequests.shift();
      }
      if (submitRequest?.message === QUEUED_PROMPT_TEXT) {
        const queuedTurn = buildCodeRuntimeQueuedTurn();
        const nowIso = new Date().toISOString();
        fixture = {
          ...fixture,
          queued_turns: [queuedTurn],
          thread_read: {
            ...fixture.thread_read,
            status: "running",
            queued_turns: [queuedTurn],
            updated_at: nowIso,
          },
        };
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ result: null }),
      });
      return;
    }
    if (command === "agent_runtime_respond_action") {
      respondActionRequests.push(args?.request ?? null);
      if (respondActionRequests.length > 20) {
        respondActionRequests.shift();
      }
      fixture = {
        ...fixture,
        thread_read: {
          ...fixture.thread_read,
          pending_requests: [],
          updated_at: new Date().toISOString(),
        },
      };
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ result: null }),
      });
      return;
    }
    if (command === "agent_runtime_list_file_checkpoints") {
      const nowIso = new Date().toISOString();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          result: {
            session_id: CODE_FIXTURE_SESSION_ID,
            thread_id: CODE_FIXTURE_THREAD_ID,
            checkpoint_count: 1,
            checkpoints: [buildCodeRuntimeFileCheckpointSummary(nowIso)],
          },
        }),
      });
      return;
    }
    if (command === "agent_runtime_get_file_checkpoint") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          result: buildCodeRuntimeFileCheckpointDetail(),
        }),
      });
      return;
    }
    if (command === "agent_runtime_diff_file_checkpoint") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          result: buildCodeRuntimeFileCheckpointDiff(),
        }),
      });
      return;
    }
    if (command === "agent_runtime_restore_file_checkpoint") {
      const request = args?.request ?? null;
      restoreFileCheckpointRequests.push(request);
      if (restoreFileCheckpointRequests.length > 20) {
        restoreFileCheckpointRequests.shift();
      }
      const nowIso = new Date().toISOString();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          result: {
            session_id: CODE_FIXTURE_SESSION_ID,
            thread_id: CODE_FIXTURE_THREAD_ID,
            checkpoint: buildCodeRuntimeFileCheckpointSummary(nowIso),
            live_path: CODE_FIXTURE_SOURCE_FILE_PATH,
            snapshot_path: CODE_FIXTURE_CHECKPOINT_SNAPSHOT_PATH,
            backup_path: CODE_FIXTURE_RESTORE_BACKUP_PATH,
            restored_at: nowIso,
          },
        }),
      });
      return;
    }
    if (command === "agent_runtime_list_sessions") {
      if (!sessionCreated) {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          result: [
            {
              id: fixture.id,
              name: fixture.name,
              created_at: fixture.created_at,
              updated_at: fixture.updated_at,
              model: fixture.model,
              messages_count: fixture.messages.length,
              execution_strategy: fixture.execution_strategy,
              workspace_id: fixture.workspace_id,
              working_dir: fixture.working_dir,
            },
          ],
        }),
      });
      return;
    }
    if (command === "agent_runtime_get_session") {
      const requestedSessionId = args?.sessionId || args?.session_id;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          result: {
            ...fixture,
            id: requestedSessionId || fixture.id,
            execution_runtime: {
              ...fixture.execution_runtime,
              session_id: requestedSessionId || fixture.id,
            },
          },
        }),
      });
      return;
    }
    if (command === "agent_runtime_get_thread_read") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ result: fixture.thread_read }),
      });
      return;
    }

    await route.fallback();
  });
  return {
    getDiagnostics() {
      return {
        sessionCreated,
        fixtureSessionId: fixture.id,
        fixtureWorkspaceId: fixture.workspace_id,
        commandCounts: Object.fromEntries(commandCounts.entries()),
        commands: [...commands],
        createSessionRequests: [...createSessionRequests],
        submitTurnRequests: [...submitTurnRequests],
        respondActionRequests: [...respondActionRequests],
        restoreFileCheckpointRequests: [...restoreFileCheckpointRequests],
        eventsUrl,
        eventConnections: [...eventConnections],
        eventsSent: [...eventsSent],
        subscribedEvents: Array.from(subscribedEvents),
      };
    },
  };
}

function buildComposerReadyScript() {
  return `(() => {
    const collectButtons = () =>
      Array.from(document.querySelectorAll("button")).map((button) => ({
        text: (button.textContent || "").trim(),
        aria: button.getAttribute("aria-label"),
        title: button.getAttribute("title"),
        disabled: Boolean(button.disabled),
      }));
    const textarea = Array.from(
      document.querySelectorAll(
        '[data-testid="inputbar-core-container"] textarea, textarea',
      ),
    ).find(
      (candidate) =>
        candidate instanceof HTMLTextAreaElement && !candidate.disabled,
    );
    return {
      ok: Boolean(textarea),
      buttons: collectButtons(),
      textareas: Array.from(document.querySelectorAll("textarea")).map(
        (candidate) => ({
          disabled: Boolean(candidate.disabled),
          placeholder: candidate.getAttribute("placeholder"),
          value: candidate.value,
        }),
      ),
    };
  })()`;
}

function buildFillPromptScript(prompt) {
  return `(() => {
    const collectButtons = () =>
      Array.from(document.querySelectorAll("button")).map((button) => ({
        text: (button.textContent || "").trim(),
        aria: button.getAttribute("aria-label"),
        disabled: Boolean(button.disabled),
      }));
    const resolveTextarea = () => {
      const candidates = Array.from(
        document.querySelectorAll(
          '[data-testid="inputbar-core-container"] textarea, textarea',
        ),
      );
      return (
        candidates.find(
          (candidate) =>
            candidate instanceof HTMLTextAreaElement && !candidate.disabled,
        ) || null
      );
    };
    const textarea = resolveTextarea();
    if (!textarea) {
      return {
        ok: false,
        reason: "missing-input",
        buttons: collectButtons(),
      };
    }
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
    if (!setter) {
      return { ok: false, reason: "missing-native-textarea-setter" };
    }

    textarea.focus();
    setter.call(textarea, ${JSON.stringify(prompt)});
    textarea.dispatchEvent(new InputEvent("input", {
      bubbles: true,
      data: ${JSON.stringify(prompt)},
      inputType: "insertText",
    }));
    textarea.dispatchEvent(new Event("change", { bubbles: true }));

    const currentTextarea = resolveTextarea() || textarea;
    const currentSend = Array.from(
      document.querySelectorAll(
        '[data-testid="inputbar-core-container"] button, button',
      ),
    ).find((button) => {
      const text = (button.textContent || "").trim();
      const aria = button.getAttribute("aria-label") || "";
      const title = button.getAttribute("title") || "";
      return (
        aria === "发送" ||
        title === "发送" ||
        text.includes("稍后处理")
      );
    });
    return {
      ok: true,
      value: currentTextarea?.value ?? "",
      sendDisabled: Boolean(currentSend?.disabled),
      buttons: collectButtons(),
    };
  })()`;
}

function buildSendReadyScript() {
  return `(() => {
    const textarea =
      Array.from(
        document.querySelectorAll(
          '[data-testid="inputbar-core-container"] textarea, textarea',
        ),
      ).find(
        (candidate) =>
          candidate instanceof HTMLTextAreaElement && !candidate.disabled,
      ) || null;
    const send = Array.from(
      document.querySelectorAll(
        '[data-testid="inputbar-core-container"] button, button',
      ),
    ).find((button) => {
      const text = (button.textContent || "").trim();
      const aria = button.getAttribute("aria-label") || "";
      const title = button.getAttribute("title") || "";
      return (
        aria === "发送" ||
        title === "发送" ||
        text.includes("稍后处理")
      );
    });
    return {
      ok:
        Boolean(textarea) &&
        typeof textarea?.value === "string" &&
        textarea.value.trim().length > 0 &&
        Boolean(send) &&
        send.disabled === false,
      value: textarea?.value ?? "",
      sendDisabled: Boolean(send?.disabled),
    };
  })()`;
}

function buildClickSendScript() {
  return `(() => {
    const send = Array.from(
      document.querySelectorAll(
        '[data-testid="inputbar-core-container"] button, button',
      ),
    ).find((button) => {
      const text = (button.textContent || "").trim();
      const aria = button.getAttribute("aria-label") || "";
      const title = button.getAttribute("title") || "";
      return (
        aria === "发送" ||
        title === "发送" ||
        text.includes("稍后处理")
      );
    });
    if (!send) {
      return {
        ok: false,
        reason: "missing-send-button",
      };
    }
    if (send.disabled) {
      return {
        ok: false,
        reason: "send-disabled",
      };
    }

    send.dispatchEvent(new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
      view: window,
    }));
    send.dispatchEvent(new MouseEvent("mouseup", {
      bubbles: true,
      cancelable: true,
      view: window,
    }));
    send.dispatchEvent(new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      view: window,
    }));

    return {
      ok: true,
      submitted: true,
    };
  })()`;
}

function buildOpenWorkbenchScript() {
  return `(() => {
    const target = Array.from(document.querySelectorAll("button")).find(
      (button) =>
        ((button.textContent || "").trim() === "Harness" ||
          (button.getAttribute("aria-label") || "").includes("Harness") ||
          (button.getAttribute("title") || "").includes("Harness")) &&
        button instanceof HTMLButtonElement,
    );
    if (!target) {
      return {
        ok: false,
        buttons: Array.from(document.querySelectorAll("button")).map((button) => ({
          text: (button.textContent || "").trim(),
          aria: button.getAttribute("aria-label"),
        })),
      };
    }

    const dialogOpen = Boolean(
      document.querySelector('[role="dialog"] [data-harness-drag-handle="true"]'),
    );
    const alreadyOpen =
      dialogOpen ||
      target.getAttribute("aria-expanded") === "true" ||
      (target.getAttribute("aria-label") || "").includes("关闭Harness");

    if (alreadyOpen) {
      return {
        ok: true,
        alreadyOpen: true,
        dialogOpen,
        ariaExpanded: target.getAttribute("aria-expanded"),
        ariaLabel: target.getAttribute("aria-label"),
      };
    }

    target.click();
    return {
      ok: true,
      alreadyOpen: false,
      dialogOpen: Boolean(
        document.querySelector('[role="dialog"] [data-harness-drag-handle="true"]'),
      ),
      ariaExpanded: target.getAttribute("aria-expanded"),
      ariaLabel: target.getAttribute("aria-label"),
    };
  })()`;
}

function buildHarnessDialogCheckScript() {
  return `(() => {
    const text = document.body ? document.body.innerText : "";
    return {
      ok:
        Boolean(document.querySelector('[role="dialog"]')) &&
        (Boolean(
          document.querySelector(
            '[role="dialog"] [data-harness-drag-handle="true"]',
          ),
        ) ||
          text.includes("处理工作台")),
      hasDialog: Boolean(document.querySelector('[role="dialog"]')),
      hasHarnessHandle: Boolean(
        document.querySelector('[role="dialog"] [data-harness-drag-handle="true"]'),
      ),
      hasWorkbenchText: text.includes("处理工作台"),
    };
  })()`;
}

function buildWorkbenchButtonCheckScript() {
  return `(() => {
    const button = Array.from(document.querySelectorAll("button")).find(
      (candidate) =>
        ((candidate.textContent || "").trim() === "Harness" ||
          (candidate.getAttribute("aria-label") || "").includes("Harness") ||
          (candidate.getAttribute("title") || "").includes("Harness")) &&
        candidate instanceof HTMLButtonElement,
    );

    return {
      hasButton: Boolean(button),
      text: document.body ? document.body.innerText : "",
      ariaLabel: button?.getAttribute("aria-label") || null,
      title: button?.getAttribute("title") || null,
    };
  })()`;
}

function buildOpenSubmittedCodeSessionScript() {
  return `(() => {
    const harnessButton = Array.from(document.querySelectorAll("button")).find(
      (candidate) =>
        ((candidate.textContent || "").trim() === "Harness" ||
          (candidate.getAttribute("aria-label") || "").includes("Harness") ||
          (candidate.getAttribute("title") || "").includes("Harness")) &&
        candidate instanceof HTMLButtonElement,
    );
    if (harnessButton) {
      return {
        ok: true,
        reason: "harness-ready",
        url: window.location.href,
      };
    }

    const clickedKey = "__limeCodeRuntimeSmokeRecentSessionClicked";
    const recentButton =
      document.querySelector('[data-testid="entry-recent-session-resume"]') ||
      Array.from(document.querySelectorAll("button")).find((button) => {
        const text = (button.textContent || "").trim();
        const aria = button.getAttribute("aria-label") || "";
        const title = button.getAttribute("title") || "";
        return (
          text.includes("自然语言任务 runtime smoke") ||
          aria.includes("自然语言任务 runtime smoke") ||
          title.includes("自然语言任务 runtime smoke")
        );
      });

    if (
      recentButton instanceof HTMLButtonElement &&
      !recentButton.disabled &&
      !window[clickedKey]
    ) {
      window[clickedKey] = true;
      recentButton.click();
      return {
        ok: false,
        clicked: true,
        reason: "clicked-recent-session",
        text: (recentButton.textContent || "").trim(),
        aria: recentButton.getAttribute("aria-label"),
        title: recentButton.getAttribute("title"),
        url: window.location.href,
      };
    }

    return {
      ok: false,
      clicked: false,
      reason: recentButton
        ? "recent-session-already-clicked-or-disabled"
        : "recent-session-entry-missing",
      url: window.location.href,
      bodyTextSample: (document.body?.innerText || "").slice(0, 1200),
      buttons: Array.from(document.querySelectorAll("button"))
        .slice(0, 80)
        .map((button) => ({
          text: (button.textContent || "").trim(),
          aria: button.getAttribute("aria-label"),
          title: button.getAttribute("title"),
          disabled: Boolean(button.disabled),
          testId: button.getAttribute("data-testid"),
        })),
    };
  })()`;
}

function buildRuntimeSmokeDiagnosticsScript() {
  return `(() => {
    const text = document.body ? document.body.innerText : "";
    return {
      url: window.location.href,
      title: document.title,
      bodyTextSample: text.slice(0, 2000),
      buttons: Array.from(document.querySelectorAll("button"))
        .slice(0, 80)
        .map((button) => ({
          text: (button.textContent || "").trim(),
          aria: button.getAttribute("aria-label"),
          title: button.getAttribute("title"),
          disabled: Boolean(button.disabled),
          expanded: button.getAttribute("aria-expanded"),
        })),
      textareas: Array.from(document.querySelectorAll("textarea")).map(
        (textarea) => ({
          disabled: Boolean(textarea.disabled),
          placeholder: textarea.getAttribute("placeholder"),
          value: textarea.value,
        }),
      ),
      dialogCount: document.querySelectorAll('[role="dialog"]').length,
      harnessHandleCount: document.querySelectorAll(
        '[data-harness-drag-handle="true"]',
      ).length,
      runtimeStripCount: document.querySelectorAll(
        '[data-testid="agent-runtime-strip"]',
      ).length,
      runtimeWorkbenchStripCount: document.querySelectorAll(
        '[data-testid="agent-runtime-strip"][data-runtime-kind="runtime"]',
      ).length,
      eventSourceFixture:
        window.__limeCodeRuntimeEventSourceFixtureDiagnostics || null,
      harnessSectionCounts: {
        writes: document.querySelectorAll('[data-harness-section="writes"]').length,
        outputs: document.querySelectorAll('[data-harness-section="outputs"]').length,
        approvals: document.querySelectorAll('[data-harness-section="approvals"]').length,
        files: document.querySelectorAll('[data-harness-section="files"]').length,
        fileReview: document.querySelectorAll('[data-harness-section="file_review"]').length,
      },
    };
  })()`;
}

function buildRuntimeSummaryCheckScript() {
  return `(() => {
    const text = document.body ? document.body.innerText : "";
    const agentRuntimeStrip = document.querySelector('[data-testid="agent-runtime-strip"]');
    const writesSection = document.querySelector('[data-harness-section="writes"]');
    const outputsSection = document.querySelector('[data-harness-section="outputs"]');
    const approvalsSection = document.querySelector('[data-harness-section="approvals"]');
    const filesSection = document.querySelector('[data-harness-section="files"]');
    const fileReviewSection = document.querySelector('[data-harness-section="file_review"]');
    const approvalApproveButton = Array.from(
      document.querySelectorAll("button"),
    ).find((button) => {
      const textContent = (button.textContent || "").trim();
      const aria = button.getAttribute("aria-label") || "";
      return (
        textContent.includes("允许并继续") ||
        aria.includes("允许并继续")
      );
    });
    return {
      hasWorkbench: text.includes("处理工作台"),
      hasRuntimeSummary: text.includes("Runtime 能力摘要"),
      hasPlainCodingPrompt: text.includes(${JSON.stringify(PROMPT_TEXT)}),
      hasAgentRuntimeStrip: Boolean(agentRuntimeStrip),
      hasReactRuntimeStrategy: Boolean(
        document.querySelector(
          '[data-testid="agent-runtime-strip"][data-execution-strategy="react"]',
        ),
      ),
      hasRuntimeOutputs: Boolean(
        document.querySelector(
          '[data-testid="agent-runtime-strip-status-runtime_outputs"][data-status-key="runtime_outputs"]',
        ),
      ),
      hasPendingApprovalStatus: Boolean(
        document.querySelector(
          '[data-testid="agent-runtime-strip-status-pending"][data-status-key="pending"]',
        ),
      ),
      hasHarnessWritesSection: Boolean(writesSection),
      hasHarnessOutputsSection: Boolean(outputsSection),
      hasHarnessApprovalsSection: Boolean(approvalsSection),
      hasHarnessFilesSection: Boolean(filesSection),
      hasImageCardFile:
        text.includes(${JSON.stringify(CODE_FIXTURE_FILE_PATH)}) ||
        text.includes("ImageCard.test.tsx"),
      hasVitestOutput:
        text.includes("PASS ImageCard.test.tsx") &&
        text.includes("1 test passed"),
      hasWriteApprovalPrompt: text.includes(${JSON.stringify(CODE_FIXTURE_APPROVAL_PROMPT)}),
      hasFileEventPreview: text.includes(${JSON.stringify(CODE_FIXTURE_FILE_EVENT_PREVIEW)}),
      hasApprovalApproveButton: Boolean(approvalApproveButton),
      hasCodeDiffOverview:
        text.includes("代码变更概览") &&
        text.includes(${JSON.stringify(CODE_FIXTURE_SOURCE_FILE_PATH)}) &&
        text.includes("oldTitle") &&
        text.includes("newTitle"),
      hasCodeDiffSideBySide:
        text.includes("修改前") && text.includes("修改后"),
      hasFileReviewSection:
        Boolean(fileReviewSection) &&
        text.includes("本轮文件变更处理") &&
        text.includes(${JSON.stringify(CODE_FIXTURE_FILE_PATH)}) &&
        text.includes(${JSON.stringify(CODE_FIXTURE_SOURCE_FILE_PATH)}) &&
        text.includes("oldTitle"),
      hasFileReviewControls:
        text.includes("全选变更") &&
        text.includes("标记已应用") &&
        text.includes("拒绝并回滚"),
      hasWebSearchReady: text.includes("WebSearch 已接通"),
      hasSubagentReady: text.includes("子任务核心 tools 已接通"),
      hasTeamReady: text.includes("Team current tools 已接通"),
      hasTaskReady: text.includes("Task current tools 已接通"),
      hasReadyBanner: text.includes("当前 runtime current surface 已覆盖 WebSearch、子任务、Team 与 Task 主链。"),
      hasWebSearchGap: text.includes("WebSearch 未接通"),
      hasSubagentGap: text.includes("子任务核心 tools 缺"),
      hasTeamGap: text.includes("Team current tools 缺"),
      hasTaskGap: text.includes("Task current tools 缺"),
      hasGapBanner: text.includes("当前 runtime current surface 仍有缺口"),
      hasLegacyWebSearchWarning: text.includes(${JSON.stringify(FORBIDDEN_PAGE_WARNINGS[0])}),
      hasLegacySubagentWarning: text.includes(${JSON.stringify(FORBIDDEN_PAGE_WARNINGS[1])}),
    };
  })()`;
}

function buildCodeRuntimeQueueCheckScript() {
  return `(() => {
    const text = document.body ? document.body.innerText : "";
    const queuedTurnControl = document.querySelector(
      ${JSON.stringify(
        `[aria-controls="queued-turn-detail-${CODE_FIXTURE_QUEUED_TURN_ID}"]`,
      )},
    );
    return {
      ok:
        Boolean(queuedTurnControl) &&
        text.includes(${JSON.stringify(QUEUED_PROMPT_TEXT)}) &&
        (text.includes("排队 1") ||
          text.includes("稍后处理") ||
          text.includes("会依次开始") ||
          text.includes("已加入排队列表")),
      hasQueuedTurnControl: Boolean(queuedTurnControl),
      hasQueuedPrompt: text.includes(${JSON.stringify(QUEUED_PROMPT_TEXT)}),
      hasQueuedState:
        text.includes("排队 1") ||
        text.includes("稍后处理") ||
        text.includes("会依次开始") ||
        text.includes("已加入排队列表"),
      bodyTextSample: text.slice(0, 1800),
      buttons: Array.from(document.querySelectorAll("button"))
        .slice(0, 80)
        .map((button) => ({
          text: (button.textContent || "").trim(),
          aria: button.getAttribute("aria-label"),
          controls: button.getAttribute("aria-controls"),
          disabled: Boolean(button.disabled),
        })),
    };
  })()`;
}

function buildApprovalButtonCheckScript() {
  return `(() => {
    const buttons = Array.from(document.querySelectorAll("button")).map(
      (button) => ({
        text: (button.textContent || "").trim(),
        aria: button.getAttribute("aria-label"),
        title: button.getAttribute("title"),
        disabled: Boolean(button.disabled),
      }),
    );
    const approveButton = buttons.find(
      (button) =>
        button.text.includes("允许并继续") ||
        (button.aria || "").includes("允许并继续"),
    );
    return {
      ok: Boolean(approveButton) && approveButton.disabled === false,
      approveButton: approveButton || null,
      buttons,
    };
  })()`;
}

function buildClickFileReviewControlScript(control) {
  return `(() => {
    const section = document.querySelector('[data-harness-section="file_review"]');
    const buttons = Array.from(
      (section || document).querySelectorAll("button"),
    ).map((button) => ({
      element: button,
      text: (button.textContent || "").trim(),
      aria: button.getAttribute("aria-label") || "",
      title: button.getAttribute("title") || "",
      disabled: Boolean(button.disabled),
    }));
    const control = ${JSON.stringify(control)};
    const target = buttons.find((button) => {
      if (control === "select-all") {
        return (
          button.text.includes("全选变更") ||
          button.aria.includes("选择本轮全部文件变更")
        );
      }
      if (control === "mark-applied") {
        return button.text.includes("标记已应用");
      }
      return false;
    });

    if (!target) {
      return {
        ok: false,
        reason: "missing-control",
        control,
        hasSection: Boolean(section),
        sectionText: (section?.textContent || "").slice(0, 1200),
        buttons: buttons.map(({ text, aria, title, disabled }) => ({
          text,
          aria,
          title,
          disabled,
        })),
      };
    }
    if (target.disabled) {
      return {
        ok: false,
        reason: "control-disabled",
        control,
        target: {
          text: target.text,
          aria: target.aria,
          title: target.title,
          disabled: target.disabled,
        },
        sectionText: (section?.textContent || "").slice(0, 1200),
      };
    }

    target.element.click();
    return {
      ok: true,
      clicked: control,
      target: {
        text: target.text,
        aria: target.aria,
        title: target.title,
      },
    };
  })()`;
}

function buildFileReviewAppliedCheckScript() {
  return `(() => {
    const section = document.querySelector('[data-harness-section="file_review"]');
    const text = section ? section.textContent || "" : "";
    return {
      ok:
        Boolean(section) &&
        text.includes("待处理 0") &&
        /已应用\\s+[1-9]/.test(text),
      hasSection: Boolean(section),
      text,
    };
  })()`;
}

function buildOpenFileCheckpointDialogScript() {
  return `(() => {
    if (document.querySelector('[data-testid="agent-thread-file-checkpoint-dialog"]')) {
      return {
        ok: true,
        reason: "dialog-already-open",
      };
    }

    const section = document.querySelector('[data-harness-section="file_review"]');
    const target = Array.from(
      (section || document).querySelectorAll("button"),
    ).find((button) => {
      const text = (button.textContent || "").trim();
      const aria = button.getAttribute("aria-label") || "";
      const title = button.getAttribute("title") || "";
      return (
        text.includes("打开文件快照") ||
        aria.includes("打开文件快照") ||
        title.includes("打开文件快照")
      );
    });

    if (!(target instanceof HTMLButtonElement) || target.disabled) {
      return {
        ok: false,
        reason: target ? "checkpoint-button-disabled" : "checkpoint-button-missing",
        hasSection: Boolean(section),
        sectionText: (section?.textContent || "").slice(0, 1200),
        buttons: Array.from((section || document).querySelectorAll("button"))
          .slice(0, 80)
          .map((button) => ({
            text: (button.textContent || "").trim(),
            aria: button.getAttribute("aria-label"),
            title: button.getAttribute("title"),
            disabled: Boolean(button.disabled),
            testId: button.getAttribute("data-testid"),
          })),
      };
    }

    target.click();
    return {
      ok: false,
      clicked: true,
      reason: "clicked-open-file-checkpoints",
      text: (target.textContent || "").trim(),
    };
  })()`;
}

function buildFileCheckpointDialogReadyCheckScript() {
  return `(() => {
    const dialog = document.querySelector('[data-testid="agent-thread-file-checkpoint-dialog"]');
    const text = dialog?.textContent || "";
    return {
      ok:
        Boolean(dialog) &&
        text.includes("变更对照") &&
        text.includes(${JSON.stringify(CODE_FIXTURE_SOURCE_FILE_PATH)}) &&
        text.includes("oldTitle") &&
        text.includes("newTitle") &&
        text.includes("变更前") &&
        text.includes("变更后") &&
        Boolean(document.querySelector('[data-testid="agent-thread-file-checkpoint-restore"]')),
      hasDialog: Boolean(dialog),
      text: text.slice(0, 2000),
      restoreButton: Boolean(document.querySelector('[data-testid="agent-thread-file-checkpoint-restore"]')),
    };
  })()`;
}

function buildClickFileCheckpointRestoreScript(targetTestId) {
  return `(() => {
    const target = document.querySelector(${JSON.stringify(`[data-testid="${targetTestId}"]`)});
    if (!(target instanceof HTMLButtonElement) || target.disabled) {
      return {
        ok: false,
        reason: target ? "target-disabled" : "target-missing",
        targetTestId: ${JSON.stringify(targetTestId)},
        dialogText: (
          document.querySelector('[data-testid="agent-thread-file-checkpoint-dialog"]')
            ?.textContent || ""
        ).slice(0, 1600),
      };
    }
    target.click();
    return {
      ok: true,
      clicked: ${JSON.stringify(targetTestId)},
    };
  })()`;
}

function buildFileCheckpointRestoreConfirmationCheckScript() {
  return `(() => {
    const confirmation = document.querySelector(
      '[data-testid="agent-thread-file-checkpoint-restore-confirmation"]',
    );
    const text = confirmation?.textContent || "";
    return {
      ok:
        Boolean(confirmation) &&
        text.includes("确认恢复") &&
        text.includes(${JSON.stringify(CODE_FIXTURE_SOURCE_FILE_PATH)}),
      hasConfirmation: Boolean(confirmation),
      text,
    };
  })()`;
}

function buildFileCheckpointRestoreSuccessCheckScript() {
  return `(() => {
    const state = document.querySelector(
      '[data-testid="agent-thread-file-checkpoint-restore-state"]',
    );
    const text = state?.textContent || "";
    return {
      ok:
        Boolean(state) &&
        text.includes(${JSON.stringify(`已恢复 ${CODE_FIXTURE_SOURCE_FILE_PATH}`)}) &&
        text.includes(${JSON.stringify(CODE_FIXTURE_RESTORE_BACKUP_PATH)}),
      hasState: Boolean(state),
      text,
    };
  })()`;
}

function buildCloseFileCheckpointDialogScript() {
  return `(() => {
    const dialog = document.querySelector('[data-testid="agent-thread-file-checkpoint-dialog"]');
    if (!dialog) {
      return {
        ok: true,
        reason: "dialog-already-closed",
      };
    }
    const target = Array.from(
      dialog.closest('[role="dialog"]')?.querySelectorAll("button") ||
        dialog.querySelectorAll("button"),
    ).find((button) => (button.textContent || "").trim() === "关闭");
    if (!(target instanceof HTMLButtonElement) || target.disabled) {
      return {
        ok: false,
        reason: target ? "close-disabled" : "close-missing",
        text: dialog.textContent?.slice(0, 1200) || "",
      };
    }
    target.click();
    return {
      ok: false,
      clicked: true,
    };
  })()`;
}

function buildFileCheckpointDialogGoneCheckScript() {
  return `(() => ({
    ok: !document.querySelector('[data-testid="agent-thread-file-checkpoint-dialog"]'),
    hasDialog: Boolean(document.querySelector('[data-testid="agent-thread-file-checkpoint-dialog"]')),
  }))()`;
}

function isExpectedApprovalResponseRequest(request) {
  return (
    request?.session_id === CODE_FIXTURE_SESSION_ID &&
    request?.request_id === CODE_FIXTURE_APPROVAL_REQUEST_ID &&
    request?.action_type === "tool_confirmation" &&
    request?.confirmed === true &&
    request?.response === "approved"
  );
}

function isExpectedPlainCodeRuntimeSubmitRequest(request) {
  const harnessMetadata = request?.turn_config?.metadata?.harness;
  return (
    request?.message === PROMPT_TEXT &&
    !String(request?.message || "").trim().startsWith("@代码") &&
    request?.session_id === CODE_FIXTURE_SESSION_ID &&
    request?.turn_config?.metadata?.harness?.code_command === undefined &&
    harnessMetadata?.fast_response_routing === undefined
  );
}

function isExpectedPlainCodeRuntimeQueuedSubmitRequest(request) {
  return (
    request?.message === QUEUED_PROMPT_TEXT &&
    !String(request?.message || "").trim().startsWith("@代码") &&
    request?.session_id === CODE_FIXTURE_SESSION_ID &&
    request?.queue_if_busy === true &&
    request?.turn_config?.metadata?.harness?.code_command === undefined
  );
}

function isExpectedFileCheckpointRestoreRequest(request) {
  return (
    request?.session_id === CODE_FIXTURE_SESSION_ID &&
    request?.checkpoint_id === CODE_FIXTURE_CHECKPOINT_ID &&
    request?.confirm_restore === true &&
    request?.create_backup === true
  );
}

function isExpectedCodeRuntimeSessionCreateRequest(request) {
  return request?.executionStrategy === "react";
}

async function waitForCheck(options, label, check) {
  const startedAt = Date.now();
  let lastValue = null;

  while (Date.now() - startedAt < options.timeoutMs) {
    try {
      lastValue = await check();
      if (lastValue?.ok) {
        return lastValue.value;
      }
    } catch (error) {
      if (!isTransientPageEvaluationError(error)) {
        throw error;
      }
      lastValue = {
        ok: false,
        value: {
          transientError:
            error instanceof Error ? error.message : String(error),
        },
      };
    }
    await sleep(options.intervalMs);
  }

  throw new Error(
    `[smoke:agent-runtime-tool-surface-page] 等待 ${label} 超时，最后结果: ${JSON.stringify(
      lastValue?.value ?? null,
    )}`,
  );
}

function isTransientPageEvaluationError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("Execution context was destroyed") ||
    message.includes("most likely because of a navigation") ||
    message.includes("Cannot find context with specified id")
  );
}

async function launchPlaywrightContext(userDataDir) {
  const launchOptions = {
    headless: true,
    viewport: { width: 1440, height: 960 },
  };

  try {
    return await chromium.launchPersistentContext(userDataDir, {
      ...launchOptions,
      channel: "chrome",
    });
  } catch (chromeError) {
    console.warn(
      `[smoke:agent-runtime-tool-surface-page] Chrome channel 启动失败，尝试 Playwright 自带 Chromium: ${
        chromeError instanceof Error ? chromeError.message : String(chromeError)
      }`,
    );
    return chromium.launchPersistentContext(userDataDir, launchOptions);
  }
}

async function evaluateScript(page, expression) {
  return page.evaluate(expression);
}

async function readPageText(page) {
  return page.evaluate(() => {
    const text = document.body?.innerText || "";
    const fieldText = Array.from(document.querySelectorAll("textarea, input"))
      .map((element) =>
        element instanceof HTMLTextAreaElement ||
        element instanceof HTMLInputElement
          ? element.value
          : "",
      )
      .join("\n");
    return `${text}\n${fieldText}`;
  });
}

async function collectRuntimeSmokeDiagnostics(page, fixtureRuntime) {
  const pageDiagnostics = await evaluateScript(
    page,
    buildRuntimeSmokeDiagnosticsScript(),
  ).catch((error) => ({
    diagnosticError: error instanceof Error ? error.message : String(error),
  }));
  return {
    page: pageDiagnostics,
    devBridge: fixtureRuntime?.getDiagnostics?.() ?? null,
  };
}

async function main() {
  if (typeof fetch !== "function") {
    throw new Error("当前 Node 运行时不支持 fetch，请使用 Node 18+");
  }

  const options = parseArgs(process.argv.slice(2));
  if (!options.allowLiveProvider) {
    console.log(
      "[smoke:agent-runtime-tool-surface-page] live_provider_submission=status:not_submitted reason:默认未提交真实 AgentRuntime / Provider，仅使用页面内 DevBridge fixture。",
    );
  }
  logStage("wait-health");
  await waitForHealth(options);
  await sleep(POST_HEALTH_SETTLE_MS);
  const userDataDir = fs.mkdtempSync(
    path.join(os.tmpdir(), `lime-runtime-tool-surface-page-${process.pid}-`),
  );
  let context = null;

  try {
    logStage("launch-playwright-page");
    context = await launchPlaywrightContext(userDataDir);
    const page = context.pages()[0] ?? (await context.newPage());
    page.setDefaultTimeout(options.timeoutMs);
    page.setDefaultNavigationTimeout(options.timeoutMs);
    await page.addInitScript(
      buildCodeRuntimeEventSourceFixtureScript(
        deriveBridgeEventsUrl(options.invokeUrl),
      ),
    );
    const fixtureRuntime = await installCodeRuntimeDevBridgeFixture(
      page,
      options,
    );
    await page.goto(options.appUrl, {
      waitUntil: "domcontentloaded",
      timeout: options.timeoutMs,
    });

    logStage("wait-page-storage-ready");
    await waitForCheck(options, "Lime 首页 origin 可访问", async () => {
      const value = await evaluateScript(
        page,
        buildPageStorageReadyScript(options.appUrl),
      );
      return {
        ok: value?.ok === true,
        value,
      };
    });

    logStage("bootstrap-harness-storage");
    await evaluateScript(page, buildHarnessBootstrapScript());
    logStage("refresh-page");
    await page.reload({
      waitUntil: "domcontentloaded",
      timeout: options.timeoutMs,
    });

    logStage("ensure-agent-home");
    await waitForCheck(options, "首页聊天输入框就绪", async () => {
      const value = await evaluateScript(page, buildEnsureAgentHomeScript());
      return {
        ok: value?.ok === true,
        value,
      };
    });

    logStage("fill-prompt");
    const textareaLocator = page
      .locator('[data-testid="inputbar-core-container"] textarea, textarea')
      .first();
    await waitForCheck(options, "首页输入框出现", async () => {
      const value = await evaluateScript(page, buildComposerReadyScript());
      return {
        ok: value?.ok === true,
        value,
      };
    });

    await textareaLocator.fill(PROMPT_TEXT);
    const filled = await waitForCheck(options, "首页输入框可写入", async () => {
      const value = await evaluateScript(page, buildSendReadyScript());
      if (value?.value === PROMPT_TEXT) {
        return {
          ok: true,
          value: { ok: true, value: value.value },
        };
      }
      const fallbackValue = await evaluateScript(
        page,
        buildFillPromptScript(PROMPT_TEXT),
      );
      return {
        ok: fallbackValue?.ok === true,
        value: fallbackValue,
      };
    });
    assert(
      filled?.ok === true,
      `准备输入失败: ${JSON.stringify(filled ?? null)}`,
    );

    logStage("wait-send-ready");
    const sendReady = await waitForCheck(options, "发送按钮可用", async () => {
      const value = await evaluateScript(page, buildSendReadyScript());
      return {
        ok: value?.ok === true,
        value,
      };
    });
    assert(
      sendReady?.ok === true,
      `发送按钮未就绪: ${JSON.stringify(sendReady ?? null)}`,
    );

    logStage("click-send");
    const sendLocator = page
      .locator('button[aria-label="发送"], button[title="发送"]')
      .first();
    await sendLocator.click();
    let submitCommand = null;
    try {
      submitCommand = await waitForCheck(
        options,
        "自然语言任务提交到 DevBridge",
        async () => {
          const diagnostics = fixtureRuntime.getDiagnostics();
          if (diagnostics.commandCounts.agent_runtime_submit_turn > 0) {
            return {
              ok: true,
              value: diagnostics,
            };
          }
          const fallbackSubmitted = await evaluateScript(
            page,
            buildClickSendScript(),
          );
          return {
            ok:
              fixtureRuntime.getDiagnostics().commandCounts
                .agent_runtime_submit_turn > 0,
            value: {
              fallbackSubmitted,
              diagnostics: fixtureRuntime.getDiagnostics(),
            },
          };
        },
      );
    } catch (error) {
      const diagnostics = await collectRuntimeSmokeDiagnostics(
        page,
        fixtureRuntime,
      );
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(
        `${reason}\n[smoke:agent-runtime-tool-surface-page] diagnostics=${JSON.stringify(
          diagnostics,
        )}`,
      );
    }
    const submitDiagnostics = submitCommand?.commandCounts
      ? submitCommand
      : submitCommand?.diagnostics;
    const latestCreateSessionRequest =
      submitDiagnostics?.createSessionRequests?.[
        submitDiagnostics.createSessionRequests.length - 1
      ] || null;
    const latestSubmitTurnRequest =
      submitDiagnostics?.submitTurnRequests?.[
        submitDiagnostics.submitTurnRequests.length - 1
      ] || null;
    assert(
      submitDiagnostics?.commandCounts?.agent_runtime_submit_turn > 0,
      `自然语言任务未提交到 DevBridge: ${JSON.stringify(submitCommand ?? null)}`,
    );
    assert(
      isExpectedCodeRuntimeSessionCreateRequest(latestCreateSessionRequest),
      `自然语言任务新会话未进入 current react runtime: ${JSON.stringify(
        submitDiagnostics ?? null,
      )}`,
    );
    assert(
      isExpectedPlainCodeRuntimeSubmitRequest(latestSubmitTurnRequest),
      `自然语言任务提交 payload 未走 current runtime 主链: ${JSON.stringify(
        submitDiagnostics ?? null,
      )}`,
    );

    logStage("open-submitted-code-session");
    await waitForCheck(options, "进入自然语言任务会话详情", async () => {
      const value = await evaluateScript(
        page,
        buildOpenSubmittedCodeSessionScript(),
      );
      return {
        ok: value?.ok === true,
        value,
      };
    });

    logStage("wait-harness-button");
    await waitForCheck(options, "Harness 按钮出现", async () => {
      const value = await evaluateScript(
        page,
        buildWorkbenchButtonCheckScript(),
      );
      return {
        ok: value?.hasButton === true,
        value,
      };
    });

    logStage("wait-code-runtime-main-stream");
    await waitForCheck(options, "首轮编程运行时事件已投影", async () => {
      const value = await evaluateScript(page, `(() => {
        const diagnostics =
          window.__limeCodeRuntimeEventSourceFixtureDiagnostics || null;
        const sent = diagnostics?.eventsSent || [];
        return {
          ok: sent.some((entry) =>
            Array.isArray(entry.eventTypes) &&
            entry.eventTypes.includes("turn_context") &&
            entry.eventTypes.includes("tool_start")
          ),
          diagnostics,
        };
      })()`);
      return {
        ok: value?.ok === true,
        value,
      };
    });

    logStage("queue-followup-prompt");
    await evaluateScript(
      page,
      `(() => {
        window.__limeCodeRuntimeQueueModeEnabled = true;
        return true;
      })()`,
    );
    await waitForCheck(options, "会话输入框可继续输入", async () => {
      const value = await evaluateScript(page, buildComposerReadyScript());
      return {
        ok: value?.ok === true,
        value,
      };
    });
    await textareaLocator.fill(QUEUED_PROMPT_TEXT);
    const queuedFilled = await waitForCheck(
      options,
      "续写输入框可写入",
      async () => {
        const value = await evaluateScript(page, buildSendReadyScript());
        if (value?.value === QUEUED_PROMPT_TEXT) {
          return {
            ok: true,
            value: { ok: true, value: value.value },
          };
        }
        const fallbackValue = await evaluateScript(
          page,
          buildFillPromptScript(QUEUED_PROMPT_TEXT),
        );
        return {
          ok: fallbackValue?.ok === true,
          value: fallbackValue,
        };
      },
    );
    assert(
      queuedFilled?.ok === true,
      `准备续写输入失败: ${JSON.stringify(queuedFilled ?? null)}`,
    );
    const queuedSendReady = await waitForCheck(
      options,
      "续写发送按钮可用",
      async () => {
        const value = await evaluateScript(page, buildSendReadyScript());
        return {
          ok: value?.ok === true,
          value,
        };
      },
    );
    assert(
      queuedSendReady?.ok === true,
      `续写发送按钮未就绪: ${JSON.stringify(queuedSendReady ?? null)}`,
    );
    const queuedClicked = await evaluateScript(page, buildClickSendScript());
    assert(
      queuedClicked?.ok === true,
      `点击续写排队按钮失败: ${JSON.stringify(queuedClicked ?? null)}`,
    );
    let queuedSubmitDiagnostics = null;
    try {
      queuedSubmitDiagnostics = await waitForCheck(
        options,
        "自然语言续写进入运行中会话队列",
        async () => {
          const diagnostics = fixtureRuntime.getDiagnostics();
          const latestRequest =
            diagnostics.submitTurnRequests[
              diagnostics.submitTurnRequests.length - 1
            ] || null;
          if (
            diagnostics.commandCounts.agent_runtime_submit_turn >= 2 &&
            isExpectedPlainCodeRuntimeQueuedSubmitRequest(latestRequest)
          ) {
            return {
              ok: true,
              value: {
                latestRequest,
                diagnostics,
              },
            };
          }
          const fallbackSubmitted = await evaluateScript(
            page,
            buildClickSendScript(),
          );
          const nextDiagnostics = fixtureRuntime.getDiagnostics();
          const nextLatestRequest =
            nextDiagnostics.submitTurnRequests[
              nextDiagnostics.submitTurnRequests.length - 1
            ] || null;
          return {
            ok:
              nextDiagnostics.commandCounts.agent_runtime_submit_turn >= 2 &&
              isExpectedPlainCodeRuntimeQueuedSubmitRequest(nextLatestRequest),
            value: {
              fallbackSubmitted,
              latestRequest: nextLatestRequest,
              diagnostics: nextDiagnostics,
            },
          };
        },
      );
    } catch (error) {
      const diagnostics = await collectRuntimeSmokeDiagnostics(
        page,
        fixtureRuntime,
      );
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(
        `${reason}\n[smoke:agent-runtime-tool-surface-page] diagnostics=${JSON.stringify(
          diagnostics,
        )}`,
      );
    }
    assert(
      isExpectedPlainCodeRuntimeQueuedSubmitRequest(
        queuedSubmitDiagnostics?.latestRequest,
      ),
      `自然语言续写排队 payload 未走 current runtime 主链: ${JSON.stringify(
        queuedSubmitDiagnostics ?? null,
      )}`,
    );
    await waitForCheck(options, "续写队列在输入区可见", async () => {
      const value = await evaluateScript(page, buildCodeRuntimeQueueCheckScript());
      return {
        ok: value?.ok === true,
        value,
      };
    });

    logStage("open-harness");
    const openWorkbench = await evaluateScript(
      page,
      buildOpenWorkbenchScript(),
    );
    assert(
      openWorkbench?.ok === true,
      `打开 Harness 失败: ${JSON.stringify(openWorkbench ?? null)}`,
    );
    await waitForCheck(options, "Harness 对话框打开", async () => {
      const value = await evaluateScript(page, buildHarnessDialogCheckScript());
      return {
        ok: value?.ok === true,
        value,
      };
    });

    logStage("wait-runtime-summary");
    let summaryFlags = null;
    try {
      summaryFlags = await waitForCheck(
        options,
        "Runtime 能力摘要出现",
        async () => {
          const value = await evaluateScript(
            page,
            buildRuntimeSummaryCheckScript(),
          );
          const hasAllRequired = REQUIRED_RUNTIME_SUMMARY_FLAGS.every(
            (key) => value?.[key] === true,
          );
          const hasRuntimeTask = REQUIRED_AGENT_RUNTIME_TASK_FLAGS.every(
            (key) => value?.[key] === true,
          );
          const hasRuntimeGap =
            value?.hasWebSearchGap ||
            value?.hasSubagentGap ||
            value?.hasTeamGap ||
            value?.hasTaskGap ||
            value?.hasGapBanner;
          const hasForbiddenWarning =
            value?.hasLegacyWebSearchWarning || value?.hasLegacySubagentWarning;
          return {
            ok:
              hasAllRequired &&
              hasRuntimeTask &&
              !hasRuntimeGap &&
              !hasForbiddenWarning,
            value,
          };
        },
      );
    } catch (error) {
      const diagnostics = await collectRuntimeSmokeDiagnostics(
        page,
        fixtureRuntime,
      );
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(
        `${reason}\n[smoke:agent-runtime-tool-surface-page] diagnostics=${JSON.stringify(
          diagnostics,
        )}`,
      );
    }

    logStage("review-code-diff-mark-applied");
    try {
      await waitForCheck(options, "选择本轮全部文件变更", async () => {
        const value = await evaluateScript(
          page,
          buildClickFileReviewControlScript("select-all"),
        );
        return {
          ok: value?.ok === true,
          value,
        };
      });
      await waitForCheck(options, "文件变更批量应用按钮可用", async () => {
        const value = await evaluateScript(
          page,
          buildClickFileReviewControlScript("mark-applied"),
        );
        return {
          ok: value?.ok === true,
          value,
        };
      });
      await waitForCheck(options, "代码变更处理状态更新", async () => {
        const value = await evaluateScript(
          page,
          buildFileReviewAppliedCheckScript(),
        );
        return {
          ok: value?.ok === true,
          value,
        };
      });
    } catch (error) {
      const diagnostics = await collectRuntimeSmokeDiagnostics(
        page,
        fixtureRuntime,
      );
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(
        `${reason}\n[smoke:agent-runtime-tool-surface-page] diagnostics=${JSON.stringify(
          diagnostics,
        )}`,
      );
    }

    logStage("restore-file-checkpoint");
    try {
      await waitForCheck(options, "文件快照入口打开", async () => {
        const value = await evaluateScript(
          page,
          buildOpenFileCheckpointDialogScript(),
        );
        return {
          ok: value?.ok === true,
          value,
        };
      });
      await waitForCheck(options, "文件快照 diff 审阅就绪", async () => {
        const value = await evaluateScript(
          page,
          buildFileCheckpointDialogReadyCheckScript(),
        );
        return {
          ok: value?.ok === true,
          value,
        };
      });
      const restoreClick = await evaluateScript(
        page,
        buildClickFileCheckpointRestoreScript(
          "agent-thread-file-checkpoint-restore",
        ),
      );
      assert(
        restoreClick?.ok === true,
        `打开文件快照恢复确认失败: ${JSON.stringify(restoreClick ?? null)}`,
      );
      await waitForCheck(options, "文件快照恢复确认出现", async () => {
        const value = await evaluateScript(
          page,
          buildFileCheckpointRestoreConfirmationCheckScript(),
        );
        return {
          ok: value?.ok === true,
          value,
        };
      });
      const restoreConfirm = await evaluateScript(
        page,
        buildClickFileCheckpointRestoreScript(
          "agent-thread-file-checkpoint-restore-confirm",
        ),
      );
      assert(
        restoreConfirm?.ok === true,
        `确认恢复文件快照失败: ${JSON.stringify(restoreConfirm ?? null)}`,
      );
      await waitForCheck(options, "文件快照恢复成功", async () => {
        const value = await evaluateScript(
          page,
          buildFileCheckpointRestoreSuccessCheckScript(),
        );
        return {
          ok: value?.ok === true,
          value,
        };
      });
      const restoreDiagnostics = fixtureRuntime.getDiagnostics();
      const latestRestoreRequest =
        restoreDiagnostics.restoreFileCheckpointRequests[
          restoreDiagnostics.restoreFileCheckpointRequests.length - 1
        ] || null;
      assert(
        isExpectedFileCheckpointRestoreRequest(latestRestoreRequest),
        `文件快照恢复 payload 不符合预期: ${JSON.stringify(
          restoreDiagnostics,
        )}`,
      );
      await waitForCheck(options, "关闭文件快照对话框", async () => {
        const value = await evaluateScript(
          page,
          buildCloseFileCheckpointDialogScript(),
        );
        return {
          ok: value?.ok === true,
          value,
        };
      });
      await waitForCheck(options, "文件快照对话框关闭", async () => {
        const value = await evaluateScript(
          page,
          buildFileCheckpointDialogGoneCheckScript(),
        );
        return {
          ok: value?.ok === true,
          value,
        };
      });
    } catch (error) {
      const diagnostics = await collectRuntimeSmokeDiagnostics(
        page,
        fixtureRuntime,
      );
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(
        `${reason}\n[smoke:agent-runtime-tool-surface-page] diagnostics=${JSON.stringify(
          diagnostics,
        )}`,
      );
    }

    logStage("click-approval-approve");
    await waitForCheck(options, "权限确认允许按钮出现", async () => {
      const value = await evaluateScript(page, buildApprovalButtonCheckScript());
      return {
        ok: value?.ok === true,
        value,
      };
    });
    await page.getByRole("button", { name: /允许并继续/ }).first().click();
    let approvalResponseDiagnostics = null;
    try {
      approvalResponseDiagnostics = await waitForCheck(
        options,
        "权限确认响应提交到 DevBridge",
        async () => {
          const diagnostics = fixtureRuntime.getDiagnostics();
          const latestRequest =
            diagnostics.respondActionRequests[
              diagnostics.respondActionRequests.length - 1
            ] || null;
          return {
            ok:
              diagnostics.commandCounts.agent_runtime_respond_action > 0 &&
              isExpectedApprovalResponseRequest(latestRequest),
            value: {
              latestRequest,
              diagnostics,
            },
          };
        },
      );
    } catch (error) {
      const diagnostics = await collectRuntimeSmokeDiagnostics(
        page,
        fixtureRuntime,
      );
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(
        `${reason}\n[smoke:agent-runtime-tool-surface-page] diagnostics=${JSON.stringify(
          diagnostics,
        )}`,
      );
    }
    assert(
      isExpectedApprovalResponseRequest(
        approvalResponseDiagnostics?.latestRequest,
      ),
      `权限确认响应 payload 不符合预期: ${JSON.stringify(
        approvalResponseDiagnostics ?? null,
      )}`,
    );

    logStage("read-page-text");
    const pageText = await readPageText(page);
    for (const warning of FORBIDDEN_PAGE_WARNINGS) {
      assert(
        !pageText.includes(warning),
        `真实页面仍出现不应存在的页级告警: ${warning}`,
      );
    }

    console.log("[smoke:agent-runtime-tool-surface-page] 通过");
    console.log(
      `[smoke:agent-runtime-tool-surface-page] summary=${JSON.stringify(summaryFlags)}`,
    );
  } finally {
    await context?.close().catch(() => undefined);
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
