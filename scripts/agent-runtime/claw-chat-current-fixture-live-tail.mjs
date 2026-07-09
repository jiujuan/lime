import {
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
import { evaluatePageSnapshot } from "./claw-chat-current-fixture-rpc.mjs";
import { sanitizeJson, sleep } from "./claw-chat-current-fixture-utils.mjs";

function latestTurnStatus(readModel) {
  return (
    readModel?.detail?.thread_read?.runtime_summary?.latestTurnStatus ??
    readModel?.detail?.thread_read?.status ??
    readModel?.detail?.status ??
    null
  );
}

function readModelItemCount(readModel) {
  return {
    detailItemCount: Array.isArray(readModel?.detail?.items)
      ? readModel.detail.items.length
      : null,
    threadReadItemCount: Array.isArray(
      readModel?.detail?.thread_read?.thread_items,
    )
      ? readModel.detail.thread_read.thread_items.length
      : null,
  };
}

function summarizeLiveTailCommitReadModel(readModel) {
  const serialized = JSON.stringify(readModel || {});
  return {
    ...readModelItemCount(readModel),
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

async function evaluateLiveTailSnapshot(page) {
  return await evaluatePageSnapshot(
    page,
    ({
      doneText,
      firstText,
      overflowMarker,
      prompt,
      tableHeader,
      tableTail,
    }) => {
      const text = document.body?.innerText || "";
      const mainText = document.querySelector("main")?.innerText || text;
      const messageListScope =
        document.querySelector('[data-testid="message-list-column"]') ||
        document.querySelector('[data-testid="message-list"]') ||
        document.querySelector('[data-testid="message-list-frame"]') ||
        document.querySelector("main") ||
        document.body;
      const turnGroups = Array.from(
        document.querySelectorAll('[data-testid="message-turn-group"]'),
      );
      const scopedTurnGroup =
        [...turnGroups]
          .reverse()
          .find((group) => (group.innerText || "").includes(prompt)) ?? null;
      const assistantBubbles = Array.from(
        (scopedTurnGroup || messageListScope).querySelectorAll(
          '[data-message-role="assistant"]',
        ),
      );
      const assistantScope =
        assistantBubbles[assistantBubbles.length - 1] ?? scopedTurnGroup;
      const scopedText = scopedTurnGroup?.innerText || mainText;
      const assistantText = assistantScope?.innerText || scopedText;
      const textarea = document.querySelector(
        'textarea[name="agent-chat-message"]',
      );
      const textareaRect = textarea?.getBoundingClientRect();
      const textareaStyle = textarea ? window.getComputedStyle(textarea) : null;
      const textareaVisible = Boolean(
        textarea &&
        textareaRect &&
        textareaRect.width > 16 &&
        textareaRect.height > 16 &&
        textareaStyle?.visibility !== "hidden" &&
        textareaStyle?.display !== "none",
      );
      const buttons = Array.from(document.querySelectorAll("button")).map(
        (button) => ({
          title: button.getAttribute("title") || "",
          text: button.textContent || "",
          aria: button.getAttribute("aria-label") || "",
          disabled: button.disabled,
        }),
      );
      const stopButtonVisible = buttons.some((button) => {
        const label = [button.title, button.text, button.aria].join("\n");
        return (
          !button.disabled &&
          (label.includes("停止") ||
            label.includes("终止") ||
            /\bStop\b/i.test(label))
        );
      });
      const runningStatusVisible =
        stopButtonVisible ||
        scopedText.includes("正在输出") ||
        scopedText.includes("正在生成") ||
        scopedText.includes("生成中") ||
        /\bStreaming\b/i.test(scopedText);
      const startupNoteVisible = [
        "启动处理流程",
        "启动说明",
        "已接收请求",
        "正在启动",
      ].some((fragment) => scopedText.includes(fragment));
      const readScrollMetrics = (node) => {
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
          nearBottom: !scrollHeight || distanceToBottom <= 180,
          rectHeight: Math.round(rect.height || 0),
        };
      };
      const scrollCandidates = [
        messageListScope,
        document.querySelector('[data-testid="message-list-frame"]'),
        document.querySelector("main"),
        document.scrollingElement,
      ]
        .map(readScrollMetrics)
        .filter(Boolean);
      const scrollRoot =
        scrollCandidates.find((candidate) => candidate.overflowed) ??
        scrollCandidates[0] ??
        null;
      const renderedTableCount = assistantScope
        ? assistantScope.querySelectorAll("table").length
        : 0;
      const firstTextIndex = assistantText.indexOf(firstText);
      const overflowMarkerIndex = assistantText.indexOf(overflowMarker);
      const tableTailIndex = assistantText.indexOf(tableTail);
      const doneTextIndex = assistantText.indexOf(doneText);
      return {
        url: window.location.href,
        hasPrompt: scopedText.includes(prompt),
        hasFirstText: assistantText.includes(firstText),
        hasOverflowMarker: assistantText.includes(overflowMarker),
        hasTableHeader: assistantText.includes(tableHeader),
        hasTableTail: assistantText.includes(tableTail),
        hasDoneText: assistantText.includes(doneText),
        firstTextBeforeOverflow:
          firstTextIndex >= 0 &&
          overflowMarkerIndex >= 0 &&
          firstTextIndex < overflowMarkerIndex,
        firstTextBeforeTableTail:
          firstTextIndex >= 0 &&
          tableTailIndex >= 0 &&
          firstTextIndex < tableTailIndex,
        firstTextBeforeDone:
          firstTextIndex >= 0 &&
          doneTextIndex >= 0 &&
          firstTextIndex < doneTextIndex,
        renderedTableCount,
        markdownTableRendered:
          renderedTableCount > 0 ||
          (assistantText.includes(tableHeader) && assistantText.includes("|")),
        textareaVisible,
        textareaDisabled:
          textarea instanceof HTMLTextAreaElement ? textarea.disabled : null,
        stopButtonVisible,
        runningStatusVisible,
        startupNoteVisible,
        scrollRoot,
        scrollCandidates,
        scrollAnchorStable:
          scrollRoot == null || scrollRoot.nearBottom === true,
        overflowCommitted:
          assistantText.includes(overflowMarker) &&
          (scrollRoot?.overflowed === true || assistantText.length > 1400),
        assistantTextPreview: assistantText.slice(0, 240),
        assistantTextLength: assistantText.length,
      };
    },
    {
      doneText: LIVE_TAIL_COMMIT_DONE_TEXT,
      firstText: LIVE_TAIL_COMMIT_FIRST_TEXT,
      overflowMarker: LIVE_TAIL_COMMIT_OVERFLOW_MARKER,
      prompt: LIVE_TAIL_COMMIT_PROMPT,
      tableHeader: LIVE_TAIL_COMMIT_TABLE_HEADER,
      tableTail: LIVE_TAIL_COMMIT_TABLE_TAIL,
    },
  );
}

async function waitForGuiLiveTailFirstVisibleBeforeCommit(page, options) {
  const startedAt = Date.now();
  let lastSnapshot = null;
  while (Date.now() - startedAt < options.timeoutMs) {
    const snapshot = await evaluateLiveTailSnapshot(page);
    lastSnapshot = snapshot;
    if (
      snapshot?.hasPrompt === true &&
      snapshot.hasFirstText === true &&
      snapshot.hasOverflowMarker === false &&
      snapshot.hasTableTail === false &&
      snapshot.hasDoneText === false &&
      snapshot.runningStatusVisible === true &&
      snapshot.startupNoteVisible === false
    ) {
      return snapshot;
    }
    await sleep(options.intervalMs);
  }
  throw new Error(
    `Claw GUI 未捕获 live-tail 首字完成前可见: ${JSON.stringify(
      sanitizeJson(lastSnapshot),
    )}`,
  );
}

async function waitForGuiLiveTailVisualOracle(page, options) {
  const startedAt = Date.now();
  let lastSnapshot = null;
  while (Date.now() - startedAt < options.timeoutMs) {
    const snapshot = await evaluateLiveTailSnapshot(page);
    lastSnapshot = snapshot;
    if (
      snapshot?.hasPrompt === true &&
      snapshot.hasFirstText === true &&
      snapshot.hasOverflowMarker === true &&
      snapshot.hasTableHeader === true &&
      snapshot.hasTableTail === true &&
      snapshot.hasDoneText === true &&
      snapshot.markdownTableRendered === true &&
      snapshot.overflowCommitted === true &&
      snapshot.scrollAnchorStable === true &&
      snapshot.firstTextBeforeOverflow === true &&
      snapshot.firstTextBeforeTableTail === true &&
      snapshot.firstTextBeforeDone === true &&
      snapshot.textareaVisible === true &&
      snapshot.textareaDisabled === false &&
      snapshot.stopButtonVisible === false &&
      snapshot.startupNoteVisible === false
    ) {
      return snapshot;
    }
    await sleep(options.intervalMs);
  }
  throw new Error(
    `Claw GUI 未完成 live-tail visual oracle: ${JSON.stringify(
      sanitizeJson(lastSnapshot),
    )}`,
  );
}

export async function runLiveTailCommitScenario({
  page,
  options,
  appServerRequests,
  runtimeEnv,
  logStage,
}) {
  const result = {};

  logStage("send-live-tail-commit-prompt-from-gui");
  result.liveTailCommitInputSend = sanitizeJson(
    await sendPromptFromGui(page, options, LIVE_TAIL_COMMIT_PROMPT),
  );

  logStage("wait-live-tail-commit-backend-turn-start");
  const backendTurnStart = await waitForBackendLedgerEntry(
    runtimeEnv.backendLedgerPath,
    (entry) =>
      entry.kind === "turnStart" && entry.inputText === LIVE_TAIL_COMMIT_PROMPT,
    options,
  );
  result.liveTailCommitBackendTurnStart = sanitizeJson({
    sessionId: backendTurnStart.entry.sessionId,
    turnId: backendTurnStart.entry.turnId,
    inputText: backendTurnStart.entry.inputText,
    ledgerCount: backendTurnStart.ledger.length,
  });

  logStage("wait-gui-live-tail-first-visible-before-commit");
  result.guiLiveTailFirstVisibleBeforeCommit = sanitizeJson(
    await waitForGuiLiveTailFirstVisibleBeforeCommit(page, options),
  );

  logStage("wait-gui-live-tail-completed");
  result.guiLiveTailCompleted = sanitizeJson(
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

  logStage("wait-gui-live-tail-visual-oracle");
  result.guiLiveTailVisualOracle = sanitizeJson(
    await waitForGuiLiveTailVisualOracle(page, options),
  );

  logStage("wait-read-model-live-tail-completed");
  const readModelLiveTailCommitCompleted = await waitForSessionReadCompleted(
    page,
    options,
    appServerRequests,
    {
      prompt: LIVE_TAIL_COMMIT_PROMPT,
      doneText: LIVE_TAIL_COMMIT_DONE_TEXT,
      summaryText: LIVE_TAIL_COMMIT_FIRST_TEXT,
    },
  );
  result.readModelLiveTailCommitCompleted = sanitizeJson(
    summarizeLiveTailCommitReadModel(readModelLiveTailCommitCompleted),
  );

  const liveTailLedger = await waitForBackendLedgerEntry(
    runtimeEnv.backendLedgerPath,
    (entry) => entry.kind === "liveTailCommitCompleted",
    options,
  );
  result.liveTailCommitBackendCompleted = sanitizeJson({
    eventType: liveTailLedger.entry.eventType,
    turnId: liveTailLedger.entry.turnId,
    firstText: liveTailLedger.entry.firstText,
    overflowMarker: liveTailLedger.entry.overflowMarker,
    tableHeader: liveTailLedger.entry.tableHeader,
    tableTail: liveTailLedger.entry.tableTail,
    ledgerCount: liveTailLedger.ledger.length,
  });

  return result;
}
