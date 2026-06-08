import { beforeEach, describe, expect, it, vi } from "vitest";
import { safeInvoke } from "@/lib/dev-bridge";

import { getMcpInnerToolName, mcpApi } from "./mcp";

const appServerRequestMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api/appServer", () => ({
  AppServerClient: vi.fn().mockImplementation(() => ({
    request: appServerRequestMock,
  })),
}));

vi.mock("@/lib/dev-bridge", () => ({
  safeInvoke: vi.fn(),
}));

function mockAppServerResult<T>(result: T): void {
  appServerRequestMock.mockResolvedValueOnce({ result });
}

describe("mcp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    appServerRequestMock.mockReset();
  });

  it("应在已知 server 名下提取 inner tool 名", () => {
    expect(getMcpInnerToolName("mcp__docs__search_docs", "docs")).toBe(
      "search_docs",
    );
  });

  it("应保留 inner tool 名中的双下划线片段", () => {
    expect(getMcpInnerToolName("mcp__docs__admin__search_docs", "docs")).toBe(
      "admin__search_docs",
    );
  });

  it("对非 MCP 工具名保持原样", () => {
    expect(getMcpInnerToolName("WebSearch", "docs")).toBe("WebSearch");
  });

  it("列表命令应通过 App Server current 空态返回空数组", async () => {
    const cases: Array<[string, string, () => Promise<unknown>]> = [
      ["mcpServer/list", "servers", () => mcpApi.getServers()],
      ["mcpServerStatus/list", "servers", () => mcpApi.listServersWithStatus()],
      ["mcpTool/list", "tools", () => mcpApi.listTools()],
      ["mcpPrompt/list", "prompts", () => mcpApi.listPrompts()],
      ["mcpResource/list", "resources", () => mcpApi.listResources()],
    ];

    for (const [method, field, action] of cases) {
      mockAppServerResult({ [field]: [] });

      await expect(action()).resolves.toEqual([]);
      expect(appServerRequestMock).toHaveBeenLastCalledWith(method, {});
    }
    expect(safeInvoke).not.toHaveBeenCalled();
  });

  it("MCP runtime 使用命令应通过 App Server current method 传递参数", async () => {
    const tool = {
      name: "mcp__docs__search_docs",
      server_name: "docs",
      description: "search",
      input_schema: {},
    };
    mockAppServerResult({ tools: [tool] });
    mockAppServerResult({ tools: [tool] });
    mockAppServerResult({
      content: [{ type: "text", text: "ok" }],
      is_error: false,
    });
    mockAppServerResult({
      content: [{ type: "text", text: "caller ok" }],
      is_error: false,
    });
    mockAppServerResult({
      description: "prompt",
      messages: [{ role: "user", content: { type: "text", text: "hello" } }],
    });
    mockAppServerResult({
      uri: "docs://readme",
      mime_type: "text/plain",
      text: "README",
    });

    await expect(
      mcpApi.listToolsForContext("assistant", true),
    ).resolves.toEqual([tool]);
    expect(appServerRequestMock).toHaveBeenLastCalledWith(
      "mcpTool/listForContext",
      {
        caller: "assistant",
        includeDeferred: true,
      },
    );

    await expect(
      mcpApi.searchTools("search", "tool_search", 5),
    ).resolves.toEqual([tool]);
    expect(appServerRequestMock).toHaveBeenLastCalledWith("mcpTool/search", {
      query: "search",
      caller: "tool_search",
      limit: 5,
    });

    await expect(
      mcpApi.callTool("mcp__docs__search_docs", { q: "lime" }),
    ).resolves.toEqual({
      content: [{ type: "text", text: "ok" }],
      is_error: false,
    });
    expect(appServerRequestMock).toHaveBeenLastCalledWith("mcpTool/call", {
      toolName: "mcp__docs__search_docs",
      arguments: { q: "lime" },
    });

    await expect(
      mcpApi.callToolWithCaller(
        "mcp__docs__search_docs",
        { q: "lime" },
        "assistant",
      ),
    ).resolves.toEqual({
      content: [{ type: "text", text: "caller ok" }],
      is_error: false,
    });
    expect(appServerRequestMock).toHaveBeenLastCalledWith(
      "mcpTool/callWithCaller",
      {
        toolName: "mcp__docs__search_docs",
        arguments: { q: "lime" },
        caller: "assistant",
      },
    );

    await expect(
      mcpApi.getPrompt("docs_summarize", { topic: "lime" }),
    ).resolves.toEqual({
      description: "prompt",
      messages: [{ role: "user", content: { type: "text", text: "hello" } }],
    });
    expect(appServerRequestMock).toHaveBeenLastCalledWith("mcpPrompt/get", {
      name: "docs_summarize",
      arguments: { topic: "lime" },
    });

    await expect(mcpApi.readResource("docs://readme")).resolves.toEqual({
      uri: "docs://readme",
      mime_type: "text/plain",
      text: "README",
    });
    expect(appServerRequestMock).toHaveBeenLastCalledWith("mcpResource/read", {
      uri: "docs://readme",
    });
    expect(safeInvoke).not.toHaveBeenCalled();
  });

  it("MCP lifecycle 应通过 App Server current method 传递参数", async () => {
    mockAppServerResult({});
    mockAppServerResult({});

    await expect(mcpApi.startServer("docs")).resolves.toBeUndefined();
    expect(appServerRequestMock).toHaveBeenLastCalledWith("mcpServer/start", {
      name: "docs",
    });

    await expect(mcpApi.stopServer("docs")).resolves.toBeUndefined();
    expect(appServerRequestMock).toHaveBeenLastCalledWith("mcpServer/stop", {
      name: "docs",
    });
    expect(safeInvoke).not.toHaveBeenCalled();
  });

  it("MCP CRUD / import / sync 应通过 App Server current method 传递参数", async () => {
    const server = {
      id: "server-1",
      name: "docs",
      server_config: {
        command: "node",
        args: ["server.js"],
      },
      enabled_lime: true,
      enabled_claude: false,
      enabled_codex: true,
      enabled_gemini: false,
    };
    mockAppServerResult({ servers: [server] });
    mockAppServerResult({ servers: [server] });
    mockAppServerResult({ servers: [] });
    mockAppServerResult({ servers: [server] });
    mockAppServerResult({ importedCount: 2, servers: [server] });
    mockAppServerResult({ servers: [server] });

    await expect(mcpApi.addServer(server)).resolves.toBeUndefined();
    expect(appServerRequestMock).toHaveBeenLastCalledWith("mcpServer/create", {
      server,
    });

    await expect(mcpApi.updateServer(server)).resolves.toBeUndefined();
    expect(appServerRequestMock).toHaveBeenLastCalledWith("mcpServer/update", {
      server,
    });

    await expect(mcpApi.deleteServer("server-1")).resolves.toBeUndefined();
    expect(appServerRequestMock).toHaveBeenLastCalledWith("mcpServer/delete", {
      id: "server-1",
    });

    await expect(
      mcpApi.toggleServer("server-1", "codex", true),
    ).resolves.toBeUndefined();
    expect(appServerRequestMock).toHaveBeenLastCalledWith(
      "mcpServer/enabled/set",
      {
        id: "server-1",
        appType: "codex",
        enabled: true,
      },
    );

    await expect(mcpApi.importFromApp("codex")).resolves.toBe(2);
    expect(appServerRequestMock).toHaveBeenLastCalledWith(
      "mcpServer/importFromApp",
      {
        appType: "codex",
      },
    );

    await expect(mcpApi.syncAllToLive()).resolves.toBeUndefined();
    expect(appServerRequestMock).toHaveBeenLastCalledWith(
      "mcpServer/syncAllToLive",
      {},
    );
    expect(safeInvoke).not.toHaveBeenCalled();
  });
});
