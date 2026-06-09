import { beforeEach, describe, expect, it, vi } from "vitest";
import { safeInvoke } from "@/lib/dev-bridge";
import { isOptionalLegacyUxCommandAvailable } from "@/lib/dev-bridge/commandPolicy";
import { listHintRoutes } from "./hintRoutes";

vi.mock("@/lib/dev-bridge", () => ({
  safeInvoke: vi.fn(),
}));

vi.mock("@/lib/dev-bridge/commandPolicy", () => ({
  isOptionalLegacyUxCommandAvailable: vi.fn(),
}));

describe("hintRoutes API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Electron host 不支持可选旧提示路由时返回空数组", async () => {
    vi.mocked(isOptionalLegacyUxCommandAvailable).mockReturnValue(false);

    await expect(listHintRoutes()).resolves.toEqual([]);

    expect(safeInvoke).not.toHaveBeenCalled();
  });

  it("通过 API 网关读取提示路由", async () => {
    vi.mocked(isOptionalLegacyUxCommandAvailable).mockReturnValue(true);
    vi.mocked(safeInvoke).mockResolvedValueOnce([
      {
        hint: "快",
        provider: "openai",
        model: "gpt-4.1-mini",
      },
    ]);

    await expect(listHintRoutes()).resolves.toEqual([
      {
        hint: "快",
        provider: "openai",
        model: "gpt-4.1-mini",
      },
    ]);

    expect(safeInvoke).toHaveBeenCalledWith("get_hint_routes");
  });

  it("旧命令返回非数组时应 fail closed", async () => {
    vi.mocked(isOptionalLegacyUxCommandAvailable).mockReturnValue(true);
    vi.mocked(safeInvoke).mockResolvedValueOnce(null);

    await expect(listHintRoutes()).rejects.toThrow(
      "get_hint_routes did not return hint routes",
    );
  });

  it("旧命令返回 diagnostic facade 时应 fail closed", async () => {
    vi.mocked(isOptionalLegacyUxCommandAvailable).mockReturnValue(true);
    vi.mocked(safeInvoke).mockResolvedValueOnce({
      diagnostic: {
        source: "electron-host-diagnostic",
        status: "degraded",
      },
    });

    await expect(listHintRoutes()).rejects.toThrow(
      "get_hint_routes 尚未接入真实提示路由 current 通道，收到 electron-host-diagnostic 诊断返回。",
    );
  });

  it("旧命令返回 error envelope 时应 fail closed", async () => {
    vi.mocked(isOptionalLegacyUxCommandAvailable).mockReturnValue(true);
    vi.mocked(safeInvoke)
      .mockResolvedValueOnce({
        error: "Electron host command is not supported: get_hint_routes",
      })
      .mockResolvedValueOnce([
        {
          hint: "快",
          provider: "openai",
          model: "gpt-4.1-mini",
          error: "fallback route",
        },
      ]);

    await expect(listHintRoutes()).rejects.toThrow(
      "get_hint_routes returned an error envelope",
    );
    await expect(listHintRoutes()).rejects.toThrow(
      "get_hint_routes returned an error envelope",
    );
  });
});
