import { THREAD_READ_PAGE_ISOMORPHIC } from "./session-history-thread-read-isomorphic-fixture.mjs";

const REQUIRED_METHODS = [
  "initialize",
  "agentSession/read",
  "agentSession/list",
  "agentSession/thread/resume",
];
const FORBIDDEN_METHODS = ["agentSession/start", "agentSession/turn/start"];

export class ThreadReadPageIsomorphicDomError extends Error {
  constructor(message, evidence) {
    super(message);
    this.name = "ThreadReadPageIsomorphicDomError";
    this.evidence = evidence;
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function uniqueRequestMethods(result) {
  return Array.from(
    new Set((result?.requests ?? []).map((request) => request.method)),
  );
}

function readId(record, keys) {
  if (!record || typeof record !== "object") {
    return null;
  }
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function turnId(record) {
  return readId(record, ["turnId", "turn_id", "id"]);
}

function itemId(record) {
  return readId(record, [
    "id",
    "itemId",
    "item_id",
    "messageId",
    "message_id",
    "event_id",
  ]);
}

function turnIds(records) {
  return (Array.isArray(records) ? records : [])
    .map(turnId)
    .filter((id) => typeof id === "string");
}

function itemIds(records) {
  return (Array.isArray(records) ? records : [])
    .map(itemId)
    .filter((id) => typeof id === "string");
}

function canonicalItemId(value) {
  return value.startsWith("item_") ? value : `item_${value}`;
}

function expectedCanonicalItemIds() {
  return THREAD_READ_PAGE_ISOMORPHIC.turns.flatMap((turn) => [
    canonicalItemId(`user-${turn.turnId}`),
    canonicalItemId(turn.reasoningItemId),
    canonicalItemId(turn.assistantItemId),
  ]);
}

function assertReasoningItems(items, label) {
  const reasoningItems = (Array.isArray(items) ? items : []).filter(
    (item) => item?.type === "reasoning",
  );
  assert(
    reasoningItems.length === THREAD_READ_PAGE_ISOMORPHIC.turns.length,
    `${label} reasoning 数量不正确: ${reasoningItems.length}`,
  );
  for (const turn of THREAD_READ_PAGE_ISOMORPHIC.turns) {
    const expectedId = canonicalItemId(turn.reasoningItemId);
    const item = reasoningItems.find(
      (candidate) => itemId(candidate) === expectedId,
    );
    assert(item, `${label} 缺少 reasoning item: ${expectedId}`);
    assert(
      item?.text === turn.reasoningText,
      `${label} reasoning text 不正确: ${expectedId}`,
    );
    assert(
      JSON.stringify(item?.summary ?? []) ===
        JSON.stringify([turn.reasoningText]),
      `${label} reasoning summary 不正确: ${expectedId}`,
    );
  }
}

function assertEqualArray(actual, expected, label) {
  assert(
    JSON.stringify(actual) === JSON.stringify(expected),
    `${label} 不一致: actual=${JSON.stringify(actual)} expected=${JSON.stringify(expected)}`,
  );
}

function messageContains(message, text) {
  return JSON.stringify(message ?? {}).includes(text);
}

function assertMessagePage(messages, expectedTexts, label) {
  assert(Array.isArray(messages), `${label}.messages 必须是数组`);
  assert(
    messages.length === expectedTexts.length,
    `${label}.messages 数量不正确: ${messages.length}`,
  );
  for (const text of expectedTexts) {
    assert(
      messages.some((message) => messageContains(message, text)),
      `${label}.messages 缺少文本: ${text}`,
    );
  }
}

function expectedMessageTextsNewestPageFirst() {
  const turns = THREAD_READ_PAGE_ISOMORPHIC.turns;
  return [
    [turns[2].userText, turns[2].assistantText],
    [turns[1].userText, turns[1].assistantText],
    [turns[0].userText, turns[0].assistantText],
  ];
}

export async function runThreadReadPageIsomorphicReadPhase(page, command) {
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
        const id = `thread-read-isomorphic-${requestId++}`;
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
          name: "agent-session-history-electron-fixture:thread-read-page-isomorphic",
          version: "1.0.0",
        },
        capabilities: { eventMethods: ["agentSession/event"] },
      });
      await invoke(commandName, {
        request: {
          lines: [JSON.stringify({ jsonrpc: "2.0", method: "initialized" })],
        },
      });
      const fullRead = await call("agentSession/read", {
        sessionId: fixture.sessionId,
        historyLimit: 50,
      });
      const newestPage = await call("agentSession/read", {
        sessionId: fixture.sessionId,
        historyLimit: 2,
        historyOffset: 0,
      });
      const middlePage = await call("agentSession/read", {
        sessionId: fixture.sessionId,
        historyLimit: 2,
        historyOffset: 2,
      });
      const oldestPage = await call("agentSession/read", {
        sessionId: fixture.sessionId,
        historyLimit: 2,
        historyOffset: 4,
      });
      const list = await call(
        "agentSession/list",
        fixture.workspaceId
          ? {
              workspaceId: fixture.workspaceId,
              limit: 20,
            }
          : {
              limit: 20,
            },
      );
      const resume = await call("agentSession/thread/resume", {
        sessionId: fixture.sessionId,
      });
      return {
        initialize,
        fullRead,
        newestPage,
        middlePage,
        oldestPage,
        list,
        resume,
        requests,
        messages,
        traceRaw: window.localStorage.getItem("lime_invoke_trace_buffer_v1"),
        errorRaw: window.localStorage.getItem("lime_invoke_error_buffer_v1"),
      };
    },
    {
      commandName: command,
      fixture: THREAD_READ_PAGE_ISOMORPHIC,
    },
  );
}

export function assertThreadReadPageIsomorphicReadModel(result) {
  const requestMethods = uniqueRequestMethods(result);
  const expectedTurnIds = THREAD_READ_PAGE_ISOMORPHIC.turns.map(
    (turn) => turn.turnId,
  );
  const expectedItemIds = expectedCanonicalItemIds();
  const detail = result?.fullRead?.detail;
  const threadRead = detail?.thread_read;
  const detailTurnIds = turnIds(detail?.turns);
  const threadReadTurnIds = turnIds(threadRead?.turns);
  const resumeTurnIds = turnIds(result?.resume?.turns);
  const detailItemIds = itemIds(detail?.items);
  const threadReadItemIds = itemIds(threadRead?.thread_items);
  const listedSession = (result?.list?.sessions ?? []).find(
    (session) => session?.sessionId === THREAD_READ_PAGE_ISOMORPHIC.sessionId,
  );

  assert(
    REQUIRED_METHODS.every((method) => requestMethods.includes(method)),
    `threadReadPageIsomorphic 缺少 App Server current method: ${REQUIRED_METHODS.filter(
      (method) => !requestMethods.includes(method),
    ).join(", ")}`,
  );
  assert(
    FORBIDDEN_METHODS.every((method) => !requestMethods.includes(method)),
    `threadReadPageIsomorphic 不应触发: ${FORBIDDEN_METHODS.filter((method) =>
      requestMethods.includes(method),
    ).join(", ")}`,
  );
  assert(
    result?.fullRead?.session?.sessionId ===
      THREAD_READ_PAGE_ISOMORPHIC.sessionId,
    "threadReadPageIsomorphic full read sessionId 不正确",
  );
  assert(
    result?.fullRead?.session?.threadId ===
      THREAD_READ_PAGE_ISOMORPHIC.threadId,
    "threadReadPageIsomorphic full read threadId 不正确",
  );
  assert(listedSession, "threadReadPageIsomorphic list 未返回 fixture session");
  assert(
    listedSession?.threadId === THREAD_READ_PAGE_ISOMORPHIC.threadId,
    "threadReadPageIsomorphic list threadId 不正确",
  );
  assert(
    listedSession?.workspaceId == null,
    "threadReadPageIsomorphic 应作为 standalone session 出现在最近对话",
  );
  assert(
    Number(listedSession?.messagesCount) >= 6,
    "threadReadPageIsomorphic list messagesCount 未反映三轮历史",
  );
  assert(
    threadRead && typeof threadRead === "object",
    "threadReadPageIsomorphic 缺少 detail.thread_read",
  );
  assertEqualArray(detailTurnIds, expectedTurnIds, "detail.turns turn order");
  assertEqualArray(
    threadReadTurnIds,
    expectedTurnIds,
    "thread_read.turns turn order",
  );
  assertEqualArray(
    resumeTurnIds,
    expectedTurnIds,
    "thread/resume turns turn order",
  );
  assertEqualArray(detailItemIds, expectedItemIds, "detail.items item order");
  assertEqualArray(
    threadReadItemIds,
    expectedItemIds,
    "thread_read.thread_items item order",
  );
  assertReasoningItems(detail?.items, "detail.items");
  assertReasoningItems(threadRead?.thread_items, "thread_read.thread_items");
  assert(
    (detail?.items ?? []).every((item) => item?.status === "completed"),
    `detail.items 必须完成 canonical lifecycle: ${JSON.stringify(
      (detail?.items ?? []).map((item) => ({
        id: itemId(item),
        type: item?.type ?? null,
        status: item?.status ?? null,
      })),
    )}`,
  );
  assert(
    JSON.stringify(detail?.items ?? []) ===
      JSON.stringify(threadRead?.thread_items ?? []),
    "detail.items 与 thread_read.thread_items 必须同源",
  );
  assert(
    result?.resume?.resumed === false,
    "无 queued turn 时 resume 应 no-op",
  );
  assert(
    result?.resume?.session?.sessionId ===
      THREAD_READ_PAGE_ISOMORPHIC.sessionId,
    "thread/resume response sessionId 不正确",
  );

  const [newestTexts, middleTexts, oldestTexts] =
    expectedMessageTextsNewestPageFirst();
  assertMessagePage(
    result?.newestPage?.detail?.messages,
    newestTexts,
    "newest page",
  );
  assertMessagePage(
    result?.middlePage?.detail?.messages,
    middleTexts,
    "middle page",
  );
  assertMessagePage(
    result?.oldestPage?.detail?.messages,
    oldestTexts,
    "oldest page",
  );

  return {
    requestMethods,
    sessionId: result?.fullRead?.session?.sessionId ?? null,
    threadId: result?.fullRead?.session?.threadId ?? null,
    listedSessionFound: Boolean(listedSession),
    listedMessagesCount: listedSession?.messagesCount ?? null,
    detailTurnIds,
    threadReadTurnIds,
    resumeTurnIds,
    detailItemIds,
    threadReadItemIds,
    resumeNoop: result?.resume?.resumed === false,
    pageCursors: [
      result?.newestPage?.detail?.history_cursor ?? null,
      result?.middlePage?.detail?.history_cursor ?? null,
      result?.oldestPage?.detail?.history_cursor ?? null,
    ],
  };
}

async function waitForThreadReadConversationButton(page, options) {
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
    }, THREAD_READ_PAGE_ISOMORPHIC);
    if (snapshot?.found) {
      return snapshot;
    }
    lastSnapshot = snapshot;
    await sleep(options.intervalMs);
  }
  throw new Error(
    `threadReadPageIsomorphic 侧栏会话未出现: ${JSON.stringify(lastSnapshot)}`,
  );
}

async function clickThreadReadConversation(page) {
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
  }, THREAD_READ_PAGE_ISOMORPHIC);
  if (!clicked) {
    throw new Error("threadReadPageIsomorphic 未找到可点击会话按钮");
  }
}

async function installThreadReadDomDebugProbe(page) {
  await page.evaluate(() => {
    window.localStorage.setItem("lime:agent-debug", "1");
    const globalWindow = window;
    if (globalWindow.__threadReadPageIsomorphicDebugProbeInstalled === true) {
      return;
    }
    globalWindow.__threadReadPageIsomorphicDebugProbeInstalled = true;
    globalWindow.__threadReadPageIsomorphicDebugLogs = [];
    const methods = ["debug", "info", "warn", "error"];
    for (const method of methods) {
      const original = console[method]?.bind(console);
      if (typeof original !== "function") {
        continue;
      }
      console[method] = (...args) => {
        try {
          const first = typeof args[0] === "string" ? args[0] : "";
          if (
            first.includes("[AgentDebug]") ||
            first.includes("[PERF] AgentChat")
          ) {
            globalWindow.__threadReadPageIsomorphicDebugLogs.push({
              method,
              text: args
                .map((arg) => {
                  if (typeof arg === "string") {
                    return arg;
                  }
                  try {
                    return JSON.stringify(arg);
                  } catch {
                    return String(arg);
                  }
                })
                .join(" ")
                .slice(0, 2000),
            });
          }
        } catch {
          // 调试探针不能影响被测页面。
        }
        original(...args);
      };
    }
  });
}

async function readThreadReadDomDebugSnapshot(page) {
  return await page.evaluate(() => {
    const traceRaw = window.localStorage.getItem("lime_invoke_trace_buffer_v1");
    const errorRaw = window.localStorage.getItem("lime_invoke_error_buffer_v1");
    const navigationRestoreRaw = window.sessionStorage.getItem(
      "lime.appNavigation.restore.v1",
    );
    const jsonRpcRequests = (() => {
      try {
        const traceEntries = JSON.parse(traceRaw || "[]");
        if (!Array.isArray(traceEntries)) {
          return [];
        }
        return traceEntries.flatMap((entry) => {
          if (
            !entry ||
            typeof entry !== "object" ||
            entry.command !== "app_server_handle_json_lines"
          ) {
            return [];
          }
          const lines = entry.args_preview?.request?.lines;
          if (!Array.isArray(lines)) {
            return [];
          }
          return lines.flatMap((line) => {
            try {
              const request = JSON.parse(String(line));
              if (!request || typeof request.method !== "string") {
                return [];
              }
              const params =
                request.params && typeof request.params === "object"
                  ? request.params
                  : {};
              return [
                {
                  id: request.id ?? null,
                  method: request.method,
                  sessionId: params.sessionId ?? null,
                  threadId: params.threadId ?? null,
                  turnId: params.turnId ?? null,
                  transport: entry.transport ?? null,
                  status: entry.status ?? null,
                },
              ];
            } catch {
              return [];
            }
          });
        });
      } catch {
        return [];
      }
    })();
    const bodyText = document.body?.innerText || "";
    const conversationButtons = Array.from(
      document.querySelectorAll(
        '[data-testid="app-sidebar-conversation-open"]',
      ),
    )
      .map((button) => ({
        title: button.getAttribute("title") || "",
        text: button.textContent || "",
        ariaCurrent: button.getAttribute("aria-current"),
        disabled:
          button instanceof HTMLButtonElement ? button.disabled : undefined,
        rowActive: button.closest("[data-active]")?.getAttribute("data-active"),
      }))
      .slice(0, 20);
    const dataTestIds = Array.from(document.querySelectorAll("[data-testid]"))
      .map((element) => element.getAttribute("data-testid") || "")
      .filter(Boolean)
      .slice(0, 120);
    const agentDebugLogs = Array.isArray(
      window.__threadReadPageIsomorphicDebugLogs,
    )
      ? window.__threadReadPageIsomorphicDebugLogs.slice(-120)
      : [];
    return {
      url: window.location.href,
      routeSearch: window.location.search,
      navigationRestoreRaw,
      conversationButtons,
      bodyTextPreview: bodyText.slice(0, 3000),
      dataTestIds,
      jsonRpcRequests,
      agentDebugLogs,
      traceRaw,
      errorRaw,
    };
  });
}

async function waitForThreadReadDomSnapshot(page, options) {
  const startedAt = Date.now();
  let lastSnapshot = null;
  while (Date.now() - startedAt < options.timeoutMs) {
    const snapshot = await page.evaluate((fixture) => {
      const bodyText = document.body?.innerText || "";
      const expectedTexts = fixture.turns.flatMap((turn) => [
        turn.userText,
        turn.assistantText,
      ]);
      const textPositions = expectedTexts.map((text) => ({
        text,
        index: bodyText.indexOf(text),
      }));
      const turnGroups = fixture.turns.map((turn) => ({
        turnId: turn.turnId,
        present: Boolean(
          document.querySelector(
            `[data-testid="message-turn-group"][data-runtime-turn-id="${turn.turnId}"]`,
          ),
        ),
      }));
      const testIds = Array.from(document.querySelectorAll("[data-testid]"))
        .map((element) => element.getAttribute("data-testid") || "")
        .filter(Boolean);
      return {
        messageListReady: Boolean(
          document.querySelector('[data-testid="message-list-frame"]'),
        ),
        turnGroups,
        allTextsVisible: textPositions.every((entry) => entry.index >= 0),
        textPositions,
        textOrderStable: textPositions.every(
          (entry, index, entries) =>
            entry.index >= 0 &&
            (index === 0 || entries[index - 1].index < entry.index),
        ),
        startupNoteVisible:
          bodyText.includes("启动说明") ||
          bodyText.includes("正在启动") ||
          bodyText.includes("初始化"),
        toolRows: testIds.filter((testId) => testId === "tool-call-row").length,
      };
    }, THREAD_READ_PAGE_ISOMORPHIC);
    if (
      snapshot?.messageListReady &&
      snapshot.allTextsVisible &&
      snapshot.textOrderStable &&
      snapshot.turnGroups.every((group) => group.present)
    ) {
      return snapshot;
    }
    lastSnapshot = snapshot;
    await sleep(options.intervalMs);
  }
  const debugSnapshot = await readThreadReadDomDebugSnapshot(page);
  throw new ThreadReadPageIsomorphicDomError(
    `threadReadPageIsomorphic DOM 未恢复完整: ${JSON.stringify(lastSnapshot)}`,
    {
      snapshot: lastSnapshot,
      debugSnapshot,
    },
  );
}

export async function runThreadReadPageIsomorphicDomOracle(page, options) {
  await installThreadReadDomDebugProbe(page);
  await waitForThreadReadConversationButton(page, options);
  await clickThreadReadConversation(page);
  const snapshot = await waitForThreadReadDomSnapshot(page, options);
  const traceRaw = await page.evaluate(() =>
    window.localStorage.getItem("lime_invoke_trace_buffer_v1"),
  );
  return {
    snapshot,
    traceRaw,
  };
}

export function assertThreadReadPageIsomorphicDomOracle(result) {
  const snapshot = result?.snapshot ?? {};
  assert(
    snapshot.messageListReady,
    "threadReadPageIsomorphic message list 未就绪",
  );
  assert(
    snapshot.allTextsVisible,
    `threadReadPageIsomorphic DOM 文本缺失: ${JSON.stringify(snapshot.textPositions)}`,
  );
  assert(
    snapshot.textOrderStable,
    `threadReadPageIsomorphic DOM 文本顺序漂移: ${JSON.stringify(snapshot.textPositions)}`,
  );
  assert(
    Array.isArray(snapshot.turnGroups) &&
      snapshot.turnGroups.every((group) => group.present),
    `threadReadPageIsomorphic turn group 未完整恢复: ${JSON.stringify(snapshot.turnGroups)}`,
  );
  assert(
    !snapshot.startupNoteVisible,
    "threadReadPageIsomorphic DOM 不应出现启动说明/初始化说明",
  );
  return {
    turnGroupCount: snapshot.turnGroups.length,
    textOrderStable: snapshot.textOrderStable,
    startupNoteVisible: snapshot.startupNoteVisible,
    toolRows: snapshot.toolRows,
  };
}
