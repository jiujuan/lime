import path from "node:path";
import {
  APP_SERVER_HANDLE_JSON_LINES_COMMAND,
  assert,
  evaluatePageSnapshot,
  sanitizeJson,
  sleep,
} from "./local-history-import-smoke-utils.mjs";
import {
  CONTINUE_ASSISTANT_TEXT,
  CONTINUE_USER_TEXT,
  IMPORTED_ASSISTANT_TEXT,
  IMPORTED_PREVIEW_DOCX_FILE,
  IMPORTED_PREVIEW_DOCX_TEXT,
  IMPORTED_PREVIEW_HTML_FILE,
  IMPORTED_PREVIEW_HTML_TEXT,
  IMPORTED_PREVIEW_MARKDOWN_FILE,
  IMPORTED_PREVIEW_MARKDOWN_TEXT,
  IMPORTED_REASONING_TEXT,
  IMPORTED_USER_TEXT,
  LEGACY_CONTINUATION_SENTINEL,
  SOURCE_THREAD_ID,
} from "./local-history-import-click-through-fixture.mjs";

const VISUAL_AUDIT_VIEWPORTS = [
  { label: "desktop", width: 1440, height: 1000 },
  { label: "compact", width: 1100, height: 820 },
  { label: "narrow", width: 820, height: 900 },
];

export async function clearInvokeBuffers(page) {
  await evaluatePageSnapshot(page, () => {
    window.localStorage.removeItem("lime_invoke_error_buffer_v1");
    window.localStorage.removeItem("lime_invoke_trace_buffer_v1");
  });
}

async function waitForUiSnapshot(page, options, predicate, failureLabel) {
  const startedAt = Date.now();
  let lastSnapshot = null;
  while (Date.now() - startedAt < options.timeoutMs) {
    const snapshot = await evaluatePageSnapshot(page, () => {
      const bodyText = document.body?.innerText || "";
      const dialog = document.querySelector(
        '[data-testid="app-sidebar-conversation-import-dialog"]',
      );
      const textarea = document.querySelector(
        'textarea[name="agent-chat-message"]',
      );
      const sendButton = Array.from(document.querySelectorAll("button")).find(
        (button) => {
          const label = [
            button.getAttribute("aria-label") || "",
            button.getAttribute("title") || "",
            button.textContent || "",
          ].join("\n");
          return label.includes("发送") || /\bSend\b/i.test(label);
        },
      );
      return {
        url: window.location.href,
        title: document.title || "",
        bodyText,
        dialogVisible: Boolean(dialog),
        importButtonVisible: Boolean(
          document.querySelector(
            '[data-testid="app-sidebar-import-conversation-button"]',
          ),
        ),
        importConfirmVisible: Boolean(
          document.querySelector(
            '[data-testid="app-sidebar-conversation-import-confirm"]',
          ),
        ),
        importConfirmDisabled:
          document.querySelector(
            '[data-testid="app-sidebar-conversation-import-confirm"]',
          ) instanceof HTMLButtonElement
            ? document.querySelector(
                '[data-testid="app-sidebar-conversation-import-confirm"]',
              ).disabled
            : null,
        textareaVisible: textarea instanceof HTMLTextAreaElement,
        textareaDisabled:
          textarea instanceof HTMLTextAreaElement ? textarea.disabled : null,
        textareaValue:
          textarea instanceof HTMLTextAreaElement ? textarea.value : null,
        sendButtonVisible: sendButton instanceof HTMLButtonElement,
        sendButtonDisabled:
          sendButton instanceof HTMLButtonElement ? sendButton.disabled : null,
        environmentTriggerVisible: Boolean(
          document.querySelector(
            '[data-testid="task-center-environment-trigger"]',
          ),
        ),
        environmentPopoverVisible: Boolean(
          document.querySelector(
            '[data-testid="task-center-environment-popover"]',
          ),
        ),
        traceRaw: window.localStorage.getItem("lime_invoke_trace_buffer_v1"),
        errorRaw: window.localStorage.getItem("lime_invoke_error_buffer_v1"),
      };
    });
    if (!snapshot) {
      await sleep(options.intervalMs);
      continue;
    }
    lastSnapshot = snapshot;
    if (predicate(snapshot)) {
      return snapshot;
    }
    await sleep(options.intervalMs);
  }
  throw new Error(
    `${failureLabel}: ${JSON.stringify(sanitizeJson(lastSnapshot))}`,
  );
}

export async function clickSidebarImport(page, options) {
  await waitForUiSnapshot(
    page,
    options,
    (snapshot) => snapshot.importButtonVisible,
    "侧边栏导入按钮未出现",
  );
  await page
    .locator('[data-testid="app-sidebar-import-conversation-button"]')
    .click();
}

function extractPreviewTraceMethods(rawTrace) {
  const methods = [];
  let entries = [];
  try {
    const parsed = JSON.parse(rawTrace || "[]");
    entries = Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
  for (const entry of entries) {
    if (entry?.command !== APP_SERVER_HANDLE_JSON_LINES_COMMAND) {
      continue;
    }
    const lines = Array.isArray(entry?.args_preview?.request?.lines)
      ? entry.args_preview.request.lines
      : [];
    for (const line of lines) {
      try {
        const message = JSON.parse(line);
        if (typeof message?.method === "string") {
          methods.push(message.method);
        }
      } catch {
        // ignore non JSON trace line
      }
    }
  }
  return Array.from(new Set(methods));
}

export async function waitForImportPreview(page, options) {
  const startedAt = Date.now();
  let lastSnapshot = null;
  let reopenedAfterPreviewTrace = false;
  const isReady = (snapshot) =>
    snapshot.dialogVisible &&
    snapshot.importConfirmVisible &&
    snapshot.importConfirmDisabled === false &&
    snapshot.bodyText.includes("本地历史导入点击闭环") &&
    snapshot.bodyText.includes(IMPORTED_USER_TEXT) &&
    snapshot.bodyText.includes(IMPORTED_ASSISTANT_TEXT) &&
    snapshot.bodyText.includes("导入细节还原") &&
    snapshot.bodyText.includes("工具") &&
    snapshot.bodyText.includes("命令") &&
    snapshot.bodyText.includes("补丁") &&
    snapshot.bodyText.includes("审批") &&
    snapshot.bodyText.includes("搜索");

  while (Date.now() - startedAt < options.timeoutMs) {
    const snapshot = await waitForUiSnapshot(
      page,
      { ...options, timeoutMs: Math.max(options.intervalMs * 2, 1000) },
      () => true,
      "读取导入弹窗快照失败",
    );
    lastSnapshot = snapshot;
    if (isReady(snapshot)) {
      return snapshot;
    }

    const traceMethods = extractPreviewTraceMethods(snapshot.traceRaw);
    const previewRpcCompleted =
      traceMethods.includes("conversationImport/source/scan") &&
      traceMethods.includes("conversationImport/thread/preview");
    if (
      previewRpcCompleted &&
      !snapshot.dialogVisible &&
      snapshot.importButtonVisible &&
      !reopenedAfterPreviewTrace
    ) {
      reopenedAfterPreviewTrace = true;
      await page
        .locator('[data-testid="app-sidebar-import-conversation-button"]')
        .click();
    }
    await sleep(options.intervalMs);
  }

  throw new Error(
    `本地历史导入弹窗预览未完成: ${JSON.stringify(sanitizeJson(lastSnapshot))}`,
  );
}

export async function confirmImport(page, options) {
  await page
    .locator('[data-testid="app-sidebar-conversation-import-confirm"]')
    .click();
  return await waitForUiSnapshot(
    page,
    options,
    (snapshot) =>
      !snapshot.dialogVisible &&
      snapshot.textareaVisible &&
      snapshot.bodyText.includes(IMPORTED_USER_TEXT) &&
      snapshot.bodyText.includes(IMPORTED_ASSISTANT_TEXT),
    "确认导入后未进入可继续对话的会话页",
  );
}

function hasAnyText(snapshot, values) {
  return values.some((value) => snapshot.bodyText.includes(value));
}

function hasPatchEvidenceText(bodyText) {
  return (
    hasAnyText({ bodyText }, ["补丁", "Patch", "patch", "已编辑"]) &&
    hasAnyText({ bodyText }, ["src/lib.rs", "lib.rs", "文件"])
  );
}

function hasVisibleImportedReasoningText(bodyText) {
  return bodyText.includes(IMPORTED_REASONING_TEXT);
}

export function summarizeImportedDetailsSnapshot(
  snapshot,
  readModelSummary = null,
) {
  const bodyText = snapshot?.bodyText || "";
  return {
    hasImportedUserMessage: bodyText.includes(IMPORTED_USER_TEXT),
    hasImportedAssistantMessage: bodyText.includes(IMPORTED_ASSISTANT_TEXT),
    hasReasoningVisible: hasVisibleImportedReasoningText(bodyText),
    hasReasoningStatusVisible: bodyText.includes("已完成思考"),
    hasReasoningItem: readModelSummary?.hasReasoningItem === true,
    hasCommandRecordVisible:
      bodyText.includes("导入的命令记录") ||
      bodyText.includes("Imported command record"),
    hasCommandText:
      bodyText.includes("导入的命令记录") ||
      bodyText.includes("Imported command record") ||
      readModelSummary?.hasCommandItem === true,
    hasCommandItem: readModelSummary?.hasCommandItem === true,
    hasPatchText: hasPatchEvidenceText(bodyText),
    hasSearchEvidence:
      hasAnyText({ bodyText }, ["搜索", "Search", "web search"]) ||
      readModelSummary?.hasWebSearchItem === true,
    hasApprovalText: hasAnyText({ bodyText }, [
      "导入的权限记录",
      "已导入，只读记录",
      "审批",
      "确认",
      "权限请求",
      "Approval",
      "approval",
    ]),
    hidesRawImportedCommand:
      !bodyText.includes("Approve imported command") &&
      !bodyText.includes("imported_read_only"),
  };
}

export function summarizeContinuationSnapshot(snapshot) {
  const bodyText = snapshot?.bodyText || "";
  return {
    hasContinueUserMessage: bodyText.includes(CONTINUE_USER_TEXT),
    hasContinueAssistantMessage: bodyText.includes(CONTINUE_ASSISTANT_TEXT),
    hidesFixtureSentinel: !bodyText.includes(LEGACY_CONTINUATION_SENTINEL),
  };
}

export function summarizeImportPreviewSnapshot(snapshot) {
  const bodyText = snapshot?.bodyText || "";
  return {
    hidesRawSourceEventNames:
      !bodyText.includes("event_msg") &&
      !bodyText.includes("agent_message") &&
      !bodyText.includes("user_message") &&
      !bodyText.includes("response_item"),
    hasReadableSourceLabels:
      bodyText.includes("来源行 #") &&
      bodyText.includes("用户消息") &&
      bodyText.includes("助手回复"),
  };
}

export async function inspectEnvironmentPopoverImportBoundary(page, options) {
  await waitForUiSnapshot(
    page,
    options,
    (snapshot) =>
      snapshot.textareaVisible &&
      snapshot.bodyText.includes(IMPORTED_USER_TEXT) &&
      snapshot.bodyText.includes(IMPORTED_ASSISTANT_TEXT),
    "导入会话页未稳定，无法检查环境信息边界",
  );
  const forbiddenEnvironmentTexts = [
    "本地历史导入",
    "已还原",
    "Approve Codex command",
    "thread-codex",
    SOURCE_THREAD_ID,
  ];
  const triggerSnapshot = await evaluatePageSnapshot(
    page,
    (forbiddenTexts) => {
      const importedRunControl = document.querySelector(
        '[data-testid="task-center-run-control-imported"]',
      );
      const taskRail = document.querySelector(
        '[data-testid="task-center-task-rail"]',
      );
      const taskRailText = taskRail?.textContent || "";
      return {
        triggerVisible: Boolean(
          document.querySelector(
            '[data-testid="task-center-environment-trigger"]',
          ),
        ),
        importedRunControlVisible: Boolean(importedRunControl),
        taskRailText,
        hidesImportedRunControlCard:
          !importedRunControl &&
          !forbiddenTexts.some((text) => taskRailText.includes(text)) &&
          !/\bcodex\b/i.test(taskRailText),
      };
    },
    forbiddenEnvironmentTexts,
  );
  if (!triggerSnapshot?.triggerVisible) {
    return {
      popoverVisible: false,
      popoverText: "",
      taskRailText: triggerSnapshot?.taskRailText || "",
      importedRunControlVisible:
        triggerSnapshot?.importedRunControlVisible === true,
      hidesImportedRunControlCard:
        triggerSnapshot?.hidesImportedRunControlCard === true,
      checkedMode: "environment-trigger-not-rendered",
    };
  }

  await page.locator('[data-testid="task-center-environment-trigger"]').click();
  const snapshot = await waitForUiSnapshot(
    page,
    { ...options, timeoutMs: Math.min(options.timeoutMs, 10_000) },
    (current) => current.environmentPopoverVisible === true,
    "环境信息弹层未打开",
  );
  const result = await page.evaluate((forbiddenTexts) => {
    const popover = document.querySelector(
      '[data-testid="task-center-environment-popover"]',
    );
    const taskRail = popover?.querySelector(
      '[data-testid="task-center-task-rail"]',
    );
    const importedRunControl = popover?.querySelector(
      '[data-testid="task-center-run-control-imported"]',
    );
    const popoverText = popover?.textContent || "";
    const taskRailText = taskRail?.textContent || "";
    return {
      popoverVisible: Boolean(popover),
      popoverText,
      taskRailText,
      importedRunControlVisible: Boolean(importedRunControl),
      hidesImportedRunControlCard:
        !importedRunControl &&
        !forbiddenTexts.some((text) => taskRailText.includes(text)) &&
        !/\bcodex\b/i.test(taskRailText),
    };
  }, forbiddenEnvironmentTexts);
  return {
    ...result,
    snapshotUrl: snapshot.url,
    checkedMode: "environment-popover",
  };
}

export async function inspectImportedHistoryBanner(page, options) {
  await waitForUiSnapshot(
    page,
    options,
    (snapshot) =>
      snapshot.textareaVisible &&
      snapshot.bodyText.includes(IMPORTED_USER_TEXT) &&
      snapshot.bodyText.includes(IMPORTED_ASSISTANT_TEXT),
    "导入会话页未稳定，无法检查本地历史摘要",
  );

  return await page.evaluate(() => {
    const banner = document.querySelector(
      '[data-testid="imported-source-banner"]',
    );
    const text = banner?.textContent || "";
    return {
      visible: Boolean(banner),
      text,
      hiddenFromMainTimeline: !banner,
    };
  });
}

export async function inspectSidebarImportDiscoverability(page, options) {
  await waitForUiSnapshot(
    page,
    options,
    (snapshot) =>
      snapshot.textareaVisible &&
      snapshot.bodyText.includes(IMPORTED_USER_TEXT) &&
      snapshot.bodyText.includes(IMPORTED_ASSISTANT_TEXT),
    "导入会话页未稳定，无法检查侧栏会话入口",
  );

  return await page.evaluate(() => {
    const shelf = document.querySelector(
      '[data-testid="app-sidebar-conversation-shelf"]',
    );
    const projectList = document.querySelector(
      '[data-testid="app-sidebar-project-conversations"]',
    );
    const recentList = document.querySelector(
      '[data-testid="app-sidebar-recent-conversations"]',
    );
    const shelfText = shelf?.textContent || "";
    const projectText = projectList?.textContent || "";
    const recentText = recentList?.textContent || "";
    const discoverableLabels = ["本地历史导入点击闭环", "请运行测试并修复失败"];
    const importedEntryVisible = discoverableLabels.some((label) =>
      shelfText.includes(label),
    );
    return {
      visible: Boolean(shelf),
      shelfText,
      projectText,
      recentText,
      importedEntryVisible,
      emptyStateOnly:
        !importedEntryVisible &&
        (projectText.includes("暂无聊天") || recentText.includes("暂无聊天")),
    };
  });
}

export async function inspectImportedAttachmentPreview(page, options) {
  await waitForUiSnapshot(
    page,
    options,
    (snapshot) =>
      snapshot.textareaVisible &&
      snapshot.bodyText.includes(IMPORTED_USER_TEXT) &&
      snapshot.bodyText.includes(IMPORTED_ASSISTANT_TEXT),
    "导入会话页未稳定，无法检查导入图片附件",
  );

  const before = await page.evaluate(() => {
    const attachments = Array.from(
      document.querySelectorAll('[data-testid^="message-image-attachment-"]'),
    ).filter(
      (node) =>
        node instanceof HTMLImageElement &&
        node.getAttribute("data-testid") !== null,
    );
    const openButtons = Array.from(
      document.querySelectorAll(
        '[data-testid^="message-image-attachment-open-"]',
      ),
    );
    return {
      attachmentCount: attachments.length,
      openButtonCount: openButtons.length,
      firstAttachmentSrc:
        attachments[0] instanceof HTMLImageElement ? attachments[0].src : "",
      firstOpenButtonText:
        openButtons[0] instanceof HTMLElement ? openButtons[0].textContent : "",
    };
  });

  assert(
    before.attachmentCount > 0,
    `导入会话未渲染图片附件: ${JSON.stringify(sanitizeJson(before))}`,
  );
  assert(
    before.openButtonCount > 0,
    `导入图片附件没有打开入口: ${JSON.stringify(sanitizeJson(before))}`,
  );

  await page
    .locator('[data-testid^="message-image-attachment-open-"]')
    .first()
    .click();

  const startedAt = Date.now();
  let result = null;
  while (Date.now() - startedAt < Math.min(options.timeoutMs, 15_000)) {
    result = await page.evaluate(() => {
      const media = document.querySelector(
        '[data-testid="preview-artifact-image"]',
      );
      const workbench = document.querySelector(
        '[data-testid="artifact-workbench-shell"]',
      );
      const emptySurface = document.querySelector(
        '[data-testid="artifact-empty-surface"]',
      );
      const canvasPreview = document.querySelector(
        '[data-testid^="canvas-workbench-preview-"]',
      );
      const attachmentImages = Array.from(
        document.querySelectorAll('[data-testid^="message-image-attachment-"]'),
      ).filter((node) => node instanceof HTMLImageElement);
      return {
        previewImageVisible: media instanceof HTMLImageElement,
        previewImageSrc: media instanceof HTMLImageElement ? media.src : "",
        artifactWorkbenchVisible: Boolean(workbench),
        artifactWorkbenchText: workbench?.textContent || "",
        artifactEmptySurfaceVisible: Boolean(emptySurface),
        canvasWorkbenchPreviewVisible: Boolean(canvasPreview),
        attachmentCountAfterClick: attachmentImages.length,
        selectedArtifactText: document.body?.innerText || "",
      };
    });
    if (result.previewImageVisible) {
      break;
    }
    await sleep(options.intervalMs);
  }

  assert(
    result?.previewImageVisible,
    `导入图片附件未进入媒体 preview artifact: ${JSON.stringify(
      sanitizeJson(result),
    )}`,
  );

  return {
    ...before,
    ...result,
  };
}

async function waitForInlineToolFileButton(page, options, fileName) {
  const selector = `[data-testid="inline-tool-open-file"][data-file-path$="${fileName}"]`;
  const startedAt = Date.now();
  let lastSnapshot = null;
  while (Date.now() - startedAt < Math.min(options.timeoutMs, 20_000)) {
    lastSnapshot = await page.evaluate(
      ({ selector }) => {
        const buttons = Array.from(document.querySelectorAll(selector));
        const inlineSteps = Array.from(
          document.querySelectorAll('[data-testid="inline-tool-process-step"]'),
        ).map((step) => ({
          text: step.textContent || "",
          buttons: Array.from(step.querySelectorAll("button")).map(
            (button) => ({
              testId: button.getAttribute("data-testid") || "",
              filePath: button.getAttribute("data-file-path") || "",
              title: button.getAttribute("title") || "",
              ariaLabel: button.getAttribute("aria-label") || "",
              text: button.textContent || "",
            }),
          ),
        }));
        return {
          count: buttons.length,
          paths: buttons
            .map((button) => button.getAttribute("data-file-path") || "")
            .filter(Boolean),
          inlineSteps,
          bodyText: document.body?.innerText || "",
        };
      },
      { selector },
    );
    if (lastSnapshot.count > 0) {
      return selector;
    }
    await sleep(options.intervalMs);
  }
  throw new Error(
    `导入工具轨缺少文件打开按钮 ${fileName}: ${JSON.stringify(
      sanitizeJson(lastSnapshot),
    )}`,
  );
}

async function waitForWorkbenchFilePreview(page, options, expected) {
  const startedAt = Date.now();
  let result = null;
  while (Date.now() - startedAt < Math.min(options.timeoutMs, 20_000)) {
    result = await page.evaluate(() => {
      const artifactWorkbench = document.querySelector(
        '[data-testid="artifact-workbench-shell"]',
      );
      const canvasWorkbench = document.querySelector(
        '[data-testid="canvas-workbench-shell"]',
      );
      const canvasWorkbenchLayout = document.querySelector(
        '[data-testid="canvas-workbench-layout"]',
      );
      const previewPanel = document.querySelector(
        '[data-testid="canvas-workbench-preview-mode-panel"]',
      );
      const markdownPreview = document.querySelector(
        '[data-testid="canvas-workbench-markdown-preview"]',
      );
      const htmlPreview = document.querySelector(
        '[data-testid="canvas-workbench-html-preview"]',
      );
      const codePreview = document.querySelector(
        '[data-testid="canvas-workbench-code-preview"]',
      );
      const emptySurface = document.querySelector(
        '[data-testid="artifact-empty-surface"]',
      );
      const bodyText = document.body?.innerText || "";
      const previewPanelText = previewPanel?.textContent || "";
      const workbenchText =
        artifactWorkbench?.textContent ||
        canvasWorkbench?.textContent ||
        canvasWorkbenchLayout?.textContent ||
        previewPanelText ||
        "";
      return {
        bodyText,
        workbenchVisible: Boolean(
          artifactWorkbench ||
          canvasWorkbench ||
          canvasWorkbenchLayout ||
          previewPanel,
        ),
        workbenchText,
        previewPanelText,
        artifactWorkbenchVisible: Boolean(artifactWorkbench),
        canvasWorkbenchVisible: Boolean(canvasWorkbench),
        canvasWorkbenchLayoutVisible: Boolean(canvasWorkbenchLayout),
        previewPanelVisible: Boolean(previewPanel),
        markdownPreviewVisible: Boolean(markdownPreview),
        htmlPreviewVisible: Boolean(htmlPreview),
        codePreviewVisible: Boolean(codePreview),
        emptySurfaceVisible: Boolean(emptySurface),
        htmlPreviewSrc:
          htmlPreview instanceof HTMLIFrameElement ? htmlPreview.src : "",
        htmlPreviewSrcDoc:
          htmlPreview instanceof HTMLIFrameElement ? htmlPreview.srcdoc : "",
      };
    });
    if (
      result.workbenchVisible &&
      result.previewPanelVisible &&
      (result.previewPanelText || result.workbenchText).includes(
        expected.fileName,
      ) &&
      (result.previewPanelText || result.workbenchText).includes(expected.text)
    ) {
      return result;
    }
    if (
      expected.kind === "html" &&
      result.workbenchVisible &&
      result.previewPanelVisible &&
      result.htmlPreviewVisible &&
      (result.previewPanelText || result.workbenchText).includes(
        expected.fileName,
      ) &&
      (result.bodyText.includes(expected.text) ||
        result.htmlPreviewSrc ||
        result.htmlPreviewSrcDoc.includes(expected.text))
    ) {
      return result;
    }
    await sleep(options.intervalMs);
  }
  throw new Error(
    `Workbench 未显示导入文件预览 ${expected.fileName}: ${JSON.stringify(
      sanitizeJson(result),
    )}`,
  );
}

async function clickImportedToolFilePreview(page, options, expected) {
  const selector = await waitForInlineToolFileButton(
    page,
    options,
    expected.fileName,
  );
  await page.locator(selector).first().click();
  const result = await waitForWorkbenchFilePreview(page, options, expected);
  assert(
    result.workbenchVisible && result.previewPanelVisible,
    `${expected.fileName} 未进入 Artifact Workbench`,
  );
  assert(
    !result.emptySurfaceVisible,
    `${expected.fileName} 打开后仍显示空预览`,
  );
  const previewText = result.previewPanelText || result.workbenchText;
  if (expected.kind === "html") {
    assert(
      result.htmlPreviewVisible &&
        Boolean(result.htmlPreviewSrc || result.htmlPreviewSrcDoc) &&
        previewText.includes(expected.fileName),
      `${expected.fileName} 未进入 HTML iframe 预览`,
    );
  } else {
    assert(
      previewText.includes(expected.fileName) &&
        previewText.includes(expected.text),
      `${expected.fileName} 未显示预期内容`,
    );
  }
  if (expected.kind === "docx") {
    const forbiddenTexts = [
      "PK\u0003\u0004",
      "word/document.xml",
      "[Content_Types].xml",
    ];
    assert(
      !forbiddenTexts.some((text) => result.bodyText.includes(text)),
      `${expected.fileName} 预览暴露了 DOCX ZIP/OpenXML 噪音`,
    );
  }
  return {
    fileName: expected.fileName,
    kind: expected.kind,
    selector,
    ...result,
  };
}

export async function inspectImportedFilePreviewArtifacts(page, options) {
  await waitForUiSnapshot(
    page,
    options,
    (snapshot) =>
      snapshot.textareaVisible &&
      snapshot.bodyText.includes(IMPORTED_USER_TEXT) &&
      snapshot.bodyText.includes(IMPORTED_ASSISTANT_TEXT),
    "导入会话页未稳定，无法检查导入文件预览",
  );

  const markdown = await clickImportedToolFilePreview(page, options, {
    fileName: IMPORTED_PREVIEW_MARKDOWN_FILE,
    kind: "markdown",
    text: IMPORTED_PREVIEW_MARKDOWN_TEXT,
  });
  const html = await clickImportedToolFilePreview(page, options, {
    fileName: IMPORTED_PREVIEW_HTML_FILE,
    kind: "html",
    text: IMPORTED_PREVIEW_HTML_TEXT,
  });
  const docx = await clickImportedToolFilePreview(page, options, {
    fileName: IMPORTED_PREVIEW_DOCX_FILE,
    kind: "docx",
    text: IMPORTED_PREVIEW_DOCX_TEXT,
  });

  return {
    markdown,
    html,
    docx,
    openedAllImportedPreviewArtifacts: true,
  };
}

async function inspectImportedSessionVisualViewport(
  page,
  options,
  viewport,
  screenshotPath,
) {
  await page.setViewportSize({
    width: viewport.width,
    height: viewport.height,
  });

  const isStableImportedVisualState = (current) => {
    const bodyText = current.bodyText || "";
    return (
      current.textareaVisible &&
      current.textareaDisabled === false &&
      bodyText.includes(IMPORTED_USER_TEXT) &&
      bodyText.includes(IMPORTED_ASSISTANT_TEXT) &&
      bodyText.includes(CONTINUE_USER_TEXT) &&
      bodyText.includes(CONTINUE_ASSISTANT_TEXT) &&
      (bodyText.includes("导入的命令记录") ||
        bodyText.includes("Imported command record")) &&
      hasPatchEvidenceText(bodyText) &&
      (bodyText.includes("搜索") ||
        bodyText.includes("Search") ||
        bodyText.includes("web search")) &&
      (bodyText.includes("导入的权限记录") ||
        bodyText.includes("已导入，只读记录") ||
        bodyText.includes("审批") ||
        bodyText.includes("Approval")) &&
      !bodyText.includes("imported_read_only") &&
      !bodyText.includes("thread-codex") &&
      !bodyText.includes("Approve Codex command")
    );
  };

  const snapshot = await waitForUiSnapshot(
    page,
    { ...options, timeoutMs: Math.min(options.timeoutMs, 15_000) },
    isStableImportedVisualState,
    `导入会话 ${viewport.label} 视口未稳定`,
  );
  const audit = await page.evaluate(
    ({
      importedUserText,
      importedAssistantText,
      importedReasoningText,
      continueUserText,
      continueAssistantText,
    }) => {
      const bodyText = document.body?.innerText || "";
      const textarea = document.querySelector(
        'textarea[name="agent-chat-message"]',
      );
      const importedBanner = document.querySelector(
        '[data-testid="imported-source-banner"]',
      );
      const importedRunControl = document.querySelector(
        '[data-testid="task-center-run-control-imported"]',
      );
      const messageList =
        document.querySelector('[data-testid="message-list"]') ||
        document.querySelector('[data-testid="message-list-stub"]') ||
        document.querySelector('[data-testid="agent-message-list"]') ||
        document.querySelector(
          '[data-testid="message-list-scroll-container"]',
        ) ||
        document.querySelector('[data-testid="message-list-column"]') ||
        document.querySelector('[data-testid="message-list-frame"]');
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const textareaRect =
        textarea instanceof HTMLElement
          ? textarea.getBoundingClientRect()
          : null;
      const messageRect =
        messageList instanceof HTMLElement
          ? messageList.getBoundingClientRect()
          : null;
      const forbiddenMainTexts = [
        "imported_read_only",
        "thread-codex",
        "Approve Codex command",
      ];
      const requiredTexts = [
        importedUserText,
        importedAssistantText,
        continueUserText,
        continueAssistantText,
      ];
      return {
        viewportWidth,
        viewportHeight,
        bodyTextLength: bodyText.length,
        hasImportedUserMessage: bodyText.includes(importedUserText),
        hasImportedAssistantMessage: bodyText.includes(importedAssistantText),
        hasContinueUserMessage: bodyText.includes(continueUserText),
        hasContinueAssistantMessage: bodyText.includes(continueAssistantText),
        hasReasoningVisible: bodyText.includes(importedReasoningText),
        hasReasoningStatusVisible: bodyText.includes("已完成思考"),
        hasCommandRecordVisible:
          bodyText.includes("导入的命令记录") ||
          bodyText.includes("Imported command record"),
        hasPatchText:
          (bodyText.includes("补丁") ||
            bodyText.includes("Patch") ||
            bodyText.includes("已编辑")) &&
          (bodyText.includes("src/lib.rs") ||
            bodyText.includes("lib.rs") ||
            bodyText.includes("文件")),
        hasSearchEvidence:
          bodyText.includes("搜索") ||
          bodyText.includes("Search") ||
          bodyText.includes("web search"),
        hasApprovalText:
          bodyText.includes("导入的权限记录") ||
          bodyText.includes("已导入，只读记录") ||
          bodyText.includes("审批") ||
          bodyText.includes("Approval"),
        importedBannerVisible: Boolean(importedBanner),
        importedRunControlVisible: Boolean(importedRunControl),
        inputbarVisible:
          textarea instanceof HTMLTextAreaElement &&
          textareaRect !== null &&
          textareaRect.width > 120 &&
          textareaRect.height >= 24 &&
          textareaRect.bottom > 0 &&
          textareaRect.top < viewportHeight,
        inputbarDisabled:
          textarea instanceof HTMLTextAreaElement ? textarea.disabled : true,
        inputbarOccludesMainContent:
          Boolean(textareaRect && messageRect) &&
          textareaRect.top < messageRect.top + 80,
        messageListVisible:
          messageRect !== null &&
          messageRect.width > 240 &&
          messageRect.height > 120 &&
          messageRect.bottom > 0 &&
          messageRect.top < viewportHeight,
        hidesRawImportedCommand: !forbiddenMainTexts.some((text) =>
          bodyText.includes(text),
        ),
        hidesSourceBrandText: !/\bcodex\b/i.test(bodyText),
        missingRequiredTexts: requiredTexts.filter(
          (text) => !bodyText.includes(text),
        ),
      };
    },
    {
      importedUserText: IMPORTED_USER_TEXT,
      importedAssistantText: IMPORTED_ASSISTANT_TEXT,
      importedReasoningText: IMPORTED_REASONING_TEXT,
      continueUserText: CONTINUE_USER_TEXT,
      continueAssistantText: CONTINUE_ASSISTANT_TEXT,
    },
  );
  await page.screenshot({ path: screenshotPath, fullPage: true });
  return {
    label: viewport.label,
    width: viewport.width,
    height: viewport.height,
    screenshot: screenshotPath,
    snapshotUrl: snapshot.url,
    ...audit,
  };
}

export async function collectImportedSessionVisualAudit(
  page,
  options,
  screenshotDir,
) {
  const audits = [];
  for (const viewport of VISUAL_AUDIT_VIEWPORTS) {
    const screenshotPath = path.join(
      screenshotDir,
      `${options.prefix}-${viewport.label}.png`,
    );
    const audit = await inspectImportedSessionVisualViewport(
      page,
      options,
      viewport,
      screenshotPath,
    );
    assert(
      audit.hasImportedUserMessage,
      `${viewport.label} 视口缺少导入用户消息`,
    );
    assert(
      audit.hasImportedAssistantMessage,
      `${viewport.label} 视口缺少导入助手消息`,
    );
    assert(
      audit.hasContinueUserMessage,
      `${viewport.label} 视口缺少续聊用户消息`,
    );
    assert(
      audit.hasContinueAssistantMessage,
      `${viewport.label} 视口缺少续聊助手消息`,
    );
    assert(audit.hasReasoningVisible, `${viewport.label} 视口缺少导入思考记录`);
    assert(
      audit.hasCommandRecordVisible,
      `${viewport.label} 视口缺少导入命令友好记录`,
    );
    assert(audit.hasPatchText, `${viewport.label} 视口缺少导入补丁记录`);
    assert(audit.hasSearchEvidence, `${viewport.label} 视口缺少导入搜索记录`);
    assert(audit.hasApprovalText, `${viewport.label} 视口缺少导入审批记录`);
    assert(
      !audit.importedBannerVisible,
      `${viewport.label} 视口不应展示导入主线 banner`,
    );
    assert(
      !audit.importedRunControlVisible,
      `${viewport.label} 视口不应展示导入运行控制卡`,
    );
    assert(audit.inputbarVisible, `${viewport.label} 视口输入框不可见`);
    assert(!audit.inputbarDisabled, `${viewport.label} 视口输入框不可用`);
    assert(
      !audit.inputbarOccludesMainContent,
      `${viewport.label} 视口输入框遮挡消息主内容`,
    );
    assert(audit.messageListVisible, `${viewport.label} 视口消息列表不可见`);
    assert(
      audit.hidesRawImportedCommand,
      `${viewport.label} 视口暴露了原始导入命令或内部字段`,
    );
    assert(
      audit.hidesSourceBrandText,
      `${viewport.label} 视口暴露了非导入语境来源品牌字眼`,
    );
    audits.push(audit);
  }
  return audits;
}

export async function waitForImportedSessionDetails(page, options) {
  return await waitForUiSnapshot(
    page,
    options,
    (snapshot) => {
      const summary = summarizeImportedDetailsSnapshot(snapshot);
      return (
        snapshot.textareaVisible &&
        summary.hasImportedUserMessage &&
        summary.hasImportedAssistantMessage &&
        summary.hasReasoningVisible &&
        summary.hasCommandRecordVisible &&
        summary.hasPatchText &&
        summary.hasApprovalText &&
        summary.hidesRawImportedCommand
      );
    },
    "导入后的会话页未还原本地历史细节",
  );
}

export async function sendFollowUpFromGui(page, options) {
  await waitForUiSnapshot(
    page,
    options,
    (snapshot) =>
      snapshot.textareaVisible && snapshot.textareaDisabled === false,
    "续聊输入框未就绪",
  );
  const textarea = page.locator('textarea[name="agent-chat-message"]').first();
  await textarea.fill(CONTINUE_USER_TEXT);
  await waitForUiSnapshot(
    page,
    options,
    (snapshot) => snapshot.textareaValue === CONTINUE_USER_TEXT,
    "续聊输入未进入 textarea",
  );
  const clicked = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll("button"));
    const sendButton = buttons.find((button) => {
      const label = [
        button.getAttribute("aria-label") || "",
        button.getAttribute("title") || "",
        button.textContent || "",
      ].join("\n");
      return (
        (label.includes("发送") || /\bSend\b/i.test(label)) && !button.disabled
      );
    });
    if (sendButton instanceof HTMLElement) {
      sendButton.click();
      return {
        clicked: true,
        label:
          sendButton.getAttribute("aria-label") ||
          sendButton.getAttribute("title") ||
          sendButton.textContent ||
          "send",
      };
    }
    return {
      clicked: false,
      labels: buttons.map((button) =>
        [
          button.getAttribute("aria-label") || "",
          button.getAttribute("title") || "",
          button.textContent || "",
        ].join(" / "),
      ),
    };
  });
  assert(
    clicked?.clicked,
    `未找到可点击发送按钮: ${JSON.stringify(sanitizeJson(clicked))}`,
  );
  return clicked;
}

export async function waitForContinuationVisible(page, options) {
  return await waitForUiSnapshot(
    page,
    options,
    (snapshot) =>
      snapshot.textareaVisible &&
      snapshot.bodyText.includes(CONTINUE_USER_TEXT) &&
      snapshot.bodyText.includes(CONTINUE_ASSISTANT_TEXT),
    "续聊消息未在同一会话页完成",
  );
}
