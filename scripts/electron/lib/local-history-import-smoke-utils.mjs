import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { marked } from "marked";
import { inspectConversationChromeLayout } from "./local-history-import-layout-audit.mjs";
import { openImportedSessionFromSidebar } from "./local-history-import-session-open.mjs";
import { assessExpectedMessageVisibility } from "./local-history-import-visual-expectations.mjs";
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
export function renderExpectedVisibleExcerptHtml(markdownValues) {
  return markdownValues.map((value) =>
    marked.parse(String(value ?? ""), { async: false }),
  );
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
export async function waitForConversationImportJob(
  page,
  initialJob,
  options = {},
) {
  assert(initialJob?.jobId, "导入启动结果缺少 jobId");
  const timeoutMs =
    typeof options.timeoutMs === "number" ? options.timeoutMs : 30 * 60_000;
  const intervalMs =
    typeof options.intervalMs === "number" ? options.intervalMs : 250;
  const startedAt = Date.now();
  let job = initialJob;
  while (Date.now() - startedAt < timeoutMs) {
    options.onProgress?.(job);
    if (job.status === "completed") {
      assert(
        job.result?.session?.sessionId,
        "导入完成但缺少 canonical session result",
      );
      return job.result;
    }
    if (job.status === "failed") {
      throw new Error(job.error || "后台导入失败");
    }
    await sleep(intervalMs);
    const response = await invokeAppServerFromPage(
      page,
      "conversationImport/job/read",
      { jobId: job.jobId },
      {
        idPrefix: options.idPrefix || "conversation-import-job",
        timeoutMs: Math.min(30_000, timeoutMs),
      },
    );
    job = response.result?.job;
    assert(
      job?.jobId === initialJob.jobId,
      "导入 job/read 返回了错误的 job identity",
    );
  }
  throw new Error(`后台导入超时: ${initialJob.jobId}`);
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
      const messageContent =
        document.querySelector('[data-testid="message-list-column"]') ||
        document.querySelector('[data-testid="message-list"]');
      const messageListFrame = document.querySelector(
        '[data-testid="message-list-frame"]',
      );
      const messageContentText = messageContent?.innerText || "";
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
        messageListSessionId:
          messageListFrame?.getAttribute("data-session-id") || null,
        planDecisionVisible: Boolean(
          document.querySelector(
            '[data-testid="plan-decision-inputbar-replacement"]',
          ),
        ),
        approvalReplacementVisible: Boolean(
          document.querySelector(
            '[data-testid="inputbar-approval-replacement"]',
          ),
        ),
        messageContentTextLength: messageContentText.trim().length,
        messageContentChildCount:
          messageContent instanceof HTMLElement
            ? messageContent.childElementCount
            : 0,
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
export async function openSessionFromSidebar(page, options, target) {
  return await openImportedSessionFromSidebar(page, options, target, {
    assert,
    evaluatePageSnapshot,
    sanitizeJson,
    waitForUiSnapshot,
  });
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
async function expandCanonicalTimelineDetails(page) {
  const messageContent = page.locator('[data-testid="message-list-column"]');
  const selectors = [
    '[data-testid^="message-list-historical-timeline-preview:"]',
    '[data-testid="message-list-long-history-preview"] button',
    '[data-testid="message-list-historical-assistant-preview"] button',
    '[data-testid="timeline-file-attachment-list-toggle"][aria-expanded="false"]',
    '[data-testid="file-changes-summary-toggle"][aria-expanded="false"]',
    'details[data-testid^="agent-thread-block:"]:not([open]) > summary',
  ];
  let clickedCount = 0;
  for (let pass = 0; pass < 200; pass += 1) {
    let clickedInPass = false;
    for (const selector of selectors) {
      const controls = messageContent.locator(selector);
      const controlCount = await controls.count();
      for (let index = 0; index < controlCount; index += 1) {
        const control = controls.nth(index);
        if (!(await control.isVisible().catch(() => false))) {
          continue;
        }
        await control.click();
        clickedCount += 1;
        clickedInPass = true;
        await sleep(25);
        break;
      }
      if (clickedInPass) {
        break;
      }
    }
    if (!clickedInPass) {
      return clickedCount;
    }
  }
  throw new Error("canonical timeline 展开次数超过安全上限");
}
export async function captureImportedConversationCompactVisualState(
  page,
  params,
) {
  const {
    viewport,
    position,
    sessionId,
    expectedExcerptHtml,
    expectedMessages,
    screenshotPath,
  } = params;
  await page.setViewportSize({
    width: viewport.width,
    height: viewport.height,
  });
  await waitForUiSnapshot(
    page,
    params.options,
    (snapshot) =>
      snapshot.textareaSessionId === sessionId &&
      snapshot.messageContentTextLength > 0 &&
      snapshot.messageContentChildCount > 0,
    `${viewport.label}/${position} 紧凑视口目标 session 未稳定`,
  );
  const scroll = await scrollMessageSurface(page, position);
  assert(scroll, `${viewport.label}/${position} 紧凑视口无法滚动消息区域`);
  const auditTimeoutMs =
    typeof params.options.previewTimeoutMs === "number"
      ? params.options.previewTimeoutMs
      : params.options.timeoutMs;
  const auditStartedAt = Date.now();
  let audit = null;
  let latestAudit = null;
  while (!audit && Date.now() - auditStartedAt < auditTimeoutMs) {
    const candidateSnapshot = await evaluatePageSnapshot(
      page,
      ({ expectedExcerptHtml, expectedMessages, sessionId }) => {
        const messageContent = document.querySelector(
          '[data-testid="message-list-column"]',
        );
        const textarea = document.querySelector(
          'textarea[name="agent-chat-message"]',
        );
        const messageText = (messageContent?.innerText || "")
          .replace(/\s+/g, " ")
          .trim();
        const expectedVisibleMessages = expectedExcerptHtml
          .map((html, index) => {
            const parsed = new DOMParser().parseFromString(
              String(html),
              "text/html",
            );
            const excerpt = (parsed.body?.textContent || "")
              .replace(/\s+/g, " ")
              .trim()
              .slice(0, 80);
            return {
              ...(expectedMessages[index] || {}),
              excerpt,
            };
          })
          .filter((message) => message.excerpt.length > 0);
        const textareaRect =
          textarea instanceof HTMLElement
            ? textarea.getBoundingClientRect()
            : null;
        const messageRect =
          messageContent instanceof HTMLElement
            ? messageContent.getBoundingClientRect()
            : null;
        const turnGroups = Array.from(
          messageContent?.querySelectorAll(
            '[data-testid="message-turn-group"]',
          ) || [],
        );
        const visibleAgentMessageTextById = Object.fromEntries(
          Array.from(
            messageContent?.querySelectorAll(
              '[data-testid="agent-message-text-part"][data-thread-item-id]',
            ) || [],
          ).map((element) => [
            element.getAttribute("data-thread-item-id"),
            {
              text: (element.textContent || "")
                .replace(/\s+/g, " ")
                .trim()
                .slice(0, 160),
              visible: Boolean(
                element.querySelector("*")?.getClientRects().length,
              ),
              collapsed: Boolean(element.closest("details:not([open])")),
            },
          ]),
        );
        return {
          textareaSessionId:
            textarea instanceof HTMLTextAreaElement
              ? textarea.getAttribute("data-session-id")
              : null,
          inputbarVisible: Boolean(
            textareaRect &&
            textareaRect.width > 120 &&
            textareaRect.height >= 24 &&
            textareaRect.bottom > 0 &&
            textareaRect.top < window.innerHeight,
          ),
          inputbarOccludesMainContent:
            Boolean(textareaRect && messageRect) &&
            textareaRect.top < messageRect.top + 80,
          messageContentTextLength: messageText.length,
          historicalTimelinePreviewCount:
            messageContent?.querySelectorAll(
              '[data-testid^="message-list-historical-timeline-preview:"]',
            ).length || 0,
          toolCallRowCount:
            messageContent?.querySelectorAll('[data-testid="tool-call-row"]')
              .length || 0,
          turnGroups: turnGroups.map((group) => ({
            runtimeTurnId: group.getAttribute("data-runtime-turn-id") || null,
            runtimeTurnStatus:
              group.getAttribute("data-runtime-turn-status") || null,
            assistantMessageCount: group.querySelectorAll(
              '[data-message-role="assistant"]',
            ).length,
            toolCallRowCount: group.querySelectorAll(
              '[data-testid="tool-call-row"]',
            ).length,
            historicalTimelinePreviewCount: group.querySelectorAll(
              '[data-testid^="message-list-historical-timeline-preview:"]',
            ).length,
          })),
          expectedVisibleMessages,
          messageComparableText: messageText,
          visibleAgentMessageTextById,
          hasRawContentPartJson:
            messageText.includes('"type":"input_text"') ||
            messageText.includes('"type": "input_text"'),
          targetSessionVisible:
            textarea instanceof HTMLTextAreaElement &&
            textarea.getAttribute("data-session-id") === sessionId,
        };
      },
      { expectedExcerptHtml, expectedMessages, sessionId },
    );
    const candidate = assessExpectedMessageVisibility(candidateSnapshot);
    latestAudit = candidate || latestAudit;
    if (
      candidate?.targetSessionVisible &&
      candidate.missingExpectedExcerpts.length === 0
    ) {
      audit = candidate;
      break;
    }
    await sleep(250);
  }
  audit = audit || latestAudit;
  assert(audit, `${viewport.label}/${position} 紧凑视口无法读取 DOM`);
  await page.screenshot({
    path: screenshotPath,
    fullPage: false,
    timeout: 30_000,
  });

  return {
    label: `${viewport.label}:${position}`,
    viewport,
    position,
    scroll,
    layout: await inspectConversationChromeLayout(page),
    screenshot: screenshotPath,
    ...audit,
  };
}

export async function inspectImportedConversationVisualState(page, params) {
  const {
    viewport,
    position,
    sessionId,
    expectedExcerptHtml,
    expectedMessages,
    expectedCounts,
    screenshotPath,
  } = params;
  await page.setViewportSize({
    width: viewport.width,
    height: viewport.height,
  });
  await waitForUiSnapshot(
    page,
    params.options,
    (snapshot) => {
      return (
        snapshot.textareaSessionId === sessionId &&
        snapshot.messageContentTextLength > 0 &&
        snapshot.messageContentChildCount > 0
      );
    },
    `${viewport.label}/${position} 视口目标 session 未稳定`,
  );
  const expandedTimelineDetailsCount =
    (await expandCanonicalTimelineDetails(page)) ?? 0;
  let scroll = null;
  const scrollStartedAt = Date.now();
  while (!scroll && Date.now() - scrollStartedAt < params.options.timeoutMs) {
    scroll = await scrollMessageSurface(page, position);
    if (!scroll) {
      await sleep(250);
    }
  }
  assert(scroll, `${viewport.label}/${position} 视口无法滚动消息区域`);
  let audit = null;
  let latestAudit = null;
  const auditStartedAt = Date.now();
  const auditTimeoutMs =
    typeof params.options.previewTimeoutMs === "number"
      ? params.options.previewTimeoutMs
      : params.options.timeoutMs;
  while (!audit && Date.now() - auditStartedAt < auditTimeoutMs) {
    const auditSnapshot = await evaluatePageSnapshot(
      page,
      ({ expectedExcerptHtml, expectedMessages, sessionId }) => {
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
        const messageContent =
          document.querySelector('[data-testid="message-list-column"]') ||
          messageList;
        const messageContentText = messageContent?.innerText || "";
        const messageContentTextLength = messageContentText.trim().length;
        const messageContentChildCount =
          messageContent instanceof HTMLElement
            ? messageContent.childElementCount
            : 0;
        const importedBanner = document.querySelector(
          '[data-testid="imported-source-banner"]',
        );
        const importedRunControl = document.querySelector(
          '[data-testid="task-center-run-control-imported"]',
        );
        const sourceMetadataUi = document.querySelector(
          [
            '[data-testid="imported-source-metadata"]',
            '[data-testid="source-provenance"]',
            '[data-testid="source-thread-id"]',
            '[data-testid="source-path"]',
            "[data-source-provenance]",
          ].join(","),
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
        const normalizedMessageContentText = messageContentText
          .replace(/\s+/g, " ")
          .trim();
        const expectedVisibleMessages = expectedExcerptHtml
          .map((html, index) => {
            const parsed = new DOMParser().parseFromString(
              String(html),
              "text/html",
            );
            const excerpt = (parsed.body?.textContent || "")
              .replace(/\s+/g, " ")
              .trim()
              .slice(0, 80);
            return {
              ...(expectedMessages[index] || {}),
              excerpt,
            };
          })
          .filter((message) => message.excerpt.length > 0);
        const imageAttachmentCount = Array.from(
          messageContent?.querySelectorAll(
            '[data-testid^="message-image-attachment-"]',
          ) || [],
        ).filter((element) =>
          /^message-image-attachment-(?:unavailable-)?\d+$/.test(
            element.getAttribute("data-testid") || "",
          ),
        ).length;
        const canonicalTimelineDetails = Array.from(
          messageContent?.querySelectorAll(
            'details[data-testid^="agent-thread-block:"]',
          ) || [],
        ).filter((element) => element instanceof HTMLDetailsElement);
        const timelineFileAttachmentCardCount =
          messageContent?.querySelectorAll(
            '[data-testid="timeline-file-attachment-card"]',
          ).length || 0;
        const timelineFileArtifactCardCount =
          messageContent?.querySelectorAll(
            '[data-testid="timeline-file-artifact-card"]',
          ).length || 0;
        const groupedFileArtifactRowCount =
          messageContent?.querySelectorAll(
            '[data-testid="file-changes-summary-file-row"]',
          ).length || 0;
        const agentMessageTextParts = Array.from(
          messageContent?.querySelectorAll(
            '[data-testid="agent-message-text-part"][data-thread-item-id]',
          ) || [],
        );
        const agentMessageTextPartIds = agentMessageTextParts
          .map((element) => element.getAttribute("data-thread-item-id") || "")
          .filter(Boolean);
        const visibleAgentMessageTextById = Object.fromEntries(
          agentMessageTextParts.map((element) => [
            element.getAttribute("data-thread-item-id"),
            {
              text: (element.textContent || "")
                .replace(/\s+/g, " ")
                .trim()
                .slice(0, 160),
              visible: Boolean(
                element.querySelector("*")?.getClientRects().length,
              ),
            },
          ]),
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
          messageContentVisible:
            messageContentTextLength > 0 && messageContentChildCount > 0,
          messageContentTextLength,
          messageContentChildCount,
          importedBannerVisible: Boolean(importedBanner),
          importedRunControlVisible: Boolean(importedRunControl),
          sourceMetadataUiVisible: Boolean(sourceMetadataUi),
          turnGroupCount:
            messageContent?.querySelectorAll(
              '[data-testid="message-turn-group"]',
            ).length || 0,
          userMessageBubbleCount:
            messageContent?.querySelectorAll('[data-message-role="user"]')
              .length || 0,
          assistantMessageBubbleCount:
            messageContent?.querySelectorAll('[data-message-role="assistant"]')
              .length || 0,
          agentMessageTextPartCount: agentMessageTextPartIds.length,
          uniqueAgentMessageTextPartCount: new Set(agentMessageTextPartIds)
            .size,
          toolCallRowCount:
            messageContent?.querySelectorAll('[data-testid="tool-call-row"]')
              .length || 0,
          fileArtifactCardCount:
            timelineFileAttachmentCardCount +
            timelineFileArtifactCardCount +
            groupedFileArtifactRowCount,
          timelineFileAttachmentCardCount,
          timelineFileArtifactCardCount,
          groupedFileArtifactRowCount,
          imageAttachmentCount,
          historicalPreviewCount:
            messageContent?.querySelectorAll(
              '[data-testid^="message-list-historical-"]',
            ).length || 0,
          expectedVisibleMessages,
          messageComparableText: normalizedMessageContentText,
          visibleAgentMessageTextById,
          canonicalTimelineDetailsCount: canonicalTimelineDetails.length,
          collapsedCanonicalTimelineDetailsCount:
            canonicalTimelineDetails.filter((detail) => !detail.open).length,
          hasCommandExecutionVisible: Boolean(
            messageContent?.querySelector('[data-testid="tool-call-row"]'),
          ),
          hasPatchText:
            messageContentText.includes("补丁") ||
            messageContentText.includes("Patch") ||
            messageContentText.includes("已编辑") ||
            (messageContentText.includes("lib.rs") &&
              messageContentText.includes("打开文件")) ||
            messageContentText.includes("文件变更"),
          hasSearchEvidence:
            messageContentText.includes("搜索") ||
            messageContentText.includes("Search") ||
            messageContentText.includes("web search"),
          hasApprovalText:
            messageContentText.includes("导入的权限记录") ||
            messageContentText.includes("权限记录") ||
            messageContentText.includes("审批") ||
            messageContentText.includes("Approval"),
          targetSessionVisible:
            textarea instanceof HTMLTextAreaElement &&
            textarea.getAttribute("data-session-id") === sessionId &&
            messageContentTextLength > 0,
        };
      },
      { expectedExcerptHtml, expectedMessages, sessionId },
    );
    audit = assessExpectedMessageVisibility(auditSnapshot);
    latestAudit = audit || latestAudit;
    const matchesCanonicalReadModel = Boolean(
      audit?.messageContentVisible &&
      audit.targetSessionVisible &&
      audit.missingExpectedExcerpts.length === 0 &&
      audit.turnGroupCount === expectedCounts.turns &&
      audit.userMessageBubbleCount === expectedCounts.userMessages &&
      audit.assistantMessageBubbleCount === expectedCounts.assistantMessages &&
      audit.agentMessageTextPartCount === expectedCounts.agentMessages &&
      audit.uniqueAgentMessageTextPartCount === expectedCounts.agentMessages &&
      audit.toolCallRowCount === expectedCounts.toolCalls &&
      audit.fileArtifactCardCount === expectedCounts.fileArtifacts &&
      audit.imageAttachmentCount === expectedCounts.attachments,
    );
    if (!matchesCanonicalReadModel) {
      audit = null;
      await sleep(250);
    }
  }
  audit = audit || latestAudit;
  if (!audit) {
    await page
      .screenshot({ path: screenshotPath, fullPage: false, timeout: 30_000 })
      .catch(() => undefined);
    throw new Error(`${viewport.label}/${position} 视口无法读取视觉审计 DOM`);
  }
  await page.screenshot({
    path: screenshotPath,
    fullPage: false,
    timeout: 30_000,
  });
  return {
    label: `${viewport.label}:${position}`,
    viewport,
    position,
    scroll,
    layout: await inspectConversationChromeLayout(page),
    expandedTimelineDetailsCount,
    screenshot: screenshotPath,
    ...audit,
    visibleTextCaptured: audit.messageContentTextLength > 0,
    bodyText: undefined,
  };
}
