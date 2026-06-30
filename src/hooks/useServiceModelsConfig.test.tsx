import { useEffect } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useServiceModelsConfig } from "./useServiceModelsConfig";

const { mockGetConfig, mockSubscribeAppConfigChanged, configListeners } =
  vi.hoisted(() => {
    const listeners: Array<() => void> = [];
    const subscribe = vi.fn((listener: () => void) => {
      listeners.push(listener);
      return () => {
        const index = listeners.indexOf(listener);
        if (index >= 0) {
          listeners.splice(index, 1);
        }
      };
    });

    return {
      mockGetConfig: vi.fn(),
      mockSubscribeAppConfigChanged: subscribe,
      configListeners: listeners,
    };
  });

vi.mock("@/lib/api/appConfig", () => ({
  getConfig: mockGetConfig,
  subscribeAppConfigChanged: mockSubscribeAppConfigChanged,
}));

type HookValue = ReturnType<typeof useServiceModelsConfig>;

interface Mounted {
  container: HTMLDivElement;
  root: Root;
}

const mounted: Mounted[] = [];

function renderHookProbe(
  onValue: (value: HookValue) => void,
  options?: Parameters<typeof useServiceModelsConfig>[0],
) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  function Probe() {
    const value = useServiceModelsConfig(options);
    useEffect(() => {
      onValue(value);
    }, [value]);
    return null;
  }

  mounted.push({ container, root });
  act(() => {
    root.render(<Probe />);
  });
}

async function flushEffects(times = 4) {
  for (let index = 0; index < times; index += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

describe("useServiceModelsConfig", () => {
  beforeEach(() => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT?: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    vi.clearAllMocks();
    configListeners.splice(0, configListeners.length);
  });

  afterEach(() => {
    while (mounted.length > 0) {
      const target = mounted.pop();
      if (!target) {
        break;
      }
      act(() => {
        target.root.unmount();
      });
      target.container.remove();
    }
    configListeners.splice(0, configListeners.length);
  });

  it("禁用时不应首帧读取配置或订阅变更", async () => {
    let latest: HookValue | null = null;

    renderHookProbe(
      (value) => {
        latest = value;
      },
      { enabled: false },
    );
    await flushEffects();

    expect(mockGetConfig).not.toHaveBeenCalled();
    expect(mockSubscribeAppConfigChanged).not.toHaveBeenCalled();
    expect(latest).toMatchObject({
      loading: false,
      serviceModels: {},
      agentResponseLanguage: undefined,
    });
  });

  it("禁用时仍允许发送前显式 refresh 配置", async () => {
    let latest: HookValue | null = null;
    mockGetConfig.mockResolvedValue({
      workspace_preferences: {
        agent_response_language: "en-US",
        service_models: {
          responsive_chat: {
            preferredProviderId: "provider-1",
            preferredModelId: "model-1",
          },
        },
      },
    });

    renderHookProbe(
      (value) => {
        latest = value;
      },
      { enabled: false },
    );
    await flushEffects();

    await act(async () => {
      if (!latest) {
        throw new Error("hook value 尚未初始化");
      }
      const refreshed = await latest.refresh();
      expect(mockGetConfig).toHaveBeenCalledWith(undefined);
      expect(refreshed).toEqual({
        agentResponseLanguage: "en-US",
        serviceModels: {
          responsive_chat: {
            preferredProviderId: "provider-1",
            preferredModelId: "model-1",
          },
        },
      });
      expect(latest).toMatchObject(refreshed);
    });
    await flushEffects();
  });

  it("启用时配置变更应强制刷新", async () => {
    let latest: HookValue | null = null;
    mockGetConfig
      .mockResolvedValueOnce({
        workspace_preferences: {
          agent_response_language: "zh-CN",
        },
      })
      .mockResolvedValueOnce({
        workspace_preferences: {
          agent_response_language: "ja-JP",
        },
      });

    renderHookProbe((value) => {
      latest = value;
    });
    await flushEffects();

    expect(latest).toMatchObject({
      agentResponseLanguage: "zh-CN",
    });

    await act(async () => {
      configListeners[0]?.();
      await Promise.resolve();
    });
    await flushEffects();

    expect(mockGetConfig).toHaveBeenLastCalledWith({ forceRefresh: true });
    expect(latest).toMatchObject({
      agentResponseLanguage: "ja-JP",
    });
  });
});
