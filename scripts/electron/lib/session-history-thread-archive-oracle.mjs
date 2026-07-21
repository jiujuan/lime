const ARCHIVE_REQUIRED_METHODS = [
  "initialize",
  "thread/start",
  "thread/archive",
  "thread/list",
];
const UNARCHIVE_REQUIRED_METHODS = [
  "initialize",
  "thread/list",
  "thread/unarchive",
  "thread/read",
];
const FORBIDDEN_METHODS = [
  "turn/start",
  "agentSession/update",
  "agentSession/archiveMany",
];
const APP_SERVER_DRAIN_EVENTS_COMMAND = "app_server_drain_events";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function requestMethods(result) {
  return Array.from(
    new Set((result?.requests ?? []).map((request) => request.method)),
  );
}

function assertMethodBoundary(result, requiredMethods, label) {
  const methods = requestMethods(result);
  assert(
    requiredMethods.every((method) => methods.includes(method)),
    `${label} 缺少 current method: ${requiredMethods
      .filter((method) => !methods.includes(method))
      .join(", ")}`,
  );
  assert(
    FORBIDDEN_METHODS.every((method) => !methods.includes(method)),
    `${label} 命中退役 method: ${FORBIDDEN_METHODS.filter((method) =>
      methods.includes(method),
    ).join(", ")}`,
  );
  assert(!result?.errorRaw, `${label} invoke error buffer 不为空`);
  return methods;
}

async function runLifecyclePhase(page, command, input) {
  return await page.evaluate(
    async ({ commandName, drainCommandName, phase }) => {
      const invoke = window.electronAPI?.invoke;
      if (typeof invoke !== "function") {
        throw new Error("Electron preload invoke bridge is unavailable");
      }
      const requests = [];
      const messages = [];
      let requestId = 1;

      function decodeLines(response) {
        return Array.isArray(response?.lines)
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
      }

      async function call(method, params = {}) {
        const id = `thread-archive-${phase.mode}-${requestId++}`;
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
        const decoded = decodeLines(response);
        messages.push(...decoded);
        const error = decoded.find(
          (message) => message?.id === id && message.error,
        );
        if (error) {
          throw new Error(`${method} failed: ${JSON.stringify(error.error)}`);
        }
        const responseMessage = decoded.find(
          (message) =>
            message?.id === id &&
            Object.prototype.hasOwnProperty.call(message, "result"),
        );
        if (!responseMessage) {
          throw new Error(`${method} did not return a JSON-RPC result`);
        }
        return responseMessage.result;
      }

      async function drainRecentNotifications() {
        const response = await invoke(drainCommandName, {
          request: { includeRecent: true, limit: 100 },
        });
        messages.push(...decodeLines(response));
      }

      const initialize = await call("initialize", {
        clientInfo: {
          name: `agent-session-history-electron-fixture:${phase.mode}`,
          version: "1.0.0",
        },
        capabilities: {
          eventMethods: ["thread/archived", "thread/unarchived"],
        },
      });
      await invoke(commandName, {
        request: {
          lines: [JSON.stringify({ jsonrpc: "2.0", method: "initialized" })],
        },
      });

      if (phase.mode === "archive") {
        const start = await call("thread/start", {
          model: "fixture-model",
          modelProvider: "fixture-provider",
          cwd: phase.cwd,
          historyMode: "legacy",
          threadSource: "appServer",
        });
        const threadId = start?.thread?.id;
        if (typeof threadId !== "string" || !threadId) {
          throw new Error("thread/start did not return a canonical thread id");
        }
        const archive = await call("thread/archive", { threadId });
        const archivedList = await call("thread/list", {
          archived: true,
          limit: 100,
        });
        await drainRecentNotifications();
        return {
          initialize,
          start,
          archive,
          archivedList,
          requests,
          messages,
          traceRaw: window.localStorage.getItem("lime_invoke_trace_buffer_v1"),
          errorRaw: window.localStorage.getItem("lime_invoke_error_buffer_v1"),
        };
      }

      const archivedList = await call("thread/list", {
        archived: true,
        limit: 100,
      });
      const unarchive = await call("thread/unarchive", {
        threadId: phase.threadId,
      });
      const activeList = await call("thread/list", {
        archived: false,
        limit: 100,
      });
      const read = await call("thread/read", {
        threadId: phase.threadId,
        includeTurns: false,
      });
      await drainRecentNotifications();
      return {
        initialize,
        archivedList,
        unarchive,
        activeList,
        read,
        requests,
        messages,
        traceRaw: window.localStorage.getItem("lime_invoke_trace_buffer_v1"),
        errorRaw: window.localStorage.getItem("lime_invoke_error_buffer_v1"),
      };
    },
    {
      commandName: command,
      drainCommandName: APP_SERVER_DRAIN_EVENTS_COMMAND,
      phase: input,
    },
  );
}

export async function runThreadArchivePhase(page, command, cwd) {
  return await runLifecyclePhase(page, command, { mode: "archive", cwd });
}

export function assertThreadArchivePhase(result) {
  const methods = assertMethodBoundary(
    result,
    ARCHIVE_REQUIRED_METHODS,
    "thread archive phase",
  );
  const thread = result?.start?.thread;
  const threadId = thread?.id;
  assert(typeof threadId === "string" && threadId, "archive 缺少 threadId");
  const archivedThread = (result?.archivedList?.data ?? []).find(
    (candidate) => candidate?.id === threadId,
  );
  assert(
    archivedThread?.id === threadId,
    "thread/list archived=true 未返回归档 Thread",
  );
  const notificationSeen = (result?.messages ?? []).some(
    (message) =>
      message?.method === "thread/archived" &&
      message?.params?.threadId === threadId,
  );
  assert(notificationSeen, "未观察到 thread/archived notification");
  return {
    requestMethods: methods,
    threadId,
    sessionId: thread?.sessionId ?? null,
    notificationSeen,
  };
}

export async function runThreadUnarchivePhase(page, command, threadId) {
  return await runLifecyclePhase(page, command, {
    mode: "unarchive",
    threadId,
  });
}

export function assertThreadUnarchivePhase(result, threadId) {
  const methods = assertMethodBoundary(
    result,
    UNARCHIVE_REQUIRED_METHODS,
    "thread unarchive phase",
  );
  const archivedBefore = (result?.archivedList?.data ?? []).find(
    (candidate) => candidate?.id === threadId,
  );
  const activeAfter = (result?.activeList?.data ?? []).find(
    (candidate) => candidate?.id === threadId,
  );
  assert(
    archivedBefore?.id === threadId,
    "sidecar restart 后未读回归档 Thread",
  );
  assert(
    result?.unarchive?.thread?.id === threadId,
    "thread/unarchive response identity 不正确",
  );
  assert(
    activeAfter?.id === threadId,
    "thread/list archived=false 未返回恢复后的 Thread",
  );
  assert(
    result?.read?.thread?.id === threadId,
    "thread/read 未读回恢复后的 Thread",
  );
  const notificationSeen = (result?.messages ?? []).some(
    (message) =>
      message?.method === "thread/unarchived" &&
      message?.params?.threadId === threadId,
  );
  assert(notificationSeen, "未观察到 thread/unarchived notification");
  return {
    requestMethods: methods,
    threadId,
    archivedRestartReadback: true,
    notificationSeen,
  };
}
