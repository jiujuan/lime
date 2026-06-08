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

describe("mcp non-list API fail-closed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    appServerRequestMock.mockReset();
  });

  it("MCP CRUD current 尚未落地时应 fail closed 且不回退 legacy", async () => {
    const cases: Array<[string, () => Promise<unknown>]> = [
      ["add_mcp_server", () => mcpApi.addServer(server)],
      ["update_mcp_server", () => mcpApi.updateServer(server)],
      ["delete_mcp_server", () => mcpApi.deleteServer("server-1")],
      [
        "toggle_mcp_server",
        () => mcpApi.toggleServer("server-1", "codex", true),
      ],
      ["import_mcp_from_app", () => mcpApi.importFromApp("codex")],
      ["sync_all_mcp_to_live", () => mcpApi.syncAllToLive()],
    ];

    for (const [command, action] of cases) {
      await expect(action()).rejects.toThrow(
        `${command} 尚未接入 App Server MCP current 通道`,
      );
    }
    expect(appServerRequestMock).not.toHaveBeenCalled();
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
});
