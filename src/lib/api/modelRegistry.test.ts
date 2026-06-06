import { beforeEach, describe, expect, it, vi } from "vitest";
import { safeInvoke } from "@/lib/dev-bridge";
import {
  getAllAliasConfigs,
  getModelRegistry,
  getModelRegistryProviderIds,
  getModelPreferences,
  getModelsByTier,
  getModelsForProvider,
  getProviderAliasConfig,
  getModelSyncState,
  invalidateModelRegistryCache,
  refreshModelRegistry,
} from "./modelRegistry";

const appServerRequestMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api/appServer", () => ({
  AppServerClient: vi.fn(() => ({
    request: appServerRequestMock,
  })),
}));

vi.mock("@/lib/dev-bridge", () => ({
  safeInvoke: vi.fn(),
}));

function resolveAppServerRequest<T>(result: T): void {
  appServerRequestMock.mockResolvedValueOnce({ result });
}

function expectAppServerRequest(
  index: number,
  method: string,
  params: unknown,
): void {
  expect(appServerRequestMock).toHaveBeenNthCalledWith(index, method, params);
}

describe("modelRegistry API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    appServerRequestMock.mockReset();
    invalidateModelRegistryCache();
  });

  it("getModelRegistry 应缓存并复用同一轮读取结果", async () => {
    resolveAppServerRequest({
      models: [
        {
          id: "gpt-4.1",
          display_name: "GPT-4.1",
          provider_id: "openai",
          provider_name: "OpenAI",
        },
      ],
    });

    const [first, second] = await Promise.all([
      getModelRegistry(),
      getModelRegistry(),
    ]);

    expect(appServerRequestMock).toHaveBeenCalledTimes(1);
    expectAppServerRequest(1, "model/list", {});
    expect(safeInvoke).not.toHaveBeenCalled();
    expect(first).toEqual(second);
    expect(first).not.toBe(second);
  });

  it("getProviderAliasConfig 应复用已加载的全量别名配置", async () => {
    resolveAppServerRequest({
      configs: {
        kiro: {
          models: ["kimi-k2"],
          aliases: {
            "kimi-k2": {
              actual: "kimi-k2",
            },
          },
        },
      },
    });

    await expect(getAllAliasConfigs()).resolves.toEqual(
      expect.objectContaining({
        kiro: expect.objectContaining({
          models: ["kimi-k2"],
        }),
      }),
    );
    await expect(getProviderAliasConfig("kiro")).resolves.toEqual(
      expect.objectContaining({ models: ["kimi-k2"] }),
    );

    expect(appServerRequestMock).toHaveBeenCalledTimes(1);
    expectAppServerRequest(1, "modelProviderAlias/list", {});
    expect(safeInvoke).not.toHaveBeenCalled();
  });

  it("refreshModelRegistry 后应失效缓存并触发下一次重新读取", async () => {
    resolveAppServerRequest({
      models: [
        {
          id: "gpt-4.1",
          display_name: "GPT-4.1",
          provider_id: "openai",
          provider_name: "OpenAI",
        },
      ],
    });
    vi.mocked(safeInvoke).mockResolvedValueOnce(0);
    resolveAppServerRequest({
      models: [
        {
          id: "gpt-5",
          display_name: "GPT-5",
          provider_id: "openai",
          provider_name: "OpenAI",
        },
      ],
    });

    await getModelRegistry();
    await expect(refreshModelRegistry()).resolves.toBe(0);
    await expect(getModelRegistry()).resolves.toEqual([
      expect.objectContaining({ id: "gpt-5" }),
    ]);

    expectAppServerRequest(1, "model/list", {});
    expectAppServerRequest(2, "model/list", {});
    expect(vi.mocked(safeInvoke)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(safeInvoke)).toHaveBeenCalledWith(
      "refresh_model_registry",
    );
  });

  it("模型偏好、同步状态、provider 与 tier 读取应走 App Server current", async () => {
    resolveAppServerRequest({
      preferences: [
        {
          model_id: "gpt-4.1",
          is_favorite: true,
          is_hidden: false,
          custom_alias: null,
          usage_count: 3,
          last_used_at: null,
          created_at: 1,
          updated_at: 2,
        },
      ],
    });
    resolveAppServerRequest({
      syncState: {
        last_sync_at: 1,
        model_count: 2,
        is_syncing: false,
        last_error: null,
      },
    });
    resolveAppServerRequest({
      models: [{ id: "openai/gpt-4.1", provider_id: "openai" }],
    });
    resolveAppServerRequest({
      models: [{ id: "openai/gpt-4.1-mini", tier: "mini" }],
    });

    await expect(getModelPreferences()).resolves.toEqual([
      expect.objectContaining({ model_id: "gpt-4.1" }),
    ]);
    await expect(getModelSyncState()).resolves.toEqual(
      expect.objectContaining({ model_count: 2 }),
    );
    await expect(getModelsForProvider("openai")).resolves.toEqual([
      expect.objectContaining({ provider_id: "openai" }),
    ]);
    await expect(getModelsByTier("mini")).resolves.toEqual([
      expect.objectContaining({ tier: "mini" }),
    ]);

    expectAppServerRequest(1, "modelPreferences/list", {});
    expectAppServerRequest(2, "modelSyncState/read", {});
    expectAppServerRequest(3, "model/list", { providerId: "openai" });
    expectAppServerRequest(4, "model/list", { tier: "mini" });
    expect(safeInvoke).not.toHaveBeenCalled();
  });

  it("单个 provider alias 应通过 App Server 读取并缓存", async () => {
    resolveAppServerRequest({
      config: {
        provider: "kiro",
        models: ["kimi-k2"],
        aliases: {},
      },
    });

    await expect(getProviderAliasConfig("kiro")).resolves.toEqual(
      expect.objectContaining({ provider: "kiro" }),
    );
    await expect(getProviderAliasConfig("kiro")).resolves.toEqual(
      expect.objectContaining({ provider: "kiro" }),
    );

    expect(appServerRequestMock).toHaveBeenCalledTimes(1);
    expectAppServerRequest(1, "modelProviderAlias/read", { provider: "kiro" });
    expect(safeInvoke).not.toHaveBeenCalled();
  });

  it("App Server 模型读链缺少必需 result 时不应回退 legacy", async () => {
    resolveAppServerRequest({});
    await expect(getModelRegistry()).rejects.toThrow(
      "App Server model/list did not return models",
    );

    appServerRequestMock.mockReset();
    resolveAppServerRequest({});
    await expect(getModelPreferences()).rejects.toThrow(
      "App Server modelPreferences/list did not return preferences",
    );

    appServerRequestMock.mockReset();
    resolveAppServerRequest({});
    await expect(getModelSyncState()).rejects.toThrow(
      "App Server modelSyncState/read did not return syncState",
    );

    appServerRequestMock.mockReset();
    resolveAppServerRequest({});
    await expect(getAllAliasConfigs()).rejects.toThrow(
      "App Server modelProviderAlias/list did not return configs",
    );

    expect(safeInvoke).not.toHaveBeenCalledWith("get_model_registry");
    expect(safeInvoke).not.toHaveBeenCalledWith("get_model_preferences");
    expect(safeInvoke).not.toHaveBeenCalledWith("get_model_sync_state");
    expect(safeInvoke).not.toHaveBeenCalledWith("get_all_alias_configs");
  });

  it("getModelRegistryProviderIds 仅保留兼容命令并透传空集合", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce([]);

    await expect(getModelRegistryProviderIds()).resolves.toEqual([]);
    expect(vi.mocked(safeInvoke)).toHaveBeenCalledWith(
      "get_model_registry_provider_ids",
    );
  });
});
