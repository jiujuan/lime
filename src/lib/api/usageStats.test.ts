import { beforeEach, describe, expect, it, vi } from "vitest";
import { safeInvoke } from "@/lib/dev-bridge";
import {
  getDailyUsageTrends,
  getModelUsageRanking,
  getUsageStats,
} from "./usageStats";

vi.mock("@/lib/dev-bridge", () => ({
  safeInvoke: vi.fn(),
}));

describe("usageStats API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("应代理使用统计查询命令", async () => {
    vi.mocked(safeInvoke)
      .mockResolvedValueOnce({ total_conversations: 1 })
      .mockResolvedValueOnce([{ model: "gpt-4.1", conversations: 1 }])
      .mockResolvedValueOnce([{ date: "2025-01-01", conversations: 1 }]);

    await expect(getUsageStats("month")).resolves.toEqual(
      expect.objectContaining({ total_conversations: 1 }),
    );
    await expect(getModelUsageRanking("month")).resolves.toEqual([
      expect.objectContaining({ model: "gpt-4.1" }),
    ]);
    await expect(getDailyUsageTrends("month")).resolves.toEqual([
      expect.objectContaining({ date: "2025-01-01" }),
    ]);
  });

  it("应拒绝 Electron Host usage stats degraded 诊断返回", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce({
      total_conversations: 0,
      total_messages: 0,
      total_tokens: 0,
      total_time_minutes: 0,
      monthly_conversations: 0,
      monthly_messages: 0,
      monthly_tokens: 0,
      today_conversations: 0,
      today_messages: 0,
      today_tokens: 0,
      diagnostic: {
        command: "get_usage_stats",
        category: "electron-diagnostic-facade",
      },
    });

    await expect(getUsageStats("month")).rejects.toThrow(
      "get_usage_stats 尚未接入真实 Usage Stats current 通道",
    );
  });

  it("应拒绝 Electron Host ranking/trends empty diagnostic list", async () => {
    vi.mocked(safeInvoke)
      .mockResolvedValueOnce({
        items: [],
        diagnostic: {
          command: "get_model_usage_ranking",
          source: "electron-empty-diagnostic",
        },
      })
      .mockResolvedValueOnce({
        items: [],
        diagnostic: {
          command: "get_daily_usage_trends",
          source: "electron-empty-diagnostic",
        },
      });

    await expect(getModelUsageRanking("month")).rejects.toThrow(
      "get_model_usage_ranking 尚未接入真实 Usage Stats current 通道",
    );
    await expect(getDailyUsageTrends("month")).rejects.toThrow(
      "get_daily_usage_trends 尚未接入真实 Usage Stats current 通道",
    );
  });
});
