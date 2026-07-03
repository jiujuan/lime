#!/usr/bin/env node

import {
  access,
  copyFile,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  writeFile,
} from "node:fs/promises";
import fs from "node:fs";
import { webcrypto } from "node:crypto";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  contentFactoryHostGenerationAsterChatRequest,
  startContentFactoryHostGenerationFixture,
} from "../lib/content-factory-host-generation-fixture.mjs";
import { localAppServerBinaryPath } from "../lib/electron-dev-sidecar.mjs";

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
const CLOUD_RELEASE_FIXTURE_SIGNATURE_PAYLOAD_SCHEMA =
  "agent-app-cloud-release-signature-payload/v2";

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
  evidenceDir: path.join(repoRoot, ".lime", "qc", "gui-evidence", "agent-apps"),
  prefix: "content-factory-current-turn-smoke",
  timeoutMs: DEFAULT_TIMEOUT_MS,
  hostGenerationFixture: false,
  cloudReleaseFixture: false,
};

function printHelp() {
  console.log(`Usage:
  node scripts/agent-app/content-factory-current-turn-smoke.mjs [options]

Options:
  --app-server-bin <path>      app-server binary, default APP_SERVER_BIN or lime-rs target
  --content-factory-dir <dir>  external content-factory-app directory
  --evidence-dir <dir>         evidence output directory
  --prefix <name>              evidence filename prefix
  --timeout-ms <ms>            timeout, default 120000
  --host-generation-fixture    use a local OpenAI-compatible SSE fixture and require host generation completed
  --cloud-release-fixture      save as verified cloud_release and materialize the package cache
  -h, --help                   print help
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
    if (arg === "--cloud-release-fixture") {
      options.cloudReleaseFixture = true;
      continue;
    }
    throw new Error(`Unsupported argument: ${arg}`);
  }
  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs < 30_000) {
    throw new Error("--timeout-ms must be >= 30000");
  }
  return options;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function assertFile(filePath, label) {
  try {
    await access(filePath);
  } catch {
    throw new Error(
      [
        `${label} missing: ${filePath}`,
        label === "app-server binary"
          ? 'Build it first: cargo build --manifest-path "lime-rs/Cargo.toml" -p app-server --bin app-server'
          : "",
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }
}

async function assertDirectory(dirPath, label) {
  const stat = await fs.promises.stat(dirPath).catch(() => null);
  if (!stat?.isDirectory()) {
    throw new Error(`${label} missing: ${dirPath}`);
  }
}

function createTempRuntimeEnv() {
  const tempRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "content-factory-current-turn-"),
  );
  const home = path.join(tempRoot, "home");
  const xdgDataHome = path.join(tempRoot, "xdg-data");
  const localAppData = path.join(tempRoot, "local-app-data");
  const roamingAppData = path.join(tempRoot, "roaming-app-data");
  for (const dir of [home, xdgDataHome, localAppData, roamingAppData]) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const preferredDataDir = resolveTempPreferredDataDir({
    home,
    xdgDataHome,
    localAppData,
    platform: process.platform,
  });
  const appServerDataDir = path.join(preferredDataDir, "app-server");
  fs.mkdirSync(appServerDataDir, { recursive: true });
  return {
    tempRoot,
    preferredDataDir,
    appServerDataDir,
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

function buildInstalledState(inspected) {
  const now = new Date().toISOString();
  const appId =
    stringField(inspected.manifest, ["appId"]) ||
    stringField(inspected.manifest, ["name"]) ||
    APP_ID;
  const appVersion =
    stringField(inspected.manifest, ["version"]) ||
    stringField(inspected.pluginManifest, ["version"]) ||
    "0.0.0";
  return {
    schemaVersion: "agent-app.installed-state.v1",
    appId,
    installMode: "runtime_backed",
    disabled: false,
    identity: {
      appId,
      appVersion,
      sourceKind: inspected.sourceKind || "local_folder",
      sourceUri: inspected.appDir || inspected.sourceUri,
      packageHash: inspected.packageHash,
      manifestHash: inspected.manifestHash,
      loadedAt: inspected.inspectedAt || now,
    },
    manifest: inspected.manifest,
    setup: {},
    installedAt: now,
    updatedAt: now,
  };
}

async function buildCloudReleaseFixture(inspected) {
  const now = new Date().toISOString();
  const appId =
    stringField(inspected.manifest, ["appId"]) ||
    stringField(inspected.manifest, ["name"]) ||
    APP_ID;
  const appVersion =
    stringField(inspected.manifest, ["version"]) ||
    stringField(inspected.pluginManifest, ["version"]) ||
    "0.0.0";
  const releaseId = `content-factory-fixture-${appVersion}`;
  const tenantId = "tenant-content-factory-fixture";
  const tenantEnablementRef = "tenant-enable-content-factory-fixture";
  const channel = "fixture";
  const signatureRef = `sigstore:${appId}@${appVersion}:fixture`;
  const packageUrl = `https://updates.limeai.run/agent-apps/${appId}/fixture/${appId}-${appVersion}.lapp`;
  const proofDraft = {
    schemaVersion: "agent-app-cloud-release-signature/v1",
    publicKeyId: "agent-app-fixture-root-2026",
    algorithm: "RSASSA-PKCS1-v1_5-SHA256",
    signature: "",
    signedAt: now,
  };
  const keyPair = await webcrypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  );
  const publicKey = await webcrypto.subtle.exportKey("spki", keyPair.publicKey);
  const signaturePayload = cloudReleaseSignaturePayload({
    appId,
    appVersion,
    releaseId,
    tenantId,
    tenantEnablementRef,
    channel,
    packageUrl,
    packageHash: inspected.packageHash,
    manifestHash: inspected.manifestHash,
    signatureRef,
    proof: proofDraft,
  });
  const signature = await webcrypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    keyPair.privateKey,
    new TextEncoder().encode(signaturePayload),
  );
  const proof = {
    ...proofDraft,
    signature: Buffer.from(signature).toString("base64"),
  };
  const trustRoot = {
    publicKeyId: proof.publicKeyId,
    algorithm: proof.algorithm,
    publicKey: Buffer.from(publicKey).toString("base64"),
    appIds: [appId],
    notBefore: "2026-01-01T00:00:00.000Z",
    notAfter: "2026-12-31T23:59:59.999Z",
  };
  const verified = await webcrypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    keyPair.publicKey,
    signature,
    new TextEncoder().encode(
      cloudReleaseSignaturePayload({
        appId,
        appVersion,
        releaseId,
        tenantId,
        tenantEnablementRef,
        channel,
        packageUrl,
        packageHash: inspected.packageHash,
        manifestHash: inspected.manifestHash,
        signatureRef,
        proof,
      }),
    ),
  );
  assert(verified, "cloud release fixture signature verification failed");
  return {
    appId,
    appVersion,
    releaseId,
    tenantId,
    tenantEnablementRef,
    channel,
    packageUrl,
    signatureRef,
    signatureProof: proof,
    trustRoot,
    loadedAt: inspected.inspectedAt || now,
  };
}

function cloudReleaseSignaturePayload({
  appId,
  appVersion,
  releaseId,
  tenantId,
  tenantEnablementRef,
  channel,
  packageUrl,
  packageHash,
  manifestHash,
  signatureRef,
  proof,
}) {
  return JSON.stringify({
    schemaVersion: CLOUD_RELEASE_FIXTURE_SIGNATURE_PAYLOAD_SCHEMA,
    appId,
    version: appVersion,
    releaseId,
    tenantId,
    tenantEnablementRef,
    channel,
    packageUrl,
    packageHash: packageHash.toLowerCase(),
    manifestHash: manifestHash.toLowerCase(),
    signatureRef,
    signatureProof: {
      schemaVersion: proof.schemaVersion ?? null,
      publicKeyId: proof.publicKeyId,
      algorithm: proof.algorithm,
      signedAt: proof.signedAt ?? null,
    },
  });
}

function buildCloudReleaseInstalledState(inspected, cloudRelease) {
  const now = new Date().toISOString();
  return {
    schemaVersion: "agent-app.installed-state.v1",
    appId: cloudRelease.appId,
    installMode: "runtime_backed",
    disabled: false,
    identity: {
      appId: cloudRelease.appId,
      appVersion: cloudRelease.appVersion,
      sourceKind: "cloud_release",
      sourceUri: cloudRelease.packageUrl,
      packageHash: inspected.packageHash,
      manifestHash: inspected.manifestHash,
      loadedAt: cloudRelease.loadedAt,
      releaseId: cloudRelease.releaseId,
      tenantId: cloudRelease.tenantId,
      tenantEnablementRef: cloudRelease.tenantEnablementRef,
      channel: cloudRelease.channel,
      signatureRef: cloudRelease.signatureRef,
    },
    manifest: inspected.manifest,
    setup: {
      cloudReleaseEvidence: {
        appId: cloudRelease.appId,
        version: cloudRelease.appVersion,
        catalogSource: "remote",
        sourceKind: "verified_cache",
        packageHashDeclared: true,
        manifestHashDeclared: true,
        signatureDeclared: true,
        declaredPackageHash: inspected.packageHash,
        declaredManifestHash: inspected.manifestHash,
        actualPackageHash: inspected.packageHash,
        actualManifestHash: inspected.manifestHash,
        packageHashMatched: true,
        manifestHashMatched: true,
        signatureRef: cloudRelease.signatureRef,
        signaturePolicy: "required",
        signatureVerificationStatus: "verified",
        packageVerificationStatus: "verified",
        status: "ready",
        blockerCodes: [],
        warningCodes: [],
      },
      cloudReleaseSignature: {
        signatureRef: cloudRelease.signatureRef,
        signatureProof: cloudRelease.signatureProof,
        trustRoot: cloudRelease.trustRoot,
      },
    },
    installedAt: now,
    updatedAt: now,
  };
}

async function materializeCloudReleasePackageCache({
  sourceDir,
  preferredDataDir,
  packageHash,
}) {
  const cacheDir = path.join(
    preferredDataDir,
    "agent-apps",
    "packages",
    safeHashPathSegment(packageHash),
  );
  await mkdir(cacheDir, { recursive: true });
  const entries = [
    "package.json",
    "plugin.json",
    "app.boundary.yaml",
    "app.install.yaml",
    "app.operations.yaml",
    "app.requirements.yaml",
    "app.runtime.yaml",
    "app.workbench.yaml",
    "artifacts",
    "cli",
    "clis",
    "connectors",
    "docs",
    "examples",
    "hooks",
    "locales",
    "resources",
    "scripts",
    "skills",
    "src",
    "subagents",
    "workflows",
  ];
  for (const entry of entries) {
    const sourcePath = path.join(sourceDir, entry);
    if (!fs.existsSync(sourcePath)) {
      continue;
    }
    const targetPath = path.join(cacheDir, entry);
    const stat = await fs.promises.stat(sourcePath);
    if (stat.isDirectory()) {
      await cp(sourcePath, targetPath, {
        recursive: true,
        filter: (source) => !isIgnoredPackageCacheSource(source, sourceDir),
      });
    } else {
      await mkdir(path.dirname(targetPath), { recursive: true });
      await copyFile(sourcePath, targetPath);
    }
  }
  return cacheDir;
}

function isIgnoredPackageCacheSource(source, sourceRoot) {
  const relative = path.relative(sourceRoot, source).replace(/\\/g, "/");
  return (
    relative === ".git" ||
    relative.startsWith(".git/") ||
    relative === "dist-package" ||
    relative.startsWith("dist-package/") ||
    relative === "node_modules" ||
    relative.startsWith("node_modules/")
  );
}

function safeHashPathSegment(hash) {
  return String(hash).replace(/:/g, "_");
}

function evidencePrefixForOptions(options) {
  const suffixes = [];
  if (options.cloudReleaseFixture) {
    suffixes.push("cloud-release");
  }
  if (options.hostGenerationFixture) {
    suffixes.push("host-generation");
  }
  return suffixes.length
    ? `${options.prefix}-${suffixes.join("-")}`
    : options.prefix;
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
        active_agent_app_id: APP_ID,
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

function turnRuntimeOptions({ sessionId, workspaceId, fixtureBaseUrl }) {
  const runtimeOptions = {
    stream: true,
    metadata: pluginActivationMetadata(sessionId, workspaceId),
  };
  if (fixtureBaseUrl) {
    runtimeOptions.hostOptions = {
      asterChatRequest:
        contentFactoryHostGenerationAsterChatRequest(fixtureBaseUrl),
    };
  }
  return runtimeOptions;
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

function artifactFromEvent(event) {
  return event?.payload?.artifact || null;
}

function workspacePatchFromArtifact(artifact) {
  return (
    artifact?.metadata?.contentFactoryWorkspacePatch ||
    artifact?.metadata?.workspace_patch ||
    artifact?.contentFactoryWorkspacePatch ||
    null
  );
}

function articleFromWorkspacePatch(patch) {
  return patch?.objects?.find((object) => object?.ref?.kind === "articleDraft");
}

function documentLengthFromArtifactEvent(event) {
  const article = articleFromWorkspacePatch(
    workspacePatchFromArtifact(artifactFromEvent(event)),
  );
  const text = article?.source?.documentText;
  return typeof text === "string" ? text.length : 0;
}

function assertCurrentTurnEvents(events, expectations = {}) {
  const types = events.map((event) => event.type || event.eventType);
  assert(types.includes("turn.accepted"), "turn.accepted event missing");
  assert(types.includes("message.delta"), "message.delta event missing");
  assert(types.includes("turn.completed"), "turn.completed event missing");
  assert(
    types.every((type) => !String(type).startsWith("workflow.")),
    `workflow events leaked to user event stream: ${types.join(",")}`,
  );
  assert(
    !types.includes("agent_app_worker.hook"),
    "worker hook event leaked to user event stream",
  );

  const artifactEvents = events.filter(
    (event) => (event.type || event.eventType) === "artifact.snapshot",
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
  assert(
    finalArticle?.source?.documentText,
    "final article documentText missing",
  );
  assert(
    finalArticle.source.finalMarkdown === finalArticle.source.documentText,
    "finalMarkdown must equal documentText",
  );
  const hostGenerationStatus =
    finalArticle.source.hostManagedGeneration?.status || null;
  if (expectations.hostGenerationCompleted) {
    assert(
      hostGenerationStatus === "completed",
      `hostManagedGeneration.status must be completed, got ${hostGenerationStatus}`,
    );
    assert(
      finalArticle.source.documentText.includes("fixturePromptFingerprint:"),
      "final article must use prompt-derived host generation fixture Markdown",
    );
  }
  return {
    eventTypes: types,
    artifactSnapshotCount: artifactEvents.length,
    streamingDocumentLengths: streamingLengths,
    finalDocumentLength: finalArticle.source.documentText.length,
    hostManagedGenerationStatus: hostGenerationStatus,
    hostManagedGenerationReasonCode:
      finalArticle.source.hostManagedGeneration?.reasonCode || null,
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
  const hostGenerationStatus =
    article.source.hostManagedGeneration?.status || null;
  if (expectations.hostGenerationCompleted) {
    assert(
      hostGenerationStatus === "completed",
      `read model hostManagedGeneration.status must be completed, got ${hostGenerationStatus}`,
    );
    assert(
      article.source.documentText.includes("fixturePromptFingerprint:"),
      "read model article must use prompt-derived host generation fixture Markdown",
    );
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
    workerEvidence.every((item) => item?.eventType !== "agent_app_worker.hook"),
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
  };
}

function artifactSummaryHasWorkspacePatch(artifact) {
  return Boolean(
    artifact?.metadata?.contentFactoryWorkspacePatch ||
    artifact?.metadata?.workspace_patch ||
    artifact?.metadata?.agentAppWorker?.outputArtifactKind ===
      WORKSPACE_PATCH_KIND,
  );
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
  const regularTypes = regularRecords.map(
    (record) => record.type || record.eventType,
  );
  assert(
    regularTypes.every((type) => !String(type).startsWith("workflow.")),
    `workflow event leaked to regular JSONL: ${regularTypes.join(",")}`,
  );
  assert(
    !regularTypes.includes("agent_app_worker.hook"),
    "worker hook event leaked to regular JSONL",
  );

  const workflowTypes = workflowRecords.map(
    (record) => record.type || record.eventType,
  );
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
  };
}

function sanitizeText(value) {
  const text = String(value ?? "")
    .replace(
      /((?:api[_-]?key|authorization|password|secret|session|token)[^=\s]*=)(["']?)[^\s"']+/gi,
      "$1$2[redacted]",
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

async function copyIfExists(sourcePath, targetPath) {
  if (!fs.existsSync(sourcePath)) {
    return null;
  }
  await writeFile(targetPath, await readFile(sourcePath, "utf8"), "utf8");
  return targetPath;
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

  const hostGenerationFixture = options.hostGenerationFixture
    ? await startContentFactoryHostGenerationFixture()
    : null;
  const backendMode = hostGenerationFixture ? "runtime" : "unavailable";
  let connected;

  try {
    connected = await connectAppServerSidecar(
      {
        ...stdioSidecar(binaryPath, undefined, runtimeEnv.appServerDataDir),
        backendMode,
        productDbMigrationCleanup: "drop-tables",
      },
      {
        clientInfo: {
          name: "content_factory_current_turn_smoke",
          version: "1.86.0",
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

    const connection = connected.connection;
    const inspect = await connection.inspectAgentAppLocalPackage(
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
    const installedState = cloudRelease
      ? buildCloudReleaseInstalledState(inspect.result, cloudRelease)
      : buildInstalledState(inspect.result);
    const save = await connection.saveAgentAppInstalled(
      { state: installedState },
      { timeoutMs: Math.min(options.timeoutMs, 30_000) },
    );
    assert(
      save.result?.appId === APP_ID,
      "installed state save appId mismatch",
    );

    const sessionId = `session_content_factory_current_${Date.now()}`;
    const threadId = `thread_content_factory_current_${Date.now()}`;
    const turnId = `turn_content_factory_current_${Date.now()}`;
    const workspaceId = "workspace-content-factory-current-smoke";
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
        }),
        queueIfBusy: false,
        skipPreSubmitResume: false,
      },
      { timeoutMs: options.timeoutMs },
    );
    assert(turn.result.turn.turnId === turnId, "turn id mismatch");
    assert(turn.result.turn.status === "completed", "turn status mismatch");

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
      hostGenerationCompleted: Boolean(hostGenerationFixture),
    });

    const read = await connection.readSession(
      { sessionId },
      { timeoutMs: 30_000 },
    );
    const readSummary = assertReadModel(read.result, {
      hostGenerationCompleted: Boolean(hostGenerationFixture),
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

    const safeSession = safeFileStem(sessionId);
    const regularEventPath = path.join(
      runtimeEnv.appServerDataDir,
      "runtime",
      "events",
      "sessions",
      `session_${safeSession}.jsonl`,
    );
    const workflowEventPath = path.join(
      runtimeEnv.appServerDataDir,
      "runtime",
      "events",
      "sessions",
      `session_${safeSession}`,
      "workflow-events.jsonl",
    );
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
      },
      evidenceExport: {
        eventCount: evidenceExport.result.events?.length || 0,
        artifactCount: evidenceExport.result.artifacts?.length || 0,
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
    await writeFile(
      failurePath,
      `${JSON.stringify(
        {
          schemaVersion: "content-factory-current-turn-smoke.v1",
          status: "failed",
          generatedAt: new Date().toISOString(),
          error: {
            message: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : "",
          },
          appServer: {
            binaryPath,
            dataDir: runtimeEnv.appServerDataDir,
            preferredDataDir: runtimeEnv.preferredDataDir,
            tempRoot: runtimeEnv.tempRoot,
            stderrTail: (connected?.sidecar.stderrLines ?? [])
              .slice(-40)
              .map(sanitizeText),
          },
          contentFactoryDir: options.contentFactoryDir,
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
