import { beforeEach, describe, expect, it, vi } from "vitest";
import { safeInvoke } from "@/lib/dev-bridge";
import { syncTrayModelShortcuts } from "./tray";

vi.mock("@/lib/dev-bridge", () => ({
  safeInvoke: vi.fn(),
}));

describe("tray API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("应同步托盘模型快捷菜单并保持参数投影", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce(null);

    await expect(
      syncTrayModelShortcuts({
        current_model_provider_type: "openai",
        current_model_provider_label: "OpenAI",
        current_model: "gpt-4.1",
        current_theme_label: "默认主题",
        quick_model_groups: [
          {
            provider_type: "openai",
            provider_label: "OpenAI",
            models: [
              {
                provider_type: "openai",
                provider_label: "OpenAI",
                model: "gpt-4.1",
              },
            ],
          },
        ],
      }),
    ).resolves.toBeUndefined();

    expect(safeInvoke).toHaveBeenCalledWith("sync_tray_model_shortcuts", {
      currentModelProviderType: "openai",
      currentModelProviderLabel: "OpenAI",
      currentModel: "gpt-4.1",
      currentThemeLabel: "默认主题",
      quickModelGroups: [
        {
          provider_type: "openai",
          provider_label: "OpenAI",
          models: [
            {
              provider_type: "openai",
              provider_label: "OpenAI",
              model: "gpt-4.1",
            },
          ],
        },
      ],
    });
  });

  it("遇到 Electron degraded diagnostic facade 时应 fail closed", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce({
      diagnostic: {
        category: "electron-diagnostic-facade",
        source: "electron-host-diagnostic",
      },
    });

    await expect(
      syncTrayModelShortcuts({
        current_model_provider_type: "openai",
        current_model_provider_label: "OpenAI",
        current_model: "gpt-4.1",
        current_theme_label: "默认主题",
        quick_model_groups: [],
      }),
    ).rejects.toThrow(
      "sync_tray_model_shortcuts 尚未接入真实托盘 current 通道，收到 electron-host-diagnostic 诊断返回。",
    );
  });
});
