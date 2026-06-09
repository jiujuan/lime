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
  fetchProviderModelsAuto,
  hideModel,
  invalidateModelRegistryCache,
  recordModelUsage,
  refreshModelRegistry,
  searchModels,
  toggleModelFavorite,
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
        "custom-provider": {
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
        "custom-provider": expect.objectContaining({
          models: ["kimi-k2"],
        }),
      }),
    );
    await expect(getProviderAliasConfig("custom-provider")).resolves.toEqual(
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

  it("searchModels 应基于 App Server current 模型列表做前端过滤", async () => {
    resolveAppServerRequest({
      models: [
        {
          id: "openai/gpt-4.1",
          display_name: "GPT-4.1",
          provider_id: "openai",
          provider_name: "OpenAI",
        },
        {
          id: "anthropic/claude-sonnet-4",
          display_name: "Claude Sonnet 4",
          provider_id: "anthropic",
          provider_name: "Anthropic",
        },
      ],
    });

    await expect(searchModels("gpt", 1)).resolves.toEqual([
      expect.objectContaining({ id: "openai/gpt-4.1" }),
    ]);

    expectAppServerRequest(1, "model/list", {});
    expect(safeInvoke).not.toHaveBeenCalledWith("search_models", {
      query: "gpt",
      limit: 1,
    });
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
        provider: "custom-provider",
        models: ["kimi-k2"],
        aliases: {},
      },
    });

    await expect(getProviderAliasConfig("custom-provider")).resolves.toEqual(
      expect.objectContaining({ provider: "custom-provider" }),
    );
    await expect(getProviderAliasConfig("custom-provider")).resolves.toEqual(
      expect.objectContaining({ provider: "custom-provider" }),
    );

    expect(appServerRequestMock).toHaveBeenCalledTimes(1);
    expectAppServerRequest(1, "modelProviderAlias/read", {
      provider: "custom-provider",
    });
    expect(safeInvoke).not.toHaveBeenCalled();
  });

  it("Provider 实时模型抓取应通过 App Server current", async () => {
    resolveAppServerRequest({
      models: [{ id: "gpt-4.1", provider_id: "openai" }],
      source: "Api",
      error: null,
      requestUrl: "https://api.openai.com/v1/models",
      diagnosticHint: null,
      errorKind: null,
      shouldPromptError: false,
      fromCache: true,
    });

    await expect(fetchProviderModelsAuto("openai")).resolves.toEqual(
      expect.objectContaining({
        source: "Api",
        request_url: "https://api.openai.com/v1/models",
        from_cache: true,
      }),
    );

    expectAppServerRequest(1, "modelProvider/fetchModels", {
      providerId: "openai",
    });
    expect(safeInvoke).not.toHaveBeenCalledWith("fetch_provider_models_auto");
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

  it("getModelRegistryProviderIds 应通过 App Server provider list 派生去重 id", async () => {
    resolveAppServerRequest({
      providers: [
        { id: "openai", name: "OpenAI" },
        { id: "anthropic", name: "Anthropic" },
        { id: "openai", name: "OpenAI duplicate" },
        { id: "", name: "invalid empty" },
        { name: "missing id" },
      ],
    });

    await expect(getModelRegistryProviderIds()).resolves.toEqual([
      "openai",
      "anthropic",
    ]);

    expectAppServerRequest(1, "modelProvider/list", {});
    expect(safeInvoke).not.toHaveBeenCalledWith(
      "get_model_registry_provider_ids",
    );
  });

  it("getModelRegistryProviderIds 缺少 App Server providers 时应 fail closed", async () => {
    resolveAppServerRequest({});

    await expect(getModelRegistryProviderIds()).rejects.toThrow(
      "App Server modelProvider/list did not return providers",
    );
    expect(safeInvoke).not.toHaveBeenCalledWith(
      "get_model_registry_provider_ids",
    );
  });

  it("模型注册表 compat 命令收到 diagnostic facade 时应 fail closed", async () => {
    vi.mocked(safeInvoke).mockResolvedValue({
      diagnostic: {
        category: "electron-diagnostic-facade",
        source: "electron-host-diagnostic",
      },
    });

    await expect(refreshModelRegistry()).rejects.toThrow(
      "refresh_model_registry 尚未接入真实模型注册表 current 通道，收到 electron-host-diagnostic 诊断返回。",
    );
    await expect(toggleModelFavorite("gpt-4.1")).rejects.toThrow(
      "toggle_model_favorite 尚未接入真实模型注册表 current 通道，收到 electron-host-diagnostic 诊断返回。",
    );
    await expect(hideModel("gpt-4.1")).rejects.toThrow(
      "hide_model 尚未接入真实模型注册表 current 通道，收到 electron-host-diagnostic 诊断返回。",
    );
    await expect(recordModelUsage("gpt-4.1")).rejects.toThrow(
      "record_model_usage 尚未接入真实模型注册表 current 通道，收到 electron-host-diagnostic 诊断返回。",
    );
  });

  it("模型隐藏和使用记录只接受真实空返回", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce(undefined).mockResolvedValueOnce(null);

    await expect(hideModel("gpt-4.1")).resolves.toBeUndefined();
    await expect(recordModelUsage("gpt-4.1")).resolves.toBeUndefined();

    expect(safeInvoke).toHaveBeenNthCalledWith(1, "hide_model", {
      modelId: "gpt-4.1",
    });
    expect(safeInvoke).toHaveBeenNthCalledWith(2, "record_model_usage", {
      modelId: "gpt-4.1",
    });
  });

  it("模型注册表 compat 命令返回错误形态时不应吞成成功", async () => {
    vi.mocked(safeInvoke)
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ error: "not available" });

    await expect(refreshModelRegistry()).rejects.toThrow(
      "refresh_model_registry did not return a finite number",
    );
    await expect(toggleModelFavorite("gpt-4.1")).rejects.toThrow(
      "toggle_model_favorite did not return a boolean",
    );
    await expect(hideModel("gpt-4.1")).rejects.toThrow(
      "hide_model did not return an empty result",
    );
    await expect(recordModelUsage("gpt-4.1")).rejects.toThrow(
      "record_model_usage did not return an empty result",
    );
  });
});
