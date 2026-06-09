import { beforeEach, describe, expect, it, vi } from "vitest";
import { safeInvoke } from "@/lib/dev-bridge";
import {
  getExperimentalConfig,
  saveExperimentalConfig,
} from "./experimentalFeatures";

vi.mock("@/lib/dev-bridge", () => ({
  safeInvoke: vi.fn(),
}));

describe("experimentalFeatures API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("应代理实验配置读取与保存", async () => {
    vi.mocked(safeInvoke)
      .mockResolvedValueOnce({
        webmcp: { enabled: false },
      })
      .mockResolvedValueOnce(undefined);

    await expect(getExperimentalConfig()).resolves.toEqual(
      expect.objectContaining({
        webmcp: expect.any(Object),
      }),
    );
    await expect(
      saveExperimentalConfig({
        webmcp: { enabled: true },
      }),
    ).resolves.toBeUndefined();
    expect(safeInvoke).toHaveBeenNthCalledWith(1, "get_experimental_config");
    expect(safeInvoke).toHaveBeenNthCalledWith(2, "save_experimental_config", {
      experimentalConfig: {
        webmcp: { enabled: true },
      },
    });
  });

  it("读取实验配置遇到 diagnostic facade 时应 fail closed", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce({
      diagnostic: {
        command: "get_experimental_config",
        source: "electron",
      },
    });

    await expect(getExperimentalConfig()).rejects.toThrow(
      "get_experimental_config 尚未接入真实 Experimental config current 通道",
    );
  });

  it("读取实验配置遇到非配置对象时应 fail closed", async () => {
    vi.mocked(safeInvoke)
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({
        error: {
          code: "COMMAND_UNSUPPORTED",
          message: "not available",
        },
      })
      .mockResolvedValueOnce({ webmcp: {} });

    await expect(getExperimentalConfig()).rejects.toThrow(
      "get_experimental_config did not return experimental config",
    );
    await expect(getExperimentalConfig()).rejects.toThrow(
      "get_experimental_config did not return experimental config",
    );
    await expect(getExperimentalConfig()).rejects.toThrow(
      "get_experimental_config did not return experimental config",
    );
  });

  it("保存实验配置遇到 diagnostic facade 时应 fail closed", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce({
      diagnostic: {
        command: "save_experimental_config",
        source: "electron",
      },
    });

    await expect(
      saveExperimentalConfig({
        webmcp: { enabled: true },
      }),
    ).rejects.toThrow(
      "save_experimental_config 尚未接入真实 Experimental config current 通道",
    );
  });

  it("保存实验配置遇到 mock-like 返回时应 fail closed", async () => {
    vi.mocked(safeInvoke)
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({
        error: {
          code: "COMMAND_UNSUPPORTED",
          message: "not available",
        },
      });

    await expect(
      saveExperimentalConfig({
        webmcp: { enabled: true },
      }),
    ).rejects.toThrow("save_experimental_config did not return void result");
    await expect(
      saveExperimentalConfig({
        webmcp: { enabled: true },
      }),
    ).rejects.toThrow("save_experimental_config did not return void result");
  });
});
