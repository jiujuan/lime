import { act } from "react";
import { describe, expect, it } from "vitest";
import { renderTool, renderToolList } from "./ToolCallDisplay.testFixtures";

describe("ToolCallDisplay", () => {
  it("WebSearch 工具结果应在 AI 对话区展示搜索列表并支持悬浮预览", async () => {
    const { container } = renderTool({
      id: "tool-search-1",
      name: "WebSearch",
      arguments: JSON.stringify({ query: "3月13日国际新闻" }),
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
      startTime: new Date("2026-03-13T12:00:00.000Z"),
      endTime: new Date("2026-03-13T12:00:02.000Z"),
    });

    expect(document.body.textContent).toContain(
      "Xinhua world news summary at 0030 GMT, March 13",
    );
    expect(document.body.textContent).toContain(
      "Friday morning news: March 13, 2026 | WORLD - wng.org",
    );
    expect(
      container.querySelector('[data-testid="tool-call-rendered-result"]'),
    ).toBeNull();
    expect(document.body.textContent).toContain("查看文本详情");

    const firstSearchResult = document.body.querySelector(
      '[aria-label="预览搜索结果：Xinhua world news summary at 0030 GMT, March 13"]',
    ) as HTMLButtonElement | null;

    await act(async () => {
      firstSearchResult?.dispatchEvent(
        new MouseEvent("mouseover", { bubbles: true }),
      );
      await Promise.resolve();
    });

    expect(document.body.textContent).toContain(
      "全球要闻摘要，覆盖国际局势与市场动态。",
    );
    expect(document.body.textContent).toContain("https://example.com/xinhua");
    expect(document.body.querySelector('[data-side="bottom"]')).not.toBeNull();
    expect(document.body.querySelector('[data-side="left"]')).toBeNull();

    act(() => {
      const rawToggle = document.body.querySelector(
        'button[aria-label="查看搜索文本详情"]',
      ) as HTMLButtonElement | null;
      rawToggle?.click();
    });

    expect(document.body.textContent).toContain("收起文本详情");
    expect(
      container.querySelector('[data-testid="tool-call-rendered-result"]'),
    ).not.toBeNull();
    expect(document.body.textContent).toContain("https://example.com/wng");

    const collapseButton = document.body.querySelector(
      'button[title="收起结果"]',
    ) as HTMLButtonElement | null;

    act(() => {
      collapseButton?.click();
    });

    expect(document.body.textContent).not.toContain(
      "Xinhua world news summary at 0030 GMT, March 13",
    );

    const expandButton = document.body.querySelector(
      'button[title="查看结果"]',
    ) as HTMLButtonElement | null;

    act(() => {
      expandButton?.click();
    });

    expect(document.body.textContent).toContain(
      "Xinhua world news summary at 0030 GMT, March 13",
    );
  });

  it("WebSearch 未命中结构化搜索结果时应继续展示原始输出", () => {
    const { container } = renderTool({
      id: "tool-search-plain-1",
      name: "WebSearch",
      arguments: JSON.stringify({ query: "golang 学习建议" }),
      status: "completed",
      result: {
        success: true,
        output: "本次检索未返回可解析链接，请稍后重试。",
      },
      startTime: new Date("2026-03-13T12:05:00.000Z"),
      endTime: new Date("2026-03-13T12:05:02.000Z"),
    });

    act(() => {
      const expandButton = container.querySelector(
        'button[title="查看结果"]',
      ) as HTMLButtonElement | null;
      expandButton?.click();
    });

    expect(
      container.querySelector('[data-testid="tool-call-rendered-result"]'),
    ).not.toBeNull();
    expect(container.textContent).toContain(
      "本次检索未返回可解析链接，请稍后重试。",
    );
    expect(container.textContent).not.toContain("查看文本详情");
  });

  it("连续多次 WebSearch 应在对话区按搜索批次分组展示", () => {
    const { container } = renderToolList({
      toolCalls: [
        {
          id: "tool-search-1",
          name: "WebSearch",
          arguments: JSON.stringify({ query: "3月13日国际新闻" }),
          status: "completed",
          result: { success: true, output: "https://example.com/1" },
          startTime: new Date("2026-03-13T12:00:00.000Z"),
          endTime: new Date("2026-03-13T12:00:01.000Z"),
        },
        {
          id: "tool-search-2",
          name: "WebSearch",
          arguments: JSON.stringify({
            query: "March 13 2026 world headlines",
          }),
          status: "completed",
          result: { success: true, output: "https://example.com/2" },
          startTime: new Date("2026-03-13T12:00:02.000Z"),
          endTime: new Date("2026-03-13T12:00:03.000Z"),
        },
      ],
    });

    expect(container.textContent).toContain("已搜索");
    expect(container.textContent).toContain("2");
    expect(container.textContent).toContain("3月13日国际新闻");
    expect(container.textContent).toContain("March 13 2026 world headlines");
    expect(container.textContent).toContain("搜索 3月13日国际新闻");
    expect(container.textContent).toContain(
      "搜索 March 13 2026 world headlines",
    );
    expect(container.textContent).not.toContain("中文日期检索");
    expect(container.textContent).not.toContain("头条检索");
  });

});
