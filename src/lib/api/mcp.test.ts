import { beforeEach, describe, expect, it, vi } from "vitest";
import { safeInvoke } from "@/lib/dev-bridge";

import { getMcpInnerToolName, mcpApi } from "./mcp";

vi.mock("@/lib/dev-bridge", () => ({
  safeInvoke: vi.fn(),
}));

function createDiagnosticList(command: string): unknown[] {
  const result: unknown[] = [];
  Object.defineProperty(result, "__diagnostic", {
    value: {
      source: "electron-host-diagnostic",
      command,
      status: "degraded",
    },
    enumerable: false,
  });
  return result;
}

describe("mcp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it("列表命令遇到 Electron empty diagnostic list 时应 fail closed", async () => {
    const cases: Array<[string, () => Promise<unknown>]> = [
      ["get_mcp_servers", () => mcpApi.getServers()],
      ["mcp_list_servers_with_status", () => mcpApi.listServersWithStatus()],
      ["mcp_list_tools", () => mcpApi.listTools()],
      ["mcp_list_prompts", () => mcpApi.listPrompts()],
      ["mcp_list_resources", () => mcpApi.listResources()],
    ];

    for (const [command, action] of cases) {
      vi.mocked(safeInvoke).mockResolvedValueOnce(createDiagnosticList(command));

      await expect(action()).rejects.toThrow(
        `${command} 尚未接入真实 MCP current 通道，收到 electron-host-diagnostic 诊断返回。`,
      );
    }
  });

  it("列表命令收到真实 current 空态时应返回空数组", async () => {
    const cases: Array<[string, () => Promise<unknown>]> = [
      ["get_mcp_servers", () => mcpApi.getServers()],
      ["mcp_list_servers_with_status", () => mcpApi.listServersWithStatus()],
      ["mcp_list_tools", () => mcpApi.listTools()],
      ["mcp_list_prompts", () => mcpApi.listPrompts()],
      ["mcp_list_resources", () => mcpApi.listResources()],
    ];

    for (const [command, action] of cases) {
      vi.mocked(safeInvoke).mockResolvedValueOnce([]);

      await expect(action()).resolves.toEqual([]);
      expect(safeInvoke).toHaveBeenLastCalledWith(command);
    }
  });
});
