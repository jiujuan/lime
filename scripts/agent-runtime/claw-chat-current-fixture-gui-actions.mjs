export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

export function sanitizeJson(value, depth = 0) {
  if (depth > 6) {
    return "[truncated]";
  }
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 50).map((item) => sanitizeJson(item, depth + 1));
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      typeof item === "string" && item.length > 4000
        ? `${item.slice(0, 4000)}... [truncated ${item.length - 4000} chars]`
        : sanitizeJson(item, depth + 1),
    ]),
  );
}

function isTransientPageEvaluationError(error) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return (
    message.includes("Execution context was destroyed") ||
    message.includes("most likely because of a navigation") ||
    message.includes("Cannot find context with specified id")
  );
}

export async function evaluatePageSnapshot(page, pageFunction, arg) {
  try {
    return await page.evaluate(pageFunction, arg);
  } catch (error) {
    if (isTransientPageEvaluationError(error)) {
      return null;
    }
    throw error;
  }
}

function isTaskCenterHomeText(text) {
  return (
    text.includes("青柠一下，灵感即来") ||
    text.includes("你可以从这些任务开始") ||
    text.includes("向下滑，看看 Lime 可以帮你做什么")
  );
}

function escapeCssAttributeValue(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function buildInputSelector(expectedSessionId) {
  const baseSelector = 'textarea[name="agent-chat-message"]';
  if (!expectedSessionId) {
    return baseSelector;
  }
  return `${baseSelector}[data-session-id="${escapeCssAttributeValue(
    expectedSessionId,
  )}"]`;
}

function describeExpectedSession(expectedSessionId) {
  return expectedSessionId ? ` session=${expectedSessionId}` : "";
}

export async function waitForInputReady(page, options, constraints = {}) {
  const expectedSessionId = constraints.expectedSessionId ?? null;
  const startedAt = Date.now();
  let lastSnapshot = null;
  while (Date.now() - startedAt < options.timeoutMs) {
    const snapshot = await evaluatePageSnapshot(page, (sessionId) => {
      const candidates = Array.from(
        document.querySelectorAll('textarea[name="agent-chat-message"]'),
      ).filter(
        (node) =>
          node instanceof HTMLTextAreaElement &&
          (!sessionId || node.dataset.sessionId === sessionId),
      );
      const textarea =
        candidates.find((node) => {
          const rect = node.getBoundingClientRect();
          const style = window.getComputedStyle(node);
          return Boolean(
            rect &&
              rect.width > 16 &&
              rect.height > 16 &&
              style.visibility !== "hidden" &&
              style.display !== "none",
          );
        }) ??
        candidates[0] ??
        null;
      const rect = textarea?.getBoundingClientRect();
      const style = textarea ? window.getComputedStyle(textarea) : null;
      const visible = Boolean(
        textarea &&
          rect &&
          rect.width > 16 &&
          rect.height > 16 &&
          style?.visibility !== "hidden" &&
          style?.display !== "none",
      );
      const container = textarea?.closest(
        '[data-testid="inputbar-core-container"]',
      );
      return {
        url: window.location.href,
        expectedSessionId: sessionId,
        hasTextarea: Boolean(textarea),
        textareaCount: candidates.length,
        textareaSessionId:
          textarea instanceof HTMLTextAreaElement
            ? textarea.dataset.sessionId || null
            : null,
        textareaVisible: visible,
        textareaDisabled:
          textarea instanceof HTMLTextAreaElement ? textarea.disabled : null,
        textareaValue:
          textarea instanceof HTMLTextAreaElement ? textarea.value : null,
        hasInputbarCore: Boolean(container),
        sendButtonVisible: Boolean(
          container?.querySelector('[data-testid="send-btn"]'),
        ),
        bodyText: document.body?.innerText || "",
        mainText: document.querySelector("main")?.textContent || "",
      };
    }, expectedSessionId);
    if (!snapshot) {
      await sleep(options.intervalMs);
      continue;
    }
    lastSnapshot = snapshot;
    if (
      snapshot.hasTextarea &&
      snapshot.hasInputbarCore &&
      snapshot.textareaVisible &&
      snapshot.textareaDisabled === false &&
      (!expectedSessionId || snapshot.textareaSessionId === expectedSessionId) &&
      !snapshot.mainText.includes("最近对话") &&
      !snapshot.mainText.includes("正在恢复生成会话") &&
      !isTaskCenterHomeText(snapshot.mainText || "") &&
      !isTaskCenterHomeText(snapshot.bodyText || "")
    ) {
      return snapshot;
    }
    await sleep(options.intervalMs);
  }
  throw new Error(
    `Claw 输入框未就绪${describeExpectedSession(
      expectedSessionId,
    )}: ${JSON.stringify(sanitizeJson(lastSnapshot))}`,
  );
}

async function waitForControlledInputValue(
  page,
  prompt,
  timeoutMs,
  expectedSessionId = null,
) {
  await page.waitForFunction(
    ({ expectedPrompt, sessionId }) => {
      const input = Array.from(
        document.querySelectorAll('textarea[name="agent-chat-message"]'),
      ).find(
        (node) =>
          node instanceof HTMLTextAreaElement &&
          (!sessionId || node.dataset.sessionId === sessionId),
      );
      return input instanceof HTMLTextAreaElement && input.value === expectedPrompt;
    },
    { expectedPrompt: prompt, sessionId: expectedSessionId },
    { timeout: Math.min(timeoutMs, 10_000) },
  );
  await page.evaluate(
    () =>
      new Promise((resolve) => {
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(resolve);
        });
      }),
  );
}

async function waitForSendButtonReady(
  page,
  prompt,
  options,
  constraints = {},
) {
  const expectedSessionId = constraints.expectedSessionId ?? null;
  const selector =
    '[data-testid="inputbar-core-container"] [data-testid="send-btn"]';
  const startedAt = Date.now();
  let lastSnapshot = null;
  while (Date.now() - startedAt < Math.min(options.timeoutMs, 10_000)) {
    const snapshot = await evaluatePageSnapshot(
      page,
      ({ expectedPrompt, sendSelector, sessionId }) => {
        const input = Array.from(
          document.querySelectorAll('textarea[name="agent-chat-message"]'),
        ).find(
          (node) =>
            node instanceof HTMLTextAreaElement &&
            (!sessionId || node.dataset.sessionId === sessionId),
        );
        const container = input?.closest(
          '[data-testid="inputbar-core-container"]',
        );
        const sendButton = sessionId
          ? container?.querySelector('[data-testid="send-btn"]')
          : document.querySelector(sendSelector);
        const inputValue =
          input instanceof HTMLTextAreaElement ? input.value : null;
        return {
          expectedSessionId: sessionId,
          textareaSessionId:
            input instanceof HTMLTextAreaElement
              ? input.dataset.sessionId || null
              : null,
          inputValue,
          promptVisibleInTextarea: inputValue === expectedPrompt,
          sendButtonExists: Boolean(sendButton),
          sendButtonDisabled:
            sendButton instanceof HTMLButtonElement
              ? sendButton.disabled
              : null,
          sendButtonLabel:
            sendButton instanceof HTMLElement
              ? sendButton.getAttribute("aria-label") ||
                sendButton.getAttribute("title") ||
                sendButton.textContent ||
                "send"
              : null,
        };
      },
      {
        expectedPrompt: prompt,
        sendSelector: selector,
        sessionId: expectedSessionId,
      },
    );
    if (!snapshot) {
      await sleep(options.intervalMs);
      continue;
    }
    lastSnapshot = snapshot;
    if (
      snapshot.promptVisibleInTextarea &&
      snapshot.sendButtonExists &&
      snapshot.sendButtonDisabled === false &&
      (!expectedSessionId || snapshot.textareaSessionId === expectedSessionId)
    ) {
      return snapshot;
    }
    await sleep(options.intervalMs);
  }
  throw new Error(
    `输入栏发送按钮未进入可发送状态${describeExpectedSession(
      expectedSessionId,
    )}: ${JSON.stringify(
      sanitizeJson(lastSnapshot),
    )}`,
  );
}

async function clickInputbarSendButton(page, options, constraints = {}) {
  const expectedSessionId = constraints.expectedSessionId ?? null;
  const selector =
    '[data-testid="inputbar-core-container"] [data-testid="send-btn"]';
  const sendLocator = expectedSessionId
    ? page
        .locator(buildInputSelector(expectedSessionId))
        .locator(
          'xpath=ancestor::*[@data-testid="inputbar-core-container"][1]//*[@data-testid="send-btn"]',
        )
    : page.locator(selector).first();
  await sendLocator.waitFor({
    state: "visible",
    timeout: Math.min(options.timeoutMs, 10_000),
  });
  const beforeClick = await page.evaluate(({ sendSelector, sessionId }) => {
    const input = Array.from(
      document.querySelectorAll('textarea[name="agent-chat-message"]'),
    ).find(
      (node) =>
        node instanceof HTMLTextAreaElement &&
        (!sessionId || node.dataset.sessionId === sessionId),
    );
    const container = input?.closest('[data-testid="inputbar-core-container"]');
    const sendButton = sessionId
      ? container?.querySelector('[data-testid="send-btn"]')
      : document.querySelector(sendSelector);
    return {
      expectedSessionId: sessionId,
      textareaSessionId:
        input instanceof HTMLTextAreaElement
          ? input.dataset.sessionId || null
          : null,
      exists: Boolean(sendButton),
      disabled:
        sendButton instanceof HTMLButtonElement ? sendButton.disabled : null,
      label:
        sendButton instanceof HTMLElement
          ? sendButton.getAttribute("aria-label") ||
            sendButton.getAttribute("title") ||
            sendButton.textContent ||
            "send"
          : null,
    };
  }, { sendSelector: selector, sessionId: expectedSessionId });
  assert(
    beforeClick.exists &&
      beforeClick.disabled === false &&
      (!expectedSessionId ||
        beforeClick.textareaSessionId === expectedSessionId),
    `输入栏发送按钮不可用: ${JSON.stringify(sanitizeJson(beforeClick))}`,
  );
  await sendLocator.click();
  return {
    clicked: true,
    method: "inputbar-send-btn",
    disabledBeforeClick: beforeClick.disabled,
    label: beforeClick.label,
    sessionId: beforeClick.textareaSessionId,
  };
}

export async function sendPromptFromGui(page, options, prompt, constraints = {}) {
  const expectedSessionId = constraints.expectedSessionId ?? null;
  const before = await waitForInputReady(page, options, constraints);
  const textarea = expectedSessionId
    ? page.locator(buildInputSelector(expectedSessionId))
    : page.locator('textarea[name="agent-chat-message"]').first();
  await textarea.fill(prompt);
  await waitForControlledInputValue(
    page,
    prompt,
    options.timeoutMs,
    expectedSessionId,
  );
  const afterFill = await page.evaluate(({ expectedPrompt, sessionId }) => {
    const input = Array.from(
      document.querySelectorAll('textarea[name="agent-chat-message"]'),
    ).find(
      (node) =>
        node instanceof HTMLTextAreaElement &&
        (!sessionId || node.dataset.sessionId === sessionId),
    );
    return {
      expectedSessionId: sessionId,
      textareaSessionId:
        input instanceof HTMLTextAreaElement
          ? input.dataset.sessionId || null
          : null,
      value: input instanceof HTMLTextAreaElement ? input.value : null,
      promptVisibleInTextarea:
        input instanceof HTMLTextAreaElement
          ? input.value === expectedPrompt
          : false,
    };
  }, { expectedPrompt: prompt, sessionId: expectedSessionId });
  assert(
    afterFill.promptVisibleInTextarea &&
      (!expectedSessionId ||
        afterFill.textareaSessionId === expectedSessionId),
    `输入框未保留用户输入: ${JSON.stringify(sanitizeJson(afterFill))}`,
  );

  const sendReady = await waitForSendButtonReady(
    page,
    prompt,
    options,
    constraints,
  );
  const clicked = await clickInputbarSendButton(page, options, constraints);
  return {
    before,
    afterFill,
    sendReady,
    clicked,
  };
}
