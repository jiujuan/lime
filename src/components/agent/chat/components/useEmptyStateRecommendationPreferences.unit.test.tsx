import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useEmptyStateRecommendationPreferences } from "./useEmptyStateRecommendationPreferences";

const { mockGetConfig } = vi.hoisted(() => ({
  mockGetConfig: vi.fn(),
}));

vi.mock("@/lib/api/appConfig", () => ({
  getConfig: mockGetConfig,
}));

type HookValue = ReturnType<typeof useEmptyStateRecommendationPreferences>;

const mountedRoots: Array<{ root: Root; container: HTMLDivElement }> = [];

function renderHook() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  let latestValue: HookValue | null = null;

  function Probe() {
    latestValue = useEmptyStateRecommendationPreferences();
    return null;
  }

  act(() => {
    root.render(<Probe />);
  });

  mountedRoots.push({ root, container });

  return {
    getValue: () => {
      if (!latestValue) {
        throw new Error("hook 尚未初始化");
      }
      return latestValue;
    },
  };
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  mockGetConfig.mockResolvedValue({
    chat_appearance: {
      append_selected_text_to_recommendation: false,
    },
  });
});

afterEach(() => {
  while (mountedRoots.length > 0) {
    const mounted = mountedRoots.pop();
    if (!mounted) {
      continue;
    }
    act(() => {
      mounted.root.unmount();
    });
    mounted.container.remove();
  }
  vi.clearAllMocks();
});

describe("useEmptyStateRecommendationPreferences", () => {
  it("应读取是否把选中文本追加到推荐 prompt 的配置", async () => {
    const harness = renderHook();

    expect(harness.getValue().appendSelectedTextToRecommendation).toBe(true);

    await act(async () => {
      await Promise.resolve();
    });

    expect(harness.getValue().appendSelectedTextToRecommendation).toBe(false);
  });

  it("收到外观配置变更事件后应重新读取配置", async () => {
    mockGetConfig
      .mockResolvedValueOnce({
        chat_appearance: {
          append_selected_text_to_recommendation: false,
        },
      })
      .mockResolvedValueOnce({
        chat_appearance: {
          append_selected_text_to_recommendation: true,
        },
      });
    const harness = renderHook();

    await act(async () => {
      await Promise.resolve();
    });
    expect(harness.getValue().appendSelectedTextToRecommendation).toBe(false);

    await act(async () => {
      window.dispatchEvent(
        new CustomEvent("chat-appearance-config-changed"),
      );
      await Promise.resolve();
    });

    expect(harness.getValue().appendSelectedTextToRecommendation).toBe(true);
  });
});
