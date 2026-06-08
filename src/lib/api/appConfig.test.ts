import { beforeEach, describe, expect, it, vi } from "vitest";
import { safeInvoke } from "@/lib/dev-bridge";
import {
  getConfig,
  getDefaultProvider,
  invalidateAppConfigCache,
  getEnvironmentPreview,
  saveConfig,
  setDefaultProvider,
  updateProviderEnvVars,
} from "./appConfig";

vi.mock("@/lib/dev-bridge", () => ({
  safeInvoke: vi.fn(),
}));

describe("appConfig API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    invalidateAppConfigCache();
  });

  it("应代理读取配置命令", async () => {
    vi.mocked(safeInvoke)
      .mockResolvedValueOnce({ default_provider: "claude" })
      .mockResolvedValueOnce({ entries: [] })
      .mockResolvedValueOnce("claude");

    await expect(getConfig()).resolves.toEqual(
      expect.objectContaining({ default_provider: "claude" }),
    );
    await expect(getEnvironmentPreview()).resolves.toEqual(
      expect.objectContaining({ entries: [] }),
    );
    await expect(getDefaultProvider()).resolves.toBe("claude");
  });

  it("环境预览遇到 Electron degraded diagnostic facade 时应 fail closed", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce({
      shellImport: {
        enabled: false,
        status: "disabled",
        message: "Electron current 暂未接入 shell 环境导入预览。",
        importedCount: 0,
        durationMs: null,
        diagnostic: {
          source: "electron-host-diagnostic",
          command: "get_environment_preview",
          status: "degraded",
        },
      },
      entries: [],
      diagnostic: {
        source: "electron-host-diagnostic",
        command: "get_environment_preview",
        status: "degraded",
      },
    });

    await expect(getEnvironmentPreview()).rejects.toThrow(
      "get_environment_preview 尚未接入真实环境预览 current 通道，收到 electron-host-diagnostic 诊断返回。",
    );
  });

  it("读取配置遇到 diagnostic facade 或无效配置时应 fail closed", async () => {
    vi.mocked(safeInvoke)
      .mockResolvedValueOnce({
        diagnostic: {
          source: "electron-host-diagnostic",
          command: "get_config",
          status: "degraded",
        },
      })
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ default_provider: "" });

    await expect(getConfig()).rejects.toThrow(
      "get_config 尚未接入真实配置 current 通道，收到 electron-host-diagnostic 诊断返回。",
    );
    await expect(getConfig()).rejects.toThrow("get_config 未返回有效配置");
    await expect(getConfig()).rejects.toThrow("get_config 未返回有效配置");
  });

  it("默认 Provider 命令遇到 diagnostic facade 时应 fail closed", async () => {
    vi.mocked(safeInvoke)
      .mockResolvedValueOnce({
        diagnostic: {
          source: "electron-host-diagnostic",
          command: "get_default_provider",
          status: "degraded",
        },
      })
      .mockResolvedValueOnce({
        diagnostic: {
          source: "electron-host-diagnostic",
          command: "set_default_provider",
          status: "degraded",
        },
      });

    await expect(getDefaultProvider()).rejects.toThrow(
      "get_default_provider 尚未接入真实默认 Provider current 通道，收到 electron-host-diagnostic 诊断返回。",
    );
    await expect(setDefaultProvider("gemini")).rejects.toThrow(
      "set_default_provider 尚未接入真实默认 Provider current 通道，收到 electron-host-diagnostic 诊断返回。",
    );
  });

  it("默认 Provider 命令应校验返回形态", async () => {
    vi.mocked(safeInvoke)
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce("")
      .mockResolvedValueOnce("   ");

    await expect(getDefaultProvider()).rejects.toThrow(
      "get_default_provider 未返回有效默认 Provider",
    );
    await expect(setDefaultProvider("gemini")).rejects.toThrow(
      "set_default_provider 未返回有效默认 Provider",
    );
    await expect(setDefaultProvider("gemini")).rejects.toThrow(
      "set_default_provider 未返回有效默认 Provider",
    );
  });

  it("写配置命令遇到 diagnostic facade 时应 fail closed", async () => {
    vi.mocked(safeInvoke)
      .mockResolvedValueOnce({
        diagnostic: {
          source: "electron-host-diagnostic",
          command: "save_config",
          status: "degraded",
        },
      })
      .mockResolvedValueOnce({
        diagnostic: {
          source: "electron-host-diagnostic",
          command: "update_provider_env_vars",
          status: "degraded",
        },
      });

    await expect(
      saveConfig({ default_provider: "claude" } as never),
    ).rejects.toThrow(
      "save_config 尚未接入真实配置 current 通道，收到 electron-host-diagnostic 诊断返回。",
    );
    await expect(
      updateProviderEnvVars("openai", "https://example.com", "key"),
    ).rejects.toThrow(
      "update_provider_env_vars 尚未接入真实 Provider 环境变量 current 通道，收到 electron-host-diagnostic 诊断返回。",
    );
  });

  it("应代理写配置命令", async () => {
    vi.mocked(safeInvoke)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce("gemini")
      .mockResolvedValueOnce(undefined);

    await expect(
      saveConfig({ default_provider: "claude" } as never),
    ).resolves.toBeUndefined();
    await expect(setDefaultProvider("gemini")).resolves.toBe("gemini");
    await expect(
      updateProviderEnvVars("openai", "https://example.com", "key"),
    ).resolves.toBeUndefined();
  });

  it("应返回 workspace_preferences 配置", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce({
      default_provider: "claude",
      workspace_preferences: {
        schema_version: 2,
        media_defaults: {
          image: {
            preferredProviderId: "fal",
          },
        },
        companion_defaults: {
          general: {
            preferredProviderId: "deepseek",
            preferredModelId: "deepseek-chat",
          },
        },
        service_models: {
          topic: {
            preferredProviderId: "openai",
            preferredModelId: "gpt-5.4-mini",
          },
          prompt_rewrite: {
            enabled: false,
          },
        },
      },
    });

    await expect(getConfig()).resolves.toEqual(
      expect.objectContaining({
        default_provider: "claude",
        workspace_preferences: expect.objectContaining({
          media_defaults: expect.objectContaining({
            image: expect.objectContaining({
              preferredProviderId: "fal",
            }),
          }),
          companion_defaults: expect.objectContaining({
            general: expect.objectContaining({
              preferredProviderId: "deepseek",
              preferredModelId: "deepseek-chat",
            }),
          }),
          service_models: expect.objectContaining({
            topic: expect.objectContaining({
              preferredProviderId: "openai",
              preferredModelId: "gpt-5.4-mini",
            }),
            prompt_rewrite: expect.objectContaining({
              enabled: false,
            }),
          }),
        }),
      }),
    );
    const config = await getConfig();
    expect(config.workspace_preferences).toEqual(
      expect.objectContaining({
        media_defaults: expect.objectContaining({
          image: expect.objectContaining({
            preferredProviderId: "fal",
          }),
        }),
        companion_defaults: expect.objectContaining({
          general: expect.objectContaining({
            preferredProviderId: "deepseek",
            preferredModelId: "deepseek-chat",
          }),
        }),
        service_models: expect.objectContaining({
          topic: expect.objectContaining({
            preferredProviderId: "openai",
            preferredModelId: "gpt-5.4-mini",
          }),
          prompt_rewrite: expect.objectContaining({
            enabled: false,
          }),
        }),
      }),
    );
  });

  it("saveConfig 应写入 workspace_preferences", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce(undefined);

    const config = {
      default_provider: "claude",
      workspace_preferences: {
        media_defaults: {
          voice: { preferredProviderId: "openai" },
        },
        companion_defaults: {
          general: { preferredProviderId: "deepseek" },
        },
        service_models: {
          topic: {
            preferredProviderId: "openai",
            preferredModelId: "gpt-5.4-mini",
          },
        },
      },
    } as never;

    await expect(saveConfig(config)).resolves.toBeUndefined();

    expect(vi.mocked(safeInvoke)).toHaveBeenCalledWith("save_config", {
      config,
    });
  });

  it("getConfig 应缓存并复用同一轮读取结果", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce({
      default_provider: "claude",
      navigation: { schema_version: 3, enabled_items: ["companion"] },
    });

    const [first, second] = await Promise.all([getConfig(), getConfig()]);

    expect(vi.mocked(safeInvoke)).toHaveBeenCalledTimes(1);
    expect(first).toEqual(
      expect.objectContaining({ default_provider: "claude" }),
    );
    expect(second).toEqual(
      expect.objectContaining({ default_provider: "claude" }),
    );
    expect(first).not.toBe(second);
  });

  it("getConfig 应把旧 schema 的桌宠入口迁移为默认关闭", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce({
      default_provider: "claude",
      navigation: { schema_version: 2, enabled_items: ["companion"] },
    });

    await expect(getConfig()).resolves.toEqual(
      expect.objectContaining({
        navigation: { schema_version: 3, enabled_items: [] },
      }),
    );
  });

  it("getConfig 应保留 current schema 下显式开启的桌宠入口", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce({
      default_provider: "claude",
      navigation: { schema_version: 3, enabled_items: ["companion"] },
    });

    await expect(getConfig()).resolves.toEqual(
      expect.objectContaining({
        navigation: { schema_version: 3, enabled_items: ["companion"] },
      }),
    );
  });

  it("saveConfig 后后续 getConfig 应直接命中新缓存", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce(undefined);

    const nextConfig = {
      default_provider: "openai",
      navigation: { schema_version: 3, enabled_items: ["companion"] },
    } as never;

    await expect(saveConfig(nextConfig)).resolves.toBeUndefined();
    await expect(getConfig()).resolves.toEqual(
      expect.objectContaining({
        default_provider: "openai",
        navigation: { schema_version: 3, enabled_items: ["companion"] },
      }),
    );

    expect(vi.mocked(safeInvoke)).toHaveBeenCalledTimes(1);
  });

  it("setDefaultProvider 应更新已缓存配置中的 default_provider", async () => {
    vi.mocked(safeInvoke)
      .mockResolvedValueOnce({
        default_provider: "claude",
        navigation: { schema_version: 3, enabled_items: ["companion"] },
      })
      .mockResolvedValueOnce("gemini");

    await getConfig();
    await expect(setDefaultProvider("gemini")).resolves.toBe("gemini");
    await expect(getConfig()).resolves.toEqual(
      expect.objectContaining({ default_provider: "gemini" }),
    );

    expect(vi.mocked(safeInvoke)).toHaveBeenCalledTimes(2);
  });

  it("updateProviderEnvVars 后应失效缓存并触发下一次重新读取", async () => {
    vi.mocked(safeInvoke)
      .mockResolvedValueOnce({
        default_provider: "claude",
        navigation: { schema_version: 3, enabled_items: ["companion"] },
      })
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({
        default_provider: "openai",
        navigation: { schema_version: 3, enabled_items: ["companion"] },
      });

    await getConfig();
    await updateProviderEnvVars("openai", "https://example.com", "key");
    await expect(getConfig()).resolves.toEqual(
      expect.objectContaining({
        default_provider: "openai",
        navigation: { schema_version: 3, enabled_items: ["companion"] },
      }),
    );

    expect(vi.mocked(safeInvoke)).toHaveBeenCalledTimes(3);
  });
});
