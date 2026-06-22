import { describe, expect, it } from "vitest";
import type { McpPromptDefinition } from "@/lib/api/mcp";
import {
  buildMcpPromptArguments,
  filterMcpPromptsByServer,
  groupMcpPromptsByServer,
} from "./mcpPromptBrowserModel";

function createPrompt(
  overrides: Partial<McpPromptDefinition> = {},
): McpPromptDefinition {
  return {
    name: "write_summary",
    description: "生成摘要",
    arguments: [],
    server_name: "docs",
    ...overrides,
  };
}

describe("mcpPromptBrowserModel", () => {
  it("按服务器保留提示词原始顺序分组", () => {
    const grouped = groupMcpPromptsByServer([
      createPrompt({ name: "write_summary", server_name: "docs" }),
      createPrompt({ name: "rewrite_title", server_name: "docs" }),
      createPrompt({ name: "plan_task", server_name: "planning" }),
    ]);

    expect(Object.keys(grouped)).toEqual(["docs", "planning"]);
    expect(grouped.docs.map((prompt) => prompt.name)).toEqual([
      "write_summary",
      "rewrite_title",
    ]);
    expect(grouped.planning.map((prompt) => prompt.name)).toEqual([
      "plan_task",
    ]);
  });

  it("按名称和描述做大小写不敏感过滤", () => {
    const grouped = groupMcpPromptsByServer([
      createPrompt({ name: "write_summary", description: "Generate summary" }),
      createPrompt({ name: "rewrite_title", description: undefined }),
      createPrompt({ name: "plan_task", description: "Runtime Planning" }),
    ]);

    expect(
      filterMcpPromptsByServer(grouped, "SUMMARY").docs.map(
        (prompt) => prompt.name,
      ),
    ).toEqual(["write_summary"]);
    expect(
      filterMcpPromptsByServer(grouped, "title").docs.map(
        (prompt) => prompt.name,
      ),
    ).toEqual(["rewrite_title"]);
    expect(
      filterMcpPromptsByServer(grouped, "planning").docs.map(
        (prompt) => prompt.name,
      ),
    ).toEqual(["plan_task"]);
  });

  it("组装提示词参数时跳过空字符串", () => {
    const prompt = createPrompt({
      arguments: [
        { name: "topic", required: true },
        { name: "style", required: false },
        { name: "empty", required: false },
      ],
    });

    expect(
      buildMcpPromptArguments(prompt, {
        topic: "MCP",
        style: "concise",
        empty: "",
      }),
    ).toEqual({
      topic: "MCP",
      style: "concise",
    });
  });
});
