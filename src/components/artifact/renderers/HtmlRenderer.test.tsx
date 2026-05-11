import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { changeLimeLocale } from "@/i18n/createI18n";
import type { Artifact } from "@/lib/artifact/types";
import { HtmlRenderer } from "./HtmlRenderer";

const mountedRoots: Array<{ root: Root; container: HTMLDivElement }> = [];

function buildArtifact(overrides: Partial<Artifact> = {}): Artifact {
  const content = overrides.content ?? "<main>Hello</main>";
  return {
    id: "html-artifact",
    type: "html",
    title: "demo.html",
    content,
    status: "complete",
    meta: { filename: "demo.html", ...overrides.meta },
    position: { start: 0, end: content.length },
    createdAt: 1_777_777_000,
    updatedAt: 1_777_777_999,
    ...overrides,
  };
}

function renderHtmlRenderer(
  overrides: Partial<Artifact> = {},
  options: { isStreaming?: boolean } = {},
) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <HtmlRenderer
        artifact={buildArtifact(overrides)}
        isStreaming={options.isStreaming}
      />,
    );
  });

  mountedRoots.push({ root, container });
  return container;
}

function expectButtonTitle(container: HTMLElement, title: string) {
  expect(container.querySelector(`button[title="${title}"]`)).not.toBeNull();
}

beforeEach(async () => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;

  vi.spyOn(console, "error").mockImplementation(() => undefined);
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
  vi.restoreAllMocks();
});

describe("HtmlRenderer", () => {
  it("应通过 errors namespace 渲染英文 HTML 预览 chrome", () => {
    const container = renderHtmlRenderer({ title: "" }, { isStreaming: true });
    const text = container.textContent ?? "";

    expect(text).toContain("Preview");
    expect(text).toContain("Source");
    expect(text).toContain("Generating...");
    expect(text).not.toContain("预览");
    expect(text).not.toContain("生成中");
    expectButtonTitle(container, "Preview mode");
    expectButtonTitle(container, "Source mode");
    expectButtonTitle(container, "Phone");
    expectButtonTitle(container, "Tablet");
    expectButtonTitle(container, "Desktop");
    expectButtonTitle(container, "Refresh preview");
    expect(
      container.querySelector('iframe[title="HTML preview"]'),
    ).not.toBeNull();
  });

  it("HTML 内容无效时应通过 errors namespace 渲染英文错误态", async () => {
    const container = renderHtmlRenderer({ content: "" });

    await act(async () => {
      await Promise.resolve();
    });

    const text = container.textContent ?? "";

    expect(text).toContain("HTML render failed");
    expect(text).toContain("HTML content is empty or invalid");
    expect(text).toContain("Retry");
    expect(text).toContain("Source content:");
    expect(text).not.toContain("HTML 渲染失败");
    expect(text).not.toContain("源码内容");
  });
});
