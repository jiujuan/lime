import { describe, expect, it } from "vitest";
import type { AgentToolCallState as ToolCallState } from "@/lib/api/agentProtocol";
import { attachUrlPreviewSnapshotsToSearchResults } from "./urlPreviewSnapshot";

function createToolCall(
  overrides: Partial<ToolCallState>,
): ToolCallState {
  return {
    id: "tool-1",
    name: "WebFetch",
    arguments: JSON.stringify({ url: "https://example.com/article" }),
    status: "completed",
    result: { success: true, output: "" },
    startTime: new Date("2026-06-18T10:00:00.000Z"),
    ...overrides,
  };
}

describe("urlPreviewSnapshot", () => {
  it("复用同组 WebFetch 结构化正文作为 URL 预览快照", () => {
    const [item] = attachUrlPreviewSnapshotsToSearchResults({
      items: [
        {
          id: "search-1",
          title: "搜索标题",
          url: "https://example.com/article",
          hostname: "example.com",
          snippet: "搜索摘要",
        },
      ],
      toolCalls: [
        createToolCall({
          result: {
            success: true,
            output: JSON.stringify({
              url: "https://example.com/article",
              title: "页面标题",
              markdown: "# 页面标题\n\n正文 **重点**。",
            }),
          },
        }),
      ],
    });

    expect(item?.snapshotContent).toBe("# 页面标题\n\n正文 **重点**。");
    expect(item?.snapshotTitle).toBe("页面标题");
    expect(item?.snapshotSource).toBe("web_fetch");
  });

  it("URL 不匹配时不把 WebFetch 正文挂到搜索结果", () => {
    const [item] = attachUrlPreviewSnapshotsToSearchResults({
      items: [
        {
          id: "search-1",
          title: "搜索标题",
          url: "https://example.com/other",
          hostname: "example.com",
        },
      ],
      toolCalls: [
        createToolCall({
          arguments: JSON.stringify({ url: "https://example.com/article" }),
          result: {
            success: true,
            output: JSON.stringify({
              markdown: "正文不应泄漏到其他 URL",
            }),
          },
        }),
      ],
    });

    expect(item?.snapshotContent).toBeUndefined();
  });

  it("WebFetch 返回 RSS/XML 或诊断噪音时继续只保留搜索摘要", () => {
    const [rssItem, diagnosticItem] = attachUrlPreviewSnapshotsToSearchResults({
      items: [
        {
          id: "search-rss",
          title: "RSS",
          url: "https://example.com/rss",
          hostname: "example.com",
        },
        {
          id: "search-timeout",
          title: "Timeout",
          url: "https://example.com/timeout",
          hostname: "example.com",
        },
      ],
      toolCalls: [
        createToolCall({
          id: "tool-rss",
          arguments: JSON.stringify({ url: "https://example.com/rss" }),
          result: {
            success: true,
            output: "<rss><channel><item>raw feed</item></channel></rss>",
          },
        }),
        createToolCall({
          id: "tool-timeout",
          arguments: JSON.stringify({ url: "https://example.com/timeout" }),
          result: {
            success: true,
            output: "Timeout while reading source",
          },
        }),
      ],
    });

    expect(rssItem?.snapshotContent).toBeUndefined();
    expect(diagnosticItem?.snapshotContent).toBeUndefined();
  });
});
