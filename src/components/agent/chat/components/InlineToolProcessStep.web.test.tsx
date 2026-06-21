import { act } from "react";
import { describe, expect, it, vi } from "vitest";

import { openExternalUrlWithSystemBrowser } from "@/lib/api/externalUrl";
import { renderTool } from "./InlineToolProcessStep.testHarness";

vi.mock("@/lib/api/externalUrl", () => ({
  openExternalUrlWithSystemBrowser: vi.fn().mockResolvedValue(undefined),
}));

describe("InlineToolProcessStep web tools", () => {
  it("WebSearch 展开后应优先展示搜索结果列表并打开 URL 预览", () => {
    const onOpenUrlPreview = vi.fn();
    const { container } = renderTool(
      {
        id: "tool-search-web-1",
        name: "WebSearch",
        arguments: JSON.stringify({ query: "AI Agent 最新热点" }),
        status: "completed",
        result: {
          success: true,
          output: [
            "Xinhua world news summary at 0030 GMT, March 13",
            "https://example.com/xinhua",
            "全球要闻摘要，覆盖国际局势与市场动态。",
            "",
            "Friday morning news: March 13, 2026 | WORLD - wng.org",
            "https://example.com/wng",
            "补充国际动态与区域冲突更新。",
          ].join("\n"),
        },
        startTime: new Date("2026-04-13T10:20:00.000Z"),
        endTime: new Date("2026-04-13T10:20:01.000Z"),
      },
      { onOpenUrlPreview },
    );

    act(() => {
      const toggle = container.querySelector(
        'button[title="展开过程详情"]',
      ) as HTMLButtonElement | null;
      toggle?.click();
    });

    expect(
      document.body.querySelector(
        '[aria-label="预览搜索结果：Xinhua world news summary at 0030 GMT, March 13"]',
      ),
    ).not.toBeNull();
    act(() => {
      const firstResult = document.body.querySelector(
        '[aria-label="预览搜索结果：Xinhua world news summary at 0030 GMT, March 13"]',
      ) as HTMLButtonElement | null;
      firstResult?.click();
    });

    expect(onOpenUrlPreview).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Xinhua world news summary at 0030 GMT, March 13",
        url: "https://example.com/xinhua",
        snippet: "全球要闻摘要，覆盖国际局势与市场动态。",
      }),
    );
    expect(openExternalUrlWithSystemBrowser).not.toHaveBeenCalled();
    expect(container.textContent).toContain(
      "Friday morning news: March 13, 2026 | WORLD - wng.org",
    );
    expect(
      container.querySelector('[data-testid="markdown-renderer"]'),
    ).toBeNull();
  });

  it("WebSearch 点击 URL 预览时应复用同组 WebFetch 正文快照", () => {
    const onOpenUrlPreview = vi.fn();
    const { container } = renderTool(
      {
        id: "tool-search-web-with-fetch-1",
        name: "WebSearch",
        arguments: JSON.stringify({ query: "国际新闻" }),
        status: "completed",
        result: {
          success: true,
          output: JSON.stringify({
            results: [
              {
                title: "Reuters World News",
                url: "https://www.reuters.com/world/",
                snippet: "搜索结果摘要",
              },
            ],
          }),
        },
        startTime: new Date("2026-06-18T10:20:00.000Z"),
        endTime: new Date("2026-06-18T10:20:01.000Z"),
      },
      {
        onOpenUrlPreview,
        urlPreviewToolCalls: [
          {
            id: "tool-fetch-reuters-1",
            name: "WebFetch",
            arguments: JSON.stringify({
              url: "https://www.reuters.com/world/",
            }),
            status: "completed",
            result: {
              success: true,
              output: JSON.stringify({
                title: "Reuters snapshot",
                markdown: "# Reuters snapshot\n\n正文来自 WebFetch。",
              }),
            },
            startTime: new Date("2026-06-18T10:20:02.000Z"),
            endTime: new Date("2026-06-18T10:20:03.000Z"),
          },
        ],
      },
    );

    act(() => {
      const toggle = container.querySelector(
        'button[title="展开过程详情"]',
      ) as HTMLButtonElement | null;
      toggle?.click();
    });
    act(() => {
      const result = document.body.querySelector(
        '[aria-label="预览搜索结果：Reuters World News"]',
      ) as HTMLButtonElement | null;
      result?.click();
    });

    expect(onOpenUrlPreview).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Reuters World News",
        url: "https://www.reuters.com/world/",
        snippet: "搜索结果摘要",
        snapshotTitle: "Reuters snapshot",
        snapshotContent: "# Reuters snapshot\n\n正文来自 WebFetch。",
        snapshotSource: "web_fetch",
      }),
    );
  });

  it("WebSearch 协议错误应展示可操作提示，并保留原始错误供排查", () => {
    const { container } = renderTool({
      id: "tool-search-web-failed-1",
      name: "WebSearch",
      arguments: JSON.stringify({
        query: "AI Agent trends X Twitter April 2026",
      }),
      status: "failed",
      result: {
        success: false,
        error: "-32603: -32002: WebSearch",
        output: "",
      },
      startTime: new Date("2026-04-13T10:22:00.000Z"),
      endTime: new Date("2026-04-13T10:22:01.000Z"),
    });

    expect(container.textContent).toContain("搜索结果暂时无法读取");
    expect(container.textContent).toContain("搜索失败");
    expect(container.textContent).not.toContain("执行失败");

    act(() => {
      const toggle = container.querySelector(
        'button[title="展开过程详情"]',
      ) as HTMLButtonElement | null;
      toggle?.click();
    });

    expect(container.textContent).toContain(
      "原始错误：-32603: -32002: WebSearch",
    );
  });

  it("WebFetch 获取失败应使用弱提示而不是执行失败", () => {
    const { container } = renderTool({
      id: "tool-fetch-failed-1",
      name: "WebFetch",
      arguments: JSON.stringify({
        url: "https://example.com/unavailable",
      }),
      status: "failed",
      result: {
        success: false,
        error: "404 Not Found",
        output: "",
      },
      startTime: new Date("2026-04-13T10:23:00.000Z"),
      endTime: new Date("2026-04-13T10:23:01.000Z"),
    });

    expect(container.textContent).toContain("来源暂时无法读取");
    expect(container.textContent).toContain("获取失败");
    expect(container.textContent).not.toContain("执行失败");
  });

  it("WebFetch 返回 RSS/XML 时应默认只展示弱摘要，不铺开原始 XML", () => {
    const { container } = renderTool({
      id: "tool-fetch-rss-1",
      name: "WebFetch",
      arguments: JSON.stringify({
        url: "https://example.com/rss.xml",
      }),
      status: "completed",
      result: {
        success: true,
        output:
          '<?xml version="1.0"?><rss><channel><title>News</title></channel><item><title>World</title></item></rss>',
      },
      startTime: new Date("2026-04-13T10:23:00.000Z"),
      endTime: new Date("2026-04-13T10:23:01.000Z"),
    });

    expect(container.textContent).toContain("来源暂时无法读取");
    expect(container.textContent).not.toContain("<?xml");
    expect(container.textContent).not.toContain("<rss>");
    expect(
      container.querySelector('[data-testid="markdown-renderer"]'),
    ).toBeNull();
  });

  it("WebSearch 超时诊断应默认只展示弱摘要，不铺开原始错误", () => {
    const { container } = renderTool({
      id: "tool-search-timeout-1",
      name: "WebSearch",
      arguments: JSON.stringify({
        query: "今日国际新闻",
      }),
      status: "completed",
      result: {
        success: true,
        output: "Timeout while reading https://example.com/rss.xml",
      },
      startTime: new Date("2026-04-13T10:23:00.000Z"),
      endTime: new Date("2026-04-13T10:23:01.000Z"),
    });

    expect(container.textContent).toContain("搜索结果暂时无法读取");
    expect(container.textContent).not.toContain("Timeout while reading");
    expect(
      container.querySelector('[data-testid="markdown-renderer"]'),
    ).toBeNull();
  });

  it("WebFetch 成功返回结构化 JSON 时应渲染正文而不是原始 JSON", () => {
    const { container } = renderTool({
      id: "tool-fetch-json-1",
      name: "WebFetch",
      arguments: JSON.stringify({
        url: "https://example.com/article",
      }),
      status: "completed",
      result: {
        success: true,
        output: JSON.stringify({
          url: "https://example.com/article",
          title: "Example Article",
          markdown: "# 页面标题\n\n正文 **重点**。",
        }),
      },
      startTime: new Date("2026-04-13T10:24:00.000Z"),
      endTime: new Date("2026-04-13T10:24:01.000Z"),
    });

    act(() => {
      const toggle = container.querySelector(
        'button[title="展开过程详情"]',
      ) as HTMLButtonElement | null;
      toggle?.click();
    });

    const markdownRenderer = container.querySelector(
      '[data-testid="markdown-renderer"]',
    );
    expect(markdownRenderer?.textContent).toContain("# 页面标题");
    expect(markdownRenderer?.textContent).toContain("正文 **重点**。");
    expect(markdownRenderer?.textContent).not.toContain('"markdown"');
    expect(markdownRenderer?.textContent).not.toContain(
      "https://example.com/article",
    );
  });
});
