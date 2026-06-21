import { act } from "react";
import { describe, expect, it } from "vitest";

import {
  installStreamingRendererTestHarness,
  renderStreamingRendererHarness as renderHarness,
} from "./StreamingRenderer.testHarness";

installStreamingRendererTestHarness();

describe("StreamingRenderer process groups", () => {
  it("非交错模式应将思考和工具收敛为同一执行过程组", () => {
    const { container } = renderHarness({
      content: "最终结论",
      thinkingContent: "先检查滚动触发逻辑\n再确认输出展开时机",
      toolCalls: [
        {
          id: "tool-process-group-fallback",
          name: "functions.exec_command",
          arguments: JSON.stringify({ cmd: "rg -n scrollKey src" }),
          status: "completed",
          result: { success: true, output: "ok" },
          startTime: new Date("2026-03-25T10:02:00.000Z"),
          endTime: new Date("2026-03-25T10:02:01.000Z"),
        },
      ],
    });

    const processGroupButton = container.querySelector<HTMLButtonElement>(
      '[data-testid="streaming-process-group"] button',
    );
    expect(processGroupButton?.getAttribute("aria-expanded")).toBe("false");
    expect(container.textContent).not.toContain("先检查滚动触发逻辑");
    expect(container.textContent).toContain("已运行 1 条命令");
    expect(
      container.querySelector('[data-testid="streaming-process-group"]'),
    ).toBeTruthy();

    act(() => {
      processGroupButton?.click();
    });

    expect(container.textContent).toContain("先检查滚动触发逻辑");
    expect(
      container
        .querySelector('[data-testid="inline-tool-process-step"]')
        ?.getAttribute("data-grouped"),
    ).toBe("yes");
    expect(container.textContent).toContain("最终结论");
  });

  it("交错内容中的思考与工具应按连续执行流分组", () => {
    const { container } = renderHarness({
      content: "",
      contentParts: [
        {
          type: "thinking",
          text: "先检查 auto-scroll 触发条件\n确认是否只跟踪最后一项",
        },
        {
          type: "tool_use",
          toolCall: {
            id: "tool-process-group-interleaved",
            name: "functions.exec_command",
            arguments: JSON.stringify({
              cmd: "sed -n '1,120p' src/messages.tsx",
            }),
            status: "completed",
            result: { success: true, output: "ok" },
            startTime: new Date("2026-03-25T10:03:00.000Z"),
            endTime: new Date("2026-03-25T10:03:01.000Z"),
          },
        },
        {
          type: "thinking",
          text: "根因已经定位\n准备收口实现",
        },
        {
          type: "text",
          text: "已经定位到滚动没有跟随增量输出。",
        },
      ],
      isStreaming: false,
    });

    const processGroupButton = container.querySelector<HTMLButtonElement>(
      '[data-testid="streaming-process-group"] button',
    );
    expect(processGroupButton?.getAttribute("aria-expanded")).toBe("false");
    expect(container.textContent).toContain("已运行 1 条命令");
    expect(container.textContent).not.toContain("先检查 auto-scroll 触发条件");
    expect(
      container.querySelector('[data-testid="inline-tool-process-step"]'),
    ).toBeNull();
    expect(container.textContent).toContain("已经定位到滚动没有跟随增量输出。");

    act(() => {
      processGroupButton?.click();
    });

    expect(container.textContent).toContain("先检查 auto-scroll 触发条件");
    expect(
      container
        .querySelector('[data-testid="inline-tool-process-step"]')
        ?.getAttribute("data-grouped"),
    ).toBe("yes");
  });

  it("交错内容里相邻多次命令应折叠为一条过程摘要", () => {
    const { container } = renderHarness({
      content: "",
      contentParts: [
        {
          type: "thinking",
          text: "先盘点目录",
        },
        {
          type: "tool_use",
          toolCall: {
            id: "tool-interleaved-1",
            name: "Bash",
            arguments: JSON.stringify({ command: "ls /tmp" }),
            status: "completed",
            result: { success: true, output: "ok" },
            startTime: new Date("2026-05-29T10:00:00.000Z"),
            endTime: new Date("2026-05-29T10:00:01.000Z"),
          },
        },
        {
          type: "tool_use",
          toolCall: {
            id: "tool-interleaved-2",
            name: "Bash",
            arguments: JSON.stringify({ command: "stat /tmp" }),
            status: "completed",
            result: { success: true, output: "ok" },
            startTime: new Date("2026-05-29T10:00:02.000Z"),
            endTime: new Date("2026-05-29T10:00:03.000Z"),
          },
        },
        {
          type: "tool_use",
          toolCall: {
            id: "tool-interleaved-3",
            name: "Bash",
            arguments: JSON.stringify({ command: "du -sh /tmp" }),
            status: "completed",
            result: { success: true, output: "ok" },
            startTime: new Date("2026-05-29T10:00:04.000Z"),
            endTime: new Date("2026-05-29T10:00:05.000Z"),
          },
        },
        {
          type: "text",
          text: "目录已盘点。",
        },
      ],
      isStreaming: false,
    });

    const processGroupButton = container.querySelector<HTMLButtonElement>(
      '[data-testid="streaming-process-group"] button',
    );
    expect(processGroupButton?.getAttribute("aria-expanded")).toBe("false");
    expect(container.textContent).toContain("已运行 3 条命令");
    expect(container.textContent).not.toContain("先盘点目录");
    expect(
      container.querySelectorAll('[data-testid="inline-tool-process-step"]')
        .length,
    ).toBe(0);
    expect(container.textContent).toContain("目录已盘点。");

    act(() => {
      processGroupButton?.click();
    });

    const expandedToolSteps = container.querySelectorAll(
      '[data-testid="inline-tool-process-step"]',
    );
    expect(expandedToolSteps.length).toBe(3);
    expect(expandedToolSteps[0]?.getAttribute("data-grouped")).toBe("yes");
    expect(container.textContent).toContain("先盘点目录");
  });

  it("消息仍在输出时，已失败的工具批次也应默认折叠，避免工具输出切开正文", () => {
    const { container } = renderHarness({
      content: "",
      contentParts: [
        {
          type: "text",
          text: "## 调研简报\n\n摘要：已整理出当前可用的主要来源。",
        },
        {
          type: "tool_use",
          toolCall: {
            id: "tool-failed-after-answer-1",
            name: "WebSearch",
            arguments: JSON.stringify({ query: "current sources" }),
            status: "failed",
            result: {
              success: false,
              output: "Execution failed: HTTP 401 Unknown Error",
            },
            startTime: new Date("2026-06-02T09:00:00.000Z"),
            endTime: new Date("2026-06-02T09:00:01.000Z"),
          },
        },
        {
          type: "tool_use",
          toolCall: {
            id: "tool-failed-after-answer-2",
            name: "WebFetch",
            arguments: JSON.stringify({ url: "https://example.com/source" }),
            status: "failed",
            result: {
              success: false,
              output: "Fetching data issues",
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

    expect(processGroup?.getAttribute("aria-expanded")).toBe("false");
    expect(container.textContent).toContain("调研简报");
    expect(container.textContent).toContain("已搜索网页 1 次，读取网页 1 次");
    expect(container.textContent).not.toContain("current sources");
    expect(container.textContent).not.toContain("https://example.com/source");
    expect(container.textContent).not.toContain("Execution failed");
    expect(container.textContent).not.toContain("Fetching data issues");

    act(() => {
      processGroup?.click();
    });

    expect(container.textContent).toContain("current sources");
    expect(container.textContent).toContain("example.com/source");
    expect(container.textContent).not.toContain("https://example.com/source");
    expect(container.textContent).not.toContain("Execution failed");
    expect(container.textContent).not.toContain("Fetching data issues");
  });

  it("消息仍在输出时，普通运行工具批次仍应默认折叠，避免实时输出切开正文", () => {
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
            id: "tool-running-command-1",
            name: "Bash",
            arguments: JSON.stringify({ command: "python scrape.py" }),
            status: "running",
            result: {
              success: true,
              output: "raw html payload should stay hidden while grouped",
            },
            startTime: new Date("2026-06-02T09:00:00.000Z"),
          },
        },
        {
          type: "tool_use",
          toolCall: {
            id: "tool-running-command-2",
            name: "Bash",
            arguments: JSON.stringify({ command: "python normalize.py" }),
            status: "completed",
            result: {
              success: true,
              output: "another raw payload should stay hidden while grouped",
            },
            startTime: new Date("2026-06-02T09:00:02.000Z"),
            endTime: new Date("2026-06-02T09:00:03.000Z"),
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

    expect(processGroup?.getAttribute("aria-expanded")).toBe("false");
    expect(container.textContent).toContain("我先核实今天的国际新闻");
    expect(container.textContent).toContain("运行中 2 条命令");
    expect(container.textContent).toContain("国际新闻简报");
    expect(container.textContent).not.toContain("raw html payload");
    expect(container.textContent).not.toContain("another raw payload");
  });

  it("尾部 Skill 仍在运行时应保持展开，不能提前折叠成完成摘要", () => {
    const { container } = renderHarness({
      content: "",
      contentParts: [
        {
          type: "thinking",
          text: "先读取技能说明，再执行 Skill。",
        },
        {
          type: "tool_use",
          toolCall: {
            id: "tool-running-skill-tail",
            name: "skill",
            arguments: JSON.stringify({
              skill: "brand-product-knowledge-builder",
              input: "整理产品知识库",
            }),
            status: "running",
            progress: { message: "正在运行 Skill" },
            result: {
              success: true,
              output: "partial skill protocol payload should stay hidden",
            },
            metadata: {
              tool_family: "skill",
              skill_name: "brand-product-knowledge-builder",
            },
            startTime: new Date("2026-06-02T09:00:00.000Z"),
          },
        },
      ],
      isStreaming: true,
    });

    const processGroup = container.querySelector<HTMLButtonElement>(
      '[data-testid="streaming-process-group"] button',
    );

    expect(processGroup?.getAttribute("aria-expanded")).toBe("true");
    expect(container.textContent).toContain("先读取技能说明");
    expect(container.textContent).toContain("brand-product-knowledge-builder");
    expect(container.textContent).toContain("正在运行 Skill");
    expect(container.textContent).not.toContain("partial skill protocol");
  });

  it("交错工具之间的过程状态自述不应作为正文块显示", () => {
    const { container } = renderHarness({
      content: "",
      contentParts: [
        {
          type: "tool_use",
          toolCall: {
            id: "tool-status-narration-before",
            name: "WebSearch",
            arguments: JSON.stringify({ query: "current sources" }),
            status: "completed",
            result: { success: true, output: "ok" },
            startTime: new Date("2026-06-02T09:00:00.000Z"),
            endTime: new Date("2026-06-02T09:00:01.000Z"),
          },
        },
        {
          type: "text",
          text: "第一轮搜索结果质量不高，我继续从更可靠的页面聚合要点，避免把无关结果混进去。",
        },
        {
          type: "tool_use",
          toolCall: {
            id: "tool-status-narration-after",
            name: "WebFetch",
            arguments: JSON.stringify({ url: "https://example.com/source" }),
            status: "completed",
            result: { success: true, output: "ok" },
            startTime: new Date("2026-06-02T09:00:02.000Z"),
            endTime: new Date("2026-06-02T09:00:03.000Z"),
          },
        },
        {
          type: "text",
          text: "## 调研简报\n\n- 已确认主要来源。",
        },
      ],
      isStreaming: false,
    });

    expect(container.textContent).not.toContain("第一轮搜索结果质量不高");
    expect(container.textContent).toContain("调研简报");
    expect(container.textContent).toContain("已确认主要来源");
  });

  it("交错内容里的工具折叠不应跨正文合并", () => {
    const { container } = renderHarness({
      content: "",
      contentParts: [
        {
          type: "text",
          text: "先说明检查目标。",
        },
        {
          type: "tool_use",
          toolCall: {
            id: "tool-before-text-1",
            name: "Bash",
            arguments: JSON.stringify({ command: "ls /tmp" }),
            status: "completed",
            result: { success: true, output: "ok" },
            startTime: new Date("2026-05-29T10:00:00.000Z"),
            endTime: new Date("2026-05-29T10:00:01.000Z"),
          },
        },
        {
          type: "tool_use",
          toolCall: {
            id: "tool-before-text-2",
            name: "Bash",
            arguments: JSON.stringify({ command: "pwd" }),
            status: "completed",
            result: { success: true, output: "ok" },
            startTime: new Date("2026-05-29T10:00:02.000Z"),
            endTime: new Date("2026-05-29T10:00:03.000Z"),
          },
        },
        {
          type: "text",
          text: "中间结论已经确认。",
        },
        {
          type: "tool_use",
          toolCall: {
            id: "tool-after-text-1",
            name: "Bash",
            arguments: JSON.stringify({ command: "git status --short" }),
            status: "completed",
            result: { success: true, output: "ok" },
            startTime: new Date("2026-05-29T10:00:04.000Z"),
            endTime: new Date("2026-05-29T10:00:05.000Z"),
          },
        },
        {
          type: "text",
          text: "最终结论。",
        },
      ],
      isStreaming: false,
    });

    expect(
      container.querySelectorAll('[data-testid="streaming-process-group"]')
        .length,
    ).toBe(2);

    const renderedText = container.textContent || "";
    const firstTextIndex = renderedText.indexOf("先说明检查目标。");
    const firstGroupIndex = renderedText.indexOf("已运行 2 条命令");
    const middleTextIndex = renderedText.indexOf("中间结论已经确认。");
    const secondGroupIndex = renderedText.indexOf("已运行 1 条命令");
    const finalTextIndex = renderedText.indexOf("最终结论。");

    expect(firstTextIndex).toBeGreaterThanOrEqual(0);
    expect(firstGroupIndex).toBeGreaterThan(firstTextIndex);
    expect(middleTextIndex).toBeGreaterThan(firstGroupIndex);
    expect(secondGroupIndex).toBeGreaterThan(middleTextIndex);
    expect(finalTextIndex).toBeGreaterThan(secondGroupIndex);
  });
});
