import {
  startTransition,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import { Activity, Copy, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  subscribeAgentUiPerformanceMetricRecorded,
  summarizeAgentUiPerformanceMetrics,
  type AgentUiPerformanceSnapshot,
} from "@/lib/agentUiPerformanceMetrics";
import {
  getAgentUiPerformanceTraceHistoryOverview,
  listAgentUiPerformanceTraceHistory,
  type AgentUiPerformanceTraceHistoryRecord,
  type AgentUiPerformanceTraceHistoryRetentionPolicy,
} from "@/lib/agentUiPerformanceTraceHistory";
import { buildAgentUiPerformanceDiagnosticSummary } from "@/lib/crashDiagnosticAgentUiPerformance";
import type {
  ClawTraceBaselineMetricDelta,
  ClawTraceBaselineMetricKey,
  ClawTraceBaselineVerdict,
} from "@/lib/trace/clawTraceBaseline";
import type {
  ClawTraceRegressionMetricKey,
  ClawTraceRegressionOwner,
  ClawTraceRegressionSegment,
  ClawTraceRegressionVerdict,
} from "@/lib/trace/clawTraceRegressionReport";
import { cn } from "@/lib/utils";
import {
  buildWorkspaceTracePanelModel,
  type TraceRecordedPhaseGroupModel,
  type TraceHistoryRestoreMetricModel,
  type TraceSegmentModel,
} from "./workspaceTracePanelModel";

export interface WorkspaceTraceTabProps {
  baselineRecords?: AgentUiPerformanceTraceHistoryRecord[];
  enabled: boolean;
  retention?: AgentUiPerformanceTraceHistoryRetentionPolicy;
  sessionId?: string | null;
  snapshot?: AgentUiPerformanceSnapshot;
  workspaceId?: string | null;
  onCopyEvidence?: (text: string) => Promise<void> | void;
}

type TraceTranslation = (
  key: string,
  options?: Record<string, unknown>,
) => string;

const TRACE_SUMMARY_GRID_STYLE = {
  gridTemplateColumns: "repeat(auto-fit, minmax(min(150px, 100%), 1fr))",
} satisfies CSSProperties;

const TRACE_METRIC_GRID_STYLE = {
  gridTemplateColumns: "repeat(auto-fit, minmax(min(180px, 100%), 1fr))",
} satisfies CSSProperties;

function formatMs(value: number | null): string {
  return value === null ? "--" : `${value} ms`;
}

function formatSignedMs(value: number): string {
  const rounded = Math.round(value);
  return `${rounded > 0 ? "+" : ""}${rounded} ms`;
}

function formatSavedAt(value: string | null): string {
  if (!value) {
    return "--";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

function ownerClassName(owner: TraceSegmentModel["owner"]): string {
  switch (owner) {
    case "client":
      return "border-emerald-100 bg-emerald-50 text-emerald-900";
    case "server":
      return "border-amber-100 bg-amber-50 text-amber-900";
    case "bridge":
      return "border-sky-100 bg-sky-50 text-sky-900";
  }
}

function baselineVerdictClassName(verdict: ClawTraceBaselineVerdict): string {
  switch (verdict) {
    case "improved":
      return "border-emerald-100 bg-emerald-50 text-emerald-900";
    case "regressed":
      return "border-amber-100 bg-amber-50 text-amber-900";
    case "same":
      return "border-slate-200 bg-slate-50 text-slate-700";
    case "no_baseline":
    case "no_current":
      return "border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface-subtle)] text-[color:var(--lime-text-muted)]";
  }
}

function metricDeltaClassName(
  metric: ClawTraceBaselineMetricDelta | ClawTraceRegressionSegment,
): string {
  switch (metric.verdict) {
    case "improved":
      return "border-emerald-100 bg-emerald-50 text-emerald-900";
    case "regressed":
      return "border-amber-100 bg-amber-50 text-amber-900";
    case "same":
      return "border-slate-200 bg-slate-50 text-slate-700";
  }
}

function regressionVerdictClassName(
  verdict: ClawTraceRegressionVerdict,
): string {
  switch (verdict) {
    case "improved":
      return "border-emerald-100 bg-emerald-50 text-emerald-900";
    case "regressed":
      return "border-amber-100 bg-amber-50 text-amber-900";
    case "same":
      return "border-slate-200 bg-slate-50 text-slate-700";
    case "no_evidence":
      return "border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface-subtle)] text-[color:var(--lime-text-muted)]";
  }
}

function baselineMetricLabelKey(metric: ClawTraceBaselineMetricKey): string {
  switch (metric) {
    case "providerWaitMs":
      return "agentChat.tracePanel.baseline.metric.providerWait";
    case "serverToRendererFirstTextDeltaMs":
      return "agentChat.tracePanel.baseline.metric.serverToRenderer";
    case "rendererApplyFirstTextDeltaMs":
      return "agentChat.tracePanel.baseline.metric.rendererApply";
    case "clientLocalOutputMs":
      return "agentChat.tracePanel.baseline.metric.clientLocal";
  }
}

function regressionMetricLabelKey(
  metric: ClawTraceRegressionMetricKey,
): string {
  switch (metric) {
    case "providerWaitMs":
    case "serverToRendererFirstTextDeltaMs":
    case "rendererApplyFirstTextDeltaMs":
    case "clientLocalOutputMs":
      return baselineMetricLabelKey(metric);
    case "providerFirstEventMs":
      return "agentChat.tracePanel.regression.metric.providerFirstEvent";
    case "providerFirstTextMs":
      return "agentChat.tracePanel.regression.metric.providerFirstText";
    case "providerToAppServerFirstDeltaMs":
      return "agentChat.tracePanel.regression.metric.providerToAppServer";
    case "appServerFirstDeltaToTerminalMs":
      return "agentChat.tracePanel.regression.metric.appServerTerminal";
  }
}

function regressionOwnerLabelKey(owner: ClawTraceRegressionOwner): string {
  switch (owner) {
    case "provider_api":
      return "agentChat.tracePanel.regression.owner.providerApi";
    case "app_server":
      return "agentChat.tracePanel.regression.owner.appServer";
    case "lime_client":
      return "agentChat.tracePanel.regression.owner.limeClient";
  }
}

function historyRestoreMetricLabelKey(
  metric: TraceHistoryRestoreMetricModel["id"],
): string {
  switch (metric) {
    case "click_to_switch_start":
      return "agentChat.tracePanel.historyRestore.metric.clickToSwitchStart";
    case "click_to_fetch_start":
      return "agentChat.tracePanel.historyRestore.metric.clickToFetchStart";
    case "fetch_detail":
      return "agentChat.tracePanel.historyRestore.metric.fetchDetail";
    case "runtime_get_session":
      return "agentChat.tracePanel.historyRestore.metric.runtimeGetSession";
    case "click_to_message_list_paint":
      return "agentChat.tracePanel.historyRestore.metric.messageListPaint";
  }
}

function useWorkspaceTraceSnapshot(
  explicitSnapshot: AgentUiPerformanceSnapshot | undefined,
  enabled: boolean,
): AgentUiPerformanceSnapshot {
  const [snapshot, setSnapshot] = useState<AgentUiPerformanceSnapshot>(
    () => explicitSnapshot ?? summarizeAgentUiPerformanceMetrics(),
  );

  useEffect(() => {
    if (explicitSnapshot) {
      setSnapshot(explicitSnapshot);
    }
  }, [explicitSnapshot]);

  useEffect(() => {
    if (explicitSnapshot || !enabled) {
      return undefined;
    }

    let frameId: number | null = null;
    const refresh = () => {
      if (frameId !== null) {
        return;
      }
      frameId = window.requestAnimationFrame(() => {
        frameId = null;
        const nextSnapshot = summarizeAgentUiPerformanceMetrics();
        startTransition(() => {
          setSnapshot(nextSnapshot);
        });
      });
    };
    refresh();
    const unsubscribe = subscribeAgentUiPerformanceMetricRecorded(refresh);
    return () => {
      unsubscribe();
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, [enabled, explicitSnapshot]);

  return explicitSnapshot ?? snapshot;
}

function useTraceComparisonsReady(
  explicitSnapshot: AgentUiPerformanceSnapshot | undefined,
  enabled: boolean,
): boolean {
  const [ready, setReady] = useState(() => Boolean(explicitSnapshot));

  useEffect(() => {
    if (explicitSnapshot || !enabled) {
      setReady(Boolean(explicitSnapshot));
      return undefined;
    }

    setReady(false);
    type IdleDeadlineLike = {
      didTimeout: boolean;
      timeRemaining: () => number;
    };
    type IdleCallbackLike = (deadline: IdleDeadlineLike) => void;
    const schedule: (
      callback: IdleCallbackLike,
      options?: { timeout?: number },
    ) => number =
      typeof window.requestIdleCallback === "function"
        ? (callback, options) =>
            window.requestIdleCallback?.(
              callback as unknown as never,
              options,
            ) ??
            window.setTimeout(
              () =>
                callback({
                  didTimeout: false,
                  timeRemaining: () => 0,
                }),
              120,
            )
        : (callback) =>
            window.setTimeout(
              () => {
                callback({
                  didTimeout: false,
                  timeRemaining: () => 0,
                });
              },
              120,
            );
    const cancel =
      typeof window.cancelIdleCallback === "function"
        ? window.cancelIdleCallback
        : window.clearTimeout;
    const idleId = schedule(
      () => {
        startTransition(() => {
          setReady(true);
        });
      },
      { timeout: 600 },
    );
    return () => {
      cancel(idleId);
    };
  }, [enabled, explicitSnapshot]);

  return ready;
}

export function WorkspaceTraceTab({
  baselineRecords,
  enabled,
  retention,
  sessionId,
  snapshot: explicitSnapshot,
  workspaceId,
  onCopyEvidence,
}: WorkspaceTraceTabProps) {
  const { t } = useTranslation("agent");
  const text = t as unknown as TraceTranslation;
  const snapshot = useWorkspaceTraceSnapshot(explicitSnapshot, enabled);
  const comparisonsReady = useTraceComparisonsReady(explicitSnapshot, enabled);
  const traceHistory = useMemo(() => {
    if (!comparisonsReady) {
      return {
        records: [] as AgentUiPerformanceTraceHistoryRecord[],
        retention,
      };
    }
    if (baselineRecords) {
      return {
        records: baselineRecords,
        retention,
      };
    }
    const overview = getAgentUiPerformanceTraceHistoryOverview();
    return {
      records: listAgentUiPerformanceTraceHistory(),
      retention: overview.retention,
    };
  }, [baselineRecords, comparisonsReady, retention]);
  const model = useMemo(
    () =>
      buildWorkspaceTracePanelModel(snapshot, {
        baselineRecords: traceHistory.records,
        enabled,
        includeComparisons: comparisonsReady,
        retention: traceHistory.retention,
        sessionId,
        workspaceId,
      }),
    [comparisonsReady, enabled, sessionId, snapshot, traceHistory, workspaceId],
  );
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">(
    "idle",
  );

  const copyEvidence = async () => {
    const summary = buildAgentUiPerformanceDiagnosticSummary(snapshot);
    const payload = {
      schema_version: 1,
      source: "workspace_trace_tab",
      copied_at: new Date().toISOString(),
      selected_session_id: model.session?.sessionId ?? null,
      baseline_comparison: model.baselineComparison,
      regression_report: model.regressionReport,
      summary,
    };
    const text = JSON.stringify(payload, null, 2);
    try {
      if (onCopyEvidence) {
        await onCopyEvidence(text);
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        throw new Error("clipboard unavailable");
      }
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  };

  if (!model.session) {
    return (
      <div
        className="flex h-full min-h-0 flex-col bg-[color:var(--lime-surface)]"
        data-testid="workspace-trace-tab"
      >
        <TraceHeader
          copyDisabled
          copyState={copyState}
          enabled={enabled}
          onCopyEvidence={copyEvidence}
        />
        <div className="flex min-h-0 flex-1 items-center justify-center p-6">
          <div className="max-w-sm rounded-2xl border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface-subtle)] px-4 py-5 text-center">
            <p className="text-sm font-semibold text-[color:var(--lime-text-strong)]">
              {t("agentChat.tracePanel.empty.title")}
            </p>
            <p className="mt-2 text-xs leading-5 text-[color:var(--lime-text-muted)]">
              {enabled
                ? t("agentChat.tracePanel.empty.enabled")
                : t("agentChat.tracePanel.empty.disabled")}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (model.sessionKind !== "claw_turn") {
    return (
      <div
        className="flex h-full min-h-0 flex-col bg-[color:var(--lime-surface)]"
        data-testid="workspace-trace-tab"
      >
        <TraceHeader
          copyDisabled={model.entryCount === 0}
          copyState={copyState}
          enabled={enabled}
          onCopyEvidence={copyEvidence}
        />
        <div className="min-h-0 flex-1 space-y-4 overflow-auto p-4">
          <section className="rounded-2xl border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface-subtle)] p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-medium text-[color:var(--lime-text-muted)]">
                  {t("agentChat.tracePanel.currentSession")}
                </p>
                <p className="mt-1 max-w-[260px] truncate text-sm font-semibold text-[color:var(--lime-text-strong)]">
                  {model.session.sessionId}
                </p>
              </div>
              <span className="inline-flex shrink-0 rounded-full border border-amber-100 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-900">
                {t("agentChat.tracePanel.nonSend.badge")}
              </span>
            </div>
            <p className="mt-3 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs font-medium leading-5 text-amber-900">
              {text("agentChat.tracePanel.sessionKind." + model.sessionKind)}
            </p>
            <div
              className="mt-4 grid gap-2"
              data-testid="workspace-trace-summary-grid"
              style={TRACE_SUMMARY_GRID_STYLE}
            >
              <SummaryPill
                label={t("agentChat.tracePanel.entryCount")}
                value={String(model.entryCount)}
              />
              <SummaryPill
                label={t("agentChat.tracePanel.sessionCount")}
                value={String(model.sessionCount)}
              />
              <SummaryPill
                label={t("agentChat.tracePanel.phaseCount")}
                value={String(model.session.phases.length)}
              />
            </div>
          </section>

          {model.historyRestoreMetrics.length > 0 ? (
            <section className="space-y-2">
              <SectionTitle
                title={t("agentChat.tracePanel.historyRestore.title")}
                subtitle={t("agentChat.tracePanel.historyRestore.subtitle")}
              />
              <div className="grid gap-2">
                {model.historyRestoreMetrics.map((metric) => (
                  <SummaryPill
                    key={metric.id}
                    label={text(historyRestoreMetricLabelKey(metric.id))}
                    value={formatMs(metric.valueMs)}
                  />
                ))}
              </div>
            </section>
          ) : (
            <p className="rounded-2xl border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface-subtle)] px-3 py-3 text-xs text-[color:var(--lime-text-muted)]">
              {t("agentChat.tracePanel.historyRestore.empty")}
            </p>
          )}

          {model.recordedPhaseGroups.length > 0 ? (
            <section className="space-y-2">
              <SectionTitle
                title={t("agentChat.tracePanel.recordedPhases.title")}
                subtitle={t("agentChat.tracePanel.recordedPhases.subtitle")}
              />
              <RecordedPhaseGroups groups={model.recordedPhaseGroups} />
            </section>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex h-full min-h-0 flex-col bg-[color:var(--lime-surface)]"
      data-testid="workspace-trace-tab"
    >
      <TraceHeader
        copyDisabled={model.entryCount === 0}
        copyState={copyState}
        enabled={enabled}
        onCopyEvidence={copyEvidence}
      />
      <div className="min-h-0 flex-1 space-y-4 overflow-auto p-4">
        <section className="rounded-2xl border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface-subtle)] p-4">
          <div
            className="grid items-start gap-3"
            style={TRACE_METRIC_GRID_STYLE}
          >
            <div className="min-w-0">
              <p className="text-xs font-medium text-[color:var(--lime-text-muted)]">
                {t("agentChat.tracePanel.currentSession")}
              </p>
              <p className="mt-1 max-w-[260px] truncate text-sm font-semibold text-[color:var(--lime-text-strong)]">
                {model.session.sessionId}
              </p>
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-medium text-[color:var(--lime-text-muted)]">
                {t("agentChat.tracePanel.totalFirstText")}
              </p>
              <p className="mt-1 text-xl font-semibold text-[color:var(--lime-text-strong)]">
                {formatMs(model.totalFirstTextPaintMs)}
              </p>
            </div>
          </div>
          {model.sessionKind !== "claw_turn" ? (
            <p className="mt-3 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">
              {text("agentChat.tracePanel.sessionKind." + model.sessionKind)}
            </p>
          ) : null}
          <div
            className="mt-4 grid gap-2"
            data-testid="workspace-trace-summary-grid"
            style={TRACE_SUMMARY_GRID_STYLE}
          >
            <SummaryPill
              label={t("agentChat.tracePanel.entryCount")}
              value={String(model.entryCount)}
            />
            <SummaryPill
              label={t("agentChat.tracePanel.sessionCount")}
              value={String(model.sessionCount)}
            />
            <SummaryPill
              label={t("agentChat.tracePanel.clientActionable")}
              value={formatMs(model.clientActionableMs)}
            />
            <SummaryPill
              label={t("agentChat.tracePanel.phaseCount")}
              value={String(model.session.phases.length)}
            />
          </div>
        </section>

        <section className="space-y-2">
          <SectionTitle
            title={t("agentChat.tracePanel.latencySplit.title")}
            subtitle={t("agentChat.tracePanel.latencySplit.subtitle")}
          />
          <div className="grid gap-2">
            {model.segments.map((segment) => (
              <div
                key={segment.id}
                className={cn(
                  "rounded-2xl border px-3 py-3",
                  ownerClassName(segment.owner),
                )}
                data-testid={`workspace-trace-segment-${segment.id}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1 basis-[150px]">
                    <p className="text-sm font-semibold">
                      {text(`agentChat.tracePanel.segment.${segment.id}.label`)}
                    </p>
                    <p className="mt-1 text-xs opacity-75">
                      {text(`agentChat.tracePanel.owner.${segment.owner}`)}
                    </p>
                  </div>
                  <p className="shrink-0 text-sm font-semibold">
                    {formatMs(segment.valueMs)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-2">
          <SectionTitle
            title={t("agentChat.tracePanel.baseline.title")}
            subtitle={t("agentChat.tracePanel.baseline.subtitle")}
          />
          <div className="rounded-2xl border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface-subtle)] p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[color:var(--lime-text-strong)]">
                  {text(
                    `agentChat.tracePanel.baseline.verdict.${model.baselineComparison.verdict}`,
                  )}
                </p>
                <p className="mt-1 text-xs leading-5 text-[color:var(--lime-text-muted)]">
                  {model.baselineComparison.baseline_label
                    ? t("agentChat.tracePanel.baseline.base", {
                        label: model.baselineComparison.baseline_label,
                        savedAt: formatSavedAt(
                          model.baselineComparison.baseline_saved_at,
                        ),
                      })
                    : t("agentChat.tracePanel.baseline.empty")}
                </p>
              </div>
              <span
                className={cn(
                  "inline-flex shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold",
                  baselineVerdictClassName(model.baselineComparison.verdict),
                )}
              >
                {text(
                  `agentChat.tracePanel.baseline.verdict.${model.baselineComparison.verdict}`,
                )}
              </span>
            </div>
            <p className="mt-2 text-xs text-[color:var(--lime-text-muted)]">
              {t("agentChat.tracePanel.baseline.window", {
                count: model.baselineComparison.history_record_count,
                latestSavedAt: formatSavedAt(
                  model.baselineComparison.latest_saved_at,
                ),
              })}
            </p>
            {model.baselineComparison.metrics.length > 0 ? (
              <div className="mt-3 grid gap-2">
                {model.baselineComparison.metrics.map((metric) => (
                  <BaselineMetricRow key={metric.key} metric={metric} />
                ))}
              </div>
            ) : null}
          </div>
        </section>

        <section className="space-y-2">
          <SectionTitle
            title={t("agentChat.tracePanel.regression.title")}
            subtitle={t("agentChat.tracePanel.regression.subtitle")}
          />
          <div className="rounded-2xl border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface-subtle)] p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[color:var(--lime-text-strong)]">
                  {model.regressionReport.primary_owner
                    ? t("agentChat.tracePanel.regression.focus", {
                        owner: text(
                          regressionOwnerLabelKey(
                            model.regressionReport.primary_owner,
                          ),
                        ),
                      })
                    : text(
                        `agentChat.tracePanel.regression.verdict.${model.regressionReport.verdict}`,
                      )}
                </p>
                <p className="mt-1 text-xs leading-5 text-[color:var(--lime-text-muted)]">
                  {t("agentChat.tracePanel.regression.window", {
                    compactCount:
                      model.regressionReport.window
                        .compact_history_record_count,
                    traceCount:
                      model.regressionReport.window
                        .app_server_trace_window_count,
                  })}
                </p>
              </div>
              <span
                className={cn(
                  "inline-flex shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold",
                  regressionVerdictClassName(model.regressionReport.verdict),
                )}
              >
                {text(
                  `agentChat.tracePanel.regression.verdict.${model.regressionReport.verdict}`,
                )}
              </span>
            </div>
            {model.primaryRegressionSegment ? (
              <p className="mt-3 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">
                {t("agentChat.tracePanel.regression.primary", {
                  deltaMs: formatSignedMs(
                    model.primaryRegressionSegment.delta_ms,
                  ),
                  metric: text(
                    regressionMetricLabelKey(
                      model.primaryRegressionSegment.key,
                    ),
                  ),
                  owner: text(
                    regressionOwnerLabelKey(
                      model.primaryRegressionSegment.owner,
                    ),
                  ),
                })}
              </p>
            ) : (
              <p className="mt-3 rounded-xl border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] px-3 py-2 text-xs text-[color:var(--lime-text-muted)]">
                {t("agentChat.tracePanel.regression.empty")}
              </p>
            )}
            {model.regressionReport.owner_totals.length > 0 ? (
              <div className="mt-3 grid gap-2">
                {model.regressionReport.owner_totals.map((ownerTotal) => (
                  <div
                    key={ownerTotal.owner}
                    className="rounded-xl border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] px-3 py-2"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="min-w-0 text-xs font-semibold text-[color:var(--lime-text-strong)]">
                        {text(regressionOwnerLabelKey(ownerTotal.owner))}
                      </span>
                      <span className="text-xs font-semibold text-amber-800">
                        {formatSignedMs(ownerTotal.regressed_delta_ms)}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-[color:var(--lime-text-muted)]">
                      {t("agentChat.tracePanel.regression.metricCount", {
                        count: ownerTotal.metric_count,
                      })}
                    </p>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </section>

        <section className="space-y-2">
          <SectionTitle
            title={t("agentChat.tracePanel.slowSegments.title")}
            subtitle={t("agentChat.tracePanel.slowSegments.subtitle")}
          />
          {model.slowSegments.length > 0 ? (
            <div className="space-y-2">
              {model.slowSegments.map((segment) => (
                <div
                  key={segment.id}
                  className="rounded-2xl border border-[color:var(--lime-surface-border)] px-3 py-2"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="min-w-0 text-xs font-semibold text-[color:var(--lime-text-strong)]">
                      {text(`agentChat.tracePanel.segment.${segment.id}.label`)}
                    </span>
                    <span className="text-xs font-semibold text-[color:var(--lime-text-muted)]">
                      {formatMs(segment.valueMs)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-2xl border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface-subtle)] px-3 py-3 text-xs text-[color:var(--lime-text-muted)]">
              {t("agentChat.tracePanel.slowSegments.empty")}
            </p>
          )}
        </section>

        <section className="space-y-2">
          <SectionTitle
            title={t("agentChat.tracePanel.clientHealth.title")}
            subtitle={t("agentChat.tracePanel.clientHealth.subtitle")}
          />
          <div
            className="grid gap-2"
            data-testid="workspace-trace-health-grid"
            style={TRACE_SUMMARY_GRID_STYLE}
          >
            {model.healthMetrics.map((metric) => (
              <SummaryPill
                key={metric.id}
                label={text(`agentChat.tracePanel.health.${metric.id}`)}
                value={
                  metric.value === null
                    ? "--"
                    : metric.id === "long_task_count"
                      ? String(metric.value)
                      : `${metric.value} ms`
                }
              />
            ))}
          </div>
        </section>

        <section className="space-y-2">
          <SectionTitle
            title={t("agentChat.tracePanel.coverage.title")}
            subtitle={t("agentChat.tracePanel.coverage.subtitle")}
          />
          {model.missingPhaseIds.length > 0 ? (
            <div className="space-y-2">
              {model.missingPhaseIds.map((phaseId) => (
                <p
                  key={phaseId}
                  className="rounded-2xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900"
                >
                  {text(`agentChat.tracePanel.missing.${phaseId}`)}
                </p>
              ))}
            </div>
          ) : (
            <p className="rounded-2xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-900">
              {t("agentChat.tracePanel.coverage.complete")}
            </p>
          )}
          <RecordedPhaseGroups groups={model.recordedPhaseGroups} />
        </section>
      </div>
    </div>
  );
}

function RecordedPhaseGroups({
  groups,
}: {
  groups: TraceRecordedPhaseGroupModel[];
}) {
  const { t } = useTranslation("agent");
  const text = t as unknown as TraceTranslation;

  return (
    <div className="rounded-2xl border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface-subtle)] p-2">
      <div className="grid gap-1.5">
        {groups.map((group) => (
          <div
            key={group.id}
            className="flex min-h-9 flex-wrap items-center justify-between gap-2 rounded-xl border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] px-3 py-2"
          >
            <span className="min-w-0 text-xs font-semibold text-[color:var(--lime-text-strong)]">
              {text(`agentChat.tracePanel.recordedPhases.group.${group.id}`)}
            </span>
            <span className="shrink-0 rounded-full bg-[color:var(--lime-surface-subtle)] px-2 py-0.5 text-[11px] font-medium text-[color:var(--lime-text-muted)]">
              {t("agentChat.tracePanel.recordedPhases.count", {
                count: group.count,
              })}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TraceHeader({
  copyDisabled,
  copyState,
  enabled,
  onCopyEvidence,
}: {
  copyDisabled: boolean;
  copyState: "idle" | "copied" | "failed";
  enabled: boolean;
  onCopyEvidence: () => void;
}) {
  const { t } = useTranslation("agent");
  const copyLabel =
    copyState === "copied"
      ? t("agentChat.tracePanel.copy.copied")
      : copyState === "failed"
        ? t("agentChat.tracePanel.copy.failed")
        : t("agentChat.tracePanel.copy.action");

  return (
    <div className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-[color:var(--lime-surface-border)] px-4">
      <div className="flex min-w-0 items-center gap-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[color:var(--lime-surface-subtle)] text-[color:var(--lime-text-strong)]">
          <Activity className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[color:var(--lime-text-strong)]">
            {t("agentChat.tracePanel.title")}
          </p>
          <p className="truncate text-xs text-[color:var(--lime-text-muted)]">
            {enabled
              ? t("agentChat.tracePanel.status.enabled")
              : t("agentChat.tracePanel.status.disabled")}
          </p>
        </div>
      </div>
      <button
        type="button"
        className="inline-flex h-8 min-w-0 max-w-[48%] shrink items-center gap-1.5 rounded-xl border border-[color:var(--lime-surface-border)] px-2.5 text-xs font-medium text-[color:var(--lime-text)] transition hover:bg-[color:var(--lime-surface-hover)] disabled:cursor-not-allowed disabled:opacity-45"
        disabled={copyDisabled}
        onClick={onCopyEvidence}
      >
        {copyState === "idle" ? (
          <Copy className="h-3.5 w-3.5 shrink-0" />
        ) : (
          <RefreshCw className="h-3.5 w-3.5 shrink-0" />
        )}
        <span className="min-w-0 truncate">{copyLabel}</span>
      </button>
    </div>
  );
}

function SummaryPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-2xl border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] px-3 py-2">
      <p className="break-words text-[11px] font-medium text-[color:var(--lime-text-muted)]">
        {label}
      </p>
      <p className="mt-1 break-words text-sm font-semibold text-[color:var(--lime-text-strong)]">
        {value}
      </p>
    </div>
  );
}

function BaselineMetricRow({
  metric,
}: {
  metric: ClawTraceBaselineMetricDelta;
}) {
  const { t } = useTranslation("agent");
  const text = t as unknown as TraceTranslation;

  return (
    <div
      className={cn(
        "rounded-xl border px-3 py-2",
        metricDeltaClassName(metric),
      )}
      data-testid={`workspace-trace-baseline-metric-${metric.key}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="min-w-0 text-xs font-semibold">
          {text(baselineMetricLabelKey(metric.key))}
        </span>
        <span className="text-xs font-semibold">
          {formatSignedMs(metric.delta_ms)}
        </span>
      </div>
      <p className="mt-1 text-[11px] opacity-75">
        {t("agentChat.tracePanel.baseline.metricSummary", {
          baselineMs: metric.baseline_ms,
          currentMs: metric.current_ms,
        })}
      </p>
    </div>
  );
}

function SectionTitle({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <div>
      <p className="text-sm font-semibold text-[color:var(--lime-text-strong)]">
        {title}
      </p>
      <p className="mt-1 text-xs leading-5 text-[color:var(--lime-text-muted)]">
        {subtitle}
      </p>
    </div>
  );
}
