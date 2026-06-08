import { describe, expect, it } from "vitest";

import { mcpMocks } from "./mcpMocks";

describe("mcpMocks", () => {
  const listCommands = [
    "get_mcp_servers",
    "mcp_list_servers_with_status",
    "mcp_list_tools",
    "mcp_list_prompts",
    "mcp_list_resources",
  ];

  const usageCommands = [
    "mcp_list_tools_for_context",
    "mcp_search_tools",
    "mcp_call_tool",
    "mcp_call_tool_with_caller",
    "mcp_get_prompt",
    "mcp_read_resource",
  ];

  const managementCommands = [
    "add_mcp_server",
    "update_mcp_server",
    "delete_mcp_server",
    "toggle_mcp_server",
    "import_mcp_from_app",
    "sync_all_mcp_to_live",
    "mcp_start_server",
    "mcp_stop_server",
  ];

  it("MCP list degraded facade 不再注册 desktop-host 默认 mock", () => {
    for (const command of listCommands) {
      expect(mcpMocks).not.toHaveProperty(command);
    }
  });

  it("MCP 使用面不再注册 desktop-host 默认 mock", () => {
    for (const command of usageCommands) {
      expect(mcpMocks).not.toHaveProperty(command);
    }
  });

  it("MCP 管理写链与生命周期不再注册 desktop-host 默认 mock", () => {
    for (const command of managementCommands) {
      expect(mcpMocks).not.toHaveProperty(command);
    }
  });
});
