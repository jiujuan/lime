import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

export const APP_SERVER_HANDLE_JSON_LINES_COMMAND =
  "app_server_handle_json_lines";
export const WORKSPACE_ID = "codex-import-continuation-workspace";
export const SOURCE_THREAD_ID = "codex-import-continuation-thread";
export const IMPORTED_TURN_ID = "codex-import-live-exec-turn";
export const NORMAL_TURN_ID = "codex-normal-live-exec-turn";
export const IMPORTED_USER_TEXT = "请运行测试并修复失败";
export const IMPORTED_REASONING_TEXT =
  "I need to inspect the test failure first.";
export const IMPORTED_ASSISTANT_TEXT = "已完成修复。";
export const IMPORTED_CONTINUE_TEXT = "在导入会话中执行统一命令并汇报结果";
export const NORMAL_USER_TEXT = "在普通会话中执行统一命令并汇报结果";
export const IMPORTED_FINAL_TEXT = "CODEX_IMPORTED_UNIFIED_EXEC_DONE";
export const NORMAL_FINAL_TEXT = "CODEX_NORMAL_UNIFIED_EXEC_DONE";
export const COMMAND_OUTPUT_MARKER = "CODEX_UNIFIED_EXEC_OK";
export const REQUIRED_METHODS = [
  "initialize",
  "conversationImport/thread/commit",
  "agentSession/read",
  "agentSession/start",
  "agentSession/update",
  "agentSession/turn/start",
];

function sleep(ms) {
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
    return value.slice(0, 120).map((item) => sanitizeJson(item, depth + 1));
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 180)
        .map(([key, item]) => [key, sanitizeJson(item, depth + 1)]),
    );
  }
  return sanitizeText(String(value));
}

export function writeJsonFile(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

export function createTempRuntimeEnv() {
  const tempRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "codex-import-continuation-"),
  );
  const home = path.join(tempRoot, "home");
  const xdgDataHome = path.join(tempRoot, "xdg-data");
  const localAppData = path.join(tempRoot, "local-app-data");
  const roamingAppData = path.join(tempRoot, "roaming-app-data");
  const electronUserDataDir = path.join(tempRoot, "electron-user-data");
  const sourceRoot = path.join(tempRoot, "codex-home");
  const workspaceRoot = path.join(tempRoot, "workspace");
  const rolloutPath = path.join(sourceRoot, "rollout-continuation.jsonl");

  for (const dir of [
    home,
    xdgDataHome,
    localAppData,
    roamingAppData,
    electronUserDataDir,
    sourceRoot,
    workspaceRoot,
  ]) {
    fs.mkdirSync(dir, { recursive: true });
  }
  writeCodexRolloutFixture(rolloutPath, workspaceRoot);

  return {
    tempRoot,
    electronUserDataDir,
    sourceRoot,
    rolloutPath,
    workspaceRoot,
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

export function buildProviderScriptedResponses(runtimeEnv) {
  const escapedNodePath = process.execPath.replaceAll('"', '\\"');
  const command = `"${escapedNodePath}" -e "process.stdout.write('${COMMAND_OUTPUT_MARKER}')"`;
  const toolArguments = {
    cmd: command,
    workdir: runtimeEnv.workspaceRoot,
    yield_time_ms: 10_000,
    max_output_tokens: 2_000,
  };
  return {
    command,
    responses: [
      {
        type: "tool_call",
        id: "call-imported-live-exec",
        name: "exec_command",
        arguments: toolArguments,
      },
      { type: "text", content: IMPORTED_FINAL_TEXT },
      {
        type: "tool_call",
        id: "call-normal-live-exec",
        name: "exec_command",
        arguments: toolArguments,
      },
      { type: "text", content: NORMAL_FINAL_TEXT },
    ],
  };
}

function writeCodexRolloutFixture(rolloutPath, workspaceRoot) {
  const lines = [
    {
      timestamp: "2026-06-16T00:00:00.000Z",
      type: "session_meta",
      payload: {
        id: SOURCE_THREAD_ID,
        timestamp: "2026-06-16T00:00:00.000Z",
        cwd: workspaceRoot,
        source: "cli",
        model_provider: "openai",
      },
    },
    {
      timestamp: "2026-06-16T00:00:01.000Z",
      type: "event_msg",
      payload: {
        type: "user_message",
        message: `## My request for Codex: ${IMPORTED_USER_TEXT}`,
      },
    },
    {
      timestamp: "2026-06-16T00:00:02.000Z",
      type: "response_item",
      payload: {
        type: "reasoning",
        content: [{ type: "reasoning_text", text: IMPORTED_REASONING_TEXT }],
      },
    },
    {
      timestamp: "2026-06-16T00:00:03.000Z",
      type: "response_item",
      payload: {
        type: "function_call",
        id: "call_exec",
        call_id: "call_exec",
        name: "exec_command",
        arguments: JSON.stringify({ cmd: "npm test", workdir: workspaceRoot }),
      },
    },
    {
      timestamp: "2026-06-16T00:00:04.000Z",
      type: "event_msg",
      payload: {
        type: "exec_approval_request",
        call_id: "call_exec",
        command: ["npm", "test"],
      },
    },
    {
      timestamp: "2026-06-16T00:00:05.000Z",
      type: "response_item",
      payload: {
        type: "function_call_output",
        call_id: "call_exec",
        output: "Exit code: 0\nWall time: 0 seconds\nOutput:\nok",
      },
    },
    {
      timestamp: "2026-06-16T00:00:06.000Z",
      type: "response_item",
      payload: {
        type: "web_search_call",
        id: "call_search",
        call_id: "call_search",
        action: "search_query",
        query: "Lime history import",
      },
    },
    {
      timestamp: "2026-06-16T00:00:07.000Z",
      type: "event_msg",
      payload: {
        type: "web_search_end",
        call_id: "call_search",
        action: "search_query",
        query: "Lime history import",
      },
    },
    {
      timestamp: "2026-06-16T00:00:08.000Z",
      type: "event_msg",
      payload: {
        type: "patch_apply_end",
        call_id: "call_patch",
        success: true,
        changes: { [path.join(workspaceRoot, "src/lib.rs")]: { type: "modify" } },
      },
    },
    {
      timestamp: "2026-06-16T00:00:09.000Z",
      type: "event_msg",
      payload: { type: "agent_message", message: IMPORTED_ASSISTANT_TEXT },
    },
  ];
  fs.writeFileSync(
    rolloutPath,
    `${lines.map((line) => JSON.stringify(line)).join("\n")}\n`,
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

async function evaluatePageSnapshot(page, pageFunction, arg) {
  try {
    return await page.evaluate(pageFunction, arg);
  } catch (error) {
    if (isTransientPageEvaluationError(error)) {
      return null;
    }
    throw error;
  }
}

export async function waitForRendererReady(page, options) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < options.timeoutMs) {
    const snapshot = await evaluatePageSnapshot(page, () => ({
      url: window.location.href,
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
    }));
    if (
      snapshot?.electron &&
      snapshot.hasInvokeBridge &&
      snapshot.supportsAppServer &&
      !snapshot.startupVisible &&
      snapshot.appSidebarVisible
    ) {
      return snapshot;
    }
    await sleep(options.intervalMs);
  }
  throw new Error("Electron renderer / App Server bridge 未就绪");
}

export async function clearInvokeBuffers(page) {
  await page.evaluate(() => {
    window.localStorage.removeItem("lime_invoke_error_buffer_v1");
    window.localStorage.removeItem("lime_invoke_trace_buffer_v1");
  });
}

export function createPageAppServerClient(page) {
  let requestIndex = 0;
  const requests = [];
  const messages = [];
  const bridgeFacts = [];

  async function exchange(payload) {
    const envelope = await page.evaluate(
      async ({ command, payload: requestPayload }) => {
        const invoke = window.electronAPI?.invoke;
        if (typeof invoke !== "function") {
          throw new Error("Electron preload invoke bridge is unavailable");
        }
        return {
          bridge: {
            electron: window.__LIME_ELECTRON__ === true,
            hasInvoke: true,
            supportsCommand:
              typeof window.electronAPI?.supportsCommand === "function" &&
              window.electronAPI.supportsCommand(command),
          },
          response: await invoke(command, {
            request: { lines: [JSON.stringify(requestPayload)] },
          }),
        };
      },
      { command: APP_SERVER_HANDLE_JSON_LINES_COMMAND, payload },
    );
    bridgeFacts.push(envelope?.bridge ?? null);
    const response = envelope?.response;
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
    return decoded;
  }

  return {
    requests,
    messages,
    bridgeFacts,
    async call(method, params = {}) {
      const id = `codex-import-unified-exec-${++requestIndex}`;
      requests.push({ id, method });
      const decoded = await exchange({ jsonrpc: "2.0", id, method, params });
      const error = decoded.find((message) => message?.id === id && message.error);
      if (error) {
        throw new Error(`${method} failed: ${JSON.stringify(error.error)}`);
      }
      const response = decoded.find(
        (message) =>
          message?.id === id &&
          Object.prototype.hasOwnProperty.call(message, "result"),
      );
      if (!response) {
        throw new Error(`${method} did not return a JSON-RPC result`);
      }
      return response.result;
    },
    async notify(method, params = undefined) {
      requests.push({ id: null, method });
      await exchange({ jsonrpc: "2.0", method, ...(params ? { params } : {}) });
    },
  };
}

export async function initializeAndCommitImport(client, runtimeEnv) {
  const initialize = await client.call("initialize", {
    clientInfo: { name: "codex-import-unified-exec-fixture", version: "1.0.0" },
    capabilities: { eventMethods: ["agentSession/event"] },
  });
  await client.notify("initialized");
  const commit = await client.call("conversationImport/thread/commit", {
    sourceClient: "codex",
    sourceRoot: runtimeEnv.sourceRoot,
    sourcePath: runtimeEnv.rolloutPath,
    appId: "desktop",
    workspaceId: WORKSPACE_ID,
    confirmed: true,
  });
  const sessionId = commit?.session?.sessionId;
  assert(sessionId, "conversationImport/thread/commit did not return sessionId");
  const importedRead = await client.call("agentSession/read", {
    sessionId,
    historyLimit: 100,
  });
  return { initialize, commit, importedRead, sessionId };
}

function runtimeOptions(provider, workspaceRoot, eventName) {
  return {
    stream: true,
    eventName,
    runtimeRequest: {
      providerPreference: provider.providerPreference,
      modelPreference: provider.modelPreference,
      providerConfig: provider.providerConfig,
      approvalPolicy: "never",
      sandboxPolicy: "danger-full-access",
      executionStrategy: "react",
      workingDir: workspaceRoot,
      metadata: {
        harness: {
          source: "smoke:codex-import-continuation-fixture",
          access_mode: "full-access",
          skip_mcp_prewarm: true,
        },
      },
    },
  };
}

function contentTextFromMessage(message) {
  return (Array.isArray(message?.content) ? message.content : [])
    .map((part) => (typeof part?.text === "string" ? part.text : ""))
    .join("")
    .trim();
}

function findCompletedCommand(read, turnId, expectedCommand) {
  const items = Array.isArray(read?.detail?.items) ? read.detail.items : [];
  return items.find(
    (item) =>
      item?.type === "command_execution" &&
      item?.turn_id === turnId &&
      item?.status === "completed" &&
      item?.command === expectedCommand &&
      item?.exit_code === 0 &&
      String(item?.aggregated_output || "").includes(COMMAND_OUTPUT_MARKER),
  );
}

async function waitForTurnCompletion(
  client,
  { sessionId, turnId, expectedCommand, finalText, timeoutMs, intervalMs },
) {
  const startedAt = Date.now();
  let latestRead = null;
  while (Date.now() - startedAt < timeoutMs) {
    latestRead = await client.call("agentSession/read", {
      sessionId,
      historyLimit: 100,
    });
    const messages = Array.isArray(latestRead?.detail?.messages)
      ? latestRead.detail.messages
      : [];
    if (
      findCompletedCommand(latestRead, turnId, expectedCommand) &&
      messages.some(
        (message) =>
          message?.role === "assistant" &&
          contentTextFromMessage(message).includes(finalText),
      )
    ) {
      return latestRead;
    }
    await sleep(intervalMs);
  }
  throw new Error(
    `等待 unified exec turn 完成超时: session=${sessionId} turn=${turnId}`,
  );
}

async function updateSessionProvider(client, sessionId, provider) {
  return await client.call("agentSession/update", {
    sessionId,
    providerSelector: provider.providerPreference,
    providerName: provider.providerName,
    modelName: provider.modelPreference,
    executionStrategy: "react",
  });
}

async function startUnifiedExecTurn(
  client,
  { sessionId, turnId, text, provider, runtimeEnv },
) {
  return await client.call("agentSession/turn/start", {
    sessionId,
    turnId,
    input: { text, attachments: [] },
    runtimeOptions: runtimeOptions(
      provider,
      runtimeEnv.workspaceRoot,
      `codex_unified_exec_${turnId}`,
    ),
    queueIfBusy: false,
    skipPreSubmitResume: true,
  });
}

export async function runImportedAndNormalTurns(
  client,
  { importedSessionId, provider, runtimeEnv, command, options },
) {
  await updateSessionProvider(client, importedSessionId, provider);
  const importedTurn = await startUnifiedExecTurn(client, {
    sessionId: importedSessionId,
    turnId: IMPORTED_TURN_ID,
    text: IMPORTED_CONTINUE_TEXT,
    provider,
    runtimeEnv,
  });
  const importedRead = await waitForTurnCompletion(client, {
    sessionId: importedSessionId,
    turnId: IMPORTED_TURN_ID,
    expectedCommand: command,
    finalText: IMPORTED_FINAL_TEXT,
    timeoutMs: options.timeoutMs,
    intervalMs: options.intervalMs,
  });

  const normalSessionId = `codex-normal-unified-exec-${Date.now()}-${process.pid}`;
  const normalStart = await client.call("agentSession/start", {
    sessionId: normalSessionId,
    appId: "desktop",
    workspaceId: WORKSPACE_ID,
    businessObjectRef: {
      kind: "agent.session",
      id: `agent-session:${WORKSPACE_ID}:${normalSessionId}`,
      title: "Codex unified exec normal fixture",
      metadata: {
        title: "Codex unified exec normal fixture",
        executionStrategy: "react",
        runStartHooks: false,
        harness: { hiddenFromUserRecents: true },
      },
    },
  });
  await updateSessionProvider(client, normalSessionId, provider);
  const normalTurn = await startUnifiedExecTurn(client, {
    sessionId: normalSessionId,
    turnId: NORMAL_TURN_ID,
    text: NORMAL_USER_TEXT,
    provider,
    runtimeEnv,
  });
  const normalRead = await waitForTurnCompletion(client, {
    sessionId: normalSessionId,
    turnId: NORMAL_TURN_ID,
    expectedCommand: command,
    finalText: NORMAL_FINAL_TEXT,
    timeoutMs: options.timeoutMs,
    intervalMs: options.intervalMs,
  });
  return {
    importedTurn,
    importedRead,
    normalSessionId,
    normalStart,
    normalTurn,
    normalRead,
  };
}

function requestToolNames(body) {
  if (!Array.isArray(body?.tools)) {
    return [];
  }
  return body.tools
    .map((tool) =>
      String(
        tool?.function?.name || tool?.name || tool?.tool?.function?.name || "",
      ).trim(),
    )
    .filter(Boolean);
}

export function providerRequestSummaries(requests) {
  return requests.map((request, index) => ({
    index,
    path: request?.path || null,
    model: request?.body?.model || null,
    stream: request?.body?.stream === true,
    toolNames: requestToolNames(request?.body),
    responseKind: request?.responseKind || null,
    responseToolName: request?.responseToolName || null,
    responseError: request?.responseError || null,
  }));
}

function commandShape(item) {
  return {
    type: item?.type ?? null,
    status: item?.status ?? null,
    command: item?.command ?? null,
    cwd: item?.cwd ?? null,
    aggregated_output: item?.aggregated_output ?? null,
    exit_code: item?.exit_code ?? null,
  };
}

function historicalImportFacts(importedRead, runtimeEnv) {
  const detail = importedRead?.detail ?? {};
  const messages = Array.isArray(detail.messages) ? detail.messages : [];
  const items = Array.isArray(detail.items) ? detail.items : [];
  return {
    messagesLength: messages.length,
    itemsLength: items.length,
    hasUserMessage: messages.some(
      (message) =>
        message?.role === "user" &&
        contentTextFromMessage(message) === IMPORTED_USER_TEXT,
    ),
    hasAssistantMessage: messages.some(
      (message) =>
        message?.role === "assistant" &&
        contentTextFromMessage(message).includes(IMPORTED_ASSISTANT_TEXT),
    ),
    hasReasoningItem: items.some(
      (item) =>
        item?.type === "reasoning" && item?.text === IMPORTED_REASONING_TEXT,
    ),
    hasCommandItem: items.some(
      (item) =>
        item?.type === "command_execution" &&
        item?.command_id === "call_exec" &&
        item?.command === "npm test",
    ),
    hasPatchItem: items.some(
      (item) =>
        item?.type === "file_artifact" &&
        item?.path === path.join(runtimeEnv.workspaceRoot, "src/lib.rs"),
    ),
    hasWebSearchItem: items.some(
      (item) =>
        item?.type === "web_search" && item?.call_id === "call_search",
    ),
    hasApprovalItem: items.some(
      (item) =>
        item?.type === "approval_request" && item?.request_id === "call_exec",
    ),
  };
}

export function summarizeAndAssertFixture({
  client,
  initial,
  turns,
  providerRequestsAfterCommit,
  providerRequests,
  command,
  runtimeEnv,
}) {
  const requestMethods = Array.from(
    new Set(client.requests.map((request) => request.method)),
  );
  const providerSummaries = providerRequestSummaries(providerRequests);
  const importedCommand = findCompletedCommand(
    turns.importedRead,
    IMPORTED_TURN_ID,
    command,
  );
  const normalCommand = findCompletedCommand(
    turns.normalRead,
    NORMAL_TURN_ID,
    command,
  );
  const importedShape = commandShape(importedCommand);
  const normalShape = commandShape(normalCommand);
  const historical = historicalImportFacts(initial.importedRead, runtimeEnv);
  const retiredTools = ["Bash", "PowerShell", "BashTool", "PowerShellTool"];

  assert(providerRequestsAfterCommit === 0, "导入 commit 触发了 provider 请求");
  assert(
    REQUIRED_METHODS.every((method) => requestMethods.includes(method)),
    `缺少 App Server current method: ${REQUIRED_METHODS.filter(
      (method) => !requestMethods.includes(method),
    ).join(", ")}`,
  );
  assert(initial.commit?.canContinue === true, "导入会话未标记 canContinue");
  assert(historical.hasUserMessage, "导入用户消息未进入 read model");
  assert(historical.hasAssistantMessage, "导入助手消息未进入 read model");
  assert(historical.hasReasoningItem, "导入 reasoning 未进入 detail.items");
  assert(historical.hasCommandItem, "导入 command 未进入 detail.items");
  assert(historical.hasPatchItem, "导入 patch 未进入 detail.items");
  assert(historical.hasWebSearchItem, "导入 web_search 未进入 detail.items");
  assert(historical.hasApprovalItem, "导入 approval 未进入 detail.items");
  assert(importedCommand, "导入续聊未产生 completed Command Item");
  assert(normalCommand, "普通会话未产生 completed Command Item");
  assert(
    JSON.stringify(importedShape) === JSON.stringify(normalShape),
    `导入续聊与普通会话 Command Item 不同构: ${JSON.stringify({ importedShape, normalShape })}`,
  );
  assert(providerSummaries.length === 4, "两个 unified exec turn 应产生 4 次 provider 请求");
  for (const request of providerSummaries) {
    assert(
      request.toolNames.includes("exec_command") &&
        request.toolNames.includes("write_stdin"),
      `provider request 未暴露 unified exec pair: ${request.toolNames.join(", ")}`,
    );
    assert(
      retiredTools.every((toolName) => !request.toolNames.includes(toolName)),
      `provider request 仍暴露 retired shell tool: ${request.toolNames.join(", ")}`,
    );
  }

  return {
    requestMethods,
    sessionId: initial.sessionId,
    normalSessionId: turns.normalSessionId,
    providerRequestsAfterCommit,
    providerRequests: providerSummaries,
    historical,
    importedCommandShape: importedShape,
    normalCommandShape: normalShape,
    commandShapesIsomorphic:
      JSON.stringify(importedShape) === JSON.stringify(normalShape),
  };
}

export function summarizeAndAssertBridge(client) {
  const turnStartCount = client.requests.filter(
    (request) => request.method === "agentSession/turn/start",
  ).length;
  assert(client.bridgeFacts.length > 0, "未记录 Electron preload bridge facts");
  assert(
    client.bridgeFacts.every(
      (fact) => fact?.electron && fact?.hasInvoke && fact?.supportsCommand,
    ),
    "App Server 调用未全部经过真实 Electron preload bridge",
  );
  assert(turnStartCount === 2, "未通过 current method 发起导入/普通两次 turn start");
  return {
    electron: true,
    preloadInvoke: true,
    command: APP_SERVER_HANDLE_JSON_LINES_COMMAND,
    callCount: client.bridgeFacts.length,
    turnStartCount,
  };
}
