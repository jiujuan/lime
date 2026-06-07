import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  openHtmlPreviewWindow,
  openPathWithDefaultApp,
  resolveLocalFilePreviewUrl,
} from "@/lib/api/fileSystem";
import { CanvasPanel } from "./CanvasPanel";

vi.mock("@/lib/api/fileSystem", () => ({
  isAbsoluteLocalFilePath: vi.fn((path: string) =>
    path.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(path),
  ),
  openHtmlPreviewWindow: vi.fn(async () => true),
  openPathWithDefaultApp: vi.fn(async () => undefined),
  resolveLocalFilePreviewUrl: vi.fn((path: string | null | undefined) =>
    path ? `asset://local/${path}` : null,
  ),
}));

interface MountedCanvasPanel {
  container: HTMLDivElement;
  root: Root;
}

const mountedPanels: MountedCanvasPanel[] = [];

function mountCanvasPanel(
  props: ComponentProps<typeof CanvasPanel>,
): HTMLDivElement {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(<CanvasPanel {...props} />);
  });

  mountedPanels.push({ container, root });
  return container;
}

describe("CanvasPanel", () => {
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: vi.fn(async () => undefined),
      },
    });
    Object.defineProperty(globalThis.URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:canvas-panel"),
    });
    Object.defineProperty(globalThis.URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
    vi.mocked(resolveLocalFilePreviewUrl).mockImplementation(
      (path: string | null | undefined) =>
        path ? `asset://local/${path}` : null,
    );
    vi.mocked(openPathWithDefaultApp).mockResolvedValue(undefined);
    vi.mocked(openHtmlPreviewWindow).mockResolvedValue(true);
  });

  afterEach(() => {
    while (mountedPanels.length > 0) {
      const mounted = mountedPanels.pop();
      if (!mounted) {
        continue;
      }
      act(() => {
        mounted.root.unmount();
      });
      mounted.container.remove();
    }
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("嵌入式模式不应再渲染重复文件工具栏", () => {
    const container = mountCanvasPanel({
      state: {
        isOpen: true,
        contentType: "markdown",
        content: "# 标题\n\n正文内容",
        filename: "index.md",
        isEditing: false,
      },
      onClose: vi.fn(),
      onContentChange: vi.fn(),
      chrome: "embedded",
    });

    expect(container.textContent).toContain("标题");
    expect(container.textContent).not.toContain("index.md");
    expect(container.querySelector('[title="关闭"]')).toBeNull();
    expect(container.querySelector('[title="下载"]')).toBeNull();
    expect(container.querySelector('[title="复制"]')).toBeNull();
  });

  it("HTML 文件应默认显示网页预览，并支持切换到源码", () => {
    const onClose = vi.fn();
    const container = mountCanvasPanel({
      state: {
        isOpen: true,
        contentType: "html",
        content: "<!doctype html><html><body><h1>样板预览</h1></body></html>",
        language: "html",
        filename: "prototype.html",
        isEditing: false,
      },
      onClose,
      onContentChange: vi.fn(),
      chrome: "embedded",
    });

    const iframe = container.querySelector("iframe");
    expect(iframe).not.toBeNull();
    expect(iframe?.getAttribute("srcdoc")).toContain("样板预览");

    const sourceButton = container.querySelector(
      '[data-testid="canvas-html-source-mode"]',
    );
    expect(sourceButton).not.toBeUndefined();

    act(() => {
      sourceButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container.querySelector("iframe")).toBeNull();
    expect(container.textContent).toContain("<!doctype html>");
    expect(container.textContent).toContain("1");

    const previewButton = container.querySelector(
      '[data-testid="canvas-html-preview-mode"]',
    );
    act(() => {
      previewButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container.querySelector("iframe")).not.toBeNull();

    const closeButton = container.querySelector(
      '[data-testid="canvas-html-close"]',
    );
    expect(closeButton).not.toBeNull();

    act(() => {
      closeButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("HTML 文件有真实路径时应使用 Desktop Host 文件 URL 预览并支持独立窗口打开", () => {
    const container = mountCanvasPanel({
      state: {
        isOpen: true,
        contentType: "html",
        content: "<!doctype html><html><body><h1>样板预览</h1></body></html>",
        language: "html",
        filename: "prototype.html",
        sourcePath: "/tmp/lime/prototype.html",
        isEditing: false,
      },
      onClose: vi.fn(),
      onContentChange: vi.fn(),
      chrome: "embedded",
    });

    const iframe = container.querySelector("iframe");
    expect(resolveLocalFilePreviewUrl).toHaveBeenCalledWith(
      "/tmp/lime/prototype.html",
    );
    expect(iframe?.getAttribute("src")).toBe(
      "asset://local//tmp/lime/prototype.html",
    );
    expect(iframe?.getAttribute("srcdoc")).toBeNull();

    const externalButton = container.querySelector(
      '[data-testid="canvas-html-open-external"]',
    );
    expect(externalButton).not.toBeNull();

    act(() => {
      externalButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(openHtmlPreviewWindow).toHaveBeenCalledWith(
      "/tmp/lime/prototype.html",
      { title: "prototype.html" },
    );
    expect(openPathWithDefaultApp).not.toHaveBeenCalled();
  });

  it("浏览器模式无法转换真实路径时应回退 srcDoc 预览", () => {
    vi.mocked(resolveLocalFilePreviewUrl).mockReturnValue(null);

    const container = mountCanvasPanel({
      state: {
        isOpen: true,
        contentType: "html",
        content: "<!doctype html><html><body><h1>浏览器预览</h1></body></html>",
        language: "html",
        filename: "prototype.html",
        sourcePath: "/tmp/lime/prototype.html",
        isEditing: false,
      },
      onClose: vi.fn(),
      onContentChange: vi.fn(),
      chrome: "embedded",
    });

    const iframe = container.querySelector("iframe");
    expect(resolveLocalFilePreviewUrl).toHaveBeenCalledWith(
      "/tmp/lime/prototype.html",
    );
    expect(iframe?.getAttribute("src")).toBeNull();
    expect(iframe?.getAttribute("srcdoc")).toContain("浏览器预览");
  });

  it("HTML 文件有绝对 baseFilePath 时应使用该路径生成 Desktop Host 文件 URL", () => {
    const container = mountCanvasPanel({
      state: {
        isOpen: true,
        contentType: "html",
        content: "<!doctype html><html><body><h1>样板预览</h1></body></html>",
        language: "html",
        filename: "prototype.html",
        isEditing: false,
      },
      baseFilePath: "/tmp/lime/from-base.html",
      onClose: vi.fn(),
      onContentChange: vi.fn(),
      chrome: "embedded",
    });

    const iframe = container.querySelector("iframe");
    expect(resolveLocalFilePreviewUrl).toHaveBeenCalledWith(
      "/tmp/lime/from-base.html",
    );
    expect(iframe?.getAttribute("src")).toBe(
      "asset://local//tmp/lime/from-base.html",
    );
  });

  it("HTML 独立预览窗口不可用时应回退系统默认应用打开", async () => {
    vi.mocked(openHtmlPreviewWindow).mockResolvedValue(false);
    const container = mountCanvasPanel({
      state: {
        isOpen: true,
        contentType: "html",
        content: "<!doctype html><html><body><h1>样板预览</h1></body></html>",
        language: "html",
        filename: "prototype.html",
        sourcePath: "/tmp/lime/prototype.html",
        isEditing: false,
      },
      onClose: vi.fn(),
      onContentChange: vi.fn(),
      chrome: "embedded",
    });

    const externalButton = container.querySelector(
      '[data-testid="canvas-html-open-external"]',
    );

    await act(async () => {
      externalButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(openPathWithDefaultApp).toHaveBeenCalledWith(
      "/tmp/lime/prototype.html",
    );
  });
});
