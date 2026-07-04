import { startContentFactoryHostGenerationFixture } from "../lib/content-factory-host-generation-fixture.mjs";
import {
  APP_SERVER_METHOD_AGENT_SESSION_RUNTIME_EVENTS_APPEND,
  APP_SERVER_METHOD_ARTIFACT_READ,
  APP_SERVER_METHOD_SESSION_READ,
  APP_SERVER_METHOD_SESSION_START,
  APP_SERVER_METHOD_SESSION_TURN_START,
  APP_SERVER_METHOD_SESSION_UPDATE,
  APP_SERVER_METHOD_WORKFLOW_CANCEL,
  APP_SERVER_METHOD_WORKFLOW_READ,
  APP_SERVER_METHOD_WORKFLOW_RESPOND,
  APP_SERVER_METHOD_WORKFLOW_RETRY,
  APP_SERVER_METHOD_WORKSPACE_RIGHT_SURFACE_REQUEST,
  CONTENT_FACTORY_ARTICLE_WORKSPACE_ARTICLE_ARTIFACT_ID,
  CONTENT_FACTORY_ARTICLE_WORKSPACE_IMAGE_ARTIFACT_ID,
  CONTENT_FACTORY_ARTICLE_WORKSPACE_CONTRACT_REJECT_ERROR_CODE,
  CONTENT_FACTORY_ARTICLE_WORKSPACE_CONTRACT_REJECT_TURN_ID,
  CONTENT_FACTORY_ARTICLE_WORKSPACE_SESSION_ID,
  CONTENT_FACTORY_ARTICLE_WORKSPACE_SESSION_TITLE,
  CONTENT_FACTORY_ARTICLE_WORKSPACE_THREAD_ID,
  CONTENT_FACTORY_ARTICLE_WORKSPACE_TURN_ID,
  CONTENT_FACTORY_ARTICLE_WORKSPACE_WORKER_TASK_ID,
  CONTENT_FACTORY_ARTICLE_WORKSPACE_WORKER_TURN_ID,
  CONTENT_FACTORY_ARTICLE_WORKSPACE_WORKFLOW_REVIEW_REQUEST_ID,
  CONTENT_FACTORY_ARTICLE_WORKSPACE_WORKFLOW_REVIEW_STEP_ID,
  CONTENT_FACTORY_ARTICLE_WORKSPACE_WORKFLOW_RUN_ID,
  CONTENT_FACTORY_ARTICLE_WORKSPACE_WORKFLOW_CANCEL_RUN_ID,
  CONTENT_FACTORY_ARTICLE_WORKSPACE_WORKFLOW_CANCEL_STEP_ID,
  CONTENT_FACTORY_ARTICLE_WORKSPACE_WORKFLOW_RESPOND_REQUEST_ID,
  CONTENT_FACTORY_ARTICLE_WORKSPACE_WORKFLOW_RESPOND_RUN_ID,
  CONTENT_FACTORY_ARTICLE_WORKSPACE_WORKFLOW_RESPOND_STEP_ID,
  CONTENT_FACTORY_ARTICLE_WORKSPACE_WORKFLOW_RETRY_RUN_ID,
  CONTENT_FACTORY_ARTICLE_WORKSPACE_WORKFLOW_RETRY_STEP_ID,
  FIXTURE_MODEL,
  FIXTURE_PROVIDER,
} from "./claw-chat-current-fixture-constants.mjs";
import {
  runWorkspacePatchWorkerDogfoodTurn,
  saveWorkspacePatchWorkerInstalledState,
} from "./claw-chat-current-fixture-content-factory-worker-dogfood.mjs";
import {
  buildContentFactoryActionResultWorkspacePatch,
  buildContentFactoryWorkspacePatch,
} from "./claw-chat-current-fixture-content-factory-workspace-patches.mjs";
import {
  invokeAppServerFromPage,
  reloadRendererDocument,
  waitForRendererReady,
} from "./claw-chat-current-fixture-rpc.mjs";
import {
  openSessionFromSidebar,
  waitForGuiSessionVisible,
} from "./claw-chat-current-fixture-session.mjs";
import {
  assert,
  sanitizeJson,
  sleep,
} from "./claw-chat-current-fixture-utils.mjs";

const CONTENT_FACTORY_APP_ID = "content-factory-app";
const IMAGE_SET_OBJECT_ID = "image-set-1";
const CONTENT_FACTORY_ARTICLE_WORKSPACE_STORYBOARD_ARTIFACT_ID =
  "artifact-video-storyboard";
const CONTENT_FACTORY_ARTICLE_WORKSPACE_CHECKLIST_ARTIFACT_ID =
  "artifact-delivery-checklist";
const CONTENT_FACTORY_ARTICLE_WORKSPACE_EDITED_DRAFT_MARKER =
  "E2E_EDITED_ARTICLE_DRAFT_RESTORED";
const FORBIDDEN_CONTENT_FACTORY_ARTICLE_TEMPLATE_MARKERS = [
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
const CONTENT_FACTORY_ARTICLE_WORKSPACE_EDITED_DRAFT_MARKDOWN = [
  "# 内容工厂首版文章 - 编辑后恢复稿",
  "",
  "## 编辑恢复验证",
  "",
  `这是一段来自 Article Editor 画布编辑后的唯一正文标记：${CONTENT_FACTORY_ARTICLE_WORKSPACE_EDITED_DRAFT_MARKER}。`,
  "",
  "## 三轮资料检索",
  "",
  "- 第一轮：确认写作主题与读者预期。",
  "- 第二轮：补齐案例、引用与反方风险。",
  "- 第三轮：把资料收束成可发布正文。",
  "",
  "## 正文草稿",
  "",
  "编辑后的正文必须覆盖 worker 首稿，并且刷新或重新打开会话后仍回到 Article Editor 画布。",
].join("\n");
const CONTENT_FACTORY_ARTICLE_WORKSPACE_EDITED_DRAFT_UPDATED_AT =
  "2026-06-29T10:00:00.000Z";

export async function runContentFactoryArticleWorkspaceScenario({
  page,
  options,
  workspace,
  appServerRequests,
}) {
  const hostGenerationFixture =
    await startContentFactoryHostGenerationFixture();
  try {
    const sessionCreation = await createContentFactoryArticleWorkspaceSession(
      page,
      workspace,
      appServerRequests,
    );
    const installedStateSave = await saveWorkspacePatchWorkerInstalledState(
      page,
      appServerRequests,
    );

    const runtimeEventsAppend = await appendContentFactoryRuntimeEvents(
      page,
      workspace,
      appServerRequests,
    );
    const workerTurnStart = await runWorkspacePatchWorkerDogfoodTurn({
      page,
      options,
      workspace,
      requestLog: appServerRequests,
      hostGenerationFixture,
    });
    const actionResultRuntimeEventsAppend =
      await appendContentFactoryArticleWorkspaceActionResultRuntimeEvents(
        page,
        workspace,
        appServerRequests,
      );
    const rightSurfaceRequest =
      await requestContentFactoryArticleWorkspaceSurface(
        page,
        workspace,
        appServerRequests,
      );

    await notifySessionChanged(page, workspace.workspaceId);

    const guiSessionVisible = await waitForGuiSessionVisible(
      page,
      options,
      CONTENT_FACTORY_ARTICLE_WORKSPACE_SESSION_TITLE,
    );
    const guiSessionOpened = await openSessionFromSidebar(
      page,
      options,
      appServerRequests,
      {
        sessionId: CONTENT_FACTORY_ARTICLE_WORKSPACE_SESSION_ID,
        title: CONTENT_FACTORY_ARTICLE_WORKSPACE_SESSION_TITLE,
      },
    );

    const articleArtifactFrame = await clickContentFactoryArticleArtifactFrame(
      page,
      options,
    );
    const rightSurface = await waitForContentFactoryArticleEditorOpened(
      page,
      options,
    );
    const articleObjectSelection = await selectContentFactoryArticleObject(
      page,
      options,
    );
    const articleCanvasSurface =
      await waitForContentFactoryArticleCanvasSurface(page, options);
    const articleEditedDraftUpdate =
      await updateContentFactoryArticleWorkspaceEditedDraft(
        page,
        options,
        appServerRequests,
      );
    const articleEditedDraftReload =
      await reloadContentFactoryArticleWorkspaceSession(
        page,
        options,
        workspace,
      );
    const articleEditedDraftSessionReopened = await openSessionFromSidebar(
      page,
      options,
      appServerRequests,
      {
        sessionId: CONTENT_FACTORY_ARTICLE_WORKSPACE_SESSION_ID,
        title: CONTENT_FACTORY_ARTICLE_WORKSPACE_SESSION_TITLE,
      },
    );
    const articleEditedDraftArtifactFrame =
      await clickContentFactoryArticleArtifactFrame(page, options);
    const articleEditedDraftRestored =
      await waitForContentFactoryArticleWorkspaceEditedDraftRestored(
        page,
        options,
      );
    const storyboardObjectSelection =
      await selectContentFactoryStoryboardObject(page, options);
    const gui = await waitForContentFactoryArticleWorkspaceGui(page, options);

    const readModel = await invokeAppServerFromPage(
      page,
      APP_SERVER_METHOD_SESSION_READ,
      {
        sessionId: CONTENT_FACTORY_ARTICLE_WORKSPACE_SESSION_ID,
        historyLimit: 20,
      },
      appServerRequests,
    );
    const readModelSummary = summarizeContentFactoryArticleWorkspaceReadModel(
      readModel.result,
    );
    const articleArtifactRef =
      readModelSummary.workerArticleObject?.previewArtifactId ||
      CONTENT_FACTORY_ARTICLE_WORKSPACE_ARTICLE_ARTIFACT_ID;

    const artifactRead = await invokeAppServerFromPage(
      page,
      APP_SERVER_METHOD_ARTIFACT_READ,
      {
        sessionId: CONTENT_FACTORY_ARTICLE_WORKSPACE_SESSION_ID,
        artifactRef: articleArtifactRef,
        includeContent: true,
        limit: 1,
      },
      appServerRequests,
    );
    const artifactReadSummary = summarizeContentFactoryArtifactRead(
      artifactRead.result,
    );
    const workflowRead = await invokeAppServerFromPage(
      page,
      APP_SERVER_METHOD_WORKFLOW_READ,
      {
        sessionId: CONTENT_FACTORY_ARTICLE_WORKSPACE_SESSION_ID,
      },
      appServerRequests,
    );
    const workflowReadSummary = summarizeContentFactoryWorkflowRead(
      workflowRead.result,
    );
    const workflowRespond = await invokeAppServerFromPage(
      page,
      APP_SERVER_METHOD_WORKFLOW_RESPOND,
      {
        sessionId: CONTENT_FACTORY_ARTICLE_WORKSPACE_SESSION_ID,
        workflowRunId:
          CONTENT_FACTORY_ARTICLE_WORKSPACE_WORKFLOW_RESPOND_RUN_ID,
        stepId: CONTENT_FACTORY_ARTICLE_WORKSPACE_WORKFLOW_RESPOND_STEP_ID,
        requestId:
          CONTENT_FACTORY_ARTICLE_WORKSPACE_WORKFLOW_RESPOND_REQUEST_ID,
        confirmed: false,
        response: {
          answer: "暂不进入交付检查",
        },
      },
      appServerRequests,
    );
    const workflowRespondSummary = summarizeContentFactoryWorkflowControl(
      workflowRespond.result,
      {
        workflowRunId:
          CONTENT_FACTORY_ARTICLE_WORKSPACE_WORKFLOW_RESPOND_RUN_ID,
        stepId: CONTENT_FACTORY_ARTICLE_WORKSPACE_WORKFLOW_RESPOND_STEP_ID,
        requestId:
          CONTENT_FACTORY_ARTICLE_WORKSPACE_WORKFLOW_RESPOND_REQUEST_ID,
      },
    );
    const workflowCancel = await invokeAppServerFromPage(
      page,
      APP_SERVER_METHOD_WORKFLOW_CANCEL,
      {
        sessionId: CONTENT_FACTORY_ARTICLE_WORKSPACE_SESSION_ID,
        workflowRunId: CONTENT_FACTORY_ARTICLE_WORKSPACE_WORKFLOW_CANCEL_RUN_ID,
        reasonCode: "fixture_cancel_requested",
        reason: "Electron workflow control fixture",
      },
      appServerRequests,
    );
    const workflowCancelSummary = summarizeContentFactoryWorkflowControl(
      workflowCancel.result,
      {
        workflowRunId: CONTENT_FACTORY_ARTICLE_WORKSPACE_WORKFLOW_CANCEL_RUN_ID,
        stepId: CONTENT_FACTORY_ARTICLE_WORKSPACE_WORKFLOW_CANCEL_STEP_ID,
      },
    );
    const workflowRetry = await invokeAppServerFromPage(
      page,
      APP_SERVER_METHOD_WORKFLOW_RETRY,
      {
        sessionId: CONTENT_FACTORY_ARTICLE_WORKSPACE_SESSION_ID,
        workflowRunId: CONTENT_FACTORY_ARTICLE_WORKSPACE_WORKFLOW_RETRY_RUN_ID,
        stepId: CONTENT_FACTORY_ARTICLE_WORKSPACE_WORKFLOW_RETRY_STEP_ID,
        reasonCode: "fixture_retry_requested",
        reason: "Electron workflow control fixture",
      },
      appServerRequests,
    );
    const workflowRetrySummary = summarizeContentFactoryWorkflowControl(
      workflowRetry.result,
      {
        workflowRunId: CONTENT_FACTORY_ARTICLE_WORKSPACE_WORKFLOW_RETRY_RUN_ID,
        stepId: CONTENT_FACTORY_ARTICLE_WORKSPACE_WORKFLOW_RETRY_STEP_ID,
      },
    );
    const runtimeContractRejection = await runRuntimeContractRejectionProbe({
      page,
      workspace,
      options,
      requestLog: appServerRequests,
    });

    return sanitizeJson({
      contentFactoryArticleWorkspaceSessionCreation: sessionCreation,
      contentFactoryArticleWorkspaceInstalledStateSave: installedStateSave,
      contentFactoryArticleWorkspaceRuntimeEventsAppend:
        summarizeRuntimeEventsAppend(runtimeEventsAppend.result),
      contentFactoryArticleWorkspaceWorkerTurnStart: workerTurnStart,
      contentFactoryArticleWorkspaceWorkerHostGenerationFixture:
        hostGenerationFixture.summary(),
      contentFactoryArticleWorkspaceRuntimeContractRejection:
        runtimeContractRejection,
      contentFactoryArticleWorkspaceActionResultRuntimeEventsAppend:
        summarizeRuntimeEventsAppend(actionResultRuntimeEventsAppend.result),
      contentFactoryArticleWorkspaceRightSurfaceRequest:
        summarizeRightSurfaceRequest(rightSurfaceRequest.result),
      guiContentFactoryArticleWorkspaceSessionVisible: guiSessionVisible,
      guiContentFactoryArticleWorkspaceSessionOpened: guiSessionOpened,
      contentFactoryArticleWorkspaceArtifactFrame: articleArtifactFrame,
      contentFactoryArticleWorkspaceRightSurface: rightSurface,
      contentFactoryArticleWorkspaceArticleObjectSelection:
        articleObjectSelection,
      contentFactoryArticleWorkspaceArticleCanvasSurface: articleCanvasSurface,
      contentFactoryArticleWorkspaceEditedDraftUpdate: articleEditedDraftUpdate,
      contentFactoryArticleWorkspaceEditedDraftReload: articleEditedDraftReload,
      contentFactoryArticleWorkspaceEditedDraftSessionReopened:
        articleEditedDraftSessionReopened,
      contentFactoryArticleWorkspaceEditedDraftArtifactFrame:
        articleEditedDraftArtifactFrame,
      contentFactoryArticleWorkspaceEditedDraftRestored:
        articleEditedDraftRestored,
      contentFactoryArticleWorkspaceStoryboardObjectSelection:
        storyboardObjectSelection,
      contentFactoryArticleWorkspaceGui: gui,
      contentFactoryArticleWorkspaceReadModel: readModelSummary,
      contentFactoryArticleWorkspaceArtifactRead: artifactReadSummary,
      contentFactoryArticleWorkspaceWorkflowRead: workflowReadSummary,
      contentFactoryArticleWorkspaceWorkflowRespond: workflowRespondSummary,
      contentFactoryArticleWorkspaceWorkflowCancel: workflowCancelSummary,
      contentFactoryArticleWorkspaceWorkflowRetry: workflowRetrySummary,
    });
  } finally {
    await hostGenerationFixture.close();
  }
}

async function reloadContentFactoryArticleWorkspaceSession(
  page,
  options,
  workspace,
) {
  const reload = await reloadRendererDocument(page, options);
  const renderer = await waitForRendererReady(page, options);
  await notifySessionChanged(page, workspace.workspaceId);
  const sessionVisible = await waitForGuiSessionVisible(
    page,
    options,
    CONTENT_FACTORY_ARTICLE_WORKSPACE_SESSION_TITLE,
  );
  return sanitizeJson({
    reload,
    renderer,
    sessionVisible,
  });
}

async function updateContentFactoryArticleWorkspaceEditedDraft(
  page,
  options,
  requestLog,
) {
  const objectRef = await readContentFactoryArticleDraftObjectRef(
    page,
    options,
    requestLog,
  );
  const editedDraft = {
    objectKey: `${objectRef.appId}:${objectRef.sessionId}:${objectRef.kind}:${objectRef.id}`,
    objectRef,
    markdown: CONTENT_FACTORY_ARTICLE_WORKSPACE_EDITED_DRAFT_MARKDOWN,
    updatedAt: CONTENT_FACTORY_ARTICLE_WORKSPACE_EDITED_DRAFT_UPDATED_AT,
  };
  const response = await invokeAppServerFromPage(
    page,
    APP_SERVER_METHOD_SESSION_UPDATE,
    {
      sessionId: CONTENT_FACTORY_ARTICLE_WORKSPACE_SESSION_ID,
      articleWorkspaceEditedDraft: editedDraft,
    },
    requestLog,
  );

  return sanitizeJson({
    sessionId:
      response.result?.session?.sessionId ??
      response.result?.session?.session_id ??
      CONTENT_FACTORY_ARTICLE_WORKSPACE_SESSION_ID,
    objectKey: editedDraft.objectKey,
    objectRef,
    markdownMarker: CONTENT_FACTORY_ARTICLE_WORKSPACE_EDITED_DRAFT_MARKER,
    updatedAt: editedDraft.updatedAt,
  });
}

async function readContentFactoryArticleDraftObjectRef(
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
    const summary = summarizeContentFactoryArticleWorkspaceReadModel(
      readModel.result,
    );
    lastSummary = summary;
    const objectRef = summary.workerArticleObject?.objectRef;
    if (
      objectRef?.appId &&
      objectRef?.sessionId &&
      objectRef?.kind === "articleDraft" &&
      objectRef?.id
    ) {
      return objectRef;
    }
    await sleep(options.intervalMs);
  }
  throw new Error(
    `内容工厂 Article Editor 未找到可编辑文章对象: ${JSON.stringify(
      sanitizeJson(lastSummary),
    )}`,
  );
}

async function waitForContentFactoryArticleWorkspaceEditedDraftRestored(
  page,
  options,
) {
  const startedAt = Date.now();
  let lastSnapshot = null;
  while (Date.now() - startedAt < options.timeoutMs) {
    const snapshot = await page.evaluate(
      ({ marker }) => {
        const canvases = Array.from(
          document.querySelectorAll(
            '[data-testid="workspace-article-editor-canvas"]',
          ),
        );
        const canvas = canvases.find(isVisible) ?? null;
        const canvasContents = Array.from(
          document.querySelectorAll(
            '[data-testid="workspace-article-editor-canvas-content"]',
          ),
        );
        const canvasContent = canvasContents.find(isVisible) ?? null;
        const status = document.querySelector(
          '[data-testid="workspace-article-editor-canvas-status"]',
        );
        const bodyText = document.body?.innerText || "";
        const canvasText =
          canvasContent?.textContent || canvas?.textContent || "";
        return {
          canvasVisible: isVisible(canvas),
          canvasDirty: canvas?.getAttribute("data-dirty") ?? null,
          canvasText: canvasText.slice(0, 1600),
          statusText: status?.textContent ?? "",
          markerVisibleInCanvas: canvasText.includes(marker),
          markerVisibleInBody: bodyText.includes(marker),
          hasEditedTitle:
            canvasText.includes("内容工厂首版文章 - 编辑后恢复稿"),
          hasWorkerMetadataStillVisible:
            bodyText.includes("标题候选") &&
            bodyText.includes("关键观点") &&
            bodyText.includes("配图"),
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
      },
      { marker: CONTENT_FACTORY_ARTICLE_WORKSPACE_EDITED_DRAFT_MARKER },
    );
    lastSnapshot = snapshot;
    if (
      snapshot?.canvasVisible &&
      snapshot.markerVisibleInCanvas &&
      snapshot.hasEditedTitle
    ) {
      return sanitizeJson(snapshot);
    }
    await sleep(options.intervalMs);
  }
  throw new Error(
    `内容工厂 Article Editor 编辑草稿未从会话恢复: ${JSON.stringify(
      sanitizeJson(lastSnapshot),
    )}`,
  );
}

async function clickContentFactoryArticleArtifactFrame(page, options) {
  const startedAt = Date.now();
  let lastSnapshot = null;
  while (Date.now() - startedAt < options.timeoutMs) {
    const snapshot = await page.evaluate(() => {
      const frames = Array.from(
        document.querySelectorAll(
          '[data-testid="article-artifact-frame"], [data-frame-kind="articleArtifacts"]',
        ),
      );
      const frame = frames.find(isVisible) ?? frames[0] ?? null;
      const buttons = Array.from(frame?.querySelectorAll("button") ?? []);
      const button =
        buttons.find((candidate) => {
          const text = candidate.textContent?.replace(/\s+/g, " ").trim() ?? "";
          return text.includes("展开右侧编辑器");
        }) ??
        buttons.find((candidate) => {
          const text = candidate.textContent?.replace(/\s+/g, " ").trim() ?? "";
          return text.includes("打开编辑器");
        }) ??
        buttons.at(-1) ??
        buttons[0] ??
        null;
      const bodyText = document.body?.innerText || "";
      const frameText = frame?.textContent ?? "";
      const rect = frame?.getBoundingClientRect();
      const style = frame ? window.getComputedStyle(frame) : null;
      const visible = Boolean(
        frame &&
        rect &&
        rect.width > 8 &&
        rect.height > 8 &&
        style?.display !== "none" &&
        style?.visibility !== "hidden",
      );
      const buttonDisabled =
        button instanceof HTMLButtonElement
          ? button.disabled || button.getAttribute("aria-disabled") === "true"
          : null;
      if (visible && button && buttonDisabled === false) {
        button.click();
      }
      return {
        visible,
        frameCount: frames.length,
        visibleFrameCount: frames.filter(isVisible).length,
        buttonPresent: Boolean(button),
        buttonText: button?.textContent?.replace(/\s+/g, " ").trim() ?? "",
        buttonDisabled,
        frameText: frameText.slice(0, 500),
        hasArticleTitle:
          bodyText.includes("公众号文章草稿") ||
          frameText.includes("articleDraft") ||
          frameText.length > 200,
        hasArticleDraftObject:
          frameText.includes("articleDraft") || frameText.length > 200,
        hasArticlePreviewContent:
          frameText.length > 200 &&
          !frameText.includes("等待正文产物") &&
          !frameText.includes("文章正文生成后会出现在这里"),
        hasLegacyWorkerTemplateText:
          bodyText.includes("三轮资料检索") ||
          frameText.includes("先把目标定清楚") ||
          frameText.includes("学习路线"),
        hasArticlePreviewBodyContent:
          frameText.length > 200 && frameText.includes("打开文档"),
        hasEditedDraftMarker: bodyText.includes(
          "E2E_EDITED_ARTICLE_DRAFT_RESTORED",
        ),
        rect: rect ? rectToJson(rect) : null,
      };

      function rectToJson(rect) {
        return {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          top: Math.round(rect.top),
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          bottom: Math.round(rect.bottom),
        };
      }

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
      snapshot?.visible &&
      snapshot.buttonPresent &&
      snapshot.buttonDisabled === false
    ) {
      return sanitizeJson(snapshot);
    }
    await sleep(options.intervalMs);
  }
  throw new Error(
    `内容工厂 ArticleArtifactFrame 不可点击: ${JSON.stringify(
      sanitizeJson(lastSnapshot),
    )}`,
  );
}

async function waitForContentFactoryArticleEditorOpened(page, options) {
  const startedAt = Date.now();
  let lastSnapshot = null;
  while (Date.now() - startedAt < options.timeoutMs) {
    const snapshot = await page.evaluate(() => {
      const host = document.querySelector(
        '[data-testid="workspace-right-surface-host"]',
      );
      const hostPane = document.querySelector(
        '[data-testid="workspace-right-surface-active-pane"]',
      );
      const layoutRoot = document.querySelector(
        '[data-testid="layout-transition-root"]',
      );
      const layoutCanvasPanel = document.querySelector(
        '[data-testid="layout-canvas-panel"]',
      );
      const roots = Array.from(
        document.querySelectorAll(
          '[data-testid="workspace-article-editor-surface"]',
        ),
      );
      const root = roots.find(isVisible) ?? roots[0] ?? null;
      const canvases = Array.from(
        document.querySelectorAll(
          '[data-testid="workspace-article-editor-canvas"]',
        ),
      );
      const canvas = canvases.find(isVisible) ?? canvases[0] ?? null;
      const fixtureOnlyNotice = document.querySelector(
        '[data-testid="workspace-article-editor-fixture-only"]',
      );
      const bodyText = document.body?.innerText || "";
      const canvasText = canvas?.innerText || "";
      const articleDraftButtons = Array.from(
        document.querySelectorAll(
          '[data-testid="workspace-article-editor-related-articleDraft"]',
        ),
      );
      const articleHeaderTitle =
        root?.querySelector("h2")?.textContent?.replace(/\s+/g, " ").trim() ??
        "";
      const fixtureOnlyArticleHidden =
        isVisible(fixtureOnlyNotice) &&
        !canvasText.includes("fixtureOnlyHostGeneration") &&
        !canvasText.includes("fixturePromptFingerprint");
      const hasArticleDraftObject =
        articleDraftButtons.length > 0 ||
        (articleHeaderTitle.length > 0 &&
          (fixtureOnlyArticleHidden ||
            (canvasText.length > 160 &&
              !canvasText.includes("文章正文生成后会出现在这里"))));
      const hasArticleCanvasContent =
        fixtureOnlyArticleHidden ||
        (canvasText.length > 160 &&
          !canvasText.includes("文章正文生成后会出现在这里"));
      return {
        activeSurface: host?.getAttribute("data-surface") ?? null,
        hostVisible: isVisible(host),
        hostPaneVisible: isVisible(hostPane),
        layoutRootVisible: isVisible(layoutRoot),
        layoutCanvasPanelVisible: isVisible(layoutCanvasPanel),
        hostRect: rectToJson(host?.getBoundingClientRect() ?? null),
        hostPaneRect: rectToJson(hostPane?.getBoundingClientRect() ?? null),
        layoutRootRect: rectToJson(layoutRoot?.getBoundingClientRect() ?? null),
        layoutCanvasPanelRect: rectToJson(
          layoutCanvasPanel?.getBoundingClientRect() ?? null,
        ),
        layoutRootStyle: readStyle(layoutRoot),
        layoutCanvasPanelStyle: readStyle(layoutCanvasPanel),
        hostStyle: readStyle(host),
        hostPaneStyle: readStyle(hostPane),
        rootRect: rectToJson(root?.getBoundingClientRect() ?? null),
        canvasRect: rectToJson(canvas?.getBoundingClientRect() ?? null),
        rootStyle: readStyle(root),
        canvasStyle: readStyle(canvas),
        rootVisible: isVisible(root),
        canvasVisible: isVisible(canvas),
        visibleRootCount: roots.filter(isVisible).length,
        visibleCanvasCount: canvases.filter(isVisible).length,
        hasArticleEditorTitle:
          bodyText.includes("文章编辑器") ||
          bodyText.includes("Article Editor"),
        hasArticleTitle:
          bodyText.includes("公众号文章草稿") || hasArticleDraftObject,
        hasArticleDraftObject,
        hasArticleCanvasContent,
        hasFixtureOnlyArticleHidden: fixtureOnlyArticleHidden,
        articleHeaderTitle,
        articleDraftObjectCount: articleDraftButtons.length,
        hasLoadedDraftStatus:
          bodyText.includes("已载入产物正文") ||
          bodyText.includes("测试夹具正文未载入"),
        hasLegacyWorkerTemplateText:
          bodyText.includes("三轮资料检索") ||
          canvasText.includes("先把目标定清楚") ||
          canvasText.includes("学习路线"),
        hasArticleCanvasBodyContent: hasArticleCanvasContent,
        hasArticleArtifactFrame: Boolean(
          document.querySelector('[data-testid="article-artifact-frame"]') ??
          document.querySelector('[data-frame-kind="articleArtifacts"]'),
        ),
        bodyTextSample: bodyText.slice(0, 1600),
      };

      function rectToJson(rect) {
        if (!rect) {
          return null;
        }
        return {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          top: Math.round(rect.top),
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          bottom: Math.round(rect.bottom),
        };
      }

      function readStyle(node) {
        if (!node) {
          return null;
        }
        const style = window.getComputedStyle(node);
        return {
          display: style.display,
          width: style.width,
          height: style.height,
          minWidth: style.minWidth,
          minHeight: style.minHeight,
          flex: style.flex,
          flexBasis: style.flexBasis,
          flexGrow: style.flexGrow,
          flexShrink: style.flexShrink,
          position: style.position,
          overflow: style.overflow,
          boxSizing: style.boxSizing,
        };
      }

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
      snapshot?.activeSurface === "articleWorkspace" &&
      snapshot.rootVisible &&
      snapshot.canvasVisible &&
      snapshot.hasArticleEditorTitle &&
      snapshot.hasArticleDraftObject &&
      snapshot.hasArticleCanvasContent
    ) {
      return sanitizeJson(snapshot);
    }
    await sleep(options.intervalMs);
  }
  throw new Error(
    `点击 ArticleArtifactFrame 后 Article Editor 未展开: ${JSON.stringify(
      sanitizeJson(lastSnapshot),
    )}`,
  );
}

async function requestContentFactoryArticleWorkspaceSurface(
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
      sessionId: CONTENT_FACTORY_ARTICLE_WORKSPACE_SESSION_ID,
      surfaceKind: "articleWorkspace",
      origin: "runtime",
      priority: "foreground",
      candidateId: "content-factory-article-workspace",
      reason: "plugin_article_workspace_ready",
      ttlMs: 120_000,
      metadata: {
        fixtureOrigin: "content-factory-article-workspace",
        contentFactoryWorkspacePatch:
          buildContentFactoryWorkspacePatch(workspace),
      },
    },
    requestLog,
  );
}

async function createContentFactoryArticleWorkspaceSession(
  page,
  workspace,
  requestLog,
) {
  assert(
    workspace?.rootPath,
    "内容工厂 Article Editor fixture 缺少 workspace rootPath",
  );
  assert(
    workspace?.workspaceId,
    "内容工厂 Article Editor fixture 缺少 workspaceId",
  );

  const session = await invokeAppServerFromPage(
    page,
    APP_SERVER_METHOD_SESSION_START,
    {
      sessionId: CONTENT_FACTORY_ARTICLE_WORKSPACE_SESSION_ID,
      threadId: CONTENT_FACTORY_ARTICLE_WORKSPACE_THREAD_ID,
      appId: CONTENT_FACTORY_APP_ID,
      workspaceId: workspace.workspaceId,
      workingDir: workspace.rootPath,
      businessObjectRef: {
        kind: "agent.session",
        id: `agent-session:${workspace.workspaceId}:${CONTENT_FACTORY_ARTICLE_WORKSPACE_SESSION_ID}`,
        title: CONTENT_FACTORY_ARTICLE_WORKSPACE_SESSION_TITLE,
        metadata: {
          title: CONTENT_FACTORY_ARTICLE_WORKSPACE_SESSION_TITLE,
          workingDir: workspace.rootPath,
          working_dir: workspace.rootPath,
          appId: CONTENT_FACTORY_APP_ID,
          executionStrategy: "react",
          runStartHooks: false,
          harness: {
            hiddenFromUserRecents: false,
            source: "smoke:content-factory-article-workspace",
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
      sessionId: CONTENT_FACTORY_ARTICLE_WORKSPACE_SESSION_ID,
      title: CONTENT_FACTORY_ARTICLE_WORKSPACE_SESSION_TITLE,
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
    title: CONTENT_FACTORY_ARTICLE_WORKSPACE_SESSION_TITLE,
  });
}

async function appendContentFactoryRuntimeEvents(page, workspace, requestLog) {
  return await invokeAppServerFromPage(
    page,
    APP_SERVER_METHOD_AGENT_SESSION_RUNTIME_EVENTS_APPEND,
    {
      sessionId: CONTENT_FACTORY_ARTICLE_WORKSPACE_SESSION_ID,
      turnId: null,
      runtimeEvents: [
        {
          type: "workflow.run.started",
          payload: {
            workflowRunId: CONTENT_FACTORY_ARTICLE_WORKSPACE_WORKFLOW_RUN_ID,
            workflowKey: "content_article_workflow",
            workflowTitle: "内容工厂文章生产",
            appId: CONTENT_FACTORY_APP_ID,
            sessionId: CONTENT_FACTORY_ARTICLE_WORKSPACE_SESSION_ID,
            workspaceId: workspace.workspaceId,
            turnId: CONTENT_FACTORY_ARTICLE_WORKSPACE_TURN_ID,
            taskId: "article_job_1",
            taskKind: "content.article.generate",
            status: "running",
            sourceKind: "plugin_worker",
            artifactRefs: [
              CONTENT_FACTORY_ARTICLE_WORKSPACE_ARTICLE_ARTIFACT_ID,
            ],
            steps: [
              {
                stepId: "research",
                stepTitle: "资料检索",
                stepIndex: 0,
                stepCount: 3,
                status: "completed",
                artifactRefs: [
                  CONTENT_FACTORY_ARTICLE_WORKSPACE_ARTICLE_ARTIFACT_ID,
                ],
              },
              {
                stepId: "draft",
                stepTitle: "正文写作",
                stepIndex: 1,
                stepCount: 3,
                status: "completed",
                artifactRefs: [
                  CONTENT_FACTORY_ARTICLE_WORKSPACE_ARTICLE_ARTIFACT_ID,
                ],
              },
              {
                stepId:
                  CONTENT_FACTORY_ARTICLE_WORKSPACE_WORKFLOW_REVIEW_STEP_ID,
                stepTitle: "人工复核",
                stepIndex: 2,
                stepCount: 3,
                status: "waiting",
                requestId:
                  CONTENT_FACTORY_ARTICLE_WORKSPACE_WORKFLOW_REVIEW_REQUEST_ID,
                actionType: "ask_user",
                progressMessage: "等待用户确认文章可进入交付检查",
              },
            ],
          },
        },
        {
          type: "workflow.step.waiting",
          payload: {
            workflowRunId: CONTENT_FACTORY_ARTICLE_WORKSPACE_WORKFLOW_RUN_ID,
            workflowKey: "content_article_workflow",
            stepId: CONTENT_FACTORY_ARTICLE_WORKSPACE_WORKFLOW_REVIEW_STEP_ID,
            stepTitle: "人工复核",
            stepIndex: 2,
            stepCount: 3,
            status: "waiting",
            requestId:
              CONTENT_FACTORY_ARTICLE_WORKSPACE_WORKFLOW_REVIEW_REQUEST_ID,
            actionType: "ask_user",
            progressMessage: "等待用户确认文章可进入交付检查",
          },
        },
        {
          type: "action.required",
          payload: {
            requestId:
              CONTENT_FACTORY_ARTICLE_WORKSPACE_WORKFLOW_RESPOND_REQUEST_ID,
            actionType: "ask_user",
            prompt: "请确认是否进入交付检查",
          },
        },
        {
          type: "workflow.run.started",
          payload: {
            workflowRunId:
              CONTENT_FACTORY_ARTICLE_WORKSPACE_WORKFLOW_RESPOND_RUN_ID,
            workflowKey: "content_article_workflow",
            workflowTitle: "内容工厂响应控制验证",
            appId: CONTENT_FACTORY_APP_ID,
            sessionId: CONTENT_FACTORY_ARTICLE_WORKSPACE_SESSION_ID,
            workspaceId: workspace.workspaceId,
            taskId: "article_respond_job_1",
            taskKind: "content.article.generate",
            status: "running",
            sourceKind: "plugin_worker",
            steps: [
              {
                stepId:
                  CONTENT_FACTORY_ARTICLE_WORKSPACE_WORKFLOW_RESPOND_STEP_ID,
                stepTitle: "响应人工复核",
                stepIndex: 0,
                stepCount: 1,
                status: "waiting",
                requestId:
                  CONTENT_FACTORY_ARTICLE_WORKSPACE_WORKFLOW_RESPOND_REQUEST_ID,
                actionType: "ask_user",
                progressMessage: "等待用户决定是否继续交付",
              },
            ],
          },
        },
        {
          type: "workflow.run.started",
          payload: {
            workflowRunId:
              CONTENT_FACTORY_ARTICLE_WORKSPACE_WORKFLOW_CANCEL_RUN_ID,
            workflowKey: "content_article_workflow",
            workflowTitle: "内容工厂取消控制验证",
            appId: CONTENT_FACTORY_APP_ID,
            sessionId: CONTENT_FACTORY_ARTICLE_WORKSPACE_SESSION_ID,
            workspaceId: workspace.workspaceId,
            taskId: "article_cancel_job_1",
            taskKind: "content.article.generate",
            status: "running",
            sourceKind: "plugin_worker",
            steps: [
              {
                stepId:
                  CONTENT_FACTORY_ARTICLE_WORKSPACE_WORKFLOW_CANCEL_STEP_ID,
                stepTitle: "取消草稿生成",
                stepIndex: 0,
                stepCount: 1,
                status: "running",
                progressMessage: "等待取消控制验证",
              },
            ],
          },
        },
        {
          type: "workflow.run.started",
          payload: {
            workflowRunId:
              CONTENT_FACTORY_ARTICLE_WORKSPACE_WORKFLOW_RETRY_RUN_ID,
            workflowKey: "content_article_workflow",
            workflowTitle: "内容工厂重试控制验证",
            appId: CONTENT_FACTORY_APP_ID,
            sessionId: CONTENT_FACTORY_ARTICLE_WORKSPACE_SESSION_ID,
            workspaceId: workspace.workspaceId,
            turnId: CONTENT_FACTORY_ARTICLE_WORKSPACE_WORKER_TURN_ID,
            taskId: "article_retry_job_1",
            taskKind: "content.article.generate",
            status: "running",
            sourceKind: "plugin_worker",
            steps: [
              {
                stepId:
                  CONTENT_FACTORY_ARTICLE_WORKSPACE_WORKFLOW_RETRY_STEP_ID,
                stepTitle: "重试草稿生成",
                stepIndex: 0,
                stepCount: 1,
                status: "failed",
                attempt: 1,
                failure: {
                  source: "fixture",
                  reasonCode: "fixture_retry_source_failed",
                  message: "Electron workflow retry source failed",
                },
                progressMessage: "等待 workflow/retry 重新调度",
              },
            ],
          },
        },
        {
          type: "workflow.step.failed",
          payload: {
            workflowRunId:
              CONTENT_FACTORY_ARTICLE_WORKSPACE_WORKFLOW_RETRY_RUN_ID,
            workflowKey: "content_article_workflow",
            stepId: CONTENT_FACTORY_ARTICLE_WORKSPACE_WORKFLOW_RETRY_STEP_ID,
            stepTitle: "重试草稿生成",
            stepIndex: 0,
            stepCount: 1,
            turnId: CONTENT_FACTORY_ARTICLE_WORKSPACE_WORKER_TURN_ID,
            attempt: 1,
            status: "failed",
            failure: {
              source: "fixture",
              reasonCode: "fixture_retry_source_failed",
              message: "Electron workflow retry source failed",
            },
          },
        },
        {
          type: "workflow.run.failed",
          payload: {
            workflowRunId:
              CONTENT_FACTORY_ARTICLE_WORKSPACE_WORKFLOW_RETRY_RUN_ID,
            workflowKey: "content_article_workflow",
            workflowTitle: "内容工厂重试控制验证",
            appId: CONTENT_FACTORY_APP_ID,
            sessionId: CONTENT_FACTORY_ARTICLE_WORKSPACE_SESSION_ID,
            workspaceId: workspace.workspaceId,
            turnId: CONTENT_FACTORY_ARTICLE_WORKSPACE_WORKER_TURN_ID,
            taskId: "article_retry_job_1",
            taskKind: "content.article.generate",
            status: "failed",
            sourceKind: "plugin_worker",
            failure: {
              source: "fixture",
              reasonCode: "fixture_retry_source_failed",
              message: "Electron workflow retry source failed",
            },
          },
        },
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
                pluginWorker: {
                  appId: CONTENT_FACTORY_APP_ID,
                  taskId: "article_job_1",
                  taskKind: "content.article.generate",
                  turnId: CONTENT_FACTORY_ARTICLE_WORKSPACE_TURN_ID,
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
            source: "plugin_task_worker",
            appId: CONTENT_FACTORY_APP_ID,
            taskId: "image_job_1",
            taskKind: "content.image.generate",
            turnId: CONTENT_FACTORY_ARTICLE_WORKSPACE_TURN_ID,
            status: "failed",
            errorCode: "worker_invalid_json_output",
            errorMessage: "Plugin worker returned invalid JSON",
            failureCategory: "worker_output",
            retryable: false,
            retryAdvice: "inspect_worker_output",
            retryAttempt: 0,
            retryMaxAttempts: 0,
            message:
              "Plugin task worker failed: Plugin worker returned invalid JSON",
            metadata: {
              pluginWorker: {
                appId: CONTENT_FACTORY_APP_ID,
                taskId: "image_job_1",
                taskKind: "content.image.generate",
                turnId: CONTENT_FACTORY_ARTICLE_WORKSPACE_TURN_ID,
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

async function appendContentFactoryArticleWorkspaceActionResultRuntimeEvents(
  page,
  workspace,
  requestLog,
) {
  return await invokeAppServerFromPage(
    page,
    APP_SERVER_METHOD_AGENT_SESSION_RUNTIME_EVENTS_APPEND,
    {
      sessionId: CONTENT_FACTORY_ARTICLE_WORKSPACE_SESSION_ID,
      turnId: null,
      runtimeEvents: [
        {
          type: "artifact.snapshot",
          payload: {
            artifact: {
              artifactId: "artifact-image-regenerate-workspace-patch",
              artifactRef: "artifact-image-regenerate-workspace-patch",
              path: ".lime/artifacts/article-workspace/image-regenerate-workspace-patch.json",
              title: "配图组重新生成结果",
              kind: "content_factory.workspace_patch",
              status: "ready",
              metadata: {
                pluginWorker: {
                  appId: CONTENT_FACTORY_APP_ID,
                  taskId: "image_regenerate_job_1",
                  taskKind: "content.image.generate",
                  turnId: "turn_content_factory_article_workspace_action",
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
      sessionId: CONTENT_FACTORY_ARTICLE_WORKSPACE_SESSION_ID,
      workspaceId,
    },
  );
}

async function waitForContentFactoryArticleWorkspaceGui(page, options) {
  const startedAt = Date.now();
  let lastSnapshot = null;
  while (Date.now() - startedAt < options.timeoutMs) {
    const snapshot = await page.evaluate(() => {
      const host = document.querySelector(
        '[data-testid="workspace-right-surface-host"]',
      );
      const roots = Array.from(
        document.querySelectorAll(
          '[data-testid="workspace-article-editor-surface"]',
        ),
      );
      const root = roots.find(isVisible) ?? roots[0] ?? null;
      const rendererHost = document.querySelector(
        '[data-testid="workspace-article-workspace-app-declared-renderer"]',
      );
      const rendererExecutableHost =
        rendererHost?.querySelector("iframe, webview");
      const toggle = document.querySelector(
        '[data-testid="task-center-object-canvas-toggle"]',
      );
      const bodyText = document.body?.innerText || "";
      const articleDraftButtons = Array.from(
        document.querySelectorAll(
          '[data-testid="workspace-article-editor-related-articleDraft"]',
        ),
      );
      const canvas = document.querySelector(
        '[data-testid="workspace-article-editor-canvas"]',
      );
      const fixtureOnlyNotice = document.querySelector(
        '[data-testid="workspace-article-editor-fixture-only"]',
      );
      const canvasText = canvas?.innerText || "";
      const articleHeaderTitle =
        root?.querySelector("h2")?.textContent?.replace(/\s+/g, " ").trim() ??
        "";
      const fixtureOnlyArticleHidden =
        isVisible(fixtureOnlyNotice) &&
        !canvasText.includes("fixtureOnlyHostGeneration") &&
        !canvasText.includes("fixturePromptFingerprint");
      const hasArticleDraftObject =
        articleDraftButtons.length > 0 ||
        (articleHeaderTitle.length > 0 &&
          (fixtureOnlyArticleHidden ||
            (canvasText.length > 160 &&
              !canvasText.includes("文章正文生成后会出现在这里"))));
      const hasArticleCanvasContent =
        fixtureOnlyArticleHidden ||
        (canvasText.length > 160 &&
          !canvasText.includes("文章正文生成后会出现在这里"));
      return {
        activeSurface: host?.getAttribute("data-surface") ?? null,
        rootVisible: isVisible(root),
        visibleRootCount: roots.filter(isVisible).length,
        toggleTitle: toggle?.getAttribute("title") ?? "",
        toggleAria: toggle?.getAttribute("aria-label") ?? "",
        hasArticleEditorTitle:
          bodyText.includes("文章编辑器") ||
          bodyText.includes("Article Editor"),
        hasArticleTitle:
          bodyText.includes("公众号文章草稿") || hasArticleDraftObject,
        hasArticleDraftObject,
        hasArticleCanvasContent,
        hasFixtureOnlyArticleHidden: fixtureOnlyArticleHidden,
        articleHeaderTitle,
        articleDraftObjectCount: articleDraftButtons.length,
        hasImageSetTitle: bodyText.includes("配图组"),
        hasStoryboardTitle: bodyText.includes("视频分镜"),
        hasChecklistTitle: bodyText.includes("交付检查清单"),
        hasWorkerEvidenceTitle:
          bodyText.includes("运行记录") || bodyText.includes("写作计划"),
        hasLegacyWorkerTemplateText:
          bodyText.includes("三轮资料检索") ||
          canvasText.includes("先把目标定清楚") ||
          canvasText.includes("学习路线"),
        hasArticleCanvasBodyContent: hasArticleCanvasContent,
        hasArticlePreview: hasArticleCanvasContent,
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
      snapshot?.activeSurface === "articleWorkspace" &&
      snapshot.rootVisible &&
      snapshot.hasArticleEditorTitle &&
      snapshot.hasArticleDraftObject &&
      snapshot.hasArticleCanvasContent
    ) {
      return snapshot;
    }
    await sleep(options.intervalMs);
  }
  throw new Error(
    `内容工厂 Article Editor GUI 未就绪: ${JSON.stringify(
      sanitizeJson(lastSnapshot),
    )}`,
  );
}

async function selectContentFactoryArticleObject(page, options) {
  return await selectContentFactoryArticleWorkspaceObject(page, options, {
    objectKind: "articleDraft",
    selector: '[data-testid="workspace-article-editor-related-articleDraft"]',
    failureLabel: "文章对象",
  });
}

async function waitForContentFactoryArticleCanvasSurface(page, options) {
  const startedAt = Date.now();
  let lastSnapshot = null;
  while (Date.now() - startedAt < options.timeoutMs) {
    const snapshot = await page.evaluate((forbiddenArticleTemplateMarkers) => {
      const root = document.querySelector(
        '[data-testid="workspace-article-editor-surface"]',
      );
      const structure = document.querySelector(
        '[data-testid="workspace-article-editor-title-candidates"]',
      );
      const research = document.querySelector(
        '[data-testid="workspace-article-editor-research"]',
      );
      const outline = document.querySelector(
        '[data-testid="workspace-article-editor-outline"]',
      );
      const citations = document.querySelector(
        '[data-testid="workspace-article-editor-citations"]',
      );
      const imageSlots = document.querySelector(
        '[data-testid="workspace-article-editor-image-slots"]',
      );
      const documentCanvas = document.querySelector(
        '[data-testid="workspace-article-editor-canvas"]',
      );
      const fixtureOnlyNotice = document.querySelector(
        '[data-testid="workspace-article-editor-fixture-only"]',
      );
      const documentImageSlots = document.querySelector(
        '[data-testid="workspace-article-editor-image-slots"]',
      );
      const takeaways = document.querySelector(
        '[data-testid="workspace-article-editor-takeaways"]',
      );
      const writingPlan = document.querySelector(
        '[data-testid="workspace-article-editor-writing-plan"]',
      );
      const contentFactoryOrchestration = document.querySelector(
        '[data-testid="workspace-article-editor-content-factory-orchestration"]',
      );
      const orchestrationSteps = Array.from(
        document.querySelectorAll(
          '[data-testid="workspace-article-editor-orchestration-step"]',
        ),
      );
      const orchestrationSubagents = Array.from(
        document.querySelectorAll(
          '[data-testid="workspace-article-editor-orchestration-subagent"]',
        ),
      );
      const orchestrationSkillRefs = Array.from(
        document.querySelectorAll(
          '[data-testid="workspace-article-editor-orchestration-skill-ref"], [data-testid="workspace-article-editor-orchestration-skill"]',
        ),
      );
      const orchestrationConnectors = Array.from(
        document.querySelectorAll(
          '[data-testid="workspace-article-editor-orchestration-connector"]',
        ),
      );
      const orchestrationHooks = Array.from(
        document.querySelectorAll(
          '[data-testid="workspace-article-editor-orchestration-hook"]',
        ),
      );
      const review = document.querySelector(
        '[data-testid="workspace-article-editor-review"]',
      );
      const documentCanvasText = documentCanvas?.innerText || "";
      const fixtureOnlyNoticeText = fixtureOnlyNotice?.textContent || "";
      const contentFactoryOrchestrationText =
        contentFactoryOrchestration?.textContent || "";
      const orchestrationSkillRefsText = orchestrationSkillRefs
        .map((item) => item.textContent || "")
        .join("\n");
      const orchestrationSubagentValues = orchestrationSubagents
        .map((item) => item.getAttribute("data-subagent-ref") || "")
        .filter(Boolean);
      const orchestrationSkillRefValues = orchestrationSkillRefs
        .map((item) => item.getAttribute("data-skill-ref") || "")
        .filter(Boolean);
      const orchestrationConnectorValues = orchestrationConnectors
        .map((item) => item.getAttribute("data-connector-ref") || "")
        .filter(Boolean);
      const orchestrationHookValues = orchestrationHooks
        .map((item) => item.getAttribute("data-hook-ref") || "")
        .filter(Boolean);
      const articleCanvasHasForbiddenTemplate =
        forbiddenArticleTemplateMarkers.some((marker) =>
          documentCanvasText.includes(marker),
        ) ||
        documentCanvasText.includes("fixtureOnlyHostGeneration") ||
        documentCanvasText.includes("fixturePromptFingerprint");
      const hasArticleDocumentPreview =
        documentCanvasText.length > 160 &&
        !documentCanvasText.includes("文章正文生成后会出现在这里");
      const fixtureOnlyArticleHidden =
        isVisible(fixtureOnlyNotice) &&
        fixtureOnlyNoticeText.length > 0 &&
        !documentCanvasText.includes("fixtureOnlyHostGeneration") &&
        !documentCanvasText.includes("fixturePromptFingerprint");
      const metadataPanelsHidden =
        !structure &&
        !research &&
        !outline &&
        !citations &&
        !imageSlots &&
        !takeaways &&
        !writingPlan &&
        !review;
      return {
        rootVisible: isVisible(root),
        structurePresent: Boolean(structure),
        researchPresent: Boolean(research),
        outlinePresent: Boolean(outline),
        citationsPresent: Boolean(citations),
        imageSlotsPresent: Boolean(imageSlots),
        documentImageSlotsPresent: Boolean(documentImageSlots),
        takeawaysPresent: Boolean(takeaways),
        writingPlanPresent: Boolean(writingPlan),
        contentFactoryOrchestrationPresent: Boolean(
          contentFactoryOrchestration,
        ),
        reviewPresent: Boolean(review),
        structureVisible: isVisible(structure),
        researchVisible: isVisible(research),
        outlineVisible: isVisible(outline),
        citationsVisible: isVisible(citations),
        imageSlotsVisible: isVisible(imageSlots),
        documentCanvasVisible: isVisible(documentCanvas),
        documentImageSlotsVisible: isVisible(documentImageSlots),
        contentFactoryOrchestrationVisible: isVisible(
          contentFactoryOrchestration,
        ),
        contentFactoryOrchestrationStepCount: orchestrationSteps.length,
        workflowUiRailHidden:
          !contentFactoryOrchestration &&
          orchestrationSteps.length === 0 &&
          orchestrationSubagents.length === 0 &&
          orchestrationSkillRefs.length === 0 &&
          orchestrationConnectors.length === 0 &&
          orchestrationHooks.length === 0,
        metadataPanelsHidden,
        hasDocumentPreview: hasArticleDocumentPreview,
        hasVisibleContentFactoryOrchestration:
          contentFactoryOrchestrationText.length > 0 &&
          isVisible(contentFactoryOrchestration),
        hasVisibleSubagents: orchestrationSubagentValues.length > 0,
        hasVisibleSkillRef:
          orchestrationSkillRefValues.length > 0 &&
          orchestrationSkillRefsText.trim().length > 0,
        hasVisibleConnectors: orchestrationConnectorValues.length > 0,
        hasVisibleHooks: orchestrationHookValues.length > 0,
        visibleSubagents: orchestrationSubagentValues,
        visibleSkillRefs: orchestrationSkillRefValues,
        visibleConnectors: orchestrationConnectorValues,
        visibleHooks: orchestrationHookValues,
        articleCanvasHasForbiddenTemplate,
        hasFullArticleCanvas:
          hasArticleDocumentPreview && !articleCanvasHasForbiddenTemplate,
        fixtureOnlyNoticeVisible: isVisible(fixtureOnlyNotice),
        fixtureOnlyArticleHidden,
        articleCanvasTextSample: documentCanvasText.slice(0, 2000),
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
    }, FORBIDDEN_CONTENT_FACTORY_ARTICLE_TEMPLATE_MARKERS);
    lastSnapshot = snapshot;
    if (
      snapshot?.rootVisible &&
      snapshot.documentCanvasVisible &&
      (snapshot.hasDocumentPreview || snapshot.fixtureOnlyArticleHidden) &&
      snapshot.metadataPanelsHidden &&
      snapshot.workflowUiRailHidden &&
      (snapshot.hasFullArticleCanvas || snapshot.fixtureOnlyArticleHidden)
    ) {
      return sanitizeJson(snapshot);
    }
    await sleep(options.intervalMs);
  }
  throw new Error(
    `内容工厂 Article Editor 正文画布未按 current 口径渲染: ${JSON.stringify(
      sanitizeJson(lastSnapshot),
    )}`,
  );
}

async function selectContentFactoryStoryboardObject(page, options) {
  return await selectContentFactoryArticleWorkspaceObject(page, options, {
    objectKind: "videoStoryboard",
    selector:
      '[data-testid="workspace-article-editor-related-videoStoryboard"]',
    failureLabel: "分镜对象",
    allowHiddenCandidate: true,
  });
}

async function selectContentFactoryArticleWorkspaceObject(
  page,
  options,
  {
    allowHiddenCandidate = false,
    failureLabel,
    objectKind,
    preferredText,
    selector,
  },
) {
  const startedAt = Date.now();
  let lastSnapshot = null;
  while (Date.now() - startedAt < options.timeoutMs) {
    const snapshot = await page.evaluate(
      ({ objectKind, preferredText, selector }) => {
        const roots = Array.from(
          document.querySelectorAll(
            '[data-testid="workspace-article-editor-surface"]',
          ),
        );
        const root = roots.find(isVisible) ?? roots[0] ?? null;
        const queryRoot = root ?? document;
        const buttons = Array.from(queryRoot.querySelectorAll(selector));
        const preferredButton = preferredText
          ? buttons.find((candidate) =>
              (candidate.textContent || "").includes(preferredText),
            )
          : null;
        const button = preferredText
          ? preferredButton
          : (buttons.find(isVisible) ?? buttons[0]);
        if (button && !isVisible(button)) {
          button.scrollIntoView({ block: "center", inline: "nearest" });
        }
        const buttonVisible = isVisible(button);
        if (buttonVisible) {
          button.click();
        }
        const canvas = queryRoot.querySelector(
          '[data-testid="workspace-article-editor-canvas"]',
        );
        const fixtureOnlyNotice = queryRoot.querySelector(
          '[data-testid="workspace-article-editor-fixture-only"]',
        );
        const canvasText = canvas?.textContent ?? "";
        const fixtureOnlyArticleHidden =
          isVisible(fixtureOnlyNotice) &&
          !canvasText.includes("fixtureOnlyHostGeneration") &&
          !canvasText.includes("fixturePromptFingerprint");
        const alreadySelected =
          objectKind === "articleDraft" &&
          isVisible(root) &&
          isVisible(canvas) &&
          (fixtureOnlyArticleHidden ||
            (canvasText.length > 160 &&
              !canvasText.includes("文章正文生成后会出现在这里")));
        const visible = buttonVisible || alreadySelected;
        return {
          candidateCount: buttons.length,
          preferredFound: Boolean(preferredButton),
          alreadySelected,
          buttonVisible,
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
      },
      { objectKind, preferredText, selector },
    );
    lastSnapshot = snapshot;
    if (snapshot?.visible) {
      return sanitizeJson({
        selected: true,
        objectKind,
        text: snapshot.text,
      });
    }
    if (allowHiddenCandidate && snapshot?.candidateCount > 0) {
      return sanitizeJson({
        selected: false,
        objectKind,
        candidatePresent: true,
        skippedReason: "compact_hidden_related_object",
        text: snapshot.text,
      });
    }
    await sleep(options.intervalMs);
  }
  throw new Error(
    `内容工厂 Article Editor ${failureLabel}不可选: ${JSON.stringify(
      sanitizeJson(lastSnapshot),
    )}`,
  );
}

async function runRuntimeContractRejectionProbe({
  page,
  workspace,
  options,
  requestLog,
}) {
  const response = await invokeAppServerFromPage(
    page,
    APP_SERVER_METHOD_SESSION_TURN_START,
    {
      sessionId: CONTENT_FACTORY_ARTICLE_WORKSPACE_SESSION_ID,
      turnId: CONTENT_FACTORY_ARTICLE_WORKSPACE_CONTRACT_REJECT_TURN_ID,
      input: {
        text: "尝试运行 outputArtifactKind 不匹配的 Article Editor action。",
      },
      runtimeOptions: {
        metadata: {
          plugin: {
            source: "right_surface_article_workspace",
            app_id: CONTENT_FACTORY_APP_ID,
            workspace_id: workspace.workspaceId,
            article_workspace_action: {
              key: "contract_mismatch",
              intent: "regenerate",
              risk: "write",
              task_kind: "content.image.generate",
              output_artifact_kind: "other.workspace_patch",
              prompt: "Regenerate with a mismatched output artifact kind.",
              object: {
                app_id: CONTENT_FACTORY_APP_ID,
                kind: "imageGenerationSet",
                id: "image-set-contract-mismatch",
                session_id: CONTENT_FACTORY_ARTICLE_WORKSPACE_SESSION_ID,
                artifact_ids: ["artifact-contract-mismatch-1"],
              },
            },
          },
          right_surface: {
            surface_kind: "articleWorkspace",
            source: "article_workspace",
            action_key: "contract_mismatch",
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
        CONTENT_FACTORY_ARTICLE_WORKSPACE_CONTRACT_REJECT_ERROR_CODE,
    ) ?? {};
  const turn =
    response.result?.turn && typeof response.result.turn === "object"
      ? response.result.turn
      : {};
  const readModelRejection = await waitForRuntimeContractRejectionReadModel(
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

async function waitForRuntimeContractRejectionReadModel(
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
    const summary = summarizeRuntimeContractRejectionReadModel(
      readModel.result,
    );
    lastSummary = summary;
    if (
      summary.errorCode ===
        CONTENT_FACTORY_ARTICLE_WORKSPACE_CONTRACT_REJECT_ERROR_CODE &&
      summary.status === "failed"
    ) {
      return summary;
    }
    await sleep(options.intervalMs);
  }
  throw new Error(
    `Plugin runtime contract 拒绝证据未进入 read model: ${JSON.stringify(
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

function selectContentFactoryWorkerDogfoodEvidence(workerEvidence) {
  const taskEvidenceItems = workerEvidence.filter(
    (evidence) =>
      readString(evidence?.taskId, evidence?.task_id) ===
      CONTENT_FACTORY_ARTICLE_WORKSPACE_WORKER_TASK_ID,
  );
  const completedTaskEvidence = taskEvidenceItems.find((evidence) =>
    isCompletedContentFactoryWorkerEvidence(evidence),
  );
  if (completedTaskEvidence) {
    return completedTaskEvidence;
  }
  const terminalTaskEvidence = taskEvidenceItems.find((evidence) =>
    ["completed", "failed"].includes(readString(evidence?.status)),
  );
  if (terminalTaskEvidence) {
    return terminalTaskEvidence;
  }

  const completedEvidence = workerEvidence.find((evidence) =>
    isCompletedContentFactoryWorkerEvidence(evidence),
  );
  if (completedEvidence) {
    return completedEvidence;
  }

  return taskEvidenceItems[0];
}

function isCompletedContentFactoryWorkerEvidence(evidence) {
  if (readString(evidence?.status) !== "completed") {
    return false;
  }
  if (
    readString(evidence?.eventType, evidence?.event_type) !==
    "artifact.snapshot"
  ) {
    return false;
  }
  if (
    readString(evidence?.taskKind, evidence?.task_kind) !==
    "content.article.generate"
  ) {
    return false;
  }
  return (
    readString(evidence?.artifactKind, evidence?.artifact_kind) ===
      "content_factory.workspace_patch" ||
    readNumber(evidence?.outputObjectCount, evidence?.output_object_count) > 0
  );
}

function summarizeContentFactoryArticleWorkspaceReadModel(result) {
  const detail = asRecord(result?.detail) ?? asRecord(result);
  const threadRead =
    asRecord(detail?.threadRead) ?? asRecord(detail?.thread_read) ?? {};
  const workflowRuns = readArray(
    threadRead.workflowRuns,
    threadRead.workflow_runs,
    detail.workflowRuns,
    detail.workflow_runs,
  );
  const workflowSteps = readArray(
    threadRead.workflowSteps,
    threadRead.workflow_steps,
    detail.workflowSteps,
    detail.workflow_steps,
  );
  const articleWorkspace =
    asRecord(threadRead.articleWorkspace) ??
    asRecord(threadRead.article_workspace) ??
    asRecord(detail?.articleWorkspace) ??
    asRecord(detail?.article_workspace) ??
    {};
  const objects = readArray(articleWorkspace.objects);
  const workerEvidence = readArray(
    articleWorkspace.workerEvidence,
    articleWorkspace.worker_evidence,
  );
  const editedDraft =
    asRecord(articleWorkspace.editedDraft) ??
    asRecord(articleWorkspace.edited_draft) ??
    {};
  const artifacts = readArray(threadRead.artifacts, detail?.artifacts);
  const articleArtifact = findArtifactByRef(
    artifacts,
    CONTENT_FACTORY_ARTICLE_WORKSPACE_ARTICLE_ARTIFACT_ID,
  );
  const storyboardArtifact = findArtifactByRef(
    artifacts,
    CONTENT_FACTORY_ARTICLE_WORKSPACE_STORYBOARD_ARTIFACT_ID,
  );
  const checklistArtifact = findArtifactByRef(
    artifacts,
    CONTENT_FACTORY_ARTICLE_WORKSPACE_CHECKLIST_ARTIFACT_ID,
  );
  const articleMetadata = asRecord(articleArtifact?.metadata) ?? {};
  const articleArticleWorkspace =
    asRecord(articleMetadata.articleWorkspace) ?? {};
  const storyboardMetadata = asRecord(storyboardArtifact?.metadata) ?? {};
  const storyboardArticleWorkspace =
    asRecord(storyboardMetadata.articleWorkspace) ?? {};
  const checklistMetadata = asRecord(checklistArtifact?.metadata) ?? {};
  const checklistArticleWorkspace =
    asRecord(checklistMetadata.articleWorkspace) ?? {};
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
  const workerDogfoodEvidence =
    selectContentFactoryWorkerDogfoodEvidence(workerEvidence);
  const workerArticleObject = objects.find((object) => {
    if (productObjectKind(object) !== "articleDraft") {
      return false;
    }
    const source = asRecord(object?.source) ?? {};
    return (
      readString(source.taskId, source.task_id) ===
      CONTENT_FACTORY_ARTICLE_WORKSPACE_WORKER_TASK_ID
    );
  });
  const workerArticleSource = asRecord(workerArticleObject?.source) ?? {};
  const workerArticleHostManagedGeneration =
    asRecord(workerArticleSource.hostManagedGeneration) ??
    asRecord(workerArticleSource.host_managed_generation) ??
    {};
  const workerArticleSourceText = [
    readString(workerArticleSource.markdown, workerArticleSource.markdown_text),
    readString(
      workerArticleSource.processMarkdown,
      workerArticleSource.process_markdown,
    ),
    readString(
      workerArticleSource.documentText,
      workerArticleSource.document_text,
    ),
    readString(
      workerArticleSource.finalMarkdown,
      workerArticleSource.final_markdown,
    ),
  ]
    .filter(Boolean)
    .join("\n\n");
  const workerArticleResearchRoundCount = readArray(
    workerArticleSource.researchRounds,
    workerArticleSource.research_rounds,
  ).length;
  const workerArticleImageSlotCount = readArray(
    workerArticleSource.imageSlots,
    workerArticleSource.image_slots,
  ).length;
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
    hasArticleWorkspace: Object.keys(articleWorkspace).length > 0,
    schemaVersion: readString(
      articleWorkspace.schemaVersion,
      articleWorkspace.schema_version,
    ),
    appId: readString(articleWorkspace.appId, articleWorkspace.app_id),
    sessionId: readString(
      articleWorkspace.sessionId,
      articleWorkspace.session_id,
    ),
    workspaceId: readString(
      articleWorkspace.workspaceId,
      articleWorkspace.workspace_id,
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
    workflowRunCount: workflowRuns.length,
    workflowStepCount: workflowSteps.length,
    workflowUiFactsHidden:
      workflowRuns.length === 0 && workflowSteps.length === 0,
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
          taskKind: readString(
            workerDogfoodEvidence.taskKind,
            workerDogfoodEvidence.task_kind,
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
          workflowKey: readString(
            workerDogfoodEvidence.workflowKey,
            workerDogfoodEvidence.workflow_key,
          ),
          subagents: readStringArray(
            workerDogfoodEvidence.subagents,
            workerDogfoodEvidence.sub_agents,
          ),
          skillRefs: readStringArray(
            workerDogfoodEvidence.skillRefs,
            workerDogfoodEvidence.skill_refs,
          ),
          cliRefs: readStringArray(
            workerDogfoodEvidence.cliRefs,
            workerDogfoodEvidence.cli_refs,
          ),
          connectorRefs: readStringArray(
            workerDogfoodEvidence.connectorRefs,
            workerDogfoodEvidence.connector_refs,
          ),
          hookRefs: readHookPolicyLabels(
            workerDogfoodEvidence.hookPolicy,
            workerDogfoodEvidence.hook_policy,
          ),
          orchestrationStepCount: readArray(workerDogfoodEvidence.orchestration)
            .length,
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
    workerArticleObject: workerArticleObject
      ? {
          objectRef: summarizeArticleObjectRef(workerArticleObject),
          title: readString(workerArticleObject.title),
          summary: readString(workerArticleObject.summary),
          previewArtifactId: readString(
            workerArticleObject.previewArtifactId,
            workerArticleObject.preview_artifact_id,
          ),
          sourceTaskId: readString(
            workerArticleSource.taskId,
            workerArticleSource.task_id,
          ),
          markdownIncludesResearch:
            workerArticleSourceText.includes("## 三轮资料检索") ||
            workerArticleSourceText.includes("## 检索轮次") ||
            workerArticleResearchRoundCount >= 3,
          markdownIncludesDraft:
            workerArticleSourceText.includes("## 正文草稿") ||
            readString(
              workerArticleSource.documentText,
              workerArticleSource.document_text,
              workerArticleSource.finalMarkdown,
              workerArticleSource.final_markdown,
            ).length > 300,
          markdownIncludesEditedDraftMarker: workerArticleSourceText.includes(
            CONTENT_FACTORY_ARTICLE_WORKSPACE_EDITED_DRAFT_MARKER,
          ),
          sourceEdited: readBoolean(workerArticleSource.edited),
          hostManagedGenerationStatus: readString(
            workerArticleHostManagedGeneration.status,
          ),
          hostManagedGenerationReasonCode: readString(
            workerArticleHostManagedGeneration.reasonCode,
            workerArticleHostManagedGeneration.reason_code,
          ),
          hostManagedGenerationOutputIds: readStringArray(
            workerArticleHostManagedGeneration.outputIds,
            workerArticleHostManagedGeneration.output_ids,
          ),
          updatedAt: readString(
            workerArticleSource.updatedAt,
            workerArticleSource.updated_at,
          ),
          researchRoundCount: workerArticleResearchRoundCount,
          imageSlotCount: workerArticleImageSlotCount,
        }
      : null,
    editedDraft:
      Object.keys(editedDraft).length > 0
        ? {
            objectKey: readString(
              editedDraft.objectKey,
              editedDraft.object_key,
            ),
            objectRef: summarizeArticleRefRecord(
              asRecord(editedDraft.objectRef) ??
                asRecord(editedDraft.object_ref) ??
                {},
            ),
            markdownIncludesEditedDraftMarker: readString(
              editedDraft.markdown,
            ).includes(CONTENT_FACTORY_ARTICLE_WORKSPACE_EDITED_DRAFT_MARKER),
            updatedAt: readString(
              editedDraft.updatedAt,
              editedDraft.updated_at,
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
          articleWorkspaceObjectKind: readString(
            articleArticleWorkspace.objectKind,
            articleArticleWorkspace.object_kind,
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
          articleWorkspaceObjectKind: readString(
            storyboardArticleWorkspace.objectKind,
            storyboardArticleWorkspace.object_kind,
          ),
          articleWorkspaceSurfaceKind: readString(
            storyboardArticleWorkspace.surfaceKind,
            storyboardArticleWorkspace.surface_kind,
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
          articleWorkspaceObjectKind: readString(
            checklistArticleWorkspace.objectKind,
            checklistArticleWorkspace.object_kind,
          ),
          articleWorkspaceSurfaceKind: readString(
            checklistArticleWorkspace.surfaceKind,
            checklistArticleWorkspace.surface_kind,
          ),
        }
      : null,
  });
}

function summarizeArticleObjectRef(object) {
  const ref = asRecord(object?.ref) ?? asRecord(object?.objectRef) ?? {};
  return summarizeArticleRefRecord(ref);
}

function summarizeArticleRefRecord(ref) {
  return sanitizeJson({
    appId: readString(ref.appId, ref.app_id),
    kind: readString(ref.kind),
    id: readString(ref.id),
    sessionId: readString(ref.sessionId, ref.session_id),
    artifactIds: readArray(ref.artifactIds, ref.artifact_ids)
      .map((value) => readString(value))
      .filter(Boolean),
    sourceTurnId: readString(ref.sourceTurnId, ref.source_turn_id),
    sourceTaskId: readString(ref.sourceTaskId, ref.source_task_id),
    version: readString(ref.version),
  });
}

function summarizeRuntimeContractRejectionReadModel(result) {
  const detail = asRecord(result?.detail) ?? asRecord(result);
  const threadRead =
    asRecord(detail?.threadRead) ?? asRecord(detail?.thread_read) ?? {};
  const articleWorkspace =
    asRecord(threadRead.articleWorkspace) ??
    asRecord(threadRead.article_workspace) ??
    asRecord(detail?.articleWorkspace) ??
    asRecord(detail?.article_workspace) ??
    {};
  const workerEvidence = readArray(
    articleWorkspace.workerEvidence,
    articleWorkspace.worker_evidence,
  );
  const rejectionEvidence = workerEvidence.find(
    (evidence) =>
      readString(evidence?.errorCode, evidence?.error_code) ===
      CONTENT_FACTORY_ARTICLE_WORKSPACE_CONTRACT_REJECT_ERROR_CODE,
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

function summarizeContentFactoryWorkflowRead(result) {
  const workflow = asRecord(result?.workflow) ?? {};
  const workflowRuns = readArray(
    result?.workflowRuns,
    result?.workflow_runs,
    workflow.workflowRuns,
    workflow.workflow_runs,
  );
  const workflowSteps = readArray(
    result?.workflowSteps,
    result?.workflow_steps,
    workflow.workflowSteps,
    workflow.workflow_steps,
  );
  const actions = readArray(workflow.actions);
  const run =
    workflowRuns.find(
      (item) =>
        readString(item?.workflowRunId, item?.workflow_run_id) ===
        CONTENT_FACTORY_ARTICLE_WORKSPACE_WORKFLOW_RUN_ID,
    ) ?? workflowRuns[0];
  const waitingStep =
    workflowSteps.find(
      (item) =>
        readString(item?.stepId, item?.step_id) ===
        CONTENT_FACTORY_ARTICLE_WORKSPACE_WORKFLOW_REVIEW_STEP_ID,
    ) ?? workflowSteps.find((item) => readString(item?.status) === "waiting");
  const respondAction = actions.find(
    (item) =>
      readString(item?.actionType, item?.action_type) === "respond" &&
      readString(item?.requestId, item?.request_id) ===
        CONTENT_FACTORY_ARTICLE_WORKSPACE_WORKFLOW_REVIEW_REQUEST_ID,
  );

  return sanitizeJson({
    sessionId: readString(result?.sessionId, result?.session_id),
    threadId: readString(workflow.threadId, workflow.thread_id),
    activeWorkflowRunId: readString(
      workflow.activeWorkflowRunId,
      workflow.active_workflow_run_id,
    ),
    runCount: workflowRuns.length,
    stepCount: workflowSteps.length,
    actionCount: actions.length,
    run: run
      ? {
          workflowRunId: readString(run.workflowRunId, run.workflow_run_id),
          workflowKey: readString(run.workflowKey, run.workflow_key),
          title: readString(run.title),
          status: readString(run.status),
          appId: readString(run.appId, run.app_id),
          taskId: readString(run.taskId, run.task_id),
          turnId: readString(run.turnId, run.turn_id),
          stepCounts: asRecord(run.stepCounts) ?? asRecord(run.step_counts),
        }
      : null,
    waitingStep: waitingStep
      ? {
          stepId: readString(waitingStep.stepId, waitingStep.step_id),
          title: readString(waitingStep.title, waitingStep.stepTitle),
          status: readString(waitingStep.status),
          requestId: readString(waitingStep.requestId, waitingStep.request_id),
          agentActionType: readString(
            waitingStep.agentActionType,
            waitingStep.agent_action_type,
          ),
          progressMessage: readString(
            waitingStep.progressMessage,
            waitingStep.progress_message,
          ),
        }
      : null,
    respondAction: respondAction
      ? {
          workflowRunId: readString(
            respondAction.workflowRunId,
            respondAction.workflow_run_id,
          ),
          actionType: readString(
            respondAction.actionType,
            respondAction.action_type,
          ),
          stepId: readString(respondAction.stepId, respondAction.step_id),
          requestId: readString(
            respondAction.requestId,
            respondAction.request_id,
          ),
          agentActionType: readString(
            respondAction.agentActionType,
            respondAction.agent_action_type,
          ),
        }
      : null,
  });
}

function summarizeContentFactoryWorkflowControl(
  result,
  { requestId, stepId, workflowRunId },
) {
  const workflow = asRecord(result?.workflow) ?? {};
  const workflowRuns = readArray(
    result?.workflowRuns,
    result?.workflow_runs,
    workflow.workflowRuns,
    workflow.workflow_runs,
  );
  const workflowSteps = readArray(
    result?.workflowSteps,
    result?.workflow_steps,
    workflow.workflowSteps,
    workflow.workflow_steps,
  );
  const run =
    workflowRuns.find(
      (item) =>
        readString(item?.workflowRunId, item?.workflow_run_id) ===
        workflowRunId,
    ) ?? null;
  const step =
    workflowSteps.find(
      (item) =>
        readString(item?.workflowRunId, item?.workflow_run_id) ===
          workflowRunId && readString(item?.stepId, item?.step_id) === stepId,
    ) ?? null;
  const response = asRecord(step?.response) ?? {};
  const cancellation = asRecord(run?.cancellation) ?? {};
  const retry = asRecord(step?.retry) ?? asRecord(run?.retry) ?? {};

  return sanitizeJson({
    sessionId: readString(result?.sessionId, result?.session_id),
    rescheduledTurnId: readString(
      result?.rescheduledTurnId,
      result?.rescheduled_turn_id,
    ),
    run: run
      ? {
          workflowRunId: readString(run.workflowRunId, run.workflow_run_id),
          status: readString(run.status),
          stepCounts: asRecord(run.stepCounts) ?? asRecord(run.step_counts),
          cancellationReasonCode: readString(
            cancellation.reasonCode,
            cancellation.reason_code,
          ),
          retrySource: readString(retry.source),
          retryReasonCode: readString(retry.reasonCode, retry.reason_code),
          retrySourceTurnId: readString(
            retry.sourceTurnId,
            retry.source_turn_id,
          ),
          retryRescheduledTurnId: readString(
            retry.rescheduledTurnId,
            retry.rescheduled_turn_id,
          ),
        }
      : null,
    step: step
      ? {
          workflowRunId: readString(step.workflowRunId, step.workflow_run_id),
          stepId: readString(step.stepId, step.step_id),
          status: readString(step.status),
          attempt: readNumber(step.attempt),
          requestId: readString(step.requestId, step.request_id),
          agentActionType: readString(
            step.agentActionType,
            step.agent_action_type,
          ),
          responseSource: readString(response.source),
          responseRequestId: readString(
            response.requestId,
            response.request_id,
          ),
          responseConfirmed: readBoolean(response.confirmed),
          cancellationReasonCode: readString(
            asRecord(step.cancellation)?.reasonCode,
            asRecord(step.cancellation)?.reason_code,
          ),
          retrySource: readString(retry.source),
          retryReasonCode: readString(retry.reasonCode, retry.reason_code),
          retrySourceTurnId: readString(
            retry.sourceTurnId,
            retry.source_turn_id,
          ),
          retryRescheduledTurnId: readString(
            retry.rescheduledTurnId,
            retry.rescheduled_turn_id,
          ),
        }
      : null,
    requestId,
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
  const artifactRef = readString(artifact?.artifactRef, artifact?.artifact_ref);
  const content = readString(artifact?.content);
  const document = parseJsonObject(content);
  const documentArtifactId = readString(
    document?.artifactId,
    document?.artifact_id,
  );
  const documentMetadata = asRecord(document?.metadata) ?? {};
  const documentArticleWorkspace =
    asRecord(documentMetadata.articleWorkspace) ??
    asRecord(documentMetadata.article_workspace) ??
    {};
  const documentBlocks = readArray(document?.blocks);
  const richTextMarkdown = documentBlocks
    .map((block) => readString(block?.markdown, block?.content))
    .filter(Boolean)
    .join("\n\n");
  const richTextHasForbiddenTemplate =
    FORBIDDEN_CONTENT_FACTORY_ARTICLE_TEMPLATE_MARKERS.some((marker) =>
      richTextMarkdown.includes(marker),
    );
  return sanitizeJson({
    artifactCount: artifacts.length,
    artifactRef,
    kind: readString(artifact?.kind),
    title: readString(artifact?.title),
    documentTitle: readString(document?.title),
    documentKind: readString(document?.kind),
    documentObjectKind: readString(
      documentArticleWorkspace.objectKind,
      documentArticleWorkspace.object_kind,
    ),
    documentBlockCount: documentBlocks.length,
    documentRichTextLength: richTextMarkdown.length,
    contentStatus: readString(
      artifact?.contentStatus,
      artifact?.content_status,
    ),
    contentIncludesSchema: content.includes("artifact_document.v1"),
    contentIncludesDocumentId: documentArtifactId.startsWith(
      `artifact-document:${CONTENT_FACTORY_APP_ID}:`,
    ),
    contentIncludesArticleTitle: Boolean(readString(document?.title)),
    richTextHasForbiddenTemplate,
    contentIncludesWorkerArticle:
      richTextMarkdown.length > 160 && !richTextHasForbiddenTemplate,
  });
}

function parseJsonObject(value) {
  if (!value) {
    return {};
  }
  try {
    const parsed = JSON.parse(value);
    return asRecord(parsed) ?? {};
  } catch {
    return {};
  }
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

function readStringArray(...values) {
  const seen = new Set();
  const items = [];
  for (const value of values) {
    for (const item of readArray(value)) {
      const text = readString(item, item?.id, item?.key, item?.title);
      if (!text || seen.has(text)) {
        continue;
      }
      seen.add(text);
      items.push(text);
    }
  }
  return items;
}

function readHookPolicyLabels(...values) {
  const policy = values.map(asRecord).find(Boolean);
  if (!policy) {
    return [];
  }
  return Object.entries(policy).flatMap(([scope, hooks]) =>
    readStringArray(hooks).map((hook) => `${scope}:${hook}`),
  );
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
