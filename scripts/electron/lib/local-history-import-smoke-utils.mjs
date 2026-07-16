import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const APP_SERVER_HANDLE_JSON_LINES_COMMAND =
  "app_server_handle_json_lines";

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

export function sanitizeText(value) {
  const sanitized = String(value ?? "")
    .replace(
      /((?:api[_-]?key|authorization|password|secret|session|token)[^=\s]*=)(["']?)[^\s"']+/gi,
      "$1$2[redacted]",
    )
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, "$1[redacted]")
    .replace(/sk-[A-Za-z0-9._-]+/g, "sk-[redacted]");
  return sanitized.length > 2_000
    ? `${sanitized.slice(0, 2_000)}... [truncated ${
        sanitized.length - 2_000
      } chars]`
    : sanitized;
}

export function sanitizeJson(value, depth = 0) {
  if (depth > 8) {
    return "[truncated-depth]";
  }
  if (typeof value === "string") {
    return sanitizeText(value);
  }
  if (
    value === null ||
    value === undefined ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value ?? null;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 160).map((item) => sanitizeJson(item, depth + 1));
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 220)
        .map(([key, item]) => [key, sanitizeJson(item, depth + 1)]),
    );
  }
  return sanitizeText(String(value));
}

export function writeJsonFile(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

export function createTempRuntimeEnv(sourceRoot, prefix) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const home = path.join(tempRoot, "home");
  const xdgDataHome = path.join(tempRoot, "xdg-data");
  const localAppData = path.join(tempRoot, "local-app-data");
  const roamingAppData = path.join(tempRoot, "roaming-app-data");
  const electronUserDataDir = path.join(tempRoot, "electron-user-data");

  for (const dir of [
    home,
    xdgDataHome,
    localAppData,
    roamingAppData,
    electronUserDataDir,
  ]) {
    fs.mkdirSync(dir, { recursive: true });
  }

  return {
    tempRoot,
    electronUserDataDir,
    env: {
      ...process.env,
      HOME: home,
      XDG_DATA_HOME: xdgDataHome,
      APPDATA: roamingAppData,
      LOCALAPPDATA: localAppData,
      CODEX_HOME: sourceRoot,
    },
  };
}

function isTransientPageEvaluationError(error) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return (
    message.includes("Execution context was destroyed") ||
    message.includes("most likely because of a navigation") ||
    message.includes("Cannot find context with specified id")
  );
}

async function withOptionalTimeout(label, timeoutMs, operation) {
  if (typeof timeoutMs !== "number") {
    return await operation();
  }

  let timeoutHandle = null;
  try {
    return await Promise.race([
      operation(),
      new Promise((_, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new Error(`${label} timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutHandle !== null) {
      clearTimeout(timeoutHandle);
    }
  }
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

export async function waitForRendererReady(page, options, onSnapshot) {
  const startedAt = Date.now();
  const intervalMs =
    typeof options.intervalMs === "number" ? options.intervalMs : 250;
  while (Date.now() - startedAt < options.timeoutMs) {
    const snapshot = await evaluatePageSnapshot(page, () => ({
      url: window.location.href,
      title: document.title || "",
      electron: window.__LIME_ELECTRON__ === true,
      hasInvokeBridge: typeof window.electronAPI?.invoke === "function",
      supportsAppServer:
        typeof window.electronAPI?.supportsCommand === "function" &&
        window.electronAPI.supportsCommand("app_server_handle_json_lines"),
      startupVisible: Boolean(
        document.querySelector("[data-lime-startup-shell]"),
      ),
      appSidebarVisible: Boolean(
        document.querySelector('[data-testid="app-sidebar"]'),
      ),
      bodyTextLength: document.body?.innerText?.length || 0,
    }));
    if (!snapshot) {
      await sleep(intervalMs);
      continue;
    }
    onSnapshot?.(snapshot);
    if (
      snapshot.electron &&
      snapshot.hasInvokeBridge &&
      snapshot.supportsAppServer &&
      !snapshot.startupVisible &&
      snapshot.appSidebarVisible
    ) {
      return snapshot;
    }
    await sleep(intervalMs);
  }
  throw new Error("Electron renderer / App Server bridge 未就绪");
}

export async function invokeAppServerFromPage(
  page,
  method,
  params = {},
  options = {},
) {
  const startedAt = Date.now();
  const timeoutMs = options.timeoutMs;
  const intervalMs =
    typeof options.intervalMs === "number" ? options.intervalMs : 250;
  let lastTransientError = null;

  while (typeof timeoutMs !== "number" || Date.now() - startedAt < timeoutMs) {
    try {
      return await withOptionalTimeout(method, timeoutMs, () =>
        page.evaluate(
          async ({ command, idPrefix, method, params, timeoutMs }) => {
            const invoke = window.electronAPI?.invoke;
            if (typeof invoke !== "function") {
              throw new Error("Electron preload invoke bridge is unavailable");
            }
            const id = `${idPrefix}-${Date.now()}-${Math.random()}`;
            const response = await invoke(command, {
              request: {
                lines: [
                  JSON.stringify({
                    jsonrpc: "2.0",
                    id,
                    method,
                    params,
                  }),
                ],
                ...(typeof timeoutMs === "number" ? { timeoutMs } : {}),
              },
            });
            const messages = Array.isArray(response?.lines)
              ? response.lines
                  .map((line) => {
                    try {
                      return JSON.parse(line);
                    } catch {
                      return null;
                    }
                  })
                  .filter(Boolean)
              : [];
            const error = messages.find(
              (message) => message?.id === id && message.error,
            );
            if (error) {
              throw new Error(
                `${method} failed: ${JSON.stringify(error.error)}`,
              );
            }
            const result = messages.find(
              (message) =>
                message?.id === id &&
                Object.prototype.hasOwnProperty.call(message, "result"),
            );
            if (!result) {
              throw new Error(`${method} did not return a JSON-RPC result`);
            }
            return {
              result: result.result,
              messages,
            };
          },
          {
            command: APP_SERVER_HANDLE_JSON_LINES_COMMAND,
            idPrefix: options.idPrefix || "local-history-import-smoke",
            method,
            params,
            timeoutMs,
          },
        ),
      );
    } catch (error) {
      if (!isTransientPageEvaluationError(error)) {
        throw error;
      }
      lastTransientError = error;
      await sleep(intervalMs);
    }
  }

  throw new Error(
    `${method} failed after transient page navigation: ${
      lastTransientError instanceof Error
        ? lastTransientError.message
        : String(lastTransientError ?? "")
    }`,
  );
}

export async function initializeAppServer(page, clientInfo, capabilities) {
  const initialized = await invokeAppServerFromPage(
    page,
    "initialize",
    {
      clientInfo,
      capabilities,
    },
    { idPrefix: clientInfo.name },
  );
  await evaluatePageSnapshot(
    page,
    async (command) => {
      await window.electronAPI.invoke(command, {
        request: {
          lines: [JSON.stringify({ jsonrpc: "2.0", method: "initialized" })],
        },
      });
    },
    APP_SERVER_HANDLE_JSON_LINES_COMMAND,
  );
  return initialized.result;
}

export async function waitForUiSnapshot(
  page,
  options,
  predicate,
  failureLabel,
) {
  const startedAt = Date.now();
  let lastSnapshot = null;
  while (Date.now() - startedAt < options.timeoutMs) {
    const snapshot = await evaluatePageSnapshot(page, () => {
      const bodyText = document.body?.innerText || "";
      const textarea = document.querySelector(
        'textarea[name="agent-chat-message"]',
      );
      return {
        url: window.location.href,
        title: document.title || "",
        bodyText,
        bodyTextLength: bodyText.length,
        textareaVisible: textarea instanceof HTMLTextAreaElement,
        textareaDisabled:
          textarea instanceof HTMLTextAreaElement ? textarea.disabled : null,
        textareaSessionId:
          textarea instanceof HTMLTextAreaElement
            ? textarea.getAttribute("data-session-id")
            : null,
        sidebarVisible: Boolean(
          document.querySelector('[data-testid="app-sidebar"]'),
        ),
        conversationRows: Array.from(
          document.querySelectorAll(
            '[data-testid="app-sidebar-conversation-open"]',
          ),
        ).map((button) => ({
          title: button.getAttribute("title") || "",
          text: button.textContent || "",
        })),
      };
    });
    if (!snapshot) {
      await sleep(250);
      continue;
    }
    lastSnapshot = snapshot;
    if (predicate(snapshot)) {
      return snapshot;
    }
    await sleep(250);
  }
  throw new Error(
    `${failureLabel}: ${JSON.stringify(sanitizeJson(lastSnapshot))}`,
  );
}

function normalizeVisibleText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

export async function openSessionFromSidebar(page, options, target) {
  const normalizedTitle = normalizeVisibleText(target.title);
  await waitForUiSnapshot(
    page,
    options,
    (snapshot) =>
      snapshot.conversationRows.some((row) => {
        const candidate = normalizeVisibleText(`${row.title} ${row.text}`);
        return (
          candidate.includes(normalizedTitle) ||
          normalizedTitle.includes(candidate.slice(0, 24))
        );
      }),
    "侧边栏未出现目标会话",
  );

  const clicked = await evaluatePageSnapshot(
    page,
    ({ title }) => {
      const normalizedTitle = String(title || "")
        .replace(/\s+/g, " ")
        .trim();
      const buttons = Array.from(
        document.querySelectorAll(
          '[data-testid="app-sidebar-conversation-open"]',
        ),
      );
      const matched = buttons.find((button) => {
        const candidate = `${
          button.getAttribute("title") || ""
        } ${button.textContent || ""}`
          .replace(/\s+/g, " ")
          .trim();
        return (
          candidate.includes(normalizedTitle) ||
          normalizedTitle.includes(candidate.slice(0, 24))
        );
      });
      if (matched instanceof HTMLElement) {
        matched.click();
        return {
          clicked: true,
          title: matched.getAttribute("title") || "",
          text: matched.textContent || "",
        };
      }
      return {
        clicked: false,
        rows: buttons.map((button) => ({
          title: button.getAttribute("title") || "",
          text: button.textContent || "",
        })),
      };
    },
    target,
  );
  assert(
    clicked?.clicked,
    `未能点击目标会话: ${JSON.stringify(sanitizeJson(clicked))}`,
  );

  return await waitForUiSnapshot(
    page,
    options,
    (snapshot) =>
      snapshot.textareaVisible &&
      snapshot.textareaDisabled === false &&
      snapshot.textareaSessionId === target.sessionId,
    "会话页未进入目标 session",
  );
}

async function scrollMessageSurface(page, position) {
  return await evaluatePageSnapshot(
    page,
    (position) => {
      const candidates = Array.from(
        document.querySelectorAll(
          [
            '[data-testid="message-list-scroll-container"]',
            '[data-testid="message-list-column"]',
            '[data-testid="agent-message-list"]',
            '[data-testid="message-list"]',
            "main",
          ].join(","),
        ),
      ).filter((element) => element instanceof HTMLElement);
      const scrollTarget =
        candidates
          .map((element) => ({
            element,
            overflow: element.scrollHeight - element.clientHeight,
          }))
          .sort((left, right) => right.overflow - left.overflow)[0]?.element ||
        document.scrollingElement ||
        document.documentElement;
      const maxScroll = Math.max(
        scrollTarget.scrollHeight - scrollTarget.clientHeight,
        0,
      );
      if (position === "top") {
        scrollTarget.scrollTop = 0;
      } else if (position === "middle") {
        scrollTarget.scrollTop = Math.floor(maxScroll / 2);
      } else {
        scrollTarget.scrollTop = maxScroll;
      }
      return {
        position,
        maxScroll,
        scrollTop: scrollTarget.scrollTop,
        tagName: scrollTarget.tagName,
        testId: scrollTarget.getAttribute?.("data-testid") || null,
      };
    },
    position,
  );
}

export async function inspectImportedConversationVisualState(page, params) {
  const {
    viewport,
    position,
    sessionId,
    sessionTitle,
    forbiddenTokens,
    screenshotPath,
  } = params;
  const normalizedSessionTitle = normalizeVisibleText(sessionTitle).slice(
    0,
    24,
  );
  await page.setViewportSize({
    width: viewport.width,
    height: viewport.height,
  });
  await waitForUiSnapshot(
    page,
    params.options,
    (snapshot) => {
      const bodyText = normalizeVisibleText(snapshot.bodyText);
      const hasTargetTitle =
        !normalizedSessionTitle || bodyText.includes(normalizedSessionTitle);
      const hasMessageSurface = bodyText.length > 0;
      return hasTargetTitle && hasMessageSurface;
    },
    `${viewport.label}/${position} 视口目标 session 未稳定`,
  );
  let scroll = null;
  const scrollStartedAt = Date.now();
  while (!scroll && Date.now() - scrollStartedAt < params.options.timeoutMs) {
    scroll = await scrollMessageSurface(page, position);
    if (!scroll) {
      await sleep(250);
    }
  }
  assert(scroll, `${viewport.label}/${position} 视口无法滚动消息区域`);
  await sleep(350);
  let audit = null;
  const auditStartedAt = Date.now();
  while (!audit && Date.now() - auditStartedAt < params.options.timeoutMs) {
    audit = await evaluatePageSnapshot(
      page,
      ({ forbiddenTokens, normalizedSessionTitle }) => {
        const bodyText = document.body?.innerText || "";
        const textarea = document.querySelector(
          'textarea[name="agent-chat-message"]',
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
        const importedBanner = document.querySelector(
          '[data-testid="imported-source-banner"]',
        );
        const importedRunControl = document.querySelector(
          '[data-testid="task-center-run-control-imported"]',
        );
        const textareaRect =
          textarea instanceof HTMLElement
            ? textarea.getBoundingClientRect()
            : null;
        const messageRect =
          messageList instanceof HTMLElement
            ? messageList.getBoundingClientRect()
            : null;
        const viewportHeight = window.innerHeight;
        const leakedTokens = forbiddenTokens.filter((token) =>
          token ? bodyText.includes(token) : false,
        );
        return {
          bodyText,
          bodyTextLength: bodyText.length,
          textareaSessionId:
            textarea instanceof HTMLTextAreaElement
              ? textarea.getAttribute("data-session-id")
              : null,
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
          importedBannerVisible: Boolean(importedBanner),
          importedRunControlVisible: Boolean(importedRunControl),
          hasCommandExecutionVisible: Boolean(
            document.querySelector('[data-testid="tool-call-row"]'),
          ),
          hasPatchText:
            bodyText.includes("补丁") ||
            bodyText.includes("Patch") ||
            bodyText.includes("已编辑") ||
            (bodyText.includes("lib.rs") && bodyText.includes("打开文件")) ||
            bodyText.includes("文件变更"),
          hasSearchEvidence:
            bodyText.includes("搜索") ||
            bodyText.includes("Search") ||
            bodyText.includes("web search"),
          hasApprovalText:
            bodyText.includes("导入的权限记录") ||
            bodyText.includes("权限记录") ||
            bodyText.includes("审批") ||
            bodyText.includes("Approval"),
          leakedTokens,
          targetSessionVisible:
            (!normalizedSessionTitle ||
              bodyText
                .replace(/\s+/g, " ")
                .trim()
                .includes(normalizedSessionTitle)) && Boolean(messageList),
        };
      },
      { forbiddenTokens, normalizedSessionTitle },
    );
    if (!audit) {
      await sleep(250);
    }
  }
  assert(audit, `${viewport.label}/${position} 视口无法采集视觉审计快照`);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  return {
    label: `${viewport.label}:${position}`,
    viewport,
    position,
    scroll,
    screenshot: screenshotPath,
    ...audit,
    visibleTextCaptured: audit.bodyTextLength > 0,
    bodyText: undefined,
  };
}
