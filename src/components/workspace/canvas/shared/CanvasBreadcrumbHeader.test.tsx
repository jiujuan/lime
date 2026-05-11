import { act } from "react";
import type { ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { changeLimeLocale } from "@/i18n/createI18n";
import { CanvasBreadcrumbHeader } from "./CanvasBreadcrumbHeader";

const mountedHeaders: Array<{ root: Root; container: HTMLDivElement }> = [];

function renderHeader(
  props?: Partial<ComponentProps<typeof CanvasBreadcrumbHeader>>,
) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(<CanvasBreadcrumbHeader label="Draft" {...props} />);
  });

  mountedHeaders.push({ root, container });
  return container;
}

describe("CanvasBreadcrumbHeader", () => {
  beforeEach(async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    await changeLimeLocale("en-US");
  });

  afterEach(async () => {
    for (const item of mountedHeaders.splice(0)) {
      act(() => item.root.unmount());
      item.container.remove();
    }
    await changeLimeLocale("zh-CN");
    vi.unstubAllGlobals();
  });

  it("默认返回按钮文案应走 workspace namespace 英文资源", () => {
    const container = renderHeader();
    const button = container.querySelector("button");

    expect(button?.getAttribute("aria-label")).toBe("Back to new task");
    expect(button?.getAttribute("title")).toBe("Back to new task");
    expect(container.textContent).toContain("Draft");
    expect(container.textContent).not.toContain("返回新建任务");
  });

  it("调用方传入 backTitle 时应保留运行时覆盖", () => {
    const container = renderHeader({ backTitle: "Return to dashboard" });
    const button = container.querySelector("button");

    expect(button?.getAttribute("aria-label")).toBe("Return to dashboard");
    expect(button?.getAttribute("title")).toBe("Return to dashboard");
  });
});
