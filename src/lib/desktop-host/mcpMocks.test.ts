import { describe, expect, it } from "vitest";

import { mcpMocks } from "./mcpMocks";

describe("mcpMocks", () => {
  it("MCP list degraded facade 不再注册 desktop-host 默认 mock", () => {
    expect(mcpMocks).not.toHaveProperty("get_mcp_servers");
    expect(mcpMocks).not.toHaveProperty("mcp_list_servers_with_status");
    expect(mcpMocks).not.toHaveProperty("mcp_list_tools");
    expect(mcpMocks).not.toHaveProperty("mcp_list_prompts");
    expect(mcpMocks).not.toHaveProperty("mcp_list_resources");
  });

  it("MCP 使用面不再注册 desktop-host 默认 mock", () => {
    expect(mcpMocks).not.toHaveProperty("mcp_list_tools_for_context");
    expect(mcpMocks).not.toHaveProperty("mcp_search_tools");
    expect(mcpMocks).not.toHaveProperty("mcp_call_tool");
    expect(mcpMocks).not.toHaveProperty("mcp_call_tool_with_caller");
    expect(mcpMocks).not.toHaveProperty("mcp_get_prompt");
    expect(mcpMocks).not.toHaveProperty("mcp_read_resource");
  });
});
