import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { changeLimeLocale } from "@/i18n/createI18n";
import type { Artifact } from "@/lib/artifact/types";
import { ErrorFallbackRenderer } from "./ErrorFallbackRenderer";

const mountedRoots: Array<{ root: Root; container: HTMLDivElement }> = [];

function buildArtifact(overrides: Partial<Artifact> = {}): Artifact {
  return {
    id: "artifact-1",
    type: "code",
    title: "Demo Artifact",
    content: "console.log('hello');",
    status: "error",
    meta: {},
    position: { start: 0, end: 21 },
    createdAt: 1_777_777_000,
    updatedAt: 1_777_777_999,
    ...overrides,
  };
}

function renderFallback(
  options: {
    artifact?: Artifact;
    error?: Error;
    onRetry?: () => void;
    onShowSource?: () => void;
  } = {},
) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <ErrorFallbackRenderer
        artifact={options.artifact ?? buildArtifact()}
        error={options.error ?? new TypeError("Renderer exploded")}
        onRetry={options.onRetry ?? vi.fn()}
        onShowSource={options.onShowSource ?? vi.fn()}
      />,
    );
  });

  mountedRoots.push({ root, container });
  return container;
}

function findButtonByText(container: HTMLElement, text: string) {
  const button = Array.from(container.querySelectorAll("button")).find((item) =>
    item.textContent?.includes(text),
  );
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`未找到按钮文案: ${text}`);
  }
  return button;
}

beforeEach(async () => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;

  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: {
      writeText: vi.fn(async () => undefined),
    },
  });

  vi.clearAllMocks();
  await changeLimeLocale("en-US");
});

afterEach(async () => {
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

  await changeLimeLocale("zh-CN");
  vi.clearAllMocks();
});

describe("ErrorFallbackRenderer", () => {
  it("应通过 errors namespace 渲染英文错误回退 chrome", () => {
    const container = renderFallback();
    const text = container.textContent ?? "";

    expect(text).toContain("Render failed");
    expect(text).toContain("Error type: TypeError");
    expect(text).toContain("Retry");
    expect(text).toContain("View source");
    expect(text).toContain("Copy error report");
    expect(text).toContain("Type");
    expect(text).toContain("Title");
    expect(text).toContain("Status");
    expect(text).toContain("Error stack");
    expect(text).toContain("Original content");
    expect(text).not.toContain("渲染失败");
    expect(text).not.toContain("复制错误报告");
  });

  it("复制错误报告时应使用 errors namespace 的英文报告标题", async () => {
    const container = renderFallback();

    await act(async () => {
      findButtonByText(container, "Copy error report").dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
      await Promise.resolve();
    });

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining("=== Artifact render error report ==="),
    );
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining("Error type: TypeError"),
    );
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining("--- Artifact content ---"),
    );
  });
});
