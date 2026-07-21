import { THREAD_READ_PAGE_ISOMORPHIC } from "./session-history-thread-read-isomorphic-fixture.mjs";

const REQUIRED_METHODS = [
  "initialize",
  "thread/read",
  "thread/list",
  "thread/turns/list",
  "thread/resume",
];
const FORBIDDEN_METHODS = ["thread/start", "turn/start"];

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

function turnItems(turns) {
  return (Array.isArray(turns) ? turns : []).flatMap((turn) =>
    Array.isArray(turn?.items) ? turn.items : [],
  );
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
      JSON.stringify(item?.content ?? []) ===
        JSON.stringify([turn.reasoningText]),
      `${label} reasoning content 不正确: ${expectedId}`,
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
  const visibleMessages = messages.filter(
    (message) =>
      message?.type === "userMessage" || message?.type === "agentMessage",
  );
  assert(
    visibleMessages.length === expectedTexts.length,
    `${label}.messages 数量不正确: ${visibleMessages.length}`,
  );
  for (const text of expectedTexts) {
    assert(
      visibleMessages.some((message) => messageContains(message, text)),
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
      const fullRead = await call("thread/read", {
        threadId: fixture.threadId,
        includeTurns: true,
      });
      const newestPage = await call("thread/turns/list", {
        threadId: fixture.threadId,
        limit: 1,
        sortDirection: "desc",
        itemsView: "full",
      });
      const middlePage = await call("thread/turns/list", {
        threadId: fixture.threadId,
        cursor: newestPage.nextCursor,
        limit: 1,
        sortDirection: "desc",
        itemsView: "full",
      });
      const oldestPage = await call("thread/turns/list", {
        threadId: fixture.threadId,
        cursor: middlePage.nextCursor,
        limit: 1,
        sortDirection: "desc",
        itemsView: "full",
      });
      const list = await call("thread/list", {
        archived: false,
        limit: 20,
      });
      const resume = await call("thread/resume", {
        threadId: fixture.threadId,
        excludeTurns: true,
        initialTurnsPage: {
          limit: fixture.turns.length,
          sortDirection: "asc",
          itemsView: "full",
        },
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
  const fullThread = result?.fullRead?.thread;
  const fullTurnIds = turnIds(fullThread?.turns);
  const fullItems = turnItems(fullThread?.turns);
  const fullItemIds = itemIds(fullItems);
  const resumeTurns = result?.resume?.initialTurnsPage?.data;
  const resumeTurnIds = turnIds(resumeTurns);
  const resumeItems = turnItems(resumeTurns);
  const listedThread = (result?.list?.data ?? []).find(
    (thread) => thread?.id === THREAD_READ_PAGE_ISOMORPHIC.threadId,
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
    fullThread?.sessionId === THREAD_READ_PAGE_ISOMORPHIC.sessionId,
    "threadReadPageIsomorphic full read sessionId 不正确",
  );
  assert(
    fullThread?.id === THREAD_READ_PAGE_ISOMORPHIC.threadId,
    "threadReadPageIsomorphic full read threadId 不正确",
  );
  assert(listedThread, "threadReadPageIsomorphic list 未返回 fixture thread");
  assert(
    listedThread?.sessionId === THREAD_READ_PAGE_ISOMORPHIC.sessionId,
    "threadReadPageIsomorphic list sessionId 不正确",
  );
  assert(
    listedThread?.turns?.length === 0,
    "threadReadPageIsomorphic thread/list 必须保持 metadata-only",
  );
  assertEqualArray(fullTurnIds, expectedTurnIds, "thread.turns turn order");
  assertEqualArray(
    resumeTurnIds,
    expectedTurnIds,
    "thread/resume initialTurnsPage turn order",
  );
  assertEqualArray(fullItemIds, expectedItemIds, "thread.turns items order");
  assertEqualArray(
    itemIds(resumeItems),
    expectedItemIds,
    "thread/resume initialTurnsPage items order",
  );
  assertReasoningItems(fullItems, "thread.turns items");
  assertReasoningItems(resumeItems, "thread/resume initialTurnsPage items");
  assert(
    (fullThread?.turns ?? []).every((turn) => turn?.status === "completed"),
    `thread.turns 必须完成 canonical lifecycle: ${JSON.stringify(
      (fullThread?.turns ?? []).map((turn) => ({
        id: turnId(turn),
        status: turn?.status ?? null,
      })),
    )}`,
  );
  assert(
    result?.resume?.thread?.id === THREAD_READ_PAGE_ISOMORPHIC.threadId &&
      result?.resume?.thread?.sessionId ===
        THREAD_READ_PAGE_ISOMORPHIC.sessionId,
    "thread/resume response identity 不正确",
  );
  assert(
    Array.isArray(result?.resume?.thread?.turns) &&
      result.resume.thread.turns.length === 0,
    "thread/resume excludeTurns 必须返回 metadata-only thread",
  );
  assert(
    result?.resume?.model === "fixture-model" &&
      result?.resume?.modelProvider === "fixture-provider" &&
      result?.resume?.cwd === fullThread?.cwd,
    "thread/resume route metadata 不正确",
  );
  assert(
    !Object.hasOwn(result?.resume ?? {}, "resumed") &&
      !Object.hasOwn(result?.resume ?? {}, "session") &&
      !Object.hasOwn(result?.resume ?? {}, "turns"),
    "thread/resume 不得返回 legacy queued resume 字段",
  );
  assert(
    !(result?.messages ?? []).some(
      (message) => message?.method === "thread/started",
    ),
    "thread/resume 不得发送 thread/started",
  );

  const [newestTexts, middleTexts, oldestTexts] =
    expectedMessageTextsNewestPageFirst();
  assertMessagePage(
    turnItems(result?.newestPage?.data),
    newestTexts,
    "newest page",
  );
  assertMessagePage(
    turnItems(result?.middlePage?.data),
    middleTexts,
    "middle page",
  );
  assertMessagePage(
    turnItems(result?.oldestPage?.data),
    oldestTexts,
    "oldest page",
  );

  return {
    requestMethods,
    sessionId: fullThread?.sessionId ?? null,
    threadId: fullThread?.id ?? null,
    listedThreadFound: Boolean(listedThread),
    fullTurnIds,
    resumeTurnIds,
    fullItemIds,
    resumeMetadataOnly: result?.resume?.thread?.turns?.length === 0,
    pageCursors: [
      result?.newestPage?.nextCursor ?? null,
      result?.middlePage?.nextCursor ?? null,
      result?.oldestPage?.nextCursor ?? null,
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
