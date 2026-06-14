import { describe, expect, it, vi } from "vitest";
import { ElectronEmbeddedBrowserHost } from "./embeddedBrowserHost";

const {
  addChildViewMock,
  closeMock,
  loadUrlMock,
  reloadMock,
  removeChildViewMock,
  setBoundsMock,
  setVisibleMock,
  webContentsEventHandlers,
  webContentsState,
  webContentsViewCtorMock,
} = vi.hoisted(() => {
  const webContentsState = {
    isLoading: false,
    title: "Example",
    url: "https://example.com/",
  };
  const webContentsEventHandlers = new Map<
    string,
    Array<(...args: unknown[]) => void>
  >();
  const loadUrlMock = vi.fn(async () => undefined);
  const reloadMock = vi.fn();
  const closeMock = vi.fn();
  const setBoundsMock = vi.fn();
  const setVisibleMock = vi.fn();
  return {
    addChildViewMock: vi.fn(),
    closeMock,
    loadUrlMock,
    reloadMock,
    removeChildViewMock: vi.fn(),
    setBoundsMock,
    setVisibleMock,
    webContentsEventHandlers,
    webContentsState,
    webContentsViewCtorMock: vi.fn(() => ({
      setBackgroundColor: vi.fn(),
      setBounds: setBoundsMock,
      setVisible: setVisibleMock,
      webContents: {
        close: closeMock,
        getTitle: () => webContentsState.title,
        getURL: () => webContentsState.url,
        isDestroyed: () => false,
        isLoading: () => webContentsState.isLoading,
        loadURL: loadUrlMock,
        navigationHistory: {
          canGoBack: () => false,
          canGoForward: () => false,
          goBack: vi.fn(),
          goForward: vi.fn(),
        },
        on: vi.fn(
          (eventName: string, handler: (...args: unknown[]) => void) => {
            const handlers = webContentsEventHandlers.get(eventName) || [];
            handlers.push(handler);
            webContentsEventHandlers.set(eventName, handlers);
          },
        ),
        reload: reloadMock,
        setWindowOpenHandler: vi.fn(),
      },
    })),
  };
});

vi.mock("./electronRuntime", () => ({
  shell: {
    openExternal: vi.fn(),
  },
  WebContentsView: webContentsViewCtorMock,
}));

function createWindow() {
  return {
    contentView: {
      addChildView: addChildViewMock,
      removeChildView: removeChildViewMock,
    },
    isDestroyed: () => false,
    off: vi.fn(),
    on: vi.fn(),
  };
}

function emitWebContentsEvent(eventName: string, ...args: unknown[]) {
  for (const handler of webContentsEventHandlers.get(eventName) || []) {
    handler(...args);
  }
}

describe("ElectronEmbeddedBrowserHost", () => {
  function resetMocks() {
    addChildViewMock.mockClear();
    closeMock.mockClear();
    loadUrlMock.mockReset();
    loadUrlMock.mockResolvedValue(undefined);
    reloadMock.mockClear();
    removeChildViewMock.mockClear();
    setBoundsMock.mockClear();
    setVisibleMock.mockClear();
    webContentsViewCtorMock.mockClear();
    webContentsState.isLoading = false;
    webContentsState.title = "Example";
    webContentsState.url = "https://example.com/";
    webContentsEventHandlers.clear();
  }

  it("通过 WebContentsView 挂载、导航和销毁内嵌浏览器", async () => {
    resetMocks();
    const emitted: Array<{ event: string; payload?: unknown }> = [];
    const host = new ElectronEmbeddedBrowserHost((event, payload) => {
      emitted.push({ event, payload });
    });
    const window = createWindow();

    await expect(
      host.invoke(window as never, "embedded_browser_view_mount", {
        viewId: "browser-1",
        url: "https://example.com",
        bounds: { x: 10, y: 20, width: 300, height: 200 },
      }),
    ).resolves.toMatchObject({
      viewId: "browser-1",
      url: "https://example.com/",
    });

    expect(webContentsViewCtorMock).toHaveBeenCalledWith(
      expect.objectContaining({
        webPreferences: expect.objectContaining({
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          webSecurity: true,
        }),
      }),
    );
    expect(addChildViewMock).toHaveBeenCalled();
    expect(setBoundsMock).toHaveBeenCalledWith({
      x: 10,
      y: 20,
      width: 300,
      height: 200,
    });
    expect(loadUrlMock).toHaveBeenCalledWith("https://example.com/");

    await host.invoke(window as never, "embedded_browser_view_navigate", {
      viewId: "browser-1",
      url: "https://openai.com",
    });
    expect(loadUrlMock).toHaveBeenCalledWith("https://openai.com/");

    await host.invoke(window as never, "embedded_browser_view_reload", {
      viewId: "browser-1",
    });
    expect(reloadMock).toHaveBeenCalled();

    await host.invoke(window as never, "embedded_browser_view_destroy", {
      viewId: "browser-1",
    });
    expect(removeChildViewMock).toHaveBeenCalled();
    expect(closeMock).toHaveBeenCalled();
    expect(
      emitted.some((item) => item.event === "embedded-browser-view-state"),
    ).toBe(true);
  });

  it("拒绝非 http/https 地址", async () => {
    resetMocks();
    const host = new ElectronEmbeddedBrowserHost();
    await expect(
      host.invoke(createWindow() as never, "embedded_browser_view_mount", {
        viewId: "browser-1",
        url: "file:///tmp/token",
      }),
    ).rejects.toThrow("内嵌浏览器只支持 http/https 地址");
  });

  it("挂载外部网址时只发起导航，不等待页面加载完成", async () => {
    resetMocks();
    webContentsState.url = "";
    webContentsState.isLoading = true;
    loadUrlMock.mockReturnValue(new Promise(() => undefined));
    const host = new ElectronEmbeddedBrowserHost();
    const window = createWindow();

    await expect(
      host.invoke(window as never, "embedded_browser_view_mount", {
        viewId: "browser-1",
        url: "https://google.com",
      }),
    ).resolves.toMatchObject({
      viewId: "browser-1",
      url: "https://google.com/",
      isLoading: true,
    });

    expect(loadUrlMock).toHaveBeenCalledWith("https://google.com/");
  });

  it("更新 bounds 时应按 visible 参数隐藏或恢复原生 BrowserView", async () => {
    resetMocks();
    const host = new ElectronEmbeddedBrowserHost();
    const window = createWindow();

    await host.invoke(window as never, "embedded_browser_view_mount", {
      viewId: "browser-1",
      url: "https://example.com",
      bounds: { x: 10, y: 20, width: 300, height: 200 },
    });
    setVisibleMock.mockClear();

    await host.invoke(window as never, "embedded_browser_view_set_bounds", {
      viewId: "browser-1",
      bounds: { x: 10, y: 20, width: 300, height: 200 },
      visible: false,
    });
    expect(setBoundsMock).toHaveBeenLastCalledWith({
      x: 10,
      y: 20,
      width: 300,
      height: 200,
    });
    expect(setVisibleMock).toHaveBeenLastCalledWith(false);

    await host.invoke(window as never, "embedded_browser_view_set_bounds", {
      viewId: "browser-1",
      bounds: { x: 10, y: 20, width: 300, height: 200 },
      visible: true,
    });
    expect(setVisibleMock).toHaveBeenLastCalledWith(true);
  });

  it("导航失败时不让 IPC reject，并通过失败事件回传", async () => {
    resetMocks();
    const emitted: Array<{ event: string; payload?: unknown }> = [];
    loadUrlMock.mockRejectedValue(new Error("navigation failed"));
    const host = new ElectronEmbeddedBrowserHost((event, payload) => {
      emitted.push({ event, payload });
    });
    const window = createWindow();

    await expect(
      host.invoke(window as never, "embedded_browser_view_navigate", {
        viewId: "browser-1",
        url: "https://blocked.example",
      }),
    ).resolves.toMatchObject({
      viewId: "browser-1",
      url: "https://blocked.example/",
      isLoading: true,
    });

    await vi.waitFor(() => {
      expect(
        emitted.find(
          (item) => item.event === "embedded-browser-view-load-failed",
        ),
      ).toMatchObject({
        payload: expect.objectContaining({
          viewId: "browser-1",
          url: "https://blocked.example/",
          errorCode: null,
          errorDescription: "navigation failed",
        }),
      });
    });
  });

  it("同一次导航的 did-fail-load 与 loadURL reject 不应重复回传失败事件", async () => {
    resetMocks();
    const emitted: Array<{ event: string; payload?: unknown }> = [];
    let rejectNavigation: (error: Error) => void = () => undefined;
    loadUrlMock.mockReturnValue(
      new Promise<undefined>((_resolve, reject) => {
        rejectNavigation = reject;
      }),
    );
    const host = new ElectronEmbeddedBrowserHost((event, payload) => {
      emitted.push({ event, payload });
    });
    const window = createWindow();

    await host.invoke(window as never, "embedded_browser_view_navigate", {
      viewId: "browser-1",
      url: "https://blocked.example",
    });

    emitWebContentsEvent(
      "did-fail-load",
      {},
      -105,
      "NAME_NOT_RESOLVED",
      "https://blocked.example/",
    );
    rejectNavigation(new Error("navigation failed"));
    await Promise.resolve();
    await Promise.resolve();

    expect(
      emitted.filter(
        (item) => item.event === "embedded-browser-view-load-failed",
      ),
    ).toHaveLength(1);
    expect(
      emitted.find(
        (item) => item.event === "embedded-browser-view-load-failed",
      ),
    ).toMatchObject({
      payload: expect.objectContaining({
        url: "https://blocked.example/",
        errorCode: -105,
        errorDescription: "NAME_NOT_RESOLVED",
      }),
    });
  });
});
