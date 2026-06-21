import { act } from "react";
import { describe, expect, it, vi } from "vitest";

import {
  renderMarkdown as render,
  renderMarkdownHarness as renderHarness,
} from "./MarkdownRenderer.testHarness";

describe("MarkdownRenderer runtime rendering", () => {
  it("聊天内联 A2UI 应使用紧凑卡片尺寸", () => {
    const content = [
      "```a2ui",
      JSON.stringify({
        id: "a2ui-demo",
        root: "root",
        data: {},
        components: [
          {
            id: "root",
            component: "Text",
            text: "请选择开始方式",
            variant: "body",
          },
        ],
      }),
      "```",
    ].join("\n");

    const container = render(content);
    const card = container.querySelector('[data-testid="a2ui-task-card"]');

    expect(card?.getAttribute("data-compact")).toBe("true");
    expect(card?.className).toContain("max-w-[432px]");
  });

  it("历史 Markdown A2UI 代码块应只读回显并移除提交回调", () => {
    const content = [
      "```a2ui",
      JSON.stringify({
        id: "history-a2ui-demo",
        root: "root",
        data: {},
        components: [
          {
            id: "root",
            component: "Text",
            text: "历史表单",
            variant: "body",
          },
        ],
        submitAction: { label: "提交", action: { name: "submit" } },
      }),
      "```",
    ].join("\n");

    const container = render(content, { readOnlyA2UI: true });
    const card = container.querySelector('[data-testid="a2ui-task-card"]');

    expect(card?.getAttribute("data-preview")).toBe("true");
    expect(card?.getAttribute("data-has-on-submit")).toBe("no");
  });

  it("标题后的正文应保持聊天正文排版，不应缩小变灰", () => {
    const container = render("## 小结\n\n这段正文应该和聊天正文保持同一字号与主色。", {
      configureContainer: (target) => {
        target.style.setProperty("--foreground", "17 24 39");
        target.style.setProperty("--muted-foreground", "100 116 139");
        target.style.fontSize = "15px";
        target.style.lineHeight = "1.7";
      },
    });

    const heading = container.querySelector(
      'h2[data-markdown-heading-level="2"]',
    );
    const paragraph = container.querySelector("p");

    expect(heading).not.toBeNull();
    expect(paragraph).not.toBeNull();
    expect(getComputedStyle(paragraph as Element).fontSize).toBe("1em");
    expect(document.head.textContent).not.toContain("h1 + p");
    expect(document.head.textContent).not.toContain("h2 + p");
    expect(document.head.textContent).not.toContain("h3 + p");
  });

  it("非流式时应保留 raw html 渲染能力", () => {
    const content = [
      "前置文本",
      "",
      '<div class="rendered-html">原始 HTML</div>',
      "",
      "后置文本",
    ].join("\n");

    const container = render(content);

    expect(container.querySelector(".rendered-html")).not.toBeNull();
    expect(container.textContent).toContain("原始 HTML");
  });

  it("大段流式输出时应跳过 raw html 重解析", () => {
    const content = [
      "A".repeat(2_200),
      "",
      '<div class="rendered-html">原始 HTML</div>',
      "",
      "结尾文本",
    ].join("\n");

    const container = render(content, { isStreaming: true });

    expect(container.querySelector(".rendered-html")).toBeNull();
    expect(container.textContent).toContain("结尾文本");
  });

  it("流式结束后应立即恢复完整 raw html 渲染", () => {
    vi.useFakeTimers();
    const content = [
      "A".repeat(2_200),
      "",
      '<div class="rendered-html">原始 HTML</div>',
      "",
      "结尾文本",
    ].join("\n");

    const { container, rerender } = renderHarness(content, {
      isStreaming: true,
    });
    expect(container.querySelector(".rendered-html")).toBeNull();

    rerender(content, { isStreaming: false });
    expect(container.querySelector(".rendered-html")).not.toBeNull();
  });

  it("持续流式输出时应周期性刷新正文，而不是等到停止后才一起出现", () => {
    vi.useFakeTimers();
    const { container, rerender } = renderHarness("第一行", {
      isStreaming: true,
    });

    act(() => {
      vi.advanceTimersByTime(10);
    });
    rerender("第一行\n第二行", { isStreaming: true });

    act(() => {
      vi.advanceTimersByTime(10);
    });
    rerender("第一行\n第二行\n第三行", { isStreaming: true });

    act(() => {
      vi.advanceTimersByTime(10);
    });
    rerender("第一行\n第二行\n第三行\n第四行", { isStreaming: true });

    act(() => {
      vi.advanceTimersByTime(8);
    });

    expect(container.textContent).toContain("第三行");
    expect(container.textContent).not.toBe("第一行");
  });
});
