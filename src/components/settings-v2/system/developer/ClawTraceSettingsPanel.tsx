import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
} from "react";
import { useTranslation } from "react-i18next";
import {
  getConfig,
  saveConfig,
  type ClawTraceConfig,
  type Config,
} from "@/lib/api/appConfig";
import {
  clearAgentUiPerformanceMetrics,
  summarizeAgentUiPerformanceMetrics,
} from "@/lib/agentUiPerformanceMetrics";
import {
  clearAgentUiPerformanceTraceHistory,
  exportAgentUiPerformanceTraceHistory,
  getAgentUiPerformanceTraceHistoryOverview,
  saveAgentUiPerformanceTraceSnapshot,
  type AgentUiPerformanceTraceHistoryOverview,
} from "@/lib/agentUiPerformanceTraceHistory";
import {
  exportDiagnosticsTrace,
  exportSupportBundle,
  listDiagnosticsTraces,
  readDiagnosticsTrace,
} from "@/lib/api/serverRuntime";
import { copyTextToClipboard } from "@/lib/crashDiagnostic";
import { buildAgentUiPerformanceDiagnosticSummary } from "@/lib/crashDiagnosticAgentUiPerformance";
import {
  normalizeClawTraceConfig,
  normalizeDeveloperConfig,
} from "@/lib/developerFeatures";
import {
  ClipboardCopy,
  Download,
  ListTree,
  Save,
  ScrollText,
  Trash2,
} from "lucide-react";
import { projectClawTraceBaselineComparison } from "@/lib/trace/clawTraceBaseline";
import {
  projectClawTraceAppServerComparison,
  selectClawTraceAppServerComparisonWindow,
  type ClawTraceAppServerComparison,
} from "@/lib/trace/clawTraceAppServerComparison";
import {
  projectClawTraceTimeline,
  type ClawTraceTimelineProjection,
} from "@/lib/trace/clawTraceTimeline";
import { projectClawTraceRegressionReport } from "@/lib/trace/clawTraceRegressionReport";
import { ClawTraceAppServerComparisonCard } from "./ClawTraceAppServerComparisonCard";
import { ClawTraceBaselineComparisonCard } from "./ClawTraceBaselineComparisonCard";
import { ClawTraceConfigControls } from "./ClawTraceConfigControls";
import { ClawTraceRegressionReportCard } from "./ClawTraceRegressionReportCard";
import { ClawTraceTimelineView } from "./ClawTraceTimelineView";
import { SECONDARY_BUTTON_CLASS_NAME } from "./shared";

type DeveloperSettingsMessage = {
  type: "success" | "error";
  text: string;
};

const APP_SERVER_TRACE_COMPARE_WINDOW_LIMIT = 20;

interface ClawTraceSettingsPanelProps {
  appConfig: Config | null;
  onConfigSaved: (config: Config) => void;
  onMessage: (message: DeveloperSettingsMessage) => void;
}

function clampSampleRate(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function formatTraceHistorySavedAt(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toLocaleString();
}

export function ClawTraceSettingsPanel({
  appConfig,
  onConfigSaved,
  onMessage,
}: ClawTraceSettingsPanelProps) {
  const { t } = useTranslation("settings");
  const [saving, setSaving] = useState(false);
  const [historyOverview, setHistoryOverview] =
    useState<AgentUiPerformanceTraceHistoryOverview>(() =>
      getAgentUiPerformanceTraceHistoryOverview(),
    );
  const [timelineProjection, setTimelineProjection] =
    useState<ClawTraceTimelineProjection | null>(null);
  const [appServerComparison, setAppServerComparison] =
    useState<ClawTraceAppServerComparison | null>(null);
  const traceConfig = normalizeClawTraceConfig(
    appConfig?.developer?.claw_trace,
  );
  const refreshHistoryOverview = useCallback(() => {
    setHistoryOverview(getAgentUiPerformanceTraceHistoryOverview());
  }, []);

  useEffect(() => {
    refreshHistoryOverview();
  }, [refreshHistoryOverview]);

  const saveTraceConfig = useCallback(
    async (
      patch: Partial<ClawTraceConfig>,
      successMessage: string,
    ): Promise<void> => {
      setSaving(true);
      try {
        const latestConfig = appConfig ?? (await getConfig());
        const developerConfig = normalizeDeveloperConfig(
          latestConfig.developer,
        );
        const nextConfig: Config = {
          ...latestConfig,
          developer: {
            ...developerConfig,
            claw_trace: {
              ...normalizeClawTraceConfig(developerConfig.claw_trace),
              ...patch,
            },
          },
        };
        await saveConfig(nextConfig);
        onConfigSaved(nextConfig);
        onMessage({
          type: "success",
          text: successMessage,
        });
      } catch (error) {
        console.error("保存 Claw Trace 配置失败:", error);
        onMessage({
          type: "error",
          text:
            error instanceof Error
              ? error.message
              : t("settings.developer.message.saveClawTraceFailed"),
        });
      } finally {
        setSaving(false);
      }
    },
    [appConfig, onConfigSaved, onMessage, t],
  );

  const handleEnabledChange = useCallback(
    (nextEnabled: boolean) => {
      void saveTraceConfig(
        { enabled: nextEnabled },
        nextEnabled
          ? t("settings.developer.message.clawTraceEnabled")
          : t("settings.developer.message.clawTraceDisabled"),
      );
    },
    [saveTraceConfig, t],
  );

  const handleLevelChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      const nextLevel =
        event.currentTarget.value === "debug" ? "debug" : "summary";
      void saveTraceConfig(
        { level: nextLevel },
        t("settings.developer.message.clawTraceSettingsSaved"),
      );
    },
    [saveTraceConfig, t],
  );

  const handleSampleRateChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const rawValue = event.currentTarget.value.trim();
      if (!rawValue) {
        return;
      }
      const parsed = Number(rawValue);
      if (!Number.isFinite(parsed)) {
        return;
      }
      void saveTraceConfig(
        { sample_rate: clampSampleRate(parsed) },
        t("settings.developer.message.clawTraceSettingsSaved"),
      );
    },
    [saveTraceConfig, t],
  );

  const handleAlertEnabledChange = useCallback(
    (nextEnabled: boolean) => {
      void saveTraceConfig(
        { alert_enabled: nextEnabled },
        t("settings.developer.message.clawTraceSettingsSaved"),
      );
    },
    [saveTraceConfig, t],
  );

  const handleAlertNotificationEnabledChange = useCallback(
    (nextEnabled: boolean) => {
      void saveTraceConfig(
        { alert_notification_enabled: nextEnabled },
        t("settings.developer.message.clawTraceSettingsSaved"),
      );
    },
    [saveTraceConfig, t],
  );

  const handleCopySummary = useCallback(async () => {
    setSaving(true);
    try {
      const summary = buildAgentUiPerformanceDiagnosticSummary(
        summarizeAgentUiPerformanceMetrics(),
      );
      await copyTextToClipboard(JSON.stringify(summary, null, 2));
      onMessage({
        type: "success",
        text: t("settings.developer.message.clawTraceSummaryCopied"),
      });
    } catch (error) {
      console.error("复制 Claw Trace summary 失败:", error);
      onMessage({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : t("settings.developer.message.copyClawTraceSummaryFailed"),
      });
    } finally {
      setSaving(false);
    }
  }, [onMessage, t]);

  const handleClearSummary = useCallback(() => {
    clearAgentUiPerformanceMetrics();
    onMessage({
      type: "success",
      text: t("settings.developer.message.clawTraceSummaryCleared"),
    });
  }, [onMessage, t]);

  const handleSaveSnapshot = useCallback(() => {
    try {
      const record = saveAgentUiPerformanceTraceSnapshot(
        summarizeAgentUiPerformanceMetrics(),
        {
          label: t(
            "settings.developer.debugSwitch.clawTrace.history.defaultLabel",
          ),
        },
      );
      if (!record) {
        onMessage({
          type: "error",
          text: t("settings.developer.message.clawTraceNoSummaryToSave"),
        });
        return;
      }

      refreshHistoryOverview();
      onMessage({
        type: "success",
        text: t("settings.developer.message.clawTraceSnapshotSaved"),
      });
    } catch (error) {
      console.error("保存 Claw Trace 快照失败:", error);
      onMessage({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : t("settings.developer.message.saveClawTraceSnapshotFailed"),
      });
    }
  }, [onMessage, refreshHistoryOverview, t]);

  const handleCopyHistory = useCallback(async () => {
    setSaving(true);
    try {
      await copyTextToClipboard(
        JSON.stringify(exportAgentUiPerformanceTraceHistory(), null, 2),
      );
      onMessage({
        type: "success",
        text: t("settings.developer.message.clawTraceHistoryCopied"),
      });
    } catch (error) {
      console.error("复制 Claw Trace 历史失败:", error);
      onMessage({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : t("settings.developer.message.copyClawTraceHistoryFailed"),
      });
    } finally {
      setSaving(false);
    }
  }, [onMessage, t]);

  const handleCopyTraceList = useCallback(async () => {
    setSaving(true);
    try {
      const result = await listDiagnosticsTraces({ limit: 20 });
      await copyTextToClipboard(JSON.stringify(result, null, 2));
      onMessage({
        type: "success",
        text: t("settings.developer.message.clawTraceTraceListCopied"),
      });
    } catch (error) {
      console.error("复制 Claw Trace 列表失败:", error);
      onMessage({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : t("settings.developer.message.copyClawTraceTraceListFailed"),
      });
    } finally {
      setSaving(false);
    }
  }, [onMessage, t]);

  const handleExportLatestTrace = useCallback(async () => {
    setSaving(true);
    try {
      const listResult = await listDiagnosticsTraces({ limit: 1 });
      const latestTrace = listResult.traces[0];
      if (!latestTrace) {
        onMessage({
          type: "error",
          text: t("settings.developer.message.clawTraceNoTraceAvailable"),
        });
        return;
      }

      const exportResult = await exportDiagnosticsTrace({
        session_id: latestTrace.session_id,
        trace_id: latestTrace.trace_id,
      });
      if (!exportResult.exported || !exportResult.bundle_path) {
        onMessage({
          type: "error",
          text: t("settings.developer.message.exportClawTraceTraceFailed"),
        });
        return;
      }

      onMessage({
        type: "success",
        text: t("settings.developer.message.clawTraceTraceExported", {
          bundlePath: exportResult.bundle_path,
        }),
      });
    } catch (error) {
      console.error("导出 Claw Trace 最近记录失败:", error);
      onMessage({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : t("settings.developer.message.exportClawTraceTraceFailed"),
      });
    } finally {
      setSaving(false);
    }
  }, [onMessage, t]);

  const handleExportSupportBundleWithLatestTrace = useCallback(async () => {
    setSaving(true);
    try {
      const listResult = await listDiagnosticsTraces({ limit: 1 });
      const latestTrace = listResult.traces[0];
      if (!latestTrace) {
        onMessage({
          type: "error",
          text: t("settings.developer.message.clawTraceNoTraceAvailable"),
        });
        return;
      }

      const exportResult = await exportSupportBundle({
        include_trace_export: {
          session_id: latestTrace.session_id,
          trace_id: latestTrace.trace_id,
        },
      });

      onMessage({
        type: "success",
        text: t(
          "settings.developer.message.clawTraceSupportBundleWithTraceExported",
          {
            bundlePath: exportResult.bundle_path,
          },
        ),
      });
    } catch (error) {
      console.error("导出附带 Claw Trace 的支持包失败:", error);
      onMessage({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : t(
                "settings.developer.message.exportClawTraceSupportBundleWithTraceFailed",
              ),
      });
    } finally {
      setSaving(false);
    }
  }, [onMessage, t]);

  const handleCopyLatestTrace = useCallback(async () => {
    setSaving(true);
    try {
      const listResult = await listDiagnosticsTraces({ limit: 1 });
      const latestTrace = listResult.traces[0];
      if (!latestTrace) {
        onMessage({
          type: "error",
          text: t("settings.developer.message.clawTraceNoTraceAvailable"),
        });
        return;
      }

      const readResult = await readDiagnosticsTrace({
        session_id: latestTrace.session_id,
        trace_id: latestTrace.trace_id,
        max_events: 200,
      });
      await copyTextToClipboard(JSON.stringify(readResult, null, 2));
      onMessage({
        type: "success",
        text: t("settings.developer.message.clawTraceTraceReadCopied"),
      });
    } catch (error) {
      console.error("复制 Claw Trace 最近记录失败:", error);
      onMessage({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : t("settings.developer.message.copyClawTraceTraceReadFailed"),
      });
    } finally {
      setSaving(false);
    }
  }, [onMessage, t]);

  const handleLoadTraceTimeline = useCallback(async () => {
    setSaving(true);
    try {
      const listResult = await listDiagnosticsTraces({
        limit: APP_SERVER_TRACE_COMPARE_WINDOW_LIMIT,
      });
      const comparisonWindow = selectClawTraceAppServerComparisonWindow(
        listResult.traces,
      );
      const latestTrace = comparisonWindow.current_trace;
      if (!latestTrace) {
        setTimelineProjection(null);
        setAppServerComparison(null);
        onMessage({
          type: "error",
          text: t("settings.developer.message.clawTraceNoTraceAvailable"),
        });
        return;
      }

      const readResult = await readDiagnosticsTrace({
        session_id: latestTrace.session_id,
        trace_id: latestTrace.trace_id,
        max_events: 500,
      });
      const projection = projectClawTraceTimeline(readResult);
      const baselineTrace = comparisonWindow.baseline_trace;
      const baselineProjection = baselineTrace
        ? projectClawTraceTimeline(
            await readDiagnosticsTrace({
              session_id: baselineTrace.session_id,
              trace_id: baselineTrace.trace_id,
              max_events: 500,
            }),
          )
        : null;
      setTimelineProjection(projection);
      setAppServerComparison(
        projectClawTraceAppServerComparison({
          baseline: baselineProjection,
          current: projection,
          latestTraceId: comparisonWindow.latest_trace_id,
          traceWindowCount: comparisonWindow.trace_window_count,
        }),
      );
      onMessage({
        type: "success",
        text: t("settings.developer.message.clawTraceTimelineLoaded"),
      });
    } catch (error) {
      console.error("加载 Claw Trace timeline 失败:", error);
      onMessage({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : t("settings.developer.message.loadClawTraceTimelineFailed"),
      });
    } finally {
      setSaving(false);
    }
  }, [onMessage, t]);

  const handleClearHistory = useCallback(() => {
    try {
      clearAgentUiPerformanceTraceHistory();
      refreshHistoryOverview();
      onMessage({
        type: "success",
        text: t("settings.developer.message.clawTraceHistoryCleared"),
      });
    } catch (error) {
      console.error("清空 Claw Trace 历史失败:", error);
      onMessage({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : t("settings.developer.message.clearClawTraceHistoryFailed"),
      });
    }
  }, [onMessage, refreshHistoryOverview, t]);

  const latestSavedAt = formatTraceHistorySavedAt(
    historyOverview.latest_saved_at,
  );
  const baselineComparison = useMemo(
    () =>
      projectClawTraceBaselineComparison({
        baselineRecords: exportAgentUiPerformanceTraceHistory().records,
        currentSummary: buildAgentUiPerformanceDiagnosticSummary(
          summarizeAgentUiPerformanceMetrics(),
        ),
        retention: historyOverview.retention,
      }),
    [historyOverview],
  );
  const regressionReport = useMemo(
    () =>
      projectClawTraceRegressionReport({
        appServerComparison,
        baselineComparison,
      }),
    [appServerComparison, baselineComparison],
  );

  return (
    <div className="space-y-4 rounded-[22px] border border-slate-200/80 bg-slate-50 p-4">
      <ClawTraceConfigControls
        saving={saving}
        traceConfig={traceConfig}
        onAlertEnabledChange={handleAlertEnabledChange}
        onAlertNotificationEnabledChange={handleAlertNotificationEnabledChange}
        onEnabledChange={handleEnabledChange}
        onLevelChange={handleLevelChange}
        onSampleRateChange={handleSampleRateChange}
      />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={SECONDARY_BUTTON_CLASS_NAME}
          disabled={saving}
          onClick={() => void handleCopySummary()}
        >
          <ClipboardCopy className="h-4 w-4" />
          {t("settings.developer.debugSwitch.clawTrace.action.copySummary")}
        </button>
        <button
          type="button"
          className={SECONDARY_BUTTON_CLASS_NAME}
          disabled={saving}
          onClick={handleClearSummary}
        >
          <Trash2 className="h-4 w-4" />
          {t("settings.developer.debugSwitch.clawTrace.action.clearSummary")}
        </button>
      </div>

      <div className="space-y-3 border-t border-slate-200/80 pt-3">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-semibold text-slate-900">
            {t("settings.developer.debugSwitch.clawTrace.history.title")}
          </p>
          <p className="text-xs font-medium text-slate-500">
            {latestSavedAt
              ? t(
                  "settings.developer.debugSwitch.clawTrace.history.status.withLatest",
                  {
                    count: historyOverview.count,
                    latestSavedAt,
                    maxRecords: historyOverview.retention.max_records,
                  },
                )
              : t(
                  "settings.developer.debugSwitch.clawTrace.history.status.empty",
                  {
                    count: historyOverview.count,
                    maxRecords: historyOverview.retention.max_records,
                  },
                )}
          </p>
        </div>
        <p className="text-xs leading-5 text-slate-500">
          {t("settings.developer.debugSwitch.clawTrace.history.retention", {
            maxAgeDays: historyOverview.retention.max_age_days,
            maxRecords: historyOverview.retention.max_records,
          })}
        </p>
        <ClawTraceBaselineComparisonCard comparison={baselineComparison} />
        <ClawTraceRegressionReportCard
          alertEnabled={traceConfig.alert_enabled === true}
          alertNotificationEnabled={
            traceConfig.alert_notification_enabled === true
          }
          onMessage={onMessage}
          report={regressionReport}
        />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={SECONDARY_BUTTON_CLASS_NAME}
            disabled={saving}
            onClick={handleSaveSnapshot}
          >
            <Save className="h-4 w-4" />
            {t("settings.developer.debugSwitch.clawTrace.action.saveSnapshot")}
          </button>
          <button
            type="button"
            className={SECONDARY_BUTTON_CLASS_NAME}
            disabled={saving}
            onClick={() => void handleCopyHistory()}
          >
            <ClipboardCopy className="h-4 w-4" />
            {t("settings.developer.debugSwitch.clawTrace.action.copyHistory")}
          </button>
          <button
            type="button"
            className={SECONDARY_BUTTON_CLASS_NAME}
            disabled={saving}
            onClick={handleClearHistory}
          >
            <Trash2 className="h-4 w-4" />
            {t("settings.developer.debugSwitch.clawTrace.action.clearHistory")}
          </button>
        </div>
      </div>

      <div className="space-y-3 border-t border-slate-200/80 pt-3">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-semibold text-slate-900">
            {t("settings.developer.debugSwitch.clawTrace.traceDump.title")}
          </p>
          <p className="text-xs font-medium text-slate-500">
            {t(
              "settings.developer.debugSwitch.clawTrace.traceDump.description",
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={SECONDARY_BUTTON_CLASS_NAME}
            disabled={saving}
            onClick={() => void handleCopyTraceList()}
          >
            <ScrollText className="h-4 w-4" />
            {t("settings.developer.debugSwitch.clawTrace.action.copyTraceList")}
          </button>
          <button
            type="button"
            className={SECONDARY_BUTTON_CLASS_NAME}
            disabled={saving}
            onClick={() => void handleCopyLatestTrace()}
          >
            <ClipboardCopy className="h-4 w-4" />
            {t(
              "settings.developer.debugSwitch.clawTrace.action.copyLatestTrace",
            )}
          </button>
          <button
            type="button"
            className={SECONDARY_BUTTON_CLASS_NAME}
            disabled={saving}
            onClick={() => void handleExportLatestTrace()}
          >
            <Download className="h-4 w-4" />
            {t(
              "settings.developer.debugSwitch.clawTrace.action.exportLatestTrace",
            )}
          </button>
          <button
            type="button"
            className={SECONDARY_BUTTON_CLASS_NAME}
            disabled={saving}
            onClick={() => void handleExportSupportBundleWithLatestTrace()}
          >
            <Download className="h-4 w-4" />
            {t(
              "settings.developer.debugSwitch.clawTrace.action.exportSupportBundleWithLatestTrace",
            )}
          </button>
          <button
            type="button"
            className={SECONDARY_BUTTON_CLASS_NAME}
            disabled={saving}
            onClick={() => void handleLoadTraceTimeline()}
          >
            <ListTree className="h-4 w-4" />
            {t("settings.developer.debugSwitch.clawTrace.action.loadTimeline")}
          </button>
        </div>
        {timelineProjection ? (
          <>
            {appServerComparison ? (
              <ClawTraceAppServerComparisonCard
                comparison={appServerComparison}
              />
            ) : null}
            <ClawTraceTimelineView projection={timelineProjection} />
          </>
        ) : null}
      </div>
    </div>
  );
}
