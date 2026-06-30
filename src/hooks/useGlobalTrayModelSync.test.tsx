import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useGlobalTrayModelSync } from "./useGlobalTrayModelSync";
import type { Page, PageParams } from "@/types/page";

const {
  hasDesktopHostInvokeCapability,
  invalidateTrayPayloadCache,
  safeListen,
  subscribeProviderDataChanged,
  syncTrayModelShortcutsState,
} = vi.hoisted(() => ({
  hasDesktopHostInvokeCapability: vi.fn(),
  invalidateTrayPayloadCache: vi.fn(),
  safeListen: vi.fn(),
  subscribeProviderDataChanged: vi.fn(),
  syncTrayModelShortcutsState: vi.fn(),
}));

vi.mock("@/lib/desktop-runtime", () => ({
  hasDesktopHostInvokeCapability,
}));

vi.mock("@/lib/api/bridgeEvents", () => ({
  safeListen,
}));

vi.mock("@/lib/providerDataEvents", () => ({
  subscribeProviderDataChanged,
}));

vi.mock("@/components/agent/chat/hooks/useTrayModelShortcuts", () => ({
  invalidateTrayPayloadCache,
  syncTrayModelShortcutsState,
}));

function seedGlobalModelPreference() {
  window.localStorage.setItem(
    "agent_pref_provider_global",
    JSON.stringify("deepseek"),
  );
  window.localStorage.setItem(
    "agent_pref_model_global",
    JSON.stringify("deepseek-chat"),
  );
}

interface MountedHook {
  container: HTMLDivElement;
  root: Root;
}

interface ProbeProps {
  currentPage: Page;
  pageParams?: PageParams;
}

const mountedHooks: MountedHook[] = [];

async function flushEffects(rounds = 6) {
  for (let index = 0; index < rounds; index += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

async function flushAsyncWork(rounds = 8) {
  for (let index = 0; index < rounds; index += 1) {
    await Promise.resolve();
  }
}

async function renderGlobalTrayModelSyncHook(props: ProbeProps) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  function Probe(value: ProbeProps) {
    useGlobalTrayModelSync(value);
    return null;
  }

  await act(async () => {
    root.render(createElement(Probe, props));
    await Promise.resolve();
  });
  await flushEffects();

  mountedHooks.push({ container, root });
}

function getProviderDataChangedHandler() {
  const handler = subscribeProviderDataChanged.mock.calls[0]?.[0] as
    | (() => void)
    | undefined;
  if (!handler) {
    throw new Error("provider data changed 监听未注册");
  }
  return handler;
}

function getTrayModelSelectedHandler() {
  const handler = safeListen.mock.calls[0]?.[1] as
    | ((event: {
        payload?: {
          providerType?: string;
          model?: string;
        };
      }) => void)
    | undefined;
  if (!handler) {
    throw new Error("托盘模型选择监听未注册");
  }
  return handler;
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  vi.clearAllMocks();
  window.localStorage.clear();
  hasDesktopHostInvokeCapability.mockReturnValue(true);
  safeListen.mockResolvedValue(vi.fn());
  subscribeProviderDataChanged.mockReturnValue(vi.fn());
  syncTrayModelShortcutsState.mockResolvedValue(undefined);
});

afterEach(() => {
  while (mountedHooks.length > 0) {
    const mounted = mountedHooks.pop();
    if (!mounted) {
      continue;
    }

    act(() => {
      mounted.root.unmount();
    });
    mounted.container.remove();
  }
  vi.useRealTimers();
});

describe("useGlobalTrayModelSync", () => {
  it("Agent 页面不应首帧或 focus 自动同步托盘模型候选", async () => {
    await renderGlobalTrayModelSyncHook({
      currentPage: "agent",
      pageParams: {
        projectId: "project-1",
        theme: "general",
      },
    });

    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });
    window.dispatchEvent(new FocusEvent("focus"));
    await flushEffects();

    expect(syncTrayModelShortcutsState).not.toHaveBeenCalled();
    expect(invalidateTrayPayloadCache).not.toHaveBeenCalled();
    expect(subscribeProviderDataChanged).toHaveBeenCalledTimes(1);
    expect(safeListen).toHaveBeenCalledWith(
      "tray-model-selected",
      expect.any(Function),
    );
  });

  it("Agent 页面 provider 数据变化时仍应强制刷新托盘候选", async () => {
    seedGlobalModelPreference();
    await renderGlobalTrayModelSyncHook({
      currentPage: "agent",
      pageParams: {
        projectId: "project-1",
        theme: "general",
      },
    });

    act(() => {
      getProviderDataChangedHandler()();
    });
    await flushEffects();
    await flushAsyncWork();

    expect(invalidateTrayPayloadCache).toHaveBeenCalledTimes(1);
    expect(syncTrayModelShortcutsState).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      "general",
      { forceRefresh: true },
    );
  });

  it("Agent 页面托盘模型选择仍应保存偏好并同步当前选择", async () => {
    await renderGlobalTrayModelSyncHook({
      currentPage: "agent",
      pageParams: {
        projectId: "project-1",
        theme: "general",
      },
    });

    act(() => {
      getTrayModelSelectedHandler()({
        payload: {
          providerType: "openai",
          model: "gpt-4.1",
        },
      });
    });
    await flushEffects();

    expect(syncTrayModelShortcutsState).toHaveBeenCalledWith(
      "openai",
      "gpt-4.1",
      "general",
      undefined,
    );
  });

  it("非 Agent 页面仍会自动同步托盘模型候选", async () => {
    seedGlobalModelPreference();
    await renderGlobalTrayModelSyncHook({
      currentPage: "settings",
    });

    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });
    await flushAsyncWork();

    expect(syncTrayModelShortcutsState).toHaveBeenCalled();
  });
});
