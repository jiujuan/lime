import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  installStreamingRendererTestHarness,
  renderStreamingRendererHarness as renderHarness,
} from "./StreamingRenderer.testHarness";

installStreamingRendererTestHarness();

describe("StreamingRenderer WebSearch result details", () => {
  it("网页搜索批次混入 WebFetch 时展开态应展示可点击来源并复用快照", () => {
    const onOpenUrlPreview = vi.fn();
    const { container } = renderHarness({
      content: "",
      contentParts: [
        {
          type: "text",
          text: "我会先联网核实今天的主要国际新闻来源。",
        },
        {
          type: "tool_use",
          toolCall: {
            id: "tool-news-mixed-search",
            name: "web_search",
            arguments: JSON.stringify({ query: "June 2 2026 world news" }),
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
            startTime: new Date("2026-06-02T09:00:00.000Z"),
            endTime: new Date("2026-06-02T09:00:01.000Z"),
          },
        },
        {
          type: "tool_use",
          toolCall: {
            id: "tool-news-mixed-fetch-failed",
            name: "WebFetch",
            arguments: JSON.stringify({
              url: "https://www.reuters.com/world/",
            }),
            status: "failed",
            result: {
              success: false,
              output: "503 Service Unavailable",
              error: "503 Service Unavailable",
            },
            startTime: new Date("2026-06-02T09:00:02.000Z"),
            endTime: new Date("2026-06-02T09:00:03.000Z"),
          },
        },
        {
          type: "tool_use",
          toolCall: {
            id: "tool-news-mixed-fetch-ok",
            name: "WebFetch",
            arguments: JSON.stringify({
              url: "https://www.reuters.com/world/",
            }),
            status: "completed",
            result: {
              success: true,
              output: JSON.stringify({
                title: "Reuters snapshot",
                markdown: "# Reuters snapshot\n\n完整页面正文。",
              }),
            },
            startTime: new Date("2026-06-02T09:00:04.000Z"),
            endTime: new Date("2026-06-02T09:00:05.000Z"),
          },
        },
        {
          type: "text",
          text: "## 今日国际新闻简报\n\n- 已按来源整理。",
        },
      ],
      isStreaming: false,
      onOpenUrlPreview,
    });

    const processGroupButton = container.querySelector<HTMLButtonElement>(
      '[data-testid="streaming-process-group"] button',
    );
    expect(processGroupButton?.textContent).toContain(
      "已搜索网页 1 次，读取网页 2 次",
    );
    expect(container.textContent).not.toContain("失败 3 个步骤");
    expect(container.textContent).not.toContain("raw page payload");
    expect(container.textContent).not.toContain("503 Service Unavailable");

    expect(container.textContent).not.toContain("June 2 2026 world news");
    expect(container.textContent).not.toContain("搜索来源");
    expect(container.textContent).not.toContain("读取页面");
    expect(container.textContent).not.toContain("Reuters World News");
    expect(container.textContent).not.toContain("reuters.com/world");
    expect(container.textContent).not.toContain(
      "https://www.reuters.com/world/",
    );
    act(() => {
      processGroupButton?.click();
    });

    expect(container.textContent).toContain("搜索来源");
    expect(container.textContent).toContain("读取页面");
    expect(container.textContent).toContain("Reuters World News");
    expect(container.textContent).toContain("reuters.com/world");
    act(() => {
      const result = document.body.querySelector(
        '[aria-label="打开搜索结果：Reuters World News"]',
      ) as HTMLButtonElement | null;
      result?.click();
    });

    expect(onOpenUrlPreview).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Reuters World News",
        url: "https://www.reuters.com/world/",
      }),
    );
    expect(container.textContent).not.toContain("raw page payload");
    expect(container.textContent).not.toContain("503 Service Unavailable");
    expect(
      container.querySelector('[data-testid="inline-tool-process-step"]'),
    ).toBeNull();
  });

  it("网页搜索失败批次应折叠诊断 JSON，避免错误详情铺满对话", () => {
    const missingCredentialOutput = JSON.stringify({
      metadata: {
        durationSeconds: 0.12,
        web_search: {
          attempts: [
            {
              provider: "tavily",
              error: "缺少环境变量 TAVILY_API_KEY",
            },
          ],
        },
      },
      output: "缺少环境变量 TAVILY_API_KEY",
    });
    const failedSearchToolCalls = Array.from({ length: 4 }, (_, index) => ({
      type: "tool_use" as const,
      toolCall: {
        id: `tool-news-failed-search-${index + 1}`,
        name: "web_search",
        arguments: JSON.stringify({
          query: `international news source ${index + 1}`,
        }),
        status: "failed" as const,
        result: {
          success: false,
          output: missingCredentialOutput,
          error: missingCredentialOutput,
        },
        startTime: new Date(`2026-06-02T09:00:0${index}.000Z`),
        endTime: new Date(`2026-06-02T09:00:0${index + 1}.000Z`),
      },
    }));
    const { container } = renderHarness({
      content: "",
      contentParts: [
        {
          type: "text",
          text: "我先联网核实今天的国际新闻。",
        },
        ...failedSearchToolCalls,
        {
          type: "text",
          text: "## 国际新闻简报\n\n- 当前搜索链路缺少凭证，先基于已有上下文整理。",
        },
      ],
      isStreaming: false,
    });

    const processGroupButton = container.querySelector<HTMLButtonElement>(
      '[data-testid="streaming-process-group"] button',
    );

    expect(processGroupButton?.textContent).toContain("已搜索网页 4 次");
    expect(container.textContent).toContain("国际新闻简报");
    expect(container.textContent).not.toContain("international news source 4");
    expect(container.textContent).not.toContain('"metadata"');
    expect(container.textContent).not.toContain("TAVILY_API_KEY");
    expect(
      container.querySelector('[data-testid="inline-tool-process-step"]'),
    ).toBeNull();

    act(() => {
      processGroupButton?.click();
    });

    expect(container.textContent).toContain("international news source 1");
    expect(container.textContent).toContain("international news source 4");
    expect(container.textContent).not.toContain('"metadata"');
    expect(container.textContent).not.toContain("TAVILY_API_KEY");
  });
});
