import { describe, expect, it } from "vitest";

import type { AgentToolCallState } from "@/lib/api/agentProtocol";

import { summarizeStreamingToolBatch } from "./toolBatchGrouping";

function createToolCall(
  name: string,
  argumentsValue?: Record<string, unknown>,
): AgentToolCallState {
  return {
    id: `${name}-1`,
    name,
    status: "completed",
    arguments: argumentsValue ? JSON.stringify(argumentsValue) : undefined,
    startTime: new Date("2026-04-14T00:00:00.000Z"),
    endTime: new Date("2026-04-14T00:00:01.000Z"),
    result: {
      success: true,
      output: "ok",
    },
  };
}

describe("toolBatchGrouping", () => {
  it("应把 MCP 搜索与读取归入探索批次", () => {
    const summary = summarizeStreamingToolBatch([
      createToolCall("mcp__github__search_code", {
        query: "repo:lime tool runtime",
      }),
      createToolCall("mcp__github__get_file_contents", {
        path: "docs/guide.md",
      }),
    ]);

    expect(summary).toEqual(
      expect.objectContaining({
        kind: "exploration",
        title: "已探索项目",
        countLabel: "读 1 / 搜 1",
        rawDetailLabel: "展开查看探索明细",
      }),
    );
    expect(summary?.supportingLines).toContain("查看了 1 个文件，搜索 1 次");
    expect(summary?.supportingLines).toContain("最新线索：guide.md");
  });

  it("应让 REPL 调用被吸收到探索批次而不打断摘要", () => {
    const summary = summarizeStreamingToolBatch([
      createToolCall("Read", {
        file_path: "src/main.ts",
      }),
      createToolCall("REPLTool", {
        code: 'rg "tool inventory" src',
      }),
      createToolCall("Grep", {
        pattern: "tool inventory",
        path: "src",
      }),
    ]);

    expect(summary).toEqual(
      expect.objectContaining({
        kind: "exploration",
        countLabel: "读 1 / 搜 1",
      }),
    );
  });

  it("应把 WebSearch 工具批次展示为网页搜索轨迹", () => {
    const summary = summarizeStreamingToolBatch([
      createToolCall("web_search", {
        query: "today world news Reuters",
      }),
      createToolCall("WebSearchTool", {
        query: "AP world news June 2026",
      }),
      createToolCall("mcp__system__web_search", {
        url: "https://apnews.com/hub/world-news",
      }),
    ]);

    expect(summary).toEqual(
      expect.objectContaining({
        kind: "web_search",
        title: "已搜索网页 3 次",
        countLabel: "3 次",
        rawDetailLabel: "展开查看搜索来源",
      }),
    );
    expect(summary?.supportingLines).toContain("today world news Reuters");
    expect(summary?.supportingLines).toContain("AP world news June 2026");
    expect(summary?.supportingLines).toContain(
      "https://apnews.com/hub/world-news",
    );
  });

  it("应从 WebSearch 结果中提取来源行而不暴露原始输出", () => {
    const summary = summarizeStreamingToolBatch([
      {
        ...createToolCall("WebSearch", {
          query: "today world news",
        }),
        result: {
          success: true,
          output: JSON.stringify({
            results: [
              {
                title: "了解必应 获取新版必应壁纸应用 增值电信业务经营许可证",
                url: "https://www.bing.com/search?q=today+world+news",
              },
              {
                title: "Reuters World News",
                url: "https://www.reuters.com/world/",
              },
            ],
          }),
        },
      },
      {
        ...createToolCall("mcp__news__web_search", {
          query: "global headlines",
        }),
        result: {
          success: true,
          output: "[AP World News](https://apnews.com/hub/world-news)",
        },
      },
    ]);

    expect(summary).toEqual(
      expect.objectContaining({
        kind: "web_search",
        title: "已搜索网页 2 次",
      }),
    );
    expect(summary?.supportingLines).toEqual(
      expect.arrayContaining([
        "today world news",
        "Reuters World News",
        "global headlines",
        "AP World News",
      ]),
    );
    expect(summary?.supportingLines.join("\n")).not.toContain("必应");
    expect(summary?.supportingLines.join("\n")).not.toContain(
      "增值电信业务经营许可证",
    );
  });

  it("WebSearch 后续 WebFetch 成功或失败都应吸收到网页搜索批次", () => {
    const summary = summarizeStreamingToolBatch([
      {
        ...createToolCall("web_search", {
          query: "June 2 2026 world news",
        }),
        result: {
          success: true,
          output: JSON.stringify({
            results: [
              {
                title: "Reuters World News",
                url: "https://www.reuters.com/world/",
              },
            ],
          }),
        },
      },
      {
        ...createToolCall("WebFetch", {
          url: "https://www.reuters.com/world/",
        }),
        status: "failed",
        result: {
          success: false,
          output: "503 Service Unavailable",
          error: "503 Service Unavailable",
        },
      },
      {
        ...createToolCall("WebFetch", {
          url: "https://news.un.org/en/",
        }),
        result: {
          success: true,
          output: JSON.stringify({
            code: 200,
            result: "large raw page payload should not become the batch title",
          }),
        },
      },
    ]);

    expect(summary).toEqual(
      expect.objectContaining({
        kind: "web_search",
        title: "已搜索网页 1 次",
        countLabel: "1 次",
        rawDetailLabel: "展开查看搜索来源",
      }),
    );
    expect(summary?.supportingLines).toEqual(
      expect.arrayContaining([
        "June 2 2026 world news",
        "Reuters World News",
        "https://www.reuters.com/world/",
        "https://news.un.org/en/",
      ]),
    );
  });

  it("普通搜索工具仍应按项目线索展示，避免混成 WebSearch", () => {
    const summary = summarizeStreamingToolBatch([
      createToolCall("mcp__github__search_code", {
        query: "runtime policy",
      }),
      createToolCall("Grep", {
        pattern: "runtime policy",
        path: "src",
      }),
    ]);

    expect(summary).toEqual(
      expect.objectContaining({
        kind: "exploration",
        title: "已搜索关键线索",
        countLabel: "搜 2",
        rawDetailLabel: "展开查看探索明细",
      }),
    );
  });

  it("应继续把浏览器 MCP 步骤聚合为页面检查摘要", () => {
    const summary = summarizeStreamingToolBatch([
      createToolCall("mcp__lime-browser__navigate", {
        url: "https://example.com",
      }),
      createToolCall("mcp__lime-browser__click", {
        selector: "#cta",
      }),
    ]);

    expect(summary).toEqual(
      expect.objectContaining({
        kind: "browser",
        title: "已检查页面",
        countLabel: "2 步",
      }),
    );
    expect(summary?.supportingLines).toContain("https://example.com");
    expect(summary?.supportingLines).toContain("#cta");
  });
});
