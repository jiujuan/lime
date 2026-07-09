import {
  HISTORY_REPLAY_VISUAL,
  isHistoryReplayVisualLocalImagePath,
} from "./session-history-replay-visual-fixture.mjs";

const REQUIRED_METHODS = [
  "initialize",
  "agentSession/read",
  "agentSession/list",
];
const FORBIDDEN_METHODS = ["agentSession/start", "agentSession/turn/start"];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runHistoryReplayVisualReadPhase(page, command) {
  return await page.evaluate(
    async ({ commandName, fixture }) => {
      const invoke = window.electronAPI?.invoke;
      if (typeof invoke !== "function") {
        throw new Error("Electron preload invoke bridge is unavailable");
      }
      const requests = [];
      const messages = [];
      let requestId = 1;

      async function call(method, params = {}) {
        const id = `history-replay-visual-${requestId++}`;
        requests.push({ id, method, params });
        const response = await invoke(commandName, {
          request: {
            lines: [
              JSON.stringify({
                jsonrpc: "2.0",
                id,
                method,
                params,
              }),
            ],
          },
        });
        const decoded = Array.isArray(response?.lines)
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
        messages.push(...decoded);
        const error = decoded.find(
          (message) => message?.id === id && message.error,
        );
        if (error) {
          throw new Error(`${method} failed: ${JSON.stringify(error.error)}`);
        }
        const result = decoded.find(
          (message) =>
            message?.id === id &&
            Object.prototype.hasOwnProperty.call(message, "result"),
        );
        if (!result) {
          throw new Error(`${method} did not return a JSON-RPC result`);
        }
        return result.result;
      }

      const initialize = await call("initialize", {
        clientInfo: {
          name: "agent-session-history-electron-fixture:history-replay-visual",
          version: "1.0.0",
        },
        capabilities: { eventMethods: ["agentSession/event"] },
      });
      await invoke(commandName, {
        request: {
          lines: [JSON.stringify({ jsonrpc: "2.0", method: "initialized" })],
        },
      });
      const read = await call("agentSession/read", {
        sessionId: fixture.sessionId,
        historyLimit: 50,
      });
      const list = await call("agentSession/list", {
        workspaceId: fixture.workspaceId,
        limit: 20,
      });
      return {
        initialize,
        read,
        list,
        requests,
        messages,
        traceRaw: window.localStorage.getItem("lime_invoke_trace_buffer_v1"),
        errorRaw: window.localStorage.getItem("lime_invoke_error_buffer_v1"),
      };
    },
    {
      commandName: command,
      fixture: HISTORY_REPLAY_VISUAL,
    },
  );
}

function uniqueRequestMethods(result) {
  return Array.from(
    new Set((result?.requests ?? []).map((request) => request.method)),
  );
}

function findById(items, id) {
  return (items ?? []).find((item) => item?.id === id);
}

function normalizedItemShape(item) {
  return item
    ? {
        id: item.id,
        turn_id: item.turn_id,
        type: item.type,
        status: item.status,
        sequence: item.sequence,
      }
    : null;
}

function countText(value, needle) {
  return String(value || "").split(needle).length - 1;
}

export function assertHistoryReplayVisualReadModel(result) {
  const requestMethods = uniqueRequestMethods(result);
  const detail = result?.read?.detail;
  const threadRead = detail?.thread_read;
  const items = Array.isArray(detail?.items) ? detail.items : [];
  const threadItems = Array.isArray(threadRead?.thread_items)
    ? threadRead.thread_items
    : [];
  const messages = Array.isArray(detail?.messages) ? detail.messages : [];
  const userMessage = messages.find((message) => message.role === "user");
  const assistantMessage = messages.find(
    (message) => message.role === "assistant",
  );
  const reasoning = findById(items, HISTORY_REPLAY_VISUAL.reasoningItemId);
  const threadReasoning = findById(
    threadItems,
    HISTORY_REPLAY_VISUAL.reasoningItemId,
  );
  const mcp = findById(items, HISTORY_REPLAY_VISUAL.mcpItemId);
  const threadMcp = findById(threadItems, HISTORY_REPLAY_VISUAL.mcpItemId);
  const toolCalls = Array.isArray(threadRead?.tool_calls)
    ? threadRead.tool_calls
    : [];
  const mcpToolCall = findById(toolCalls, HISTORY_REPLAY_VISUAL.mcpItemId);
  const userAttachments = Array.isArray(userMessage?.attachments)
    ? userMessage.attachments
    : [];
  const userMessageJson = JSON.stringify(userMessage ?? {});

  assert(
    REQUIRED_METHODS.every((method) => requestMethods.includes(method)),
    `historyReplayVisual 缺少 App Server current method: ${REQUIRED_METHODS.filter(
      (method) => !requestMethods.includes(method),
    ).join(", ")}`,
  );
  assert(
    FORBIDDEN_METHODS.every((method) => !requestMethods.includes(method)),
    `historyReplayVisual 不应触发: ${FORBIDDEN_METHODS.filter((method) =>
      requestMethods.includes(method),
    ).join(", ")}`,
  );
  assert(
    result?.read?.session?.sessionId === HISTORY_REPLAY_VISUAL.sessionId,
    "historyReplayVisual read sessionId 不正确",
  );
  assert(
    (result?.list?.sessions ?? []).some(
      (session) => session.sessionId === HISTORY_REPLAY_VISUAL.sessionId,
    ),
    "historyReplayVisual list 未返回 fixture session",
  );
  assert(userMessage, "historyReplayVisual 缺少 user message");
  assert(assistantMessage, "historyReplayVisual 缺少 assistant message");
  assert(
    userMessageJson.includes(HISTORY_REPLAY_VISUAL.userText),
    "historyReplayVisual user text 未恢复",
  );
  assert(
    userMessageJson.includes(HISTORY_REPLAY_VISUAL.userTextElement),
    "historyReplayVisual user textElements 未恢复",
  );
  assert(
    !userMessageJson.includes("[Image #"),
    "historyReplayVisual user image refs 被退化成 [Image #N] 文本",
  );
  assert(
    userAttachments.some((attachment) =>
      isHistoryReplayVisualLocalImagePath(attachment?.uri),
    ),
    "historyReplayVisual local image attachment 未恢复",
  );
  assert(
    userAttachments.some(
      (attachment) => attachment?.uri === HISTORY_REPLAY_VISUAL.remoteImageUrl,
    ),
    "historyReplayVisual remote image attachment 未恢复",
  );
  assert(
    countText(JSON.stringify(detail), HISTORY_REPLAY_VISUAL.reasoningSummary) >=
      1,
    "historyReplayVisual reasoning summary 未进入 read detail",
  );
  assert(
    reasoning?.status === "completed",
    "historyReplayVisual reasoning 未完成",
  );
  assert(
    threadReasoning?.status === "completed",
    "historyReplayVisual thread_read.thread_items reasoning 未完成",
  );
  assert(
    JSON.stringify(normalizedItemShape(reasoning)) ===
      JSON.stringify(normalizedItemShape(threadReasoning)),
    "historyReplayVisual reasoning detail.items 与 thread_read.thread_items 不同源",
  );
  assert(
    mcp?.status === "in_progress",
    "historyReplayVisual MCP item 未保持运行态",
  );
  assert(
    threadMcp?.status === "in_progress",
    "historyReplayVisual thread_read.thread_items MCP 未保持运行态",
  );
  assert(
    mcpToolCall?.status === "running",
    "historyReplayVisual thread_read.tool_calls MCP 未保持 running",
  );
  assert(
    threadRead?.active_turn_id === HISTORY_REPLAY_VISUAL.turnId,
    "historyReplayVisual active_turn_id 未指向 running turn",
  );

  return {
    requestMethods,
    sessionId: result?.read?.session?.sessionId ?? null,
    messageCount: messages.length,
    itemCount: items.length,
    threadItemCount: threadItems.length,
    userAttachmentCount: userAttachments.length,
    userTextElementsPresent: userMessageJson.includes(
      HISTORY_REPLAY_VISUAL.userTextElement,
    ),
    reasoning: normalizedItemShape(reasoning),
    mcp: normalizedItemShape(mcp),
    mcpToolCallStatus: mcpToolCall?.status ?? null,
    threadStatus: threadRead?.status ?? null,
    activeTurnId: threadRead?.active_turn_id ?? null,
  };
}

async function waitForHistoryReplayConversationButton(page, options) {
  const startedAt = Date.now();
  let lastSnapshot = null;
  while (Date.now() - startedAt < options.timeoutMs) {
    const snapshot = await page.evaluate((fixture) => {
      const buttons = Array.from(
        document.querySelectorAll(
          '[data-testid="app-sidebar-conversation-open"]',
        ),
      );
      const rows = buttons.map((button) => ({
        title: button.getAttribute("title") || "",
        text: button.textContent || "",
      }));
      const button = buttons.find(
        (candidate) =>
          candidate.getAttribute("title") === fixture.title ||
          candidate.textContent?.includes(fixture.title),
      );
      return {
        found: Boolean(button),
        rows,
      };
    }, HISTORY_REPLAY_VISUAL);
    if (snapshot?.found) {
      return snapshot;
    }
    lastSnapshot = snapshot;
    await sleep(options.intervalMs);
  }
  throw new Error(
    `historyReplayVisual 侧栏会话未出现: ${JSON.stringify(lastSnapshot)}`,
  );
}

async function clickHistoryReplayConversation(page) {
  const clicked = await page.evaluate((fixture) => {
    const buttons = Array.from(
      document.querySelectorAll(
        '[data-testid="app-sidebar-conversation-open"]',
      ),
    );
    const button = buttons.find(
      (candidate) =>
        candidate.getAttribute("title") === fixture.title ||
        candidate.textContent?.includes(fixture.title),
    );
    if (!(button instanceof HTMLButtonElement)) {
      return false;
    }
    button.click();
    return true;
  }, HISTORY_REPLAY_VISUAL);
  if (!clicked) {
    throw new Error("historyReplayVisual 未找到可点击会话按钮");
  }
}

async function waitForHistoryReplayDomSnapshot(page, options) {
  const startedAt = Date.now();
  let lastSnapshot = null;
  while (Date.now() - startedAt < options.timeoutMs) {
    const snapshot = await page.evaluate((fixture) => {
      const bodyText = document.body?.innerText || "";
      const testIds = Array.from(document.querySelectorAll("[data-testid]"))
        .map((element) => element.getAttribute("data-testid") || "")
        .filter(Boolean);
      const imageAttachmentCount = testIds.filter((testId) =>
        /^message-image-attachment-(?:unavailable-)?\d+$/.test(testId),
      ).length;
      const reasoningNode = document.querySelector(
        `[data-thread-item-id="${fixture.reasoningItemId}"]`,
      );
      const mcpNode = document.querySelector(
        `[data-thread-item-id="${fixture.mcpItemId}"]`,
      );
      const turnGroup = document.querySelector(
        `[data-testid="message-turn-group"][data-runtime-turn-id="${fixture.turnId}"]`,
      );
      return {
        messageListReady: Boolean(
          document.querySelector('[data-testid="message-list-frame"]'),
        ),
        turnGroupPresent: Boolean(turnGroup),
        imageAttachmentCount,
        userTextVisible: bodyText.includes(fixture.userText),
        imagePlaceholderTextVisible: bodyText.includes("[Image #"),
        assistantTextVisible: bodyText.includes(fixture.assistantText),
        reasoningNodePresent: Boolean(reasoningNode),
        reasoningText: reasoningNode?.textContent || "",
        reasoningSummaryOccurrences:
          bodyText.split(fixture.reasoningSummary).length - 1,
        mcpNodePresent: Boolean(mcpNode),
        mcpText: mcpNode?.textContent || "",
        toolRows: testIds.filter((testId) => testId === "tool-call-row").length,
      };
    }, HISTORY_REPLAY_VISUAL);
    if (
      snapshot?.messageListReady &&
      snapshot.turnGroupPresent &&
      snapshot.userTextVisible &&
      snapshot.assistantTextVisible &&
      snapshot.reasoningNodePresent &&
      snapshot.mcpNodePresent
    ) {
      return snapshot;
    }
    lastSnapshot = snapshot;
    await sleep(options.intervalMs);
  }
  throw new Error(
    `historyReplayVisual DOM 未恢复完整: ${JSON.stringify(lastSnapshot)}`,
  );
}

export async function runHistoryReplayVisualDomOracle(page, options) {
  await waitForHistoryReplayConversationButton(page, options);
  await clickHistoryReplayConversation(page);
  const snapshot = await waitForHistoryReplayDomSnapshot(page, options);
  const traceRaw = await page.evaluate(() =>
    window.localStorage.getItem("lime_invoke_trace_buffer_v1"),
  );
  return {
    snapshot,
    traceRaw,
  };
}

export function assertHistoryReplayVisualDomOracle(result) {
  const snapshot = result?.snapshot ?? {};
  assert(snapshot.messageListReady, "historyReplayVisual message list 未就绪");
  assert(snapshot.turnGroupPresent, "historyReplayVisual turn group 未恢复");
  assert(snapshot.userTextVisible, "historyReplayVisual user text 不可见");
  assert(
    !snapshot.imagePlaceholderTextVisible,
    "historyReplayVisual DOM 出现 [Image #N] 占位文本",
  );
  assert(
    snapshot.imageAttachmentCount >= 2,
    `historyReplayVisual image attachments DOM 数量不足: ${snapshot.imageAttachmentCount}`,
  );
  assert(
    snapshot.reasoningNodePresent,
    "historyReplayVisual reasoning item DOM owner 缺失",
  );
  assert(
    snapshot.reasoningText.includes(HISTORY_REPLAY_VISUAL.reasoningSummary),
    "historyReplayVisual reasoning summary DOM 文本缺失",
  );
  assert(
    snapshot.reasoningSummaryOccurrences === 1,
    `historyReplayVisual reasoning summary DOM 重复渲染: ${snapshot.reasoningSummaryOccurrences}`,
  );
  assert(
    snapshot.mcpNodePresent,
    "historyReplayVisual MCP item DOM owner 缺失",
  );
  assert(
    snapshot.toolRows >= 1,
    "historyReplayVisual MCP running tool row 未渲染",
  );
  return {
    imageAttachmentCount: snapshot.imageAttachmentCount,
    reasoningSummaryOccurrences: snapshot.reasoningSummaryOccurrences,
    toolRows: snapshot.toolRows,
    turnGroupPresent: snapshot.turnGroupPresent,
  };
}
