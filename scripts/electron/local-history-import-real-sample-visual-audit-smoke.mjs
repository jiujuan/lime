#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import electronPath from "electron";
import { _electron as electron } from "playwright";
import {
  assert,
  createTempRuntimeEnv,
  initializeAppServer,
  inspectImportedConversationVisualState,
  invokeAppServerFromPage,
  openSessionFromSidebar,
  sanitizeJson,
  sanitizeText,
  waitForRendererReady,
  writeJsonFile,
} from "./lib/local-history-import-smoke-utils.mjs";
import { resolveElectronAppServerRuntimeEnv } from "../lib/electron-app-server-assets.mjs";
import { resolveDevAppServerBinary } from "../lib/electron-dev-sidecar.mjs";

const DEFAULT_PROJECT_PATH = path.join(
  os.homedir(),
  "Documents",
  "dev",
  "ai",
  "limecloud",
  "content-studio",
);

const DEFAULTS = {
  appUrl: "",
  projectPath:
    process.env.CODEX_IMPORT_SMOKE_PROJECT_PATH || DEFAULT_PROJECT_PATH,
  sourceRoot:
    process.env.CODEX_IMPORT_SMOKE_SOURCE_ROOT ||
    process.env.CODEX_HOME ||
    path.join(os.homedir(), ".codex"),
  evidenceDir: path.join(
    process.cwd(),
    ".lime",
    "qc",
    "gui-evidence",
    "local-history-import-real-sample-visual-audit",
  ),
  prefix: "local-history-import-real-sample-visual-audit",
  timeoutMs: 240_000,
  previewTimeoutMs: 60_000,
  commitTimeoutMs: 180_000,
  keepTemp: false,
};

const LOG_PREFIX = "[smoke:local-history-import-real-sample-visual-audit]";
const SOURCE_CLIENT = "codex";
const VIEWPORTS = [
  { label: "desktop", width: 1440, height: 1000 },
  { label: "compact", width: 1100, height: 820 },
  { label: "narrow", width: 820, height: 900 },
];
const SCROLL_POSITIONS = ["top", "middle", "bottom"];
const RPC_ID_PREFIX = "local-history-import-real-sample-visual-audit";

function printHelp() {
  console.log(`
Local History Import Real Sample Visual Audit Smoke

用途:
  启动真实 Electron Desktop Host，从真实 content-studio 本地历史源只读
  scan/preview，选择最长/最复杂的一条历史线程导入到隔离 App Server，
  再从侧边栏打开该会话，检查长历史 GUI 在多视口与滚动位置下可读、
  输入框可用、导入细节可见，并确认普通 GUI 不泄漏 source path、
  source thread id 或 raw rollout event 字段。

边界:
  只读读取 sourceRoot；App Server / Electron user data 均使用临时目录；
  不调用正式模型，不写回源目录，不使用 renderer mock fallback。

用法:
  node scripts/electron/local-history-import-real-sample-visual-audit-smoke.mjs

选项:
  --app-url <url>        可选 renderer dev server，例如 http://127.0.0.1:1420/
  --project-path <path>  真实项目路径，默认 content-studio
  --source-root <path>   本地历史源目录，默认 CODEX_HOME 或 ~/.codex
  --evidence-dir <path>  证据目录
  --prefix <name>        证据文件前缀
  --timeout-ms <ms>      总超时，默认 240000
  --preview-timeout-ms <ms> preview 超时，默认 60000
  --commit-timeout-ms <ms> commit 超时，默认 180000
  --keep-temp            保留临时目录便于调试
  -h, --help             显示帮助
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
    if (arg === "--app-url" && next) {
      options.appUrl = next.trim();
      index += 1;
      continue;
    }
    if (arg === "--project-path" && next) {
      options.projectPath = path.resolve(next.trim());
      index += 1;
      continue;
    }
    if (arg === "--source-root" && next) {
      options.sourceRoot = path.resolve(next.trim());
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
    if (arg === "--preview-timeout-ms" && next) {
      options.previewTimeoutMs = Number(next);
      index += 1;
      continue;
    }
    if (arg === "--commit-timeout-ms" && next) {
      options.commitTimeoutMs = Number(next);
      index += 1;
      continue;
    }
    if (arg === "--keep-temp") {
      options.keepTemp = true;
      continue;
    }
    throw new Error(`未知参数: ${arg}`);
  }

  for (const [key, min] of [
    ["timeoutMs", 60_000],
    ["previewTimeoutMs", 10_000],
    ["commitTimeoutMs", 30_000],
  ]) {
    if (!Number.isFinite(options[key]) || options[key] < min) {
      throw new Error(
        `--${key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)} 必须是 >= ${min} 的数字`,
      );
    }
  }
  if (!options.evidenceDir || !options.prefix) {
    throw new Error("--evidence-dir / --prefix 均不能为空");
  }
  return options;
}

function numericScore(value, keyHint = "") {
  if (typeof value === "number" && Number.isFinite(value)) {
    return keyHint.match(
      /command|tool|patch|approval|search|reasoning|attachment/i,
    )
      ? value * 80
      : value;
  }
  if (!value || typeof value !== "object") {
    return 0;
  }
  if (Array.isArray(value)) {
    return value.reduce((sum, item) => sum + numericScore(item, keyHint), 0);
  }
  return Object.entries(value).reduce(
    (sum, [key, item]) => sum + numericScore(item, key),
    0,
  );
}

function scorePreview(preview) {
  const summary = preview.summary || {};
  const dryRun = summary.dryRun || {};
  return (
    Number(summary.lineCount || 0) +
    Number(summary.messageCount || 0) * 20 +
    Number(dryRun.willImportTimelineItems || 0) * 5 +
    Number(dryRun.willImportAttachments || 0) * 200 +
    numericScore(summary.fidelity || {})
  );
}

async function scanAndSelectThread(page, options) {
  const scan = await invokeAppServerFromPage(
    page,
    "conversationImport/source/scan",
    {
      sourceClient: SOURCE_CLIENT,
      sourceRoot: options.sourceRoot,
      projectPath: options.projectPath,
      includeArchived: false,
      limit: 30,
    },
    { idPrefix: RPC_ID_PREFIX, timeoutMs: options.previewTimeoutMs },
  );
  const threads = Array.isArray(scan.result.threads) ? scan.result.threads : [];
  assert(scan.result.source?.status === "ready", "真实本地历史源不可读");
  assert(threads.length > 0, "未扫描到 content-studio 可导入历史线程");

  const previews = [];
  for (const thread of threads) {
    const preview = await invokeAppServerFromPage(
      page,
      "conversationImport/thread/preview",
      {
        sourceClient: SOURCE_CLIENT,
        sourceRoot: options.sourceRoot,
        sourceThreadId: thread.sourceThreadId,
        sourcePath: thread.sourcePath,
        limit: 120,
      },
      { idPrefix: RPC_ID_PREFIX, timeoutMs: options.previewTimeoutMs },
    );
    previews.push({
      thread,
      preview: preview.result,
      score: scorePreview(preview.result),
    });
  }

  previews.sort((left, right) => right.score - left.score);
  return {
    scan: scan.result,
    previews,
    selected: previews[0],
  };
}

async function commitSelectedThread(page, options, selected) {
  const commit = await invokeAppServerFromPage(
    page,
    "conversationImport/thread/commit",
    {
      sourceClient: SOURCE_CLIENT,
      sourceRoot: options.sourceRoot,
      sourceThreadId: selected.thread.sourceThreadId,
      sourcePath: selected.thread.sourcePath,
      appId: "content-studio",
      confirmed: true,
    },
    { idPrefix: RPC_ID_PREFIX, timeoutMs: options.commitTimeoutMs },
  );
  assert(commit.result?.session?.sessionId, "导入结果缺少 sessionId");
  assert(commit.result?.canContinue === true, "导入会话不可继续");
  return commit.result;
}

function contentTextFromMessage(message) {
  return (Array.isArray(message?.content) ? message.content : [])
    .map((part) => (typeof part?.text === "string" ? part.text : ""))
    .join("")
    .trim();
}

function summarizeReadModel(readResult) {
  const detail = readResult?.detail || {};
  const executionRuntime =
    detail && typeof detail === "object"
      ? detail.execution_runtime || detail.executionRuntime || null
      : null;
  const messages = Array.isArray(detail.messages) ? detail.messages : [];
  const items = Array.isArray(detail.items) ? detail.items : [];
  const itemCounts = items.reduce((counts, item) => {
    const type = String(item?.type || "unknown");
    counts[type] = (counts[type] || 0) + 1;
    return counts;
  }, {});
  const attachmentMessages = messages.filter(
    (message) =>
      Array.isArray(message.attachments) && message.attachments.length > 0,
  ).length;

  return {
    sessionId: readResult?.session?.sessionId || null,
    title: readResult?.session?.title || readResult?.session?.name || null,
    messagesLength: messages.length,
    itemsLength: items.length,
    itemCounts,
    attachmentMessages,
    hasUserMessage: messages.some((message) => message.role === "user"),
    hasAssistantMessage: messages.some(
      (message) => message.role === "assistant",
    ),
    executionRuntime: executionRuntime
      ? sanitizeJson({
          sourceClient:
            executionRuntime.source_client ||
            executionRuntime.sourceClient ||
            null,
          hasImportedThreadSettings: Boolean(
            executionRuntime.imported_thread_settings ||
            executionRuntime.importedThreadSettings,
          ),
          hasImportedContinuation: Boolean(
            executionRuntime.imported_continuation ||
            executionRuntime.importedContinuation,
          ),
          source: executionRuntime.source || null,
        })
      : null,
    excerpts: messages
      .map(contentTextFromMessage)
      .filter((text) => text.length >= 12)
      .slice(0, 8)
      .map((text) => text.slice(0, 80)),
  };
}

async function readImportedSession(page, options, sessionId) {
  const read = await invokeAppServerFromPage(
    page,
    "agentSession/read",
    {
      sessionId,
      historyLimit: 500,
    },
    { idPrefix: RPC_ID_PREFIX, timeoutMs: options.previewTimeoutMs },
  );
  const summary = summarizeReadModel(read.result);
  assert(summary.hasUserMessage, "read model 缺少导入用户消息");
  assert(summary.hasAssistantMessage, "read model 缺少导入助手消息");
  assert(
    summary.messagesLength >= 4,
    "真实样本导入消息数过少，无法做长历史审计",
  );
  assert(
    summary.itemsLength >= 4,
    "真实样本导入 timeline item 过少，无法做细节审计",
  );
  return {
    read: read.result,
    summary,
  };
}

function buildForbiddenSourceLeakTokens({
  sourceRoot,
  sourceThreadId,
  sourcePath,
}) {
  return [
    sourceRoot,
    sourcePath,
    sourceThreadId,
    "state_5.sqlite",
    "event_msg",
    "response_item",
    "source_client",
    "sourceThreadId",
    "sourcePath",
    "rollout_path",
    "Approve Codex command",
    "Codex 导入",
  ]
    .filter((value) => typeof value === "string" && value.trim().length > 0)
    .map((value) => value.trim());
}

function summarizeCommitResult(commit) {
  return {
    sessionId: commit?.session?.sessionId || null,
    threadId: commit?.thread?.threadId || null,
    title: commit?.thread?.title || commit?.session?.title || null,
    canContinue: commit?.canContinue === true,
    importStatus: commit?.importStatus || null,
  };
}

function sanitizeOpenSnapshot(snapshot) {
  if (!snapshot) {
    return null;
  }
  return sanitizeJson({
    url: snapshot.url,
    title: snapshot.title,
    bodyTextLength: snapshot.bodyTextLength,
    textareaVisible: snapshot.textareaVisible,
    textareaDisabled: snapshot.textareaDisabled,
    textareaSessionId: snapshot.textareaSessionId,
    sidebarVisible: snapshot.sidebarVisible,
    conversationRowCount: Array.isArray(snapshot.conversationRows)
      ? snapshot.conversationRows.length
      : 0,
  });
}

function assertVisualAudits(audits, readSummary, openSnapshot) {
  assert(
    audits.length === VIEWPORTS.length * SCROLL_POSITIONS.length,
    "视觉审计截图数量不完整",
  );
  assert(openSnapshot?.textareaVisible, "导入会话打开后输入框不可见");
  assert(
    openSnapshot?.textareaDisabled === false,
    "导入会话打开后输入框不可用",
  );
  assert(
    openSnapshot?.textareaSessionId === readSummary.sessionId,
    "导入会话打开后输入框 session 未绑定目标会话",
  );
  for (const audit of audits) {
    assert(audit.targetSessionVisible, `${audit.label} 未停留在目标 session`);
    assert(audit.visibleTextCaptured, `${audit.label} GUI 可见文本为空`);
    assert(audit.messageListVisible, `${audit.label} 消息列表不可见`);
    assert(
      !audit.importedBannerVisible,
      `${audit.label} 不应展示导入主线 banner`,
    );
    assert(
      !audit.importedRunControlVisible,
      `${audit.label} 不应展示导入运行控制卡`,
    );
    assert(
      audit.leakedTokens.length === 0,
      `${audit.label} 暴露了 source 内部字段: ${audit.leakedTokens.join(", ")}`,
    );
  }
  if ((readSummary.itemCounts.command_execution || 0) > 0) {
    assert(
      audits.some((audit) => audit.hasCommandRecordVisible),
      "真实样本 GUI 未展示导入命令记录",
    );
  }
  if ((readSummary.itemCounts.patch || 0) > 0) {
    assert(
      audits.some((audit) => audit.hasPatchText),
      "真实样本 GUI 未展示补丁记录",
    );
  }
  if ((readSummary.itemCounts.web_search || 0) > 0) {
    assert(
      audits.some((audit) => audit.hasSearchEvidence),
      "真实样本 GUI 未展示搜索记录",
    );
  }
  if ((readSummary.itemCounts.approval_request || 0) > 0) {
    assert(
      audits.some((audit) => audit.hasApprovalText),
      "真实样本 GUI 未展示审批记录",
    );
  }
}

function runtimeDetailFailure(message, snapshot) {
  return new Error(
    `${message}: ${JSON.stringify(sanitizeJson(snapshot ?? null))}`,
  );
}

async function readRuntimeEventsProbe(page, options, sessionId) {
  if (!sessionId) {
    return { ok: false, skipped: true, reason: "missing-session-id" };
  }
  try {
    const response = await invokeAppServerFromPage(
      page,
      "conversationImport/thread/runtimeEvents/read",
      {
        sessionId,
        offset: 0,
        limit: 5,
      },
      { idPrefix: RPC_ID_PREFIX, timeoutMs: options.previewTimeoutMs },
    );
    const result = response.result || {};
    return sanitizeJson({
      ok: true,
      totalEvents: result.totalEvents,
      sourceRuntimeEvents: result.sourceRuntimeEvents,
      materializedRuntimeEvents: result.materializedRuntimeEvents,
      sidecarRuntimeEvents: result.sidecarRuntimeEvents,
      eventCount: Array.isArray(result.events) ? result.events.length : null,
      eventTypes: Array.isArray(result.events)
        ? result.events
            .map((event) => event?.eventType)
            .filter(Boolean)
            .slice(0, 12)
        : [],
      hasProjection: Boolean(result.projection),
      nextOffset: result.nextOffset ?? null,
    });
  } catch (error) {
    return sanitizeJson({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function captureRuntimeDetailDomSnapshot(page, forbiddenTokens) {
  return sanitizeJson(
    await page.evaluate((tokens) => {
      const textOf = (element) =>
        element instanceof HTMLElement ? element.innerText || "" : "";
      const preview = (value, maxLength = 1200) =>
        typeof value === "string" && value.length > maxLength
          ? `${value.slice(0, maxLength)}... [truncated ${value.length - maxLength} chars]`
          : value || "";
      const panel = document.querySelector(
        '[data-testid="imported-runtime-detail-panel"]',
      );
      const body = document.querySelector(
        '[data-testid="imported-runtime-detail-body"]',
      );
      const toggle = document.querySelector(
        '[data-testid="imported-runtime-detail-toggle"]',
      );
      const eventsContainer = document.querySelector(
        '[data-testid="imported-runtime-detail-events"]',
      );
      const loading = document.querySelector(
        '[data-testid="imported-runtime-detail-loading"]',
      );
      const error = document.querySelector(
        '[data-testid="imported-runtime-detail-error"]',
      );
      const empty = document.querySelector(
        '[data-testid="imported-runtime-detail-empty"]',
      );
      const events = Array.from(
        document.querySelectorAll(
          '[data-testid="imported-runtime-detail-event"]',
        ),
      );
      const payloads = Array.from(
        document.querySelectorAll(
          '[data-testid="imported-runtime-detail-event-payload"]',
        ),
      );
      const panelText = textOf(panel);
      const bodyText = textOf(body);
      const allButtons = Array.from(document.querySelectorAll("button"))
        .map((button) => textOf(button).trim())
        .filter(Boolean)
        .slice(-30);
      const popover = document.querySelector(
        '[data-testid="task-center-environment-popover"]',
      );
      return {
        url: window.location.href,
        bodyTextLength: document.body?.innerText?.length || 0,
        bodyTextPreview: preview(document.body?.innerText || "", 1600),
        panelVisible: panel instanceof HTMLElement,
        bodyVisible: body instanceof HTMLElement,
        panelTextLength: panelText.length,
        panelTextPreview: preview(panelText),
        detailBodyTextLength: bodyText.length,
        detailBodyTextPreview: preview(bodyText),
        summaryText:
          body instanceof HTMLElement ? preview(bodyText.split("\n")[0] || "") : "",
        toggleVisible: toggle instanceof HTMLElement,
        toggleText: textOf(toggle).trim(),
        toggleAriaExpanded:
          toggle instanceof HTMLElement
            ? toggle.getAttribute("aria-expanded")
            : null,
        eventsContainerVisible: eventsContainer instanceof HTMLElement,
        loadingVisible: loading instanceof HTMLElement,
        loadingText: textOf(loading).trim(),
        errorVisible: error instanceof HTMLElement,
        errorText: textOf(error).trim(),
        emptyVisible: empty instanceof HTMLElement,
        emptyText: textOf(empty).trim(),
        eventCount: events.length,
        eventKinds: events
          .map((event) => event.getAttribute("data-event-kind"))
          .filter(Boolean),
        eventTextPreviews: events
          .map((event) => preview(textOf(event), 500))
          .filter(Boolean)
          .slice(0, 8),
        hasFacts: Boolean(
          document.querySelector(
            '[data-testid="imported-runtime-detail-event-facts"]',
          ),
        ),
        hasPayloadPreview: payloads.length > 0,
        payloadPreviewCount: payloads.length,
        hasSemanticTitle:
          panelText.includes("命令") ||
          panelText.includes("工具") ||
          panelText.includes("搜索") ||
          panelText.includes("思考") ||
          panelText.includes("补丁") ||
          panelText.includes("权限") ||
          panelText.includes("Command") ||
          panelText.includes("Tool") ||
          panelText.includes("Search") ||
          panelText.includes("Reasoning") ||
          panelText.includes("Patch") ||
          panelText.includes("Approval"),
        hasSourceSummary:
          panelText.includes("已默认展示") ||
          panelText.includes("shown by default") ||
          panelText.includes("完整来源记录") ||
          panelText.includes("full source records"),
        leakedTokens: tokens.filter(
          (token) => token && panelText.includes(token),
        ),
        rawFieldLeaks: [
          "sourceThreadId",
          "sourcePath",
          "threadId",
          "sessionId",
          "rollout_path",
        ].filter((token) => panelText.includes(token)),
        popoverVisible: popover instanceof HTMLElement,
        popoverTextPreview: preview(textOf(popover), 1200),
        recentButtonLabels: allButtons,
      };
    }, forbiddenTokens),
  );
}

async function inspectImportedRuntimeDetailDrilldown(
  page,
  options,
  forbiddenTokens,
  sessionId,
  onSnapshot,
) {
  const recordSnapshot = (snapshot) => {
    const sanitized = sanitizeJson(snapshot);
    onSnapshot?.(sanitized);
    return sanitized;
  };
  const runtimeEventsProbe = await readRuntimeEventsProbe(
    page,
    options,
    sessionId,
  );
  recordSnapshot({ phase: "runtime-events-probe", runtimeEventsProbe });

  const environmentOpened = await page.evaluate(() => {
    const trigger = document.querySelector(
      '[data-testid="task-center-environment-trigger"]',
    );
    if (!(trigger instanceof HTMLElement)) {
      return { clicked: false, reason: "missing-environment-trigger" };
    }
    trigger.click();
    return { clicked: true };
  });
  recordSnapshot({
    phase: "environment-open",
    environmentOpened,
    runtimeEventsProbe,
  });
  assert(
    environmentOpened?.clicked,
    `真实样本 GUI 未提供环境信息入口: ${JSON.stringify(
      sanitizeJson({ environmentOpened, runtimeEventsProbe }),
    )}`,
  );

  const popoverOpenedAt = Date.now();
  let popoverVisible = false;
  let popoverSnapshot = null;
  while (Date.now() - popoverOpenedAt < options.previewTimeoutMs) {
    popoverSnapshot = await page.evaluate(() => {
      const popover = document.querySelector(
        '[data-testid="task-center-environment-popover"]',
      );
      const text = popover instanceof HTMLElement ? popover.innerText || "" : "";
      return {
        visible: popover instanceof HTMLElement,
        textLength: text.length,
        textPreview: text.slice(0, 1200),
        buttonLabels: Array.from(popover?.querySelectorAll("button") || [])
          .map((button) =>
            button instanceof HTMLElement ? button.innerText.trim() : "",
          )
          .filter(Boolean)
          .slice(0, 20),
      };
    });
    popoverVisible = popoverSnapshot?.visible === true;
    if (popoverVisible) {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  recordSnapshot({
    phase: "environment-popover",
    popoverSnapshot,
    runtimeEventsProbe,
  });
  assert(
    popoverVisible,
    `真实样本 GUI 环境信息面板未打开: ${JSON.stringify(
      sanitizeJson({ popoverSnapshot, runtimeEventsProbe }),
    )}`,
  );

  let opened = null;
  const toggleWaitStartedAt = Date.now();
  while (Date.now() - toggleWaitStartedAt < options.previewTimeoutMs) {
    opened = await page.evaluate(() => {
      const toggle = document.querySelector(
        '[data-testid="imported-runtime-detail-toggle"]',
      );
      if (!(toggle instanceof HTMLElement)) {
        const popover = document.querySelector(
          '[data-testid="task-center-environment-popover"]',
        );
        const popoverText =
          popover instanceof HTMLElement ? popover.innerText || "" : "";
        return {
          clicked: false,
          reason: "missing-toggle",
          popoverTextLength: popoverText.length,
          popoverTextPreview: popoverText.slice(0, 500),
          hasSourcesSection: Boolean(
            document.querySelector(
              '[data-testid="task-center-run-control-sources"]',
            ),
          ),
          hasRunControlSurface: Boolean(
            document.querySelector(
              '[data-testid="task-center-run-control-surface"]',
            ),
          ),
          taskRailItemCount: document.querySelectorAll(
            '[data-testid="task-center-task-rail-item"]',
          ).length,
          environmentSectionCount: document.querySelectorAll(
            '[data-testid^="task-center-run-control-"]',
          ).length,
          buttonLabels: Array.from(popover?.querySelectorAll("button") || [])
            .map((button) =>
              button instanceof HTMLElement ? button.innerText.trim() : "",
            )
            .filter(Boolean)
            .slice(0, 20),
        };
      }
      toggle.click();
      return { clicked: true };
    });
    if (opened?.clicked) {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  recordSnapshot({
    phase: "detail-toggle",
    opened,
    runtimeEventsProbe,
  });
  assert(
    opened?.clicked,
    `真实样本 GUI 未提供完整记录下钻入口: ${JSON.stringify(
      sanitizeJson({ opened, runtimeEventsProbe }),
    )}`,
  );

  const startedAt = Date.now();
  let snapshot = null;
  let lastPanelSnapshot = null;
  let lastErrorSnapshot = null;
  while (Date.now() - startedAt < options.previewTimeoutMs) {
    snapshot = {
      ...(await captureRuntimeDetailDomSnapshot(page, forbiddenTokens)),
      phase: "detail-panel",
      runtimeEventsProbe,
    };
    recordSnapshot(snapshot);
    if (snapshot?.panelVisible) {
      lastPanelSnapshot = snapshot;
    }
    if (snapshot?.errorVisible) {
      lastErrorSnapshot = snapshot;
      break;
    }
    if (
      snapshot?.panelVisible &&
      snapshot.bodyVisible &&
      snapshot.eventCount > 0 &&
      snapshot.hasPayloadPreview
    ) {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  if (lastErrorSnapshot) {
    throw runtimeDetailFailure("完整记录读取失败", lastErrorSnapshot);
  }
  if (!snapshot?.panelVisible) {
    throw runtimeDetailFailure("完整记录下钻面板不可见", lastPanelSnapshot || snapshot);
  }
  if (!snapshot?.bodyVisible) {
    throw runtimeDetailFailure("完整记录下钻内容不可见", snapshot);
  }
  if (!(snapshot?.eventCount > 0)) {
    throw runtimeDetailFailure("完整记录下钻没有渲染事件卡片", snapshot);
  }
  if (!(snapshot?.eventKinds.length > 0)) {
    throw runtimeDetailFailure("完整记录事件卡片缺少语义 kind", snapshot);
  }
  if (!snapshot?.hasFacts) {
    throw runtimeDetailFailure("完整记录事件卡片缺少事实摘要", snapshot);
  }
  if (!snapshot?.hasPayloadPreview) {
    throw runtimeDetailFailure("完整记录事件卡片缺少原始负载预览", snapshot);
  }
  if (!snapshot?.hasSemanticTitle) {
    throw runtimeDetailFailure("完整记录事件卡片缺少可读语义标题", snapshot);
  }
  if (!snapshot?.hasSourceSummary) {
    throw runtimeDetailFailure("完整记录下钻缺少来源规模摘要", snapshot);
  }
  assert(
    snapshot.leakedTokens.length === 0,
    `完整记录下钻暴露了 source 内部字段: ${JSON.stringify(
      sanitizeJson(snapshot),
    )}`,
  );
  assert(
    snapshot.rawFieldLeaks.length === 0,
    `完整记录下钻暴露了 raw 字段名: ${JSON.stringify(sanitizeJson(snapshot))}`,
  );
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await page.evaluate(() => {
    const trigger = document.querySelector(
      '[data-testid="task-center-environment-trigger"]',
    );
    const popover = document.querySelector(
      '[data-testid="task-center-environment-popover"]',
    );
    if (trigger instanceof HTMLElement && popover instanceof HTMLElement) {
      trigger.click();
    }
  });
  return sanitizeJson(snapshot);
}

async function run() {
  const options = parseArgs(process.argv.slice(2));
  assert(
    fs.existsSync(options.projectPath),
    `项目路径不存在: ${options.projectPath}`,
  );
  assert(
    fs.existsSync(options.sourceRoot),
    `本地历史源不存在: ${options.sourceRoot}`,
  );
  fs.mkdirSync(options.evidenceDir, { recursive: true });

  const summaryPath = path.join(
    options.evidenceDir,
    `${options.prefix}-summary.json`,
  );
  const rawPath = path.join(options.evidenceDir, `${options.prefix}-raw.json`);
  const screenshotDir = path.join(options.evidenceDir, "screenshots");
  fs.mkdirSync(screenshotDir, { recursive: true });

  const runtimeEnv = createTempRuntimeEnv(
    options.sourceRoot,
    "local-history-real-sample-audit-",
  );
  const appServerBinary = resolveDevAppServerBinary({
    env: runtimeEnv.env,
    repoRoot: process.cwd(),
    forceBuild: false,
  });
  const appServerEnv = resolveElectronAppServerRuntimeEnv({
    env: {
      ...runtimeEnv.env,
      APP_SERVER_BIN: appServerBinary,
    },
  });
  const summary = {
    ok: false,
    checkedAt: new Date().toISOString(),
    projectPath: options.projectPath,
    sourceRoot: options.keepTemp ? options.sourceRoot : "[source-root]",
    appUrl: options.appUrl || null,
    tempRoot: options.keepTemp ? runtimeEnv.tempRoot : null,
    electronUserDataDir: options.keepTemp
      ? runtimeEnv.electronUserDataDir
      : null,
    appServerBinary,
    selectedThread: null,
    readModelSummary: null,
    visualAudit: null,
    consoleErrors: [],
    rawEvidence: rawPath,
    summary: summaryPath,
  };

  let app = null;
  let page = null;
  const rendererSnapshots = [];
  const consoleErrors = [];
  let scanSelection = null;
  let commit = null;
  let readModel = null;
  let openSnapshot = null;
  let visualAudits = [];
  let runtimeDetailDrilldown = null;
  const runtimeDetailDrilldownSnapshots = [];

  try {
    console.log(`${LOG_PREFIX} stage=launch-electron`);
    app = await electron.launch({
      executablePath: electronPath,
      args: ["--use-mock-keychain", "."],
      cwd: process.cwd(),
      env: {
        ...runtimeEnv.env,
        ...appServerEnv,
        APP_SERVER_BACKEND_MODE: "unavailable",
        ELECTRON_E2E_USER_DATA_DIR: runtimeEnv.electronUserDataDir,
        LIME_ELECTRON_E2E: "1",
        LIME_ELECTRON_BRAND_DEV_APP: "0",
        LIME_ELECTRON_CLEAR_RENDERER_CACHE: "0",
        LIME_ELECTRON_DEV_HTTP_BRIDGE: "0",
        ...(options.appUrl ? { VITE_DEV_SERVER_URL: options.appUrl } : {}),
      },
      timeout: options.timeoutMs,
    });
    app.on("console", (message) => {
      if (message.type() === "error") {
        consoleErrors.push(sanitizeText(message.text()));
      }
    });

    page = await app.firstWindow({ timeout: options.timeoutMs });
    page.setDefaultTimeout(options.timeoutMs);
    await page.setViewportSize({ width: 1440, height: 1000 });

    console.log(`${LOG_PREFIX} stage=wait-renderer`);
    await waitForRendererReady(page, options, (snapshot) => {
      rendererSnapshots.push(sanitizeJson(snapshot));
    });
    await initializeAppServer(
      page,
      {
        name: "local-history-import-real-sample-visual-audit",
        version: "1.0.0",
      },
      { eventMethods: ["agentSession/event"] },
    );

    console.log(`${LOG_PREFIX} stage=scan-preview-real-source`);
    scanSelection = await scanAndSelectThread(page, options);
    const selected = scanSelection.selected;
    summary.selectedThread = sanitizeJson({
      sourceThreadId: selected.thread.sourceThreadId,
      title: selected.thread.title,
      cwd: selected.thread.cwd,
      sourcePath: options.keepTemp
        ? selected.thread.sourcePath
        : "[source-path]",
      score: selected.score,
      lineCount: selected.preview.summary?.lineCount,
      messageCount: selected.preview.summary?.messageCount,
      dryRun: selected.preview.summary?.dryRun,
      fidelity: selected.preview.summary?.fidelity,
    });

    console.log(`${LOG_PREFIX} stage=commit-selected-thread`);
    commit = await commitSelectedThread(page, options, selected);
    readModel = await readImportedSession(
      page,
      options,
      commit.session.sessionId,
    );
    summary.readModelSummary = sanitizeJson(readModel.summary);

    console.log(`${LOG_PREFIX} stage=reload-and-open-gui-session`);
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForRendererReady(page, options, (snapshot) => {
      rendererSnapshots.push(sanitizeJson(snapshot));
    });
    openSnapshot = await openSessionFromSidebar(page, options, {
      title:
        commit.thread.title ||
        selected.thread.title ||
        readModel.summary.title ||
        readModel.summary.excerpts[0] ||
        commit.session.sessionId,
      sessionId: commit.session.sessionId,
    });

    console.log(`${LOG_PREFIX} stage=collect-real-sample-visual-audit`);
    const forbiddenTokens = buildForbiddenSourceLeakTokens({
      sourceRoot: options.sourceRoot,
      sourceThreadId: selected.thread.sourceThreadId,
      sourcePath: selected.thread.sourcePath,
    });
    runtimeDetailDrilldown = await inspectImportedRuntimeDetailDrilldown(
      page,
      options,
      forbiddenTokens,
      commit.session.sessionId,
      (snapshot) => {
        runtimeDetailDrilldownSnapshots.push(snapshot);
      },
    );
    for (const viewport of VIEWPORTS) {
      for (const position of SCROLL_POSITIONS) {
        const screenshotPath = path.join(
          screenshotDir,
          `${options.prefix}-${viewport.label}-${position}.png`,
        );
        const audit = await inspectImportedConversationVisualState(page, {
          options,
          viewport,
          position,
          sessionId: commit.session.sessionId,
          sessionTitle:
            commit.thread.title ||
            selected.thread.title ||
            readModel.summary.title ||
            readModel.summary.excerpts[0] ||
            commit.session.sessionId,
          forbiddenTokens,
          screenshotPath,
        });
        visualAudits.push(audit);
      }
    }
    assertVisualAudits(visualAudits, readModel.summary, openSnapshot);
    assert(
      consoleErrors.length === 0,
      `观察到 console error: ${consoleErrors.join(" | ")}`,
    );

    writeJsonFile(
      rawPath,
      sanitizeJson({
        rendererSnapshots,
        scan: scanSelection.scan,
        previewScores: scanSelection.previews.map((item) => ({
          sourceThreadId: item.thread.sourceThreadId,
          title: item.thread.title,
          score: item.score,
          summary: item.preview.summary,
        })),
        commit: summarizeCommitResult(commit),
        readModelSummary: readModel.summary,
        openSnapshot: sanitizeOpenSnapshot(openSnapshot),
        runtimeDetailDrilldown,
        runtimeDetailDrilldownSnapshots,
        visualAudits,
      }),
    );

    summary.visualAudit = sanitizeJson(
      visualAudits.map((audit) => ({
        label: audit.label,
        screenshot: audit.screenshot,
        inputbarVisible: audit.inputbarVisible,
        inputbarDisabled: audit.inputbarDisabled,
        inputbarOccludesMainContent: audit.inputbarOccludesMainContent,
        messageListVisible: audit.messageListVisible,
        importedBannerVisible: audit.importedBannerVisible,
        importedRunControlVisible: audit.importedRunControlVisible,
        hasCommandRecordVisible: audit.hasCommandRecordVisible,
        hasPatchText: audit.hasPatchText,
        hasSearchEvidence: audit.hasSearchEvidence,
        hasApprovalText: audit.hasApprovalText,
        leakedTokens: audit.leakedTokens,
        scroll: audit.scroll,
      })),
    );
    summary.runtimeDetailDrilldown = runtimeDetailDrilldown;
    summary.runtimeDetailDrilldownSnapshots = sanitizeJson(
      runtimeDetailDrilldownSnapshots,
    );
    summary.consoleErrors = consoleErrors;
    summary.ok = true;
    summary.completedAt = new Date().toISOString();
    writeJsonFile(summaryPath, summary);
    console.log(`${LOG_PREFIX} summary=${summaryPath}`);
  } catch (error) {
    summary.error = error instanceof Error ? error.message : String(error);
    summary.consoleErrors = consoleErrors;
    summary.runtimeDetailDrilldown = runtimeDetailDrilldown;
    summary.runtimeDetailDrilldownSnapshots = sanitizeJson(
      runtimeDetailDrilldownSnapshots,
    );
    writeJsonFile(summaryPath, summary);
    writeJsonFile(
      rawPath,
      sanitizeJson({
        rendererSnapshots,
        scan: scanSelection?.scan || null,
        selectedThread: summary.selectedThread,
        commit: summarizeCommitResult(commit),
        readModelSummary: readModel?.summary || null,
        openSnapshot: sanitizeOpenSnapshot(openSnapshot),
        runtimeDetailDrilldown,
        runtimeDetailDrilldownSnapshots,
        visualAudits,
        error: summary.error,
      }),
    );
    throw error;
  } finally {
    if (app) {
      await app.close().catch(() => undefined);
    }
    if (!options.keepTemp) {
      fs.rmSync(runtimeEnv.tempRoot, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 200,
      });
    }
  }
}

run().catch((error) => {
  console.error(
    `${LOG_PREFIX} failed: ${
      error instanceof Error ? error.message : String(error)
    }`,
  );
  process.exitCode = 1;
});
