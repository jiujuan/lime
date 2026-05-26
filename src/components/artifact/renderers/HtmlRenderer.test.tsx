import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { changeLimeLocale } from "@/i18n/createI18n";
import { resolveLocalFilePreviewUrl } from "@/lib/api/fileSystem";
import type { Artifact } from "@/lib/artifact/types";
import { HtmlRenderer } from "./HtmlRenderer";

vi.mock("@/lib/api/fileSystem", () => ({
  isAbsoluteLocalFilePath: vi.fn((path: string) =>
    path.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(path),
  ),
  resolveLocalFilePreviewUrl: vi.fn((path: string | null | undefined) =>
    path ? `asset://local/${path}` : null,
  ),
}));

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
  options: Partial<ComponentProps<typeof HtmlRenderer>> = {},
) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <HtmlRenderer
        artifact={buildArtifact(overrides)}
        {...options}
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

  it("受外部工具栏控制时应切到源码且不渲染内部工具栏", () => {
    const container = renderHtmlRenderer(
      { content: "<main>Hello</main>" },
      { hideToolbar: true, viewMode: "source" },
    );

    expect(container.querySelector("iframe")).toBeNull();
    expect(container.textContent).toContain("<main>Hello</main>");
    expect(container.textContent).not.toContain("Preview");
    expect(container.textContent).not.toContain("Source");
  });

  it("有真实 HTML 文件路径时应使用文件 URL 预览而不是 srcDoc", () => {
    const container = renderHtmlRenderer({
      content: "<!doctype html><html><body><div id=\"app\">{{ title }}</div></body></html>",
      meta: { filename: "prototype.html", filePath: "/tmp/lime/prototype.html" },
    });

    const iframe = container.querySelector("iframe");
    expect(resolveLocalFilePreviewUrl).toHaveBeenCalledWith(
      "/tmp/lime/prototype.html",
    );
    expect(iframe?.getAttribute("src")).toBe(
      "asset://local//tmp/lime/prototype.html",
    );
    expect(iframe?.getAttribute("srcdoc")).toBeNull();
    expect(iframe?.getAttribute("sandbox")).toContain("allow-same-origin");
  });

  it("真实文件 URL 不可用时应回退 srcDoc 预览", () => {
    vi.mocked(resolveLocalFilePreviewUrl).mockReturnValueOnce(null);
    const container = renderHtmlRenderer({
      content: "<main>Fallback</main>",
      meta: { filename: "prototype.html", filePath: "/tmp/lime/prototype.html" },
    });

    const iframe = container.querySelector("iframe");
    expect(iframe?.getAttribute("src")).toBeNull();
    expect(iframe?.getAttribute("srcdoc")).toContain("Fallback");
    expect(iframe?.getAttribute("sandbox")).not.toContain("allow-same-origin");
  });
});
