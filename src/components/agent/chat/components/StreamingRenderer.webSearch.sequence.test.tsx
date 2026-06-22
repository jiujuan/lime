import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import "./StreamingRenderer.testMocks";
import {
  installStreamingRendererTestHarness,
  renderStreamingRendererHarness as renderHarness,
} from "./StreamingRenderer.testHarness";

installStreamingRendererTestHarness();

describe("StreamingRenderer WebSearch sequence rendering", () => {
  it("可点击搜索来源展开态应保留搜索、思考、读取页面的时间顺序", () => {
    const onOpenUrlPreview = vi.fn();
    const { container } = renderHarness({
      content: "",
      contentParts: [
        {
          type: "text",
          text: "我先核实学习机评测来源。",
        },
        {
          type: "tool_use",
          toolCall: {
            id: "tool-search-preview-order-1",
            name: "web_search",
            arguments: JSON.stringify({
              query: "五年级 学习机 评测 对比",
            }),
            status: "completed",
            result: {
              success: true,
              output: JSON.stringify({
                results: [
                  {
                    title: "学习机横评来源",
                    url: "https://example.com/search-source",
                    snippet: "评测摘要",
                  },
                ],
              }),
            },
            startTime: new Date("2026-06-02T09:00:00.000Z"),
            endTime: new Date("2026-06-02T09:00:01.000Z"),
          },
        },
        {
          type: "thinking",
          text: "搜索结果还需要继续筛掉广告软文。",
        },
        {
          type: "tool_use",
          toolCall: {
            id: "tool-fetch-preview-order-1",
            name: "WebFetch",
            arguments: JSON.stringify({
              url: "https://example.com/read-page",
            }),
            status: "completed",
            result: {
              success: true,
              output: JSON.stringify({
                bytes: 24022,
                code: 200,
                codeText: "OK",
                result: "学习机横评正文摘要。",
              }),
            },
            startTime: new Date("2026-06-02T09:00:02.000Z"),
            endTime: new Date("2026-06-02T09:00:03.000Z"),
          },
        },
        {
          type: "text",
          text: "我会继续整理结论。",
        },
      ],
      isStreaming: true,
      onOpenUrlPreview,
    });

    const renderedText = container.textContent || "";
    const processIndex = renderedText.indexOf(
      "已搜索网页 1 次，读取网页 1 次",
    );
    const searchSourceIndex = renderedText.indexOf("学习机横评来源");
    const thinkingIndex = renderedText.indexOf(
      "搜索结果还需要继续筛掉广告软文。",
    );
    const readPageIndex = renderedText.indexOf("example.com/read-page");
    const finalTextIndex = renderedText.indexOf("我会继续整理结论。");

    expect(processIndex).toBeGreaterThanOrEqual(0);
    expect(searchSourceIndex).toBeGreaterThan(processIndex);
    expect(thinkingIndex).toBeGreaterThan(searchSourceIndex);
    expect(readPageIndex).toBeGreaterThan(thinkingIndex);
    expect(finalTextIndex).toBeGreaterThan(readPageIndex);
    expect(renderedText).toContain("搜索来源");
    expect(renderedText).toContain("读取页面");
    expect(renderedText).not.toContain("https://example.com/read-page");
    expect(renderedText).not.toContain('"bytes"');
  });

  it("搜索与读取先于中间思考到达时，应按 sequence 恢复展开态顺序", () => {
    const onOpenUrlPreview = vi.fn();
    const { container } = renderHarness({
      content: "",
      contentParts: [
        {
          type: "text",
          text: "我先核实网页来源。",
        },
        {
          type: "tool_use",
          metadata: { sequence: 3 },
          toolCall: {
            id: "tool-search-sequence-order-1",
            name: "web_search",
            arguments: JSON.stringify({
              query: "codex desktop rendering parity",
            }),
            status: "completed",
            result: {
              success: true,
              output: JSON.stringify({
                results: [
                  {
                    title: "Codex desktop rendering parity",
                    url: "https://search.example.com/codex-rendering-parity",
                    snippet: "渲染对齐摘要",
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
          metadata: { sequence: 6 },
          toolCall: {
            id: "tool-fetch-sequence-order-1",
            name: "WebFetch",
            arguments: JSON.stringify({
              url: "https://reader.example.com/codex-rendering-parity",
            }),
            status: "completed",
            result: {
              success: true,
              output: JSON.stringify({
                title: "Codex rendering parity snapshot",
                markdown: "# Codex rendering parity\n\n页面正文摘要。",
              }),
            },
            startTime: new Date("2026-06-02T09:00:02.000Z"),
            endTime: new Date("2026-06-02T09:00:03.000Z"),
          },
        },
        {
          type: "thinking",
          text: "中间思考：搜索之后需要读取页面确认正文。",
          metadata: { sequence: 3 },
        },
        {
          type: "text",
          text: "最终正文继续输出。",
        },
      ],
      isStreaming: false,
      onOpenUrlPreview,
    });

    const renderer = container.querySelector<HTMLElement>(
      '[data-testid="streaming-renderer"]',
    );
    expect(renderer?.getAttribute("data-content-part-types")).toBe(
      "text|tool:web_search:completed#3|thinking#3|tool:WebFetch:completed#6|text",
    );

    const processGroupButton = container.querySelector<HTMLButtonElement>(
      '[data-testid="streaming-process-group"] button',
    );
    expect(processGroupButton?.getAttribute("aria-expanded")).toBe("false");

    act(() => {
      processGroupButton?.click();
    });

    const expandedText = container.textContent || "";
    const searchIndex = expandedText.indexOf("Codex desktop rendering parity");
    const thinkingIndex = expandedText.indexOf(
      "中间思考：搜索之后需要读取页面确认正文。",
    );
    const finalIndex = expandedText.indexOf("最终正文继续输出。");
    const retrievalRows = container.querySelectorAll<HTMLElement>(
      '[data-testid="web-retrieval-process-row"]',
    );
    const thinkingBlock = container.querySelector<HTMLElement>(
      '[data-testid="thinking-block"]',
    );

    expect(searchIndex).toBeGreaterThanOrEqual(0);
    expect(thinkingIndex).toBeGreaterThan(searchIndex);
    expect(retrievalRows).toHaveLength(2);
    expect(thinkingBlock).not.toBeNull();
    expect(
      retrievalRows[0]!.compareDocumentPosition(thinkingBlock!) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      thinkingBlock!.compareDocumentPosition(retrievalRows[1]!) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(finalIndex).toBeGreaterThan(thinkingIndex);
    expect(expandedText).not.toContain(
      "https://reader.example.com/codex-rendering-parity",
    );
    expect(expandedText).not.toContain('"markdown"');
  });

  it("完成态网页检索无预览入口时展开态仍应保留中间思考", () => {
    const { container } = renderHarness({
      content: "",
      contentParts: [
        {
          type: "text",
          text: "我先核实网页来源。",
        },
        {
          type: "tool_use",
          toolCall: {
            id: "tool-search-no-preview-thinking-1",
            name: "web_search",
            arguments: JSON.stringify({
              query: "web search rendering parity",
            }),
            status: "completed",
            result: {
              success: true,
              output: JSON.stringify({
                results: [
                  {
                    title: "Lime WebSearch Rendering Source",
                    url: "https://example.com/lime-websearch-rendering",
                    snippet: "渲染来源摘要",
                  },
                ],
              }),
            },
            startTime: new Date("2026-06-02T09:00:00.000Z"),
            endTime: new Date("2026-06-02T09:00:01.000Z"),
          },
        },
        {
          type: "thinking",
          text: "中间思考：搜索之后需要读取页面确认正文。",
        },
        {
          type: "tool_use",
          toolCall: {
            id: "tool-fetch-no-preview-thinking-1",
            name: "WebFetch",
            arguments: JSON.stringify({
              url: "https://example.com/lime-websearch-rendering",
            }),
            status: "completed",
            result: {
              success: true,
              output: JSON.stringify({
                bytes: 24022,
                code: 200,
                codeText: "OK",
                result: "页面正文摘要。",
              }),
            },
            startTime: new Date("2026-06-02T09:00:02.000Z"),
            endTime: new Date("2026-06-02T09:00:03.000Z"),
          },
        },
        {
          type: "text",
          text: "网页搜索渲染结论：最终正文继续输出。",
        },
      ],
      isStreaming: false,
    });

    const processGroupButton = container.querySelector<HTMLButtonElement>(
      '[data-testid="streaming-process-group"] button',
    );
    expect(processGroupButton?.getAttribute("aria-expanded")).toBe("false");
    expect(container.textContent).not.toContain(
      "中间思考：搜索之后需要读取页面确认正文。",
    );

    act(() => {
      processGroupButton?.click();
    });

    const expandedText = container.textContent || "";
    const processIndex = expandedText.indexOf(
      "已搜索网页 1 次，读取网页 1 次",
    );
    const searchIndex = expandedText.indexOf("web search rendering parity");
    const thinkingIndex = expandedText.indexOf(
      "中间思考：搜索之后需要读取页面确认正文。",
    );
    const fetchIndex = expandedText.indexOf(
      "example.com/lime-websearch-rendering",
    );
    const finalIndex = expandedText.indexOf(
      "网页搜索渲染结论：最终正文继续输出。",
    );

    expect(searchIndex).toBeGreaterThan(processIndex);
    expect(thinkingIndex).toBeGreaterThan(searchIndex);
    expect(fetchIndex).toBeGreaterThan(thinkingIndex);
    expect(finalIndex).toBeGreaterThan(fetchIndex);
    expect(expandedText).not.toContain(
      "https://example.com/lime-websearch-rendering",
    );
    expect(expandedText).not.toContain('"bytes"');
    expect(expandedText).not.toContain('"codeText"');
  });
});
