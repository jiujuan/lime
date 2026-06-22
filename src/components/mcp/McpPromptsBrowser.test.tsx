import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@/i18n/config";
import { changeLimeLocale } from "@/i18n/createI18n";
import type { McpPromptDefinition, McpPromptResult } from "@/lib/api/mcp";
import { McpPromptsBrowser } from "./McpPromptsBrowser";

interface RenderResult {
  container: HTMLDivElement;
  root: Root;
}

const mountedRoots: RenderResult[] = [];

function createPrompt(
  overrides: Partial<McpPromptDefinition> = {},
): McpPromptDefinition {
  return {
    name: "write_summary",
    description: "生成摘要",
    arguments: [{ name: "topic", description: "主题", required: true }],
    server_name: "docs",
    ...overrides,
  };
}

function createPromptResult(text: string): McpPromptResult {
  return {
    description: "提示词结果",
    messages: [
      {
        role: "user",
        content: { type: "text", text },
      },
    ],
  };
}

async function renderBrowser(
  props: Partial<React.ComponentProps<typeof McpPromptsBrowser>> = {},
) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  const defaultProps: React.ComponentProps<typeof McpPromptsBrowser> = {
    prompts: [createPrompt()],
    loading: false,
    onRefresh: vi.fn(async () => undefined),
    onGetPrompt: vi.fn(async (_name: string, _args: Record<string, unknown>) =>
      createPromptResult("summary prompt"),
    ),
  };

  await act(async () => {
    root.render(<McpPromptsBrowser {...defaultProps} {...props} />);
    await Promise.resolve();
    await Promise.resolve();
  });

  mountedRoots.push({ container, root });
  return container;
}

function findButton(container: HTMLElement, text: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll("button")).find(
    (candidate) => candidate.textContent?.includes(text),
  );

  if (!button) {
    throw new Error(`未找到按钮：${text}`);
  }

  return button as HTMLButtonElement;
}

beforeEach(async () => {
  await changeLimeLocale("zh-CN");
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  while (mountedRoots.length > 0) {
    const mounted = mountedRoots.pop();
    if (!mounted) {
      break;
    }
    act(() => {
      mounted.root.unmount();
    });
    mounted.container.remove();
  }
  vi.clearAllMocks();
});

describe("McpPromptsBrowser", () => {
  it("展开提示词、填写参数并展示返回消息", async () => {
    const onGetPrompt = vi.fn(
      async (
        _name: string,
        args: Record<string, unknown>,
      ): Promise<McpPromptResult> => createPromptResult(`topic=${args.topic}`),
    );
    const container = await renderBrowser({ onGetPrompt });

    await act(async () => {
      findButton(container, "docs").dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
      await Promise.resolve();
    });

    const promptButton = container.querySelector<HTMLButtonElement>(
      'button[title="调用提示词"]',
    );
    expect(promptButton).not.toBeNull();

    await act(async () => {
      promptButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    const input = container.querySelector<HTMLInputElement>(
      'input[placeholder="输入 topic"]',
    );
    expect(input).not.toBeNull();

    await act(async () => {
      if (input) {
        const valueSetter = Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          "value",
        )?.set;
        valueSetter?.call(input, "MCP");
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }
      await Promise.resolve();
    });

    await act(async () => {
      findButton(container, "获取提示词").dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onGetPrompt).toHaveBeenCalledWith("write_summary", {
      topic: "MCP",
    });
    expect(container.textContent).toContain("提示词结果");
    expect(container.textContent).toContain("topic=MCP");
  });
});
