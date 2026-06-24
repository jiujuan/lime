import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RightSurfaceHost } from "./RightSurfaceHost";
import type { RightSurfaceDefinition } from "./rightSurfaceTypes";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => {
      const copy: Record<string, string> = {
        "agentChat.rightSurface.tabs.appSurface": "Agent App",
        "agentChat.rightSurface.tabs.browser": "浏览器",
        "agentChat.rightSurface.tabs.productProfile": "产物 Profile",
        "agentChat.rightSurface.tabs.files": "文件",
        "agentChat.rightSurface.tabs.shell": "Shell",
      };
      return copy[key] ?? options?.defaultValue ?? key;
    },
  }),
}));

const mountedRoots: Array<{ root: Root; container: HTMLDivElement }> = [];

const definitions: RightSurfaceDefinition[] = [
  {
    kind: "appSurface",
    render: () => <div data-testid="agent-app-pane">Agent App</div>,
  },
  {
    kind: "productProfile",
    render: () => <div data-testid="product-profile-pane">产物详情</div>,
  },
  {
    kind: "files",
    render: () => <div data-testid="files-pane">文件预览</div>,
  },
  {
    kind: "shell",
    render: () => <div data-testid="shell-pane">Shell</div>,
  },
  {
    kind: "browser",
    label: "Example Domain",
    render: () => <div data-testid="browser-pane">Browser</div>,
  },
];

beforeEach(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
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
  vi.clearAllMocks();
});

function renderHost(
  props?: Partial<React.ComponentProps<typeof RightSurfaceHost>>,
) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <RightSurfaceHost
        activeSurface="productProfile"
        definitions={definitions}
        openSurfaces={["productProfile", "files", "shell"]}
        {...props}
      />,
    );
  });

  mountedRoots.push({ root, container });
  return container;
}

describe("RightSurfaceHost", () => {
  it("应在同一右侧 Dock 内渲染多个 surface tab，并只显示 active pane", () => {
    const container = renderHost();

    expect(
      container.querySelector('[data-testid="workspace-right-surface-host"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="workspace-right-surface-tabs"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="workspace-right-surface-tab-productProfile"]')
        ?.getAttribute("aria-selected"),
    ).toBe("true");
    expect(container.textContent).toContain("产物 Profile");
    expect(container.textContent).toContain("文件");
    expect(container.textContent).toContain("Shell");
    expect(
      container.querySelector('[data-testid="product-profile-pane"]'),
    ).not.toBeNull();
    expect(container.querySelector('[data-testid="files-pane"]')).toBeNull();
  });

  it("点击非 active tab 时应请求切换 surface", () => {
    const onSelectSurface = vi.fn();
    const container = renderHost({ onSelectSurface });

    act(() => {
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="workspace-right-surface-tab-files"]',
        )
        ?.click();
    });

    expect(onSelectSurface).toHaveBeenCalledWith("files");
  });

  it("browser tab 应优先显示页面标题", () => {
    const container = renderHost({
      activeSurface: "files",
      openSurfaces: ["files", "browser"],
    });

    expect(container.textContent).toContain("Example Domain");
    expect(
      container
        .querySelector('[data-testid="workspace-right-surface-tab-browser"]')
        ?.getAttribute("aria-label"),
    ).toBe("Example Domain");
  });

  it("只有一个 open surface 时不渲染 tab strip", () => {
    const container = renderHost({ openSurfaces: ["productProfile"] });

    expect(
      container.querySelector('[data-testid="workspace-right-surface-tabs"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="product-profile-pane"]'),
    ).not.toBeNull();
  });
});
