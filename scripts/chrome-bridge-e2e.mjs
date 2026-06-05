#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import process from "node:process";

const DEFAULTS = {
  server: "ws://127.0.0.1:8787",
  healthUrl: "http://127.0.0.1:3030/health",
  invokeUrl: "http://127.0.0.1:3030/invoke",
  key: "",
  profile: "default",
  timeoutMs: 15000,
  intervalMs: 1000,
  verifyForceDisconnect: true,
};

function parseArgs(argv) {
  const args = { ...DEFAULTS };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--server" && argv[i + 1]) {
      args.server = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === "--health-url" && argv[i + 1]) {
      args.healthUrl = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === "--invoke-url" && argv[i + 1]) {
      args.invokeUrl = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === "--key" && argv[i + 1]) {
      args.key = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === "--profile" && argv[i + 1]) {
      args.profile = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === "--timeout-ms" && argv[i + 1]) {
      args.timeoutMs = Number(argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg === "--interval-ms" && argv[i + 1]) {
      args.intervalMs = Number(argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg === "--skip-force-disconnect") {
      args.verifyForceDisconnect = false;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
  }
  return args;
}

function printHelp() {
  console.log(`
Lime Chrome Bridge E2E 联调脚本

用法:
  node scripts/chrome-bridge-e2e.mjs --key <lime_api_key> [选项]

选项:
  --server <ws_url>       服务地址，默认 ws://127.0.0.1:8787
  --health-url <url>      DevBridge 健康检查地址，默认 http://127.0.0.1:3030/health
  --invoke-url <url>      DevBridge invoke 地址，默认 http://127.0.0.1:3030/invoke
  --key <api_key>         Lime API Key（必填）
  --profile <profile_key> profileKey，默认 default
  --timeout-ms <ms>       单步超时毫秒，默认 15000
  --interval-ms <ms>      状态轮询间隔毫秒，默认 1000
  --skip-force-disconnect 跳过桌面端主动断开验证，仅校验 WebSocket 命令链路
  -h, --help              显示帮助

示例:
  node scripts/chrome-bridge-e2e.mjs --server ws://127.0.0.1:8787 --key proxy_cast --profile default
  node scripts/chrome-bridge-e2e.mjs --server ws://127.0.0.1:8787 --key proxy_cast --profile default --skip-force-disconnect
`);
}

function assertGlobalWebSocket() {
  if (typeof WebSocket !== "undefined") {
    return;
  }
  throw new Error(
    "当前 Node 运行时不支持全局 WebSocket，请使用 Node 22+ 或安装支持 WebSocket 的运行环境。",
  );
}

function normalizeServer(server) {
  return String(server || "")
    .trim()
    .replace(/\/$/, "");
}

function appendProfileKey(url, profileKey) {
  const endpoint = new URL(url);
  endpoint.searchParams.set("profileKey", profileKey);
  return endpoint.toString();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function invoke(invokeUrl, cmd, args) {
  const response = await fetch(invokeUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ cmd, args }),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const payload = await response.json();
  if (payload?.error) {
    throw new Error(String(payload.error));
  }

  return payload?.result;
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
        `[E2E] DevBridge 已就绪 (${Date.now() - startedAt}ms)${
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
    `[E2E] DevBridge 未就绪，请先启动 npm run electron:dev。最后错误: ${detail}`,
  );
}

function summarizeStatus(status) {
  if (!status || typeof status !== "object") {
    return "unknown";
  }

  return `observer=${status.observer_count ?? "?"}, control=${
    status.control_count ?? "?"
  }, pending=${status.pending_command_count ?? "?"}`;
}

function isStatusEmpty(status) {
  return (
    Number(status?.observer_count || 0) === 0 &&
    Number(status?.control_count || 0) === 0 &&
    Number(status?.pending_command_count || 0) === 0
  );
}

function hasObserverForProfile(status, profileKey) {
  return (status?.observers || []).some(
    (observer) => observer?.profile_key === profileKey,
  );
}

async function getBridgeStatus(invokeUrl) {
  return invoke(invokeUrl, "get_chrome_bridge_status");
}

async function waitForStatus(invokeUrl, predicate, timeoutMs, intervalMs, desc) {
  const startedAt = Date.now();
  let lastStatus = null;

  while (Date.now() - startedAt < timeoutMs) {
    lastStatus = await getBridgeStatus(invokeUrl);
    if (predicate(lastStatus)) {
      return lastStatus;
    }
    await sleep(intervalMs);
  }

  throw new Error(
    `[E2E] 等待桥接状态超时(${timeoutMs}ms): ${desc}\n最近状态: ${JSON.stringify(
      lastStatus,
      null,
      2,
    )}`,
  );
}

function toText(data) {
  if (typeof data === "string") return data;
  if (Buffer.isBuffer(data)) return data.toString("utf8");
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString("utf8");
  if (ArrayBuffer.isView(data))
    return Buffer.from(data.buffer).toString("utf8");
  return String(data);
}

function createClient(url, label, timeoutMs) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const state = {
      label,
      ws,
      messages: [],
      waiters: [],
    };

    const timer = setTimeout(() => {
      reject(new Error(`[${label}] 连接超时: ${url}`));
      try {
        ws.close();
      } catch (_) {
        // ignore
      }
    }, timeoutMs);

    ws.onopen = () => {
      clearTimeout(timer);
      resolve(state);
    };

    ws.onerror = (event) => {
      clearTimeout(timer);
      reject(
        new Error(
          `[${label}] WebSocket 连接失败: ${event?.message || "unknown error"}`,
        ),
      );
    };

    ws.onmessage = (event) => {
      let payload;
      const text = toText(event.data);
      try {
        payload = JSON.parse(text);
      } catch (_) {
        payload = { type: "raw_text", data: text };
      }
      state.messages.push(payload);

      const pending = [...state.waiters];
      for (const waiter of pending) {
        if (waiter.predicate(payload)) {
          waiter.resolve(payload);
          state.waiters = state.waiters.filter((item) => item !== waiter);
        }
      }
    };
  });
}

function waitForMessage(client, predicate, timeoutMs, desc) {
  const found = client.messages.find(predicate);
  if (found) {
    return Promise.resolve(found);
  }

  return new Promise((resolve, reject) => {
    const waiter = { predicate, resolve };
    client.waiters.push(waiter);
    const timer = setTimeout(() => {
      client.waiters = client.waiters.filter((item) => item !== waiter);
      reject(
        new Error(
          `[${client.label}] 等待消息超时(${timeoutMs}ms): ${desc}\n最近消息: ${JSON.stringify(
            client.messages.slice(-5),
            null,
            2,
          )}`,
        ),
      );
    }, timeoutMs);

    waiter.resolve = (payload) => {
      clearTimeout(timer);
      resolve(payload);
    };
  });
}

function send(client, payload) {
  client.ws.send(JSON.stringify(payload));
}

async function closeClient(client) {
  if (!client) return;
  await new Promise((resolve) => {
    try {
      client.ws.onclose = () => resolve();
      client.ws.close();
      setTimeout(resolve, 200);
    } catch (_) {
      resolve();
    }
  });
}

async function main() {
  if (typeof fetch !== "function") {
    throw new Error("当前 Node 运行时不支持 fetch，请使用 Node 18+");
  }
  assertGlobalWebSocket();
  const args = parseArgs(process.argv.slice(2));

  if (!args.key) {
    printHelp();
    throw new Error("缺少必填参数: --key");
  }
  if (!Number.isFinite(args.timeoutMs) || args.timeoutMs < 1000) {
    throw new Error("--timeout-ms 必须是 >= 1000 的数字");
  }
  if (!Number.isFinite(args.intervalMs) || args.intervalMs < 100) {
    throw new Error("--interval-ms 必须是 >= 100 的数字");
  }

  const server = normalizeServer(args.server);
  const key = encodeURIComponent(args.key);
  const profile = String(args.profile || "default").trim() || "default";
  let observerBaseUrl = `${server}/lime-chrome-observer/${key}`;
  let controlUrl = `${server}/lime-chrome-control/${key}`;
  let baselineStatus = null;
  if (args.verifyForceDisconnect) {
    console.log("[E2E] invoke  :", args.invokeUrl);
    await waitForHealth(args);
    const endpointInfo = await invoke(args.invokeUrl, "get_chrome_bridge_endpoint_info");
    if (typeof endpointInfo?.observer_ws_url === "string" && endpointInfo.observer_ws_url) {
      observerBaseUrl = endpointInfo.observer_ws_url;
    }
    if (typeof endpointInfo?.control_ws_url === "string" && endpointInfo.control_ws_url) {
      controlUrl = endpointInfo.control_ws_url;
    }
    if (
      typeof endpointInfo?.bridge_key === "string" &&
      endpointInfo.bridge_key &&
      endpointInfo.bridge_key !== args.key
    ) {
      console.warn(
        `[E2E] 传入 key 与当前运行态 bridge_key 不一致，将以运行态 endpoint 为准: cli=${args.key} runtime=${endpointInfo.bridge_key}`,
      );
    }
    baselineStatus = await getBridgeStatus(args.invokeUrl);
    console.log("[E2E] 基线状态:", summarizeStatus(baselineStatus));
    if (!isStatusEmpty(baselineStatus)) {
      console.warn(
        "[E2E] 检测到已有桥接连接，本次将校验 force_disconnect 消息和目标 profile 清理，但不强制要求全局状态归零。",
      );
    }
  }
  const observerUrl = appendProfileKey(observerBaseUrl, profile);

  console.log("[E2E] observer:", observerUrl);
  console.log("[E2E] control :", controlUrl);

  let observer;
  let control;

  try {
    observer = await createClient(observerUrl, "observer", args.timeoutMs);
    control = await createClient(controlUrl, "control", args.timeoutMs);

    await waitForMessage(
      observer,
      (msg) => msg.type === "connection_ack",
      args.timeoutMs,
      "observer connection_ack",
    );
    await waitForMessage(
      control,
      (msg) => msg.type === "connection_ack",
      args.timeoutMs,
      "control connection_ack",
    );
    console.log("[E2E] 连接握手通过");

    send(observer, { type: "heartbeat", timestamp: Date.now() });
    send(control, { type: "heartbeat", timestamp: Date.now() });

    await waitForMessage(
      observer,
      (msg) => msg.type === "heartbeat_ack",
      args.timeoutMs,
      "observer heartbeat_ack",
    );
    await waitForMessage(
      control,
      (msg) => msg.type === "heartbeat_ack",
      args.timeoutMs,
      "control heartbeat_ack",
    );
    console.log("[E2E] 心跳通道通过");

    const requestId1 = `e2e-${randomUUID()}`;
    send(control, {
      type: "command",
      data: {
        requestId: requestId1,
        command: "get_page_info",
        wait_for_page_info: true,
      },
    });

    const cmdFromServer1 = await waitForMessage(
      observer,
      (msg) => msg.type === "command" && msg.data?.requestId === requestId1,
      args.timeoutMs,
      "observer 收到 get_page_info 命令",
    );
    console.log("[E2E] observer 收到命令:", cmdFromServer1.data?.command);

    send(observer, {
      type: "command_result",
      data: {
        requestId: requestId1,
        status: "success",
        message: "get_page_info executed by e2e observer",
      },
    });
    send(observer, {
      type: "pageInfoUpdate",
      data: {
        markdown:
          "# E2E Page\nURL: https://example.com/e2e\n\n## 内容\nbridge e2e test",
      },
    });

    await waitForMessage(
      control,
      (msg) =>
        msg.type === "command_result" &&
        msg.data?.requestId === requestId1 &&
        msg.data?.status === "success",
      args.timeoutMs,
      "control 收到 command_result(success)",
    );
    await waitForMessage(
      control,
      (msg) =>
        msg.type === "page_info_update" &&
        msg.data?.requestId === requestId1 &&
        typeof msg.data?.markdown === "string" &&
        msg.data.markdown.includes("E2E Page"),
      args.timeoutMs,
      "control 收到 page_info_update",
    );
    console.log("[E2E] wait_for_page_info 命令链路通过");

    const requestId2 = `e2e-${randomUUID()}`;
    send(control, {
      type: "command",
      data: {
        requestId: requestId2,
        command: "scroll",
        text: "down:300",
        wait_for_page_info: false,
      },
    });

    const cmdFromServer2 = await waitForMessage(
      observer,
      (msg) => msg.type === "command" && msg.data?.requestId === requestId2,
      args.timeoutMs,
      "observer 收到 scroll 命令",
    );
    if (cmdFromServer2.data?.command !== "scroll") {
      throw new Error(
        `期望 scroll，实际为 ${cmdFromServer2.data?.command || "unknown"}`,
      );
    }
    send(observer, {
      type: "command_result",
      data: {
        requestId: requestId2,
        status: "success",
        message: "scroll executed by e2e observer",
      },
    });

    await waitForMessage(
      control,
      (msg) =>
        msg.type === "command_result" &&
        msg.data?.requestId === requestId2 &&
        msg.data?.status === "success",
      args.timeoutMs,
      "control 收到 scroll command_result",
    );
    console.log("[E2E] 非 wait_for_page_info 命令链路通过");

    if (args.verifyForceDisconnect) {
      const forceDisconnectObserver = waitForMessage(
        observer,
        (msg) => msg.type === "force_disconnect",
        args.timeoutMs,
        "observer 收到 force_disconnect",
      );
      const forceDisconnectControl = waitForMessage(
        control,
        (msg) => msg.type === "force_disconnect",
        args.timeoutMs,
        "control 收到 force_disconnect",
      );

      const disconnectResult = await invoke(
        args.invokeUrl,
        "disconnect_browser_connector_session",
        {
          profileKey: args.profile,
        },
      );

      assert(
        Number(disconnectResult?.disconnected_observer_count || 0) >= 1,
        `disconnect_browser_connector_session 未断开 observer: ${JSON.stringify(
          disconnectResult,
          null,
          2,
        )}`,
      );
      assert(
        Number(disconnectResult?.disconnected_control_count || 0) >= 1,
        `disconnect_browser_connector_session 未断开 control: ${JSON.stringify(
          disconnectResult,
          null,
          2,
        )}`,
      );

      await Promise.all([forceDisconnectObserver, forceDisconnectControl]);
      console.log("[E2E] force_disconnect 消息链路通过");

      const finalStatus = await waitForStatus(
        args.invokeUrl,
        (status) =>
          isStatusEmpty(baselineStatus)
            ? isStatusEmpty(status)
            : !hasObserverForProfile(status, args.profile),
        args.timeoutMs,
        args.intervalMs,
        isStatusEmpty(baselineStatus)
          ? "桥接状态归零"
          : `profile=${args.profile} observer 已清理`,
      );

      if (isStatusEmpty(baselineStatus)) {
        console.log("[E2E] force_disconnect 后状态归零:", summarizeStatus(finalStatus));
      } else {
        console.log(
          "[E2E] force_disconnect 后目标 profile 已清理:",
          summarizeStatus(finalStatus),
        );
      }
    }

    console.log("\n[E2E] ✅ Chrome Bridge 联调通过");
  } finally {
    await closeClient(control);
    await closeClient(observer);
  }
}

main().catch((error) => {
  console.error("\n[E2E] ❌ Chrome Bridge 联调失败");
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
