import {
  APP_SERVER_METHOD_AGENT_SESSION_RUNTIME_EVENTS_APPEND,
  APP_SERVER_METHOD_ARTIFACT_READ,
  APP_SERVER_METHOD_SESSION_READ,
  APP_SERVER_METHOD_SESSION_START,
  APP_SERVER_METHOD_SESSION_UPDATE,
  APP_SERVER_METHOD_WORKSPACE_RIGHT_SURFACE_REQUEST,
  CONTENT_FACTORY_PRODUCT_PROFILE_ARTICLE_ARTIFACT_ID,
  CONTENT_FACTORY_PRODUCT_PROFILE_IMAGE_ARTIFACT_ID,
  CONTENT_FACTORY_PRODUCT_PROFILE_SESSION_ID,
  CONTENT_FACTORY_PRODUCT_PROFILE_SESSION_TITLE,
  CONTENT_FACTORY_PRODUCT_PROFILE_THREAD_ID,
  CONTENT_FACTORY_PRODUCT_PROFILE_TURN_ID,
  FIXTURE_MODEL,
  FIXTURE_PROVIDER,
} from "./claw-chat-current-fixture-constants.mjs";
import { invokeAppServerFromPage } from "./claw-chat-current-fixture-rpc.mjs";
import {
  openSessionFromSidebar,
  waitForGuiSessionVisible,
} from "./claw-chat-current-fixture-session.mjs";
import { clickAndAssertRightSurface } from "./claw-chat-current-fixture-right-surface-visual.mjs";
import {
  assert,
  sanitizeJson,
  sleep,
} from "./claw-chat-current-fixture-utils.mjs";

const CONTENT_FACTORY_APP_ID = "content-factory-app";
const ARTICLE_OBJECT_ID = "article-1";
const IMAGE_SET_OBJECT_ID = "image-set-1";

export async function runContentFactoryProductProfileScenario({
  page,
  options,
  workspace,
  appServerRequests,
}) {
  const sessionCreation = await createContentFactoryProductProfileSession(
    page,
    workspace,
    appServerRequests,
  );

  const runtimeEventsAppend = await appendContentFactoryRuntimeEvents(
    page,
    workspace,
    appServerRequests,
  );
  const rightSurfaceRequest = await requestContentFactoryProductProfileSurface(
    page,
    workspace,
    appServerRequests,
  );

  await notifySessionChanged(page, workspace.workspaceId);

  const guiSessionVisible = await waitForGuiSessionVisible(
    page,
    options,
    CONTENT_FACTORY_PRODUCT_PROFILE_SESSION_TITLE,
  );
  const guiSessionOpened = await openSessionFromSidebar(
    page,
    options,
    appServerRequests,
    {
      sessionId: CONTENT_FACTORY_PRODUCT_PROFILE_SESSION_ID,
      title: CONTENT_FACTORY_PRODUCT_PROFILE_SESSION_TITLE,
    },
  );

  const rightSurface = await clickAndAssertRightSurface(page, options, {
    surfaceKind: "productProfile",
    toggleTestId: "task-center-object-canvas-toggle",
    rootTestId: "workspace-product-profile-surface",
  });
  const gui = await waitForContentFactoryProductProfileGui(page, options);

  const readModel = await invokeAppServerFromPage(
    page,
    APP_SERVER_METHOD_SESSION_READ,
    {
      sessionId: CONTENT_FACTORY_PRODUCT_PROFILE_SESSION_ID,
      historyLimit: 20,
    },
    appServerRequests,
  );
  const readModelSummary = summarizeContentFactoryProductProfileReadModel(
    readModel.result,
  );

  const artifactRead = await invokeAppServerFromPage(
    page,
    APP_SERVER_METHOD_ARTIFACT_READ,
    {
      sessionId: CONTENT_FACTORY_PRODUCT_PROFILE_SESSION_ID,
      artifactRef: CONTENT_FACTORY_PRODUCT_PROFILE_ARTICLE_ARTIFACT_ID,
      includeContent: true,
      limit: 1,
    },
    appServerRequests,
  );
  const artifactReadSummary = summarizeContentFactoryArtifactRead(
    artifactRead.result,
  );

  return sanitizeJson({
    contentFactoryProductProfileSessionCreation: sessionCreation,
    contentFactoryProductProfileRuntimeEventsAppend:
      summarizeRuntimeEventsAppend(runtimeEventsAppend.result),
    contentFactoryProductProfileRightSurfaceRequest:
      summarizeRightSurfaceRequest(rightSurfaceRequest.result),
    guiContentFactoryProductProfileSessionVisible: guiSessionVisible,
    guiContentFactoryProductProfileSessionOpened: guiSessionOpened,
    contentFactoryProductProfileRightSurface: rightSurface,
    contentFactoryProductProfileGui: gui,
    contentFactoryProductProfileReadModel: readModelSummary,
    contentFactoryProductProfileArtifactRead: artifactReadSummary,
  });
}

async function requestContentFactoryProductProfileSurface(
  page,
  workspace,
  requestLog,
) {
  return await invokeAppServerFromPage(
    page,
    APP_SERVER_METHOD_WORKSPACE_RIGHT_SURFACE_REQUEST,
    {
      workspaceId: workspace.workspaceId,
      workspaceRoot: workspace.rootPath,
      sessionId: CONTENT_FACTORY_PRODUCT_PROFILE_SESSION_ID,
      surfaceKind: "productProfile",
      origin: "runtime",
      priority: "foreground",
      candidateId: "content-factory-product-profile",
      reason: "agent_app_product_profile_ready",
      ttlMs: 120_000,
      metadata: {
        fixtureOrigin: "content-factory-product-profile",
        contentFactoryWorkspacePatch:
          buildContentFactoryWorkspacePatch(workspace),
      },
    },
    requestLog,
  );
}

async function createContentFactoryProductProfileSession(
  page,
  workspace,
  requestLog,
) {
  assert(workspace?.rootPath, "内容工厂 Product Profile fixture 缺少 workspace rootPath");
  assert(workspace?.workspaceId, "内容工厂 Product Profile fixture 缺少 workspaceId");

  const session = await invokeAppServerFromPage(
    page,
    APP_SERVER_METHOD_SESSION_START,
    {
      sessionId: CONTENT_FACTORY_PRODUCT_PROFILE_SESSION_ID,
      threadId: CONTENT_FACTORY_PRODUCT_PROFILE_THREAD_ID,
      appId: CONTENT_FACTORY_APP_ID,
      workspaceId: workspace.workspaceId,
      workingDir: workspace.rootPath,
      businessObjectRef: {
        kind: "agent.session",
        id: `agent-session:${workspace.workspaceId}:${CONTENT_FACTORY_PRODUCT_PROFILE_SESSION_ID}`,
        title: CONTENT_FACTORY_PRODUCT_PROFILE_SESSION_TITLE,
        metadata: {
          title: CONTENT_FACTORY_PRODUCT_PROFILE_SESSION_TITLE,
          workingDir: workspace.rootPath,
          working_dir: workspace.rootPath,
          appId: CONTENT_FACTORY_APP_ID,
          executionStrategy: "react",
          runStartHooks: false,
          harness: {
            hiddenFromUserRecents: false,
            source: "smoke:content-factory-product-profile",
          },
        },
      },
    },
    requestLog,
  );

  const update = await invokeAppServerFromPage(
    page,
    APP_SERVER_METHOD_SESSION_UPDATE,
    {
      sessionId: CONTENT_FACTORY_PRODUCT_PROFILE_SESSION_ID,
      title: CONTENT_FACTORY_PRODUCT_PROFILE_SESSION_TITLE,
      providerSelector: FIXTURE_PROVIDER,
      providerName: FIXTURE_PROVIDER,
      modelName: FIXTURE_MODEL,
      executionStrategy: "react",
      recentAccessMode: "full-access",
      recentPreferences: {
        searchMode: "allowed",
      },
    },
    requestLog,
  );

  return sanitizeJson({
    sessionId:
      session.result?.session?.sessionId ??
      session.result?.session?.session_id ??
      null,
    updatedSessionId:
      update.result?.session?.sessionId ??
      update.result?.session?.session_id ??
      null,
    appId: CONTENT_FACTORY_APP_ID,
    title: CONTENT_FACTORY_PRODUCT_PROFILE_SESSION_TITLE,
  });
}

async function appendContentFactoryRuntimeEvents(page, workspace, requestLog) {
  return await invokeAppServerFromPage(
    page,
    APP_SERVER_METHOD_AGENT_SESSION_RUNTIME_EVENTS_APPEND,
    {
      sessionId: CONTENT_FACTORY_PRODUCT_PROFILE_SESSION_ID,
      turnId: null,
      runtimeEvents: [
        {
          type: "artifact.snapshot",
          payload: {
            artifact: {
              artifactId: "artifact-workspace-patch-1",
              path: ".lime/artifacts/content-factory-workspace-patch.json",
              title: "内容工厂工作区补丁",
              kind: "content_factory.workspace_patch",
              status: "ready",
              metadata: {
                agentAppWorker: {
                  appId: CONTENT_FACTORY_APP_ID,
                  taskId: "article_job_1",
                  taskKind: "content.article.generate",
                  turnId: CONTENT_FACTORY_PRODUCT_PROFILE_TURN_ID,
                },
                contentFactoryWorkspacePatch:
                  buildContentFactoryWorkspacePatch(workspace),
              },
            },
          },
        },
        {
          type: "runtime.error",
          payload: {
            source: "agent_app_task_worker",
            appId: CONTENT_FACTORY_APP_ID,
            taskId: "image_job_1",
            taskKind: "content.image.generate",
            turnId: CONTENT_FACTORY_PRODUCT_PROFILE_TURN_ID,
            status: "failed",
            errorCode: "worker_invalid_json_output",
            errorMessage: "Agent App worker returned invalid JSON",
            message:
              "Agent App task worker failed: Agent App worker returned invalid JSON",
            metadata: {
              agentAppWorker: {
                appId: CONTENT_FACTORY_APP_ID,
                taskId: "image_job_1",
                taskKind: "content.image.generate",
                turnId: CONTENT_FACTORY_PRODUCT_PROFILE_TURN_ID,
                status: "failed",
                errorCode: "worker_invalid_json_output",
              },
            },
          },
        },
      ],
    },
    requestLog,
  );
}

function buildContentFactoryWorkspacePatch(workspace) {
  return {
    schemaVersion: "product-workspace.v1",
    appId: CONTENT_FACTORY_APP_ID,
    sessionId: CONTENT_FACTORY_PRODUCT_PROFILE_SESSION_ID,
    workspaceId: workspace.workspaceId,
    primaryObjectRef: {
      appId: CONTENT_FACTORY_APP_ID,
      kind: "articleDraft",
      id: ARTICLE_OBJECT_ID,
      sessionId: CONTENT_FACTORY_PRODUCT_PROFILE_SESSION_ID,
      artifactIds: [CONTENT_FACTORY_PRODUCT_PROFILE_ARTICLE_ARTIFACT_ID],
      sourceTurnId: CONTENT_FACTORY_PRODUCT_PROFILE_TURN_ID,
      sourceTaskId: "article_job_1",
    },
    selectedObjectRef: {
      appId: CONTENT_FACTORY_APP_ID,
      kind: "articleDraft",
      id: ARTICLE_OBJECT_ID,
      sessionId: CONTENT_FACTORY_PRODUCT_PROFILE_SESSION_ID,
    },
    objects: [
      {
        ref: {
          appId: CONTENT_FACTORY_APP_ID,
          kind: "articleDraft",
          id: ARTICLE_OBJECT_ID,
          sessionId: CONTENT_FACTORY_PRODUCT_PROFILE_SESSION_ID,
          artifactIds: [CONTENT_FACTORY_PRODUCT_PROFILE_ARTICLE_ARTIFACT_ID],
          sourceTurnId: CONTENT_FACTORY_PRODUCT_PROFILE_TURN_ID,
          sourceTaskId: "article_job_1",
        },
        title: "公众号文章草稿",
        status: "ready",
        summary: "已生成首版文章",
        previewArtifactId: CONTENT_FACTORY_PRODUCT_PROFILE_ARTICLE_ARTIFACT_ID,
        source: {
          taskKind: "content.article.generate",
          taskId: "article_job_1",
          turnId: CONTENT_FACTORY_PRODUCT_PROFILE_TURN_ID,
          artifactIds: [CONTENT_FACTORY_PRODUCT_PROFILE_ARTICLE_ARTIFACT_ID],
          markdown:
            "# 内容工厂首版文章\n\n这是由 Agent App worker 写回的公众号文章草稿。",
          evidenceIds: ["evidence-article-1"],
        },
      },
      {
        ref: {
          appId: CONTENT_FACTORY_APP_ID,
          kind: "imageGenerationSet",
          id: IMAGE_SET_OBJECT_ID,
          sessionId: CONTENT_FACTORY_PRODUCT_PROFILE_SESSION_ID,
          artifactIds: [CONTENT_FACTORY_PRODUCT_PROFILE_IMAGE_ARTIFACT_ID],
          sourceTurnId: CONTENT_FACTORY_PRODUCT_PROFILE_TURN_ID,
          sourceTaskId: "image_job_1",
        },
        title: "配图组",
        status: "needs_review",
        summary: "等待选择主图",
        previewArtifactId: CONTENT_FACTORY_PRODUCT_PROFILE_IMAGE_ARTIFACT_ID,
        source: {
          taskKind: "content.image.generate",
          taskId: "image_job_1",
          turnId: CONTENT_FACTORY_PRODUCT_PROFILE_TURN_ID,
          artifactIds: [CONTENT_FACTORY_PRODUCT_PROFILE_IMAGE_ARTIFACT_ID],
          images: [
            {
              id: CONTENT_FACTORY_PRODUCT_PROFILE_IMAGE_ARTIFACT_ID,
              title: "主图",
              url: "https://example.com/content-factory-image-1.png",
              prompt: "明亮的中文内容工厂主图",
            },
          ],
          evidenceIds: ["evidence-image-1"],
        },
      },
    ],
    layoutState: {
      activeTabKind: "productProfile",
      activePaneKind: "documentCanvas",
      openTabKinds: ["productProfile", "files"],
      splitMode: "chat-right-dock",
    },
    sourceArtifacts: [{ artifactRef: "artifact-workspace-patch-1" }],
    updatedAt: "2026-06-24T00:00:00.000Z",
  };
}

async function notifySessionChanged(page, workspaceId) {
  await page.evaluate(
    ({ sessionId, workspaceId }) => {
      window.dispatchEvent(
        new CustomEvent("lime:agent-runtime-sessions-changed", {
          detail: {
            reason: "external",
            sessionId,
            workspaceId,
          },
        }),
      );
      window.dispatchEvent(new Event("focus"));
    },
    {
      sessionId: CONTENT_FACTORY_PRODUCT_PROFILE_SESSION_ID,
      workspaceId,
    },
  );
}

async function waitForContentFactoryProductProfileGui(page, options) {
  const startedAt = Date.now();
  let lastSnapshot = null;
  while (Date.now() - startedAt < options.timeoutMs) {
    const snapshot = await page.evaluate(() => {
      const host = document.querySelector(
        '[data-testid="workspace-right-surface-host"]',
      );
      const root = document.querySelector(
        '[data-testid="workspace-product-profile-surface"]',
      );
      const toggle = document.querySelector(
        '[data-testid="task-center-object-canvas-toggle"]',
      );
      const bodyText = document.body?.innerText || "";
      return {
        activeSurface: host?.getAttribute("data-surface") ?? null,
        rootVisible: isVisible(root),
        toggleTitle: toggle?.getAttribute("title") ?? "",
        toggleAria: toggle?.getAttribute("aria-label") ?? "",
        hasProductProfileTitle: bodyText.includes("产物 Profile"),
        hasArticleTitle: bodyText.includes("公众号文章草稿"),
        hasImageSetTitle: bodyText.includes("配图组"),
        hasWorkerEvidenceTitle: bodyText.includes("运行记录"),
        hasArticlePreview: bodyText.includes("内容工厂首版文章"),
        hasImagePrompt: bodyText.includes("明亮的中文内容工厂主图"),
        bodyTextSample: bodyText.slice(0, 2000),
      };

      function isVisible(node) {
        const rect = node?.getBoundingClientRect();
        const style = node ? window.getComputedStyle(node) : null;
        return Boolean(
          node &&
            rect &&
            rect.width > 8 &&
            rect.height > 8 &&
            style?.display !== "none" &&
            style?.visibility !== "hidden",
        );
      }
    });
    lastSnapshot = snapshot;
    if (
      snapshot?.activeSurface === "productProfile" &&
      snapshot.rootVisible &&
      snapshot.hasProductProfileTitle &&
      snapshot.hasArticleTitle &&
      snapshot.hasImageSetTitle &&
      snapshot.hasWorkerEvidenceTitle
    ) {
      return snapshot;
    }
    await sleep(options.intervalMs);
  }
  throw new Error(
    `内容工厂 Product Profile GUI 未就绪: ${JSON.stringify(
      sanitizeJson(lastSnapshot),
    )}`,
  );
}

function summarizeRuntimeEventsAppend(result) {
  const events = Array.isArray(result?.events) ? result.events : [];
  return sanitizeJson({
    eventCount: events.length,
    eventTypes: events
      .map((event) => event?.type ?? event?.eventType ?? event?.event_type)
      .filter(Boolean),
    turnIds: events
      .map((event) => event?.turnId ?? event?.turn_id ?? null)
      .filter(Boolean),
    sessionIds: Array.from(
      new Set(
        events
          .map((event) => event?.sessionId ?? event?.session_id ?? null)
          .filter(Boolean),
      ),
    ),
  });
}

function summarizeRightSurfaceRequest(result) {
  const pending = asRecord(result?.pending) ?? {};
  return sanitizeJson({
    requestId: readString(result?.requestId, pending.requestId),
    status: readString(result?.status, pending.status),
    surfaceKind: readString(pending.surfaceKind, pending.surface_kind),
    candidateId: readString(pending.candidateId, pending.candidate_id),
    origin: readString(pending.origin),
  });
}

function summarizeContentFactoryProductProfileReadModel(result) {
  const detail = asRecord(result?.detail) ?? asRecord(result);
  const threadRead =
    asRecord(detail?.threadRead) ?? asRecord(detail?.thread_read) ?? {};
  const productWorkspace =
    asRecord(threadRead.productWorkspace) ??
    asRecord(threadRead.product_workspace) ??
    asRecord(detail?.productWorkspace) ??
    asRecord(detail?.product_workspace) ??
    {};
  const objects = readArray(productWorkspace.objects);
  const workerEvidence = readArray(
    productWorkspace.workerEvidence,
    productWorkspace.worker_evidence,
  );
  const artifacts = readArray(threadRead.artifacts, detail?.artifacts);
  const articleArtifact = artifacts.find(
    (artifact) =>
      readString(artifact?.artifactRef, artifact?.artifact_ref) ===
      CONTENT_FACTORY_PRODUCT_PROFILE_ARTICLE_ARTIFACT_ID,
  );
  const articleMetadata = asRecord(articleArtifact?.metadata) ?? {};
  const articleProductProfile = asRecord(articleMetadata.productProfile) ?? {};
  const failedEvidence = workerEvidence.find(
    (evidence) => readString(evidence?.status) === "failed",
  );

  return sanitizeJson({
    hasProductWorkspace: Object.keys(productWorkspace).length > 0,
    schemaVersion: readString(
      productWorkspace.schemaVersion,
      productWorkspace.schema_version,
    ),
    appId: readString(productWorkspace.appId, productWorkspace.app_id),
    sessionId: readString(
      productWorkspace.sessionId,
      productWorkspace.session_id,
    ),
    workspaceId: readString(
      productWorkspace.workspaceId,
      productWorkspace.workspace_id,
    ),
    objectCount: objects.length,
    objectTitles: objects.map((object) => readString(object?.title)),
    hasArticleObject: objects.some(
      (object) => readString(object?.title) === "公众号文章草稿",
    ),
    hasImageSetObject: objects.some(
      (object) => readString(object?.title) === "配图组",
    ),
    workerEvidenceCount: workerEvidence.length,
    failedWorkerEvidence: failedEvidence
      ? {
          taskId: readString(failedEvidence.taskId, failedEvidence.task_id),
          status: readString(failedEvidence.status),
          errorCode: readString(
            failedEvidence.errorCode,
            failedEvidence.error_code,
          ),
        }
      : null,
    artifactCount: artifacts.length,
    articleArtifact: articleArtifact
      ? {
          artifactRef: readString(
            articleArtifact.artifactRef,
            articleArtifact.artifact_ref,
          ),
          kind: readString(articleArtifact.kind),
          title: readString(articleArtifact.title),
          artifactSchema: readString(articleMetadata.artifactSchema),
          artifactDocumentId: readString(articleMetadata.artifactDocumentId),
          productProfileObjectKind: readString(
            articleProductProfile.objectKind,
            articleProductProfile.object_kind,
          ),
        }
      : null,
  });
}

function summarizeContentFactoryArtifactRead(result) {
  const artifacts = readArray(result?.artifacts);
  const artifact = artifacts[0] ?? null;
  const content = readString(artifact?.content);
  return sanitizeJson({
    artifactCount: artifacts.length,
    artifactRef: readString(artifact?.artifactRef, artifact?.artifact_ref),
    kind: readString(artifact?.kind),
    title: readString(artifact?.title),
    contentStatus: readString(
      artifact?.contentStatus,
      artifact?.content_status,
    ),
    contentIncludesSchema: content.includes("artifact_document.v1"),
    contentIncludesDocumentId: content.includes(
      `artifact-document:${CONTENT_FACTORY_APP_ID}:${CONTENT_FACTORY_PRODUCT_PROFILE_ARTICLE_ARTIFACT_ID}`,
    ),
    contentIncludesArticleTitle: content.includes("公众号文章草稿"),
  });
}

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : null;
}

function readArray(...values) {
  for (const value of values) {
    if (Array.isArray(value)) {
      return value;
    }
  }
  return [];
}

function readString(...values) {
  for (const value of values) {
    if (typeof value === "string") {
      return value;
    }
  }
  return "";
}
