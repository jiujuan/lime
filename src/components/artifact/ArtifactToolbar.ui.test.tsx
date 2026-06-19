import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { changeLimeLocale } from "@/i18n/createI18n";
import type { Artifact } from "@/lib/artifact/types";
import { registerLightweightRenderers } from "./renderers";
import { ArtifactToolbar } from "./ArtifactToolbar";

const openHtmlPreviewWindowMock = vi.hoisted(() => vi.fn());
const openPathWithDefaultAppMock = vi.hoisted(() => vi.fn());
const hasDesktopHostInvokeCapabilityMock = vi.hoisted(() => vi.fn());
const openExternalUrlWithSystemBrowserMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api/fileSystem", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/api/fileSystem")>();
  return {
    ...actual,
    openHtmlPreviewWindow: openHtmlPreviewWindowMock,
    openPathWithDefaultApp: openPathWithDefaultAppMock,
  };
});

vi.mock("@/lib/desktop-runtime", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/desktop-runtime")>();
  return {
    ...actual,
    hasDesktopHostInvokeCapability: hasDesktopHostInvokeCapabilityMock,
  };
});

vi.mock("@/lib/api/externalUrl", () => ({
  openExternalUrlWithSystemBrowser: openExternalUrlWithSystemBrowserMock,
}));

const mountedRoots: Array<{ root: Root; container: HTMLDivElement }> = [];

function buildArtifact(overrides: Partial<Artifact> = {}): Artifact {
  return {
    id: "artifact-toolbar-1",
    type: "code",
    title: "index.html",
    content: "<main>Hello</main>",
    status: "streaming",
    meta: {
      language: "html",
      writePhase: "streaming",
    },
    position: { start: 0, end: 18 },
    createdAt: 1_777_777_000,
    updatedAt: 1_777_777_999,
    ...overrides,
  };
}

function renderToolbar(artifact = buildArtifact()) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <ArtifactToolbar
        artifact={artifact}
        viewMode="preview"
        previewSize="mobile"
        onViewModeChange={vi.fn()}
        onPreviewSizeChange={vi.fn()}
        onClose={vi.fn()}
        tone="light"
      />,
    );
  });

  mountedRoots.push({ root, container });
  return container;
}

function expectButtonTitle(container: HTMLElement, title: string) {
  expect(container.querySelector(`button[title="${title}"]`)).not.toBeNull();
}

function queryButtonByTitle(container: HTMLElement, title: string) {
  return container.querySelector<HTMLButtonElement>(`button[title="${title}"]`);
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

  registerLightweightRenderers();
  openHtmlPreviewWindowMock.mockResolvedValue(false);
  openPathWithDefaultAppMock.mockResolvedValue(undefined);
  openExternalUrlWithSystemBrowserMock.mockResolvedValue(undefined);
  hasDesktopHostInvokeCapabilityMock.mockReturnValue(false);
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
  vi.clearAllMocks();
});

describe("ArtifactToolbar", () => {
  it("应通过 workspace namespace 渲染英文工具栏 chrome", () => {
    const container = renderToolbar();
    const text = container.textContent ?? "";

    expect(text).toContain("Code");
    expect(text).toContain("Writing");
    expect(text).not.toContain("代码");
    expect(text).not.toContain("正在写入");
    expectButtonTitle(container, "Source");
    expectButtonTitle(container, "Preview");
    expectButtonTitle(container, "Phone");
    expectButtonTitle(container, "Tablet");
    expectButtonTitle(container, "Desktop");
    expectButtonTitle(container, "Copy content");
    expectButtonTitle(container, "Download file");
    expectButtonTitle(container, "Open in new window");
    expectButtonTitle(container, "Close");
  });

  it("有绝对本地 HTML 路径时应优先使用 Desktop Host 独立预览窗口", async () => {
    openHtmlPreviewWindowMock.mockResolvedValueOnce(true);
    const openWindow = vi.fn();
    vi.spyOn(window, "open").mockImplementation(openWindow);
    const container = renderToolbar(
      buildArtifact({
        meta: {
          language: "html",
          filePath: "/tmp/lime/artifacts/index.html",
        },
      }),
    );

    await act(async () => {
      queryButtonByTitle(container, "Open in new window")?.click();
      await Promise.resolve();
    });

    expect(openHtmlPreviewWindowMock).toHaveBeenCalledWith(
      "/tmp/lime/artifacts/index.html",
      { title: "index.html" },
    );
    expect(openWindow).not.toHaveBeenCalled();
  });

  it("无绝对本地路径时保留内存内容预览，不误走 Desktop Host 文件预览", async () => {
    const documentClose = vi.fn();
    const documentWrite = vi.fn();
    vi.spyOn(window, "open").mockReturnValue({
      document: {
        write: documentWrite,
        close: documentClose,
      },
    } as unknown as Window);
    const container = renderToolbar(
      buildArtifact({
        meta: {
          language: "html",
          filePath: "relative/index.html",
        },
      }),
    );

    await act(async () => {
      queryButtonByTitle(container, "Open in new window")?.click();
      await Promise.resolve();
    });

    expect(openHtmlPreviewWindowMock).not.toHaveBeenCalled();
    expect(documentWrite).toHaveBeenCalledWith("<main>Hello</main>");
    expect(documentClose).toHaveBeenCalledTimes(1);
  });

  it("Desktop Host 预览窗口失败时不应回退浏览器空白窗口", async () => {
    openHtmlPreviewWindowMock.mockResolvedValueOnce(false);
    hasDesktopHostInvokeCapabilityMock.mockReturnValue(true);
    const openWindow = vi.fn();
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    vi.spyOn(window, "open").mockImplementation(openWindow);
    const container = renderToolbar(
      buildArtifact({
        meta: {
          language: "html",
          filePath: "/tmp/lime/artifacts/index.html",
        },
      }),
    );

    await act(async () => {
      queryButtonByTitle(container, "Open in new window")?.click();
      await Promise.resolve();
    });

    expect(openHtmlPreviewWindowMock).toHaveBeenCalledWith(
      "/tmp/lime/artifacts/index.html",
      { title: "index.html" },
    );
    expect(consoleError).toHaveBeenCalledWith(
      "Desktop Host HTML 预览窗口创建失败",
    );
    expect(openWindow).not.toHaveBeenCalled();
  });

  it("source-backed preview artifact 应按 renderMode 使用独立窗口", async () => {
    openHtmlPreviewWindowMock.mockResolvedValueOnce(true);
    const openWindow = vi.fn();
    vi.spyOn(window, "open").mockImplementation(openWindow);
    const container = renderToolbar(
      buildArtifact({
        type: "document",
        title: "prototype.html",
        content: "",
        meta: {
          previewArtifact: true,
          sourcePath: "/tmp/lime/artifacts/prototype.html",
          renderMode: "external_window",
          capabilities: {
            externalWindow: true,
          },
        },
      }),
    );

    await act(async () => {
      queryButtonByTitle(container, "Open in new window")?.click();
      await Promise.resolve();
    });

    expect(openHtmlPreviewWindowMock).toHaveBeenCalledWith(
      "/tmp/lime/artifacts/prototype.html",
      { title: "prototype.html" },
    );
    expect(openWindow).not.toHaveBeenCalled();
  });

  it("system_open preview artifact 应通过系统默认应用打开真实文件", async () => {
    const openWindow = vi.fn();
    vi.spyOn(window, "open").mockImplementation(openWindow);
    const container = renderToolbar(
      buildArtifact({
        type: "document",
        title: "archive.zip",
        content: "该文件暂不支持在工作台内嵌预览。",
        meta: {
          previewArtifact: true,
          sourcePath: "/tmp/lime/archive.zip",
          renderMode: "system_open",
          capabilities: {
            systemOpen: true,
          },
        },
      }),
    );

    await act(async () => {
      queryButtonByTitle(container, "Open in new window")?.click();
      await Promise.resolve();
    });

    expect(openPathWithDefaultAppMock).toHaveBeenCalledWith(
      "/tmp/lime/archive.zip",
    );
    expect(openHtmlPreviewWindowMock).not.toHaveBeenCalled();
    expect(openWindow).not.toHaveBeenCalled();
  });

  it("URL preview artifact 应通过统一外部链接通道打开来源网页", async () => {
    const openWindow = vi.fn();
    vi.spyOn(window, "open").mockImplementation(openWindow);
    const container = renderToolbar(
      buildArtifact({
        type: "document",
        title: "在线报告",
        content: "导入摘要",
        meta: {
          previewArtifact: true,
          source: "url",
          sourceRef: "https://example.com/report",
          sourcePath: "https://example.com/report",
          renderMode: "inline",
        },
      }),
    );

    await act(async () => {
      queryButtonByTitle(container, "Open in new window")?.click();
      await Promise.resolve();
    });

    expect(openExternalUrlWithSystemBrowserMock).toHaveBeenCalledWith(
      "https://example.com/report",
    );
    expect(openPathWithDefaultAppMock).not.toHaveBeenCalled();
    expect(openHtmlPreviewWindowMock).not.toHaveBeenCalled();
    expect(openWindow).not.toHaveBeenCalled();
  });
});
