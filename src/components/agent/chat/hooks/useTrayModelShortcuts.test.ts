import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  hasDesktopHostInvokeCapability,
  loadConfiguredProviders,
  getModelRegistry,
  getAllAliasConfigs,
  syncTrayModelShortcuts,
  safeListen,
} = vi.hoisted(() => ({
  hasDesktopHostInvokeCapability: vi.fn(),
  loadConfiguredProviders: vi.fn(),
  getModelRegistry: vi.fn(),
  getAllAliasConfigs: vi.fn(),
  syncTrayModelShortcuts: vi.fn(),
  safeListen: vi.fn(),
}));

vi.mock("@/lib/desktop-runtime", () => ({
  hasDesktopHostInvokeCapability,
}));

vi.mock("@/lib/api/bridgeEvents", () => ({
  safeListen,
}));

vi.mock("@/hooks/useConfiguredProviders", () => ({
  loadConfiguredProviders,
  findConfiguredProviderBySelection: (
    providers: Array<{ key: string; providerId?: string }>,
    selection?: string | null,
  ) => {
    const normalizedSelection = (selection || "").trim().toLowerCase();
    const keyMatch =
      providers.find(
        (provider) => provider.key.trim().toLowerCase() === normalizedSelection,
      ) ?? null;
    const providerIdMatch =
      providers.find(
        (provider) =>
          (provider.providerId || "").trim().toLowerCase() ===
          normalizedSelection,
      ) ?? null;

    if (keyMatch && providerIdMatch && keyMatch !== providerIdMatch) {
      if (!keyMatch.providerId && providerIdMatch.providerId) {
        return providerIdMatch;
      }
    }

    return keyMatch ?? providerIdMatch ?? null;
  },
}));

vi.mock("@/lib/api/modelRegistry", () => ({
  modelRegistryApi: {
    getModelRegistry,
    getAllAliasConfigs,
  },
}));

vi.mock("@/lib/api/tray", () => ({
  TRAY_MODEL_SELECTED_EVENT: "tray-model-selected",
  trayApi: {
    syncTrayModelShortcuts,
  },
}));

vi.mock("@/lib/constants/providerMappings", () => ({
  getAliasConfigKey: (provider: string) => provider,
  getProviderLabel: (provider: string) => `label:${provider}`,
  getRegistryIdFromType: (provider: string) => provider,
  isAliasProvider: () => false,
}));

vi.mock("../utils/modelThemePolicy", () => ({
  filterModelsByTheme: (_theme: string | undefined, models: unknown[]) => ({
    models,
  }),
}));

vi.mock("../utils/providerModelCompatibility", () => ({
  getProviderModelCompatibilityIssue: () => null,
}));

import {
  buildTrayPayload,
  invalidateTrayPayloadCache,
  syncTrayModelShortcutsState,
  useTrayModelShortcuts,
} from "./useTrayModelShortcuts";

interface MountedHook {
  container: HTMLDivElement;
  root: Root;
}

const mountedHooks: MountedHook[] = [];

async function flushEffects(rounds = 8) {
  for (let index = 0; index < rounds; index += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

async function renderTrayModelShortcutsHook(
  options: Parameters<typeof useTrayModelShortcuts>[0],
) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  function Probe(props: Parameters<typeof useTrayModelShortcuts>[0]) {
    useTrayModelShortcuts(props);
    return null;
  }

  await act(async () => {
    root.render(createElement(Probe, options));
    await Promise.resolve();
  });
  await flushEffects();

  mountedHooks.push({ container, root });
}

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
});

describe("buildTrayPayload", () => {
  beforeEach(() => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT?: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    vi.clearAllMocks();
    invalidateTrayPayloadCache();
    hasDesktopHostInvokeCapability.mockReturnValue(true);
    safeListen.mockResolvedValue(vi.fn());

    loadConfiguredProviders.mockResolvedValue([
      {
        key: "deepseek",
        label: "DeepSeek",
        registryId: "deepseek",
        type: "deepseek",
      },
    ]);
    getModelRegistry.mockResolvedValue([
      {
        id: "deepseek-chat",
        display_name: "DeepSeek Chat",
        provider_id: "deepseek",
        provider_name: "DeepSeek",
        is_latest: true,
        release_date: "2026-01-01",
      },
    ]);
    getAllAliasConfigs.mockResolvedValue({});
    syncTrayModelShortcuts.mockResolvedValue(undefined);
  });

  it("相同签名的 payload 会复用缓存，避免重复拉取数据", async () => {
    const first = await buildTrayPayload(
      "deepseek",
      "deepseek-chat",
      "general",
    );
    const second = await buildTrayPayload(
      "deepseek",
      "deepseek-chat",
      "general",
    );

    expect(second).toEqual(first);
    expect(loadConfiguredProviders).toHaveBeenCalledTimes(1);
    expect(getModelRegistry).toHaveBeenCalledTimes(1);
    expect(getAllAliasConfigs).toHaveBeenCalledTimes(1);
  });

  it("强制刷新会绕过缓存重新拉取数据", async () => {
    await buildTrayPayload("deepseek", "deepseek-chat", "general");
    await buildTrayPayload("deepseek", "deepseek-chat", "general", {
      forceRefresh: true,
    });

    expect(loadConfiguredProviders).toHaveBeenCalledTimes(2);
    expect(getModelRegistry).toHaveBeenCalledTimes(2);
    expect(getAllAliasConfigs).toHaveBeenCalledTimes(2);
  });

  it("相同 payload 重复同步时应跳过重复托盘写入", async () => {
    await syncTrayModelShortcutsState("deepseek", "deepseek-chat", "general");
    await syncTrayModelShortcutsState("deepseek", "deepseek-chat", "general");

    expect(syncTrayModelShortcuts).toHaveBeenCalledTimes(1);
  });

  it("当 provider 仅命中 fallbackRegistryId 时仍应保留托盘候选模型", async () => {
    loadConfiguredProviders.mockResolvedValueOnce([
      {
        key: "custom-openai",
        label: "Custom OpenAI",
        registryId: "custom-openai",
        fallbackRegistryId: "openai",
        type: "openai",
      },
    ]);
    getModelRegistry.mockResolvedValueOnce([
      {
        id: "gpt-4.1",
        display_name: "GPT-4.1",
        provider_id: "openai",
        provider_name: "OpenAI",
        is_latest: true,
        release_date: "2026-02-01",
      },
    ]);

    const payload = await buildTrayPayload(
      "custom-openai",
      "gpt-4.1",
      "general",
      { forceRefresh: true },
    );

    expect(payload.quick_model_groups).toEqual([
      {
        provider_type: "custom-openai",
        provider_label: "Custom OpenAI",
        models: [
          {
            provider_type: "custom-openai",
            provider_label: "Custom OpenAI",
            model: "gpt-4.1",
          },
        ],
      },
    ]);
  });

  it("首次同步失败时不应缓存成功指纹，后续重试仍应继续同步", async () => {
    syncTrayModelShortcuts
      .mockRejectedValueOnce(new Error("tray unavailable"))
      .mockResolvedValueOnce(undefined);

    await expect(
      syncTrayModelShortcutsState("deepseek", "deepseek-chat", "general"),
    ).rejects.toThrow("tray unavailable");
    await expect(
      syncTrayModelShortcutsState("deepseek", "deepseek-chat", "general"),
    ).resolves.toBeUndefined();

    expect(syncTrayModelShortcuts).toHaveBeenCalledTimes(2);
  });

  it("hook 默认开启托盘候选同步", async () => {
    await renderTrayModelShortcutsHook({
      providerType: "deepseek",
      setProviderType: vi.fn(),
      model: "deepseek-chat",
      setModel: vi.fn(),
      activeTheme: "general",
    });

    expect(loadConfiguredProviders).toHaveBeenCalledTimes(1);
    expect(getModelRegistry).toHaveBeenCalledTimes(1);
    expect(getAllAliasConfigs).toHaveBeenCalledTimes(1);
    expect(syncTrayModelShortcuts).toHaveBeenCalledTimes(1);
  });

  it("关闭自动同步时不拉取托盘候选数据，但仍监听托盘模型选择", async () => {
    const setProviderType = vi.fn();
    const setModel = vi.fn();

    await renderTrayModelShortcutsHook({
      providerType: "deepseek",
      setProviderType,
      model: "deepseek-chat",
      setModel,
      activeTheme: "general",
      autoSyncEnabled: false,
    });

    expect(loadConfiguredProviders).not.toHaveBeenCalled();
    expect(getModelRegistry).not.toHaveBeenCalled();
    expect(getAllAliasConfigs).not.toHaveBeenCalled();
    expect(syncTrayModelShortcuts).not.toHaveBeenCalled();
    expect(safeListen).toHaveBeenCalledWith(
      "tray-model-selected",
      expect.any(Function),
    );

    const listener = safeListen.mock.calls[0]?.[1] as
      | ((event: {
          payload: {
            providerType?: string;
            model?: string;
          };
        }) => void)
      | undefined;
    expect(listener).toEqual(expect.any(Function));
    if (!listener) {
      throw new Error("托盘模型选择监听未注册");
    }

    act(() => {
      listener({
        payload: {
          providerType: "openai",
          model: "gpt-4.1",
        },
      });
    });

    expect(setProviderType).toHaveBeenCalledWith("openai");
    expect(setModel).toHaveBeenCalledWith("gpt-4.1");
  });
});
