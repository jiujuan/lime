import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { changeLimeLocale } from "@/i18n/createI18n";
import { InputbarTools } from "./InputbarTools";

const mountedRoots: Array<{ root: Root; container: HTMLDivElement }> = [];

beforeEach(async () => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  await changeLimeLocale("zh-CN");
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

function renderInputbarTools(
  props?: Partial<React.ComponentProps<typeof InputbarTools>>,
) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const defaultProps: React.ComponentProps<typeof InputbarTools> = {
    onToolClick: vi.fn(),
    activeTools: {},
  };

  act(() => {
    root.render(<InputbarTools {...defaultProps} {...props} />);
  });

  mountedRoots.push({ root, container });
  return {
    container,
    onToolClick: props?.onToolClick ?? defaultProps.onToolClick,
  };
}

describe("InputbarTools", () => {
  it("工具开关 chrome 文案应跟随 en-US 资源", async () => {
    await changeLimeLocale("en-US");
    const onToolClick = vi.fn();
    const { container } = renderInputbarTools({
      onToolClick,
      activeTheme: "general",
      activeTools: {
        thinking: false,
        web_search: true,
        subagent_mode: false,
      },
    });

    expect(container.textContent).toContain("Thinking");
    expect(container.textContent).toContain("Search");
    expect(container.textContent).toContain("Task split");
    expect(container.textContent).not.toContain("思考");
    expect(container.textContent).not.toContain("任务拆分");

    const buttons = Array.from(container.querySelectorAll("button"));
    expect(buttons.map((button) => button.getAttribute("title"))).toEqual([
      "Deep thinking is off",
      "Web search is on",
      "Task splitting preference is off",
    ]);

    act(() => {
      buttons[0]?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      buttons[1]?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      buttons[2]?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onToolClick).toHaveBeenNthCalledWith(1, "thinking");
    expect(onToolClick).toHaveBeenNthCalledWith(2, "web_search");
    expect(onToolClick).toHaveBeenNthCalledWith(3, "subagent_mode");
  });

  it("attach-only 模式不渲染工具开关", () => {
    const { container } = renderInputbarTools({
      toolMode: "attach-only",
      activeTheme: "general",
      activeTools: {
        thinking: true,
        web_search: true,
        subagent_mode: true,
      },
    });

    expect(container.querySelectorAll("button")).toHaveLength(0);
    expect(container.textContent).toBe("");
  });
});
