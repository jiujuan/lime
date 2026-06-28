import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  getConfig,
  subscribeAppConfigChanged,
  type Config,
} from "@/lib/api/appConfig";
import { subscribeAgentUiPerformanceMetricRecorded } from "@/lib/agentUiPerformanceMetrics";
import {
  normalizeClawTraceConfig,
  resolveClawTraceEnabled,
} from "@/lib/developerFeatures";
import {
  evaluateClawTraceRegressionAlertMonitor,
  type EvaluateClawTraceRegressionAlertMonitorResult,
} from "@/lib/trace/clawTraceRegressionAlertMonitor";
import { desktopHostClawTraceRegressionAlertNotifier } from "@/lib/trace/clawTraceRegressionAlertNotifier";
import {
  buildClawTraceRegressionAlertNotificationCopy,
  type ClawTraceRegressionAlertTranslate,
} from "@/lib/trace/clawTraceRegressionAlertPresentation";

interface UseClawTraceRegressionAlertMonitorOptions {
  debounceMs?: number;
  onEvaluated?: (result: EvaluateClawTraceRegressionAlertMonitorResult) => void;
}

const DEFAULT_DEBOUNCE_MS = 750;

export function useClawTraceRegressionAlertMonitor({
  debounceMs = DEFAULT_DEBOUNCE_MS,
  onEvaluated,
}: UseClawTraceRegressionAlertMonitorOptions = {}): void {
  const { t } = useTranslation("settings");
  const translate = useMemo<ClawTraceRegressionAlertTranslate>(() => {
    const baseTranslate = t as unknown as ClawTraceRegressionAlertTranslate;
    return (key, options) => String(baseTranslate(key, options));
  }, [t]);

  useEffect(() => {
    let active = true;
    let config: Config | null = null;
    let evaluationTimer: ReturnType<typeof setTimeout> | null = null;

    const clearEvaluationTimer = () => {
      if (evaluationTimer) {
        clearTimeout(evaluationTimer);
        evaluationTimer = null;
      }
    };

    const evaluate = async () => {
      if (!active || !config) {
        return;
      }

      const traceConfig = normalizeClawTraceConfig(
        config.developer?.claw_trace,
      );
      const result = await evaluateClawTraceRegressionAlertMonitor({
        alertEnabled: traceConfig.alert_enabled === true,
        notification: {
          format: (alert) =>
            buildClawTraceRegressionAlertNotificationCopy(alert, translate),
          notifier: desktopHostClawTraceRegressionAlertNotifier,
        },
        notificationEnabled: traceConfig.alert_notification_enabled === true,
        traceEnabled: resolveClawTraceEnabled(config),
      });

      if (active) {
        onEvaluated?.(result);
      }
    };

    const scheduleEvaluation = () => {
      clearEvaluationTimer();
      evaluationTimer = setTimeout(
        () => {
          evaluationTimer = null;
          void evaluate();
        },
        Math.max(0, debounceMs),
      );
    };

    const loadConfig = async (forceRefresh = false) => {
      try {
        config = await getConfig(
          forceRefresh ? { forceRefresh: true } : undefined,
        );
        if (active) {
          scheduleEvaluation();
        }
      } catch {
        config = null;
      }
    };

    void loadConfig();
    const unsubscribeMetric = subscribeAgentUiPerformanceMetricRecorded(() => {
      scheduleEvaluation();
    });
    const unsubscribeConfig = subscribeAppConfigChanged(() => {
      void loadConfig(true);
    });

    return () => {
      active = false;
      clearEvaluationTimer();
      unsubscribeMetric();
      unsubscribeConfig();
    };
  }, [debounceMs, onEvaluated, translate]);
}
