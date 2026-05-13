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
  });
});
