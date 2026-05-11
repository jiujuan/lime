/**
 * @file UpdateNotification.tsx
 * @description 更新检查设置组件
 *
 * 用于在设置页面中配置自动更新检查行为。
 * 更新提醒弹窗已移至独立窗口 (src/pages/update-notification.tsx)。
 *
 * input: 用户配置操作
 * output: 更新检查设置 UI
 * pos: components/settings-v2 层
 */

import { useState, useEffect } from "react";
import { Bug } from "lucide-react";
import { useTranslation } from "react-i18next";
import { formatDate, formatNumber } from "@/i18n/format";
import {
  getUpdateCheckSettings,
  getUpdateNotificationMetrics,
  setUpdateCheckSettings,
  testUpdateWindow,
  type UpdateCheckConfig,
  type UpdateNotificationMetrics,
} from "@/lib/api/appUpdate";

/**
 * 更新检查设置组件
 * 用于在设置页面中配置自动更新检查行为
 */
export function UpdateCheckSettings() {
  const { t, i18n } = useTranslation("settings");
  const [settings, setSettings] = useState<UpdateCheckConfig>({
    enabled: true,
    check_interval_hours: 24,
    show_notification: true,
    last_check_timestamp: 0,
    skipped_version: null,
    remind_later_until: null,
  });
  const [metrics, setMetrics] = useState<UpdateNotificationMetrics>({
    shown_count: 0,
    update_now_count: 0,
    remind_later_count: 0,
    skip_version_count: 0,
    dismiss_count: 0,
    update_now_rate: 0,
    remind_later_rate: 0,
    skip_version_rate: 0,
    dismiss_rate: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const configResult = await getUpdateCheckSettings();
      setSettings(configResult);

      try {
        const metricsResult = await getUpdateNotificationMetrics();
        setMetrics(metricsResult);
      } catch (metricsError) {
        console.error("加载更新提醒指标失败:", metricsError);
      }
    } catch (error) {
      console.error("加载更新检查设置失败:", error);
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async (newSettings: UpdateCheckConfig) => {
    try {
      await setUpdateCheckSettings(newSettings);
      setSettings(newSettings);
    } catch (error) {
      console.error("保存更新检查设置失败:", error);
    }
  };

  const handleToggleEnabled = () => {
    saveSettings({ ...settings, enabled: !settings.enabled });
  };

  const handleToggleNotification = () => {
    saveSettings({
      ...settings,
      show_notification: !settings.show_notification,
    });
  };

  const handleIntervalChange = (hours: number) => {
    saveSettings({ ...settings, check_interval_hours: hours });
  };

  const handleClearSkipped = () => {
    saveSettings({ ...settings, skipped_version: null });
  };

  if (loading) {
    return (
      <div className="p-4 rounded-lg border animate-pulse">
        <div className="h-4 bg-muted rounded w-1/3 mb-2"></div>
        <div className="h-3 bg-muted rounded w-2/3"></div>
      </div>
    );
  }

  const switchEnabledClassName =
    "bg-[linear-gradient(135deg,#0ea5e9_0%,#14b8a6_52%,#10b981_100%)]";
  const selectedIntervalClassName =
    "border border-emerald-200 bg-[linear-gradient(135deg,#0ea5e9_0%,#14b8a6_52%,#10b981_100%)] text-white shadow-sm shadow-emerald-950/15";
  const locale = i18n.language;
  const intervalLabel = (hours: number) =>
    hours === 168
      ? t("settings.experimental.updateCheck.interval.weekly", "每周")
      : t("settings.experimental.updateCheck.interval.hours", {
          hours: formatNumber(hours, { locale }),
          defaultValue: "{{hours}}小时",
        });
  const formatTimestamp = (timestamp: number) =>
    formatDate(timestamp * 1000, {
      locale,
      dateStyle: "medium",
      timeStyle: "short",
    });

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-medium">
        {t("settings.experimental.updateCheck.title", "自动更新检查")}
      </h3>

      <div className="space-y-3">
        <div className="flex items-center justify-between p-3 rounded-lg border">
          <div>
            <div className="text-sm font-medium">
              {t(
                "settings.experimental.updateCheck.autoCheck.title",
                "自动检查更新",
              )}
            </div>
            <div className="text-xs text-muted-foreground">
              {t(
                "settings.experimental.updateCheck.autoCheck.description",
                "定期检查是否有新版本可用",
              )}
            </div>
          </div>
          <button
            type="button"
            aria-label={t(
              "settings.experimental.updateCheck.autoCheck.aria",
              "切换自动检查更新",
            )}
            onClick={handleToggleEnabled}
            className={`relative w-11 h-6 rounded-full transition-colors ${
              settings.enabled ? switchEnabledClassName : "bg-muted"
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                settings.enabled ? "translate-x-5" : ""
              }`}
            />
          </button>
        </div>

        <div className="flex items-center justify-between p-3 rounded-lg border">
          <div>
            <div className="text-sm font-medium">
              {t(
                "settings.experimental.updateCheck.notification.title",
                "显示更新通知",
              )}
            </div>
            <div className="text-xs text-muted-foreground">
              {t(
                "settings.experimental.updateCheck.notification.description",
                "发现新版本时显示弹窗提醒",
              )}
            </div>
          </div>
          <button
            type="button"
            aria-label={t(
              "settings.experimental.updateCheck.notification.aria",
              "切换更新通知",
            )}
            onClick={handleToggleNotification}
            disabled={!settings.enabled}
            className={`relative w-11 h-6 rounded-full transition-colors disabled:opacity-50 ${
              settings.show_notification ? switchEnabledClassName : "bg-muted"
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                settings.show_notification ? "translate-x-5" : ""
              }`}
            />
          </button>
        </div>

        <div className="p-3 rounded-lg border">
          <div className="text-sm font-medium mb-2">
            {t(
              "settings.experimental.updateCheck.interval.title",
              "检查间隔",
            )}
          </div>
          <div className="flex gap-2">
            {[12, 24, 48, 168].map((hours) => (
              <button
                key={hours}
                type="button"
                onClick={() => handleIntervalChange(hours)}
                disabled={!settings.enabled}
                className={`px-3 py-1.5 rounded-md text-xs transition-colors disabled:opacity-50 ${
                  settings.check_interval_hours === hours
                    ? selectedIntervalClassName
                    : "bg-muted hover:bg-muted/80"
                }`}
              >
                {intervalLabel(hours)}
              </button>
            ))}
          </div>
        </div>

        {settings.skipped_version && (
          <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
            <div>
              <div className="text-sm">
                {t(
                  "settings.experimental.updateCheck.skippedVersion.title",
                  "已跳过版本",
                )}
              </div>
              <div className="text-xs text-muted-foreground font-mono">
                {settings.skipped_version}
              </div>
            </div>
            <button
              type="button"
              onClick={handleClearSkipped}
              className="px-3 py-1 rounded-md text-xs bg-muted hover:bg-muted/80 transition-colors"
            >
              {t("settings.experimental.updateCheck.action.clear", "清除")}
            </button>
          </div>
        )}

        {settings.last_check_timestamp > 0 && (
          <div className="text-xs text-muted-foreground">
            {t("settings.experimental.updateCheck.lastCheck", {
              time: formatTimestamp(settings.last_check_timestamp),
              defaultValue: "上次检查: {{time}}",
            })}
          </div>
        )}

        {settings.remind_later_until &&
          settings.remind_later_until > Date.now() / 1000 && (
            <div className="text-xs text-muted-foreground">
              {t("settings.experimental.updateCheck.remindLaterUntil", {
                time: formatTimestamp(settings.remind_later_until),
                defaultValue: "已设置稍后提醒至: {{time}}",
              })}
            </div>
          )}

        <div className="p-3 rounded-lg border bg-muted/20 space-y-1">
          <div className="text-sm font-medium">
            {t("settings.experimental.updateCheck.metrics.title", "提醒转化指标")}
          </div>
          <div className="text-xs text-muted-foreground">
            {t("settings.experimental.updateCheck.metrics.updateNow", {
              shown: formatNumber(metrics.shown_count, { locale }),
              updateNow: formatNumber(metrics.update_now_count, { locale }),
              rate: formatNumber(metrics.update_now_rate, { locale }),
              defaultValue: "展示 {{shown}} 次，立即更新 {{updateNow}} 次（{{rate}}%）",
            })}
          </div>
          <div className="text-xs text-muted-foreground">
            {t("settings.experimental.updateCheck.metrics.remindAndSkip", {
              remindLater: formatNumber(metrics.remind_later_count, { locale }),
              remindLaterRate: formatNumber(metrics.remind_later_rate, {
                locale,
              }),
              skipVersion: formatNumber(metrics.skip_version_count, { locale }),
              skipVersionRate: formatNumber(metrics.skip_version_rate, {
                locale,
              }),
              defaultValue:
                "稍后 {{remindLater}} 次（{{remindLaterRate}}%），跳过 {{skipVersion}} 次（{{skipVersionRate}}%）",
            })}
          </div>
          <div className="text-xs text-muted-foreground">
            {t("settings.experimental.updateCheck.metrics.dismiss", {
              dismiss: formatNumber(metrics.dismiss_count, { locale }),
              rate: formatNumber(metrics.dismiss_rate, { locale }),
              defaultValue: "关闭 {{dismiss}} 次（{{rate}}%）",
            })}
          </div>
        </div>

        {import.meta.env.DEV && (
          <button
            type="button"
            onClick={async () => {
              try {
                await testUpdateWindow();
              } catch (error) {
                console.error("测试更新弹窗失败:", error);
              }
            }}
            className="flex items-center justify-center gap-1.5 w-full px-3 py-1.5 rounded-lg border border-dashed border-orange-400 text-orange-600 text-xs hover:bg-orange-50 dark:hover:bg-orange-900/20 transition-colors"
          >
            <Bug className="h-3.5 w-3.5" />
            {t(
              "settings.experimental.updateCheck.action.testWindow",
              "测试更新弹窗",
            )}
          </button>
        )}
      </div>
    </div>
  );
}
