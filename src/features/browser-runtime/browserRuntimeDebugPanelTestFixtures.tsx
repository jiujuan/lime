import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { vi } from "vitest";
import { BrowserRuntimeDebugPanel } from "./BrowserRuntimeDebugPanel";

interface MountedPanel {
  root: Root;
  container: HTMLDivElement;
}

const mountedPanels: MountedPanel[] = [];

export function createDefaultRuntimeState(overrides: Record<string, unknown> = {}) {
  return {
    selectedSession: null,
    selectedProfileKey: "general_browser_assist",
    setSelectedProfileKey: vi.fn(),
    selectedTargetId: "",
    setSelectedTargetId: vi.fn(),
    targets: [],
    sessionState: null,
    latestFrame: null,
    latestFrameMetadata: null,
    consoleEvents: [],
    networkEvents: [],
    loadingTargets: false,
    openingSession: false,
    streaming: false,
    refreshingState: false,
    controlBusy: false,
    selectedProfileTransportKind: "managed_cdp",
    runtimeConnectionError: null,
    lifecycleState: null,
    isHumanControlling: false,
    isWaitingForHuman: false,
    isAgentResuming: false,
    isExistingSessionProfile: false,
    canDirectControl: false,
    refreshTargets: vi.fn(async () => undefined),
    openSession: vi.fn(async () => undefined),
    startStream: vi.fn(async () => undefined),
    stopStream: vi.fn(async () => undefined),
    closeSession: vi.fn(async () => undefined),
    refreshSessionState: vi.fn(async () => undefined),
    takeOverSession: vi.fn(async () => undefined),
    releaseSession: vi.fn(async () => undefined),
    resumeSession: vi.fn(async () => undefined),
    clickAt: vi.fn(async () => undefined),
    scrollPage: vi.fn(async () => undefined),
    typeIntoFocusedElement: vi.fn(async () => undefined),
    ...overrides,
  };
}

export function createChromeBridgeStatus(overrides: Record<string, unknown> = {}) {
  return {
    observer_count: 0,
    control_count: 0,
    pending_command_count: 0,
    observers: [],
    controls: [],
    pending_commands: [],
    ...overrides,
  };
}

export function createAttachedBrowserProfile(
  overrides: Record<string, unknown> = {},
) {
  return {
    id: "profile-attach",
    profile_key: "weibo_attach",
    name: "微博附着",
    description: "复用当前 Chrome",
    site_scope: "weibo.com",
    launch_url: "https://weibo.com/home",
    transport_kind: "existing_session",
    profile_dir: "",
    managed_profile_dir: null,
    created_at: "2026-03-15T00:00:00Z",
    updated_at: "2026-03-15T00:00:00Z",
    last_used_at: null,
    archived_at: null,
    ...overrides,
  };
}

export function createChromeObserver(overrides: Record<string, unknown> = {}) {
  return {
    client_id: "observer-1",
    profile_key: "weibo_attach",
    connected_at: "2026-03-15T00:00:00Z",
    user_agent: "Chrome",
    last_heartbeat_at: "2026-03-15T00:00:08Z",
    last_page_info: {
      title: "微博首页",
      url: "https://weibo.com/home",
      markdown: "# 微博首页",
      updated_at: "2026-03-15T00:00:08Z",
    },
    ...overrides,
  };
}

export function createAttachedChromeBridgeStatus(
  overrides: Record<string, unknown> = {},
) {
  return createChromeBridgeStatus({
    observer_count: 1,
    observers: [createChromeObserver()],
    ...overrides,
  });
}

export function createSiteAdapter() {
  return {
    name: "github/search",
    domain: "github.com",
    description: "按关键词采集 GitHub 仓库搜索结果。",
    read_only: true,
    capabilities: ["search", "repository"],
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string" },
        limit: { type: "integer" },
      },
      required: ["query"],
    },
    example_args: {
      query: "model context protocol",
      limit: 5,
    },
    example: 'github/search {"query":"model context protocol","limit":5}',
    auth_hint: "若需要完整结果，请先在浏览器中登录 GitHub。",
  };
}

export function createSiteAdapterRecommendation() {
  return {
    adapter: {
      ...createSiteAdapter(),
      capabilities: ["search", "repository", "research"],
    },
    reason:
      "已检测到资料 general_browser_assist 当前停留在 github.com，可直接复用已连接的浏览器上下文。",
    profile_key: "general_browser_assist",
    target_id: "mock-target-1",
    entry_url:
      "https://github.com/search?q=model%20context%20protocol&type=repositories",
    score: 100,
  };
}

export function createSiteAdapterRunResult() {
  return {
    ok: true,
    adapter: "github/search",
    domain: "github.com",
    profile_key: "general_browser_assist",
    session_id: "mock-cdp-session",
    target_id: "mock-target-1",
    entry_url:
      "https://github.com/search?q=model%20context%20protocol&type=repositories",
    source_url:
      "https://github.com/search?q=model%20context%20protocol&type=repositories",
    data: {
      items: [{ title: "mock repo", url: "https://github.com/mock/repo" }],
    },
  };
}

export async function renderPanel(props?: {
  initialProfileKey?: string;
  initialSessionId?: string;
  onMessage?: (message: { type: string; text: string }) => void;
}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mountedPanels.push({ root, container });
  await act(async () => {
    root.render(
      <BrowserRuntimeDebugPanel
        sessions={[]}
        initialProfileKey={props?.initialProfileKey ?? "general_browser_assist"}
        initialSessionId={props?.initialSessionId ?? "browser-session-1"}
        onMessage={props?.onMessage}
      />,
    );
  });
  await flushMicrotasks();
  return container;
}

export function cleanupMountedBrowserRuntimeDebugPanels() {
  while (mountedPanels.length > 0) {
    const mounted = mountedPanels.pop();
    if (!mounted) {
      break;
    }
    act(() => {
      mounted.root.unmount();
    });
    mounted.container.remove();
  }
}

export async function flushPanelEffects(times = 4) {
  for (let i = 0; i < times; i += 1) {
    await flushMicrotasks();
    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, 0);
    });
  }
}

export async function clickButtonByText(container: HTMLElement, text: string) {
  const button = Array.from(container.querySelectorAll("button")).find((item) =>
    item.textContent?.includes(text),
  );
  if (!button) {
    throw new Error(`未找到按钮: ${text}`);
  }
  await act(async () => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();
  });
}

export function createDeferredPromise<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

async function flushMicrotasks() {
  await act(async () => {
    await Promise.resolve();
  });
}
