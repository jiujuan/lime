/**
 * 数据统计页面组件
 *
 * 采用设置首页一致的浅渐变摘要头图与信息面板布局，
 * 聚合使用强度、模型分布与趋势信息。
 */

import { useState, useEffect, useCallback } from "react";
import type { TFunction } from "i18next";
import { BarChart3, Brain, CalendarDays, Coins, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { WorkbenchInfoTip } from "@/components/media/WorkbenchInfoTip";
import {
  formatDate as formatLocaleDate,
  formatNumber as formatLocaleNumber,
} from "@/i18n/format";
import { cn } from "@/lib/utils";
import {
  getDailyUsageTrends,
  getModelUsageRanking,
  getUsageStats,
  type DailyUsage,
  type ModelUsage,
  type UsageStatsResponse,
} from "@/lib/api/usageStats";

type TimeRange = "week" | "month" | "all";

interface TimeRangeOption {
  key: TimeRange;
}

interface SegmentCardProps {
  title: string;
  description: string;
  conversations: number;
  messages: number;
  tokens: number;
  minutes: number;
  accentClassName: string;
}

const TIME_RANGE_OPTIONS: TimeRangeOption[] = [
  { key: "week" },
  { key: "month" },
  { key: "all" },
];

const WEEKDAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
const ACTIVE_TIME_RANGE_BUTTON_CLASS =
  "border-emerald-200 bg-[linear-gradient(135deg,rgba(240,253,250,0.98)_0%,rgba(236,253,245,0.96)_52%,rgba(224,242,254,0.95)_100%)] text-slate-800 shadow-sm shadow-emerald-950/10";
const PROGRESS_BAR_FILL_CLASS =
  "bg-[linear-gradient(90deg,#14b8a6_0%,#10b981_100%)]";

function formatCompactNumber(num: number, locale?: string): string {
  return formatLocaleNumber(num, {
    locale,
    notation: "compact",
    maximumFractionDigits: 1,
  });
}

function formatTime(
  minutes: number,
  t: TFunction<"settings", undefined>,
): string {
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return t("settings.stats.duration.hoursMinutes", {
      hours,
      minutes: mins,
    });
  }
  return t("settings.stats.duration.minutes", {
    minutes,
  });
}

function parseUsageDate(date: string) {
  return new Date(date.includes("T") ? date : `${date}T00:00:00`);
}

function formatShortDate(date: string, locale?: string) {
  return formatLocaleDate(parseUsageDate(date), {
    locale,
    month: "numeric",
    day: "numeric",
  });
}

function estimateMinutesFromTokens(
  tokens: number,
  totalTokens: number,
  totalMinutes: number,
) {
  if (tokens <= 0 || totalTokens <= 0 || totalMinutes <= 0) {
    return 0;
  }

  return Math.round((tokens / totalTokens) * totalMinutes);
}

function resolveHeatmapTone(tokens: number, maxTokens: number) {
  if (tokens <= 0 || maxTokens <= 0) {
    return "bg-slate-100";
  }

  const ratio = tokens / maxTokens;
  if (ratio < 0.2) return "bg-emerald-100";
  if (ratio < 0.4) return "bg-emerald-200";
  if (ratio < 0.6) return "bg-emerald-300";
  if (ratio < 0.8) return "bg-emerald-400";
  return "bg-emerald-500";
}

function SegmentCard({
  title,
  description,
  conversations,
  messages,
  tokens,
  minutes,
  accentClassName,
}: SegmentCardProps) {
  const { t, i18n } = useTranslation("settings");

  return (
    <article className="rounded-[24px] border border-slate-200/80 bg-slate-50/60 p-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium",
              accentClassName,
            )}
          >
            {title}
          </span>
          <WorkbenchInfoTip
            ariaLabel={t("settings.stats.segment.tipAria", {
              title,
            })}
            content={description}
            tone="slate"
          />
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-500">
            {t("settings.stats.segment.messages", {
              count: messages,
            })}
          </span>
        </div>

        <div className="flex flex-wrap gap-2">
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600">
            {t("settings.stats.segment.conversations", {
              count: conversations,
            })}
          </span>
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600">
            {t("settings.stats.segment.tokens", {
              tokens: formatCompactNumber(tokens, i18n.language),
            })}
          </span>
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600">
            {t("settings.stats.segment.duration", {
              duration: formatTime(minutes, t),
            })}
          </span>
        </div>
      </div>
    </article>
  );
}

export function StatsSettings() {
  const { t, i18n } = useTranslation("settings");
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<UsageStatsResponse | null>(null);
  const [modelUsage, setModelUsage] = useState<ModelUsage[]>([]);
  const [dailyUsage, setDailyUsage] = useState<DailyUsage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRange>("month");
  const timeRangeOptions = TIME_RANGE_OPTIONS.map((option) => ({
    ...option,
    label: t(`settings.stats.range.${option.key}.label`),
    description: t(`settings.stats.range.${option.key}.description`),
  }));
  const weekdayLabels = WEEKDAY_KEYS.map((key) =>
    t(`settings.stats.weekday.${key}`),
  );

  const loadStats = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [usageStats, ranking, trends] = await Promise.all([
        getUsageStats(timeRange),
        getModelUsageRanking(timeRange),
        getDailyUsageTrends(timeRange),
      ]);

      setStats(usageStats);
      setModelUsage(ranking);
      setDailyUsage(trends);
    } catch (e) {
      console.error("加载统计数据失败:", e);
      setError(t("settings.stats.error.load"));
      setStats(null);
      setModelUsage([]);
      setDailyUsage([]);
    } finally {
      setLoading(false);
    }
  }, [t, timeRange]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const maxDailyTokens =
    dailyUsage.length > 0
      ? Math.max(...dailyUsage.map((day) => day.tokens))
      : 0;
  const totalRangeTokens = dailyUsage.reduce((sum, day) => sum + day.tokens, 0);
  const totalRangeConversations = dailyUsage.reduce(
    (sum, day) => sum + day.conversations,
    0,
  );
  const activeDays = dailyUsage.filter(
    (day) => day.tokens > 0 || day.conversations > 0,
  ).length;
  const averageDailyTokens =
    activeDays > 0 ? Math.round(totalRangeTokens / activeDays) : 0;
  const peakDay = dailyUsage.reduce<DailyUsage | null>((currentPeak, day) => {
    if (!currentPeak || day.tokens > currentPeak.tokens) {
      return day;
    }
    return currentPeak;
  }, null);
  const topModel = modelUsage[0] || null;
  const secondaryModels = modelUsage.slice(1, 4);
  const selectedRange =
    timeRangeOptions.find((option) => option.key === timeRange) ||
    timeRangeOptions[1];
  const peakDayLabel = peakDay
    ? t("settings.stats.peakDay.value", {
        date: formatShortDate(peakDay.date, i18n.language),
        tokens: formatCompactNumber(peakDay.tokens, i18n.language),
      })
    : t("settings.stats.empty.noData");
  const chartGuideValues =
    maxDailyTokens > 0
      ? [1, 0.75, 0.5, 0.25, 0].map((ratio) =>
          Math.round(maxDailyTokens * ratio),
        )
      : [0, 0, 0, 0, 0];
  const trendLabelStep =
    dailyUsage.length > 10 ? Math.ceil(dailyUsage.length / 7) : 1;
  const heatmapDays = dailyUsage.slice(-35);
  const heatmapRangeLabel =
    heatmapDays.length > 0
      ? t("settings.stats.heatmap.rangeValue", {
          start: formatShortDate(heatmapDays[0].date, i18n.language),
          end: formatShortDate(
            heatmapDays[heatmapDays.length - 1].date,
            i18n.language,
          ),
        })
      : t("settings.stats.empty.noActivity");
  const heatmapCells: Array<DailyUsage | null> = [
    ...Array.from({ length: Math.max(35 - heatmapDays.length, 0) }, () => null),
    ...heatmapDays,
  ];
  const isInitialLoading = loading && !stats && !error;

  if (isInitialLoading) {
    return (
      <div className="space-y-6 pb-8">
        <div className="h-[132px] animate-pulse rounded-[26px] border border-slate-200/80 bg-white" />
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.95fr)]">
          <div className="h-[398px] animate-pulse rounded-[26px] border border-slate-200/80 bg-white" />
          <div className="space-y-6">
            <div className="h-[260px] animate-pulse rounded-[26px] border border-slate-200/80 bg-white" />
            <div className="h-[220px] animate-pulse rounded-[26px] border border-slate-200/80 bg-white" />
          </div>
        </div>
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.95fr)]">
          <div className="h-[320px] animate-pulse rounded-[26px] border border-slate-200/80 bg-white" />
          <div className="h-[320px] animate-pulse rounded-[26px] border border-slate-200/80 bg-white" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-8">
      {error && (
        <div className="flex items-center justify-between gap-4 rounded-[20px] border border-rose-200 bg-rose-50/90 px-4 py-3 text-sm text-rose-700 shadow-sm shadow-slate-950/5">
          <span>{error}</span>
          <button
            type="button"
            onClick={loadStats}
            className="rounded-full border border-rose-200 bg-white px-3 py-1.5 text-xs font-medium text-rose-700 transition hover:border-rose-300 hover:bg-rose-50"
          >
            {t("settings.stats.action.reload")}
          </button>
        </div>
      )}

      <section className="rounded-[26px] border border-slate-200/80 bg-white px-5 py-4 shadow-sm shadow-slate-950/5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-[24px] font-semibold tracking-tight text-slate-900">
                {t("settings.stats.hero.title")}
              </h1>
              <WorkbenchInfoTip
                ariaLabel={t("settings.stats.hero.tipAria")}
                content={t("settings.stats.hero.tip")}
                tone="mint"
              />
            </div>
            <p className="text-sm text-slate-500">
              {t("settings.stats.hero.subtitle")}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 xl:justify-end">
            {timeRangeOptions.map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => setTimeRange(option.key)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-sm font-medium transition",
                  timeRange === option.key
                    ? ACTIVE_TIME_RANGE_BUTTON_CLASS
                    : "border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300 hover:text-slate-900",
                )}
              >
                {option.label}
              </button>
            ))}

            <button
              type="button"
              onClick={loadStats}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-70"
            >
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
              {t("settings.stats.action.refresh")}
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-4 rounded-[20px] border border-slate-200/80 bg-slate-50/60 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-500">
                {t("settings.stats.summary.range", {
                  range: selectedRange.label,
                })}
              </span>
              <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-500">
                {t("settings.stats.summary.activeDays", {
                  count: activeDays,
                })}
              </span>
              <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-500">
                {t("settings.stats.summary.averageTokens", {
                  tokens: formatCompactNumber(
                    averageDailyTokens,
                    i18n.language,
                  ),
                })}
              </span>
              <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-500">
                {t("settings.stats.summary.rangeTokens", {
                  tokens: formatCompactNumber(totalRangeTokens, i18n.language),
                })}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs leading-5 text-slate-500">
              <span>{t("settings.stats.observation.title")}</span>
              <WorkbenchInfoTip
                ariaLabel={t("settings.stats.observation.tipAria")}
                content={t("settings.stats.observation.tip")}
                tone="slate"
              />
              <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-500">
                {t("settings.stats.observation.topModel", {
                  model: topModel?.model || t("settings.stats.empty.noData"),
                })}
              </span>
              <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-500">
                {t("settings.stats.observation.peak", {
                  peak: peakDayLabel,
                })}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs leading-5 text-slate-500">
            <span>{t("settings.stats.summary.rangeTipInline")}</span>
            <WorkbenchInfoTip
              ariaLabel={t("settings.stats.summary.rangeTipAria")}
              content={selectedRange.description}
              tone="slate"
            />
          </div>
        </div>
      </section>

      {stats ? (
        <>
          <section className="grid gap-6 xl:grid-cols-[minmax(0,1.72fr)_minmax(360px,0.82fr)]">
            <article className="rounded-[26px] border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-950/5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <BarChart3 className="h-4 w-4 text-sky-600" />
                    {t("settings.stats.overview.title")}
                    <WorkbenchInfoTip
                      ariaLabel={t("settings.stats.overview.tipAria")}
                      content={t("settings.stats.overview.tip")}
                      tone="slate"
                    />
                  </div>
                </div>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-500">
                  {t("settings.stats.overview.segmentCount", {
                    count: 3,
                  })}
                </span>
              </div>

              <div className="mt-5 space-y-4">
                <SegmentCard
                  title={t("settings.stats.segment.today.title")}
                  description={t("settings.stats.segment.today.description")}
                  conversations={stats.today_conversations}
                  messages={stats.today_messages}
                  tokens={stats.today_tokens}
                  minutes={estimateMinutesFromTokens(
                    stats.today_tokens,
                    stats.total_tokens,
                    stats.total_time_minutes,
                  )}
                  accentClassName="border-sky-200 bg-sky-50 text-sky-700"
                />
                <SegmentCard
                  title={t("settings.stats.segment.month.title")}
                  description={t("settings.stats.segment.month.description")}
                  conversations={stats.monthly_conversations}
                  messages={stats.monthly_messages}
                  tokens={stats.monthly_tokens}
                  minutes={estimateMinutesFromTokens(
                    stats.monthly_tokens,
                    stats.total_tokens,
                    stats.total_time_minutes,
                  )}
                  accentClassName="border-emerald-200 bg-emerald-50 text-emerald-700"
                />
                <SegmentCard
                  title={t("settings.stats.segment.total.title")}
                  description={t("settings.stats.segment.total.description")}
                  conversations={stats.total_conversations}
                  messages={stats.total_messages}
                  tokens={stats.total_tokens}
                  minutes={stats.total_time_minutes}
                  accentClassName="border-slate-200 bg-slate-100 text-slate-700"
                />
              </div>
            </article>

            <div className="space-y-6">
              <article className="rounded-[26px] border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-950/5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                      <Brain className="h-4 w-4 text-emerald-600" />
                      {t("settings.stats.models.title")}
                      <WorkbenchInfoTip
                        ariaLabel={t("settings.stats.models.tipAria")}
                        content={t("settings.stats.models.tip")}
                        tone="slate"
                      />
                    </div>
                  </div>
                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                    {t("settings.stats.models.count", {
                      count: modelUsage.length,
                    })}
                  </span>
                </div>

                <div className="mt-5 space-y-4">
                  {modelUsage.length > 0 ? (
                    <>
                      <article className="rounded-[20px] border border-slate-200/80 bg-slate-50/70 p-4">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-medium text-emerald-700">
                                {t("settings.stats.models.primaryBadge")}
                              </span>
                              <p className="truncate text-base font-semibold text-slate-900">
                                {topModel?.model}
                              </p>
                            </div>
                            <p className="mt-2 text-sm leading-6 text-slate-500">
                              {t("settings.stats.models.itemMeta", {
                                conversations: topModel?.conversations || 0,
                                tokens: formatCompactNumber(
                                  topModel?.tokens || 0,
                                  i18n.language,
                                ),
                              })}
                            </p>
                          </div>

                          <div className="flex flex-wrap gap-2 lg:justify-end">
                            <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600">
                              {t("settings.stats.models.usageShare", {
                                percent: topModel?.percentage || 0,
                              })}
                            </span>
                            <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600">
                              {t("settings.stats.models.rank", {
                                rank: 1,
                              })}
                            </span>
                          </div>
                        </div>

                        <div className="mt-4 h-2 overflow-hidden rounded-full bg-white">
                          <div
                            className={cn(
                              "h-full rounded-full transition-all",
                              PROGRESS_BAR_FILL_CLASS,
                            )}
                            style={{
                              width: `${Math.min(topModel?.percentage || 0, 100)}%`,
                            }}
                          />
                        </div>
                      </article>

                      {secondaryModels.length > 0 ? (
                        <div className="space-y-3">
                          {secondaryModels.map((model, index) => (
                            <div
                              key={model.model}
                              className="rounded-[20px] border border-slate-200/80 bg-slate-50/60 p-4"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-500">
                                      #{index + 2}
                                    </span>
                                    <p className="truncate text-sm font-semibold text-slate-900">
                                      {model.model}
                                    </p>
                                  </div>
                                  <p className="mt-2 text-xs leading-5 text-slate-500">
                                    {t("settings.stats.models.itemMeta", {
                                      conversations: model.conversations,
                                      tokens: formatCompactNumber(
                                        model.tokens,
                                        i18n.language,
                                      ),
                                    })}
                                  </p>
                                </div>
                                <span className="text-sm font-semibold text-slate-900">
                                  {model.percentage}%
                                </span>
                              </div>
                              <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                                <div
                                  className={cn(
                                    "h-full rounded-full transition-all",
                                    PROGRESS_BAR_FILL_CLASS,
                                  )}
                                  style={{
                                    width: `${Math.min(model.percentage, 100)}%`,
                                  }}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <div className="rounded-[20px] border border-dashed border-slate-300 bg-slate-50/60 px-4 py-6 text-sm leading-6 text-slate-500">
                      {t("settings.stats.models.empty")}
                    </div>
                  )}
                </div>
              </article>
            </div>
          </section>

          <section className="grid gap-6 xl:grid-cols-[minmax(0,1.72fr)_minmax(360px,0.82fr)]">
            <article className="rounded-[26px] border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-950/5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <Coins className="h-4 w-4 text-emerald-600" />
                    {t("settings.stats.trends.title")}
                    <WorkbenchInfoTip
                      ariaLabel={t("settings.stats.trends.tipAria")}
                      content={t("settings.stats.trends.tip", {
                        range: selectedRange.label,
                      })}
                      tone="slate"
                    />
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
                    {formatCompactNumber(totalRangeTokens, i18n.language)} Token
                  </span>
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
                    {t("settings.stats.trends.conversations", {
                      count: totalRangeConversations,
                    })}
                  </span>
                </div>
              </div>

              {dailyUsage.length > 0 ? (
                <div className="mt-6 rounded-[24px] border border-slate-200/80 bg-slate-50/60 p-4">
                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600">
                      {t("settings.stats.trends.peakDay", {
                        peak: peakDayLabel,
                      })}
                    </span>
                    <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600">
                      {t("settings.stats.trends.activeDays", {
                        count: activeDays,
                      })}
                    </span>
                    <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600">
                      {t("settings.stats.trends.average", {
                        tokens: formatCompactNumber(
                          averageDailyTokens,
                          i18n.language,
                        ),
                      })}
                    </span>
                  </div>

                  <div className="mt-6 grid grid-cols-[44px_minmax(0,1fr)] gap-3">
                    <div className="relative h-64">
                      {chartGuideValues.map((value, index) => (
                        <div
                          key={`${value}-${index}`}
                          className="absolute right-0 translate-y-1/2 text-[10px] font-medium text-slate-400"
                          style={{
                            bottom: `${(index / (chartGuideValues.length - 1)) * 100}%`,
                          }}
                        >
                          {formatCompactNumber(value, i18n.language)}
                        </div>
                      ))}
                    </div>

                    <div className="relative h-64">
                      <div className="pointer-events-none absolute inset-0">
                        {chartGuideValues.map((_, index) => (
                          <div
                            key={index}
                            className="absolute inset-x-0 border-t border-dashed border-slate-200"
                            style={{
                              bottom: `${(index / (chartGuideValues.length - 1)) * 100}%`,
                            }}
                          />
                        ))}
                      </div>

                      <div className="relative flex h-full items-end gap-2">
                        {dailyUsage.map((day, index) => {
                          const height =
                            maxDailyTokens > 0
                              ? (day.tokens / maxDailyTokens) * 100
                              : 0;
                          const showLabel =
                            index % trendLabelStep === 0 ||
                            index === dailyUsage.length - 1;

                          return (
                            <div
                              key={day.date}
                              className="group flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2"
                            >
                              <div className="relative flex w-full flex-1 items-end rounded-[16px] border border-white/90 bg-white/80 px-1.5 pb-1.5 shadow-sm">
                                <div
                                  className="w-full rounded-[12px] bg-[linear-gradient(180deg,rgba(15,23,42,0.72)_0%,rgba(15,23,42,0.96)_100%)] transition-all group-hover:brightness-105"
                                  style={{ height: `${Math.max(height, 6)}%` }}
                                >
                                  <div className="absolute -top-8 left-1/2 -translate-x-1/2 rounded-full border border-slate-200 bg-white px-2 py-1 text-[10px] font-medium text-slate-600 opacity-0 shadow-sm transition-opacity group-hover:opacity-100 whitespace-nowrap">
                                    {formatCompactNumber(
                                      day.tokens,
                                      i18n.language,
                                    )}{" "}
                                    Token
                                  </div>
                                </div>
                              </div>
                              <div className="h-4 text-[10px] text-slate-400">
                                {showLabel
                                  ? formatShortDate(day.date, i18n.language)
                                  : ""}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mt-6 rounded-[22px] border border-dashed border-slate-300 bg-slate-50/60 px-4 py-10 text-center text-sm leading-6 text-slate-500">
                  {t("settings.stats.trends.empty")}
                </div>
              )}
            </article>

            <article className="rounded-[26px] border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-950/5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <CalendarDays className="h-4 w-4 text-sky-600" />
                    {t("settings.stats.heatmap.title")}
                    <WorkbenchInfoTip
                      ariaLabel={t("settings.stats.heatmap.tipAria")}
                      content={t("settings.stats.heatmap.tip")}
                      tone="slate"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <span>{t("settings.stats.heatmap.less")}</span>
                  <div className="flex gap-1">
                    <div className="h-3 w-3 rounded-sm bg-emerald-100" />
                    <div className="h-3 w-3 rounded-sm bg-emerald-200" />
                    <div className="h-3 w-3 rounded-sm bg-emerald-300" />
                    <div className="h-3 w-3 rounded-sm bg-emerald-400" />
                    <div className="h-3 w-3 rounded-sm bg-emerald-500" />
                  </div>
                  <span>{t("settings.stats.heatmap.more")}</span>
                </div>
              </div>

              <div className="mt-6 rounded-[24px] border border-slate-200/80 bg-slate-50/60 p-4">
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600">
                    {t("settings.stats.heatmap.range", {
                      range: heatmapRangeLabel,
                    })}
                  </span>
                  <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600">
                    {t("settings.stats.heatmap.activeCells", {
                      count: activeDays,
                    })}
                  </span>
                </div>

                <div className="mt-5 grid grid-cols-7 gap-2">
                  {weekdayLabels.map((day) => (
                    <div
                      key={day}
                      className="pb-1 text-center text-[11px] font-medium text-slate-400"
                    >
                      {day}
                    </div>
                  ))}
                  {heatmapCells.map((day, index) => (
                    <div
                      key={`${day?.date || "empty"}-${index}`}
                      className={cn(
                        "group relative aspect-square rounded-[10px] border border-white/80 shadow-sm transition-transform hover:-translate-y-0.5",
                        day
                          ? resolveHeatmapTone(day.tokens, maxDailyTokens)
                          : "bg-slate-100",
                      )}
                      title={
                        day
                          ? `${day.date}: ${formatCompactNumber(
                              day.tokens,
                              i18n.language,
                            )} Token`
                          : ""
                      }
                    >
                      {day ? (
                        <div className="pointer-events-none absolute left-1/2 top-0 z-10 -translate-x-1/2 -translate-y-[calc(100%+6px)] rounded-full border border-slate-200 bg-white px-2 py-1 text-[10px] font-medium text-slate-600 opacity-0 shadow-sm transition-opacity group-hover:opacity-100 whitespace-nowrap">
                          {formatShortDate(day.date, i18n.language)} ·{" "}
                          {formatCompactNumber(day.tokens, i18n.language)}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            </article>
          </section>
        </>
      ) : (
        <article className="rounded-[26px] border border-dashed border-slate-300 bg-white/80 px-6 py-12 text-center text-sm leading-6 text-slate-500 shadow-sm shadow-slate-950/5">
          {t("settings.stats.empty.noStats")}
        </article>
      )}
    </div>
  );
}
