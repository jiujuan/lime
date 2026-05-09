import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProviderWithKeysDisplay } from "@/lib/api/apiKeyProvider";

const { mockSafeInvoke } = vi.hoisted(() => ({
  mockSafeInvoke: vi.fn(),
}));

vi.mock("@/lib/dev-bridge", () => ({
  safeInvoke: mockSafeInvoke,
}));

import { invalidateApiKeyProviderCache } from "@/lib/api/apiKeyProvider";
import { ApiKeyProviderSection } from "./ApiKeyProviderSection";

const mountedRoots: Array<{ root: Root; container: HTMLDivElement }> = [];

function createProvider(
  overrides: Partial<ProviderWithKeysDisplay>,
): ProviderWithKeysDisplay {
  return {
    id: "openai",
    name: "OpenAI",
    type: "openai",
    api_host: "https://api.openai.com",
    is_system: true,
    group: "mainstream",
    enabled: true,
    sort_order: 1,
    api_key_count: 0,
    custom_models: [],
    prompt_cache_mode: null,
    created_at: "2026-03-15T00:00:00.000Z",
    updated_at: "2026-03-15T00:00:00.000Z",
    api_keys: [],
    ...overrides,
  };
}

async function flushEffects(times = 6) {
  await act(async () => {
    for (let index = 0; index < times; index += 1) {
      await Promise.resolve();
    }
  });
}

function renderSection() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <ApiKeyProviderSection exposeOemLoginPrompt onOemLogin={vi.fn()} />,
    );
  });

  mountedRoots.push({ root, container });
  return container;
}

describe("ApiKeyProviderSection OEM 登录提示", () => {
  beforeEach(() => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT?: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    vi.clearAllMocks();
    invalidateApiKeyProviderCache();

    const providers: ProviderWithKeysDisplay[] = [
      createProvider({
        id: "lime-hub",
        name: "Lime Hub",
        api_host: "https://hub.lime.test",
        group: "cloud",
        sort_order: 0,
      }),
      createProvider({
        id: "openai",
        name: "OpenAI",
        sort_order: 1,
      }),
    ];

    mockSafeInvoke.mockImplementation(
      async (command: string, payload?: Record<string, unknown>) => {
        switch (command) {
          case "get_api_key_providers":
            return providers;
          case "get_provider_ui_state":
            return payload?.key === "selected_provider" ? "openai" : null;
          case "set_provider_ui_state":
            return undefined;
          default:
            throw new Error(`未处理的 safeInvoke 命令：${command}`);
        }
      },
    );
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
    invalidateApiKeyProviderCache();
    vi.clearAllMocks();
  });

  it("未登录 Lime Hub 可被选中为登录提示，不应被本地 Provider 重定向抢回", async () => {
    const container = renderSection();
    await flushEffects();

    expect(
      container.querySelector('[data-testid="provider-login-required"]'),
    ).not.toBeNull();
    expect(container.textContent ?? "").toContain("登录后会自动同步 Lime Hub");

    const persistedSelections = mockSafeInvoke.mock.calls
      .filter(([command]) => command === "set_provider_ui_state")
      .map(([, payload]) => (payload as { value?: string } | undefined)?.value);

    expect(persistedSelections).toContain("lime-hub");
    expect(persistedSelections).not.toContain("openai");
  });
});
