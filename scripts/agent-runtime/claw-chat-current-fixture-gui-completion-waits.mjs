import {
  ASSISTANT_DONE_TEXT,
  NEWS_PROMPT,
  PLAN_DONE_TEXT,
  PLAN_PROMPT,
  PLAN_STEPS,
  SKILLS_RUNTIME_SCENARIO,
} from "./claw-chat-current-fixture-constants.mjs";
import { evaluatePageSnapshot } from "./claw-chat-current-fixture-rpc.mjs";
import { assert, sanitizeJson, sleep } from "./claw-chat-current-fixture-utils.mjs";

export function countTextOccurrences(text, needle) {
  if (!text || !needle) {
    return 0;
  }
  return text.split(needle).length - 1;
}

export async function waitForGuiChatCompleted(
  page,
  options,
  {
    prompt = NEWS_PROMPT,
    doneText = ASSISTANT_DONE_TEXT,
    summaryText = "今日国际新闻简要整理",
    requiredVisibleTexts,
    dedupeGuardTexts = [],
    disallowedVisibleTexts = ["legacy_tool_event"],
  } = {},
) {
  const startedAt = Date.now();
  let lastSnapshot = null;
  const requiredAssistantVisibleTexts =
    requiredVisibleTexts ??
    (prompt === NEWS_PROMPT && doneText === ASSISTANT_DONE_TEXT
      ? ["全球市场继续关注能源", "国际组织呼吁"]
      : []);
  while (Date.now() - startedAt < options.timeoutMs) {
    const snapshot = await evaluatePageSnapshot(
      page,
      ({
        prompt,
        doneText,
        summaryText,
        requiredAssistantVisibleTexts,
        dedupeGuardTexts,
        disallowedVisibleTexts,
      }) => {
        const text = document.body?.innerText || "";
        const mainText = document.querySelector("main")?.innerText || text;
        const textarea = document.querySelector(
          'textarea[name="agent-chat-message"]',
        );
        const rect = textarea?.getBoundingClientRect();
        const style = textarea ? window.getComputedStyle(textarea) : null;
        const textareaVisible = Boolean(
          textarea &&
          rect &&
          rect.width > 16 &&
          rect.height > 16 &&
          style?.visibility !== "hidden" &&
          style?.display !== "none",
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
        return {
          url: window.location.href,
          hasPrompt: text.includes(prompt),
          hasAssistantSummary: text.includes(summaryText),
          requiredVisibleTextHits: requiredAssistantVisibleTexts.map(
            (requiredText) => ({
              text: requiredText,
              occurrences: mainText.split(requiredText).length - 1,
            }),
          ),
          summaryOccurrences: text.split(summaryText).length - 1,
          mainSummaryOccurrences: mainText.split(summaryText).length - 1,
          dedupeGuardHits: dedupeGuardTexts.map((guardText) => ({
            text: guardText,
            occurrences: mainText.split(guardText).length - 1,
          })),
          disallowedVisibleTextHits: disallowedVisibleTexts.map(
            (guardText) => ({
              text: guardText,
              occurrences: mainText.split(guardText).length - 1,
            }),
          ),
          hasDoneText: text.includes(doneText),
          hasEpochFallbackTitle: text.includes("任务 1970/1/1"),
          textareaVisible,
          textareaDisabled:
            textarea instanceof HTMLTextAreaElement ? textarea.disabled : null,
          textareaValue:
            textarea instanceof HTMLTextAreaElement ? textarea.value : null,
          stopButtonVisible,
          hasMessageList: Boolean(
            document.querySelector('[data-testid="message-list"]') ||
            document.querySelector('[data-testid="message-list-frame"]'),
          ),
          bodyText: text,
          mainText,
        };
      },
      {
        prompt,
        doneText,
        summaryText,
        requiredAssistantVisibleTexts,
        dedupeGuardTexts,
        disallowedVisibleTexts,
      },
    );
    if (!snapshot) {
      await sleep(options.intervalMs);
      continue;
    }
    lastSnapshot = snapshot;
    const hasRequiredAssistantVisibleTexts =
      (snapshot.requiredVisibleTextHits || []).every(
        (hit) => hit.occurrences > 0,
      );
    const hasExpectedAssistantContent =
      requiredAssistantVisibleTexts.length > 0
        ? snapshot.hasAssistantSummary && hasRequiredAssistantVisibleTexts
        : snapshot.hasAssistantSummary || snapshot.hasDoneText;
    if (
      snapshot.hasPrompt &&
      hasExpectedAssistantContent &&
      snapshot.textareaVisible &&
      snapshot.textareaDisabled === false &&
      snapshot.stopButtonVisible === false &&
      (snapshot.dedupeGuardHits || []).every(
        (hit) => hit.occurrences <= 1,
      ) &&
      (snapshot.disallowedVisibleTextHits || []).every(
        (hit) => hit.occurrences === 0,
      )
    ) {
      return snapshot;
    }
    await sleep(options.intervalMs);
  }
  throw new Error(
    `Claw GUI 未完成输入闭环: ${JSON.stringify(sanitizeJson(lastSnapshot))}`,
  );
}

export async function waitForGuiSkillsRuntimeCompleted(
  page,
  options,
  scenario = SKILLS_RUNTIME_SCENARIO,
) {
  return await waitForGuiChatCompleted(page, options, {
    prompt: scenario.prompt,
    doneText: scenario.doneText,
    summaryText: scenario.guiSummaryText ?? scenario.summaryText,
    dedupeGuardTexts: scenario.dedupeGuardTexts ?? [],
  });
}

export async function waitForGuiPlanCompleted(page, options) {
  const startedAt = Date.now();
  let lastSnapshot = null;
  while (Date.now() - startedAt < options.timeoutMs) {
    const snapshot = await evaluatePageSnapshot(
      page,
      ({ prompt, doneText, planSteps }) => {
        const text = document.body?.innerText || "";
        const textarea = document.querySelector(
          'textarea[name="agent-chat-message"]',
        );
        const rect = textarea?.getBoundingClientRect();
        const style = textarea ? window.getComputedStyle(textarea) : null;
        const textareaVisible = Boolean(
          textarea &&
            rect &&
            rect.width > 16 &&
            rect.height > 16 &&
            style?.visibility !== "hidden" &&
            style?.display !== "none",
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
        const taskRailText =
          document
            .querySelector('[data-testid="task-center-run-control-surface"]')
            ?.textContent ||
          document
            .querySelector('[data-testid="task-center-task-rail"]')
            ?.textContent ||
          text;
        const planDecisionPanel = document.querySelector(
          '[data-testid="plan-composer-decision-panel"][data-layout="composer-drawer"]',
        );
        const planDecisionText = planDecisionPanel?.textContent || "";
        const planDecisionRect = planDecisionPanel?.getBoundingClientRect();
        const planDecisionStyle = planDecisionPanel
          ? window.getComputedStyle(planDecisionPanel)
          : null;
        const planDecisionVisible = Boolean(
          planDecisionPanel &&
            planDecisionRect &&
            planDecisionRect.width > 320 &&
            planDecisionRect.height > 48 &&
            planDecisionStyle?.visibility !== "hidden" &&
            planDecisionStyle?.display !== "none",
        );
        return {
          url: window.location.href,
          hasPrompt: text.includes(prompt),
          hasPlanIntro: text.includes("我先给出计划"),
          hasDoneText: text.includes(doneText),
          hasPlanSection: taskRailText.includes("计划"),
          hasAllPlanSteps: planSteps.every((step) =>
            taskRailText.includes(step.step),
          ),
          planStepHits: planSteps.map((step) => ({
            step: step.step,
            visible: taskRailText.includes(step.step),
          })),
          proposedPlanVisible: planSteps.every((step) =>
            taskRailText.includes(step.step),
          ),
          textareaVisible,
          textareaDisabled:
            textarea instanceof HTMLTextAreaElement ? textarea.disabled : null,
          textareaValue:
            textarea instanceof HTMLTextAreaElement ? textarea.value : null,
          stopButtonVisible,
          planDecisionVisible,
          planDecisionText,
          planDecisionHasTitle: planDecisionText.includes("实施此计划"),
          planDecisionHasAcceptOption:
            planDecisionText.includes("是，实施此计划"),
          planDecisionHasAdjustInput: Boolean(
            planDecisionPanel?.querySelector(
              '[data-testid="plan-composer-adjust-input"]',
            ),
          ),
          planDecisionHasEscHint: planDecisionText.includes("ESC"),
          bodyText: text,
          taskRailText,
        };
      },
      { prompt: PLAN_PROMPT, doneText: PLAN_DONE_TEXT, planSteps: PLAN_STEPS },
    );
    if (!snapshot) {
      await sleep(options.intervalMs);
      continue;
    }
    lastSnapshot = snapshot;
    if (
      snapshot.hasPrompt &&
      snapshot.hasAllPlanSteps &&
      snapshot.planDecisionVisible &&
      snapshot.planDecisionHasTitle &&
      snapshot.planDecisionHasAcceptOption &&
      snapshot.planDecisionHasAdjustInput &&
      snapshot.textareaVisible === false &&
      snapshot.stopButtonVisible === false
    ) {
      return sanitizeJson(snapshot);
    }
    await sleep(options.intervalMs);
  }
  throw new Error(
    `Claw GUI 未显示计划轨: ${JSON.stringify(sanitizeJson(lastSnapshot))}`,
  );
}

export async function waitForStopButtonVisibleAndClick(page, options) {
  const startedAt = Date.now();
  let lastSnapshot = null;
  while (Date.now() - startedAt < options.timeoutMs) {
    const snapshot = await evaluatePageSnapshot(
      page,
      ({ prompt }) => {
        const text = document.body?.innerText || "";
        const buttons = Array.from(document.querySelectorAll("button")).map(
          (button, index) => {
            const label = [
              button.getAttribute("title") || "",
              button.textContent || "",
              button.getAttribute("aria-label") || "",
            ].join("\n");
            return {
              index,
              label,
              disabled: button.disabled,
              visible: Boolean(
                button.offsetParent ||
                button.getClientRects().length > 0 ||
                window.getComputedStyle(button).position === "fixed",
              ),
              isStop:
                !button.disabled &&
                (label.includes("停止") ||
                  label.includes("终止") ||
                  /\bStop\b/i.test(label)),
            };
          },
        );
        return {
          url: window.location.href,
          hasPrompt: text.includes(prompt),
          hasAssistantSummary: text.includes("今日国际新闻简要整理"),
          stopButtons: buttons.filter((button) => button.isStop),
          buttonLabels: buttons
            .filter((button) => button.label.trim().length > 0)
            .slice(0, 80)
            .map((button) => button.label),
          bodyText: text,
        };
      },
      { prompt: NEWS_PROMPT },
    );
    if (!snapshot) {
      await sleep(options.intervalMs);
      continue;
    }
    lastSnapshot = snapshot;
    if (snapshot.stopButtons?.length > 0) {
      const clicked = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll("button"));
        const stopButton = buttons.find((button) => {
          const label = [
            button.getAttribute("title") || "",
            button.textContent || "",
            button.getAttribute("aria-label") || "",
          ].join("\n");
          return (
            !button.disabled &&
            (label.includes("停止") ||
              label.includes("终止") ||
              /\bStop\b/i.test(label))
          );
        });
        if (stopButton instanceof HTMLElement) {
          stopButton.click();
          return {
            clicked: true,
            label:
              stopButton.getAttribute("aria-label") ||
              stopButton.getAttribute("title") ||
              stopButton.textContent ||
              "stop",
          };
        }
        return { clicked: false };
      });
      assert(
        clicked?.clicked,
        `停止按钮出现但点击失败: ${JSON.stringify(sanitizeJson(clicked))}`,
      );
      return {
        beforeClick: sanitizeJson(snapshot),
        clicked: sanitizeJson(clicked),
      };
    }
    await sleep(options.intervalMs);
  }
  throw new Error(
    `Claw GUI 未出现停止按钮: ${JSON.stringify(sanitizeJson(lastSnapshot))}`,
  );
}

export async function waitForGuiChatCanceled(page, options) {
  const startedAt = Date.now();
  let lastSnapshot = null;
  while (Date.now() - startedAt < options.timeoutMs) {
    const snapshot = await evaluatePageSnapshot(
      page,
      ({ prompt }) => {
        const text = document.body?.innerText || "";
        const textarea = document.querySelector(
          'textarea[name="agent-chat-message"]',
        );
        const rect = textarea?.getBoundingClientRect();
        const style = textarea ? window.getComputedStyle(textarea) : null;
        const textareaVisible = Boolean(
          textarea &&
          rect &&
          rect.width > 16 &&
          rect.height > 16 &&
          style?.visibility !== "hidden" &&
          style?.display !== "none",
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
        return {
          url: window.location.href,
          hasPrompt: text.includes(prompt),
          hasAssistantSummary: text.includes("今日国际新闻简要整理"),
          hasStoppedCopy:
            text.includes("已停止") ||
            text.includes("本轮已中止") ||
            /\bStopped\b/i.test(text) ||
            /\bCanceled\b/i.test(text),
          textareaVisible,
          textareaDisabled:
            textarea instanceof HTMLTextAreaElement ? textarea.disabled : null,
          textareaValue:
            textarea instanceof HTMLTextAreaElement ? textarea.value : null,
          stopButtonVisible,
          bodyText: text,
        };
      },
      { prompt: NEWS_PROMPT },
    );
    if (!snapshot) {
      await sleep(options.intervalMs);
      continue;
    }
    lastSnapshot = snapshot;
    if (
      snapshot.hasPrompt &&
      snapshot.textareaVisible &&
      snapshot.textareaDisabled === false &&
      snapshot.stopButtonVisible === false
    ) {
      return snapshot;
    }
    await sleep(options.intervalMs);
  }
  throw new Error(
    `Claw GUI 未完成取消闭环: ${JSON.stringify(sanitizeJson(lastSnapshot))}`,
  );
}
