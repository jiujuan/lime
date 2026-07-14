import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export function makeDeferredMcpToolSearchServerName() {
  return `DeferredToolSearch${Date.now().toString(36)}${process.pid.toString(36)}`;
}

export function buildDeferredMcpToolSearchFixtureResponses({
  deferredToolName,
  toolCall,
}) {
  return [
    toolCall("tool_search", "call-tool-exec-deferred-tool-search", {
      query: `select:${deferredToolName}`,
      max_results: 10,
    }),
    toolCall(deferredToolName, "call-tool-exec-deferred-mcp-tool", {
      message: "LIME_DEFERRED_MCP_TOOL_OK",
    }),
    {
      type: "text",
      content: "AGENT_RUNTIME_DEFERRED_MCP_TOOLSEARCH_DONE",
    },
  ];
}

function writeDeferredMcpToolSearchFixture() {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "lime-mcp-deferred-tool-search-"),
  );
  const serverPath = path.join(root, "deferred-tool-search-fixture.mjs");
  fs.writeFileSync(
    serverPath,
    String.raw`import readline from "node:readline";

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });

function send(message) {
  process.stdout.write(JSON.stringify(message) + "\n");
}

function result(id, value) {
  send({ jsonrpc: "2.0", id, result: value });
}

rl.on("line", (line) => {
  if (!line.trim()) return;
  const message = JSON.parse(line);
  const { id, method, params } = message;
  if (method === "initialize") {
    result(id, {
      protocolVersion: "2025-03-26",
      capabilities: { tools: {} },
      serverInfo: { name: "deferred-tool-search-fixture", version: "1.0.0" },
    });
    return;
  }
  if (method === "notifications/initialized") return;
  if (method === "tools/list") {
    result(id, {
      tools: [{
        name: "deferred_echo",
        description: "Deferred MCP tool used only by the S4l next-step Gate B",
        inputSchema: {
          type: "object",
          "x-lime": {
            deferred_loading: true,
            always_visible: false,
            allowed_callers: ["assistant", "tool_search"],
          },
          properties: { message: { type: "string" } },
          required: ["message"],
          additionalProperties: false,
        },
      }],
    });
    return;
  }
  if (method === "tools/call") {
    const messageText = String(params?.arguments?.message ?? "");
    result(id, {
      content: [{ type: "text", text: "LIME_DEFERRED_MCP_TOOL_OK:" + messageText }],
      structuredContent: {
        fixture: "deferred-tool-search",
        message: messageText,
      },
      isError: false,
    });
    return;
  }
  send({
    jsonrpc: "2.0",
    id,
    error: { code: -32601, message: "unsupported fixture method: " + method },
  });
});
`,
    "utf8",
  );
  return { root, serverPath };
}

async function waitForDeferredMcpTool({
  options,
  toolName,
  invokeAppServerMethod,
  sleep,
}) {
  const startedAt = Date.now();
  let latestTools = [];
  while (Date.now() - startedAt < Math.min(60_000, options.timeoutMs)) {
    const response = await invokeAppServerMethod(options, "mcpTool/search", {
      query: toolName,
      caller: "tool_search",
      limit: 10,
    });
    latestTools = Array.isArray(response?.tools) ? response.tools : [];
    const found = latestTools.find((tool) => tool?.name === toolName);
    if (found) {
      return {
        found: true,
        deferredLoading:
          found?.deferred_loading ?? found?.deferredLoading ?? null,
      };
    }
    await sleep(options.intervalMs);
  }
  throw new Error(
    `deferred MCP tool was not discoverable by tool_search: ${toolName}; latest=${JSON.stringify(latestTools)}`,
  );
}

export async function createDeferredMcpToolSearchServer({
  options,
  serverName,
  mcpRuntimeToolName,
  invokeAppServerMethod,
  sleep,
}) {
  const fixture = writeDeferredMcpToolSearchFixture();
  const serverId = `mcp-deferred-tool-search-${Date.now()}-${process.pid}`;
  const deferredToolName = mcpRuntimeToolName(serverName, "deferred_echo");
  try {
    const result = await invokeAppServerMethod(
      options,
      "mcpServer/create",
      {
        server: {
          id: serverId,
          name: serverName,
          description: "Deferred MCP tool_search Gate B fixture",
          server_config: {
            command: process.execPath,
            args: [fixture.serverPath],
            cwd: fixture.root,
            timeout: 5,
            tool_timeout: 5,
          },
          enabled_lime: true,
          enabled_claude: false,
          enabled_codex: false,
          enabled_gemini: false,
          created_at: Date.now(),
        },
      },
      30_000,
    );
    const serverCreated = Array.isArray(result?.servers)
      ? result.servers.some(
          (server) => server?.id === serverId || server?.name === serverName,
        )
      : false;
    await invokeAppServerMethod(
      options,
      "mcpServer/start",
      { name: serverName },
      30_000,
    );
    const discovery = await waitForDeferredMcpTool({
      options,
      toolName: deferredToolName,
      invokeAppServerMethod,
      sleep,
    });
    return {
      fixture,
      serverId,
      serverName,
      serverCreated,
      deferredToolName,
      deferredToolFoundByCurrentSearch: discovery.found,
      deferredToolSearchMetadata: discovery,
    };
  } catch (error) {
    fs.rmSync(fixture.root, { recursive: true, force: true });
    throw error;
  }
}

export async function cleanupDeferredMcpToolSearchServer({
  options,
  context,
  invokeAppServerMethod,
  logPrefix,
}) {
  if (!context) {
    return;
  }
  if (context.serverName) {
    await invokeAppServerMethod(
      options,
      "mcpServer/stop",
      { name: context.serverName },
      30_000,
    ).catch((error) => {
      console.warn(
        `${logPrefix} deferred MCP stop failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    });
  }
  if (context.serverId) {
    await invokeAppServerMethod(
      options,
      "mcpServer/delete",
      { id: context.serverId },
      30_000,
    ).catch((error) => {
      console.warn(
        `${logPrefix} deferred MCP delete failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    });
  }
  if (context.fixture?.root) {
    fs.rmSync(context.fixture.root, { recursive: true, force: true });
  }
}

export async function runDeferredMcpNewTurnIsolation({
  options,
  sessionId,
  workspaceId,
  fixtureRequests,
  provider,
  turnMetadata,
  startAgentSessionTurnCurrent,
  readAgentRuntimeThreadCurrent,
  summarizeThreadRead,
  threadSettled,
  fixtureChatRequestCount,
  providerRequestSummaries,
  assertSmoke,
  sleep,
  logPrefix,
}) {
  assertSmoke(
    Array.isArray(fixtureRequests),
    "deferred MCP Gate B fixture 缺少 provider request ledger",
  );
  const requestOffset = fixtureRequests.length;
  const turnId = `deferred-tool-isolation-${Date.now()}-${process.pid}`;
  const eventName = `app_server_deferred_tool_isolation_${turnId}`;
  console.log(`${logPrefix} stage=submit-deferred-new-turn`);
  await startAgentSessionTurnCurrent(options, {
    sessionId,
    workspaceId,
    message:
      "开始一个新的独立回合，只回答当前已见信息，不调用或重新选择前一回合的 MCP 工具。",
    eventName,
    turnId,
    runtimeRequest: {
      providerPreference: provider.providerPreference,
      modelPreference: provider.modelPreference,
      providerConfig: provider.providerConfig,
      approvalPolicy: "never",
      sandboxPolicy: "danger-full-access",
      metadata: turnMetadata,
    },
    skipPreSubmitResume: true,
  });

  const startedAt = Date.now();
  let lastSnapshot = null;
  const requiredRequestCount = requestOffset + 1;
  console.log(`${logPrefix} stage=wait-deferred-new-turn`);
  while (Date.now() - startedAt < options.timeoutMs) {
    const threadRead = await readAgentRuntimeThreadCurrent(options, sessionId, {
      historyLimit: 80,
    });
    lastSnapshot = {
      threadRead: summarizeThreadRead(threadRead),
      fixtureChatRequestCount: fixtureChatRequestCount(fixtureRequests),
      requiredRequestCount,
    };
    if (
      fixtureChatRequestCount(fixtureRequests) >= requiredRequestCount &&
      threadSettled(threadRead)
    ) {
      return {
        turnId,
        eventName,
        providerRequests: providerRequestSummaries(
          fixtureRequests.slice(requestOffset),
        ),
        finalSnapshot: lastSnapshot,
      };
    }
    await sleep(options.intervalMs);
  }
  throw new Error(
    `${logPrefix} deferred MCP new Turn isolation timeout; last=${JSON.stringify(lastSnapshot)}`,
  );
}

export function buildDeferredMcpToolSearchAssertions({
  deferredToolName,
  evidencePackText,
  providerRequests,
  runtimeContext,
  toolOutputText,
  newTurnProviderRequests,
}) {
  const firstRequest = providerRequests[0] || null;
  const nextStepRequests = providerRequests.slice(1);
  const firstRequestHasDeferredTool = Boolean(
    firstRequest?.toolNames.includes(deferredToolName),
  );
  const deferredToolAppearsAfterSelection = nextStepRequests.some((request) =>
    request.toolNames.includes(deferredToolName),
  );
  return {
    usesCurrentMcpControlPlane: Boolean(runtimeContext?.serverCreated),
    deferredToolFoundByCurrentSearch:
      runtimeContext?.deferredToolFoundByCurrentSearch === true,
    deferredToolMarkedDeferred:
      runtimeContext?.deferredToolSearchMetadata?.deferredLoading === true,
    providerRequestBeforeSelectionHidesDeferredTool:
      firstRequest !== null && !firstRequestHasDeferredTool,
    sameTurnNextStepExposesDeferredTool: deferredToolAppearsAfterSelection,
    deferredMcpToolExecuted:
      toolOutputText.includes(deferredToolName) &&
      toolOutputText.includes("LIME_DEFERRED_MCP_TOOL_OK") &&
      !toolOutputText.includes('"isError":true') &&
      !toolOutputText.includes('"is_error":true'),
    newTurnDoesNotLeakDeferredTool:
      Array.isArray(newTurnProviderRequests) &&
      newTurnProviderRequests.length > 0 &&
      newTurnProviderRequests.every(
        (request) => !request.toolNames.includes(deferredToolName),
      ),
    evidencePackMentionsDeferredMcpTool:
      evidencePackText.includes(deferredToolName) ||
      toolOutputText.includes("LIME_DEFERRED_MCP_TOOL_OK"),
  };
}
