#!/usr/bin/env node

import { access, mkdtemp, rm, stat } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { localAppServerBinaryPath } from "../lib/electron-dev-sidecar.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "../..");
const clientDistPath = path.join(
  rootDir,
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

const devBinaryPath = localAppServerBinaryPath({ repoRoot: rootDir });
const defaultProjectPath = path.join(
  homedir(),
  "Documents",
  "dev",
  "ai",
  "limecloud",
  "content-studio",
);

async function main() {
  const projectPath =
    process.env.CODEX_IMPORT_SMOKE_PROJECT_PATH || defaultProjectPath;
  const sourceRoot =
    process.env.CODEX_IMPORT_SMOKE_SOURCE_ROOT ||
    process.env.CODEX_HOME ||
    path.join(homedir(), ".codex");

  await assertDirectory(projectPath, "Codex import smoke project path");
  await assertDirectory(sourceRoot, "source home");
  await assertFile(path.join(sourceRoot, "state_5.sqlite"), "source state DB");

  const binaryResolution = resolveSidecarBinaryPath({
    devBinaryPath,
  });
  const binaryPath = binaryResolution?.binaryPath;
  if (!binaryPath) {
    throw new Error("app-server binary path could not be resolved");
  }
  await assertFile(binaryPath, "app-server binary");
  const initializeTimeoutMs = Number(
    process.env.CODEX_IMPORT_SMOKE_INIT_TIMEOUT_MS || 60_000,
  );
  const previewTimeoutMs = Number(
    process.env.CODEX_IMPORT_SMOKE_PREVIEW_TIMEOUT_MS || 30_000,
  );
  const commitTimeoutMs = Number(
    process.env.CODEX_IMPORT_SMOKE_COMMIT_TIMEOUT_MS || 120_000,
  );
  const readTimeoutMs = Number(
    process.env.CODEX_IMPORT_SMOKE_READ_TIMEOUT_MS || 30_000,
  );
  const dataDir = await resolveSmokeDataDir();

  console.log(
    `[smoke:codex-import-content-studio] using app-server=${binaryPath} source=${binaryResolution.source} dataDir=${dataDir.path} initializeTimeoutMs=${initializeTimeoutMs} previewTimeoutMs=${previewTimeoutMs} commitTimeoutMs=${commitTimeoutMs} readTimeoutMs=${readTimeoutMs}`,
  );

  const connected = await connectAppServerSidecar(
    {
      ...stdioSidecar(binaryPath, undefined, dataDir.path),
      backendMode: "unavailable",
    },
    {
      clientInfo: {
        name: "codex_import_content_studio_smoke",
        version: "1.60.0",
      },
      capabilities: {
        eventMethods: [METHOD_AGENT_SESSION_EVENT],
      },
    },
    {
      initializeTimeoutMs,
      expectedProtocolVersion: PROTOCOL_VERSION,
    },
  );

  try {
    const connection = connected.connection;
    const scanResult = await connection.scanConversationImportSource(
      {
        sourceClient: "codex",
        sourceRoot,
        projectPath,
        includeArchived: false,
        limit: 20,
      },
      { timeoutMs: 10_000 },
    );
    const threads = scanResult.result.threads;
    assertEqual(scanResult.result.source.status, "ready", "source status");
    assertAtLeast(threads.length, 1, "content-studio source thread count");
    assertAtLeast(
      scanResult.result.source.threadCount,
      threads.length,
      "source thread count",
    );

    assertEqual(
      scanResult.result.source.threadCount,
      threads.length,
      "all content-studio threads should fit in smoke page",
    );
    const selectedThread = selectThread(threads);
    assertEqual(selectedThread.cwd, projectPath, "selected thread cwd");
    if (!selectedThread.sourcePath) {
      throw new Error(
        `selected thread ${selectedThread.sourceThreadId} is missing sourcePath`,
      );
    }
    await assertFile(selectedThread.sourcePath, "selected source rollout");

    const previewResult = await connection.previewConversationImportThread(
      {
        sourceClient: "codex",
        sourceRoot,
        sourceThreadId: selectedThread.sourceThreadId,
        limit: 40,
      },
      { timeoutMs: previewTimeoutMs },
    );
    assertEqual(
      previewResult.result.thread.sourceThreadId,
      selectedThread.sourceThreadId,
      "preview thread id",
    );
    assertAtLeast(
      previewResult.result.summary.lineCount,
      1,
      "preview line count",
    );
    assertAtLeast(
      previewResult.result.summary.messageCount,
      1,
      "preview message count",
    );
    assertDryRunSummary(previewResult.result.summary, {
      label: "selected preview dry-run summary",
      expectCreatesSession: true,
    });
    assert(
      previewResult.result.messages.some((message) => message.role === "user"),
      "preview should include at least one user message",
    );

    await expectRejects(
      () =>
        connection.commitConversationImportThread(
          {
            sourceClient: "codex",
            sourceRoot,
            sourceThreadId: selectedThread.sourceThreadId,
            appId: "content-studio",
            workspaceId: "codex-import-smoke-content-studio",
            confirmed: false,
          },
          { timeoutMs: 10_000 },
        ),
      "explicit user confirmation",
    );

    const importStats = await importAllThreads({
      connection,
      sourceRoot,
      projectPath,
      threads,
      previewTimeoutMs,
      commitTimeoutMs,
      readTimeoutMs,
    });
    assertAtLeast(importStats.importedThreads, 1, "imported thread count");
    assertEqual(
      importStats.importedThreads,
      threads.length,
      "all scanned content-studio threads imported",
    );
    assertAtLeast(importStats.importedMessages, 1, "imported messages");
    assertAtLeast(importStats.importedTurns, 1, "imported turns");
    assertAtLeast(
      importStats.multimodalThreads,
      1,
      "content-studio multimodal thread coverage",
    );
    assertAtLeast(
      importStats.modelMetadataThreads,
      1,
      "content-studio model metadata coverage",
    );
    assert(importStats.idempotencyChecked, "idempotency check should run");

    console.log(
      [
        "[smoke:codex-import-content-studio] ok",
        `threads=${scanResult.result.source.threadCount}`,
        `importedThreads=${importStats.importedThreads}`,
        `messages=${importStats.importedMessages}`,
        `turns=${importStats.importedTurns}`,
        `multimodalThreads=${importStats.multimodalThreads}`,
        `modelMetadataThreads=${importStats.modelMetadataThreads}`,
        `sourceRoot=${sourceRoot}`,
        `projectPath=${projectPath}`,
      ].join(" "),
    );
  } finally {
    await connected.sidecar.close();
    await dataDir.cleanup();
  }
}

async function resolveSmokeDataDir() {
  const explicitDataDir = process.env.CODEX_IMPORT_SMOKE_DATA_DIR?.trim();
  if (explicitDataDir) {
    return {
      path: explicitDataDir,
      cleanup: async () => {},
    };
  }

  const dataDir = await mkdtemp(
    path.join(tmpdir(), "codex-import-content-studio-app-server-"),
  );
  const keepDataDir = process.env.CODEX_IMPORT_SMOKE_KEEP_DATA_DIR === "1";
  return {
    path: dataDir,
    cleanup: async () => {
      if (!keepDataDir) {
        await rm(dataDir, { recursive: true, force: true });
      }
    },
  };
}

function selectThread(threads) {
  const multimodal = threads.find((thread) =>
    String(thread.title || "").includes("[Image"),
  );
  return multimodal || threads[0];
}

async function importAllThreads({
  connection,
  sourceRoot,
  projectPath,
  threads,
  previewTimeoutMs,
  commitTimeoutMs,
  readTimeoutMs,
}) {
  const stats = {
    importedThreads: 0,
    importedMessages: 0,
    importedTurns: 0,
    multimodalThreads: 0,
    modelMetadataThreads: 0,
    idempotencyChecked: false,
  };

  for (const thread of threads) {
    console.log(
      `[smoke:codex-import-content-studio] importing ${stats.importedThreads + 1}/${threads.length} ${thread.sourceThreadId}`,
    );
    assertEqual(thread.sourceClient, "codex", "thread source client");
    assertEqual(thread.importStatus, "not_imported", "thread import status");
    assertEqual(thread.archived, false, "thread archived flag");
    assertCodexMetadata(thread.metadata);
    if (!thread.sourcePath) {
      throw new Error(`thread ${thread.sourceThreadId} is missing sourcePath`);
    }
    await assertFile(thread.sourcePath, `source rollout ${thread.sourceThreadId}`);

    const previewResult = await connection.previewConversationImportThread(
      {
        sourceClient: "codex",
        sourceRoot,
        sourceThreadId: thread.sourceThreadId,
        limit: 100,
      },
      { timeoutMs: previewTimeoutMs },
    );
    const preview = previewResult.result;
    assertEqual(
      preview.thread.sourceThreadId,
      thread.sourceThreadId,
      "preview thread id",
    );
    assertAtLeast(preview.summary.lineCount, 1, "preview line count");
    assertAtLeast(preview.summary.messageCount, 1, "preview message count");
    assertDryRunSummary(preview.summary, {
      label: `preview ${thread.sourceThreadId} dry-run summary`,
      expectCreatesSession: true,
    });
    assert(
      preview.messages.some((message) => message.role === "user"),
      `preview ${thread.sourceThreadId} should include a user message`,
    );

    const previewAttachmentCount = preview.messages.reduce(
      (count, message) => count + message.attachments.length,
      0,
    );
    const hasPreviewAttachments = preview.messages.some(
      (message) => message.attachments.length > 0,
    );
    if (hasPreviewAttachments) {
      stats.multimodalThreads += 1;
      assertAtLeast(
        preview.summary.dryRun.willImportAttachments,
        previewAttachmentCount,
        `preview ${thread.sourceThreadId} dry-run attachment count`,
      );
    }
    if (thread.metadata?.model) {
      stats.modelMetadataThreads += 1;
    }

    const commitResult = await connection.commitConversationImportThread(
      {
        sourceClient: "codex",
        sourceRoot,
        sourceThreadId: thread.sourceThreadId,
        appId: "content-studio",
        workspaceId: "codex-import-smoke-content-studio",
        confirmed: true,
      },
      { timeoutMs: commitTimeoutMs },
    );
    if (commitResult.error) {
      throw new Error(
        `confirmed import failed for ${thread.sourceThreadId}: ${commitResult.error.message}`,
      );
    }
    const commit = commitResult.result;
    assertEqual(commit.thread.importStatus, "imported", "import status");
    assertEqual(commit.session.appId, "content-studio", "session app id");
    assertEqual(
      commit.session.workspaceId,
      "codex-import-smoke-content-studio",
      "session workspace id",
    );
    assertAtLeast(commit.importedMessages, 1, "imported messages");
    assertAtLeast(commit.importedTurns, 1, "imported turns");
    assertEqual(
      commit.summary.dryRun.willImportMessages,
      commit.importedMessages,
      "commit dry-run imported messages",
    );
    assertEqual(
      commit.summary.dryRun.willImportTurns,
      commit.importedTurns,
      "commit dry-run imported turns",
    );
    assert(commit.canContinue, "imported session should be continuable");
    assertCodexMetadata(commit.thread.metadata, thread.metadata);

    const readResult = await connection.readSession(
      { sessionId: commit.session.sessionId },
      { timeoutMs: readTimeoutMs },
    );
    const messages = Array.isArray(readResult.result.detail?.messages)
      ? readResult.result.detail.messages
      : [];
    assertAtLeast(messages.length, 1, "read model message count");
    assert(
      messages.some((message) => message.role === "user"),
      `read model ${thread.sourceThreadId} should include imported user message`,
    );
    if (hasPreviewAttachments) {
      assert(
        messages.some(
          (message) =>
            message.role === "user" &&
            Array.isArray(message.attachments) &&
            message.attachments.length > 0,
        ),
        `read model ${thread.sourceThreadId} should preserve imported user attachments`,
      );
    }

    const businessMetadata = commit.session.businessObjectRef?.metadata || {};
    assertEqual(
      businessMetadata.sourceThreadId,
      thread.sourceThreadId,
      "business object source thread id",
    );
    if (thread.metadata?.model) {
      assertEqual(
        businessMetadata.modelName,
        thread.metadata.model,
        "business object model name",
      );
    }

    if (!stats.idempotencyChecked) {
      const duplicateCommit = await connection.commitConversationImportThread(
        {
          sourceClient: "codex",
          sourceRoot,
          sourceThreadId: thread.sourceThreadId,
          appId: "content-studio",
          workspaceId: "codex-import-smoke-content-studio",
          confirmed: true,
        },
        { timeoutMs: commitTimeoutMs },
      );
      assertEqual(
        duplicateCommit.result.session.sessionId,
        commit.session.sessionId,
        "duplicate import session id",
      );
      assertEqual(
        duplicateCommit.result.thread.importStatus,
        "imported",
        "duplicate import status",
      );
      assertEqual(
        duplicateCommit.result.summary.dryRun.willCreateSession,
        false,
        "duplicate import dry-run create flag",
      );
      assertEqual(
        duplicateCommit.result.summary.dryRun.willAppendToExistingSession,
        true,
        "duplicate import dry-run append flag",
      );
      stats.idempotencyChecked = true;
    }

    stats.importedThreads += 1;
    stats.importedMessages += commit.importedMessages;
    stats.importedTurns += commit.importedTurns;
  }

  const rescan = await connection.scanConversationImportSource(
    {
      sourceClient: "codex",
      sourceRoot,
      projectPath,
      includeArchived: false,
      limit: 20,
    },
    { timeoutMs: previewTimeoutMs },
  );
  assertEqual(
    rescan.result.threads.length,
    threads.length,
    "rescan thread count",
  );
  for (const thread of rescan.result.threads) {
    assertEqual(thread.importStatus, "imported", "rescan import status");
  }

  return stats;
}

function assertDryRunSummary(summary, { label, expectCreatesSession }) {
  const dryRun = summary?.dryRun;
  assert(dryRun && typeof dryRun === "object", `${label} missing dryRun`);
  assertEqual(
    dryRun.willCreateSession,
    expectCreatesSession,
    `${label} create session flag`,
  );
  assertEqual(
    dryRun.willAppendToExistingSession,
    !expectCreatesSession,
    `${label} append existing flag`,
  );
  assertAtLeast(dryRun.willImportTurns, 1, `${label} imported turns`);
  assertAtLeast(
    dryRun.willImportMessages,
    dryRun.willImportTurns,
    `${label} imported messages`,
  );
  assertAtLeast(
    dryRun.willImportTimelineItems,
    summary.messageCount,
    `${label} timeline items`,
  );
  assertEqual(
    dryRun.unsupportedItems,
    summary.unsupportedCount,
    `${label} unsupported items`,
  );
}

function assertCodexMetadata(actual, fallback) {
  const metadata = actual || fallback || {};
  if (metadata.model !== undefined) {
    assert(typeof metadata.model === "string", "source model should be a string");
  }
  if (metadata.reasoningEffort !== undefined) {
    assert(
      typeof metadata.reasoningEffort === "string",
      "source reasoningEffort should be a string",
    );
  }
  if (metadata.cliVersion !== undefined) {
    assert(
      typeof metadata.cliVersion === "string",
      "source cliVersion should be a string",
    );
  }
}

async function assertDirectory(targetPath, label) {
  const stats = await stat(targetPath).catch(() => null);
  if (!stats?.isDirectory()) {
    throw new Error(`${label} is not a readable directory: ${targetPath}`);
  }
}

async function assertFile(targetPath, label) {
  try {
    await access(targetPath);
  } catch {
    throw new Error(`${label} is missing: ${targetPath}`);
  }
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`unexpected ${label}: expected ${expected}, got ${actual}`);
  }
}

function assertAtLeast(actual, expected, label) {
  if (!(actual >= expected)) {
    throw new Error(
      `unexpected ${label}: expected at least ${expected}, got ${actual}`,
    );
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function expectRejects(action, expectedMessage) {
  try {
    await action();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    assert(
      message.includes(expectedMessage),
      `unexpected rejection: expected "${expectedMessage}", got "${message}"`,
    );
    return;
  }
  throw new Error("expected operation to reject");
}

main().catch((error) => {
  console.error(
    `[smoke:codex-import-content-studio] failed: ${
      error instanceof Error ? error.message : String(error)
    }`,
  );
  process.exitCode = 1;
});
