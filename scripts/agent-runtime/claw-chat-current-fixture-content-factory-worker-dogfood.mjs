import fs from "node:fs";
import path from "node:path";
import {
  startContentFactoryHostGenerationFixture,
} from "../lib/content-factory-host-generation-fixture.mjs";
import {
  APP_SERVER_METHOD_PLUGIN_INSTALLED_SAVE,
  APP_SERVER_METHOD_SESSION_READ,
  APP_SERVER_METHOD_SESSION_TURN_START,
  CONTENT_FACTORY_ARTICLE_WORKSPACE_ARTICLE_ARTIFACT_ID,
  CONTENT_FACTORY_ARTICLE_WORKSPACE_WORKER_ACTION_KEY,
} from "./claw-chat-current-fixture-constants.mjs";
import { invokeAppServerFromPage } from "./claw-chat-current-fixture-rpc.mjs";
import { assert, sanitizeJson } from "./claw-chat-current-fixture-utils.mjs";

const WORKER_APP_ID = "content-factory-app";
const ARTICLE_OBJECT_ID = "article-1";

export async function saveWorkspacePatchWorkerInstalledState(page, requestLog) {
  const state = buildWorkspacePatchInstalledState();
  const response = await invokeAppServerFromPage(
    page,
    APP_SERVER_METHOD_PLUGIN_INSTALLED_SAVE,
    { state },
    requestLog,
  );

  return sanitizeJson({
    appId: response.result?.appId ?? response.result?.app_id ?? null,
    sourceKind:
      response.result?.identity?.sourceKind ??
      response.result?.identity?.source_kind ??
      null,
    sourceUri:
      response.result?.identity?.sourceUri ??
      response.result?.identity?.source_uri ??
      null,
    packageHash:
      response.result?.identity?.packageHash ??
      response.result?.identity?.package_hash ??
      null,
    disabled: response.result?.disabled ?? null,
  });
}

export async function runWorkspacePatchWorkerDogfoodTurn({
  page,
  options,
  workspace,
  requestLog,
  identity,
  hostGenerationFixture: providedHostGenerationFixture,
}) {
  const hostGenerationFixture =
    providedHostGenerationFixture ??
    (await startContentFactoryHostGenerationFixture());
  const ownsHostGenerationFixture = !providedHostGenerationFixture;
  try {
    assert(identity?.threadId, "内容工厂 worker fixture 缺少 canonical threadId");
    assert(identity?.sessionId, "内容工厂 worker fixture 缺少 canonical sessionId");
    const response = await invokeAppServerFromPage(
      page,
      APP_SERVER_METHOD_SESSION_TURN_START,
      {
        threadId: identity.threadId,
        clientUserMessageId: `content-factory-worker-${identity.sessionId}`,
        input: [
          {
            type: "text",
            text: "通过已安装内容工厂 worker 写一篇完整公众号文章。",
          },
        ],
        cwd: workspace.rootPath,
        runtimeWorkspaceRoots: [workspace.rootPath],
        approvalPolicy: "never",
        sandboxPolicy: "workspace-write",
        additionalContext: {
          metadata: {
            kind: "application",
            value: JSON.stringify(
              buildArticleWorkspaceWorkerMetadata(workspace, identity),
            ),
          },
        },
      },
      requestLog,
    );

    const eventTypes = response.messages
      .map((message) =>
        message?.method === "turn/completed"
          ? "turn.completed"
          : message?.method,
      )
      .filter(Boolean);
    const turn =
      response.result?.turn && typeof response.result.turn === "object"
        ? response.result.turn
        : {};
    const turnId = String(turn.id ?? turn.turnId ?? turn.turn_id ?? "").trim();
    assert(turnId, "turn/start 未返回内容工厂 worker canonical turn.id");
    const taskId = `${turnId}:${CONTENT_FACTORY_ARTICLE_WORKSPACE_WORKER_ACTION_KEY}`;
    const readModel = options
      ? await waitForWorkspacePatchWorkerTurnCompleted(
          page,
          options,
          requestLog,
          { threadId: identity.threadId, turnId },
        )
      : null;

    return sanitizeJson({
      method: APP_SERVER_METHOD_SESSION_TURN_START,
      sessionId: identity.sessionId,
      threadId: identity.threadId,
      turnId,
      turnStatus: turn.status ?? null,
      taskId,
      eventTypes,
      completed: eventTypes.includes("turn.completed"),
      artifactSnapshotEmitted: eventTypes.includes("artifact.snapshot"),
      runtimeErrorEmitted: eventTypes.includes("runtime.error"),
      hostGenerationFixture: hostGenerationFixture.summary(),
      readModel,
    });
  } finally {
    if (ownsHostGenerationFixture) {
      await hostGenerationFixture.close();
    }
  }
}

async function waitForWorkspacePatchWorkerTurnCompleted(
  page,
  options,
  requestLog,
  identity,
) {
  const startedAt = Date.now();
  let lastSummary = null;
  while (Date.now() - startedAt < options.timeoutMs) {
    const readModel = await invokeAppServerFromPage(
      page,
      APP_SERVER_METHOD_SESSION_READ,
      {
        threadId: identity.threadId,
        includeTurns: true,
      },
      requestLog,
    );
    const summary = summarizeWorkspacePatchWorkerTurnReadModel(
      readModel.result,
      identity.turnId,
    );
    lastSummary = summary;
    if (
      ["completed", "failed", "canceled"].includes(summary.workerTurnStatus) &&
      !summary.hasActiveTurn
    ) {
      return summary;
    }
    await new Promise((resolve) => setTimeout(resolve, options.intervalMs));
  }
  throw new Error(
    `内容工厂 worker turn 未完成: ${JSON.stringify(sanitizeJson(lastSummary))}`,
  );
}

function summarizeWorkspacePatchWorkerTurnReadModel(result, workerTurnId) {
  const detail =
    result?.detail && typeof result.detail === "object" ? result.detail : {};
  const thread =
    result?.thread && typeof result.thread === "object" ? result.thread : {};
  const threadRead =
    detail.threadRead && typeof detail.threadRead === "object"
      ? detail.threadRead
      : detail.thread_read && typeof detail.thread_read === "object"
        ? detail.thread_read
        : thread;
  const turns = Array.isArray(threadRead.turns)
    ? threadRead.turns
    : Array.isArray(thread.turns)
      ? thread.turns
      : [];
  const workerTurn = turns.find(
    (turn) =>
      (turn?.turnId ?? turn?.turn_id ?? turn?.id) ===
      workerTurnId,
  );
  return sanitizeJson({
    hasActiveTurn: Boolean(
      threadRead.active_turn_id ?? threadRead.activeTurnId,
    ),
    workerTurnStatus: workerTurn?.status ?? null,
    workerTurnId:
      workerTurn?.turnId ?? workerTurn?.turn_id ?? workerTurn?.id ?? null,
  });
}

function buildWorkspacePatchInstalledState() {
  const fixtureRoot = resolveFixtureRoot();
  const manifest = JSON.parse(
    fs.readFileSync(path.join(fixtureRoot, "content-factory-app.json"), "utf8"),
  );
  const timestamp = new Date().toISOString();
  return {
    schemaVersion: "plugin.installed-state.v1",
    appId: WORKER_APP_ID,
    installMode: "runtime_backed",
    disabled: false,
    identity: {
      appId: WORKER_APP_ID,
      appVersion: manifest.version,
      sourceKind: "local_folder",
      sourceUri: fixtureRoot,
      packageHash: "sha256:content-factory-local-fixture",
      manifestHash: "sha256:content-factory-local-manifest-fixture",
      loadedAt: timestamp,
    },
    manifest,
    setup: {},
    installedAt: timestamp,
    updatedAt: timestamp,
  };
}

function buildArticleWorkspaceWorkerMetadata(workspace, identity) {
  return {
    plugin: {
      source: "right_surface_article_workspace",
      app_id: WORKER_APP_ID,
      session_id: identity.sessionId,
      thread_id: identity.threadId,
      workspace_id: workspace.workspaceId,
      article_workspace_action: {
        key: CONTENT_FACTORY_ARTICLE_WORKSPACE_WORKER_ACTION_KEY,
        intent: "write_article",
        risk: "write",
        task_kind: "content.article.generate",
        output_artifact_kind: "content_factory.workspace_patch",
        prompt:
          "写一篇关于内容工厂插件化写文章的公众号文章。要求先完成资料检索、标题候选、文章大纲、正文草稿、配图占位、引用来源和交付检查，并把完整正文写入右侧文章框。",
        object: {
          app_id: WORKER_APP_ID,
          kind: "articleDraft",
          id: ARTICLE_OBJECT_ID,
          session_id: identity.sessionId,
          artifact_ids: [CONTENT_FACTORY_ARTICLE_WORKSPACE_ARTICLE_ARTIFACT_ID],
          preview_artifact_id:
            CONTENT_FACTORY_ARTICLE_WORKSPACE_ARTICLE_ARTIFACT_ID,
        },
      },
    },
    right_surface: {
      surface_kind: "articleWorkspace",
      source: "article_workspace",
      action_key: CONTENT_FACTORY_ARTICLE_WORKSPACE_WORKER_ACTION_KEY,
    },
  };
}

function resolveFixtureRoot() {
  return path.resolve(process.cwd(), "src/features/plugin/testing/fixtures");
}
