#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  artifactFromEvent,
  artifactSummaryHasWorkspacePatch,
  articleFromWorkspacePatch,
  assertEvidenceExportHasHostTools,
  assertHostToolEventTimeline,
  assertHostToolEvidenceContract,
  assertHostToolRequestContract,
  assertReadModelHostToolProjection,
  documentLengthFromArtifactEvent,
  eventRecordType,
  hostToolRequestsFromArticle,
  MIN_HOST_TOOL_REQUEST_COUNT,
  workspacePatchFromArtifact,
} from "./content-factory-host-tool-assertions.mjs";
import {
  assertDirectory,
  assertFile,
  buildCloudReleaseFixture,
  buildCloudReleaseInstalledState,
  buildInstalledState,
  createTempRuntimeEnv,
  evidencePrefixForOptions,
  materializeCloudReleasePackageCache,
} from "./content-factory-current-turn-fixtures.mjs";
import {
  contentFactoryHostGenerationAsterChatRequest,
  contentFactoryLiveHostGenerationAsterChatRequest,
  startContentFactoryHostGenerationFixture,
} from "../lib/content-factory-host-generation-fixture.mjs";
import { localAppServerBinaryPath } from "../lib/electron-dev-sidecar.mjs";
import {
  assertLiveProviderSmokeAllowed,
  liveProviderSmokeAllowed,
} from "../lib/live-provider-smoke-gate.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../..");
const clientDistPath = path.join(
  repoRoot,
  "packages",
  "app-server-client",
  "dist",
  "index.js",
);

const {
  METHOD_AGENT_SESSION_EVENT,
  PROTOCOL_VERSION,
  connectAppServerSidecar,
  resolveSidecarBinaryPath,
  stdioSidecar,
} = await import(pathToFileURL(clientDistPath).href);

const APP_ID = "content-factory-app";
const WORKER_ENTRY = "./src/runtime/content-factory-worker.mjs";
const WORKSPACE_PATCH_KIND = "content_factory.workspace_patch";
const DEFAULT_TIMEOUT_MS = 120_000;
const FORBIDDEN_ARTICLE_TEMPLATE_MARKERS = [
  "受控宿主生成标题",
  "内容工厂插件化写作：让文章生产可审计",
  "从基础语法到工程实战",
  "## 请求摘要",
  "## 资料检索",
  "## 正文草稿",
  "## 交付检查",
  "targetObjectKind",
  "outputField",
];

function resolveDefaultContentFactoryDir() {
  if (process.env.CONTENT_FACTORY_APP_DIR?.trim()) {
    return path.resolve(process.env.CONTENT_FACTORY_APP_DIR.trim());
  }
  return path.resolve(repoRoot, "..", "..", "limecloud", "content-factory-app");
}

const DEFAULTS = {
  appServerBin:
    process.env.APP_SERVER_BIN?.trim() ||
    localAppServerBinaryPath({ repoRoot }),
  contentFactoryDir: resolveDefaultContentFactoryDir(),
  evidenceDir: path.join(repoRoot, ".lime", "qc", "gui-evidence", "plugins"),
  prefix: "content-factory-current-turn-smoke",
  timeoutMs: DEFAULT_TIMEOUT_MS,
  hostGenerationFixture: false,
  cloudReleaseFixture: false,
  allowLiveProvider: liveProviderSmokeAllowed(),
  liveProvider: false,
  liveProviderId:
    process.env.CONTENT_FACTORY_LIVE_PROVIDER ||
    process.env.LIME_AGENT_QC_PROVIDER ||
    process.env.LIME_E2E_PROVIDER ||
    process.env.LIME_DEFAULT_PROVIDER ||
    "",
  liveProviderName: process.env.CONTENT_FACTORY_LIVE_PROVIDER_NAME || "openai",
  liveModel:
    process.env.CONTENT_FACTORY_LIVE_MODEL ||
    process.env.LIME_AGENT_QC_MODEL ||
    process.env.LIME_E2E_MODEL ||
    process.env.LIME_DEFAULT_MODEL ||
    "",
  liveBaseUrl:
    process.env.CONTENT_FACTORY_LIVE_BASE_URL ||
    process.env.LIME_AGENT_QC_BASE_URL ||
    process.env.LIME_E2E_BASE_URL ||
    process.env.LIME_DEFAULT_BASE_URL ||
    "",
  liveApiKeyEnv: process.env.CONTENT_FACTORY_LIVE_API_KEY_ENV || "",
};

function printHelp() {
  console.log(`Usage:
  node scripts/plugin/content-factory-current-turn-smoke.mjs [options]

Options:
  --app-server-bin <path>      app-server binary, default APP_SERVER_BIN or lime-rs target
  --content-factory-dir <dir>  external content-factory-app directory
  --evidence-dir <dir>         evidence output directory
  --prefix <name>              evidence filename prefix
  --timeout-ms <ms>            timeout, default 120000
  --host-generation-fixture    use a local OpenAI-compatible SSE fixture and require host generation completed
  --allow-live-provider        allow real Provider calls for host generation
  --live-provider              use real Provider config from env/options and require host generation completed
  --live-provider-id <id>      provider id for --live-provider
  --live-provider-name <name>  runtime provider name, default openai
  --live-model <model>         model name for --live-provider
  --live-base-url <url>        optional OpenAI-compatible base URL for --live-provider
  --live-api-key-env <name>    env var that holds the live Provider API key
  --cloud-release-fixture      save as verified cloud_release and materialize the package cache
  -h, --help                   print help

Live Provider opt-in:
  --allow-live-provider or LIME_ALLOW_LIVE_PROVIDER_SMOKE=1 / LIME_REAL_API_TEST=1
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
    if (arg === "--content-factory-dir" && next) {
      options.contentFactoryDir = path.resolve(next.trim());
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
    if (arg === "--host-generation-fixture") {
      options.hostGenerationFixture = true;
      continue;
    }
    if (arg === "--allow-live-provider") {
      options.allowLiveProvider = true;
      continue;
    }
    if (arg === "--live-provider") {
      options.liveProvider = true;
      continue;
    }
    if (arg === "--live-provider-id" && next) {
      options.liveProviderId = next.trim();
      index += 1;
      continue;
    }
    if (arg === "--live-provider-name" && next) {
      options.liveProviderName = next.trim();
      index += 1;
      continue;
    }
    if (arg === "--live-model" && next) {
      options.liveModel = next.trim();
      index += 1;
      continue;
    }
    if (arg === "--live-base-url" && next) {
      options.liveBaseUrl = next.trim();
      index += 1;
      continue;
    }
    if (arg === "--live-api-key-env" && next) {
      options.liveApiKeyEnv = next.trim();
      index += 1;
      continue;
    }
    if (arg === "--cloud-release-fixture") {
      options.cloudReleaseFixture = true;
      continue;
    }
    throw new Error(`Unsupported argument: ${arg}`);
  }
  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs < 30_000) {
    throw new Error("--timeout-ms must be >= 30000");
  }
  if (options.hostGenerationFixture && options.liveProvider) {
    throw new Error(
      "--host-generation-fixture and --live-provider are mutually exclusive",
    );
  }
  if (options.liveProvider) {
    assertLiveProviderSmokeAllowed({
      allowed: options.allowLiveProvider,
      scriptName: "content-factory-current-turn-smoke",
    });
    if (!options.liveProviderId || !options.liveModel) {
      throw new Error(
        "--live-provider requires --live-provider-id and --live-model",
      );
    }
    if (!options.liveApiKeyEnv || !process.env[options.liveApiKeyEnv]?.trim()) {
      throw new Error(
        "--live-provider requires --live-api-key-env pointing to a configured environment variable",
      );
    }
  }
  return options;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertNoTemplateMarkers(text, label) {
  for (const marker of FORBIDDEN_ARTICLE_TEMPLATE_MARKERS) {
    assert(
      !String(text ?? "").includes(marker),
      `${label} leaked hard-coded article template marker: ${marker}`,
    );
  }
}

function pluginActivationMetadata(sessionId, workspaceId) {
  return {
    agent_response_language: "zh-CN",
    harness: {
      plugin_activation: {
        source: "plugin_explicit_mention",
        trigger: "@写文章",
        body: "写一篇关于 AI Agent 工作流如何让内容生产可审计的公众号文章",
        session_id: sessionId,
        plugin_id: APP_ID,
        active_plugin_id: APP_ID,
        active_entry_key: "content_factory",
        intent_key: "content_article_generate",
        task_kind: "content.article.generate",
        workflow_key: "content_article_workflow",
        output_artifact_kind: WORKSPACE_PATCH_KIND,
        right_surface: "articleWorkspace",
        expected_objects: ["articleDraft"],
        selected_object_ref: {
          plugin_id: APP_ID,
          object_kind: "articleDraft",
          object_id: "pending",
        },
        opened_tabs: ["articleWorkspace"],
        context_source: "current_turn_smoke",
        workspace_id: workspaceId,
      },
    },
  };
}

function turnRuntimeOptions({
  sessionId,
  workspaceId,
  fixtureBaseUrl,
  liveAsterChatRequest,
}) {
  const runtimeOptions = {
    stream: true,
    metadata: pluginActivationMetadata(sessionId, workspaceId),
  };
  if (fixtureBaseUrl) {
    runtimeOptions.hostOptions = {
      asterChatRequest:
        contentFactoryHostGenerationAsterChatRequest(fixtureBaseUrl),
    };
  } else if (liveAsterChatRequest) {
    runtimeOptions.hostOptions = {
      asterChatRequest: liveAsterChatRequest,
    };
  }
  return runtimeOptions;
}

function buildLiveHostGeneration(options) {
  if (!options.liveProvider) return null;
  const apiKey = process.env[options.liveApiKeyEnv]?.trim();
  const asterChatRequest = contentFactoryLiveHostGenerationAsterChatRequest({
    providerId: options.liveProviderId,
    providerName: options.liveProviderName,
    model: options.liveModel,
    apiKey,
    baseUrl: options.liveBaseUrl,
  });
  return {
    asterChatRequest,
    summary: {
      provider: options.liveProviderId,
      providerName: options.liveProviderName,
      model: options.liveModel,
      baseUrlConfigured: Boolean(options.liveBaseUrl),
      apiKeyEnv: options.liveApiKeyEnv,
      apiKeyConfigured: true,
      liveProviderUsed: true,
    },
  };
}

function stringField(value, pathSegments) {
  let current = value;
  for (const segment of pathSegments) {
    current = current?.[segment];
  }
  return typeof current === "string" && current.trim() ? current.trim() : "";
}

function eventType(notification) {
  const event = notification?.params?.event;
  return event?.type || event?.eventType || "";
}

function collectEvents(notifications) {
  return notifications
    .filter(
      (notification) => notification?.method === METHOD_AGENT_SESSION_EVENT,
    )
    .map((notification) => notification.params.event);
}

async function collectUntilTurnCompleted(
  connection,
  initialNotifications,
  turnId,
  timeoutMs,
) {
  const notifications = [...initialNotifications];
  const startedAt = Date.now();
  while (
    !notifications.some((notification) => {
      const event = notification?.params?.event;
      return (
        (event?.turnId === turnId || event?.turn_id === turnId) &&
        eventType(notification) === "turn.completed"
      );
    })
  ) {
    const remaining = timeoutMs - (Date.now() - startedAt);
    if (remaining <= 0) {
      break;
    }
    const notification = await connection.nextNotification(
      Math.min(remaining, 10_000),
    );
    notifications.push(notification);
  }
  return notifications;
}

function assertCurrentTurnEvents(events, expectations = {}) {
  const types = events.map(eventRecordType);
  assert(types.includes("turn.accepted"), "turn.accepted event missing");
  assert(types.includes("message.delta"), "message.delta event missing");
  assert(types.includes("turn.completed"), "turn.completed event missing");
  assert(
    types.every((type) => !String(type).startsWith("workflow.")),
    `workflow events leaked to user event stream: ${types.join(",")}`,
  );
  assert(
    !types.includes("plugin_worker.hook"),
    "worker hook event leaked to user event stream",
  );

  const artifactEvents = events.filter(
    (event) => eventRecordType(event) === "artifact.snapshot",
  );
  assert(
    artifactEvents.length >= 6,
    `expected paragraph-level artifact snapshots, got ${artifactEvents.length}`,
  );
  const streamingLengths = artifactEvents
    .filter((event) => artifactFromEvent(event)?.status === "streaming")
    .map(documentLengthFromArtifactEvent)
    .filter((length) => length > 0);
  assert(
    streamingLengths.length >= 4,
    `expected >=4 streaming document partials, got ${streamingLengths.join(",")}`,
  );
  assert(
    streamingLengths
      .slice(1)
      .every((length, index) => length > streamingLengths[index]),
    `streaming document lengths must increase: ${streamingLengths.join(",")}`,
  );
  const completedArtifact = artifactFromEvent(artifactEvents.at(-1));
  assert(
    completedArtifact?.status !== "streaming",
    "final artifact is still streaming",
  );
  const finalArticle = articleFromWorkspacePatch(
    workspacePatchFromArtifact(completedArtifact),
  );
  const streamingHostToolRequestCounts = artifactEvents
    .filter((event) => artifactFromEvent(event)?.status === "streaming")
    .map(
      (event) =>
        hostToolRequestsFromArticle(
          articleFromWorkspacePatch(
            workspacePatchFromArtifact(artifactFromEvent(event)),
          ),
        ).length,
    )
    .filter((count) => count >= MIN_HOST_TOOL_REQUEST_COUNT);
  assert(
    streamingHostToolRequestCounts.length > 0,
    "streaming artifacts missing hostToolRequests",
  );
  assert(
    finalArticle?.source?.documentText,
    "final article documentText missing",
  );
  assert(
    finalArticle.source.finalMarkdown === finalArticle.source.documentText,
    "finalMarkdown must equal documentText",
  );
  assertNoTemplateMarkers(
    finalArticle.source.documentText,
    "final article documentText",
  );
  const hostGenerationStatus =
    finalArticle.source.hostManagedGeneration?.status || null;
  const hostToolRequestSummary = assertHostToolRequestContract(
    finalArticle,
    "final article",
  );
  const hostToolEvidenceSummary = assertHostToolEvidenceContract(
    finalArticle,
    "final article",
    hostToolRequestSummary.hostToolRequestCount,
  );
  const hostToolEventSummary = assertHostToolEventTimeline(
    events,
    "current turn events",
    hostToolRequestSummary.hostToolRequestCount,
  );
  if (expectations.hostGenerationCompleted) {
    assert(
      hostGenerationStatus === "completed",
      `hostManagedGeneration.status must be completed, got ${hostGenerationStatus}`,
    );
    if (expectations.hostGenerationFixture) {
      assert(
        finalArticle.source.documentText.includes("fixturePromptFingerprint:"),
        "final article must use prompt-derived host generation fixture Markdown",
      );
    } else {
      assert(
        !finalArticle.source.documentText.includes("fixturePromptFingerprint:"),
        "live host generation must not include fixturePromptFingerprint",
      );
    }
  }
  return {
    eventTypes: types,
    artifactSnapshotCount: artifactEvents.length,
    streamingDocumentLengths: streamingLengths,
    finalDocumentLength: finalArticle.source.documentText.length,
    hostManagedGenerationStatus: hostGenerationStatus,
    hostManagedGenerationReasonCode:
      finalArticle.source.hostManagedGeneration?.reasonCode || null,
    streamingHostToolRequestCounts,
    ...hostToolRequestSummary,
    ...hostToolEvidenceSummary,
    ...hostToolEventSummary,
  };
}

function assertReadModel(readResult, expectations = {}) {
  const detail = readResult?.detail || {};
  const articleWorkspace = detail.article_workspace || detail.articleWorkspace;
  assert(articleWorkspace, "read model missing article_workspace");
  const article = articleWorkspace.objects?.find(
    (object) => object?.ref?.kind === "articleDraft",
  );
  assert(
    article?.source?.documentText,
    "read model missing articleDraft documentText",
  );
  assert(
    article.source.finalMarkdown === article.source.documentText,
    "read model finalMarkdown must equal documentText",
  );
  assertNoTemplateMarkers(
    article.source.documentText,
    "read model article documentText",
  );
  const hostGenerationStatus =
    article.source.hostManagedGeneration?.status || null;
  const hostToolRequestSummary = assertHostToolRequestContract(
    article,
    "read model article",
  );
  const hostToolEvidenceSummary = assertHostToolEvidenceContract(
    article,
    "read model article",
    hostToolRequestSummary.hostToolRequestCount,
  );
  const hostToolProjectionSummary = assertReadModelHostToolProjection(
    detail,
    hostToolRequestSummary.hostToolRequestCount,
  );
  if (expectations.hostGenerationCompleted) {
    assert(
      hostGenerationStatus === "completed",
      `read model hostManagedGeneration.status must be completed, got ${hostGenerationStatus}`,
    );
    if (expectations.hostGenerationFixture) {
      assert(
        article.source.documentText.includes("fixturePromptFingerprint:"),
        "read model article must use prompt-derived host generation fixture Markdown",
      );
    } else {
      assert(
        !article.source.documentText.includes("fixturePromptFingerprint:"),
        "live read model article must not include fixturePromptFingerprint",
      );
    }
  }
  const workerEvidence = Array.isArray(articleWorkspace.workerEvidence)
    ? articleWorkspace.workerEvidence
    : [];
  assert(workerEvidence.length > 0, "read model missing workerEvidence");
  assert(
    workerEvidence.some(
      (item) =>
        item?.eventType === "artifact.snapshot" &&
        item?.status === "completed" &&
        item?.artifactKind === WORKSPACE_PATCH_KIND,
    ),
    "read model missing completed worker artifact evidence",
  );
  assert(
    workerEvidence.every((item) => item?.eventType !== "plugin_worker.hook"),
    "worker hook lifecycle leaked to article workspace evidence",
  );
  return {
    articleObjectCount: articleWorkspace.objects.length,
    selectedObjectKind: articleWorkspace.selectedObjectRef?.kind || null,
    workerEvidenceCount: workerEvidence.length,
    finalDocumentLength: article.source.documentText.length,
    workflowKey:
      workerEvidence.find((item) => item?.workflowKey)?.workflowKey || null,
    hostManagedGenerationStatus: hostGenerationStatus,
    hostManagedGenerationReasonCode:
      article.source.hostManagedGeneration?.reasonCode || null,
    ...hostToolRequestSummary,
    ...hostToolEvidenceSummary,
    ...hostToolProjectionSummary,
  };
}

function safeFileStem(value) {
  const stem = String(value)
    .split("")
    .map((char) => (/[A-Za-z0-9_-]/.test(char) ? char : "_"))
    .join("")
    .replace(/^_+|_+$/g, "");
  return stem || "unknown";
}

async function readJsonl(filePath) {
  if (!fs.existsSync(filePath)) {
    return [];
  }
  const text = await readFile(filePath, "utf8");
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function assertEventLogs({ regularRecords, workflowRecords }) {
  const regularTypes = regularRecords.map(eventRecordType);
  assert(
    regularTypes.every((type) => !String(type).startsWith("workflow.")),
    `workflow event leaked to regular JSONL: ${regularTypes.join(",")}`,
  );
  assert(
    !regularTypes.includes("plugin_worker.hook"),
    "worker hook event leaked to regular JSONL",
  );
  const hostToolLogSummary = assertHostToolEventTimeline(
    regularRecords,
    "regular JSONL",
  );

  const workflowTypes = workflowRecords.map(eventRecordType);
  for (const required of [
    "workflow.run.started",
    "workflow.step.started",
    "workflow.connector.requested",
    "workflow.hook.completed",
    "workflow.step.completed",
    "workflow.run.completed",
  ]) {
    assert(
      workflowTypes.includes(required),
      `workflow audit JSONL missing ${required}: ${workflowTypes.join(",")}`,
    );
  }
  for (const record of workflowRecords) {
    assert(
      record?.payload?.redaction?.policy === "workflow_audit_metadata_only",
      `workflow audit event missing metadata-only redaction policy: ${record?.type || record?.eventType}`,
    );
    for (const key of [
      "prompt",
      "query",
      "result",
      "providerConfig",
      "provider_payload",
      "message",
      "inputSummary",
      "text",
      "summary",
    ]) {
      if (Object.prototype.hasOwnProperty.call(record?.payload || {}, key)) {
        assert(
          record.payload[key]?.redacted === true,
          `workflow audit field ${key} must be redacted for ${record?.type || record?.eventType}`,
        );
      }
    }
  }
  const workflowJson = JSON.stringify(workflowRecords);
  assert(
    !workflowJson.includes("AI Agent 工作流如何让内容生产可审计"),
    "workflow audit JSONL leaked raw user prompt",
  );
  assert(
    !workflowJson.includes("fixturePromptFingerprint:"),
    "workflow audit JSONL leaked host generation content",
  );
  return {
    regularEventCount: regularTypes.length,
    regularEventTypes: regularTypes,
    workflowEventCount: workflowTypes.length,
    workflowEventTypes: workflowTypes,
    hostToolEventCount: hostToolLogSummary.hostToolEventCount,
    hostToolResultCount: hostToolLogSummary.hostToolResultCount,
  };
}

function sanitizeText(value) {
  const text = String(value ?? "")
    .replace(
      /((?:api[_-]?key|authorization|password|secret|session|token)[^=\s]*=)(["']?)[^\s"']+/gi,
      "$1$2[redacted]",
    )
    .replace(
      /(["']?(?:api[_-]?key|authorization|password|secret|token)["']?\s*:\s*["'])(?:\\.|[^"'\\])*?(["'])/gi,
      "$1[redacted]$2",
    )
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, "$1[redacted]");
  return text.length > 4000
    ? `${text.slice(0, 4000)}... [truncated ${text.length - 4000} chars]`
    : text;
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
    return value.slice(0, 100).map((item) => sanitizeJson(item, depth + 1));
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 160)
        .map(([key, item]) => [key, sanitizeJson(item, depth + 1)]),
    );
  }
  return sanitizeText(String(value));
}

function summarizeSmokeOptions(options) {
  return {
    cloudReleaseFixture: Boolean(options.cloudReleaseFixture),
    contentFactoryDir: options.contentFactoryDir,
    evidenceDir: options.evidenceDir,
    hostGenerationFixture: Boolean(options.hostGenerationFixture),
    liveProvider: options.liveProvider
      ? {
          apiKeyConfigured: Boolean(
            options.liveApiKeyEnv && process.env[options.liveApiKeyEnv]?.trim(),
          ),
          apiKeyEnv: options.liveApiKeyEnv || null,
          baseUrlConfigured: Boolean(options.liveBaseUrl),
          model: options.liveModel || null,
          provider: options.liveProviderId || null,
          providerName: options.liveProviderName || null,
        }
      : { liveProviderUsed: false },
    timeoutMs: options.timeoutMs,
  };
}

function summarizeInstalledStateForDiagnostics(installedState) {
  if (!installedState) return null;
  const cloudReleaseEvidence = installedState.setup?.cloudReleaseEvidence || {};
  return {
    appId: installedState.appId || null,
    evidenceStatus: cloudReleaseEvidence.status || null,
    installMode: installedState.installMode || null,
    manifestHash: installedState.identity?.manifestHash || null,
    packageHash: installedState.identity?.packageHash || null,
    packageVerificationStatus:
      cloudReleaseEvidence.packageVerificationStatus || null,
    releaseId: installedState.identity?.releaseId || null,
    signaturePolicy: cloudReleaseEvidence.signaturePolicy || null,
    signatureRef: installedState.identity?.signatureRef || null,
    signatureVerificationStatus:
      cloudReleaseEvidence.signatureVerificationStatus || null,
    sourceKind: installedState.identity?.sourceKind || null,
    sourceUri: installedState.identity?.sourceUri || null,
  };
}

function markDiagnosticStage(diagnostics, stage, detail = {}) {
  diagnostics.stage = stage;
  diagnostics.stages.push({
    at: new Date().toISOString(),
    detail: sanitizeJson(detail),
    stage,
  });
}

function compactEventRecord(record) {
  return {
    eventId: record?.eventId || record?.event_id || record?.id || null,
    status: record?.payload?.status || record?.status || null,
    turnId:
      record?.turnId || record?.turn_id || record?.payload?.turnId || null,
    type: eventRecordType(record),
  };
}

function summarizeJsonlRecords(records) {
  const types = records.map(eventRecordType).filter(Boolean);
  const typeBreakdown = {};
  for (const type of types) {
    typeBreakdown[type] = (typeBreakdown[type] || 0) + 1;
  }
  return {
    count: records.length,
    tail: records.slice(-20).map(compactEventRecord),
    typeBreakdown,
  };
}

async function readJsonlSummaryForDiagnostics(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return { exists: false, path: filePath || null };
  }
  try {
    const records = await readJsonl(filePath);
    return {
      exists: true,
      path: filePath,
      ...summarizeJsonlRecords(records),
    };
  } catch (error) {
    return {
      error: sanitizeText(
        error instanceof Error ? error.message : String(error),
      ),
      exists: true,
      path: filePath,
    };
  }
}

async function copyIfExists(sourcePath, targetPath) {
  if (!fs.existsSync(sourcePath)) {
    return null;
  }
  await writeFile(targetPath, await readFile(sourcePath, "utf8"), "utf8");
  return targetPath;
}

async function copyDiagnosticJsonl(sourcePath, targetPath) {
  if (!sourcePath) return null;
  try {
    return await copyIfExists(sourcePath, targetPath);
  } catch (error) {
    return `copy_failed:${sanitizeText(
      error instanceof Error ? error.message : String(error),
    )}`;
  }
}

async function collectFailureDiagnostics({
  diagnostics,
  regularJsonlFailurePath,
  workflowJsonlFailurePath,
}) {
  const regularPath = diagnostics.eventLogPaths?.regular || "";
  const workflowPath = diagnostics.eventLogPaths?.workflow || "";
  const [regular, workflow, regularJsonlEvidence, workflowJsonlEvidence] =
    await Promise.all([
      readJsonlSummaryForDiagnostics(regularPath),
      readJsonlSummaryForDiagnostics(workflowPath),
      copyDiagnosticJsonl(regularPath, regularJsonlFailurePath),
      copyDiagnosticJsonl(workflowPath, workflowJsonlFailurePath),
    ]);
  return {
    ...diagnostics,
    eventLogs: {
      regular,
      regularJsonlEvidence,
      workflow,
      workflowJsonlEvidence,
    },
  };
}

async function runSmoke(options) {
  await assertFile(options.appServerBin, "app-server binary");
  await assertDirectory(
    options.contentFactoryDir,
    "content-factory-app directory",
  );
  for (const fileName of [
    "package.json",
    "plugin.json",
    "app.runtime.yaml",
    "src/runtime/content-factory-worker.mjs",
  ]) {
    await assertFile(path.join(options.contentFactoryDir, fileName), fileName);
  }
  await mkdir(options.evidenceDir, { recursive: true });

  const runtimeEnv = createTempRuntimeEnv();
  const binaryResolution = resolveSidecarBinaryPath({
    devBinaryPath: options.appServerBin,
    env: { ...process.env, APP_SERVER_BIN: options.appServerBin },
  });
  const binaryPath = binaryResolution?.binaryPath || options.appServerBin;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const evidencePrefix = evidencePrefixForOptions(options);
  const evidencePath = path.join(
    options.evidenceDir,
    `${evidencePrefix}-${stamp}.json`,
  );
  const regularJsonlEvidencePath = path.join(
    options.evidenceDir,
    `${evidencePrefix}-${stamp}.events.jsonl`,
  );
  const workflowJsonlEvidencePath = path.join(
    options.evidenceDir,
    `${evidencePrefix}-${stamp}.workflow-events.jsonl`,
  );
  const failureRegularJsonlEvidencePath = path.join(
    options.evidenceDir,
    `${evidencePrefix}-${stamp}.failure.events.jsonl`,
  );
  const failureWorkflowJsonlEvidencePath = path.join(
    options.evidenceDir,
    `${evidencePrefix}-${stamp}.failure.workflow-events.jsonl`,
  );

  const hostGenerationFixture = options.hostGenerationFixture
    ? await startContentFactoryHostGenerationFixture()
    : null;
  const liveHostGeneration = buildLiveHostGeneration(options);
  const hostGenerationEnabled = Boolean(
    hostGenerationFixture || liveHostGeneration,
  );
  const backendMode = hostGenerationEnabled ? "runtime" : "unavailable";
  const diagnostics = {
    backendMode,
    contentFactory: null,
    eventLogPaths: null,
    hostGeneration: {
      enabled: hostGenerationEnabled,
      fixture: Boolean(hostGenerationFixture),
      liveProvider: liveHostGeneration
        ? liveHostGeneration.summary
        : { liveProviderUsed: false },
    },
    installedState: null,
    options: summarizeSmokeOptions(options),
    packageCachePath: null,
    session: null,
    stage: "initialized",
    stages: [],
  };
  let connected;

  try {
    markDiagnosticStage(diagnostics, "sidecar.connect.start", {
      backendMode,
      binaryPath,
    });
    connected = await connectAppServerSidecar(
      {
        ...stdioSidecar(binaryPath, undefined, runtimeEnv.appServerDataDir),
        backendMode,
        productDbMigrationCleanup: "drop-tables",
      },
      {
        clientInfo: {
          name: "content_factory_current_turn_smoke",
          version: "1.93.0",
        },
        capabilities: {
          eventMethods: [METHOD_AGENT_SESSION_EVENT],
        },
      },
      {
        initializeTimeoutMs: Math.min(options.timeoutMs, 30_000),
        expectedProtocolVersion: PROTOCOL_VERSION,
        cwd: repoRoot,
        env: runtimeEnv.env,
      },
    );
    markDiagnosticStage(diagnostics, "sidecar.connect.done", {
      protocolVersion: connected.initializeResponse.serverInfo.protocolVersion,
    });

    const connection = connected.connection;
    markDiagnosticStage(diagnostics, "pluginPackage.inspect.start", {
      appDir: options.contentFactoryDir,
    });
    const inspect = await connection.inspectPluginLocalPackage(
      { appDir: options.contentFactoryDir },
      { timeoutMs: Math.min(options.timeoutMs, 30_000) },
    );
    assert(inspect.result?.manifest, "inspect missing manifest");
    assert(
      stringField(inspect.result.manifest, [
        "runtimePackage",
        "worker",
        "entrypoint",
      ]) === WORKER_ENTRY,
      "runtimePackage.worker.entrypoint mismatch",
    );
    diagnostics.contentFactory = {
      appId:
        stringField(inspect.result.pluginManifest, ["appId"]) ||
        stringField(inspect.result.manifest, ["appId"]) ||
        APP_ID,
      manifestHash: inspect.result.manifestHash,
      packageHash: inspect.result.packageHash,
      sourceKind: inspect.result.sourceKind || null,
      version: stringField(inspect.result.pluginManifest, ["version"]),
      workerEntrypoint: WORKER_ENTRY,
    };
    markDiagnosticStage(
      diagnostics,
      "pluginPackage.inspect.done",
      diagnostics.contentFactory,
    );

    markDiagnosticStage(diagnostics, "pluginInstalled.save.prepare", {
      cloudReleaseFixture: Boolean(options.cloudReleaseFixture),
    });
    const cloudRelease = options.cloudReleaseFixture
      ? await buildCloudReleaseFixture(inspect.result)
      : null;
    const packageCachePath = cloudRelease
      ? await materializeCloudReleasePackageCache({
          sourceDir: options.contentFactoryDir,
          preferredDataDir: runtimeEnv.preferredDataDir,
          packageHash: inspect.result.packageHash,
        })
      : null;
    diagnostics.packageCachePath = packageCachePath;
    const installedState = cloudRelease
      ? buildCloudReleaseInstalledState(inspect.result, cloudRelease)
      : buildInstalledState(inspect.result);
    diagnostics.installedState =
      summarizeInstalledStateForDiagnostics(installedState);
    markDiagnosticStage(
      diagnostics,
      "pluginInstalled.save.start",
      diagnostics.installedState,
    );
    const save = await connection.savePluginInstalled(
      { state: installedState },
      { timeoutMs: Math.min(options.timeoutMs, 30_000) },
    );
    assert(
      save.result?.appId === APP_ID,
      "installed state save appId mismatch",
    );
    markDiagnosticStage(diagnostics, "pluginInstalled.save.done", {
      savedAppId: save.result.appId,
      sourceKind: installedState.identity.sourceKind,
    });

    const sessionId = `session_content_factory_current_${Date.now()}`;
    const threadId = `thread_content_factory_current_${Date.now()}`;
    const turnId = `turn_content_factory_current_${Date.now()}`;
    const workspaceId = "workspace-content-factory-current-smoke";
    diagnostics.session = {
      sessionId,
      threadId,
      turnId,
      workspaceId,
    };
    const safeSession = safeFileStem(sessionId);
    diagnostics.eventLogPaths = {
      regular: path.join(
        runtimeEnv.appServerDataDir,
        "runtime",
        "events",
        "sessions",
        `session_${safeSession}.jsonl`,
      ),
      workflow: path.join(
        runtimeEnv.appServerDataDir,
        "runtime",
        "events",
        "sessions",
        `session_${safeSession}`,
        "workflow-events.jsonl",
      ),
    };
    markDiagnosticStage(diagnostics, "agentSession.start.start", {
      sessionId,
      threadId,
      workspaceId,
    });
    const session = await connection.startSession(
      {
        sessionId,
        threadId,
        appId: APP_ID,
        workspaceId,
        locale: "zh-CN",
      },
      { timeoutMs: 30_000 },
    );
    assert(
      session.result.session.sessionId === sessionId,
      "session id mismatch",
    );
    markDiagnosticStage(diagnostics, "agentSession.start.done", {
      sessionId,
    });

    markDiagnosticStage(diagnostics, "agentSession.turn.start.dispatch", {
      hostGenerationEnabled,
      liveProviderUsed: Boolean(liveHostGeneration),
      sourceKind: installedState.identity.sourceKind,
      turnId,
    });
    const turn = await connection.startTurn(
      {
        sessionId,
        turnId,
        input: {
          text: "@写文章 写一篇关于 AI Agent 工作流如何让内容生产可审计的公众号文章",
        },
        runtimeOptions: turnRuntimeOptions({
          sessionId,
          workspaceId,
          fixtureBaseUrl: hostGenerationFixture?.baseUrl,
          liveAsterChatRequest: liveHostGeneration?.asterChatRequest,
        }),
        queueIfBusy: false,
        skipPreSubmitResume: false,
      },
      { timeoutMs: options.timeoutMs },
    );
    assert(turn.result.turn.turnId === turnId, "turn id mismatch");
    assert(turn.result.turn.status === "completed", "turn status mismatch");
    markDiagnosticStage(diagnostics, "agentSession.turn.start.done", {
      notificationCount: turn.notifications?.length || 0,
      status: turn.result.turn.status,
      turnId,
    });

    const notifications = await collectUntilTurnCompleted(
      connection,
      turn.notifications,
      turnId,
      Math.min(options.timeoutMs, 30_000),
    );
    const events = collectEvents(notifications).filter(
      (event) => event.turnId === turnId || event.turn_id === turnId,
    );
    const eventSummary = assertCurrentTurnEvents(events, {
      hostGenerationCompleted: hostGenerationEnabled,
      hostGenerationFixture: Boolean(hostGenerationFixture),
    });

    const read = await connection.readSession(
      { sessionId },
      { timeoutMs: 30_000 },
    );
    const readSummary = assertReadModel(read.result, {
      hostGenerationCompleted: hostGenerationEnabled,
      hostGenerationFixture: Boolean(hostGenerationFixture),
    });

    const artifacts = await connection.readArtifacts(
      { sessionId, turnId },
      { timeoutMs: 30_000 },
    );
    assert(
      artifacts.result.artifacts?.some(
        (artifact) =>
          artifact?.kind === "artifact.snapshot" &&
          artifactSummaryHasWorkspacePatch(artifact),
      ),
      "artifact read model missing content factory workspace patch",
    );
    const artifactReadModelSummary = {
      workspacePatchArtifactCount: (artifacts.result.artifacts || []).filter(
        artifactSummaryHasWorkspacePatch,
      ).length,
    };

    const evidenceExport = await connection.exportEvidence(
      { sessionId, turnId, includeEvents: true, includeArtifacts: true },
      { timeoutMs: 30_000 },
    );
    assert(
      evidenceExport.result.events?.some(
        (event) => event.type === "artifact.snapshot",
      ),
      "evidence export missing artifact.snapshot",
    );
    const evidenceExportHostToolSummary = assertEvidenceExportHasHostTools(
      evidenceExport.result,
    );

    const regularEventPath = diagnostics.eventLogPaths.regular;
    const workflowEventPath = diagnostics.eventLogPaths.workflow;
    const regularRecords = await readJsonl(regularEventPath);
    const workflowRecords = await readJsonl(workflowEventPath);
    const eventLogSummary = assertEventLogs({
      regularRecords,
      workflowRecords,
    });
    await copyIfExists(regularEventPath, regularJsonlEvidencePath);
    await copyIfExists(workflowEventPath, workflowJsonlEvidencePath);

    const evidence = {
      schemaVersion: "content-factory-current-turn-smoke.v1",
      status: "passed",
      generatedAt: new Date().toISOString(),
      platform: {
        os: os.platform(),
        arch: os.arch(),
        node: process.version,
      },
      appServer: {
        binaryPath,
        binarySource: binaryResolution?.source || "explicit",
        protocolVersion:
          connected.initializeResponse.serverInfo.protocolVersion,
        backendMode,
        dataDir: runtimeEnv.appServerDataDir,
        preferredDataDir: runtimeEnv.preferredDataDir,
        tempRoot: runtimeEnv.tempRoot,
      },
      contentFactory: {
        appId: APP_ID,
        sourceDir: options.contentFactoryDir,
        version: stringField(inspect.result.pluginManifest, ["version"]),
        packageHash: inspect.result.packageHash,
        manifestHash: inspect.result.manifestHash,
        workerEntrypoint: WORKER_ENTRY,
      },
      installedState: {
        sourceKind: installedState.identity.sourceKind,
        sourceUri: installedState.identity.sourceUri,
        installMode: installedState.installMode,
        savedAppId: save.result.appId,
        releaseId: installedState.identity.releaseId || null,
        signatureRef: installedState.identity.signatureRef || null,
      },
      session: {
        sessionId,
        threadId,
        turnId,
        workspaceId,
        status: turn.result.turn.status,
      },
      currentTurn: eventSummary,
      readModel: readSummary,
      artifacts: {
        count: artifacts.result.artifacts?.length || 0,
        workspacePatchPresent: true,
        ...artifactReadModelSummary,
      },
      evidenceExport: {
        eventCount: evidenceExport.result.events?.length || 0,
        artifactCount: evidenceExport.result.artifacts?.length || 0,
        ...evidenceExportHostToolSummary,
      },
      eventLogs: {
        ...eventLogSummary,
        regularJsonl: fs.existsSync(regularJsonlEvidencePath)
          ? regularJsonlEvidencePath
          : null,
        workflowJsonl: fs.existsSync(workflowJsonlEvidencePath)
          ? workflowJsonlEvidencePath
          : null,
      },
      hostGenerationFixture: hostGenerationFixture
        ? {
            baseUrl: hostGenerationFixture.baseUrl,
            ...hostGenerationFixture.summary(),
            expectedStatus: "completed",
          }
        : null,
      liveProvider: liveHostGeneration
        ? {
            ...liveHostGeneration.summary,
            expectedStatus: "completed",
          }
        : {
            liveProviderUsed: false,
          },
      providerEvidence: liveHostGeneration
        ? {
            productionRoute: true,
            liveProviderUsed: true,
            provider: options.liveProviderId,
            model: options.liveModel,
            baseUrlConfigured: Boolean(options.liveBaseUrl),
          }
        : {
            productionRoute: false,
            liveProviderUsed: false,
          },
      assertions: {
        articleDraftDocumentPresent: true,
        contentFactoryArticleWorkspaceWorkflowFactsHidden: true,
        liveProviderUsed: Boolean(liveHostGeneration),
      },
      cloudReleaseFixture: cloudRelease
        ? {
            sourceKind: "cloud_release",
            packageCachePath,
            releaseId: cloudRelease.releaseId,
            tenantId: cloudRelease.tenantId,
            tenantEnablementRef: cloudRelease.tenantEnablementRef,
            channel: cloudRelease.channel,
            packageUrl: cloudRelease.packageUrl,
            signatureRef: cloudRelease.signatureRef,
            signaturePolicy:
              installedState.setup.cloudReleaseEvidence.signaturePolicy,
            signatureVerificationStatus:
              installedState.setup.cloudReleaseEvidence
                .signatureVerificationStatus,
            packageVerificationStatus:
              installedState.setup.cloudReleaseEvidence
                .packageVerificationStatus,
            evidenceStatus: installedState.setup.cloudReleaseEvidence.status,
          }
        : null,
      notes: [
        cloudRelease
          ? "This smoke proves a fixture-signed cloud_release installed state can enter App Server current agentSession/turn/start after the package cache is materialized."
          : "This smoke proves the external local_folder package enters App Server current agentSession/turn/start.",
        hostGenerationFixture
          ? "hostGenerationFixture uses a local OpenAI-compatible SSE provider to prove hostManagedGeneration completed without real provider credentials."
          : liveHostGeneration
            ? "liveProvider uses an explicit Direct provider config from environment variables; API keys are not written to evidence."
            : "backendMode=unavailable intentionally does not prove live host-managed LLM generation.",
        cloudRelease
          ? "cloudReleaseFixture is local release evidence only; it does not replace production LimeCore signatureProof and trust root delivery."
          : null,
      ].filter(Boolean),
    };
    await writeFile(
      evidencePath,
      `${JSON.stringify(evidence, null, 2)}\n`,
      "utf8",
    );
    return { evidence, evidencePath };
  } catch (error) {
    const failurePath = path.join(
      options.evidenceDir,
      `${evidencePrefix}-${stamp}.failure.json`,
    );
    markDiagnosticStage(diagnostics, "failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    const failureDiagnostics = await collectFailureDiagnostics({
      diagnostics,
      regularJsonlFailurePath: failureRegularJsonlEvidencePath,
      workflowJsonlFailurePath: failureWorkflowJsonlEvidencePath,
    });
    await writeFile(
      failurePath,
      `${JSON.stringify(
        {
          schemaVersion: "content-factory-current-turn-smoke.v1",
          status: "failed",
          generatedAt: new Date().toISOString(),
          error: {
            message: sanitizeText(
              error instanceof Error ? error.message : String(error),
            ),
            stack: sanitizeText(error instanceof Error ? error.stack : ""),
          },
          appServer: {
            binaryPath,
            dataDir: runtimeEnv.appServerDataDir,
            preferredDataDir: runtimeEnv.preferredDataDir,
            tempRoot: runtimeEnv.tempRoot,
            stdoutTail: (connected?.sidecar?.stdoutLines ?? [])
              .slice(-40)
              .map(sanitizeText),
            stderrTail: (connected?.sidecar?.stderrLines ?? [])
              .slice(-40)
              .map(sanitizeText),
          },
          contentFactoryDir: options.contentFactoryDir,
          diagnostics: sanitizeJson(failureDiagnostics),
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    error.failurePath = failurePath;
    throw error;
  } finally {
    await connected?.sidecar.close().catch(() => undefined);
    await hostGenerationFixture?.close().catch(() => undefined);
  }
}

let options;
try {
  options = parseArgs(process.argv.slice(2));
  const result = await runSmoke(options);
  console.log(
    [
      "[content-factory-current-turn-smoke] status=passed",
      `events=${result.evidence.currentTurn.eventTypes.length}`,
      `partials=${result.evidence.currentTurn.streamingDocumentLengths.length}`,
      `workflowEvents=${result.evidence.eventLogs.workflowEventCount}`,
      `hostGeneration=${result.evidence.currentTurn.hostManagedGenerationStatus || "none"}`,
    ].join(" "),
  );
  console.log(
    `[content-factory-current-turn-smoke] evidence=${result.evidencePath}`,
  );
  if (result.evidence.eventLogs.workflowJsonl) {
    console.log(
      `[content-factory-current-turn-smoke] workflowJsonl=${result.evidence.eventLogs.workflowJsonl}`,
    );
  }
} catch (error) {
  if (error?.failurePath) {
    console.error(
      `[content-factory-current-turn-smoke] failureEvidence=${error.failurePath}`,
    );
  }
  console.error(
    `[content-factory-current-turn-smoke] failed: ${
      error instanceof Error ? error.message : String(error)
    }`,
  );
  process.exit(1);
}
