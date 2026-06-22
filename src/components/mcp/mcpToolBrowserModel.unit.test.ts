import { describe, expect, it } from "vitest";
import type { McpToolDefinition } from "@/lib/api/mcp";
import {
  dedupeMcpTools,
  filterMcpToolsByServer,
  groupMcpToolsByServer,
} from "./mcpToolBrowserModel";

function createTool(
  overrides: Partial<McpToolDefinition> = {},
): McpToolDefinition {
  return {
    name: "mcp__demo__search_docs",
    description: "搜索文档",
    input_schema: { type: "object" },
    server_name: "demo",
    ...overrides,
  };
}

describe("mcpToolBrowserModel", () => {
  it("按 server + runtime tool name 去重，保留不同服务器的同名工具", () => {
    const tools = dedupeMcpTools([
      createTool(),
      createTool({ description: "重复定义" }),
      createTool({
        server_name: "docs",
        name: "mcp__docs__search_docs",
      }),
    ]);

    expect(tools.map((tool) => `${tool.server_name}:${tool.name}`)).toEqual([
      "demo:mcp__demo__search_docs",
      "docs:mcp__docs__search_docs",
    ]);
  });

  it("按服务器分组并保留分组内原始顺序", () => {
    const grouped = groupMcpToolsByServer([
      createTool({ name: "mcp__demo__search_docs" }),
      createTool({ name: "mcp__demo__read_docs" }),
      createTool({
        server_name: "browser",
        name: "mcp__browser__click",
      }),
    ]);

    expect(Object.keys(grouped)).toEqual(["demo", "browser"]);
    expect(grouped.demo.map((tool) => tool.name)).toEqual([
      "mcp__demo__search_docs",
      "mcp__demo__read_docs",
    ]);
    expect(grouped.browser.map((tool) => tool.name)).toEqual([
      "mcp__browser__click",
    ]);
  });

  it("按 inner name、runtime name 和描述过滤，并按 inner name 排序", () => {
    const grouped = groupMcpToolsByServer([
      createTool({
        name: "mcp__demo__search_docs",
        description: "搜索文档",
      }),
      createTool({
        name: "mcp__demo__read_docs",
        description: "读取文档",
      }),
      createTool({
        name: "mcp__demo__z_collect",
        description: "Runtime Probe",
      }),
    ]);

    expect(
      filterMcpToolsByServer(grouped, "READ").demo.map((tool) => tool.name),
    ).toEqual(["mcp__demo__read_docs"]);
    expect(
      filterMcpToolsByServer(grouped, "mcp__demo__search").demo.map(
        (tool) => tool.name,
      ),
    ).toEqual(["mcp__demo__search_docs"]);
    expect(
      filterMcpToolsByServer(grouped, "probe").demo.map((tool) => tool.name),
    ).toEqual(["mcp__demo__z_collect"]);
    expect(
      filterMcpToolsByServer(grouped, "").demo.map((tool) => tool.name),
    ).toEqual([
      "mcp__demo__read_docs",
      "mcp__demo__search_docs",
      "mcp__demo__z_collect",
    ]);
  });
});
