import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { changeLimeLocale } from "@/i18n/createI18n";
import { ChromeRelaySettings } from ".";

const {
  mockCloseBrowserSession,
  mockListBrowserSessionTargets,
  mockOpenBrowserSession,
  mockReadBrowserSession,
} = vi.hoisted(() => ({
  mockCloseBrowserSession: vi.fn(),
  mockListBrowserSessionTargets: vi.fn(),
  mockOpenBrowserSession: vi.fn(),
  mockReadBrowserSession: vi.fn(),
}));

vi.mock("@/lib/api/browserRuntime", () => ({
  closeBrowserSession: mockCloseBrowserSession,
  listBrowserSessionTargets: mockListBrowserSessionTargets,
  openBrowserSession: mockOpenBrowserSession,
  readBrowserSession: mockReadBrowserSession,
}));

interface MountedComponent {
  container: HTMLDivElement;
  root: Root;
}

const mounted: MountedComponent[] = [];
const target = {
  id: "target-1",
  title: "Fixture page",
  url: "http://127.0.0.1/fixture",
  targetType: "page",
  webSocketDebuggerUrl: "ws://127.0.0.1/devtools/page/target-1",
};
const session = {
  sessionId: "session-1",
  profileKey: "manual-cdp-9222-target-1",
  targetId: target.id,
  targetTitle: target.title,
  targetUrl: target.url,
  remoteDebuggingPort: 9222,
  wsDebuggerUrl: target.webSocketDebuggerUrl,
  transportKind: "cdp_direct",
  createdAt: "2026-07-17T00:00:00Z",
  connected: true,
  lifecycleState: "live",
  controlMode: "agent",
};

function renderComponent() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(<ChromeRelaySettings />));
  mounted.push({ container, root });
  return container;
}

async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  });
}

function click(container: HTMLElement, testId: string) {
  const button = container.querySelector<HTMLButtonElement>(
    `[data-testid="${testId}"]`,
  );
  if (!button) throw new Error(`missing button: ${testId}`);
  act(() => button.click());
}

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  await changeLimeLocale("zh-CN");
  mockListBrowserSessionTargets.mockResolvedValue({ targets: [target] });
  mockOpenBrowserSession.mockResolvedValue({ session });
  mockReadBrowserSession.mockResolvedValue({ session });
  mockCloseBrowserSession.mockResolvedValue({
    sessionId: session.sessionId,
    status: "closed",
  });
});

afterEach(async () => {
  for (const item of mounted.splice(0)) {
    act(() => item.root.unmount());
    item.container.remove();
  }
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  await changeLimeLocale("zh-CN");
});

describe("ChromeRelaySettings", () => {
  it("初始页只展示真实连接入口，不会自动调用或展示旧连接器能力", () => {
    const container = renderComponent();

    expect(container.textContent).toContain("浏览器连接");
    expect(container.textContent).toContain("检测页面");
    expect(container.textContent).not.toContain("扩展安装");
    expect(container.textContent).not.toContain("后端策略");
    expect(container.textContent).not.toContain("系统连接器");
    expect(mockListBrowserSessionTargets).not.toHaveBeenCalled();
  });

  it("通过 current App Server browserSession 方法完成检测、连接、读回和断开", async () => {
    mockListBrowserSessionTargets.mockResolvedValueOnce({
      targets: [
        target,
        {
          ...target,
          id: "service-worker-1",
          title: "Internal worker",
          targetType: "service_worker",
        },
      ],
    });
    const container = renderComponent();

    click(container, "browser-connection-check");
    await flushEffects();

    expect(mockListBrowserSessionTargets).toHaveBeenCalledWith({
      remoteDebuggingPort: 9222,
    });
    expect(
      container.querySelectorAll('[data-testid="browser-connection-target"]'),
    ).toHaveLength(1);
    expect(container.textContent).not.toContain("Internal worker");
    expect(
      container
        .querySelector('[data-testid="browser-connection-settings"]')
        ?.getAttribute("data-connection-state"),
    ).toBe("available");

    click(container, "browser-connection-connect");
    await flushEffects();

    expect(mockOpenBrowserSession).toHaveBeenCalledWith({
      profileKey: "manual-cdp-9222-target-1",
      remoteDebuggingPort: 9222,
      targetId: "target-1",
    });
    expect(mockReadBrowserSession).toHaveBeenCalledWith({
      sessionId: "session-1",
    });
    expect(
      container
        .querySelector('[data-testid="browser-connection-session"]')
        ?.getAttribute("data-session-connected"),
    ).toBe("true");

    click(container, "browser-connection-disconnect");
    await flushEffects();

    expect(mockCloseBrowserSession).toHaveBeenCalledWith({
      sessionId: "session-1",
    });
    expect(
      container
        .querySelector('[data-testid="browser-connection-settings"]')
        ?.getAttribute("data-connection-state"),
    ).toBe("closed");
    expect(
      container.querySelector('[data-testid="browser-connection-session"]'),
    ).toBeNull();
  });

  it("检测失败只展示可恢复的产品文案，不暴露协议或命令名", async () => {
    mockListBrowserSessionTargets.mockRejectedValueOnce(
      new Error("App Server browserSession/target/list runtime failure"),
    );
    const container = renderComponent();

    click(container, "browser-connection-check");
    await flushEffects();

    const alert = container.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain("请确认 Chrome 已开启远程调试后重试");
    expect(alert?.textContent).not.toContain("browserSession");
    expect(alert?.textContent).not.toContain("App Server");
  });

  it.each([
    ["zh-CN", "浏览器连接", "检测页面"],
    ["zh-TW", "瀏覽器連線", "偵測頁面"],
    ["en-US", "Browser connection", "Find pages"],
    ["ja-JP", "ブラウザー接続", "ページを検出"],
    ["ko-KR", "브라우저 연결", "페이지 찾기"],
  ])("%s 应渲染稳定本地化文案", async (locale, title, action) => {
    await changeLimeLocale(locale);
    const container = renderComponent();

    expect(container.textContent).toContain(title);
    expect(container.textContent).toContain(action);
    expect(container.textContent).not.toContain("settings.browserConnection");
  });
});
