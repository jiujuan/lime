#!/usr/bin/env node

import process from "node:process";

const DEFAULT_LAUNCH_HTML =
  "<html><title>Lime Browser Runtime Smoke</title><body><h1>Lime Browser Runtime Smoke</h1><p>read_page smoke fixture</p></body></html>";
const DEFAULT_LAUNCH_URL = `data:text/html,${encodeURIComponent(
  DEFAULT_LAUNCH_HTML,
)}`;

const DEFAULTS = {
  healthUrl: "http://127.0.0.1:3030/health",
  invokeUrl: "http://127.0.0.1:3030/invoke",
  timeoutMs: 90_000,
  intervalMs: 1_000,
  launchUrl: DEFAULT_LAUNCH_URL,
  remoteDebuggingPort:
    process.env.LIME_BROWSER_RUNTIME_REMOTE_DEBUGGING_PORT ||
    process.env.CHROME_REMOTE_DEBUGGING_PORT ||
    "",
  targetId: "",
};

const APP_SERVER_HANDLE_JSON_LINES_COMMAND = "app_server_handle_json_lines";
const METHOD_BROWSER_SESSION_TARGET_LIST = "browserSession/target/list";
const METHOD_BROWSER_SESSION_OPEN = "browserSession/open";
const METHOD_BROWSER_SESSION_READ = "browserSession/read";
const METHOD_BROWSER_SESSION_CLOSE = "browserSession/close";
const METHOD_BROWSER_SESSION_EVENT_LIST = "browserSession/event/list";
const METHOD_BROWSER_SESSION_ACTION_EXECUTE = "browserSession/action/execute";
const INVOKE_TIMEOUT_CEILING_MS = 180_000;
const INVOKE_RETRY_COUNT = 10;
const INVOKE_RETRY_DELAY_MS = 1_000;
const POST_HEALTH_SETTLE_MS = 3_000;
const POST_LAUNCH_SETTLE_MS = 1_500;
const READ_PAGE_TIMEOUT_MS = 45_000;
const DEFAULT_SMOKE_PROFILE_KEY =
  process.env.LIME_BROWSER_RUNTIME_SMOKE_PROFILE_KEY ||
  `smoke-browser-runtime-${process.pid}`;

function printHelp() {
  console.log(`
Lime Browser Runtime Smoke

用途:
  验证 Browser Runtime CDP 最短 current 主链可用：
  DevBridge -> app_server_handle_json_lines -> browserSession/* -> browser-runtime。

前置条件:
  先启动 Electron DevBridge，并启动带 remote debugging port 的 Chrome / Chromium。
  示例：Google Chrome --remote-debugging-port=9222

用法:
  node scripts/browser-runtime-smoke.mjs [选项]

选项:
  --health-url <url>       DevBridge 健康检查地址，默认 http://127.0.0.1:3030/health
  --invoke-url <url>       DevBridge invoke 地址，默认 http://127.0.0.1:3030/invoke
  --timeout-ms <ms>        等待健康检查超时，默认 90000
  --interval-ms <ms>       健康检查轮询间隔，默认 1000
  --remote-debugging-port <port>
                          Chrome CDP 端口；也可用 LIME_BROWSER_RUNTIME_REMOTE_DEBUGGING_PORT
                          或 CHROME_REMOTE_DEBUGGING_PORT
  --target-id <id>         可选 CDP target id；缺省时选第一个 page target
  --launch-url <url>       attach 后导航到的 URL，默认使用内置 data: 测试页
  --profile-key <key>      smoke 专用浏览器 profile key，默认按进程隔离
  -h, --help               显示帮助
`);
}

function parsePort(value, label) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`${label} 必须是 1-65535 的整数`);
  }
  return port;
}

function parseArgs(argv) {
  const options = { ...DEFAULTS };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--health-url" && argv[index + 1]) {
      options.healthUrl = String(argv[index + 1]).trim();
      index += 1;
      continue;
    }
    if (arg === "--invoke-url" && argv[index + 1]) {
      options.invokeUrl = String(argv[index + 1]).trim();
      index += 1;
      continue;
    }
    if (arg === "--timeout-ms" && argv[index + 1]) {
      options.timeoutMs = Number(argv[index + 1]);
      index += 1;
      continue;
    }
    if (arg === "--interval-ms" && argv[index + 1]) {
      options.intervalMs = Number(argv[index + 1]);
      index += 1;
      continue;
    }
    if (arg === "--launch-url" && argv[index + 1]) {
      options.launchUrl = String(argv[index + 1]).trim();
      index += 1;
      continue;
    }
    if (arg === "--remote-debugging-port" && argv[index + 1]) {
      options.remoteDebuggingPort = String(argv[index + 1]).trim();
      index += 1;
      continue;
    }
    if (arg === "--target-id" && argv[index + 1]) {
      options.targetId = String(argv[index + 1]).trim();
      index += 1;
      continue;
    }
    if (arg === "--profile-key" && argv[index + 1]) {
      options.profileKey = String(argv[index + 1]).trim();
      index += 1;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
    throw new Error(`未知参数: ${arg}`);
  }

  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs < 1_000) {
    throw new Error("--timeout-ms 必须是 >= 1000 的数字");
  }
  if (!Number.isFinite(options.intervalMs) || options.intervalMs < 100) {
    throw new Error("--interval-ms 必须是 >= 100 的数字");
  }
  if (!options.remoteDebuggingPort) {
    throw new Error(
      "--remote-debugging-port 不能为空；请先启动带 remote debugging port 的 Chrome / Chromium",
    );
  }
  options.remoteDebuggingPort = parsePort(
    options.remoteDebuggingPort,
    "--remote-debugging-port",
  );
  if (!options.launchUrl) {
    throw new Error("--launch-url 不能为空");
  }
  if (!options.profileKey) {
    options.profileKey = DEFAULT_SMOKE_PROFILE_KEY;
  }

  return options;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function isTransientInvokeError(error) {
  return (
    error?.name === "TimeoutError" ||
    (error instanceof TypeError && error.message === "fetch failed")
  );
}

async function invoke(options, cmd, args) {
  const invokeTimeoutMs = Math.min(
    options.timeoutMs,
    INVOKE_TIMEOUT_CEILING_MS,
  );

  for (let attempt = 1; attempt <= INVOKE_RETRY_COUNT; attempt += 1) {
    try {
      const requestInit = {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ cmd, args }),
        signal: AbortSignal.timeout(invokeTimeoutMs),
      };
      const response = await fetch(options.invokeUrl, requestInit);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const payload = await response.json();
      if (payload?.error) {
        throw new Error(String(payload.error));
      }

      return payload?.result;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      if (!isTransientInvokeError(error) || attempt >= INVOKE_RETRY_COUNT) {
        if (error?.name === "TimeoutError") {
          throw new Error(
            `[smoke:browser-runtime] ${cmd} 超时，${invokeTimeoutMs}ms 内未收到 DevBridge 响应`,
          );
        }
        throw new Error(`[smoke:browser-runtime] ${cmd} 请求失败: ${detail}`);
      }
      console.warn(
        `[smoke:browser-runtime] ${cmd} 第 ${attempt} 次请求失败，${INVOKE_RETRY_DELAY_MS}ms 后重试: ${detail}`,
      );
      await sleep(INVOKE_RETRY_DELAY_MS);
    }
  }

  throw new Error(`[smoke:browser-runtime] ${cmd} 请求失败: unknown error`);
}

let appServerRequestSequence = 1;

function decodeJsonRpcMessages(response) {
  const responseLines = response?.result?.lines ?? response?.lines;
  const lines = Array.isArray(responseLines) ? responseLines : [];
  return lines
    .map((line) => {
      const text = typeof line === "string" ? line.trim() : "";
      if (!text) {
        return null;
      }
      try {
        return JSON.parse(text);
      } catch (error) {
        throw new Error(
          `解析 App Server JSON-RPC 响应失败: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    })
    .filter(Boolean);
}

async function invokeAppServerJsonRpc(options, method, params = {}) {
  const id = `browser-runtime-smoke-${appServerRequestSequence++}`;
  const response = await invoke(options, APP_SERVER_HANDLE_JSON_LINES_COMMAND, {
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
  const messages = decodeJsonRpcMessages(response);
  const errorMessage = messages.find(
    (message) => message?.id === id && message.error,
  );
  if (errorMessage) {
    const detail = JSON.stringify(errorMessage.error);
    throw new Error(`${method} App Server JSON-RPC error: ${detail}`);
  }
  const resultMessage = messages.find(
    (message) => message?.id === id && Object.hasOwn(message, "result"),
  );
  if (!resultMessage) {
    throw new Error(`${method} 未返回 App Server JSON-RPC result`);
  }
  return resultMessage.result;
}

async function waitForHealth(options) {
  const startedAt = Date.now();
  let lastError = null;

  while (Date.now() - startedAt < options.timeoutMs) {
    try {
      const response = await fetch(options.healthUrl, { method: "GET" });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      console.log(
        `[smoke:browser-runtime] DevBridge 已就绪 (${Date.now() - startedAt}ms)${
          payload?.status ? ` status=${payload.status}` : ""
        }`,
      );
      return;
    } catch (error) {
      lastError = error;
      await sleep(options.intervalMs);
    }
  }

  const detail =
    lastError instanceof Error
      ? lastError.message
      : String(lastError || "unknown error");
  throw new Error(
    `[smoke:browser-runtime] DevBridge 未就绪，请先启动 npm run electron:dev。最后错误: ${detail}`,
  );
}

function assertSessionState(
  session,
  { sessionId, profileKey, remoteDebuggingPort },
) {
  assert(
    session && typeof session === "object",
    "browserSession 返回的 session 不能为空",
  );
  if (sessionId) {
    assert(
      session.sessionId === sessionId,
      `browserSession 返回的 sessionId 不一致，expected=${sessionId} actual=${session.sessionId}`,
    );
  }
  assert(
    session.profileKey === profileKey,
    `browserSession 返回的 profileKey 不一致，expected=${profileKey} actual=${session.profileKey}`,
  );
  assert(
    session.remoteDebuggingPort === remoteDebuggingPort,
    `browserSession 返回的 remoteDebuggingPort 不一致，expected=${remoteDebuggingPort} actual=${session.remoteDebuggingPort}`,
  );
  assert(
    typeof session.targetId === "string" && session.targetId.trim(),
    "browserSession 未返回 targetId",
  );
  assert(session.connected === true, "browserSession 未处于 connected 状态");
}

function countResultArray(actionResponse, resultKey) {
  const values = actionResponse?.result?.[resultKey];
  return Array.isArray(values) ? values.length : 0;
}

function pageInfoFromAction(actionResponse) {
  return (
    actionResponse?.result?.page_info ||
    actionResponse?.result?.pageInfo ||
    actionResponse?.result?.tab ||
    null
  );
}

function assertActionTrace(actionResponse, { sessionId, action }) {
  const trace = actionResponse?.result?.browser_action_trace;
  assert(
    trace && typeof trace === "object",
    `browserSession/action/execute(${action}) 未返回 result.browser_action_trace`,
  );
  assert(
    trace.sessionId === sessionId,
    `browser_action_trace.sessionId 不一致，expected=${sessionId} actual=${trace.sessionId}`,
  );
  assert(
    trace.action === action,
    `browser_action_trace.action 不一致，expected=${action} actual=${trace.action}`,
  );
  assert(
    trace.status === "completed" && trace.success === true,
    `browser_action_trace 未标记 completed/success，status=${trace.status} success=${trace.success}`,
  );
  assert(
    typeof trace.actionId === "string" && trace.actionId.trim(),
    "browser_action_trace 未返回 actionId",
  );
  assert(
    actionResponse?.result?.actionId === trace.actionId,
    `result.actionId 与 browser_action_trace.actionId 不一致，result=${actionResponse?.result?.actionId} trace=${trace.actionId}`,
  );
  assert(
    Array.isArray(trace.evidenceRefs),
    "browser_action_trace.evidenceRefs 必须是数组",
  );
  assertEvidenceRef(
    trace.evidenceRefs,
    `browser_session:${sessionId}`,
    `${action} trace`,
  );
  assertEvidenceRef(
    trace.evidenceRefs,
    `browser_action:${sessionId}:${trace.actionId}`,
    `${action} trace`,
  );
  return trace;
}

function assertEvidenceRef(refs, expected, label) {
  assert(
    refs.includes(expected),
    `${label} 缺少 evidenceRef=${expected}，actual=${JSON.stringify(refs)}`,
  );
}

function assertFileEvidenceMetadata(
  actionResponse,
  { key, action, sessionId, actionId, artifactKind, evidenceKind },
) {
  const metadata = actionResponse?.result?.[key];
  assert(
    metadata && typeof metadata === "object",
    `browserSession/action/execute(${action}) 未返回 result.${key}`,
  );
  assert(
    metadata.artifactKind === artifactKind,
    `${key}.artifactKind 不一致，expected=${artifactKind} actual=${metadata.artifactKind}`,
  );
  assert(
    metadata.browserSessionId === sessionId,
    `${key}.browserSessionId 不一致，expected=${sessionId} actual=${metadata.browserSessionId}`,
  );
  assert(
    metadata.actionId === actionId,
    `${key}.actionId 不一致，expected=${actionId} actual=${metadata.actionId}`,
  );
  assert(
    typeof metadata.artifactPath === "string" && metadata.artifactPath.trim(),
    `${key}.artifactPath 不能为空`,
  );
  assert(
    Number.isInteger(metadata.entryCount) && metadata.entryCount >= 0,
    `${key}.entryCount 必须是非负整数`,
  );
  assert(
    Array.isArray(metadata.evidenceRefs),
    `${key}.evidenceRefs 必须是数组`,
  );
  assertEvidenceRef(
    metadata.evidenceRefs,
    `browser_action:${sessionId}:${actionId}`,
    key,
  );
  assertEvidenceRef(
    metadata.evidenceRefs,
    `${evidenceKind}:${sessionId}:${actionId}`,
    key,
  );
  return metadata;
}

function assertOptionalScreenshotMetadata(
  actionResponse,
  { sessionId, actionId },
) {
  if (!actionResponse?.result?.browser_screenshot) {
    console.warn(
      "[smoke:browser-runtime] read_page 未返回 browser_screenshot；Page.captureScreenshot 为 best-effort，本次只验证 browser_snapshot evidenceRef",
    );
    return null;
  }
  return assertFileEvidenceMetadata(actionResponse, {
    key: "browser_screenshot",
    action: "read_page",
    sessionId,
    actionId,
    artifactKind: "browser_screenshot",
    evidenceKind: "browser_screenshot",
  });
}

async function main() {
  if (typeof fetch !== "function") {
    throw new Error("当前 Node 运行时不支持 fetch，请使用 Node 18+");
  }

  const options = parseArgs(process.argv.slice(2));
  await waitForHealth(options);
  await sleep(POST_HEALTH_SETTLE_MS);

  const profileKey = options.profileKey;
  let sessionId = null;
  let cleanupStatus = "skipped";

  try {
    const targetList = await invokeAppServerJsonRpc(
      options,
      METHOD_BROWSER_SESSION_TARGET_LIST,
      {
        remoteDebuggingPort: options.remoteDebuggingPort,
      },
    );
    const targetCount = Array.isArray(targetList?.targets)
      ? targetList.targets.length
      : 0;
    console.log(
      `[smoke:browser-runtime] target/list remoteDebuggingPort=${options.remoteDebuggingPort} targets=${targetCount}`,
    );

    const openParams = {
      profileKey,
      remoteDebuggingPort: options.remoteDebuggingPort,
      launchUrl: options.launchUrl,
    };
    if (options.targetId) {
      openParams.targetId = options.targetId;
    }
    const openResponse = await invokeAppServerJsonRpc(
      options,
      METHOD_BROWSER_SESSION_OPEN,
      openParams,
    );

    sessionId = openResponse?.session?.sessionId ?? null;
    assert(
      typeof sessionId === "string" && sessionId.trim(),
      "browserSession/open 未返回 session.sessionId",
    );
    assertSessionState(openResponse.session, {
      sessionId,
      profileKey,
      remoteDebuggingPort: options.remoteDebuggingPort,
    });

    const sessionState = await invokeAppServerJsonRpc(
      options,
      METHOD_BROWSER_SESSION_READ,
      { sessionId },
    );
    assertSessionState(sessionState?.session, {
      sessionId,
      profileKey,
      remoteDebuggingPort: options.remoteDebuggingPort,
    });

    await sleep(POST_LAUNCH_SETTLE_MS);

    const actionResult = await invokeAppServerJsonRpc(
      options,
      METHOD_BROWSER_SESSION_ACTION_EXECUTE,
      {
        sessionId,
        action: "read_page",
        args: {
          timeout_ms: Math.min(options.timeoutMs, READ_PAGE_TIMEOUT_MS),
        },
      },
    );
    assert(
      actionResult?.sessionId === sessionId,
      "browserSession/action/execute(read_page) 未返回对应 sessionId",
    );
    assert(
      actionResult?.action === "read_page",
      "browserSession/action/execute(read_page) 未返回 action",
    );
    const pageInfo = pageInfoFromAction(actionResult);
    assert(
      pageInfo && typeof pageInfo === "object",
      "browserSession/action/execute(read_page) 未返回 page info",
    );
    const readPageTrace = assertActionTrace(actionResult, {
      sessionId,
      action: "read_page",
    });
    assertEvidenceRef(
      readPageTrace.evidenceRefs,
      `browser_snapshot:${sessionId}:${readPageTrace.actionId}`,
      "read_page trace",
    );
    assertOptionalScreenshotMetadata(actionResult, {
      sessionId,
      actionId: readPageTrace.actionId,
    });
    assertFileEvidenceMetadata(actionResult, {
      key: "browser_dom_snapshot",
      action: "read_page",
      sessionId,
      actionId: readPageTrace.actionId,
      artifactKind: "browser_dom_snapshot",
      evidenceKind: "browser_dom",
    });
    assertEvidenceRef(
      readPageTrace.evidenceRefs,
      `browser_dom:${sessionId}:${readPageTrace.actionId}`,
      "read_page trace",
    );
    assertFileEvidenceMetadata(actionResult, {
      key: "browser_accessibility_snapshot",
      action: "read_page",
      sessionId,
      actionId: readPageTrace.actionId,
      artifactKind: "browser_accessibility_snapshot",
      evidenceKind: "browser_accessibility",
    });
    assertEvidenceRef(
      readPageTrace.evidenceRefs,
      `browser_accessibility:${sessionId}:${readPageTrace.actionId}`,
      "read_page trace",
    );

    const consoleResult = await invokeAppServerJsonRpc(
      options,
      METHOD_BROWSER_SESSION_ACTION_EXECUTE,
      {
        sessionId,
        action: "read_console_messages",
        args: { since: 0 },
      },
    );
    assert(
      consoleResult?.sessionId === sessionId &&
        consoleResult?.action === "read_console_messages",
      "browserSession/action/execute(read_console_messages) 未返回对应结果",
    );
    const consoleTrace = assertActionTrace(consoleResult, {
      sessionId,
      action: "read_console_messages",
    });
    assertFileEvidenceMetadata(consoleResult, {
      key: "browser_console_log",
      action: "read_console_messages",
      sessionId,
      actionId: consoleTrace.actionId,
      artifactKind: "browser_console_log",
      evidenceKind: "browser_console",
    });
    assertEvidenceRef(
      consoleTrace.evidenceRefs,
      `browser_console:${sessionId}:${consoleTrace.actionId}`,
      "read_console_messages trace",
    );
    const consoleCount = countResultArray(consoleResult, "messages");

    const networkResult = await invokeAppServerJsonRpc(
      options,
      METHOD_BROWSER_SESSION_ACTION_EXECUTE,
      {
        sessionId,
        action: "read_network_requests",
        args: { since: 0 },
      },
    );
    assert(
      networkResult?.sessionId === sessionId &&
        networkResult?.action === "read_network_requests",
      "browserSession/action/execute(read_network_requests) 未返回对应结果",
    );
    const networkTrace = assertActionTrace(networkResult, {
      sessionId,
      action: "read_network_requests",
    });
    assertFileEvidenceMetadata(networkResult, {
      key: "browser_network_log",
      action: "read_network_requests",
      sessionId,
      actionId: networkTrace.actionId,
      artifactKind: "browser_network_log",
      evidenceKind: "browser_network",
    });
    assertEvidenceRef(
      networkTrace.evidenceRefs,
      `browser_network:${sessionId}:${networkTrace.actionId}`,
      "read_network_requests trace",
    );
    const networkCount = countResultArray(networkResult, "events");

    const eventList = await invokeAppServerJsonRpc(
      options,
      METHOD_BROWSER_SESSION_EVENT_LIST,
      {
        sessionId,
        cursor: 0,
      },
    );
    assert(
      Array.isArray(eventList?.events) &&
        typeof eventList?.nextCursor === "number",
      "browserSession/event/list 未返回 events / nextCursor",
    );
    const eventCount = eventList.events.length;

    console.log(
      `[smoke:browser-runtime] 通过 session=${sessionId} target=${sessionState.session.targetId} profile=${profileKey} readPageAction=${readPageTrace.actionId} consoleAction=${consoleTrace.actionId} networkAction=${networkTrace.actionId} consoleEvents=${consoleCount} networkEvents=${networkCount} browserEvents=${eventCount}`,
    );
  } finally {
    if (sessionId) {
      try {
        await invokeAppServerJsonRpc(options, METHOD_BROWSER_SESSION_CLOSE, {
          sessionId,
        });
        cleanupStatus = "pass";
      } catch (error) {
        cleanupStatus = "failed";
        console.warn(
          `[smoke:browser-runtime] 清理会话失败: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    console.log(
      `[smoke:browser-runtime] cleanup=${cleanupStatus} session=${sessionId ?? "none"} profile=${profileKey}`,
    );
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
