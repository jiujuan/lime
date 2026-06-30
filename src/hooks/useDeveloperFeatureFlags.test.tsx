import { useEffect } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CLAW_TRACE_DEBUG_OVERRIDE_KEY,
  WORKSPACE_HARNESS_DEBUG_OVERRIDE_KEY,
} from "@/lib/developerFeatures";
import { useDeveloperFeatureFlags } from "./useDeveloperFeatureFlags";

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

type HookValue = ReturnType<typeof useDeveloperFeatureFlags>;

interface Mounted {
  container: HTMLDivElement;
  root: Root;
}

const mounted: Mounted[] = [];

function renderHookProbe(
  onValue: (value: HookValue) => void,
  options?: Parameters<typeof useDeveloperFeatureFlags>[0],
) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  function Probe() {
    const value = useDeveloperFeatureFlags(options);
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

describe("useDeveloperFeatureFlags", () => {
  beforeEach(() => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT?: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    vi.clearAllMocks();
    configListeners.splice(0, configListeners.length);
    window.localStorage.clear();
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
    window.localStorage.clear();
  });

  it("禁用时不应读取配置或订阅变更，但仍保留 debug override", async () => {
    let latest: HookValue = {
      clawTraceEnabled: false,
      workspaceHarnessEnabled: false,
    };
    window.localStorage.setItem(CLAW_TRACE_DEBUG_OVERRIDE_KEY, "true");
    window.localStorage.setItem(WORKSPACE_HARNESS_DEBUG_OVERRIDE_KEY, "true");

    renderHookProbe(
      (value) => {
        latest = value;
      },
      { enabled: false },
    );
    await flushEffects();

    expect(mockGetConfig).not.toHaveBeenCalled();
    expect(mockSubscribeAppConfigChanged).not.toHaveBeenCalled();
    expect(latest).toEqual({
      clawTraceEnabled: true,
      workspaceHarnessEnabled: true,
    });
  });

  it("启用时应从配置读取 trace 与 harness 开关", async () => {
    let latest: HookValue = {
      clawTraceEnabled: false,
      workspaceHarnessEnabled: false,
    };
    mockGetConfig.mockResolvedValue({
      developer: {
        workspace_harness_enabled: true,
        claw_trace: {
          enabled: true,
          sample_rate: 1,
        },
      },
    });

    renderHookProbe((value) => {
      latest = value;
    });
    await flushEffects();

    expect(mockGetConfig).toHaveBeenCalledWith(undefined);
    expect(mockSubscribeAppConfigChanged).toHaveBeenCalledTimes(1);
    expect(latest).toEqual({
      clawTraceEnabled: true,
      workspaceHarnessEnabled: true,
    });
  });

  it("配置变更后应强制刷新开发者开关", async () => {
    let latest: HookValue = {
      clawTraceEnabled: false,
      workspaceHarnessEnabled: false,
    };
    mockGetConfig
      .mockResolvedValueOnce({
        developer: {
          workspace_harness_enabled: false,
          claw_trace: {
            enabled: false,
            sample_rate: 1,
          },
        },
      })
      .mockResolvedValueOnce({
        developer: {
          workspace_harness_enabled: true,
          claw_trace: {
            enabled: true,
            sample_rate: 1,
          },
        },
      });

    renderHookProbe((value) => {
      latest = value;
    });
    await flushEffects();

    expect(latest).toEqual({
      clawTraceEnabled: false,
      workspaceHarnessEnabled: false,
    });

    await act(async () => {
      configListeners[0]?.();
      await Promise.resolve();
    });
    await flushEffects();

    expect(mockGetConfig).toHaveBeenLastCalledWith({ forceRefresh: true });
    expect(latest).toEqual({
      clawTraceEnabled: true,
      workspaceHarnessEnabled: true,
    });
  });
});
