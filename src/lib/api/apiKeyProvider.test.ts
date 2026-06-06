import { beforeEach, describe, expect, it, vi } from "vitest";
import { safeInvoke } from "@/lib/dev-bridge";
import {
  apiKeyProviderApi,
  invalidateApiKeyProviderCache,
} from "./apiKeyProvider";

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

describe("apiKeyProvider API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    appServerRequestMock.mockReset();
    invalidateApiKeyProviderCache();
  });

  it("Provider 列表应通过 App Server modelProvider/list 读取", async () => {
    resolveAppServerRequest({
      providers: [
        {
          id: "openai",
          name: "OpenAI",
          type: "openai",
          enabled: true,
          api_key_count: 1,
          api_keys: [{ id: "key-1", provider_id: "openai", enabled: true }],
        },
      ],
    });

    await expect(apiKeyProviderApi.getProviders()).resolves.toEqual([
      expect.objectContaining({ id: "openai" }),
    ]);

    expectAppServerRequest(1, "modelProvider/list", {});
    expect(safeInvoke).not.toHaveBeenCalled();
  });

  it("系统 Provider Catalog 应通过 App Server modelProvider/catalog/list 读取", async () => {
    resolveAppServerRequest({
      providers: [
        {
          id: "openai",
          name: "OpenAI",
          type: "openai",
          api_host: "https://api.openai.com",
          group: "global",
          sort_order: 1,
          legacy_ids: [],
        },
      ],
    });

    await expect(apiKeyProviderApi.getSystemProviderCatalog()).resolves.toEqual(
      [expect.objectContaining({ id: "openai" })],
    );

    expectAppServerRequest(1, "modelProvider/catalog/list", {});
    expect(safeInvoke).not.toHaveBeenCalled();
  });

  it("Provider 读链缺少必需 result 时不应回退 legacy", async () => {
    resolveAppServerRequest({});
    await expect(apiKeyProviderApi.getProviders()).rejects.toThrow(
      "App Server modelProvider/list did not return providers",
    );

    appServerRequestMock.mockReset();
    resolveAppServerRequest({});
    await expect(apiKeyProviderApi.getSystemProviderCatalog()).rejects.toThrow(
      "App Server modelProvider/catalog/list did not return providers",
    );

    expect(safeInvoke).not.toHaveBeenCalledWith("get_api_key_providers");
    expect(safeInvoke).not.toHaveBeenCalledWith("get_system_provider_catalog");
  });

  it("应代理现役 provider side-effect 命令", async () => {
    vi.mocked(safeInvoke)
      .mockResolvedValueOnce({ id: "key-1" })
      .mockResolvedValueOnce({ success: true });

    await expect(
      apiKeyProviderApi.addApiKey({
        provider_id: "openai",
        api_key: "sk-test",
        replace_existing: true,
      }),
    ).resolves.toEqual(expect.objectContaining({ id: "key-1" }));
    await expect(
      apiKeyProviderApi.testConnection("openai", "gpt-4.1"),
    ).resolves.toEqual(expect.objectContaining({ success: true }));
    expect(vi.mocked(safeInvoke)).toHaveBeenNthCalledWith(1, "add_api_key", {
      request: {
        provider_id: "openai",
        api_key: "sk-test",
        replace_existing: true,
      },
    });
  });

  it("不应继续暴露旧 API Key 迁移 API", () => {
    expect("getLegacyApiKeyCredentials" in apiKeyProviderApi).toBe(false);
    expect("migrateLegacyCredentials" in apiKeyProviderApi).toBe(false);
    expect("deleteLegacyCredential" in apiKeyProviderApi).toBe(false);
  });

  it("getProviders 应缓存并复用同一轮读取结果", async () => {
    resolveAppServerRequest({
      providers: [
        {
          id: "openai",
          name: "OpenAI",
          type: "openai",
          enabled: true,
          api_key_count: 1,
          api_keys: [{ id: "key-1", provider_id: "openai", enabled: true }],
        },
      ],
    });

    const [first, second] = await Promise.all([
      apiKeyProviderApi.getProviders(),
      apiKeyProviderApi.getProviders(),
    ]);

    expect(appServerRequestMock).toHaveBeenCalledTimes(1);
    expectAppServerRequest(1, "modelProvider/list", {});
    expect(safeInvoke).not.toHaveBeenCalled();
    expect(first).toEqual(second);
    expect(first).not.toBe(second);
  });

  it("forceRefresh 应绕过 Provider 缓存", async () => {
    resolveAppServerRequest({
      providers: [
        {
          id: "openai",
          name: "OpenAI",
          type: "openai",
          enabled: true,
          api_key_count: 1,
          api_keys: [],
        },
      ],
    });
    resolveAppServerRequest({
      providers: [
        {
          id: "deepseek",
          name: "DeepSeek",
          type: "deepseek",
          enabled: true,
          api_key_count: 2,
          api_keys: [],
        },
      ],
    });

    await expect(apiKeyProviderApi.getProviders()).resolves.toEqual([
      expect.objectContaining({ id: "openai" }),
    ]);
    await expect(
      apiKeyProviderApi.getProviders({ forceRefresh: true }),
    ).resolves.toEqual([expect.objectContaining({ id: "deepseek" })]);

    expect(appServerRequestMock).toHaveBeenCalledTimes(2);
    expectAppServerRequest(1, "modelProvider/list", {});
    expectAppServerRequest(2, "modelProvider/list", {});
    expect(safeInvoke).not.toHaveBeenCalled();
  });

  it("Provider 读取失败时不应注入本地 mock 或写入缓存", async () => {
    appServerRequestMock.mockRejectedValueOnce(
      new Error("App Server unavailable"),
    );

    await expect(
      apiKeyProviderApi.getProviders({ forceRefresh: true }),
    ).rejects.toThrow("App Server unavailable");

    resolveAppServerRequest({
      providers: [
        {
          id: "custom-openai-images",
          name: "OpenAI-gpt-images-2",
          type: "openai",
          enabled: true,
          api_key_count: 1,
          custom_models: ["gpt-images-2"],
          api_keys: [],
        },
      ],
    });

    await expect(apiKeyProviderApi.getProviders()).resolves.toEqual([
      expect.objectContaining({
        id: "custom-openai-images",
        custom_models: ["gpt-images-2"],
      }),
    ]);
    expect(appServerRequestMock).toHaveBeenCalledTimes(2);
    expect(safeInvoke).not.toHaveBeenCalled();
  });

  it("写操作成功后应失效缓存", async () => {
    resolveAppServerRequest({
      providers: [
        {
          id: "openai",
          name: "OpenAI",
          type: "openai",
          enabled: true,
          api_key_count: 1,
          api_keys: [],
        },
      ],
    });
    vi.mocked(safeInvoke).mockResolvedValueOnce({ id: "key-2" });
    resolveAppServerRequest({
      providers: [
        {
          id: "openai",
          name: "OpenAI",
          type: "openai",
          enabled: true,
          api_key_count: 2,
          api_keys: [{ id: "key-2", provider_id: "openai", enabled: true }],
        },
      ],
    });

    await apiKeyProviderApi.getProviders();
    await apiKeyProviderApi.addApiKey({
      provider_id: "openai",
      api_key: "sk-test",
    });
    await expect(apiKeyProviderApi.getProviders()).resolves.toEqual([
      expect.objectContaining({ api_key_count: 2 }),
    ]);

    expect(appServerRequestMock).toHaveBeenCalledTimes(2);
    expectAppServerRequest(1, "modelProvider/list", {});
    expectAppServerRequest(2, "modelProvider/list", {});
    expect(vi.mocked(safeInvoke)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(safeInvoke)).toHaveBeenCalledWith("add_api_key", {
      request: {
        provider_id: "openai",
        api_key: "sk-test",
      },
    });
  });
});
