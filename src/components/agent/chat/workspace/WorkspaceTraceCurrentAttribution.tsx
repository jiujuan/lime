import { useTranslation } from "react-i18next";
import type { ClawTraceRegressionOwner } from "@/lib/trace/clawTraceRegressionReport";
import { cn } from "@/lib/utils";
import type {
  TraceCurrentAttributionModel,
  TraceCurrentAttributionSeverity,
  TraceSegmentId,
} from "./workspaceTracePanelModel";

type TraceTranslation = (
  key: string,
  options?: Record<string, unknown>,
) => string;

function formatMs(value: number | null): string {
  return value === null ? "--" : `${value} ms`;
}

function formatPercent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return "--";
  }
  return `${Math.round(value * 100)}%`;
}

function ownerLabelKey(owner: ClawTraceRegressionOwner): string {
  switch (owner) {
    case "provider_api":
      return "agentChat.tracePanel.regression.owner.providerApi";
    case "app_server":
      return "agentChat.tracePanel.regression.owner.appServer";
    case "lime_client":
      return "agentChat.tracePanel.regression.owner.limeClient";
  }
}

function ownerToneClassName(owner: ClawTraceRegressionOwner | null): string {
  switch (owner) {
    case "provider_api":
      return "border-amber-100 bg-amber-50 text-amber-900";
    case "app_server":
      return "border-sky-100 bg-sky-50 text-sky-900";
    case "lime_client":
      return "border-emerald-100 bg-emerald-50 text-emerald-900";
    case null:
      return "border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] text-[color:var(--lime-text-muted)]";
  }
}

function severityClassName(severity: TraceCurrentAttributionSeverity): string {
  switch (severity) {
    case "slow":
      return "border-amber-100 bg-amber-50 text-amber-900";
    case "ok":
      return "border-emerald-100 bg-emerald-50 text-emerald-900";
    case "unknown":
      return "border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] text-[color:var(--lime-text-muted)]";
  }
}

function segmentLabelKey(segmentId: TraceSegmentId | null): string | null {
  if (!segmentId) {
    return null;
  }
  return `agentChat.tracePanel.segment.${segmentId}.label`;
}

export function WorkspaceTraceCurrentAttribution({
  attribution,
}: {
  attribution: TraceCurrentAttributionModel;
}) {
  const { t } = useTranslation("agent");
  const text = t as unknown as TraceTranslation;
  const ownerLabel = attribution.owner
    ? text(ownerLabelKey(attribution.owner))
    : t("agentChat.tracePanel.currentAttribution.owner.unknown");
  const segmentKey = segmentLabelKey(attribution.primarySegmentId);

  return (
    <section className="space-y-2">
      <div>
        <p className="text-sm font-semibold text-[color:var(--lime-text-strong)]">
          {t("agentChat.tracePanel.currentAttribution.title")}
        </p>
        <p className="mt-1 text-xs leading-5 text-[color:var(--lime-text-muted)]">
          {t("agentChat.tracePanel.currentAttribution.subtitle")}
        </p>
      </div>
      <div className="rounded-2xl border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface-subtle)] p-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-[min(100%,12rem)] flex-1">
            <p className="text-xs font-medium text-[color:var(--lime-text-muted)]">
              {t("agentChat.tracePanel.currentAttribution.primaryOwner")}
            </p>
            <p className="mt-1 break-words text-sm font-semibold text-[color:var(--lime-text-strong)]">
              {ownerLabel}
            </p>
          </div>
          <span
            className={cn(
              "inline-flex shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold",
              severityClassName(attribution.severity),
            )}
          >
            {text(
              `agentChat.tracePanel.currentAttribution.severity.${attribution.severity}`,
            )}
          </span>
        </div>
        <p
          className={cn(
            "mt-3 rounded-xl border px-3 py-2 text-xs font-medium leading-5",
            ownerToneClassName(attribution.owner),
          )}
          data-testid="workspace-trace-current-attribution-message"
        >
          {text(
            `agentChat.tracePanel.currentAttribution.message.${attribution.reason}`,
          )}
        </p>
        <div className="mt-3 grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(min(150px,100%),1fr))]">
          <MetricPill
            label={t("agentChat.tracePanel.currentAttribution.ownerTotal")}
            value={formatMs(attribution.ownerTotalMs)}
          />
          <MetricPill
            label={t("agentChat.tracePanel.currentAttribution.ownerShare")}
            value={formatPercent(attribution.ownerShare)}
          />
          <MetricPill
            label={t("agentChat.tracePanel.currentAttribution.clientLocal")}
            value={formatMs(attribution.clientActionableMs)}
          />
        </div>
        {segmentKey ? (
          <p className="mt-3 text-xs leading-5 text-[color:var(--lime-text-muted)]">
            {t("agentChat.tracePanel.currentAttribution.primarySegment", {
              segment: text(segmentKey),
              valueMs: formatMs(attribution.primarySegmentValueMs),
            })}
          </p>
        ) : null}
      </div>
    </section>
  );
}

function MetricPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] px-3 py-2">
      <p className="break-words text-[11px] font-medium text-[color:var(--lime-text-muted)]">
        {label}
      </p>
      <p className="mt-1 break-words text-sm font-semibold text-[color:var(--lime-text-strong)]">
        {value}
      </p>
    </div>
  );
}
