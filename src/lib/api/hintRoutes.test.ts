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

  it("旧命令返回非数组时 fail closed 为空数组", async () => {
    vi.mocked(isOptionalLegacyUxCommandAvailable).mockReturnValue(true);
    vi.mocked(safeInvoke).mockResolvedValueOnce(null);

    await expect(listHintRoutes()).resolves.toEqual([]);
  });
});
