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
  renderExpectedVisibleExcerptHtml,
  sanitizeJson,
  sanitizeText,
  waitForRendererReady,
  waitForConversationImportJob,
  writeJsonFile,
} from "./lib/local-history-import-smoke-utils.mjs";
import { resolveElectronAppServerRuntimeEnv } from "../lib/electron-app-server-assets.mjs";
import { resolveDevAppServerBinary } from "../lib/electron-dev-sidecar.mjs";
import {
  selectCompactExpectedMessages,
  selectCompactExpectedMessageTexts,
  summarizeCanonicalMessageRoleCounts,
} from "./lib/local-history-import-read-model-expectations.mjs";
import {
  DEFAULT_REAL_SAMPLE_STABILITY_MS,
  importSourceAgeMs,
  selectStableImportSourceThreads,
} from "./lib/local-history-import-source-selection.mjs";

const DEFAULT_PROJECT_PATH = process.cwd();
const DEFAULT_MAX_SOURCE_LINES = 5_000;
const DEFAULT_MAX_SOURCE_MESSAGES = 200;
const DEFAULT_MAX_SOURCE_ITEMS = 1_200;

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
  maxSourceLines: DEFAULT_MAX_SOURCE_LINES,
  maxSourceMessages: DEFAULT_MAX_SOURCE_MESSAGES,
  maxSourceItems: DEFAULT_MAX_SOURCE_ITEMS,
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
  启动真实 Electron Desktop Host，从真实 Codex 本地历史源只读
  scan/preview，在可审计预算内选择复杂度最高的一条历史线程导入到隔离 App Server，
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
  --project-path <path>  真实项目路径，默认当前工作区
  --source-root <path>   本地历史源目录，默认 CODEX_HOME 或 ~/.codex
  --evidence-dir <path>  证据目录
  --prefix <name>        证据文件前缀
  --timeout-ms <ms>      总超时，默认 240000
  --preview-timeout-ms <ms> preview 超时，默认 60000
  --commit-timeout-ms <ms> commit 超时，默认 180000
  --max-source-lines <n>  单条样本最大 rollout 行数，默认 ${DEFAULT_MAX_SOURCE_LINES}
  --max-source-messages <n> 单条样本最大消息数，默认 ${DEFAULT_MAX_SOURCE_MESSAGES}
  --max-source-items <n>  单条样本最大 timeline item 数，默认 ${DEFAULT_MAX_SOURCE_ITEMS}
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
    if (arg === "--max-source-lines" && next) {
      options.maxSourceLines = Number(next);
      index += 1;
      continue;
    }
    if (arg === "--max-source-messages" && next) {
      options.maxSourceMessages = Number(next);
      index += 1;
      continue;
    }
    if (arg === "--max-source-items" && next) {
      options.maxSourceItems = Number(next);
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
  for (const [key, min] of [
    ["maxSourceLines", 1],
    ["maxSourceMessages", 1],
    ["maxSourceItems", 1],
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

function previewWithinAuditBudget(preview, options) {
  const summary = preview?.summary || {};
  const dryRun = summary.dryRun || {};
  return (
    Number(summary.lineCount || 0) <= options.maxSourceLines &&
    Number(summary.messageCount || 0) <= options.maxSourceMessages &&
    Number(dryRun.willImportTimelineItems || 0) <= options.maxSourceItems
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
  assert(threads.length > 0, "未扫描到可导入 Codex 历史线程");
  const stableThreads = selectStableImportSourceThreads(
    threads,
    scan.result.source?.indexedAt,
  );
  assert(
    stableThreads.length > 0,
    `未扫描到至少 ${DEFAULT_REAL_SAMPLE_STABILITY_MS}ms 未变化的 Codex 历史线程`,
  );

  const previews = [];
  for (const thread of stableThreads) {
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

  const eligiblePreviews = previews.filter((item) =>
    previewWithinAuditBudget(item.preview, options),
  );
  assert(
    eligiblePreviews.length > 0,
    `未找到符合真实样本审计预算的历史线程: maxLines=${options.maxSourceLines}, maxMessages=${options.maxSourceMessages}, maxItems=${options.maxSourceItems}`,
  );
  eligiblePreviews.sort((left, right) => right.score - left.score);
  return {
    scan: scan.result,
    previews,
    stableThreadCount: stableThreads.length,
    eligibleCount: eligiblePreviews.length,
    selected: eligiblePreviews[0],
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
  const result = await waitForConversationImportJob(page, commit.result?.job, {
    idPrefix: RPC_ID_PREFIX,
    timeoutMs: options.commitTimeoutMs,
  });
  assert(result?.session?.sessionId, "导入结果缺少 sessionId");
  assert(result?.canContinue === true, "导入会话不可继续");
  return result;
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
  const turns = Array.isArray(detail.turns) ? detail.turns : [];
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
  const attachmentCount = messages.reduce(
    (count, message) =>
      count +
      (Array.isArray(message.attachments) ? message.attachments.length : 0),
    0,
  );
  const messageRoleCounts = messages.reduce((counts, message) => {
    const role = String(message?.role || "unknown");
    counts[role] = (counts[role] || 0) + 1;
    return counts;
  }, {});
  const agentMessagePhaseCounts = items
    .filter((item) => item?.type === "agent_message")
    .reduce((counts, item) => {
      const phase = String(item?.phase || "unphased")
        .trim()
        .toLowerCase();
      counts[phase] = (counts[phase] || 0) + 1;
      return counts;
    }, {});
  return {
    sessionId: readResult?.session?.sessionId || null,
    title: readResult?.session?.title || readResult?.session?.name || null,
    messagesLength: messages.length,
    itemsLength: items.length,
    itemCounts,
    attachmentMessages,
    attachmentCount,
    messageRoleCounts,
    canonicalMessageRoleCounts: summarizeCanonicalMessageRoleCounts(readResult),
    agentMessagePhaseCounts,
    turns: turns.map((turn) => ({
      id: String(turn?.id || ""),
      status: String(turn?.status || "unknown"),
      itemCounts: items
        .filter((item) => item?.turn_id === turn?.id)
        .reduce((counts, item) => {
          const type = String(item?.type || "unknown");
          counts[type] = (counts[type] || 0) + 1;
          return counts;
        }, {}),
    })),
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
      .filter((text) => text.length >= 12 && !text.startsWith("<image "))
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
    expectedMessages: selectCompactExpectedMessages(read.result).map(
      ({ itemId, turnId, role, phase }) => ({ itemId, turnId, role, phase }),
    ),
    expectedExcerptHtml: renderExpectedVisibleExcerptHtml(
      selectCompactExpectedMessageTexts(read.result),
    ),
  };
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
    messageListSessionId: snapshot.messageListSessionId,
    planDecisionHandled: snapshot.planDecisionHandled === true,
    sidebarVisible: snapshot.sidebarVisible,
    conversationRowCount: Array.isArray(snapshot.conversationRows)
      ? snapshot.conversationRows.length
      : 0,
  });
}

function assertVisualAudit(
  audit,
  readSummary,
  importSummary,
  expectedVisibleAgentMessages,
) {
  const virtualizedHistory =
    readSummary.itemsLength >= 100 || importSummary.willImportTurns >= 20;
  assert(audit.targetSessionVisible, `${audit.label} 未停留在目标 session`);
  assert(audit.visibleTextCaptured, `${audit.label} GUI 可见文本为空`);
  assert(audit.inputbarVisible, `${audit.label} 输入框不可见`);
  assert(!audit.inputbarDisabled, `${audit.label} 输入框不可用`);
  assert(
    !audit.inputbarOccludesMainContent,
    `${audit.label} 输入框遮挡消息主内容`,
  );
  assert(audit.messageListVisible, `${audit.label} 消息列表不可见`);
  assert(audit.messageContentVisible, `${audit.label} 消息正文未渲染`);
  assert(audit.layout?.toolbarVisible, `${audit.label} 顶部工具栏不可见`);
  assert(
    audit.layout?.messageViewportVisible,
    `${audit.label} 消息滚动视口不可见`,
  );
  assert(
    !audit.layout?.toolbarMessageViewportOverlap,
    `${audit.label} 顶部工具栏遮挡消息视口: ${JSON.stringify(audit.layout)}`,
  );
  assert(
    audit.messageContentTextLength > 0 && audit.messageContentChildCount > 0,
    `${audit.label} 消息正文为空`,
  );
  assert(
    !audit.importedBannerVisible,
    `${audit.label} 不应展示导入主线 banner`,
  );
  assert(
    !audit.importedRunControlVisible,
    `${audit.label} 不应展示导入运行控制卡`,
  );
  assert(
    !audit.sourceMetadataUiVisible,
    `${audit.label} 不应展示 source metadata/provenance UI`,
  );
  if (!virtualizedHistory) {
    assert(
      audit.missingExpectedExcerpts.length === 0,
      `${audit.label} 缺少 canonical message 正文: visible=${audit.missingExpectedExcerpts.length}, dom=${audit.missingExpectedDomExcerpts.length}`,
    );
    assert(
      readSummary.itemsLength === importSummary.willImportTimelineItems,
      `${audit.label} canonical Item 数不一致: read=${readSummary.itemsLength}, import=${importSummary.willImportTimelineItems}`,
    );
    assert(
      audit.turnGroupCount === importSummary.willImportTurns,
      `${audit.label} Turn 数不一致: GUI=${audit.turnGroupCount}, canonical=${importSummary.willImportTurns}`,
    );
    assert(
      audit.userMessageBubbleCount ===
        (readSummary.canonicalMessageRoleCounts.user || 0),
      `${audit.label} 用户消息数不一致: GUI=${audit.userMessageBubbleCount}, canonical=${readSummary.canonicalMessageRoleCounts.user || 0}`,
    );
    assert(
      audit.assistantMessageBubbleCount ===
        (readSummary.canonicalMessageRoleCounts.assistant || 0),
      `${audit.label} 助手消息数不一致: GUI=${audit.assistantMessageBubbleCount}, canonical=${readSummary.canonicalMessageRoleCounts.assistant || 0}`,
    );
  } else {
    assert(
      audit.turnGroupCount > 0 &&
        audit.turnGroupCount <= importSummary.willImportTurns,
      `${audit.label} 虚拟化历史窗口回合数异常: ${audit.turnGroupCount}`,
    );
    assert(
      audit.userMessageBubbleCount > 0 &&
        audit.userMessageBubbleCount <=
          (readSummary.canonicalMessageRoleCounts.user || 0),
      `${audit.label} 虚拟化历史窗口用户消息数异常: ${audit.userMessageBubbleCount}`,
    );
    assert(
      audit.assistantMessageBubbleCount > 0,
      `${audit.label} 虚拟化历史窗口没有可见助手正文/摘要`,
    );
  }
  assert(
    audit.toolCallRowCount === 0,
    `${audit.label} terminal 历史不应挂载工具行: ${audit.toolCallRowCount}`,
  );
  assert(
    audit.operationalTimelineDetailsCount === 0,
    `${audit.label} terminal 历史不应挂载运行期详情: ${audit.operationalTimelineDetailsCount}`,
  );
  if (!virtualizedHistory) {
    assert(
      audit.agentMessageTextPartCount === expectedVisibleAgentMessages,
      `${audit.label} final AgentMessage 数不一致: GUI=${audit.agentMessageTextPartCount}, expected=${expectedVisibleAgentMessages}`,
    );
  } else {
    assert(
      audit.agentMessageTextPartCount > 0,
      `${audit.label} 虚拟化历史窗口没有可见 AgentMessage`,
    );
  }
  assert(
    audit.uniqueAgentMessageTextPartCount === audit.agentMessageTextPartCount,
    `${audit.label} AgentMessage identity 重复投影: rows=${audit.agentMessageTextPartCount}, unique=${audit.uniqueAgentMessageTextPartCount}`,
  );
  assert(
    audit.fileArtifactCardCount === (readSummary.itemCounts.file_artifact || 0),
    `${audit.label} File Artifact 数不一致: GUI=${audit.fileArtifactCardCount}, canonical=${readSummary.itemCounts.file_artifact || 0}`,
  );
  assert(
    audit.imageAttachmentCount === readSummary.attachmentCount,
    `${audit.label} 附件数不一致: GUI=${audit.imageAttachmentCount}, canonical=${readSummary.attachmentCount}`,
  );
  assert(
    audit.deferredHistoricalPreviewCount === 0,
    `${audit.label} 仍有未 hydrate 的历史正文预览`,
  );
  const operationalItemCount = [
    "reasoning",
    "command_execution",
    "tool_call",
    "web_search",
    "approval_request",
    "request_user_input",
  ].reduce((count, type) => count + (readSummary.itemCounts[type] || 0), 0);
  assert(
    operationalItemCount === 0 || audit.historicalTimelinePreviewCount > 0,
    `${audit.label} 未展示 Codex App 风格的已处理摘要`,
  );
  assert(!audit.hasRawContentPartJson, `${audit.label} 泄漏 content-part JSON`);
}

function assertVisualAudits(
  audits,
  readSummary,
  importSummary,
  openSnapshot,
  expectedVisibleAgentMessages,
) {
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
  assert(
    openSnapshot?.messageListSessionId === readSummary.sessionId,
    "导入会话打开后消息列表 session 未绑定目标会话",
  );
  for (const audit of audits) {
    assertVisualAudit(
      audit,
      readSummary,
      importSummary,
      expectedVisibleAgentMessages,
    );
  }
  if (readSummary.itemsLength >= 100 || importSummary.willImportTurns >= 20) {
    assert(
      audits.some((audit) => audit.scroll.maxScroll > 0),
      "长历史 GUI 没有可滚动消息正文",
    );
    assert(
      new Set(audits.map((audit) => audit.position)).size ===
        SCROLL_POSITIONS.length,
      "长历史 GUI 未覆盖 top/middle/bottom 滚动窗口",
    );
  }
  if ((readSummary.itemCounts.patch || 0) > 0) {
    assert(
      audits.some((audit) => audit.hasPatchText),
      "真实样本 GUI 未展示补丁记录",
    );
  }
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
    selectionBudget: {
      maxSourceLines: options.maxSourceLines,
      maxSourceMessages: options.maxSourceMessages,
      maxSourceItems: options.maxSourceItems,
      minSourceStabilityMs: DEFAULT_REAL_SAMPLE_STABILITY_MS,
    },
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
      eligibleCount: scanSelection.eligibleCount,
      stableThreadCount: scanSelection.stableThreadCount,
      sourceAgeMs: importSourceAgeMs(
        selected.thread,
        scanSelection.scan.source?.indexedAt,
      ),
      selectionBudget: summary.selectionBudget,
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

    console.log(`${LOG_PREFIX} stage=collect-historical-visual-audit`);
    const expectedVisibleAgentMessages = readModel.expectedMessages.filter(
      (message) => message.role === "assistant",
    ).length;
    const operationalItems = [
      "reasoning",
      "command_execution",
      "tool_call",
      "web_search",
      "approval_request",
      "request_user_input",
    ].reduce(
      (count, type) => count + (readModel.summary.itemCounts[type] || 0),
      0,
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
          expectedExcerptHtml: readModel.expectedExcerptHtml,
          expectedMessages: readModel.expectedMessages,
          expectedCounts: {
            turns: selected.preview.summary.dryRun.willImportTurns,
            userMessages:
              readModel.summary.canonicalMessageRoleCounts.user || 0,
            assistantMessages:
              readModel.summary.canonicalMessageRoleCounts.assistant || 0,
            visibleAgentMessages: expectedVisibleAgentMessages,
            operationalItems,
            fileArtifacts: readModel.summary.itemCounts.file_artifact || 0,
            attachments: readModel.summary.attachmentCount,
          },
          screenshotPath,
        });
        visualAudits.push(audit);
        assertVisualAudit(
          audit,
          readModel.summary,
          selected.preview.summary.dryRun,
          expectedVisibleAgentMessages,
        );
      }
    }
    assertVisualAudits(
      visualAudits,
      readModel.summary,
      selected.preview.summary.dryRun,
      openSnapshot,
      expectedVisibleAgentMessages,
    );
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
        layout: audit.layout,
        messageListVisible: audit.messageListVisible,
        messageContentVisible: audit.messageContentVisible,
        messageContentTextLength: audit.messageContentTextLength,
        messageContentChildCount: audit.messageContentChildCount,
        importedBannerVisible: audit.importedBannerVisible,
        importedRunControlVisible: audit.importedRunControlVisible,
        sourceMetadataUiVisible: audit.sourceMetadataUiVisible,
        turnGroupCount: audit.turnGroupCount,
        userMessageBubbleCount: audit.userMessageBubbleCount,
        assistantMessageBubbleCount: audit.assistantMessageBubbleCount,
        agentMessageTextPartCount: audit.agentMessageTextPartCount,
        uniqueAgentMessageTextPartCount: audit.uniqueAgentMessageTextPartCount,
        toolCallRowCount: audit.toolCallRowCount,
        fileArtifactCardCount: audit.fileArtifactCardCount,
        timelineFileAttachmentCardCount: audit.timelineFileAttachmentCardCount,
        timelineFileArtifactCardCount: audit.timelineFileArtifactCardCount,
        groupedFileArtifactRowCount: audit.groupedFileArtifactRowCount,
        imageAttachmentCount: audit.imageAttachmentCount,
        historicalTimelinePreviewCount: audit.historicalTimelinePreviewCount,
        deferredHistoricalPreviewCount: audit.deferredHistoricalPreviewCount,
        missingExpectedExcerpts: audit.missingExpectedExcerpts,
        missingExpectedDomExcerpts: audit.missingExpectedDomExcerpts,
        operationalTimelineDetailsCount: audit.operationalTimelineDetailsCount,
        hasPatchText: audit.hasPatchText,
        scroll: audit.scroll,
      })),
    );
    summary.consoleErrors = consoleErrors;
    summary.ok = true;
    summary.completedAt = new Date().toISOString();
    writeJsonFile(summaryPath, summary);
    console.log(`${LOG_PREFIX} summary=${summaryPath}`);
  } catch (error) {
    summary.error = error instanceof Error ? error.message : String(error);
    summary.consoleErrors = consoleErrors;
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
