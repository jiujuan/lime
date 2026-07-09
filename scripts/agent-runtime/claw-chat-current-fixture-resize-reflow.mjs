import path from "node:path";
import {
  APP_SERVER_METHOD_WORKSPACE_RIGHT_SURFACE_REQUEST,
  LIVE_TAIL_COMMIT_DONE_TEXT,
  LIVE_TAIL_COMMIT_FIRST_TEXT,
  LIVE_TAIL_COMMIT_OVERFLOW_MARKER,
  LIVE_TAIL_COMMIT_PROMPT,
  LIVE_TAIL_COMMIT_TABLE_HEADER,
  LIVE_TAIL_COMMIT_TABLE_TAIL,
} from "./claw-chat-current-fixture-constants.mjs";
import { waitForBackendLedgerEntry } from "./claw-chat-current-fixture-backend-ledger.mjs";
import { sendPromptFromGui } from "./claw-chat-current-fixture-gui-actions.mjs";
import { waitForGuiChatCompleted } from "./claw-chat-current-fixture-gui-completion-waits.mjs";
import { waitForSessionReadCompleted } from "./claw-chat-current-fixture-read-model-waits.mjs";
import {
  evaluatePageSnapshot,
  invokeAppServerFromPage,
} from "./claw-chat-current-fixture-rpc.mjs";
import { clickAndAssertRightSurface } from "./claw-chat-current-fixture-right-surface-visual.mjs";
import {
  assert,
  sanitizeJson,
  sleep,
} from "./claw-chat-current-fixture-utils.mjs";

const RESIZE_REFLOW_VIEWPORTS = {
  wide: { width: 1440, height: 1000 },
  compact: { width: 1240, height: 760 },
  restored: { width: 1440, height: 1000 },
};

function latestTurnStatus(readModel) {
  return (
    readModel?.detail?.thread_read?.runtime_summary?.latestTurnStatus ??
    readModel?.detail?.thread_read?.status ??
    readModel?.detail?.status ??
    null
  );
}

function summarizeResizeReflowReadModel(readModel) {
  const serialized = JSON.stringify(readModel || {});
  return {
    detailItemCount: Array.isArray(readModel?.detail?.items)
      ? readModel.detail.items.length
      : null,
    threadReadItemCount: Array.isArray(
      readModel?.detail?.thread_read?.thread_items,
    )
      ? readModel.detail.thread_read.thread_items.length
      : null,
    latestTurnStatus: latestTurnStatus(readModel),
    includesPrompt: serialized.includes(LIVE_TAIL_COMMIT_PROMPT),
    includesFirstText: serialized.includes(LIVE_TAIL_COMMIT_FIRST_TEXT),
    includesOverflowMarker: serialized.includes(
      LIVE_TAIL_COMMIT_OVERFLOW_MARKER,
    ),
    includesTableHeader: serialized.includes(LIVE_TAIL_COMMIT_TABLE_HEADER),
    includesTableTail: serialized.includes(LIVE_TAIL_COMMIT_TABLE_TAIL),
    includesAssistantDone: serialized.includes(LIVE_TAIL_COMMIT_DONE_TEXT),
  };
}

async function scrollResizeReflowTailIntoView(page) {
  return await page.evaluate(
    ({ tableTail, doneText }) => {
      const textMatches = Array.from(document.querySelectorAll("*")).filter(
        (element) => {
          const text = element.textContent || "";
          return text.includes(tableTail) || text.includes(doneText);
        },
      );
      const target = textMatches.at(-1) ?? document.body;
      target?.scrollIntoView?.({ block: "end", inline: "nearest" });

      const scrollRoot =
        document.querySelector(
          '[data-testid="message-list-scroll-container"]',
        ) ||
        document.querySelector('[data-testid="message-list-frame"]') ||
        document.querySelector('[data-testid="message-list"]') ||
        document.scrollingElement;
      if (scrollRoot) {
        scrollRoot.scrollTop = scrollRoot.scrollHeight;
      }
      return {
        targetTag: target?.tagName ?? null,
        scrolled: Boolean(target),
        scrollRootTestId: scrollRoot?.getAttribute?.("data-testid") ?? null,
      };
    },
    {
      doneText: LIVE_TAIL_COMMIT_DONE_TEXT,
      tableTail: LIVE_TAIL_COMMIT_TABLE_TAIL,
    },
  );
}

async function captureResizeScreenshot(page, options, name) {
  const screenshotPath = path.join(
    options.evidenceDir,
    `${options.prefix}-${name}.png`,
  );
  await page.screenshot({
    path: screenshotPath,
    fullPage: false,
  });
  return screenshotPath;
}

async function requestResizeReflowFilesSurface({
  page,
  appServerRequests,
  workspace,
  sessionId,
}) {
  assert(workspace?.workspaceId, "resize/reflow 缺少 workspaceId");
  assert(workspace?.rootPath, "resize/reflow 缺少 workspace rootPath");
  assert(sessionId, "resize/reflow 缺少 sessionId");

  return await invokeAppServerFromPage(
    page,
    APP_SERVER_METHOD_WORKSPACE_RIGHT_SURFACE_REQUEST,
    {
      workspaceId: workspace.workspaceId,
      workspaceRoot: workspace.rootPath,
      sessionId,
      surfaceKind: "files",
      origin: "runtime",
      priority: "normal",
      candidateId: "internal/roadmap/test/clawstream/scenario-ledger.md",
      ttlMs: 120_000,
      metadata: {
        relativePath: "internal/roadmap/test/clawstream/scenario-ledger.md",
        title: "Clawstream scenario ledger",
      },
    },
    appServerRequests,
  );
}

async function evaluateResizeReflowSnapshot(page, label) {
  return await evaluatePageSnapshot(
    page,
    ({
      doneText,
      firstText,
      label,
      overflowMarker,
      prompt,
      tableHeader,
      tableTail,
    }) => {
      const bodyText = document.body?.innerText || "";
      const messageListScope =
        document.querySelector('[data-testid="message-list-column"]') ||
        document.querySelector('[data-testid="message-list"]') ||
        document.querySelector('[data-testid="message-list-frame"]') ||
        document.querySelector("main") ||
        document.body;
      const turnGroups = Array.from(
        document.querySelectorAll('[data-testid="message-turn-group"]'),
      );
      const matchingTurnGroups = turnGroups.filter((group) =>
        (group.innerText || "").includes(prompt),
      );
      const scopedTurnGroup = matchingTurnGroups.at(-1) ?? null;
      const assistantBubbles = Array.from(
        (scopedTurnGroup || messageListScope).querySelectorAll(
          '[data-message-role="assistant"]',
        ),
      );
      const assistantScope =
        assistantBubbles.at(-1) ?? scopedTurnGroup ?? messageListScope;
      const assistantText = assistantScope?.innerText || "";
      const textarea = document.querySelector(
        'textarea[name="agent-chat-message"]',
      );
      const inputbar =
        textarea?.closest('[data-testid="inputbar-core-container"]') ??
        document.querySelector('[data-testid="inputbar-core-container"]');
      const rightHost = document.querySelector(
        '[data-testid="workspace-right-surface-host"]',
      );
      const filesRoot = document.querySelector(
        '[data-testid="workspace-files-surface"]',
      );
      const activePane = document.querySelector(
        '[data-testid="workspace-right-surface-active-pane"]',
      );
      const stopButtonVisible = Array.from(document.querySelectorAll("button"))
        .filter((button) => !button.disabled)
        .some((button) => {
          const label = [
            button.getAttribute("title") || "",
            button.textContent || "",
            button.getAttribute("aria-label") || "",
          ].join("\n");
          return (
            label.includes("停止") ||
            label.includes("终止") ||
            /\bStop\b/i.test(label)
          );
        });
      const viewport = {
        width: Math.round(window.innerWidth),
        height: Math.round(window.innerHeight),
      };
      const messageList = visibleInfo(messageListScope);
      const inputbarInfo = visibleInfo(inputbar);
      const textareaInfo = visibleInfo(textarea);
      const rightHostInfo = visibleInfo(rightHost);
      const filesRootInfo = visibleInfo(filesRoot);
      const activePaneInfo = visibleInfo(activePane);
      const tableTailRange = textRangeRect(assistantScope, tableTail);
      const doneTextRange = textRangeRect(assistantScope, doneText);
      const markerRect = tableTailRange ?? doneTextRange;
      const scrollRoot =
        document.querySelector(
          '[data-testid="message-list-scroll-container"]',
        ) ||
        document.querySelector('[data-testid="message-list-frame"]') ||
        document.querySelector('[data-testid="message-list"]') ||
        document.scrollingElement;
      const scroll = scrollMetrics(scrollRoot);
      const noTailInputOverlap =
        markerRect != null &&
        inputbarInfo.rect != null &&
        markerRect.bottom <= inputbarInfo.rect.top - 2 &&
        markerRect.top >= 0 &&
        markerRect.bottom <= viewport.height;
      const noMessageRightOverlap =
        !rightHostInfo.visible ||
        messageList.rect == null ||
        rightHostInfo.rect == null ||
        messageList.rect.right <= rightHostInfo.rect.left + 8 ||
        rightHostInfo.rect.right <= messageList.rect.left + 8;
      const noInputRightOverlap =
        !rightHostInfo.visible ||
        inputbarInfo.rect == null ||
        rightHostInfo.rect == null ||
        inputbarInfo.rect.right <= rightHostInfo.rect.left + 8 ||
        rightHostInfo.rect.right <= inputbarInfo.rect.left + 8;
      const inputbarAnchored =
        inputbarInfo.visible === true &&
        textareaInfo.visible === true &&
        inputbarInfo.rect != null &&
        inputbarInfo.rect.bottom <= viewport.height - 2 &&
        inputbarInfo.rect.top >= Math.round(viewport.height * 0.45);
      const rightSurfaceStable =
        rightHostInfo.visible === true &&
        filesRootInfo.visible === true &&
        (rightHost?.getAttribute("data-surface") || "") === "files";

      return {
        label,
        url: window.location.href,
        viewport,
        hasPrompt: bodyText.includes(prompt),
        turnGroupCountWithPrompt: matchingTurnGroups.length,
        assistantTextIncludesPrompt: assistantText.includes(prompt),
        hasFirstText: assistantText.includes(firstText),
        hasOverflowMarker: assistantText.includes(overflowMarker),
        hasTableHeader: assistantText.includes(tableHeader),
        hasTableTail: assistantText.includes(tableTail),
        hasDoneText: assistantText.includes(doneText),
        startupNoteVisible: [
          "启动处理流程",
          "启动说明",
          "已接收请求",
          "正在启动",
        ].some((fragment) => assistantText.includes(fragment)),
        textareaDisabled:
          textarea instanceof HTMLTextAreaElement ? textarea.disabled : null,
        stopButtonVisible,
        markerRect,
        tableTailRange,
        doneTextRange,
        messageList,
        inputbar: inputbarInfo,
        textarea: textareaInfo,
        rightSurface: {
          activeSurface: rightHost?.getAttribute("data-surface") ?? null,
          host: rightHostInfo,
          activePane: activePaneInfo,
          filesRoot: filesRootInfo,
        },
        scroll,
        messageAnchorStable:
          markerRect != null &&
          noTailInputOverlap &&
          (scroll == null || scroll.nearBottom === true),
        inputbarAnchored,
        rightSurfaceStable,
        noTailInputOverlap,
        noMessageRightOverlap,
        noInputRightOverlap,
        noOverlap:
          noTailInputOverlap && noMessageRightOverlap && noInputRightOverlap,
        assistantTextLength: assistantText.length,
        assistantTextPreview: assistantText.slice(0, 240),
      };

      function visibleInfo(node) {
        const rect = node?.getBoundingClientRect();
        const style = node ? window.getComputedStyle(node) : null;
        return {
          exists: Boolean(node),
          visible: Boolean(
            node &&
            rect &&
            rect.width > 8 &&
            rect.height > 8 &&
            style?.display !== "none" &&
            style?.visibility !== "hidden" &&
            Number(style?.opacity ?? "1") > 0,
          ),
          rect: rect ? rectToJson(rect) : null,
        };
      }

      function scrollMetrics(node) {
        if (!node) {
          return null;
        }
        const rect = node.getBoundingClientRect();
        const scrollHeight = Math.round(node.scrollHeight || 0);
        const clientHeight = Math.round(node.clientHeight || rect.height || 0);
        const scrollTop = Math.round(node.scrollTop || 0);
        const distanceToBottom = Math.round(
          Math.max(0, scrollHeight - clientHeight - scrollTop),
        );
        return {
          testId: node.getAttribute?.("data-testid") || node.tagName,
          scrollHeight,
          clientHeight,
          scrollTop,
          distanceToBottom,
          overflowed: scrollHeight > clientHeight + 4,
          nearBottom: !scrollHeight || distanceToBottom <= 220,
          rect: rectToJson(rect),
        };
      }

      function textRangeRect(root, needle) {
        if (!root || !needle) {
          return null;
        }
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        let node = walker.nextNode();
        while (node) {
          const index = String(node.nodeValue || "").indexOf(needle);
          if (index >= 0) {
            const range = document.createRange();
            range.setStart(node, index);
            range.setEnd(node, index + needle.length);
            const rect = range.getBoundingClientRect();
            range.detach();
            return rect ? rectToJson(rect) : null;
          }
          node = walker.nextNode();
        }
        return null;
      }

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
    },
    {
      doneText: LIVE_TAIL_COMMIT_DONE_TEXT,
      firstText: LIVE_TAIL_COMMIT_FIRST_TEXT,
      label,
      overflowMarker: LIVE_TAIL_COMMIT_OVERFLOW_MARKER,
      prompt: LIVE_TAIL_COMMIT_PROMPT,
      tableHeader: LIVE_TAIL_COMMIT_TABLE_HEADER,
      tableTail: LIVE_TAIL_COMMIT_TABLE_TAIL,
    },
  );
}

function isResizeReflowSnapshotReady(snapshot, expectedViewport) {
  return (
    snapshot?.viewport?.width === expectedViewport.width &&
    snapshot?.viewport?.height === expectedViewport.height &&
    snapshot.hasPrompt === true &&
    snapshot.turnGroupCountWithPrompt === 1 &&
    snapshot.hasFirstText === true &&
    snapshot.hasOverflowMarker === true &&
    snapshot.hasTableHeader === true &&
    snapshot.hasTableTail === true &&
    snapshot.hasDoneText === true &&
    snapshot.startupNoteVisible === false &&
    snapshot.textareaDisabled === false &&
    snapshot.stopButtonVisible === false &&
    snapshot.messageAnchorStable === true &&
    snapshot.inputbarAnchored === true &&
    snapshot.rightSurfaceStable === true &&
    snapshot.noOverlap === true
  );
}

async function waitForResizeReflowSnapshot(page, options, { label, viewport }) {
  await page.setViewportSize(viewport);
  const startedAt = Date.now();
  let lastSnapshot = null;
  while (Date.now() - startedAt < options.timeoutMs) {
    const snapshot = await evaluateResizeReflowSnapshot(page, label);
    lastSnapshot = snapshot;
    if (isResizeReflowSnapshotReady(snapshot, viewport)) {
      return snapshot;
    }
    await sleep(options.intervalMs);
  }

  throw new Error(
    `Electron resize/reflow snapshot 未稳定: ${label}; snapshot=${JSON.stringify(
      sanitizeJson(lastSnapshot),
    )}`,
  );
}

export async function runElectronResizeReflowScenario({
  page,
  options,
  workspace,
  appServerRequests,
  runtimeEnv,
  logStage,
}) {
  const result = {};

  logStage("send-electron-resize-reflow-prompt-from-gui");
  result.electronResizeReflowInputSend = sanitizeJson(
    await sendPromptFromGui(page, options, LIVE_TAIL_COMMIT_PROMPT),
  );

  logStage("wait-electron-resize-reflow-backend-turn-start");
  const backendTurnStart = await waitForBackendLedgerEntry(
    runtimeEnv.backendLedgerPath,
    (entry) =>
      entry.kind === "turnStart" && entry.inputText === LIVE_TAIL_COMMIT_PROMPT,
    options,
  );
  result.electronResizeReflowBackendTurnStart = sanitizeJson({
    sessionId: backendTurnStart.entry.sessionId,
    turnId: backendTurnStart.entry.turnId,
    inputText: backendTurnStart.entry.inputText,
    ledgerCount: backendTurnStart.ledger.length,
  });

  logStage("wait-gui-electron-resize-reflow-completed");
  result.guiElectronResizeReflowCompleted = sanitizeJson(
    await waitForGuiChatCompleted(page, options, {
      prompt: LIVE_TAIL_COMMIT_PROMPT,
      doneText: LIVE_TAIL_COMMIT_DONE_TEXT,
      summaryText: LIVE_TAIL_COMMIT_FIRST_TEXT,
      requiredVisibleTexts: [
        LIVE_TAIL_COMMIT_OVERFLOW_MARKER,
        LIVE_TAIL_COMMIT_TABLE_HEADER,
        LIVE_TAIL_COMMIT_TABLE_TAIL,
      ],
    }),
  );

  logStage("wait-read-model-electron-resize-reflow-completed");
  const readModel = await waitForSessionReadCompleted(
    page,
    options,
    appServerRequests,
    {
      prompt: LIVE_TAIL_COMMIT_PROMPT,
      doneText: LIVE_TAIL_COMMIT_DONE_TEXT,
      summaryText: LIVE_TAIL_COMMIT_FIRST_TEXT,
    },
  );
  result.readModelElectronResizeReflowCompleted = sanitizeJson(
    summarizeResizeReflowReadModel(readModel),
  );

  const liveTailLedger = await waitForBackendLedgerEntry(
    runtimeEnv.backendLedgerPath,
    (entry) => entry.kind === "liveTailCommitCompleted",
    options,
  );
  result.electronResizeReflowBackendCompleted = sanitizeJson({
    eventType: liveTailLedger.entry.eventType,
    turnId: liveTailLedger.entry.turnId,
    firstText: liveTailLedger.entry.firstText,
    overflowMarker: liveTailLedger.entry.overflowMarker,
    tableHeader: liveTailLedger.entry.tableHeader,
    tableTail: liveTailLedger.entry.tableTail,
    ledgerCount: liveTailLedger.ledger.length,
  });

  logStage("request-electron-resize-reflow-files-surface");
  result.electronResizeReflowFilesSurfaceRequest = sanitizeJson(
    await requestResizeReflowFilesSurface({
      page,
      appServerRequests,
      workspace,
      sessionId: backendTurnStart.entry.sessionId,
    }),
  );

  logStage("open-electron-resize-reflow-files-surface");
  result.electronResizeReflowFilesSurface = sanitizeJson(
    await clickAndAssertRightSurface(page, options, {
      surfaceKind: "files",
      toggleTestId: "task-center-files-toggle",
      rootTestId: "workspace-files-surface",
    }),
  );

  logStage("scroll-electron-resize-reflow-tail-into-view");
  result.electronResizeReflowTailScroll = sanitizeJson(
    await scrollResizeReflowTailIntoView(page),
  );

  const snapshots = {};
  const screenshots = {};
  for (const [label, viewport] of Object.entries(RESIZE_REFLOW_VIEWPORTS)) {
    logStage(`capture-electron-resize-reflow-${label}`);
    snapshots[label] = sanitizeJson(
      await waitForResizeReflowSnapshot(page, options, {
        label,
        viewport,
      }),
    );
    screenshots[label] = await captureResizeScreenshot(
      page,
      options,
      `electron-resize-reflow-${label}`,
    );
  }

  assert(
    snapshots.wide?.rightSurface?.activeSurface ===
      snapshots.compact?.rightSurface?.activeSurface &&
      snapshots.compact?.rightSurface?.activeSurface ===
        snapshots.restored?.rightSurface?.activeSurface,
    `Electron resize/reflow right surface owner 不稳定: ${JSON.stringify(
      sanitizeJson({
        wide: snapshots.wide?.rightSurface,
        compact: snapshots.compact?.rightSurface,
        restored: snapshots.restored?.rightSurface,
      }),
    )}`,
  );

  result.electronResizeReflowLayout = sanitizeJson({
    viewports: RESIZE_REFLOW_VIEWPORTS,
    snapshots,
    screenshots,
    stableViewportCount: Object.values(snapshots).filter(Boolean).length,
    screenshotCount: Object.values(screenshots).filter(Boolean).length,
  });

  return result;
}
