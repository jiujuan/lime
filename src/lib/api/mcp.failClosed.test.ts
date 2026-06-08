import { beforeEach, describe, expect, it, vi } from "vitest";
import { safeInvoke } from "@/lib/dev-bridge";

import { mcpApi, type McpServer } from "./mcp";

vi.mock("@/lib/dev-bridge", () => ({
  safeInvoke: vi.fn(),
}));

function createDiagnosticResult(command: string): unknown {
  return {
    diagnostic: {
      source: "electron-host-diagnostic",
      command,
      status: "degraded",
    },
  };
}

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
  });

  it("MCP CRUD 与生命周期命令遇到 diagnostic facade 时应 fail closed", async () => {
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
      ["mcp_start_server", () => mcpApi.startServer("docs")],
      ["mcp_stop_server", () => mcpApi.stopServer("docs")],
    ];

    for (const [command, action] of cases) {
      vi.mocked(safeInvoke).mockResolvedValueOnce(
        createDiagnosticResult(command),
      );

      await expect(action()).rejects.toThrow(
        `${command} 尚未接入真实 MCP current 通道，收到 electron-host-diagnostic 诊断返回。`,
      );
    }
  });

  it("MCP 使用命令遇到 diagnostic facade 时应 fail closed", async () => {
    const cases: Array<[string, () => Promise<unknown>]> = [
      [
        "mcp_list_tools_for_context",
        () => mcpApi.listToolsForContext("assistant", true),
      ],
      ["mcp_search_tools", () => mcpApi.searchTools("docs", "tool_search", 5)],
      ["mcp_call_tool", () => mcpApi.callTool("mcp__docs__search", {})],
      [
        "mcp_call_tool_with_caller",
        () =>
          mcpApi.callToolWithCaller(
            "mcp__docs__search",
            { q: "lime" },
            "assistant",
          ),
      ],
      ["mcp_get_prompt", () => mcpApi.getPrompt("summarize", {})],
      ["mcp_read_resource", () => mcpApi.readResource("docs://readme")],
    ];

    for (const [command, action] of cases) {
      vi.mocked(safeInvoke).mockResolvedValueOnce(
        createDiagnosticResult(command),
      );

      await expect(action()).rejects.toThrow(
        `${command} 尚未接入真实 MCP current 通道，收到 electron-host-diagnostic 诊断返回。`,
      );
    }
  });
});
