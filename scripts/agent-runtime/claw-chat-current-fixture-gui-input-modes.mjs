import { waitForInputReady } from "./claw-chat-current-fixture-gui-actions.mjs";
import { evaluatePageSnapshot } from "./claw-chat-current-fixture-rpc.mjs";
import { assert, sanitizeJson, sleep } from "./claw-chat-current-fixture-utils.mjs";

export async function enableInputbarPlusModeFromGui(
  page,
  options,
  { label, menuTestId, statusTestId, statusText },
) {
  await waitForInputReady(page, options);
  await page.locator('textarea[name="agent-chat-message"]').first().focus();
  const opened = await page.evaluate(() => {
    const directTrigger = document.querySelector(
      '[data-testid="inputbar-plus-trigger"]',
    );
    if (directTrigger instanceof HTMLElement) {
      directTrigger.click();
      return { clicked: true, method: "testid" };
    }

    const buttons = Array.from(document.querySelectorAll("button"));
    const trigger = buttons.find((button) => {
      const label = [
        button.getAttribute("data-testid") || "",
        button.getAttribute("aria-label") || "",
        button.getAttribute("title") || "",
        button.textContent || "",
      ].join("\n");
      return (
        label.includes("inputbar-plus-trigger") ||
        label.includes("更多") ||
        label.includes("添加") ||
        /\bMore\b/i.test(label)
      );
    });
    if (trigger instanceof HTMLElement) {
      trigger.click();
      return { clicked: true, method: "label" };
    }
    return {
      clicked: false,
      buttons: buttons.map((button) => ({
        testId: button.getAttribute("data-testid") || "",
        aria: button.getAttribute("aria-label") || "",
        title: button.getAttribute("title") || "",
        text: button.textContent || "",
        disabled: button.disabled,
      })),
    };
  });
  assert(
    opened?.clicked,
    `未找到输入区更多菜单按钮，无法切换 ${label}: ${JSON.stringify(
      sanitizeJson(opened),
    )}`,
  );

  const startedAt = Date.now();
  let lastSnapshot = null;
  let clickedModeButton = false;
  while (Date.now() - startedAt < options.timeoutMs) {
    const snapshot = await evaluatePageSnapshot(page, ({ menuTestId, statusTestId }) => {
      const menu = document.querySelector('[data-testid="inputbar-plus-menu"]');
      const modeButton = document.querySelector(`[data-testid="${menuTestId}"]`);
      const statusChip = statusTestId
        ? document.querySelector(`[data-testid="${statusTestId}"]`)
        : null;
      return {
        menuVisible: Boolean(menu),
        modeButtonVisible: Boolean(modeButton),
        statusChipVisible: Boolean(statusChip),
        statusText: statusChip?.textContent || "",
        bodyText: document.body?.innerText || "",
      };
    }, { menuTestId, statusTestId });
    lastSnapshot = snapshot;
    if (snapshot?.modeButtonVisible) {
      await page.locator(`[data-testid="${menuTestId}"]`).click();
      clickedModeButton = true;
      break;
    }
    await sleep(options.intervalMs);
  }
  assert(
    clickedModeButton,
    `未找到 ${label} 菜单项: ${JSON.stringify(sanitizeJson(lastSnapshot))}`,
  );

  const enabledStartedAt = Date.now();
  const enabledTimeoutMs = Math.max(
    options.intervalMs,
    options.timeoutMs - (enabledStartedAt - startedAt),
  );
  while (Date.now() - enabledStartedAt < enabledTimeoutMs) {
    const snapshot = await evaluatePageSnapshot(page, ({ statusTestId, statusText }) => {
      const statusChip = statusTestId
        ? document.querySelector(`[data-testid="${statusTestId}"]`)
        : null;
      return {
        statusChipVisible: Boolean(statusChip),
        statusText: statusChip?.textContent || "",
        bodyText: document.body?.innerText || "",
      };
    }, { statusTestId, statusText });
    const hasExpectedText =
      !statusText ||
      snapshot?.statusText?.includes(statusText) ||
      snapshot?.bodyText?.includes(statusText);
    if (snapshot?.statusChipVisible && hasExpectedText) {
      return sanitizeJson(snapshot);
    }
    lastSnapshot = snapshot;
    await sleep(options.intervalMs);
  }

  throw new Error(
    `${label} 未在输入区启用: ${JSON.stringify(sanitizeJson(lastSnapshot))}`,
  );
}

export async function enablePlanModeFromGui(page, options) {
  return await enableInputbarPlusModeFromGui(page, options, {
    label: "Plan mode",
    menuTestId: "inputbar-plus-plan-mode",
    statusTestId: "inputbar-task-mode-status",
    statusText: "",
  });
}

export async function enableGoalModeFromGui(page, options) {
  return await enableInputbarPlusModeFromGui(page, options, {
    label: "追求目标",
    menuTestId: "inputbar-plus-objective",
    statusTestId: "inputbar-objective-status",
    statusText: "追求目标",
  });
}
