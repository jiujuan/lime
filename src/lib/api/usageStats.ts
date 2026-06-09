import {
  APP_SERVER_METHOD_USAGE_STATS_DAILY_TRENDS_LIST,
  APP_SERVER_METHOD_USAGE_STATS_MODEL_RANKING_LIST,
  APP_SERVER_METHOD_USAGE_STATS_READ,
  createAppServerClient,
} from "./appServer";

export interface UsageStatsResponse {
  total_conversations: number;
  total_messages: number;
  total_tokens: number;
  total_time_minutes: number;
  monthly_conversations: number;
  monthly_messages: number;
  monthly_tokens: number;
  today_conversations: number;
  today_messages: number;
  today_tokens: number;
}

export interface ModelUsage {
  model: string;
  conversations: number;
  tokens: number;
  percentage: number;
}

export interface DailyUsage {
  date: string;
  conversations: number;
  tokens: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export async function getUsageStats(
  timeRange: string,
): Promise<UsageStatsResponse> {
  const result = (await createAppServerClient().readUsageStats({ timeRange }))
    .result.stats;
  if (
    !isRecord(result) ||
    !isNumber(result.totalConversations) ||
    !isNumber(result.totalMessages) ||
    !isNumber(result.totalTokens) ||
    !isNumber(result.totalTimeMinutes) ||
    !isNumber(result.monthlyConversations) ||
    !isNumber(result.monthlyMessages) ||
    !isNumber(result.monthlyTokens) ||
    !isNumber(result.todayConversations) ||
    !isNumber(result.todayMessages) ||
    !isNumber(result.todayTokens)
  ) {
    throw new Error(
      `${APP_SERVER_METHOD_USAGE_STATS_READ} 未返回有效使用统计数据`,
    );
  }
  return {
    total_conversations: result.totalConversations,
    total_messages: result.totalMessages,
    total_tokens: result.totalTokens,
    total_time_minutes: result.totalTimeMinutes,
    monthly_conversations: result.monthlyConversations,
    monthly_messages: result.monthlyMessages,
    monthly_tokens: result.monthlyTokens,
    today_conversations: result.todayConversations,
    today_messages: result.todayMessages,
    today_tokens: result.todayTokens,
  };
}

export async function getModelUsageRanking(
  timeRange: string,
): Promise<ModelUsage[]> {
  const result = (
    await createAppServerClient().listUsageStatsModelRanking({ timeRange })
  ).result.ranking;
  if (
    !Array.isArray(result) ||
    result.some(
      (item) =>
        !isRecord(item) ||
        !isString(item.model) ||
        !isNumber(item.conversations) ||
        !isNumber(item.tokens) ||
        !isNumber(item.percentage),
    )
  ) {
    throw new Error(
      `${APP_SERVER_METHOD_USAGE_STATS_MODEL_RANKING_LIST} 未返回有效模型使用排行`,
    );
  }
  return result as ModelUsage[];
}

export async function getDailyUsageTrends(
  timeRange: string,
): Promise<DailyUsage[]> {
  const result = (
    await createAppServerClient().listUsageStatsDailyTrends({ timeRange })
  ).result.trends;
  if (
    !Array.isArray(result) ||
    result.some(
      (item) =>
        !isRecord(item) ||
        !isString(item.date) ||
        !isNumber(item.conversations) ||
        !isNumber(item.tokens),
    )
  ) {
    throw new Error(
      `${APP_SERVER_METHOD_USAGE_STATS_DAILY_TRENDS_LIST} 未返回有效每日使用趋势`,
    );
  }
  return result as DailyUsage[];
}
