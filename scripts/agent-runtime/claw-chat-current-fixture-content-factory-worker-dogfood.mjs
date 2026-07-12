import fs from "node:fs";
import path from "node:path";
import {
  contentFactoryHostGenerationAgentRuntimeRequest,
  startContentFactoryHostGenerationFixture,
} from "../lib/content-factory-host-generation-fixture.mjs";
import {
  APP_SERVER_METHOD_PLUGIN_INSTALLED_SAVE,
  APP_SERVER_METHOD_SESSION_READ,
  APP_SERVER_METHOD_SESSION_TURN_START,
  CONTENT_FACTORY_ARTICLE_WORKSPACE_ARTICLE_ARTIFACT_ID,
  CONTENT_FACTORY_ARTICLE_WORKSPACE_SESSION_ID,
  CONTENT_FACTORY_ARTICLE_WORKSPACE_WORKER_ACTION_KEY,
  CONTENT_FACTORY_ARTICLE_WORKSPACE_WORKER_TASK_ID,
  CONTENT_FACTORY_ARTICLE_WORKSPACE_WORKER_TURN_ID,
} from "./claw-chat-current-fixture-constants.mjs";
import { invokeAppServerFromPage } from "./claw-chat-current-fixture-rpc.mjs";
import { sanitizeJson } from "./claw-chat-current-fixture-utils.mjs";

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
  hostGenerationFixture: providedHostGenerationFixture,
}) {
  const hostGenerationFixture =
    providedHostGenerationFixture ??
    (await startContentFactoryHostGenerationFixture());
  const ownsHostGenerationFixture = !providedHostGenerationFixture;
  try {
    const response = await invokeAppServerFromPage(
      page,
      APP_SERVER_METHOD_SESSION_TURN_START,
      {
        sessionId: CONTENT_FACTORY_ARTICLE_WORKSPACE_SESSION_ID,
        turnId: CONTENT_FACTORY_ARTICLE_WORKSPACE_WORKER_TURN_ID,
        input: {
          text: "通过已安装内容工厂 worker 写一篇完整公众号文章。",
        },
        runtimeOptions: {
          runtimeRequest: {
            ...contentFactoryHostGenerationAgentRuntimeRequest(
              hostGenerationFixture.baseUrl,
            ),
            metadata: buildArticleWorkspaceWorkerMetadata(workspace),
          },
        },
        queueIfBusy: false,
        skipPreSubmitResume: true,
      },
      requestLog,
    );

    const eventTypes = response.messages
      .filter((message) => message?.method === "agentSession/event")
      .map((message) => message?.params?.event?.type)
      .filter(Boolean);
    const turn =
      response.result?.turn && typeof response.result.turn === "object"
        ? response.result.turn
        : {};
    const readModel = options
      ? await waitForWorkspacePatchWorkerTurnCompleted(
          page,
          options,
          requestLog,
        )
      : null;

    return sanitizeJson({
      method: APP_SERVER_METHOD_SESSION_TURN_START,
      turnId: turn.turnId ?? turn.turn_id ?? null,
      turnStatus: turn.status ?? null,
      taskId: CONTENT_FACTORY_ARTICLE_WORKSPACE_WORKER_TASK_ID,
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
) {
  const startedAt = Date.now();
  let lastSummary = null;
  while (Date.now() - startedAt < options.timeoutMs) {
    const readModel = await invokeAppServerFromPage(
      page,
      APP_SERVER_METHOD_SESSION_READ,
      {
        sessionId: CONTENT_FACTORY_ARTICLE_WORKSPACE_SESSION_ID,
        historyLimit: 20,
      },
      requestLog,
    );
    const summary = summarizeWorkspacePatchWorkerTurnReadModel(
      readModel.result,
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

function summarizeWorkspacePatchWorkerTurnReadModel(result) {
  const detail =
    result?.detail && typeof result.detail === "object" ? result.detail : {};
  const threadRead =
    detail.threadRead && typeof detail.threadRead === "object"
      ? detail.threadRead
      : detail.thread_read && typeof detail.thread_read === "object"
        ? detail.thread_read
        : {};
  const turns = Array.isArray(threadRead.turns) ? threadRead.turns : [];
  const workerTurn = turns.find(
    (turn) =>
      (turn?.turnId ?? turn?.turn_id ?? turn?.id) ===
      CONTENT_FACTORY_ARTICLE_WORKSPACE_WORKER_TURN_ID,
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

function buildArticleWorkspaceWorkerMetadata(workspace) {
  return {
    plugin: {
      source: "right_surface_article_workspace",
      app_id: WORKER_APP_ID,
      session_id: CONTENT_FACTORY_ARTICLE_WORKSPACE_SESSION_ID,
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
          session_id: CONTENT_FACTORY_ARTICLE_WORKSPACE_SESSION_ID,
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
