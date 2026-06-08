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
});
