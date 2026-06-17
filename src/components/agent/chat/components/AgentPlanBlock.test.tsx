import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { changeLimeLocale } from "@/i18n/createI18n";
import { AgentPlanBlock } from "./AgentPlanBlock";

const mockMarkdownRenderer = vi.fn(({ content }: { content: string }) => (
  <div data-testid="markdown-renderer">{content}</div>
));

vi.mock("./MarkdownRenderer", () => ({
  MarkdownRenderer: (props: { content: string }) => mockMarkdownRenderer(props),
}));

const mountedRoots: Array<{ container: HTMLDivElement; root: Root }> = [];

function renderPlanBlock(content: string, isComplete = true) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(<AgentPlanBlock content={content} isComplete={isComplete} />);
  });

  mountedRoots.push({ container, root });
  return container;
}

beforeEach(async () => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  await changeLimeLocale("zh-CN");
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: {
      writeText: vi.fn().mockResolvedValue(undefined),
    },
  });
});

afterEach(() => {
  while (mountedRoots.length > 0) {
    const mounted = mountedRoots.pop();
    if (!mounted) break;
    act(() => {
      mounted.root.unmount();
    });
    mounted.container.remove();
  }
  vi.clearAllMocks();
});

describe("AgentPlanBlock", () => {
  it("应把 proposed plan 渲染成独立计划内容块", () => {
    const container = renderPlanBlock("# Lime 改进计划\n\n- 先补测试\n- 再跑 E2E");

    const block = container.querySelector('[data-testid="agent-plan-block"]');
    expect(block).toBeTruthy();
    expect(container.textContent).toContain("计划");
    expect(container.textContent).toContain("Lime 改进计划");
    expect(
      container.querySelector('button[aria-label="下载计划"]'),
    ).toBeTruthy();
    expect(
      container.querySelector('button[aria-label="复制计划"]'),
    ).toBeTruthy();
  });

  it("长计划默认收起并可展开", () => {
    const longPlan = Array.from({ length: 12 }, (_, index) => `- 第 ${index + 1} 步`)
      .join("\n");
    const container = renderPlanBlock(longPlan);
    const block = container.querySelector('[data-testid="agent-plan-block"]');

    expect(block?.getAttribute("data-collapsed")).toBe("true");

    const expandButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("展开计划"),
    );
    expect(expandButton).toBeTruthy();

    act(() => {
      expandButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(block?.getAttribute("data-collapsed")).toBe("false");
  });

  it("复制按钮应写入完整计划文本", async () => {
    const container = renderPlanBlock("- 验证计划块\n- 提交确认");
    const copyButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="复制计划"]',
    );
    expect(copyButton).toBeTruthy();

    await act(async () => {
      copyButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      "- 验证计划块\n- 提交确认",
    );
  });

  it("流式计划应显示规划中状态", () => {
    const container = renderPlanBlock("- 正在整理", false);

    expect(container.textContent).toContain("规划中");
  });
});
