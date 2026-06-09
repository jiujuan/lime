#!/usr/bin/env node

import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const DEFAULTS = {
  healthUrl: "http://127.0.0.1:3030/health",
  invokeUrl: "http://127.0.0.1:3030/invoke",
  timeoutMs: 120_000,
  intervalMs: 1_000,
  evidenceDir: path.join(
    process.cwd(),
    ".lime",
    "qc",
    "gui-evidence",
    "mcp-current",
  ),
  prefix: "mcp-current",
  allowWriteFixture: false,
  cleanupFixture: true,
};

const APP_SERVER_HANDLE_JSON_LINES_COMMAND = "app_server_handle_json_lines";
const REQUIRED_READ_METHODS = [
  "mcpServer/list",
  "mcpServerStatus/list",
  "mcpTool/list",
  "mcpTool/listForContext",
  "mcpTool/search",
  "mcpPrompt/list",
  "mcpResource/list",
];
const FIXTURE_METHODS = [
  "mcpServer/create",
  "mcpServer/start",
  "mcpServerStatus/list",
  "mcpTool/list",
  "mcpTool/call",
  "mcpResource/list",
  "mcpResource/read",
  "mcpServer/stop",
  "mcpServer/delete",
];
const LEGACY_MCP_COMMANDS = [
  "get_mcp_servers",
  "mcp_list_servers_with_status",
  "mcp_list_tools",
  "mcp_list_tools_for_context",
  "mcp_search_tools",
  "mcp_call_tool",
  "mcp_call_tool_with_caller",
  "mcp_list_prompts",
  "mcp_get_prompt",
  "mcp_list_resources",
  "mcp_read_resource",
  "mcp_start_server",
  "mcp_stop_server",
  "add_mcp_server",
  "update_mcp_server",
  "delete_mcp_server",
  "toggle_mcp_server",
  "import_mcp_from_app",
  "sync_all_mcp_to_live",
];

function printHelp() {
  console.log(`
MCP Current Smoke

用途:
  通过 DevBridge /invoke 调用 app_server_handle_json_lines，验证 MCP 获取与使用
  走 App Server JSON-RPC current 主链，而不是旧 Tauri MCP facade。

用法:
  npm run smoke:mcp-current
  npm run smoke:mcp-current -- --allow-write-fixture

选项:
  --health-url <url>       DevBridge 健康检查地址，默认 http://127.0.0.1:3030/health
  --invoke-url <url>       DevBridge invoke 地址，默认 http://127.0.0.1:3030/invoke
  --timeout-ms <ms>        总超时，默认 120000
  --interval-ms <ms>       健康检查轮询间隔，默认 1000
  --evidence-dir <path>    证据目录，默认 .lime/qc/gui-evidence/mcp-current
  --prefix <name>          证据文件前缀，默认 mcp-current
  --allow-write-fixture    创建临时 stdio MCP server，覆盖 start / tool call / resource read
  --keep-fixture           保留本脚本创建的临时 fixture 目录
  -h, --help               显示帮助
`);
}

function parseArgs(argv) {
  const options = { ...DEFAULTS };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--health-url" && argv[index + 1]) {
      options.healthUrl = String(argv[++index]).trim();
      continue;
    }
    if (arg === "--invoke-url" && argv[index + 1]) {
      options.invokeUrl = String(argv[++index]).trim();
      continue;
    }
    if (arg === "--timeout-ms" && argv[index + 1]) {
      options.timeoutMs = Number(argv[++index]);
      continue;
    }
    if (arg === "--interval-ms" && argv[index + 1]) {
      options.intervalMs = Number(argv[++index]);
      continue;
    }
    if (arg === "--evidence-dir" && argv[index + 1]) {
      options.evidenceDir = path.resolve(String(argv[++index]).trim());
      continue;
    }
    if (arg === "--prefix" && argv[index + 1]) {
      options.prefix = String(argv[++index]).trim();
      continue;
    }
    if (arg === "--allow-write-fixture") {
      options.allowWriteFixture = true;
      continue;
    }
    if (arg === "--keep-fixture") {
      options.cleanupFixture = false;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
    throw new Error(`未知参数: ${arg}`);
  }

  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs < 30_000) {
    throw new Error("--timeout-ms 必须是 >= 30000 的数字");
  }
  if (!Number.isFinite(options.intervalMs) || options.intervalMs < 100) {
    throw new Error("--interval-ms 必须是 >= 100 的数字");
  }
  if (!options.healthUrl) {
    throw new Error("--health-url 不能为空");
  }
  if (!options.invokeUrl) {
    throw new Error("--invoke-url 不能为空");
  }
  if (!options.evidenceDir) {
    throw new Error("--evidence-dir 不能为空");
  }
  if (!options.prefix) {
    throw new Error("--prefix 不能为空");
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

function parseJson(value) {
  if (!value) {
    return null;
  }
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function parseJsonRpcLine(line) {
  const trimmed = String(line || "").trim();
  if (!trimmed) {
    return null;
  }
  try {
    const parsed = JSON.parse(trimmed);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function decodeJsonRpcLines(lines) {
  return Array.isArray(lines)
    ? lines.map(parseJsonRpcLine).filter(Boolean)
    : [];
}

function sanitizeText(value) {
  const sanitized = String(value ?? "")
    .replace(
      /((?:api[_-]?key|authorization|password|secret|session|token)[^=\s]*=)(["']?)[^\s"']+/gi,
      "$1$2[redacted]",
    )
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, "$1[redacted]");
  return sanitized.length > 1_200
    ? `${sanitized.slice(0, 1_200)}... [truncated ${sanitized.length - 1_200} chars]`
    : sanitized;
}

function sanitizeJson(value, depth = 0) {
  if (depth > 5) {
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
    return value.slice(0, 40).map((item) => sanitizeJson(item, depth + 1));
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 80)
        .map(([key, item]) => [key, sanitizeJson(item, depth + 1)]),
    );
  }
  return sanitizeText(String(value));
}

function writeJsonFile(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function waitForHealth(options) {
  const startedAt = Date.now();
  let lastError = null;

  while (Date.now() - startedAt < options.timeoutMs) {
    try {
      const response = await fetch(options.healthUrl, {
        signal: AbortSignal.timeout(Math.min(5_000, options.timeoutMs)),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      console.log(
        `[smoke:mcp-current] DevBridge 已就绪 (${Date.now() - startedAt}ms) status=${payload?.status ?? response.status}`,
      );
      return payload;
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
    `[smoke:mcp-current] DevBridge 未就绪，请先启动 npm run electron:dev。最后错误: ${detail}`,
  );
}

function collectInvokeEntry(requestPayload, responsePayload, url) {
  const requestLines =
    requestPayload?.request?.lines ??
    requestPayload?.args?.request?.lines ??
    requestPayload?.payload?.lines ??
    requestPayload?.lines;
  const responseLines =
    responsePayload?.result?.result?.lines ??
    responsePayload?.result?.lines ??
    responsePayload?.request?.lines ??
    responsePayload?.lines;
  const requestMessages = decodeJsonRpcLines(requestLines);
  const responseMessages = decodeJsonRpcLines(responseLines);
  const responseById = new Map(
    responseMessages
      .filter((message) => message && message.id !== undefined)
      .map((message) => [message.id, message]),
  );

  return {
    url: sanitizeText(url),
    cmd: requestPayload?.cmd ?? null,
    appServerRequests: requestMessages
      .filter((message) => typeof message?.method === "string")
      .map((message) => ({
        id: message.id ?? null,
        method: message.method,
        params: sanitizeJson(message.params ?? {}),
        response: sanitizeJson(responseById.get(message.id) ?? null),
      })),
    responseMessageCount: responseMessages.length,
    responseMessages: responseMessages.map(sanitizeJson),
  };
}

function parseAppServerResponseMessages(responsePayload) {
  const responseLines =
    responsePayload?.result?.result?.lines ??
    responsePayload?.result?.lines ??
    responsePayload?.lines;
  return decodeJsonRpcLines(responseLines);
}

async function invokeBridgeCommand(options, cmd, args, entries) {
  const requestPayload = { cmd, args };
  const response = await fetch(options.invokeUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(requestPayload),
    signal: AbortSignal.timeout(options.timeoutMs),
  });
  const text = await response.text();
  const responsePayload = parseJson(text);
  if (responsePayload) {
    entries.push(
      collectInvokeEntry(requestPayload, responsePayload, options.invokeUrl),
    );
  }
  if (!response.ok) {
    throw new Error(`${cmd} HTTP ${response.status}: ${sanitizeText(text)}`);
  }
  if (responsePayload?.error) {
    throw new Error(`${cmd} error: ${sanitizeText(responsePayload.error)}`);
  }
  if (!responsePayload) {
    throw new Error(`${cmd} returned non-JSON response`);
  }
  return responsePayload;
}

let appServerRequestId = 1;

async function invokeAppServerMethod(options, method, params, entries) {
  const id = `mcp-current-${appServerRequestId++}`;
  const request =
    params === undefined ? { id, method } : { id, method, params };
  const responsePayload = await invokeBridgeCommand(
    options,
    APP_SERVER_HANDLE_JSON_LINES_COMMAND,
    { request: { lines: [`${JSON.stringify(request)}\n`] } },
    entries,
  );
  const messages = parseAppServerResponseMessages(responsePayload);
  const error = messages.find((message) => message.id === id && message.error);
  if (error) {
    throw new Error(
      `${method} error: ${error.error?.message || "App Server JSON-RPC error"}`,
    );
  }
  const response = messages.find(
    (message) => message.id === id && Object.hasOwn(message, "result"),
  );
  if (!response) {
    throw new Error(`${method} missing App Server response`);
  }
  return response.result;
}

function assertArrayField(method, result, field) {
  assert(
    result && typeof result === "object" && Array.isArray(result[field]),
    `${method} did not return ${field}`,
  );
  return result[field];
}

function assertEmptyObject(method, result) {
  assert(
    result && typeof result === "object" && !Array.isArray(result),
    `${method} did not return object result`,
  );
  assert(
    Object.keys(result).length === 0,
    `${method} did not return empty lifecycle result`,
  );
}

function assertToolResult(method, result, expectedText) {
  assert(
    result && typeof result === "object" && Array.isArray(result.content),
    `${method} did not return content`,
  );
  assert(result.is_error === false, `${method} returned is_error=true`);
  assert(
    result.content.some(
      (item) => item?.type === "text" && item?.text === expectedText,
    ),
    `${method} did not return expected text ${expectedText}`,
  );
}

function assertResourceResult(method, result, expectedText) {
  assert(
    result && typeof result === "object" && result.uri === "fixture://status",
    `${method} did not return fixture resource uri`,
  );
  assert(result.text === expectedText, `${method} did not return expected text`);
}

function summarizeInvokeEntries(entries) {
  const appServerRequests = entries.flatMap((entry) => entry.appServerRequests);
  const appServerMethodsSeen = Array.from(
    new Set(appServerRequests.map((request) => request.method)),
  ).sort();
  const legacyMcpCommandsSeen = Array.from(
    new Set(
      entries
        .map((entry) =>
          typeof entry.cmd === "string" &&
          LEGACY_MCP_COMMANDS.includes(entry.cmd)
            ? entry.cmd
            : null,
        )
        .filter(Boolean),
    ),
  ).sort();
  const appServerHandleJsonLinesSeen = entries.some(
    (entry) => entry.cmd === APP_SERVER_HANDLE_JSON_LINES_COMMAND,
  );
  const responses = new Map();
  for (const request of appServerRequests) {
    responses.set(request.method, request.response);
  }

  return {
    appServerHandleJsonLinesSeen,
    appServerMethodsSeen,
    legacyMcpCommandsSeen,
    missingReadMethods: REQUIRED_READ_METHODS.filter(
      (method) => !appServerMethodsSeen.includes(method),
    ),
    missingFixtureMethods: FIXTURE_METHODS.filter(
      (method) => !appServerMethodsSeen.includes(method),
    ),
    mcpCounts: {
      servers: Array.isArray(responses.get("mcpServer/list")?.result?.servers)
        ? responses.get("mcpServer/list").result.servers.length
        : null,
      statusServers: Array.isArray(
        responses.get("mcpServerStatus/list")?.result?.servers,
      )
        ? responses.get("mcpServerStatus/list").result.servers.length
        : null,
      tools: Array.isArray(responses.get("mcpTool/list")?.result?.tools)
        ? responses.get("mcpTool/list").result.tools.length
        : null,
      prompts: Array.isArray(responses.get("mcpPrompt/list")?.result?.prompts)
        ? responses.get("mcpPrompt/list").result.prompts.length
        : null,
      resources: Array.isArray(
        responses.get("mcpResource/list")?.result?.resources,
      )
        ? responses.get("mcpResource/list").result.resources.length
        : null,
    },
  };
}

async function writeMcpFixture() {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "lime-mcp-current-"));
  const serverPath = path.join(root, "mcp-current-fixture.mjs");
  await fsp.writeFile(
    serverPath,
    `import readline from "node:readline";

const rl = readline.createInterface({
  input: process.stdin,
  crlfDelay: Infinity,
});

function send(message) {
  process.stdout.write(\`\${JSON.stringify(message)}\\n\`);
}

function result(id, value) {
  send({ jsonrpc: "2.0", id, result: value });
}

function error(id, code, message) {
  send({ jsonrpc: "2.0", id, error: { code, message } });
}

rl.on("line", (line) => {
  if (!line.trim()) return;
  const message = JSON.parse(line);
  const { id, method, params } = message;

  if (method === "initialize") {
    result(id, {
      protocolVersion: "2025-03-26",
      capabilities: {
        tools: {},
        resources: {},
      },
      serverInfo: {
        name: "fixture-mcp",
        version: "1.0.0",
      },
    });
    return;
  }

  if (method === "notifications/initialized") return;

  if (method === "tools/list") {
    result(id, {
      tools: [
        {
          name: "echo",
          description: "Echo a message for current MCP tests",
          inputSchema: {
            type: "object",
            properties: {
              message: { type: "string" },
            },
          },
        },
      ],
    });
    return;
  }

  if (method === "tools/call") {
    result(id, {
      content: [
        {
          type: "text",
          text: \`echo: \${params?.arguments?.message ?? ""}\`,
        },
      ],
      isError: false,
    });
    return;
  }

  if (method === "resources/list") {
    result(id, {
      resources: [
        {
          uri: "fixture://status",
          name: "status",
          description: "Current MCP fixture status",
          mimeType: "text/plain",
        },
      ],
    });
    return;
  }

  if (method === "resources/read") {
    result(id, {
      contents: [
        {
          uri: params?.uri ?? "fixture://status",
          mimeType: "text/plain",
          text: "fixture resource ok",
        },
      ],
    });
    return;
  }

  error(id, -32601, \`unsupported fixture method: \${method}\`);
});
`,
    "utf8",
  );
  return { root, serverPath };
}

async function runReadChecks(options, entries) {
  assertArrayField(
    "mcpServer/list",
    await invokeAppServerMethod(options, "mcpServer/list", {}, entries),
    "servers",
  );
  assertArrayField(
    "mcpServerStatus/list",
    await invokeAppServerMethod(options, "mcpServerStatus/list", {}, entries),
    "servers",
  );
  assertArrayField(
    "mcpTool/list",
    await invokeAppServerMethod(options, "mcpTool/list", {}, entries),
    "tools",
  );
  assertArrayField(
    "mcpTool/listForContext",
    await invokeAppServerMethod(
      options,
      "mcpTool/listForContext",
      { caller: "assistant", includeDeferred: true },
      entries,
    ),
    "tools",
  );
  assertArrayField(
    "mcpTool/search",
    await invokeAppServerMethod(
      options,
      "mcpTool/search",
      { query: "fixture", caller: "tool_search", limit: 5 },
      entries,
    ),
    "tools",
  );
  assertArrayField(
    "mcpPrompt/list",
    await invokeAppServerMethod(options, "mcpPrompt/list", {}, entries),
    "prompts",
  );
  assertArrayField(
    "mcpResource/list",
    await invokeAppServerMethod(options, "mcpResource/list", {}, entries),
    "resources",
  );
}

async function runFixtureChecks(options, entries, fixture) {
  const serverId = `mcp-current-${Date.now()}`;
  const serverName = serverId.replace(/[^a-zA-Z0-9_-]/g, "-");

  try {
    assertArrayField(
      "mcpServer/create",
      await invokeAppServerMethod(
        options,
        "mcpServer/create",
        {
          server: {
            id: serverId,
            name: serverName,
            description: "Current MCP JSON-RPC smoke fixture",
            server_config: {
              command: "node",
              args: [fixture.serverPath],
              cwd: fixture.root,
              timeout: 3,
            },
            enabled_lime: true,
            enabled_claude: false,
            enabled_codex: false,
            enabled_gemini: false,
            created_at: Date.now(),
          },
        },
        entries,
      ),
      "servers",
    );

    assertEmptyObject(
      "mcpServer/start",
      await invokeAppServerMethod(
        options,
        "mcpServer/start",
        { name: serverName },
        entries,
      ),
    );

    const statusServers = assertArrayField(
      "mcpServerStatus/list",
      await invokeAppServerMethod(options, "mcpServerStatus/list", {}, entries),
      "servers",
    );
    assert(
      statusServers.some(
        (server) =>
          server?.name === serverName &&
          server?.is_running === true &&
          server?.server_info?.supports_tools === true &&
          server?.server_info?.supports_resources === true,
      ),
      "mcpServerStatus/list did not report running fixture capabilities",
    );

    const tools = assertArrayField(
      "mcpTool/list",
      await invokeAppServerMethod(options, "mcpTool/list", {}, entries),
      "tools",
    );
    const fixtureToolName = `mcp__${serverName}__echo`;
    assert(
      tools.some((tool) => tool?.name === fixtureToolName),
      `mcpTool/list did not return ${fixtureToolName}`,
    );

    assertToolResult(
      "mcpTool/call",
      await invokeAppServerMethod(
        options,
        "mcpTool/call",
        {
          toolName: fixtureToolName,
          arguments: { message: "hello current MCP" },
        },
        entries,
      ),
      "echo: hello current MCP",
    );

    const resources = assertArrayField(
      "mcpResource/list",
      await invokeAppServerMethod(options, "mcpResource/list", {}, entries),
      "resources",
    );
    assert(
      resources.some((resource) => resource?.uri === "fixture://status"),
      "mcpResource/list did not return fixture://status",
    );

    assertResourceResult(
      "mcpResource/read",
      await invokeAppServerMethod(
        options,
        "mcpResource/read",
        { uri: "fixture://status" },
        entries,
      ),
      "fixture resource ok",
    );

    return { serverId, serverName, fixtureToolName };
  } finally {
    await invokeAppServerMethod(
      options,
      "mcpServer/stop",
      { name: serverName },
      entries,
    ).catch((error) => {
      console.warn(
        `[smoke:mcp-current] fixture stop failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    });
    await invokeAppServerMethod(
      options,
      "mcpServer/delete",
      { id: serverId },
      entries,
    ).catch((error) => {
      console.warn(
        `[smoke:mcp-current] fixture delete failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    });
  }
}

async function run() {
  if (typeof fetch !== "function") {
    throw new Error("当前 Node 运行时不支持 fetch，请使用 Node 18+");
  }

  const options = parseArgs(process.argv.slice(2));
  fs.mkdirSync(options.evidenceDir, { recursive: true });

  const summaryPath = path.join(
    options.evidenceDir,
    `${options.prefix}-summary.json`,
  );
  const networkPath = path.join(
    options.evidenceDir,
    `${options.prefix}-network-invoke.json`,
  );
  const invokeEntries = [];
  let fixture = null;

  const summary = {
    ok: false,
    checkedAt: new Date().toISOString(),
    healthUrl: options.healthUrl,
    invokeUrl: options.invokeUrl,
    smokeMode: options.allowWriteFixture
      ? "direct-devbridge-app-server-json-rpc-with-stdio-fixture"
      : "direct-devbridge-app-server-json-rpc-read-only",
    classification:
      "MCP current path must use app_server_handle_json_lines -> App Server JSON-RPC; legacy mcp_* Tauri facade is guard-only.",
    allowWriteFixture: options.allowWriteFixture,
    cleanupFixture: options.cleanupFixture,
    health: null,
    fixture: null,
    appServerHandleJsonLinesSeen: false,
    appServerMethodsSeen: [],
    legacyMcpCommandsSeen: [],
    missingReadMethods: [...REQUIRED_READ_METHODS],
    missingFixtureMethods: options.allowWriteFixture ? [...FIXTURE_METHODS] : [],
    mcpCounts: {
      servers: null,
      statusServers: null,
      tools: null,
      prompts: null,
      resources: null,
    },
    network: networkPath,
    summary: summaryPath,
  };

  try {
    console.log(
      "[smoke:mcp-current] live_provider_submission=status:not_submitted reason:本 smoke 只验证 MCP current JSON-RPC，不提交 Agent turn。",
    );
    summary.health = await waitForHealth(options);

    await runReadChecks(options, invokeEntries);

    if (options.allowWriteFixture) {
      fixture = await writeMcpFixture();
      summary.fixture = sanitizeJson({
        root: fixture.root,
        serverPath: fixture.serverPath,
      });
      Object.assign(
        summary.fixture,
        await runFixtureChecks(options, invokeEntries, fixture),
      );
    }

    const observed = summarizeInvokeEntries(invokeEntries);
    Object.assign(summary, observed);

    writeJsonFile(networkPath, {
      entries: invokeEntries,
      summary: observed,
    });

    assert(
      summary.health?.transport === "electron-host",
      `DevBridge transport 应为 electron-host，实际 ${summary.health?.transport ?? "unknown"}`,
    );
    assert(
      summary.appServerHandleJsonLinesSeen,
      "未观察到 app_server_handle_json_lines",
    );
    assert(
      summary.missingReadMethods.length === 0,
      `缺少 MCP read current methods: ${summary.missingReadMethods.join(", ")}`,
    );
    if (options.allowWriteFixture) {
      assert(
        summary.missingFixtureMethods.length === 0,
        `缺少 MCP fixture current methods: ${summary.missingFixtureMethods.join(", ")}`,
      );
      assert(
        summary.fixture?.fixtureToolName,
        "未记录 fixture MCP tool name",
      );
    }
    assert(
      summary.legacyMcpCommandsSeen.length === 0,
      `观察到 legacy MCP 命令: ${summary.legacyMcpCommandsSeen.join(", ")}`,
    );

    summary.ok = true;
    writeJsonFile(summaryPath, summary);
    console.log(`[smoke:mcp-current] summary=${summaryPath}`);
  } catch (error) {
    summary.error = error instanceof Error ? error.message : String(error);
    const observed = summarizeInvokeEntries(invokeEntries);
    Object.assign(summary, observed);
    writeJsonFile(networkPath, {
      entries: invokeEntries,
      summary: observed,
    });
    writeJsonFile(summaryPath, summary);

    console.error(`[smoke:mcp-current] summary=${summaryPath}`);
    throw error;
  } finally {
    if (fixture && options.cleanupFixture) {
      await fsp.rm(fixture.root, { recursive: true, force: true });
    }
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
