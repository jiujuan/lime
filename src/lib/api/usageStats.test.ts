import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getDailyUsageTrends,
  getModelUsageRanking,
  getUsageStats,
} from "./usageStats";

const appServerMocks = vi.hoisted(() => ({
  readUsageStats: vi.fn(),
  listUsageStatsModelRanking: vi.fn(),
  listUsageStatsDailyTrends: vi.fn(),
}));

vi.mock("./appServer", () => ({
  APP_SERVER_METHOD_USAGE_STATS_READ: "usageStats/read",
  APP_SERVER_METHOD_USAGE_STATS_MODEL_RANKING_LIST:
    "usageStats/modelRanking/list",
  APP_SERVER_METHOD_USAGE_STATS_DAILY_TRENDS_LIST:
    "usageStats/dailyTrends/list",
  createAppServerClient: () => appServerMocks,
}));

describe("usageStats API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("应通过 App Server current 查询使用统计", async () => {
    appServerMocks.readUsageStats.mockResolvedValueOnce({
      result: {
        stats: {
          totalConversations: 1,
          totalMessages: 2,
          totalTokens: 3,
          totalTimeMinutes: 4,
          monthlyConversations: 1,
          monthlyMessages: 2,
          monthlyTokens: 3,
          todayConversations: 1,
          todayMessages: 2,
          todayTokens: 3,
        },
      },
    });
    appServerMocks.listUsageStatsModelRanking.mockResolvedValueOnce({
      result: {
        ranking: [
          { model: "gpt-4.1", conversations: 1, tokens: 3, percentage: 100 },
        ],
      },
    });
    appServerMocks.listUsageStatsDailyTrends.mockResolvedValueOnce({
      result: {
        trends: [{ date: "2025-01-01", conversations: 1, tokens: 3 }],
      },
    });

    await expect(getUsageStats("month")).resolves.toEqual({
      total_conversations: 1,
      total_messages: 2,
      total_tokens: 3,
      total_time_minutes: 4,
      monthly_conversations: 1,
      monthly_messages: 2,
      monthly_tokens: 3,
      today_conversations: 1,
      today_messages: 2,
      today_tokens: 3,
    });
    await expect(getModelUsageRanking("month")).resolves.toEqual([
      expect.objectContaining({ model: "gpt-4.1" }),
    ]);
    await expect(getDailyUsageTrends("month")).resolves.toEqual([
      expect.objectContaining({ date: "2025-01-01" }),
    ]);
    expect(appServerMocks.readUsageStats).toHaveBeenCalledWith({
      timeRange: "month",
    });
    expect(appServerMocks.listUsageStatsModelRanking).toHaveBeenCalledWith({
      timeRange: "month",
    });
    expect(appServerMocks.listUsageStatsDailyTrends).toHaveBeenCalledWith({
      timeRange: "month",
    });
  });

  it("应拒绝 usage stats 非统计对象返回", async () => {
    appServerMocks.readUsageStats.mockResolvedValueOnce({
      result: {
        stats: {
          success: true,
        },
      },
    });

    await expect(getUsageStats("month")).rejects.toThrow(
      "usageStats/read 未返回有效使用统计数据",
    );
  });

  it("应拒绝 model usage ranking 非数组或条目缺字段返回", async () => {
    appServerMocks.listUsageStatsModelRanking
      .mockResolvedValueOnce({
        result: {
          ranking: { items: [] },
        },
      })
      .mockResolvedValueOnce({
        result: {
          ranking: [{ model: "gpt-4.1", conversations: 1 }],
        },
      });

    await expect(getModelUsageRanking("month")).rejects.toThrow(
      "usageStats/modelRanking/list 未返回有效模型使用排行",
    );
    await expect(getModelUsageRanking("month")).rejects.toThrow(
      "usageStats/modelRanking/list 未返回有效模型使用排行",
    );
  });

  it("应拒绝 daily usage trends 非数组或条目缺字段返回", async () => {
    appServerMocks.listUsageStatsDailyTrends.mockResolvedValueOnce({
      result: {
        trends: { items: [] },
      },
    });
    appServerMocks.listUsageStatsDailyTrends.mockResolvedValueOnce({
      result: {
        trends: [{ date: "2025-01-01", conversations: 1 }],
      },
    });

    await expect(getDailyUsageTrends("month")).rejects.toThrow(
      "usageStats/dailyTrends/list 未返回有效每日使用趋势",
    );
    await expect(getDailyUsageTrends("month")).rejects.toThrow(
      "usageStats/dailyTrends/list 未返回有效每日使用趋势",
    );
  });
});
