import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CanvasWorkbenchBrowserPanel } from "./CanvasWorkbenchBrowserPanel";

const {
  mockDestroyEmbeddedBrowserView,
  mockFindInEmbeddedBrowserView,
  mockIsEmbeddedBrowserHostAvailable,
  mockListenEmbeddedBrowserDownload,
  mockListenEmbeddedBrowserPermissionRequest,
  mockListenEmbeddedBrowserViewLoadFailed,
  mockListenEmbeddedBrowserViewState,
  mockMountEmbeddedBrowserView,
  mockReloadEmbeddedBrowserView,
  mockSetEmbeddedBrowserViewBounds,
  mockSetEmbeddedBrowserViewZoom,
  mockStopFindInEmbeddedBrowserView,
  mockStopLoadingEmbeddedBrowserView,
} = vi.hoisted(() => ({
  mockDestroyEmbeddedBrowserView: vi.fn(),
  mockFindInEmbeddedBrowserView: vi.fn(),
  mockIsEmbeddedBrowserHostAvailable: vi.fn(),
  mockListenEmbeddedBrowserDownload: vi.fn(),
  mockListenEmbeddedBrowserPermissionRequest: vi.fn(),
  mockListenEmbeddedBrowserViewLoadFailed: vi.fn(),
  mockListenEmbeddedBrowserViewState: vi.fn(),
  mockMountEmbeddedBrowserView: vi.fn(),
  mockReloadEmbeddedBrowserView: vi.fn(),
  mockSetEmbeddedBrowserViewBounds: vi.fn(),
  mockSetEmbeddedBrowserViewZoom: vi.fn(),
  mockStopFindInEmbeddedBrowserView: vi.fn(),
  mockStopLoadingEmbeddedBrowserView: vi.fn(),
}));

vi.mock("@/lib/api/embeddedBrowser", () => ({
  destroyEmbeddedBrowserView: mockDestroyEmbeddedBrowserView,
  findInEmbeddedBrowserView: mockFindInEmbeddedBrowserView,
  goBackEmbeddedBrowserView: vi.fn(),
  goForwardEmbeddedBrowserView: vi.fn(),
  isEmbeddedBrowserHostAvailable: mockIsEmbeddedBrowserHostAvailable,
  listenEmbeddedBrowserDownload: mockListenEmbeddedBrowserDownload,
  listenEmbeddedBrowserPermissionRequest:
    mockListenEmbeddedBrowserPermissionRequest,
  listenEmbeddedBrowserViewLoadFailed: mockListenEmbeddedBrowserViewLoadFailed,
  listenEmbeddedBrowserViewState: mockListenEmbeddedBrowserViewState,
  mountEmbeddedBrowserView: mockMountEmbeddedBrowserView,
  navigateEmbeddedBrowserView: vi.fn(),
  reloadEmbeddedBrowserView: mockReloadEmbeddedBrowserView,
  setEmbeddedBrowserViewZoom: mockSetEmbeddedBrowserViewZoom,
  setEmbeddedBrowserViewBounds: mockSetEmbeddedBrowserViewBounds,
  stopFindInEmbeddedBrowserView: mockStopFindInEmbeddedBrowserView,
  stopLoadingEmbeddedBrowserView: mockStopLoadingEmbeddedBrowserView,
}));

vi.mock("@/lib/api/externalUrl", () => ({
  openExternalUrlWithSystemBrowser: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
  },
}));

const translations: Record<string, string> = {
  "agentChat.canvasWorkbench.browser.address": "输入网址或搜索",
  "agentChat.canvasWorkbench.browser.addressPlaceholder": "输入网址或搜索",
  "agentChat.canvasWorkbench.browser.back": "后退",
  "agentChat.canvasWorkbench.browser.downloadCancelled":
    "下载已取消：{{filename}}",
  "agentChat.canvasWorkbench.browser.downloadComplete":
    "下载完成：{{filename}}",
  "agentChat.canvasWorkbench.browser.downloadInterrupted":
    "下载中断：{{filename}}",
  "agentChat.canvasWorkbench.browser.downloadProgress":
    "正在下载 {{filename}}（{{percent}}%）",
  "agentChat.canvasWorkbench.browser.find": "在页面中查找",
  "agentChat.canvasWorkbench.browser.findInput": "查找页面文字",
  "agentChat.canvasWorkbench.browser.findMatchCount": "0/0",
  "agentChat.canvasWorkbench.browser.findNext": "下一个匹配项",
  "agentChat.canvasWorkbench.browser.findPlaceholder": "查找",
  "agentChat.canvasWorkbench.browser.findPrevious": "上一个匹配项",
  "agentChat.canvasWorkbench.browser.forward": "前进",
  "agentChat.canvasWorkbench.browser.openExternal": "在系统浏览器打开",
  "agentChat.canvasWorkbench.browser.permissionBlockedBody":
    "来源 {{source}} 的请求已被阻止，需要人工接管后再处理。",
  "agentChat.canvasWorkbench.browser.permissionBlockedTitle":
    "已阻止页面权限：{{permission}}",
  "agentChat.canvasWorkbench.browser.refresh": "刷新浏览器标签",
  "agentChat.canvasWorkbench.browser.loadFailedBody":
    "页面暂时无法打开。技术信息：{{message}}",
  "agentChat.canvasWorkbench.browser.loadFailedDnsBody":
    "无法解析这个域名。请检查网址、网络或 DNS 设置。技术信息：{{message}}",
  "agentChat.canvasWorkbench.browser.loadFailedDnsTitle": "找不到网站",
  "agentChat.canvasWorkbench.browser.loadFailedFallback": "未知加载错误",
  "agentChat.canvasWorkbench.browser.stop": "停止加载",
  "agentChat.canvasWorkbench.browser.title": "新选项卡",
  "agentChat.canvasWorkbench.browser.zoomIn": "放大页面",
  "agentChat.canvasWorkbench.browser.zoomOut": "缩小页面",
  "agentChat.canvasWorkbench.browser.zoomReset": "重置缩放",
};

function translateWorkbench(
  key: string,
  options?: Record<string, unknown>,
): string {
  let value = translations[key] ?? key;
  for (const [optionKey, optionValue] of Object.entries(options ?? {})) {
    value = value.replace(`{{${optionKey}}}`, String(optionValue));
  }
  return value;
}

function browserState(isLoading: boolean) {
  return {
    viewId: "browser-panel-test",
    url: "https://example.com/",
    title: "Example",
    faviconUrl: "https://example.com/favicon.ico",
    canGoBack: false,
    canGoForward: false,
    isLoading,
    loadProgress: isLoading ? 0.35 : 1,
    zoomFactor: 1,
    find: {
      text: "",
      activeMatchOrdinal: 0,
      matches: 0,
      finalUpdate: true,
    },
  };
}

describe("CanvasWorkbenchBrowserPanel", () => {
  let container: HTMLDivElement;
  let root: Root;
  let currentRect: Pick<DOMRect, "left" | "top" | "width" | "height">;
  let originalGetBoundingClientRect: typeof HTMLElement.prototype.getBoundingClientRect;

  beforeEach(() => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT?: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    currentRect = { left: 10, top: 20, width: 320, height: 240 };
    originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;
    HTMLElement.prototype.getBoundingClientRect = vi.fn(
      () =>
        ({
          ...currentRect,
          bottom: currentRect.top + currentRect.height,
          right: currentRect.left + currentRect.width,
          x: currentRect.left,
          y: currentRect.top,
          toJSON: () => ({}),
        }) as DOMRect,
    );
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    HTMLElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
    vi.clearAllMocks();
  });

  it("loading 时应把 refresh 按钮切换为 stop action", async () => {
    mockIsEmbeddedBrowserHostAvailable.mockReturnValue(true);
    mockDestroyEmbeddedBrowserView.mockResolvedValue(undefined);
    mockListenEmbeddedBrowserDownload.mockResolvedValue(vi.fn());
    mockListenEmbeddedBrowserPermissionRequest.mockResolvedValue(vi.fn());
    mockListenEmbeddedBrowserViewLoadFailed.mockResolvedValue(vi.fn());
    mockListenEmbeddedBrowserViewState.mockResolvedValue(vi.fn());
    mockMountEmbeddedBrowserView.mockResolvedValue(browserState(true));
    mockSetEmbeddedBrowserViewBounds.mockResolvedValue(browserState(true));
    mockStopLoadingEmbeddedBrowserView.mockResolvedValue(browserState(false));
    mockReloadEmbeddedBrowserView.mockResolvedValue(browserState(true));

    await act(async () => {
      root.render(
        <CanvasWorkbenchBrowserPanel
          ghostButtonClassName=""
          initialUrl="https://example.com"
          translateWorkbench={translateWorkbench}
        />,
      );
      await settle();
    });

    const stopButton = await waitForButton(container, "停止加载");
    await act(async () => {
      stopButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await settle();
    });

    expect(mockStopLoadingEmbeddedBrowserView).toHaveBeenCalled();
    expect(mockReloadEmbeddedBrowserView).not.toHaveBeenCalled();
  });

  it("显示标题 favicon 进度，并接线查找和单标签缩放", async () => {
    mockIsEmbeddedBrowserHostAvailable.mockReturnValue(true);
    mockDestroyEmbeddedBrowserView.mockResolvedValue(undefined);
    mockListenEmbeddedBrowserDownload.mockResolvedValue(vi.fn());
    mockListenEmbeddedBrowserPermissionRequest.mockResolvedValue(vi.fn());
    mockListenEmbeddedBrowserViewLoadFailed.mockResolvedValue(vi.fn());
    mockListenEmbeddedBrowserViewState.mockResolvedValue(vi.fn());
    mockMountEmbeddedBrowserView.mockResolvedValue(browserState(true));
    mockSetEmbeddedBrowserViewBounds.mockResolvedValue(browserState(true));
    mockFindInEmbeddedBrowserView.mockResolvedValue({
      ...browserState(false),
      find: {
        text: "Example",
        activeMatchOrdinal: 1,
        matches: 2,
        finalUpdate: true,
      },
    });
    mockSetEmbeddedBrowserViewZoom.mockResolvedValue({
      ...browserState(false),
      zoomFactor: 1.1,
    });
    mockStopFindInEmbeddedBrowserView.mockResolvedValue(browserState(false));

    await act(async () => {
      root.render(
        <CanvasWorkbenchBrowserPanel
          ghostButtonClassName=""
          initialUrl="https://example.com"
          translateWorkbench={translateWorkbench}
        />,
      );
      await settle();
    });

    expect(container.textContent).toContain("Example");
    expect(
      container.querySelector('img[src="https://example.com/favicon.ico"]'),
    ).toBeTruthy();
    expect(
      container.querySelector('[aria-hidden="true"] .bg-emerald-500'),
    ).toBeTruthy();

    const findButton = await waitForButton(container, "在页面中查找");
    await act(async () => {
      findButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await settle();
    });
    const findInput = container.querySelector<HTMLInputElement>(
      'input[aria-label="查找页面文字"]',
    );
    expect(findInput).toBeTruthy();
    await act(async () => {
      setInputValue(findInput!, "Example");
      await settle();
    });
    await act(async () => {
      findInput!.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
      await settle();
    });
    expect(mockFindInEmbeddedBrowserView).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "Example",
        forward: true,
        findNext: true,
      }),
    );

    const zoomInButton = await waitForButton(container, "放大页面");
    await act(async () => {
      zoomInButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await settle();
    });
    expect(mockSetEmbeddedBrowserViewZoom).toHaveBeenCalledWith(
      expect.any(String),
      1.1,
    );
  });

  it("按加载失败分类显示错误页文案", async () => {
    mockIsEmbeddedBrowserHostAvailable.mockReturnValue(true);
    mockDestroyEmbeddedBrowserView.mockResolvedValue(undefined);
    mockListenEmbeddedBrowserDownload.mockResolvedValue(vi.fn());
    mockListenEmbeddedBrowserPermissionRequest.mockResolvedValue(vi.fn());
    mockListenEmbeddedBrowserViewLoadFailed.mockResolvedValue(vi.fn());
    mockListenEmbeddedBrowserViewState.mockResolvedValue(vi.fn());
    mockMountEmbeddedBrowserView.mockResolvedValue(browserState(false));
    mockSetEmbeddedBrowserViewBounds.mockResolvedValue(browserState(false));

    await act(async () => {
      root.render(
        <CanvasWorkbenchBrowserPanel
          ghostButtonClassName=""
          initialUrl="https://example.com"
          translateWorkbench={translateWorkbench}
        />,
      );
      await settle();
    });

    const loadFailedHandler = mockListenEmbeddedBrowserViewLoadFailed.mock
      .calls[0]?.[0] as
      | ((
          event: ReturnType<typeof browserState> & {
            errorCode: number | null;
            errorDescription: string;
            failureCategory: "dns";
          },
        ) => void)
      | undefined;
    expect(loadFailedHandler).toBeTypeOf("function");
    const viewId = String(
      mockMountEmbeddedBrowserView.mock.calls[0]?.[0].viewId,
    );

    await act(async () => {
      loadFailedHandler?.({
        ...browserState(false),
        viewId,
        errorCode: -105,
        errorDescription: "NAME_NOT_RESOLVED",
        failureCategory: "dns",
      });
      await settle();
    });

    expect(
      container.querySelector('[data-testid="canvas-workbench-browser-error"]')
        ?.textContent,
    ).toContain("找不到网站");
    expect(container.textContent).toContain("无法解析这个域名");
    expect(container.textContent).toContain("NAME_NOT_RESOLVED");

    currentRect = { left: 10, top: 20, width: 360, height: 260 };
    await act(async () => {
      window.dispatchEvent(new Event("resize"));
      await settle();
    });
    expect(container.textContent).toContain("找不到网站");
  });

  it("显示当前浏览器下载进度和完成状态", async () => {
    mockIsEmbeddedBrowserHostAvailable.mockReturnValue(true);
    mockDestroyEmbeddedBrowserView.mockResolvedValue(undefined);
    mockListenEmbeddedBrowserDownload.mockResolvedValue(vi.fn());
    mockListenEmbeddedBrowserPermissionRequest.mockResolvedValue(vi.fn());
    mockListenEmbeddedBrowserViewLoadFailed.mockResolvedValue(vi.fn());
    mockListenEmbeddedBrowserViewState.mockResolvedValue(vi.fn());
    mockMountEmbeddedBrowserView.mockResolvedValue(browserState(false));
    mockSetEmbeddedBrowserViewBounds.mockResolvedValue(browserState(false));

    await act(async () => {
      root.render(
        <CanvasWorkbenchBrowserPanel
          ghostButtonClassName=""
          initialUrl="https://example.com"
          translateWorkbench={translateWorkbench}
        />,
      );
      await settle();
    });

    const downloadHandler = mockListenEmbeddedBrowserDownload.mock
      .calls[0]?.[0] as
      | ((event: {
          viewId: string;
          downloadId: string;
          url: string;
          filename: string;
          mimeType: string | null;
          state:
            | "started"
            | "progressing"
            | "completed"
            | "cancelled"
            | "interrupted";
          receivedBytes: number;
          totalBytes: number | null;
          canResume: boolean;
        }) => void)
      | undefined;
    expect(downloadHandler).toBeTypeOf("function");
    const viewId = String(
      mockMountEmbeddedBrowserView.mock.calls[0]?.[0].viewId,
    );

    await act(async () => {
      downloadHandler?.({
        viewId,
        downloadId: "download-1",
        url: "https://example.com/report.pdf",
        filename: "report.pdf",
        mimeType: "application/pdf",
        state: "progressing",
        receivedBytes: 50,
        totalBytes: 100,
        canResume: false,
      });
      await settle();
    });

    expect(
      container.querySelector(
        '[data-testid="canvas-workbench-browser-download"]',
      )?.textContent,
    ).toContain("正在下载 report.pdf（50%）");

    await act(async () => {
      downloadHandler?.({
        viewId,
        downloadId: "download-1",
        url: "https://example.com/report.pdf",
        filename: "report.pdf",
        mimeType: "application/pdf",
        state: "completed",
        receivedBytes: 100,
        totalBytes: 100,
        canResume: false,
      });
      await settle();
    });

    expect(container.textContent).toContain("下载完成：report.pdf");
  });

  it("显示当前浏览器权限请求的阻止状态", async () => {
    mockIsEmbeddedBrowserHostAvailable.mockReturnValue(true);
    mockDestroyEmbeddedBrowserView.mockResolvedValue(undefined);
    mockListenEmbeddedBrowserDownload.mockResolvedValue(vi.fn());
    mockListenEmbeddedBrowserPermissionRequest.mockResolvedValue(vi.fn());
    mockListenEmbeddedBrowserViewLoadFailed.mockResolvedValue(vi.fn());
    mockListenEmbeddedBrowserViewState.mockResolvedValue(vi.fn());
    mockMountEmbeddedBrowserView.mockResolvedValue(browserState(false));
    mockSetEmbeddedBrowserViewBounds.mockResolvedValue(browserState(false));

    await act(async () => {
      root.render(
        <CanvasWorkbenchBrowserPanel
          ghostButtonClassName=""
          initialUrl="https://example.com"
          translateWorkbench={translateWorkbench}
        />,
      );
      await settle();
    });

    const permissionHandler = mockListenEmbeddedBrowserPermissionRequest.mock
      .calls[0]?.[0] as
      | ((event: {
          viewId: string;
          requestId: string;
          permission: string;
          url: string;
          requestingUrl: string | null;
          embeddingOrigin: string | null;
          decision: "blocked";
        }) => void)
      | undefined;
    expect(permissionHandler).toBeTypeOf("function");
    const viewId = String(
      mockMountEmbeddedBrowserView.mock.calls[0]?.[0].viewId,
    );

    await act(async () => {
      permissionHandler?.({
        viewId: "other-view",
        requestId: "permission-0",
        permission: "media",
        url: "https://other.example/",
        requestingUrl: "https://other.example/camera",
        embeddingOrigin: "https://other.example",
        decision: "blocked",
      });
      await settle();
    });
    expect(
      container.querySelector(
        '[data-testid="canvas-workbench-browser-permission"]',
      ),
    ).toBeFalsy();

    await act(async () => {
      permissionHandler?.({
        viewId,
        requestId: "permission-1",
        permission: "media",
        url: "https://example.com/",
        requestingUrl: "https://example.com/camera",
        embeddingOrigin: "https://example.com",
        decision: "blocked",
      });
      await settle();
    });

    const permissionBanner = container.querySelector(
      '[data-testid="canvas-workbench-browser-permission"]',
    );
    expect(permissionBanner?.textContent).toContain("已阻止页面权限：media");
    expect(permissionBanner?.textContent).toContain(
      "https://example.com/camera",
    );
  });

  it("同步 overlay、收起和 resize 下的 WebContentsView 可见性", async () => {
    mockIsEmbeddedBrowserHostAvailable.mockReturnValue(true);
    mockDestroyEmbeddedBrowserView.mockResolvedValue(undefined);
    mockListenEmbeddedBrowserDownload.mockResolvedValue(vi.fn());
    mockListenEmbeddedBrowserPermissionRequest.mockResolvedValue(vi.fn());
    mockListenEmbeddedBrowserViewLoadFailed.mockResolvedValue(vi.fn());
    mockListenEmbeddedBrowserViewState.mockResolvedValue(vi.fn());
    mockMountEmbeddedBrowserView.mockResolvedValue(browserState(false));
    mockSetEmbeddedBrowserViewBounds.mockResolvedValue(browserState(false));

    await act(async () => {
      root.render(
        <CanvasWorkbenchBrowserPanel
          ghostButtonClassName=""
          initialUrl="https://example.com"
          translateWorkbench={translateWorkbench}
        />,
      );
      await settle();
    });

    expect(mockMountEmbeddedBrowserView).toHaveBeenCalledWith(
      expect.objectContaining({
        bounds: { x: 10, y: 20, width: 320, height: 240 },
        visible: true,
      }),
    );

    mockSetEmbeddedBrowserViewBounds.mockClear();
    await act(async () => {
      root.render(
        <CanvasWorkbenchBrowserPanel
          ghostButtonClassName=""
          initialUrl="https://example.com"
          obscuredByChromeOverlay
          translateWorkbench={translateWorkbench}
        />,
      );
      await settle();
    });
    expect(lastBoundsSync()).toMatchObject({ visible: false });

    currentRect = { left: 10, top: 20, width: 0, height: 0 };
    mockSetEmbeddedBrowserViewBounds.mockClear();
    await act(async () => {
      window.dispatchEvent(new Event("resize"));
      await settle();
    });
    expect(lastBoundsSync()).toMatchObject({
      bounds: { x: 10, y: 20, width: 0, height: 0 },
      visible: false,
    });

    currentRect = { left: 10, top: 20, width: 360, height: 260 };
    mockSetEmbeddedBrowserViewBounds.mockClear();
    await act(async () => {
      root.render(
        <CanvasWorkbenchBrowserPanel
          ghostButtonClassName=""
          initialUrl="https://example.com"
          translateWorkbench={translateWorkbench}
        />,
      );
      window.dispatchEvent(new Event("resize"));
      await settle();
    });
    expect(lastBoundsSync()).toMatchObject({
      bounds: { x: 10, y: 20, width: 360, height: 260 },
      visible: true,
    });
  });
});

function lastBoundsSync() {
  const calls = mockSetEmbeddedBrowserViewBounds.mock.calls;
  return calls[calls.length - 1]?.[0];
}

async function waitForButton(
  container: HTMLElement,
  label: string,
): Promise<HTMLButtonElement> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const button = container.querySelector<HTMLButtonElement>(
      `button[aria-label="${label}"]`,
    );
    if (button) {
      return button;
    }
    await act(async () => {
      await settle();
    });
  }
  throw new Error(`button ${label} not found`);
}

function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function setInputValue(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}
