import { act } from "react";
import { describe, expect, it, vi } from "vitest";

import {
  renderMarkdown as render,
  renderMarkdownHarness,
} from "./MarkdownRenderer.testHarness";

describe("MarkdownRenderer", () => {
  it("代码块复制按钮应使用中文文案并反馈复制状态", async () => {
    vi.useFakeTimers();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window.navigator, "clipboard", {
      configurable: true,
      value: {
        writeText,
      },
    });

    const content = ["```bash", "echo hello", "```"].join("\n");
    const container = render(content);
    const button = container.querySelector("button");

    expect(button).not.toBeNull();
    expect(button?.textContent).toContain("复制");
    expect(container.textContent).toContain("bash");
    expect(container.textContent).toContain("1 行");
    expect(button?.hasAttribute("data-markdown-code-action")).toBe(true);

    await act(async () => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(writeText).toHaveBeenCalledWith("echo hello");
    expect(container.querySelector("button")?.textContent).toContain("已复制");

    act(() => {
      vi.advanceTimersByTime(1200);
    });

    expect(container.querySelector("button")?.textContent).toContain("复制");
  });

  it("输出内容区块应支持复制与引用按钮", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const onQuoteContent = vi.fn();
    Object.defineProperty(window.navigator, "clipboard", {
      configurable: true,
      value: {
        writeText,
      },
    });

    const container = render("第一段输出\n\n第二段输出", {
      showBlockActions: true,
      onQuoteContent,
    });

    const quoteButton = container.querySelector(
      'button[aria-label="引用内容区块"]',
    );
    const copyButton = container.querySelector(
      'button[aria-label="复制内容区块"]',
    );

    expect(quoteButton).not.toBeNull();
    expect(copyButton).not.toBeNull();

    await act(async () => {
      quoteButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onQuoteContent).toHaveBeenCalledWith("第一段输出\n\n第二段输出");

    await act(async () => {
      copyButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(writeText).toHaveBeenCalledWith("第一段输出\n\n第二段输出");
  });

  it("普通流式 Markdown 更新应立即渲染，不再等待 renderer 防抖", () => {
    vi.useFakeTimers();
    const { container, rerender } = renderMarkdownHarness("", {
      isStreaming: true,
    });

    rerender("首字");
    expect(container.textContent).toContain("首字");

    rerender("首字继续");
    expect(container.textContent).toContain("首字继续");
  });

  it("超长流式 Markdown 仍应使用轻量渲染防抖合并", () => {
    vi.useFakeTimers();
    const initialContent = "长文本".repeat(700);
    const nextContent = `${initialContent}追加`;
    const { container, rerender } = renderMarkdownHarness(initialContent, {
      isStreaming: true,
    });

    expect(container.textContent).toContain(initialContent);

    rerender(nextContent);
    expect(container.textContent).not.toContain("追加");

    act(() => {
      vi.advanceTimersByTime(48);
    });

    expect(container.textContent).toContain("追加");
  });
});
