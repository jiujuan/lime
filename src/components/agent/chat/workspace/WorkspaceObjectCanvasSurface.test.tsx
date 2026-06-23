import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceObjectCanvasSurface } from "./WorkspaceObjectCanvasSurface";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const copy: Record<string, string> = {
        "workspace.browserAssistRenderer.titleFallback": "浏览器协助",
        "workspace.browserAssistRenderer.objectCanvas.candidate": "候选",
        "workspace.browserAssistRenderer.objectCanvas.url": "URL",
        "workspace.browserAssistRenderer.objectCanvas.session": "会话",
        "workspace.browserAssistRenderer.objectCanvas.profile": "Profile",
        "workspace.browserAssistRenderer.objectCanvas.target": "Target",
        "workspace.browserAssistRenderer.objectCanvas.transport": "传输",
        "workspace.browserAssistRenderer.objectCanvas.control": "控制",
        "workspace.browserAssistRenderer.objectCanvas.status": "状态",
        "workspace.browserAssistRenderer.objectCanvas.kind.browserSession":
          "浏览器会话",
        "workspace.browserAssistRenderer.objectCanvas.stage.connecting":
          "连接中",
        "workspace.browserAssistRenderer.objectCanvas.stage.ready": "可接管",
        "workspace.browserAssistRenderer.objectCanvas.stage.pending": "待处理",
        "workspace.browserAssistRenderer.objectCanvas.stage.failed":
          "连接失败",
        "workspace.browserAssistRenderer.objectCanvas.summary.connecting.title":
          "正在连接浏览器会话",
        "workspace.browserAssistRenderer.objectCanvas.summary.connecting.detail":
          "正在确认已附着的 Chrome / CDP 会话，连接完成后可进入浏览器工作台继续接管。",
        "workspace.browserAssistRenderer.objectCanvas.summary.ready.title":
          "浏览器对象已就绪",
        "workspace.browserAssistRenderer.objectCanvas.summary.ready.detail":
          "当前对象已经有可接管的会话信息，可打开浏览器工作台继续调试或操作。",
        "workspace.browserAssistRenderer.objectCanvas.summary.pending.title":
          "等待浏览器对象",
        "workspace.browserAssistRenderer.objectCanvas.summary.pending.detail":
          "已收到对象画布请求，仍在等待可用的会话、目标页或连接信息。",
        "workspace.browserAssistRenderer.objectCanvas.summary.failed.title":
          "浏览器对象不可用",
        "workspace.browserAssistRenderer.objectCanvas.summary.failed.detail":
          "当前对象的连接状态异常，请重新附着浏览器会话或从对话中重新发起浏览器协助。",
        "workspace.browserAssistRenderer.objectCanvas.openRuntime":
          "打开浏览器工作台",
      };
      return copy[key] ?? key;
    },
  }),
}));

const mountedRoots: Array<{ root: Root; container: HTMLDivElement }> = [];

beforeEach(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

function renderSurface(
  props?: Partial<React.ComponentProps<typeof WorkspaceObjectCanvasSurface>>,
) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <WorkspaceObjectCanvasSurface
        candidate={{
          candidateId: "browser-assist-candidate",
          title: "GitHub 搜索",
          url: "https://github.com/search?q=lime",
          sessionId: "browser-session-1",
          profileKey: "general-browser",
          targetId: "tab-1",
          lifecycleState: "running",
          controlMode: "agent",
          transportKind: "cdp_direct",
        }}
        onOpenBrowserRuntime={vi.fn()}
        {...props}
      />,
    );
  });

  mountedRoots.push({ root, container });
  return container;
}

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

describe("WorkspaceObjectCanvasSurface", () => {
  it("应展示 Browser Assist 候选的最小对象信息", () => {
    const container = renderSurface();

    expect(
      container.querySelector('[data-testid="workspace-object-canvas-surface"]'),
    ).not.toBeNull();
    expect(container.textContent).toContain("GitHub 搜索");
    expect(container.textContent).toContain("浏览器对象已就绪");
    expect(container.textContent).toContain("浏览器会话");
    expect(container.textContent).toContain("可接管");
    expect(container.textContent).toContain("状态");
    expect(container.textContent).toContain("running");
    expect(container.textContent).toContain("browser-assist-candidate");
    expect(container.textContent).toContain("https://github.com/search?q=lime");
    expect(container.textContent).toContain("browser-session-1");
    expect(container.textContent).toContain("general-browser");
    expect(container.textContent).toContain("tab-1");
    expect(container.textContent).toContain("cdp_direct");
    expect(container.textContent).toContain("agent");
    expect(
      container.querySelector('[data-testid="workspace-object-canvas-stage"]')
        ?.textContent,
    ).toBe("可接管");
  });

  it("launching 候选应展示连接中阶段", () => {
    const container = renderSurface({
      candidate: {
        candidateId: "launching-browser-assist",
        title: "准备接管浏览器",
        lifecycleState: "running",
        launching: true,
      },
      onOpenBrowserRuntime: undefined,
    });

    expect(container.textContent).toContain("准备接管浏览器");
    expect(container.textContent).toContain("正在连接浏览器会话");
    expect(container.textContent).toContain("连接中");
    expect(
      container.querySelector('[data-testid="workspace-object-canvas-stage"]')
        ?.textContent,
    ).toBe("连接中");
  });

  it("失败候选应展示连接失败阶段", () => {
    const container = renderSurface({
      candidate: {
        candidateId: "failed-browser-assist",
        title: "浏览器连接异常",
        lifecycleState: "disconnect_error",
      },
      onOpenBrowserRuntime: undefined,
    });

    expect(container.textContent).toContain("浏览器连接异常");
    expect(container.textContent).toContain("浏览器对象不可用");
    expect(container.textContent).toContain("连接失败");
    expect(container.textContent).toContain("disconnect_error");
    expect(
      container.querySelector('[data-testid="workspace-object-canvas-stage"]')
        ?.textContent,
    ).toBe("连接失败");
  });

  it("点击打开浏览器工作台按钮时应调用回调", () => {
    const onOpenBrowserRuntime = vi.fn();
    const container = renderSurface({ onOpenBrowserRuntime });

    act(() => {
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="workspace-object-canvas-open-runtime"]',
        )
        ?.click();
    });

    expect(onOpenBrowserRuntime).toHaveBeenCalledTimes(1);
  });

  it("没有浏览器工作台回调时不显示打开按钮", () => {
    const container = renderSurface({ onOpenBrowserRuntime: undefined });

    expect(
      container.querySelector(
        '[data-testid="workspace-object-canvas-open-runtime"]',
      ),
    ).toBeNull();
  });
});
