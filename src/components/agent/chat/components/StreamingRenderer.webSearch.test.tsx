import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import "./StreamingRenderer.testMocks";
import {
  installStreamingRendererTestHarness,
  renderStreamingRendererHarness as renderHarness,
} from "./StreamingRenderer.testHarness";

installStreamingRendererTestHarness();

describe("StreamingRenderer WebSearch rendering", () => {
  it("本地历史导入工具流应把网页检索从命令记录中分组展示", () => {
    const { container } = renderHarness({
      content: "",
      contentParts: [
        {
          type: "tool_use",
          toolCall: {
            id: "local-history-import-command",
            name: "Bash",
            arguments: JSON.stringify({
              command: "npm test",
              cwd: "/workspace/imported-local-history",
            }),
            status: "completed",
            result: {
              success: true,
              output: "Exit code: 0\nOutput:\nok",
              metadata: {
                imported: true,
                source_client: "local_history",
                exit_code: 0,
              },
            },
            startTime: new Date("2026-06-02T09:00:00.000Z"),
            endTime: new Date("2026-06-02T09:00:01.000Z"),
          },
        },
        {
          type: "tool_use",
          toolCall: {
            id: "local-history-import-search",
            name: "web_search",
            arguments: JSON.stringify({
              action: "search_query",
              query: "Lime history import",
            }),
            status: "completed",
            result: {
              success: true,
              output: "search result summary",
              metadata: {
                imported: true,
                source_client: "local_history",
              },
            },
            startTime: new Date("2026-06-02T09:00:02.000Z"),
            endTime: new Date("2026-06-02T09:00:03.000Z"),
          },
        },
      ],
    });

    const processGroup = container.querySelector(
      '[data-testid="streaming-process-group"]',
    );
    const processGroupButton = processGroup?.querySelector("button");
    const processGroupButtons = container.querySelectorAll<HTMLButtonElement>(
      '[data-testid="streaming-process-group"] > button',
    );
    const searchGroupButton = processGroupButtons.item(1) as
      | HTMLButtonElement
      | null;

    expect(processGroupButtons).toHaveLength(2);
    expect(processGroupButton?.getAttribute("aria-expanded")).toBe("true");
    expect(container.textContent).toContain("导入的命令记录");
    expect(searchGroupButton?.textContent).toContain(
      "已搜索网页：Lime history import",
    );
    expect(searchGroupButton?.textContent).not.toContain(
      "导入的命令记录",
    );
    expect(container.textContent).not.toContain("npm test");
    expect(container.textContent).not.toContain("Output:");
    expect(searchGroupButton?.textContent).toContain("Lime history import");

    act(() => {
      searchGroupButton?.click();
    });

    expect(container.textContent).toContain("Lime history import");
  });

  it("纯导入网页检索批次应复用搜索与读取分段展示", () => {
    const importedMetadata = {
      imported: true,
      imported_synthetic: true,
      source_client: "local_history",
    };
    const onOpenUrlPreview = vi.fn();
    const { container } = renderHarness({
      content: "",
      contentParts: [
        {
          type: "tool_use",
          toolCall: {
            id: "local-history-imported-web-search-only",
            name: "web_search",
            arguments: JSON.stringify({
              action: "search_query",
              query: "Lime renderer roadmap",
            }),
            status: "completed",
            result: {
              success: true,
              output: JSON.stringify({
                results: [
                  {
                    title: "Lime renderer roadmap",
                    url: "https://example.com/lime-renderer-roadmap",
                    snippet: "Renderer roadmap summary",
                  },
                ],
              }),
              metadata: importedMetadata,
            },
            startTime: new Date("2026-06-17T10:00:00.000Z"),
            endTime: new Date("2026-06-17T10:00:01.000Z"),
          },
        },
        {
          type: "tool_use",
          toolCall: {
            id: "local-history-imported-web-fetch-only",
            name: "WebFetch",
            arguments: JSON.stringify({
              url: "https://example.com/lime-renderer-roadmap",
            }),
            status: "completed",
            result: {
              success: true,
              output: JSON.stringify({
                title: "Renderer roadmap snapshot",
                markdown: "# Renderer roadmap\n\nImported page content.",
              }),
              metadata: importedMetadata,
            },
            startTime: new Date("2026-06-17T10:00:02.000Z"),
            endTime: new Date("2026-06-17T10:00:03.000Z"),
          },
        },
      ],
      isStreaming: false,
      onOpenUrlPreview,
    });

    const processGroupButton = container.querySelector<HTMLButtonElement>(
      '[data-testid="streaming-process-group"] button',
    );
    const processGroup = container.querySelector<HTMLElement>(
      '[data-testid="streaming-process-group"]',
    );
    expect(processGroupButton?.getAttribute("aria-expanded")).toBe("false");
    expect(processGroup?.getAttribute("data-process-kind")).toBe("web_search");
    expect(processGroup?.getAttribute("data-visual-tone")).toBe(
      "codex-activity",
    );
    expect(
      processGroup?.querySelector(
        '[data-testid="streaming-process-status-bullet"]',
      ),
    ).not.toBeNull();
    expect(processGroupButton?.textContent).toContain(
      "已搜索网页 1 次，读取网页 1 次",
    );
    expect(container.textContent).not.toContain("搜索来源");
    expect(container.textContent).not.toContain("读取页面");
    expect(container.textContent).not.toContain("Lime renderer roadmap");
    expect(container.textContent).not.toContain(
      "https://example.com/lime-renderer-roadmap",
    );

    act(() => {
      processGroupButton?.click();
    });

    expect(container.textContent).toContain("搜索来源");
    expect(container.textContent).toContain("读取页面");
    expect(container.textContent).toContain("Lime renderer roadmap");
    expect(container.textContent).toContain("example.com/lime-renderer-roadmap");
    expect(container.textContent).not.toContain(
      "https://example.com/lime-renderer-roadmap",
    );
    expect(container.textContent).not.toContain("导入的命令记录");
    expect(container.textContent).not.toContain("source_client");
    expect(container.textContent).not.toContain("imported_synthetic");
    expect(container.textContent).not.toContain("local_history");

    act(() => {
      const result = document.body.querySelector(
        '[aria-label="预览搜索结果：Lime renderer roadmap"]',
      ) as HTMLButtonElement | null;
      result?.click();
    });

    expect(onOpenUrlPreview).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Lime renderer roadmap",
        url: "https://example.com/lime-renderer-roadmap",
        snippet: "Renderer roadmap summary",
        snapshotTitle: "Renderer roadmap snapshot",
        snapshotContent: "# Renderer roadmap\n\nImported page content.",
        snapshotSource: "web_fetch",
      }),
    );
  });

  it("Codex 导入 web_search action object 应显示 query 且不泄露 JSON", () => {
    const { container } = renderHarness({
      content: "",
      contentParts: [
        {
          type: "tool_use",
          toolCall: {
            id: "codex-import-web-search-action-object",
            name: "web_search",
            arguments: JSON.stringify({
              action: {
                type: "search_query",
                query: "codex desktop rendering parity",
              },
            }),
            status: "running",
            metadata: {
              imported: true,
              source_client: "codex",
            },
            startTime: new Date("2026-06-17T10:00:00.000Z"),
          },
        },
      ],
      isStreaming: true,
    });

    const processGroupButton = container.querySelector<HTMLButtonElement>(
      '[data-testid="streaming-process-group"] button',
    );
    const processGroup = container.querySelector<HTMLElement>(
      '[data-testid="streaming-process-group"]',
    );

    expect(processGroupButton?.getAttribute("aria-expanded")).toBe("true");
    expect(processGroup?.getAttribute("data-process-kind")).toBe("web_search");
    expect(processGroup?.getAttribute("data-process-running")).toBe("yes");
    expect(processGroupButton?.textContent).toContain(
      "正在搜索网页 codex desktop rendering parity",
    );
    expect(container.textContent).toContain("codex desktop rendering parity");
    expect(container.textContent).not.toContain('"type"');
    expect(container.textContent).not.toContain('"search_query"');
  });

  it("实时搜索开始时不应把前一个思考卡片更新成搜索状态", () => {
    const { container } = renderHarness({
      content: "",
      contentParts: [
        {
          type: "thinking",
          text: "先判断需要补充哪些实时来源。",
        },
        {
          type: "tool_use",
          toolCall: {
            id: "live-web-search-after-thinking",
            name: "web_search",
            arguments: JSON.stringify({
              query: "codex desktop rendering search card",
            }),
            status: "running",
            startTime: new Date("2026-06-17T10:00:00.000Z"),
          },
        },
      ],
      isStreaming: true,
    });

    const processGroupButtons = container.querySelectorAll<HTMLButtonElement>(
      '[data-testid="streaming-process-group"] > button',
    );

    expect(processGroupButtons).toHaveLength(2);
    expect(processGroupButtons[0]?.textContent).toContain("思考中");
    expect(processGroupButtons[0]?.textContent).not.toContain("正在搜索网页");
    expect(processGroupButtons[1]?.textContent).toContain(
      "正在搜索网页 codex desktop rendering search card",
    );
    expect(processGroupButtons[1]?.getAttribute("aria-expanded")).toBe("true");
    const processGroups = container.querySelectorAll<HTMLElement>(
      '[data-testid="streaming-process-group"]',
    );
    expect(processGroups[0]?.getAttribute("data-process-kind")).toBe("mixed");
    expect(processGroups[1]?.getAttribute("data-process-kind")).toBe(
      "web_search",
    );
    expect(processGroups[1]?.getAttribute("data-process-running")).toBe("yes");
  });

  it("消息仍在输出时，联网搜索批次应默认展开为轻量进度并保持正文穿插", () => {
    const { container } = renderHarness({
      content: "",
      contentParts: [
        {
          type: "text",
          text: "我先核实今天的国际新闻，再整理成简报。",
        },
        {
          type: "tool_use",
          toolCall: {
            id: "tool-running-search-1",
            name: "web_search",
            arguments: JSON.stringify({ query: "today international news" }),
            status: "running",
            progress: { message: "正在搜索 Reuters 和 AP" },
            result: {
              success: true,
              output: "raw search payload should stay hidden while running",
            },
            startTime: new Date("2026-06-02T09:00:00.000Z"),
          },
        },
        {
          type: "tool_use",
          toolCall: {
            id: "tool-running-fetch-1",
            name: "WebFetch",
            arguments: JSON.stringify({ url: "https://apnews.com/world" }),
            status: "running",
            result: {
              success: true,
              output: "raw fetch payload should stay hidden while running",
            },
            startTime: new Date("2026-06-02T09:00:01.000Z"),
          },
        },
        {
          type: "text",
          text: "## 国际新闻简报\n\n- 正在整理已确认来源。",
        },
      ],
      isStreaming: true,
    });

    const processGroup = container.querySelector<HTMLButtonElement>(
      '[data-testid="streaming-process-group"] button',
    );
    const renderedText = container.textContent || "";
    const introIndex = renderedText.indexOf("我先核实今天的国际新闻");
    const processIndex = renderedText.indexOf(
      "正在搜索网页 1 次，读取网页 1 次",
    );
    const queryIndex = renderedText.indexOf("today international news");
    const briefingIndex = renderedText.indexOf("国际新闻简报");

    expect(processGroup?.getAttribute("aria-expanded")).toBe("true");
    expect(introIndex).toBeGreaterThanOrEqual(0);
    expect(processIndex).toBeGreaterThan(introIndex);
    expect(queryIndex).toBeGreaterThan(processIndex);
    expect(briefingIndex).toBeGreaterThan(queryIndex);
    expect(renderedText).toContain("apnews.com/world");
    expect(renderedText).not.toContain("https://apnews.com/world");
    expect(renderedText).not.toContain("raw search payload");
    expect(renderedText).not.toContain("raw fetch payload");
  });

  it("消息仍在输出且搜索后尚无最终正文时，应保持搜索过程展开", () => {
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
            id: "tool-completed-search-tail-streaming-1",
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
                    title: "学习机评测汇总",
                    url: "https://example.com/review",
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
          type: "tool_use",
          toolCall: {
            id: "tool-completed-fetch-tail-streaming-1",
            name: "WebFetch",
            arguments: JSON.stringify({
              url: "https://example.com/review",
            }),
            status: "completed",
            result: {
              success: true,
              output: JSON.stringify({
                bytes: 24022,
                code: 200,
                codeText: "OK",
                result: "这是一篇学习机评测正文摘要。",
              }),
            },
            startTime: new Date("2026-06-02T09:00:02.000Z"),
            endTime: new Date("2026-06-02T09:00:03.000Z"),
          },
        },
      ],
      isStreaming: true,
    });

    const processGroup = container.querySelector<HTMLButtonElement>(
      '[data-testid="streaming-process-group"] button',
    );

    expect(processGroup?.getAttribute("aria-expanded")).toBe("true");
    expect(processGroup?.textContent).toContain(
      "已搜索网页 1 次，读取网页 1 次",
    );
    expect(container.textContent).toContain("学习机评测汇总");
    expect(container.textContent).toContain("example.com/review");
    expect(container.textContent).not.toContain("https://example.com/review");
    expect(container.textContent).not.toContain('"bytes"');
    expect(container.textContent).not.toContain('"codeText"');
    expect(container.textContent).not.toContain('"result"');
  });

  it("搜索已完成但仍在整理最终答复且正文为空时，应保持搜索过程展开", () => {
    const { container } = renderHarness({
      content: "",
      toolCalls: [
        {
          id: "tool-completed-search-synthesizing-1",
          name: "web_search",
          arguments: JSON.stringify({
            query: "五年级下册 学习机 权威评测",
          }),
          status: "completed",
          result: {
            success: true,
            output: JSON.stringify({
              results: [
                {
                  title: "学习机权威评测",
                  url: "https://example.com/review",
                  snippet: "评测摘要",
                },
              ],
            }),
          },
          startTime: new Date("2026-06-02T09:00:00.000Z"),
          endTime: new Date("2026-06-02T09:00:01.000Z"),
        },
        {
          id: "tool-completed-fetch-synthesizing-1",
          name: "WebFetch",
          arguments: JSON.stringify({
            url: "https://example.com/review",
          }),
          status: "completed",
          result: {
            success: true,
            output: JSON.stringify({
              bytes: 24022,
              code: 200,
              codeText: "OK",
              result: "这是一篇学习机评测正文摘要。",
            }),
          },
          startTime: new Date("2026-06-02T09:00:02.000Z"),
          endTime: new Date("2026-06-02T09:00:03.000Z"),
        },
      ],
      isStreaming: false,
      runtimeStatus: {
        phase: "synthesizing",
        title: "正在整理最终答复",
        detail: "搜索已经完成，正在组织最终回答。",
      },
    });

    const processGroup = container.querySelector<HTMLButtonElement>(
      '[data-testid="streaming-process-group"] button',
    );

    expect(processGroup?.getAttribute("aria-expanded")).toBe("true");
    expect(processGroup?.textContent).toContain(
      "已搜索网页 1 次，读取网页 1 次",
    );
    expect(container.textContent).toContain("学习机权威评测");
    expect(container.textContent).toContain("example.com/review");
    expect(container.textContent).not.toContain("https://example.com/review");
    expect(container.textContent).not.toContain('"bytes"');
  });

  it("运行状态已经完成时不应把空正文搜索过程继续误判为进行中展开", () => {
    const { container } = renderHarness({
      content: "",
      toolCalls: [
        {
          id: "tool-completed-search-terminal-1",
          name: "web_search",
          arguments: JSON.stringify({
            query: "Codex 渲染完成态",
          }),
          status: "completed",
          result: {
            success: true,
            output: JSON.stringify({
              results: [
                {
                  title: "Codex 完成态渲染",
                  url: "https://example.com/codex-rendering-complete",
                  snippet: "完成态摘要",
                },
              ],
            }),
          },
          startTime: new Date("2026-06-02T09:00:00.000Z"),
          endTime: new Date("2026-06-02T09:00:01.000Z"),
        },
        {
          id: "tool-completed-fetch-terminal-1",
          name: "WebFetch",
          arguments: JSON.stringify({
            url: "https://example.com/codex-rendering-complete",
          }),
          status: "completed",
          result: {
            success: true,
            output: JSON.stringify({
              bytes: 1200,
              code: 200,
              result: "完成态页面正文。",
            }),
          },
          startTime: new Date("2026-06-02T09:00:02.000Z"),
          endTime: new Date("2026-06-02T09:00:03.000Z"),
        },
      ],
      isStreaming: false,
    });

    const processGroup = container.querySelector<HTMLButtonElement>(
      '[data-testid="streaming-process-group"] button',
    );

    expect(processGroup?.getAttribute("aria-expanded")).toBe("false");
    expect(processGroup?.textContent).toContain(
      "已搜索网页 1 次，读取网页 1 次",
    );
    expect(container.textContent).not.toContain("Codex 完成态渲染");
    expect(container.textContent).not.toContain(
      "example.com/codex-rendering-complete",
    );
  });

  it("消息仍在输出且搜索后已有后续正文时，应保持搜索过程展开并继续穿插正文", () => {
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
            id: "tool-completed-search-while-streaming-1",
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
                    url: "https://example.com/review",
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
            id: "tool-completed-fetch-while-streaming-1",
            name: "WebFetch",
            arguments: JSON.stringify({
              url: "https://example.com/review",
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

    const processGroup = container.querySelector<HTMLButtonElement>(
      '[data-testid="streaming-process-group"] button',
    );

    expect(processGroup?.getAttribute("aria-expanded")).toBe("true");
    expect(processGroup?.textContent).toContain(
      "已搜索网页 1 次，读取网页 1 次",
    );
    expect(container.textContent).toContain(
      "搜索结果还需要继续筛掉广告软文。",
    );
    expect(container.textContent).toContain("学习机横评来源");
    expect(container.textContent).toContain("example.com/review");
    expect(container.textContent).not.toContain("https://example.com/review");
    expect(container.textContent).not.toContain('"bytes"');
    expect(container.textContent).not.toContain('"codeText"');
    expect(container.textContent).not.toContain('"result"');
    expect(container.textContent).toContain("我会继续整理结论。");
  });

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
      "tool:web_search:completed#3|thinking#3|tool:WebFetch:completed#6|text",
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

  it("独立 WebFetch 展开态不应展示传输层 JSON 包络", () => {
    const { container } = renderHarness({
      content: "",
      contentParts: [
        {
          type: "tool_use",
          toolCall: {
            id: "tool-fetch-json-envelope",
            name: "WebFetch",
            arguments: JSON.stringify({
              url: "https://news.qq.com/rain/a/20251017A01ZK600",
            }),
            status: "completed",
            result: {
              success: true,
              output: JSON.stringify({
                bytes: 24022,
                code: 200,
                codeText: "OK",
                result:
                  "科大讯飞、学而思、作业帮学习机评测，正文里包含价格、功能和适用人群。",
              }),
            },
            startTime: new Date("2026-06-02T09:00:00.000Z"),
            endTime: new Date("2026-06-02T09:00:01.000Z"),
          },
        },
      ],
      isStreaming: true,
    });

    const processGroup = container.querySelector<HTMLButtonElement>(
      '[data-testid="streaming-process-group"] button',
    );
    expect(processGroup?.getAttribute("aria-expanded")).toBe("true");

    expect(processGroup?.textContent).toContain("已获取 1 项数据");
    expect(container.textContent).toContain(
      "科大讯飞、学而思、作业帮学习机评测",
    );
    expect(container.textContent).not.toContain('"bytes"');
    expect(container.textContent).not.toContain('"codeText"');
    expect(container.textContent).not.toContain('"result"');
  });

  it("联网搜索之间穿插思考时，展开态应保留思考与工具顺序", () => {
    const { container } = renderHarness({
      content: "",
      contentParts: [
        {
          type: "text",
          text: "我先拆成几组来源核验。",
        },
        {
          type: "tool_use",
          toolCall: {
            id: "tool-search-with-thinking-1",
            name: "web_search",
            arguments: JSON.stringify({
              query: "official learning tablet review",
            }),
            status: "running",
            result: undefined,
            startTime: new Date("2026-06-02T09:00:00.000Z"),
          },
        },
        {
          type: "thinking",
          text: "第一组结果偏新闻稿，需要继续找第三方评测。",
        },
        {
          type: "tool_use",
          toolCall: {
            id: "tool-search-with-thinking-2",
            name: "web_search",
            arguments: JSON.stringify({
              query: "third party learning tablet benchmark",
            }),
            status: "running",
            result: undefined,
            startTime: new Date("2026-06-02T09:00:01.000Z"),
          },
        },
        {
          type: "text",
          text: "找到足够来源后我会再整理结论。",
        },
      ],
      isStreaming: true,
    });

    const processGroup = container.querySelector<HTMLButtonElement>(
      '[data-testid="streaming-process-group"] button',
    );
    const processGroupShell = container.querySelector<HTMLElement>(
      '[data-testid="streaming-process-group"]',
    );
    const renderedText = container.textContent || "";
    const introIndex = renderedText.indexOf("我先拆成几组来源核验");
    const firstQueryIndex = renderedText.indexOf(
      "official learning tablet review",
    );
    const thinkingIndex = renderedText.indexOf(
      "第一组结果偏新闻稿，需要继续找第三方评测。",
    );
    const secondQueryIndex = renderedText.indexOf(
      "third party learning tablet benchmark",
    );
    const finalTextIndex = renderedText.indexOf("找到足够来源后");

    expect(processGroup?.getAttribute("aria-expanded")).toBe("true");
    expect(processGroupShell?.getAttribute("data-process-kind")).toBe(
      "web_search",
    );
    expect(
      processGroupShell?.querySelector(
        '[data-testid="inline-tool-process-step"]',
      ),
    ).toBeNull();
    expect(firstQueryIndex).toBeGreaterThan(introIndex);
    expect(thinkingIndex).toBeGreaterThan(firstQueryIndex);
    expect(secondQueryIndex).toBeGreaterThan(thinkingIndex);
    expect(finalTextIndex).toBeGreaterThan(secondQueryIndex);
  });

  it("交错网页搜索应作为同一条回复里的轻量过程块，不切断最终简报", () => {
    const onOpenUrlPreview = vi.fn();
    const { container } = renderHarness({
      content: "",
      contentParts: [
        {
          type: "text",
          text: "我先联网核实今天的国际新闻，再整理成简报。",
        },
        {
          type: "tool_use",
          toolCall: {
            id: "tool-news-search-1",
            name: "web_search",
            arguments: JSON.stringify({ query: "today international news" }),
            status: "completed",
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
            startTime: new Date("2026-06-02T09:00:00.000Z"),
            endTime: new Date("2026-06-02T09:00:01.000Z"),
          },
        },
        {
          type: "tool_use",
          toolCall: {
            id: "tool-news-search-2",
            name: "mcp__news__web_search",
            arguments: JSON.stringify({ query: "global headlines" }),
            status: "completed",
            result: {
              success: true,
              output: "[AP World News](https://apnews.com/hub/world-news)",
            },
            startTime: new Date("2026-06-02T09:00:02.000Z"),
            endTime: new Date("2026-06-02T09:00:03.000Z"),
          },
        },
        {
          type: "tool_use",
          toolCall: {
            id: "tool-news-search-3",
            name: "WebSearchTool",
            arguments: JSON.stringify({ query: "UN international news" }),
            status: "completed",
            result: {
              success: true,
              output: "https://news.un.org/en/",
            },
            startTime: new Date("2026-06-02T09:00:04.000Z"),
            endTime: new Date("2026-06-02T09:00:05.000Z"),
          },
        },
        {
          type: "text",
          text: "## 国际新闻简报\n\n- 多个来源已经交叉确认。\n- 以下按地区和影响排序。",
        },
      ],
      isStreaming: false,
      onOpenUrlPreview,
    });

    const renderedText = container.textContent || "";
    const introIndex = renderedText.indexOf("我先联网核实今天的国际新闻");
    const processIndex = renderedText.indexOf("已搜索网页 3 次");
    const briefingIndex = renderedText.indexOf("国际新闻简报");
    const processGroupButton = container.querySelector<HTMLButtonElement>(
      '[data-testid="streaming-process-group"] button',
    );

    expect(introIndex).toBeGreaterThanOrEqual(0);
    expect(processIndex).toBeGreaterThan(introIndex);
    expect(briefingIndex).toBeGreaterThan(processIndex);
    expect(processGroupButton?.getAttribute("aria-expanded")).toBe("false");
    expect(renderedText).not.toContain("Reuters World News");
    expect(renderedText).not.toContain("AP World News");
    expect(renderedText).not.toContain("news.un.org");
    expect(renderedText).toContain("多个来源已经交叉确认");
    expect(renderedText).not.toContain('"results"');
    expect(renderedText).not.toContain("apnews.com/hub/world-news");
    expect(renderedText).not.toContain("https://apnews.com/hub/world-news");
    expect(
      container.querySelector('[data-testid="inline-tool-process-step"]'),
    ).toBeNull();

    act(() => {
      processGroupButton?.click();
    });

    const expandedText = container.textContent || "";
    expect(expandedText).toContain("Reuters World News");
    expect(expandedText).toContain("AP World News");
    expect(expandedText).toContain("news.un.org");
  });

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
        snapshotContent: "# Reuters snapshot\n\n完整页面正文。",
        snapshotSource: "web_fetch",
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
