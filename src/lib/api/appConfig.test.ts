import { beforeEach, describe, expect, it, vi } from "vitest";
import { safeInvoke } from "@/lib/dev-bridge";
import {
  getConfig,
  getDefaultProvider,
  invalidateAppConfigCache,
  getEnvironmentPreview,
  saveConfig,
  updateConfig,
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

  it("环境预览应接收 Electron Host current 返回的局部 Shell 导入状态", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce({
      shellImport: {
        enabled: false,
        status: "disabled",
        message: "Electron current 暂未接入 shell 环境导入预览。",
        importedCount: 0,
        durationMs: null,
      },
      entries: [],
    });

    await expect(getEnvironmentPreview()).resolves.toEqual({
      shellImport: {
        enabled: false,
        status: "disabled",
        message: "Electron current 暂未接入 shell 环境导入预览。",
        importedCount: 0,
        durationMs: null,
      },
      entries: [],
    });
  });

  it("环境预览遇到顶层 Electron degraded diagnostic facade 时应 fail closed", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce({
      shellImport: {
        enabled: false,
        status: "disabled",
        message: "Electron current 暂未接入 shell 环境导入预览。",
        importedCount: 0,
        durationMs: null,
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
    vi.mocked(safeInvoke).mockResolvedValueOnce({
      diagnostic: {
        source: "electron-host-diagnostic",
        command: "get_default_provider",
        status: "degraded",
      },
    });

    await expect(getDefaultProvider()).rejects.toThrow(
      "get_default_provider 尚未接入真实默认 Provider current 通道，收到 electron-host-diagnostic 诊断返回。",
    );
  });

  it("默认 Provider 命令应校验返回形态", async () => {
    vi.mocked(safeInvoke)
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce("");

    await expect(getDefaultProvider()).rejects.toThrow(
      "get_default_provider 未返回有效默认 Provider",
    );
    await expect(getDefaultProvider()).rejects.toThrow(
      "get_default_provider 未返回有效默认 Provider",
    );
  });

  it("写配置命令遇到 diagnostic facade 时应 fail closed", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce({
      diagnostic: {
        source: "electron-host-diagnostic",
        command: "save_config",
        status: "degraded",
      },
    });

    await expect(
      saveConfig({ default_provider: "claude" } as never),
    ).rejects.toThrow(
      "save_config 尚未接入真实配置 current 通道，收到 electron-host-diagnostic 诊断返回。",
    );
  });

  it("写配置命令遇到 mock-like payload 时应 fail closed", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce({ success: true });

    await expect(
      saveConfig({ default_provider: "claude" } as never),
    ).rejects.toThrow("save_config did not return void result");
  });

  it("应代理写配置命令", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce(undefined);

    await expect(
      saveConfig({ default_provider: "claude" } as never),
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

  it("getConfig 应清理 current schema 下残留的 companion 入口", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce({
      default_provider: "claude",
      navigation: { schema_version: 3, enabled_items: ["companion"] },
    });

    await expect(getConfig()).resolves.toEqual(
      expect.objectContaining({
        navigation: { schema_version: 3, enabled_items: [] },
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
        navigation: { schema_version: 3, enabled_items: [] },
      }),
    );

    expect(vi.mocked(safeInvoke)).toHaveBeenCalledTimes(1);
  });

  it("updateConfig 应串行合并连续 mutation，避免后写入覆盖前一笔 Provider", async () => {
    let releaseFirstSave: (() => void) | undefined;
    let saveCount = 0;
    let secondUpdaterProvider: string | undefined;

    vi.mocked(safeInvoke).mockImplementation(async (command) => {
      if (command === "get_config") {
        return {
          default_provider: "openai",
          workspace_preferences: {
            media_defaults: {
              image: {
                preferredProviderId: "old-provider",
                preferredModelId: "old-model",
                allowFallback: false,
              },
            },
          },
        };
      }
      if (command === "save_config") {
        saveCount += 1;
        if (saveCount === 1) {
          await new Promise<void>((resolve) => {
            releaseFirstSave = resolve;
          });
        }
        return undefined;
      }
      throw new Error(`unexpected command: ${command}`);
    });

    const providerUpdate = updateConfig((current) => ({
      ...current,
      workspace_preferences: {
        ...current.workspace_preferences,
        media_defaults: {
          ...current.workspace_preferences?.media_defaults,
          image: {
            preferredProviderId: "new-provider",
            allowFallback: false,
          },
        },
      },
    }));
    const modelUpdate = updateConfig((current) => {
      secondUpdaterProvider =
        current.workspace_preferences?.media_defaults?.image
          ?.preferredProviderId;
      return {
        ...current,
        workspace_preferences: {
          ...current.workspace_preferences,
          media_defaults: {
            ...current.workspace_preferences?.media_defaults,
            image: {
              ...current.workspace_preferences?.media_defaults?.image,
              preferredModelId: "new-model",
            },
          },
        },
      };
    });

    await vi.waitFor(() => {
      expect(saveCount).toBe(1);
    });
    expect(secondUpdaterProvider).toBeUndefined();

    releaseFirstSave?.();
    await expect(Promise.all([providerUpdate, modelUpdate])).resolves.toEqual([
      expect.any(Object),
      expect.any(Object),
    ]);

    expect(secondUpdaterProvider).toBe("new-provider");
    const saveCalls = vi
      .mocked(safeInvoke)
      .mock.calls.filter(([command]) => command === "save_config");
    expect(saveCalls).toHaveLength(2);
    expect(
      saveCalls[1]?.[1]?.config.workspace_preferences.media_defaults.image,
    ).toEqual({
      preferredProviderId: "new-provider",
      preferredModelId: "new-model",
      allowFallback: false,
    });
  });
});
