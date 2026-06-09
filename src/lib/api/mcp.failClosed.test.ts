import { beforeEach, describe, expect, it, vi } from "vitest";
import { safeInvoke } from "@/lib/dev-bridge";

import { mcpApi, type McpServer } from "./mcp";

const appServerRequestMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api/appServer", () => ({
  AppServerClient: vi.fn().mockImplementation(() => ({
    request: appServerRequestMock,
  })),
}));

vi.mock("@/lib/dev-bridge", () => ({
  safeInvoke: vi.fn(),
}));

const server: McpServer = {
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

function mockAppServerResult(result: unknown): void {
  appServerRequestMock.mockResolvedValueOnce({ result });
}

describe("mcp App Server current API fail-closed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    appServerRequestMock.mockReset();
  });

  it("MCP CRUD / import / sync 在 App Server 失败时应 fail closed 且不回退 legacy", async () => {
    const appServerError = new Error("App Server unavailable");
    const cases: Array<[string, unknown, () => Promise<unknown>]> = [
      ["mcpServer/create", { server }, () => mcpApi.addServer(server)],
      ["mcpServer/update", { server }, () => mcpApi.updateServer(server)],
      [
        "mcpServer/delete",
        { id: "server-1" },
        () => mcpApi.deleteServer("server-1"),
      ],
      [
        "mcpServer/enabled/set",
        { id: "server-1", appType: "codex", enabled: true },
        () => mcpApi.toggleServer("server-1", "codex", true),
      ],
      [
        "mcpServer/importFromApp",
        { appType: "codex" },
        () => mcpApi.importFromApp("codex"),
      ],
      ["mcpServer/syncAllToLive", {}, () => mcpApi.syncAllToLive()],
    ];

    for (const [method, params, action] of cases) {
      appServerRequestMock.mockRejectedValueOnce(appServerError);

      await expect(action()).rejects.toThrow("App Server unavailable");
      expect(appServerRequestMock).toHaveBeenLastCalledWith(method, params);
    }
    expect(safeInvoke).not.toHaveBeenCalled();
  });

  it("MCP CRUD / import / sync 收到 malformed current 响应时应 fail closed", async () => {
    const cases: Array<[string, unknown, () => Promise<unknown>, string]> = [
      [
        "mcpServer/create",
        {},
        () => mcpApi.addServer(server),
        "mcpServer/create did not return servers",
      ],
      [
        "mcpServer/update",
        { success: true },
        () => mcpApi.updateServer(server),
        "mcpServer/update did not return servers",
      ],
      [
        "mcpServer/delete",
        { error: "failed" },
        () => mcpApi.deleteServer("server-1"),
        "mcpServer/delete did not return servers",
      ],
      [
        "mcpServer/enabled/set",
        { servers: null },
        () => mcpApi.toggleServer("server-1", "codex", true),
        "mcpServer/enabled/set did not return servers",
      ],
      [
        "mcpServer/importFromApp",
        { importedCount: 1 },
        () => mcpApi.importFromApp("codex"),
        "mcpServer/importFromApp did not return servers",
      ],
      [
        "mcpServer/syncAllToLive",
        {},
        () => mcpApi.syncAllToLive(),
        "mcpServer/syncAllToLive did not return servers",
      ],
    ];

    for (const [method, result, action, message] of cases) {
      mockAppServerResult(result);

      await expect(action()).rejects.toThrow(message);
      expect(appServerRequestMock).toHaveBeenLastCalledWith(
        method,
        expect.any(Object),
      );
    }
    expect(safeInvoke).not.toHaveBeenCalled();
  });

  it("MCP lifecycle 与 runtime 在 App Server 失败时应 fail closed 且不回退 legacy", async () => {
    const appServerError = new Error("App Server unavailable");
    const cases: Array<[string, () => Promise<unknown>]> = [
      ["mcpServer/start", () => mcpApi.startServer("docs")],
      ["mcpServer/stop", () => mcpApi.stopServer("docs")],
      [
        "mcpTool/listForContext",
        () => mcpApi.listToolsForContext("assistant", true),
      ],
      ["mcpTool/search", () => mcpApi.searchTools("docs", "tool_search", 5)],
      ["mcpTool/call", () => mcpApi.callTool("mcp__docs__search", {})],
      [
        "mcpTool/callWithCaller",
        () =>
          mcpApi.callToolWithCaller(
            "mcp__docs__search",
            { q: "lime" },
            "assistant",
          ),
      ],
      ["mcpPrompt/get", () => mcpApi.getPrompt("summarize", {})],
      ["mcpResource/read", () => mcpApi.readResource("docs://readme")],
    ];

    for (const [method, action] of cases) {
      appServerRequestMock.mockRejectedValueOnce(appServerError);

      await expect(action()).rejects.toThrow("App Server unavailable");
      expect(appServerRequestMock).toHaveBeenLastCalledWith(
        method,
        expect.any(Object),
      );
    }
    expect(safeInvoke).not.toHaveBeenCalled();
  });

  it("MCP lifecycle 收到 mock-like current 响应时应 fail closed", async () => {
    mockAppServerResult({ success: true });
    mockAppServerResult({ error: "failed" });

    await expect(mcpApi.startServer("docs")).rejects.toThrow(
      "mcpServer/start did not return empty lifecycle result",
    );
    await expect(mcpApi.stopServer("docs")).rejects.toThrow(
      "mcpServer/stop did not return empty lifecycle result",
    );
    expect(safeInvoke).not.toHaveBeenCalled();
  });

  it("MCP runtime usage 收到 malformed current 响应时应 fail closed", async () => {
    const cases: Array<[unknown, () => Promise<unknown>, string]> = [
      [
        {},
        () => mcpApi.callTool("mcp__docs__search", {}),
        "mcpTool/call did not return tool result",
      ],
      [
        { content: [{ type: "text" }], is_error: false },
        () => mcpApi.callToolWithCaller("mcp__docs__search", {}, "assistant"),
        "mcpTool/callWithCaller did not return tool result",
      ],
      [
        { messages: [{ role: "user", content: { type: "text" } }] },
        () => mcpApi.getPrompt("summarize", {}),
        "mcpPrompt/get did not return prompt result",
      ],
      [
        { mime_type: "text/plain", text: "README" },
        () => mcpApi.readResource("docs://readme"),
        "mcpResource/read did not return resource content",
      ],
    ];

    for (const [result, action, message] of cases) {
      mockAppServerResult(result);

      await expect(action()).rejects.toThrow(message);
    }
    expect(safeInvoke).not.toHaveBeenCalled();
  });
});
