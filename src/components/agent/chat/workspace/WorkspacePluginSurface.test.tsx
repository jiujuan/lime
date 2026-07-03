import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspacePluginSurface } from "./WorkspacePluginSurface";
import type { WorkspacePluginSurfaceDescriptor } from "./workspacePluginSurfaceModel";

const embeddedBrowserMocks = vi.hoisted(() => ({
  destroyEmbeddedBrowserView: vi.fn(async () => undefined),
  isEmbeddedBrowserHostAvailable: vi.fn(() => true),
  listenEmbeddedBrowserViewLoadFailed: vi.fn(async () => vi.fn()),
  listenEmbeddedBrowserViewState: vi.fn(async () => vi.fn()),
  mountEmbeddedBrowserView: vi.fn(async () => ({
    viewId: "plugin-surface-plugin-shell-content-factory-app-standalone",
    url: "http://127.0.0.1:4199/dashboard",
    title: "内容工厂",
    canGoBack: false,
    canGoForward: false,
    isLoading: false,
  })),
  navigateEmbeddedBrowserView: vi.fn(async () => ({
    viewId: "plugin-surface-plugin-shell-content-factory-app-standalone",
    url: "http://127.0.0.1:4199/dashboard",
    title: "内容工厂",
    canGoBack: false,
    canGoForward: false,
    isLoading: false,
  })),
  setEmbeddedBrowserViewBounds: vi.fn(async () => ({
    viewId: "plugin-surface-plugin-shell-content-factory-app-standalone",
    url: "http://127.0.0.1:4199/dashboard",
    title: "内容工厂",
    canGoBack: false,
    canGoForward: false,
    isLoading: false,
  })),
}));

vi.mock("@/lib/api/embeddedBrowser", () => embeddedBrowserMocks);

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const copy: Record<string, string> = {
        "agentChat.pluginSurface.hostUnavailableBody":
          "当前环境没有可用的 Electron WebContentsView bridge。",
        "agentChat.pluginSurface.hostUnavailableTitle": "宿主不可用",
        "agentChat.pluginSurface.closeTab": "关闭",
        "agentChat.pluginSurface.loading": "正在加载",
        "agentChat.pluginSurface.loadingBody": "正在连接 Plugin。",
        "agentChat.pluginSurface.loadingTitle": "正在打开 Plugin",
        "agentChat.pluginSurface.ready": "已连接",
      };
      return copy[key] ?? key;
    },
  }),
}));

const mountedRoots: Array<{ root: Root; container: HTMLDivElement }> = [];

const surface: WorkspacePluginSurfaceDescriptor = {
  appId: "content-factory-app",
  title: "内容工厂",
  entryUrl: "http://127.0.0.1:4199/dashboard",
  containerId: "plugin-shell-content-factory-app-standalone",
  activeStrategy: "controlledBrowserWindow",
  supportedStrategies: ["controlledBrowserWindow", "webContentsView"],
  sourceRequestId: "right_surface_plugin_1",
};

const promptLabSurface: WorkspacePluginSurfaceDescriptor = {
  appId: "prompt-lab-app",
  title: "提示词实验室",
  entryUrl: "http://127.0.0.1:4201/",
  containerId: "plugin-shell-prompt-lab-app",
  activeStrategy: "webContentsView",
  supportedStrategies: ["webContentsView"],
  sourceRequestId: "right_surface_plugin_2",
};

beforeEach(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  embeddedBrowserMocks.isEmbeddedBrowserHostAvailable.mockReturnValue(true);
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
});

async function renderSurface(
  props: Partial<React.ComponentProps<typeof WorkspacePluginSurface>> = {},
) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(<WorkspacePluginSurface surface={surface} {...props} />);
    await Promise.resolve();
    await Promise.resolve();
  });

  mountedRoots.push({ root, container });
  return container;
}

describe("WorkspacePluginSurface", () => {
  it("应通过 embedded browser host 挂载 Plugin entry URL", async () => {
    const container = await renderSurface();

    expect(
      container.querySelector('[data-testid="workspace-plugin-surface"]'),
    ).not.toBeNull();
    expect(container.textContent).toContain("内容工厂");
    expect(embeddedBrowserMocks.mountEmbeddedBrowserView).toHaveBeenCalledWith(
      expect.objectContaining({
        viewId:
          "plugin-surface-plugin-shell-content-factory-app-standalone",
        url: "http://127.0.0.1:4199/dashboard",
      }),
    );

    const mounted = mountedRoots.pop();
    act(() => {
      mounted?.root.unmount();
    });
    mounted?.container.remove();
    expect(
      embeddedBrowserMocks.destroyEmbeddedBrowserView,
    ).toHaveBeenCalledWith(
      "plugin-surface-plugin-shell-content-factory-app-standalone",
    );
  });

  it("Electron host 不可用时应 fail closed，不挂载 WebContentsView", async () => {
    embeddedBrowserMocks.isEmbeddedBrowserHostAvailable.mockReturnValue(false);
    const container = await renderSurface();

    expect(container.textContent).toContain("宿主不可用");
    expect(
      embeddedBrowserMocks.mountEmbeddedBrowserView,
    ).not.toHaveBeenCalled();
  });

  it("应在右侧 appSurface 内渲染多个 Plugin 实例 tab，并支持聚焦和关闭", async () => {
    const onSelectSurface = vi.fn();
    const onCloseSurface = vi.fn();
    const container = await renderSurface({
      activeContainerId: promptLabSurface.containerId,
      surfaces: [surface, promptLabSurface],
      onSelectSurface,
      onCloseSurface,
    });

    expect(
      container.querySelector(
        '[data-testid="workspace-plugin-surface-tabs"]',
      ),
    ).not.toBeNull();
    expect(container.textContent).toContain("内容工厂");
    expect(container.textContent).toContain("提示词实验室");
    expect(embeddedBrowserMocks.mountEmbeddedBrowserView).toHaveBeenCalledWith(
      expect.objectContaining({
        viewId: "plugin-surface-plugin-shell-prompt-lab-app",
        url: "http://127.0.0.1:4201/",
      }),
    );

    act(() => {
      container
        .querySelector<HTMLButtonElement>(
          `[data-testid="workspace-plugin-surface-tab-${surface.containerId}"]`,
        )
        ?.click();
    });
    expect(onSelectSurface).toHaveBeenCalledWith(surface);

    act(() => {
      container
        .querySelector<HTMLButtonElement>(
          `[data-testid="workspace-plugin-surface-close-${promptLabSurface.containerId}"]`,
        )
        ?.click();
    });
    expect(onCloseSurface).toHaveBeenCalledWith(promptLabSurface);
  });

  it("切换 Plugin 实例时应保留已有 WebContentsView，不销毁重建", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    mountedRoots.push({ root, container });

    await act(async () => {
      root.render(
        <WorkspacePluginSurface
          activeContainerId={promptLabSurface.containerId}
          surfaces={[surface, promptLabSurface]}
        />,
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(embeddedBrowserMocks.mountEmbeddedBrowserView).toHaveBeenCalledTimes(
      2,
    );
    embeddedBrowserMocks.mountEmbeddedBrowserView.mockClear();
    embeddedBrowserMocks.destroyEmbeddedBrowserView.mockClear();

    await act(async () => {
      root.render(
        <WorkspacePluginSurface
          activeContainerId={surface.containerId}
          surfaces={[surface, promptLabSurface]}
        />,
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(
      embeddedBrowserMocks.mountEmbeddedBrowserView,
    ).not.toHaveBeenCalled();
    expect(
      embeddedBrowserMocks.destroyEmbeddedBrowserView,
    ).not.toHaveBeenCalled();
    expect(
      embeddedBrowserMocks.setEmbeddedBrowserViewBounds,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        viewId: "plugin-surface-plugin-shell-prompt-lab-app",
        visible: false,
      }),
    );
    expect(
      container.querySelectorAll(
        '[data-testid="workspace-plugin-surface-frame"]',
      ),
    ).toHaveLength(2);
  });
});
