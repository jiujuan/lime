import {
  APP_SERVER_METHOD_AGENT_SESSION_RUNTIME_EVENTS_APPEND,
  APP_SERVER_METHOD_ARTIFACT_READ,
  APP_SERVER_METHOD_SESSION_READ,
  APP_SERVER_METHOD_SESSION_START,
  APP_SERVER_METHOD_SESSION_TURN_START,
  APP_SERVER_METHOD_SESSION_UPDATE,
  APP_SERVER_METHOD_WORKSPACE_RIGHT_SURFACE_REQUEST,
  CONTENT_FACTORY_PRODUCT_PROFILE_ARTICLE_ARTIFACT_ID,
  CONTENT_FACTORY_PRODUCT_PROFILE_IMAGE_ARTIFACT_ID,
  CONTENT_FACTORY_PRODUCT_PROFILE_REMOTE_REJECT_ERROR_CODE,
  CONTENT_FACTORY_PRODUCT_PROFILE_REMOTE_REJECT_TURN_ID,
  CONTENT_FACTORY_PRODUCT_PROFILE_SESSION_ID,
  CONTENT_FACTORY_PRODUCT_PROFILE_SESSION_TITLE,
  CONTENT_FACTORY_PRODUCT_PROFILE_THREAD_ID,
  CONTENT_FACTORY_PRODUCT_PROFILE_TURN_ID,
  CONTENT_FACTORY_PRODUCT_PROFILE_WORKER_TASK_ID,
  FIXTURE_MODEL,
  FIXTURE_PROVIDER,
} from "./claw-chat-current-fixture-constants.mjs";
import {
  runContentFactoryWorkerDogfoodTurn,
  saveContentFactoryWorkerInstalledState,
} from "./claw-chat-current-fixture-content-factory-worker-dogfood.mjs";
import {
  buildContentFactoryActionResultWorkspacePatch,
  buildContentFactoryWorkspacePatch,
} from "./claw-chat-current-fixture-content-factory-workspace-patches.mjs";
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
const IMAGE_SET_OBJECT_ID = "image-set-1";
const CONTENT_FACTORY_PRODUCT_PROFILE_STORYBOARD_ARTIFACT_ID =
  "artifact-video-storyboard";
const CONTENT_FACTORY_PRODUCT_PROFILE_CHECKLIST_ARTIFACT_ID =
  "artifact-delivery-checklist";

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
  const installedStateSave = await saveContentFactoryWorkerInstalledState(
    page,
    appServerRequests,
  );

  const runtimeEventsAppend = await appendContentFactoryRuntimeEvents(
    page,
    workspace,
    appServerRequests,
  );
  const workerTurnStart = await runContentFactoryWorkerDogfoodTurn({
    page,
    workspace,
    requestLog: appServerRequests,
  });
  const actionResultRuntimeEventsAppend =
    await appendContentFactoryProductProfileActionResultRuntimeEvents(
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
  const articleObjectSelection = await selectContentFactoryArticleObject(
    page,
    options,
  );
  const articleWritingStructure =
    await waitForContentFactoryArticleWritingStructure(page, options);
  const storyboardObjectSelection = await selectContentFactoryStoryboardObject(
    page,
    options,
  );
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
  const remoteRuntimeRejection = await runRemotePluginRuntimeRejectionProbe({
    page,
    workspace,
    options,
    requestLog: appServerRequests,
  });

  return sanitizeJson({
    contentFactoryProductProfileSessionCreation: sessionCreation,
    contentFactoryProductProfileInstalledStateSave: installedStateSave,
    contentFactoryProductProfileRuntimeEventsAppend:
      summarizeRuntimeEventsAppend(runtimeEventsAppend.result),
    contentFactoryProductProfileWorkerTurnStart: workerTurnStart,
    contentFactoryProductProfileRemoteRuntimeRejection: remoteRuntimeRejection,
    contentFactoryProductProfileActionResultRuntimeEventsAppend:
      summarizeRuntimeEventsAppend(actionResultRuntimeEventsAppend.result),
    contentFactoryProductProfileRightSurfaceRequest:
      summarizeRightSurfaceRequest(rightSurfaceRequest.result),
    guiContentFactoryProductProfileSessionVisible: guiSessionVisible,
    guiContentFactoryProductProfileSessionOpened: guiSessionOpened,
    contentFactoryProductProfileRightSurface: rightSurface,
    contentFactoryProductProfileArticleObjectSelection:
      articleObjectSelection,
    contentFactoryProductProfileArticleWritingStructure:
      articleWritingStructure,
    contentFactoryProductProfileStoryboardObjectSelection:
      storyboardObjectSelection,
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
  assert(
    workspace?.rootPath,
    "内容工厂 Product Profile fixture 缺少 workspace rootPath",
  );
  assert(
    workspace?.workspaceId,
    "内容工厂 Product Profile fixture 缺少 workspaceId",
  );

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
        searchMode: "auto",
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
            failureCategory: "worker_output",
            retryable: false,
            retryAdvice: "inspect_worker_output",
            retryAttempt: 0,
            retryMaxAttempts: 0,
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
                failureCategory: "worker_output",
                retryable: false,
                retryAdvice: "inspect_worker_output",
                retryAttempt: 0,
                retryMaxAttempts: 0,
              },
            },
          },
        },
      ],
    },
    requestLog,
  );
}

async function appendContentFactoryProductProfileActionResultRuntimeEvents(
  page,
  workspace,
  requestLog,
) {
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
              artifactId: "artifact-image-regenerate-workspace-patch",
              artifactRef: "artifact-image-regenerate-workspace-patch",
              path: ".lime/artifacts/product-profile/image-regenerate-workspace-patch.json",
              title: "配图组重新生成结果",
              kind: "content_factory.workspace_patch",
              status: "ready",
              metadata: {
                agentAppWorker: {
                  appId: CONTENT_FACTORY_APP_ID,
                  taskId: "image_regenerate_job_1",
                  taskKind: "content.image.generate",
                  turnId: "turn_content_factory_product_profile_action",
                  workerEntrypoint: "./runtime/content-factory-worker.mjs",
                  status: "completed",
                  inputSummary: "action=regenerate; object=image-set-1",
                  outputSummary: "1 object: 配图组重新生成结果",
                  outputObjectCount: 1,
                  outputArtifactKind: "content_factory.workspace_patch",
                },
                contentFactoryWorkspacePatch:
                  buildContentFactoryActionResultWorkspacePatch(workspace),
              },
            },
          },
        },
      ],
    },
    requestLog,
  );
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
      const rendererHost = document.querySelector(
        '[data-testid="workspace-product-profile-app-declared-renderer"]',
      );
      const rendererExecutableHost =
        rendererHost?.querySelector("iframe, webview");
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
        hasStoryboardTitle: bodyText.includes("视频分镜"),
        hasChecklistTitle: bodyText.includes("交付检查清单"),
        hasWorkerEvidenceTitle: bodyText.includes("运行记录"),
        hasArticlePreview: bodyText.includes("内容工厂首版文章"),
        hasImagePrompt: bodyText.includes("明亮的中文内容工厂主图"),
        hasRegeneratedImageSummary: bodyText.includes("已重新生成 2 张候选图"),
        hasRegeneratedImagePrompt:
          bodyText.includes("厨房台面主图，明亮自然光"),
        rendererHost: {
          visible: isVisible(rendererHost),
          pluginVisible: bodyText.includes("content-factory-app"),
          rendererKindVisible: bodyText.includes("app_declared"),
          executionModeVisible: bodyText.includes("host_placeholder"),
          rendererExecutionModelVisible: bodyText.includes(
            "host_placeholder_only",
          ),
          entryLoadPolicyVisible: bodyText.includes("not_loaded"),
          executableHostAbsent: !rendererExecutableHost,
          reasonVisible: bodyText.includes(
            "app_declared_renderer_placeholder_only",
          ),
          allowedOutputVisible: bodyText.includes(
            "content_factory.workspace_patch",
          ),
          entryVisible: bodyText.includes("./renderer/storyboard.tsx"),
          actionVisible: bodyText.includes("open_storyboard"),
        },
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
      snapshot.hasStoryboardTitle &&
      snapshot.hasChecklistTitle &&
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

async function selectContentFactoryArticleObject(page, options) {
  return await selectContentFactoryProductProfileObject(page, options, {
    objectKind: "articleDraft",
    selector: '[data-testid="workspace-product-profile-object-articleDraft"]',
    failureLabel: "文章对象",
  });
}

async function waitForContentFactoryArticleWritingStructure(page, options) {
  const startedAt = Date.now();
  let lastSnapshot = null;
  while (Date.now() - startedAt < options.timeoutMs) {
    const snapshot = await page.evaluate(() => {
      const root = document.querySelector(
        '[data-testid="workspace-product-profile-surface"]',
      );
      const structure = document.querySelector(
        '[data-testid="workspace-product-profile-writing-structure"]',
      );
      const research = document.querySelector(
        '[data-testid="workspace-product-profile-writing-research"]',
      );
      const outline = document.querySelector(
        '[data-testid="workspace-product-profile-writing-outline"]',
      );
      const citations = document.querySelector(
        '[data-testid="workspace-product-profile-writing-citations"]',
      );
      const imageSlots = document.querySelector(
        '[data-testid="workspace-product-profile-writing-image-slots"]',
      );
      const bodyText = document.body?.innerText || "";
      return {
        rootVisible: isVisible(root),
        structureVisible: isVisible(structure),
        researchVisible: isVisible(research),
        outlineVisible: isVisible(outline),
        citationsVisible: isVisible(citations),
        imageSlotsVisible: isVisible(imageSlots),
        hasDocumentPreview: bodyText.includes("内容工厂首版文章"),
        hasWritingStructureTitle: bodyText.includes("写作结构"),
        hasResearchRound: bodyText.includes("检索行业背景"),
        hasOutline: bodyText.includes("开场：为什么要把写作变成工作流"),
        hasTitleCandidate: bodyText.includes("内容工厂不是聊天框"),
        hasKeyTakeaway: bodyText.includes(
          "写作应该经过检索、提纲、正文、配图和复核",
        ),
        hasCitation: bodyText.includes("产品规划文档"),
        hasImagePrompt: bodyText.includes(
          "桌面端内容工厂写作流程图，中文标签",
        ),
        hasWritingPlan: bodyText.includes("先做资料检索"),
        hasReviewNote: bodyText.includes("正文需要保留真实引用来源。"),
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
      snapshot?.rootVisible &&
      snapshot.structureVisible &&
      snapshot.researchVisible &&
      snapshot.outlineVisible &&
      snapshot.citationsVisible &&
      snapshot.imageSlotsVisible &&
      snapshot.hasDocumentPreview &&
      snapshot.hasWritingStructureTitle &&
      snapshot.hasResearchRound &&
      snapshot.hasOutline &&
      snapshot.hasTitleCandidate &&
      snapshot.hasKeyTakeaway &&
      snapshot.hasCitation &&
      snapshot.hasImagePrompt &&
      snapshot.hasWritingPlan &&
      snapshot.hasReviewNote
    ) {
      return sanitizeJson(snapshot);
    }
    await sleep(options.intervalMs);
  }
  throw new Error(
    `内容工厂 Product Profile 文章写作结构不可见: ${JSON.stringify(
      sanitizeJson(lastSnapshot),
    )}`,
  );
}

async function selectContentFactoryStoryboardObject(page, options) {
  return await selectContentFactoryProductProfileObject(page, options, {
    objectKind: "videoStoryboard",
    selector:
      '[data-testid="workspace-product-profile-object-videoStoryboard"]',
    failureLabel: "分镜对象",
  });
}

async function selectContentFactoryProductProfileObject(
  page,
  options,
  { failureLabel, objectKind, selector },
) {
  const startedAt = Date.now();
  let lastSnapshot = null;
  while (Date.now() - startedAt < options.timeoutMs) {
    const snapshot = await page.evaluate((selector) => {
      const button = document.querySelector(selector);
      const visible = isVisible(button);
      if (visible) {
        button.click();
      }
      return {
        visible,
        text: button?.textContent ?? "",
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
    }, selector);
    lastSnapshot = snapshot;
    if (snapshot?.visible) {
      return sanitizeJson({
        selected: true,
        objectKind,
        text: snapshot.text,
      });
    }
    await sleep(options.intervalMs);
  }
  throw new Error(
    `内容工厂 Product Profile ${failureLabel}不可选: ${JSON.stringify(
      sanitizeJson(lastSnapshot),
    )}`,
  );
}

async function runRemotePluginRuntimeRejectionProbe({
  page,
  workspace,
  options,
  requestLog,
}) {
  const response = await invokeAppServerFromPage(
    page,
    APP_SERVER_METHOD_SESSION_TURN_START,
    {
      sessionId: CONTENT_FACTORY_PRODUCT_PROFILE_SESSION_ID,
      turnId: CONTENT_FACTORY_PRODUCT_PROFILE_REMOTE_REJECT_TURN_ID,
      input: {
        text: "尝试运行未授权的远端插件 Product Profile action。",
      },
      runtimeOptions: {
        metadata: {
          agent_app: {
            source: "right_surface_product_profile",
            app_id: "creator-pack",
            workspace_id: workspace.workspaceId,
            product_profile_action: {
              key: "remote_regenerate",
              intent: "regenerate",
              risk: "write",
              task_kind: "creator.generate",
              output_artifact_kind: "creator.workspace_patch",
              prompt: "Regenerate remote creator workspace.",
              object: {
                app_id: "creator-pack",
                kind: "creatorCanvas",
                id: "creator-canvas-1",
                session_id: CONTENT_FACTORY_PRODUCT_PROFILE_SESSION_ID,
                artifact_ids: ["artifact-remote-creator-1"],
              },
            },
          },
          right_surface: {
            surface_kind: "productProfile",
            source: "product_workspace",
            action_key: "remote_regenerate",
          },
        },
      },
      queueIfBusy: false,
      skipPreSubmitResume: true,
    },
    requestLog,
  );

  const events = response.messages
    .filter((message) => message?.method === "agentSession/event")
    .map((message) => message?.params?.event)
    .filter(Boolean);
  const payloads = events.map((event) => event?.payload ?? {});
  const runtimeErrorPayload =
    payloads.find(
      (payload) =>
        readString(payload?.errorCode, payload?.error_code) ===
        CONTENT_FACTORY_PRODUCT_PROFILE_REMOTE_REJECT_ERROR_CODE,
    ) ?? {};
  const turn =
    response.result?.turn && typeof response.result.turn === "object"
      ? response.result.turn
      : {};
  const readModelRejection = await waitForRemotePluginRuntimeRejectionReadModel(
    page,
    options,
    requestLog,
  );

  return sanitizeJson({
    method: APP_SERVER_METHOD_SESSION_TURN_START,
    turnId: turn.turnId ?? turn.turn_id ?? null,
    turnStatus: turn.status ?? null,
    eventTypes: events.map((event) => readString(event?.type)).filter(Boolean),
    errorCode:
      readString(
        runtimeErrorPayload.errorCode,
        runtimeErrorPayload.error_code,
      ) || readModelRejection.errorCode,
    failureCategory:
      readString(
        runtimeErrorPayload.failureCategory,
        runtimeErrorPayload.failure_category,
      ) || readModelRejection.failureCategory,
    appId:
      readString(runtimeErrorPayload.appId, runtimeErrorPayload.app_id) ||
      readModelRejection.appId,
    outputArtifactKind:
      readString(
        runtimeErrorPayload.outputArtifactKind,
        runtimeErrorPayload.output_artifact_kind,
      ) || readModelRejection.outputArtifactKind,
    readModel: readModelRejection,
    hasRuntimeError: events.some((event) => event?.type === "runtime.error"),
    hasTurnFailed: events.some((event) => event?.type === "turn.failed"),
  });
}

async function waitForRemotePluginRuntimeRejectionReadModel(
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
        sessionId: CONTENT_FACTORY_PRODUCT_PROFILE_SESSION_ID,
        historyLimit: 20,
      },
      requestLog,
    );
    const summary = summarizeRemotePluginRuntimeRejectionReadModel(
      readModel.result,
    );
    lastSummary = summary;
    if (
      summary.errorCode ===
        CONTENT_FACTORY_PRODUCT_PROFILE_REMOTE_REJECT_ERROR_CODE &&
      summary.status === "failed"
    ) {
      return summary;
    }
    await sleep(options.intervalMs);
  }
  throw new Error(
    `远端插件运行拒绝证据未进入 read model: ${JSON.stringify(
      sanitizeJson(lastSummary),
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
  const articleArtifact = findArtifactByRef(
    artifacts,
    CONTENT_FACTORY_PRODUCT_PROFILE_ARTICLE_ARTIFACT_ID,
  );
  const storyboardArtifact = findArtifactByRef(
    artifacts,
    CONTENT_FACTORY_PRODUCT_PROFILE_STORYBOARD_ARTIFACT_ID,
  );
  const checklistArtifact = findArtifactByRef(
    artifacts,
    CONTENT_FACTORY_PRODUCT_PROFILE_CHECKLIST_ARTIFACT_ID,
  );
  const articleMetadata = asRecord(articleArtifact?.metadata) ?? {};
  const articleProductProfile = asRecord(articleMetadata.productProfile) ?? {};
  const storyboardMetadata = asRecord(storyboardArtifact?.metadata) ?? {};
  const storyboardProductProfile =
    asRecord(storyboardMetadata.productProfile) ?? {};
  const checklistMetadata = asRecord(checklistArtifact?.metadata) ?? {};
  const checklistProductProfile =
    asRecord(checklistMetadata.productProfile) ?? {};
  const failedEvidence = workerEvidence.find(
    (evidence) =>
      readString(evidence?.status) === "failed" &&
      readString(evidence?.errorCode, evidence?.error_code) ===
        "worker_invalid_json_output",
  );
  const completedActionEvidence = workerEvidence.find(
    (evidence) =>
      readString(evidence?.taskId, evidence?.task_id) ===
      "image_regenerate_job_1",
  );
  const workerDogfoodEvidence = workerEvidence.find(
    (evidence) =>
      readString(evidence?.taskId, evidence?.task_id) ===
      CONTENT_FACTORY_PRODUCT_PROFILE_WORKER_TASK_ID,
  );
  const imageObject = objects.find((object) => {
    const ref = asRecord(object?.ref) ?? asRecord(object?.objectRef) ?? {};
    return readString(ref.id) === IMAGE_SET_OBJECT_ID;
  });
  const storyboardObject = objects.find(
    (object) => productObjectKind(object) === "videoStoryboard",
  );
  const storyboardObjectSource =
    asRecord(storyboardObject?.source) ??
    asRecord(storyboardObject?.source_metadata) ??
    {};
  const storyboardRendererContract =
    asRecord(storyboardObjectSource.rendererContract) ??
    asRecord(storyboardObjectSource.renderer_contract) ??
    {};
  const storyboardRuntimeAuthorization =
    asRecord(storyboardRendererContract.runtimeAuthorization) ??
    asRecord(storyboardRendererContract.runtime_authorization) ??
    {};
  const actionResultArtifacts = artifacts.filter((artifact) => {
    const artifactRef = readString(
      artifact?.artifactRef,
      artifact?.artifact_ref,
    );
    return (
      artifactRef === "artifact-image-regenerated" ||
      artifactRef === "artifact-image-regenerate-workspace-patch"
    );
  });

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
      (object) => productObjectKind(object) === "articleDraft",
    ),
    hasImageSetObject: objects.some(
      (object) => productObjectKind(object) === "imageGenerationSet",
    ),
    hasStoryboardObject: objects.some(
      (object) => productObjectKind(object) === "videoStoryboard",
    ),
    hasChecklistObject: objects.some(
      (object) => productObjectKind(object) === "deliveryChecklist",
    ),
    imageObject: imageObject
      ? {
          status: readString(imageObject.status),
          summary: readString(imageObject.summary),
          previewArtifactId: readString(
            imageObject.previewArtifactId,
            imageObject.preview_artifact_id,
          ),
          sourceTaskId: readString(
            imageObject.ref?.sourceTaskId,
            imageObject.ref?.source_task_id,
          ),
        }
      : null,
    workerEvidenceCount: workerEvidence.length,
    failedWorkerEvidence: failedEvidence
      ? {
          taskId: readString(failedEvidence.taskId, failedEvidence.task_id),
          status: readString(failedEvidence.status),
          errorCode: readString(
            failedEvidence.errorCode,
            failedEvidence.error_code,
          ),
          failureCategory: readString(
            failedEvidence.failureCategory,
            failedEvidence.failure_category,
          ),
          retryable: readBoolean(failedEvidence.retryable),
          retryAdvice: readString(
            failedEvidence.retryAdvice,
            failedEvidence.retry_advice,
          ),
          retryAttempt: readNumber(
            failedEvidence.retryAttempt,
            failedEvidence.retry_attempt,
          ),
          retryMaxAttempts: readNumber(
            failedEvidence.retryMaxAttempts,
            failedEvidence.retry_max_attempts,
          ),
        }
      : null,
    completedActionWorkerEvidence: completedActionEvidence
      ? {
          taskId: readString(
            completedActionEvidence.taskId,
            completedActionEvidence.task_id,
          ),
          status: readString(completedActionEvidence.status),
          artifactRef: readString(
            completedActionEvidence.artifactRef,
            completedActionEvidence.artifact_ref,
          ),
        }
      : null,
    workerDogfoodEvidence: workerDogfoodEvidence
      ? {
          taskId: readString(
            workerDogfoodEvidence.taskId,
            workerDogfoodEvidence.task_id,
          ),
          status: readString(workerDogfoodEvidence.status),
          artifactRef: readString(
            workerDogfoodEvidence.artifactRef,
            workerDogfoodEvidence.artifact_ref,
          ),
          artifactKind: readString(
            workerDogfoodEvidence.artifactKind,
            workerDogfoodEvidence.artifact_kind,
          ),
          outputObjectCount: readNumber(
            workerDogfoodEvidence.outputObjectCount,
            workerDogfoodEvidence.output_object_count,
          ),
          errorCode: readString(
            workerDogfoodEvidence.errorCode,
            workerDogfoodEvidence.error_code,
          ),
          errorMessage: readString(
            workerDogfoodEvidence.errorMessage,
            workerDogfoodEvidence.error_message,
            workerDogfoodEvidence.message,
          ),
          failureCategory: readString(
            workerDogfoodEvidence.failureCategory,
            workerDogfoodEvidence.failure_category,
          ),
        }
      : null,
    artifactCount: artifacts.length,
    actionResultArtifacts: actionResultArtifacts.map((artifact) => ({
      artifactRef: readString(artifact.artifactRef, artifact.artifact_ref),
      kind: readString(artifact.kind),
      title: readString(artifact.title),
    })),
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
    storyboardArtifact: storyboardArtifact
      ? {
          artifactRef: readString(
            storyboardArtifact.artifactRef,
            storyboardArtifact.artifact_ref,
          ),
          kind: readString(storyboardArtifact.kind),
          title: readString(storyboardArtifact.title),
          artifactSchema: readString(storyboardMetadata.artifactSchema),
          artifactDocumentId: readString(storyboardMetadata.artifactDocumentId),
          surfaceKind: readString(storyboardMetadata.surfaceKind),
          productProfileObjectKind: readString(
            storyboardProductProfile.objectKind,
            storyboardProductProfile.object_kind,
          ),
          productProfileSurfaceKind: readString(
            storyboardProductProfile.surfaceKind,
            storyboardProductProfile.surface_kind,
          ),
          rendererContract: {
            pluginId: readString(
              storyboardRendererContract.pluginId,
              storyboardRendererContract.plugin_id,
            ),
            rendererKind: readString(
              storyboardRendererContract.rendererKind,
              storyboardRendererContract.renderer_kind,
            ),
            entry: readString(storyboardRendererContract.entry),
            executionMode: readString(
              storyboardRuntimeAuthorization.executionMode,
              storyboardRuntimeAuthorization.execution_mode,
            ),
            reasonCode: readString(
              storyboardRuntimeAuthorization.reasonCode,
              storyboardRuntimeAuthorization.reason_code,
            ),
            allowedOutputArtifactKinds: readArray(
              storyboardRuntimeAuthorization.allowedOutputArtifactKinds,
              storyboardRuntimeAuthorization.allowed_output_artifact_kinds,
            )
              .map((value) => readString(value))
              .filter(Boolean),
          },
        }
      : null,
    checklistArtifact: checklistArtifact
      ? {
          artifactRef: readString(
            checklistArtifact.artifactRef,
            checklistArtifact.artifact_ref,
          ),
          kind: readString(checklistArtifact.kind),
          title: readString(checklistArtifact.title),
          artifactSchema: readString(checklistMetadata.artifactSchema),
          artifactDocumentId: readString(checklistMetadata.artifactDocumentId),
          surfaceKind: readString(checklistMetadata.surfaceKind),
          productProfileObjectKind: readString(
            checklistProductProfile.objectKind,
            checklistProductProfile.object_kind,
          ),
          productProfileSurfaceKind: readString(
            checklistProductProfile.surfaceKind,
            checklistProductProfile.surface_kind,
          ),
        }
      : null,
  });
}

function summarizeRemotePluginRuntimeRejectionReadModel(result) {
  const detail = asRecord(result?.detail) ?? asRecord(result);
  const threadRead =
    asRecord(detail?.threadRead) ?? asRecord(detail?.thread_read) ?? {};
  const productWorkspace =
    asRecord(threadRead.productWorkspace) ??
    asRecord(threadRead.product_workspace) ??
    asRecord(detail?.productWorkspace) ??
    asRecord(detail?.product_workspace) ??
    {};
  const workerEvidence = readArray(
    productWorkspace.workerEvidence,
    productWorkspace.worker_evidence,
  );
  const rejectionEvidence = workerEvidence.find(
    (evidence) =>
      readString(evidence?.errorCode, evidence?.error_code) ===
      CONTENT_FACTORY_PRODUCT_PROFILE_REMOTE_REJECT_ERROR_CODE,
  );
  return sanitizeJson({
    status: readString(rejectionEvidence?.status),
    appId: readString(rejectionEvidence?.appId, rejectionEvidence?.app_id),
    taskId: readString(rejectionEvidence?.taskId, rejectionEvidence?.task_id),
    turnId: readString(rejectionEvidence?.turnId, rejectionEvidence?.turn_id),
    errorCode: readString(
      rejectionEvidence?.errorCode,
      rejectionEvidence?.error_code,
    ),
    failureCategory: readString(
      rejectionEvidence?.failureCategory,
      rejectionEvidence?.failure_category,
    ),
    outputArtifactKind: readString(
      rejectionEvidence?.outputArtifactKind,
      rejectionEvidence?.output_artifact_kind,
    ),
  });
}

function findArtifactByRef(artifacts, artifactRef) {
  return artifacts.find(
    (artifact) =>
      readString(artifact?.artifactRef, artifact?.artifact_ref) === artifactRef,
  );
}

function productObjectKind(object) {
  const ref = asRecord(object?.ref) ?? asRecord(object?.objectRef) ?? {};
  return readString(ref.kind);
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

function readNumber(...values) {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }
  return null;
}

function readBoolean(...values) {
  for (const value of values) {
    if (typeof value === "boolean") {
      return value;
    }
  }
  return null;
}
