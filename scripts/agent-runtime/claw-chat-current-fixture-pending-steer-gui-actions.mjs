import {
  INPUTBAR_PENDING_STEER_ACTIVE_OUTPUT_TEXT,
  INPUTBAR_PENDING_STEER_SECOND_PROMPT,
  INPUTBAR_RICH_RESTORE_PROMPT,
} from "./claw-chat-current-fixture-constants.mjs";
import { waitForInputReady } from "./claw-chat-current-fixture-gui-actions.mjs";
import {
  reloadRendererDocument,
  waitForRendererReady,
} from "./claw-chat-current-fixture-rpc.mjs";
import { waitForRichRestoreSnapshot } from "./claw-chat-current-fixture-inputbar-rich-restore.mjs";
import {
  assert,
  sanitizeJson,
  sleep,
} from "./claw-chat-current-fixture-utils.mjs";

const DEFER_BUTTON_LABELS = [
  "稍后处理",
  "稍後處理",
  "Handle later",
  "あとで処理",
  "나중에 처리",
];

async function clickPendingSteerDeferButton(
  page,
  options,
  {
    prompt,
    requireRichDraft = false,
    readyLabel = "Inputbar pending steer 稍后处理按钮未就绪",
  },
) {
  const beforeClick = await waitForRichRestoreSnapshot(
    page,
    options,
    (snapshot) =>
      snapshot.textareaValue === prompt &&
      (!requireRichDraft ||
        (snapshot.imageRestored === true &&
          snapshot.pathRestored === true &&
          snapshot.skillRestored === true)) &&
      snapshot.deferButtonExists === true &&
      snapshot.deferButtonDisabled === false &&
      snapshot.stopButtonVisible === true,
    readyLabel,
  );
  const clicked = await page.evaluate(
    ({ labels, sessionId }) => {
      const textarea =
        Array.from(
          document.querySelectorAll('textarea[name="agent-chat-message"]'),
        ).find(
          (node) =>
            node instanceof HTMLTextAreaElement &&
            node.dataset.sessionId === sessionId,
        ) ?? document.querySelector('textarea[name="agent-chat-message"]');
      const container = textarea?.closest(
        '[data-testid="inputbar-core-container"]',
      );
      const buttons = Array.from(container?.querySelectorAll("button") || []);
      const target = buttons.find((button) => {
        const labelText = [
          button.getAttribute("title") || "",
          button.textContent || "",
          button.getAttribute("aria-label") || "",
        ].join("\n");
        return labels.some((label) => labelText.includes(label));
      });
      if (!(target instanceof HTMLButtonElement)) {
        return {
          clicked: false,
          reason: "missing-defer-button",
          labels: buttons.map((button) =>
            [
              button.getAttribute("title") || "",
              button.textContent || "",
              button.getAttribute("aria-label") || "",
            ]
              .filter(Boolean)
              .join(" "),
          ),
        };
      }
      if (target.disabled) {
        return {
          clicked: false,
          reason: "defer-button-disabled",
          label:
            target.getAttribute("aria-label") ||
            target.getAttribute("title") ||
            target.textContent ||
            "",
        };
      }
      target.click();
      return {
        clicked: true,
        label:
          target.getAttribute("aria-label") ||
          target.getAttribute("title") ||
          target.textContent ||
          "",
      };
    },
    {
      labels: DEFER_BUTTON_LABELS,
      sessionId: beforeClick.textareaSessionId,
    },
  );
  assert(
    clicked?.clicked === true,
    `Inputbar pending steer 稍后处理点击失败: ${JSON.stringify(
      sanitizeJson(clicked),
    )}`,
  );
  return sanitizeJson({
    afterFill: {
      promptVisibleInTextarea: beforeClick.textareaValue === prompt,
      deferButtonExists: beforeClick.deferButtonExists,
      deferButtonDisabled: beforeClick.deferButtonDisabled,
      deferButtonLabel: beforeClick.deferButtonLabel,
      stopButtonVisible: beforeClick.stopButtonVisible,
      visionWarningPolicy: beforeClick.visionWarningPolicy,
      visionWarningText: beforeClick.visionWarningText,
    },
    clicked,
  });
}

export async function clickRichRestoreDeferButton(page, options) {
  return await clickPendingSteerDeferButton(page, options, {
    prompt: INPUTBAR_RICH_RESTORE_PROMPT,
    requireRichDraft: true,
    readyLabel: "Inputbar pending steer rich 稍后处理按钮未就绪",
  });
}

export async function deferSecondPlainPendingSteer(page, options) {
  await waitForInputReady(page, options);
  const textarea = page.locator('textarea[name="agent-chat-message"]').first();
  await textarea.fill(INPUTBAR_PENDING_STEER_SECOND_PROMPT);
  return await clickPendingSteerDeferButton(page, options, {
    prompt: INPUTBAR_PENDING_STEER_SECOND_PROMPT,
    readyLabel: "第二个 Inputbar pending steer 稍后处理按钮未就绪",
  });
}

async function evaluateInputbarQueuedTurnsPanel(page) {
  return await page.evaluate(
    ({ activeOutputText, richPrompt, secondPrompt, sessionId }) => {
      const textarea =
        Array.from(
          document.querySelectorAll('textarea[name="agent-chat-message"]'),
        ).find(
          (node) =>
            node instanceof HTMLTextAreaElement &&
            node.dataset.sessionId === sessionId,
        ) ?? document.querySelector('textarea[name="agent-chat-message"]');
      const container =
        textarea?.closest('[data-testid="inputbar-core-container"]') ??
        document;
      const panel = container.querySelector(
        '[data-testid="inputbar-queued-turns-panel"]',
      );
      const rows = Array.from(
        panel?.querySelectorAll('[data-testid="inputbar-queued-turn"]') || [],
      ).map((row) => {
        const promoteButton = row.querySelector(
          '[data-testid="inputbar-queued-turn-promote"]',
        );
        const text = row.textContent || "";
        return {
          text,
          queuedTurnId:
            row instanceof HTMLElement
              ? row.dataset.queuedTurnId || null
              : null,
          position:
            row instanceof HTMLElement ? row.dataset.queuePosition || null : null,
          includesRichPrompt: text.includes(richPrompt),
          includesSecondPrompt: text.includes(secondPrompt),
          promoteButtonExists: Boolean(promoteButton),
          promoteButtonDisabled:
            promoteButton instanceof HTMLButtonElement
              ? promoteButton.disabled
              : null,
          promoteButtonLabel:
            promoteButton instanceof HTMLElement
              ? [
                  promoteButton.getAttribute("title") || "",
                  promoteButton.textContent || "",
                  promoteButton.getAttribute("aria-label") || "",
                ]
                  .filter(Boolean)
                  .join(" ")
              : null,
        };
      });
      const bodyText = document.body?.innerText || "";
      const turnGroups = Array.from(
        document.querySelectorAll('[data-testid="message-turn-group"]'),
      );
      const richTurnGroup = [...turnGroups]
        .reverse()
        .find((group) => (group.textContent || "").includes(richPrompt));
      const richTurnStatus =
        richTurnGroup?.getAttribute("data-runtime-turn-status") || null;
      const stopButtonVisible = Array.from(
        document.querySelectorAll("button"),
      ).some((button) => {
        const labelText = [
          button.getAttribute("title") || "",
          button.textContent || "",
          button.getAttribute("aria-label") || "",
        ].join("\n");
        return (
          button instanceof HTMLButtonElement &&
          !button.disabled &&
          (labelText.includes("停止") ||
            labelText.includes("终止") ||
            /\bStop\b/i.test(labelText))
        );
      });
      return {
        panelVisible: Boolean(panel),
        rowCount: rows.length,
        rows,
        richQueued: rows.some((row) => row.includesRichPrompt),
        secondQueued: rows.some((row) => row.includesSecondPrompt),
        secondPosition:
          rows.find((row) => row.includesSecondPrompt)?.position ?? null,
        bodyText,
        activeOutputVisible: bodyText.includes(activeOutputText),
        richPromptVisible: bodyText.includes(richPrompt),
        secondPromptVisible: bodyText.includes(secondPrompt),
        textareaVisible: textarea instanceof HTMLTextAreaElement,
        textareaDisabled:
          textarea instanceof HTMLTextAreaElement ? textarea.disabled : null,
        textareaSessionId:
          textarea instanceof HTMLTextAreaElement
            ? textarea.dataset.sessionId || null
            : null,
        richTurnId:
          richTurnGroup?.getAttribute("data-runtime-turn-id") || null,
        richTurnStatus,
        richTurnTerminal: [
          "aborted",
          "canceled",
          "cancelled",
          "completed",
          "failed",
          "interrupted",
        ].includes(String(richTurnStatus || "").toLowerCase()),
        stopButtonVisible,
      };
    },
    {
      activeOutputText: INPUTBAR_PENDING_STEER_ACTIVE_OUTPUT_TEXT,
      richPrompt: INPUTBAR_RICH_RESTORE_PROMPT,
      secondPrompt: INPUTBAR_PENDING_STEER_SECOND_PROMPT,
      sessionId: null,
    },
  );
}

export async function waitForInputbarQueuedTurnsPanel(
  page,
  options,
  predicate,
  label,
) {
  const startedAt = Date.now();
  let lastSnapshot = null;
  while (Date.now() - startedAt < options.timeoutMs) {
    const snapshot = await evaluateInputbarQueuedTurnsPanel(page);
    lastSnapshot = snapshot;
    if (await predicate(snapshot)) {
      return sanitizeJson(snapshot);
    }
    await sleep(options.intervalMs);
  }
  throw new Error(`${label}: ${JSON.stringify(sanitizeJson(lastSnapshot))}`);
}

export async function clickQueuedTurnPromoteButtonForPrompt(
  page,
  options,
  prompt,
) {
  const beforeClick = await waitForInputbarQueuedTurnsPanel(
    page,
    options,
    (snapshot) =>
      snapshot.panelVisible === true &&
      snapshot.rows.some(
        (row) =>
          row.text.includes(prompt) &&
          row.promoteButtonExists === true &&
          row.promoteButtonDisabled === false,
      ),
    "Inputbar queued turn 立即执行按钮未就绪",
  );
  const clicked = await page.evaluate(
    ({ targetPrompt, sessionId }) => {
      const textarea =
        Array.from(
          document.querySelectorAll('textarea[name="agent-chat-message"]'),
        ).find(
          (node) =>
            node instanceof HTMLTextAreaElement &&
            node.dataset.sessionId === sessionId,
        ) ?? document.querySelector('textarea[name="agent-chat-message"]');
      const container =
        textarea?.closest('[data-testid="inputbar-core-container"]') ??
        document;
      const rows = Array.from(
        container.querySelectorAll('[data-testid="inputbar-queued-turn"]'),
      );
      const row = rows.find((candidate) =>
        (candidate.textContent || "").includes(targetPrompt),
      );
      const button = row?.querySelector(
        '[data-testid="inputbar-queued-turn-promote"]',
      );
      if (!(button instanceof HTMLButtonElement)) {
        return {
          clicked: false,
          reason: "missing-promote-button",
          rowText: row?.textContent || null,
          scopedRowCount: rows.length,
          documentRowCount: document.querySelectorAll(
            '[data-testid="inputbar-queued-turn"]',
          ).length,
        };
      }
      if (button.disabled) {
        return {
          clicked: false,
          reason: "promote-button-disabled",
          rowText: row?.textContent || null,
          scopedRowCount: rows.length,
          actionAvailable: button.dataset.actionAvailable || null,
        };
      }
      button.click();
      return {
        clicked: true,
        queuedTurnId:
          row instanceof HTMLElement ? row.dataset.queuedTurnId || null : null,
        position:
          row instanceof HTMLElement ? row.dataset.queuePosition || null : null,
        label:
          button.getAttribute("aria-label") ||
          button.getAttribute("title") ||
          button.textContent ||
          "",
        scopedRowCount: rows.length,
        documentRowCount: document.querySelectorAll(
          '[data-testid="inputbar-queued-turn"]',
        ).length,
        actionAvailable: button.dataset.actionAvailable || null,
      };
    },
    { targetPrompt: prompt, sessionId: null },
  );
  assert(
    clicked?.clicked === true,
    `Inputbar queued turn 立即执行点击失败: ${JSON.stringify(
      sanitizeJson(clicked),
    )}`,
  );
  return sanitizeJson({
    beforeClick,
    clicked,
  });
}

export async function reloadAndWaitForPendingSteerQueuedHydrate(
  page,
  options,
  expectedRichTurnId,
) {
  const reload = await reloadRendererDocument(page, options);
  await waitForRendererReady(page, options);
  await waitForInputReady(page, options);
  const queuedPanel = await waitForInputbarQueuedTurnsPanel(
    page,
    options,
    (snapshot) =>
      snapshot.panelVisible === true &&
      snapshot.rowCount === 1 &&
      snapshot.secondQueued === true &&
      snapshot.richQueued === false &&
      snapshot.secondPosition === "0" &&
      snapshot.textareaVisible === true &&
      snapshot.textareaDisabled === false &&
      snapshot.richTurnId === expectedRichTurnId &&
      snapshot.richTurnTerminal === true &&
      snapshot.stopButtonVisible === false,
    "Inputbar pending steer reload 后未 hydrate 剩余第二条 queue",
  );
  return sanitizeJson({
    reload,
    queuedPanel,
  });
}
