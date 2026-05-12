import { useCallback } from "react";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import type { RuntimeMemoryPrefetchHistoryDiffAssessment } from "@/lib/runtimeMemoryPrefetchHistory";
import {
  describeMemoryPrefetchAssessment,
  formatDiagnosticDateTime,
  formatMemoryPrefetchAssessmentStatusLabel,
  formatMemoryPrefetchHitChange,
  resolveMemoryPrefetchHistorySourceLabel,
  resolveMemoryPrefetchPreviewChangeLabel,
  type RuntimeMemoryPrefetchComparisonState,
} from "../utils/threadReliabilityDiagnosticText";
import type { AgentUiProjectionTranslation } from "../projection/agentUiProjectionSummary";

interface AgentThreadMemoryPrefetchBaselineCardProps {
  comparison: RuntimeMemoryPrefetchComparisonState;
}

function resolveAssessmentBadgeClassName(
  status: RuntimeMemoryPrefetchHistoryDiffAssessment["status"],
): string {
  switch (status) {
    case "stronger":
      return "border-emerald-200 bg-white text-emerald-700";
    case "weaker":
      return "border-amber-200 bg-white text-amber-700";
    case "mixed":
      return "border-slate-200 bg-white text-slate-700";
    case "same":
    default:
      return "border-slate-200 bg-white text-slate-700";
  }
}

export function AgentThreadMemoryPrefetchBaselineCard({
  comparison,
}: AgentThreadMemoryPrefetchBaselineCardProps) {
  const { t, i18n } = useTranslation("agent");
  const translate = useCallback<AgentUiProjectionTranslation>(
    (key, options) => String(t(key as never, options as never)),
    [t],
  );
  const text = useCallback(
    (key: string, options?: Record<string, unknown>) =>
      String(
        t(
          `agentChat.threadReliability.memoryBaseline.${key}` as never,
          options as never,
        ),
      ),
    [t],
  );

  if (!comparison.baselineEntry || !comparison.diff) {
    return null;
  }

  const locale = i18n.resolvedLanguage || i18n.language;
  const { baselineEntry, diff, assessment } = comparison;

  return (
    <div
      className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50/60 px-4 py-3"
      data-testid="agent-thread-reliability-memory-prefetch-baseline"
    >
      <div className="flex flex-wrap items-center gap-2">
        <div className="text-sm font-medium text-emerald-900">
          {text("title")}
        </div>
        <Badge
          variant="outline"
          className="border-slate-200 bg-white text-slate-700"
        >
          {resolveMemoryPrefetchHistorySourceLabel(
            baselineEntry.source,
            translate,
          )}
        </Badge>
        <span className="text-xs text-slate-600">
          {formatDiagnosticDateTime(baselineEntry.capturedAt, locale) ||
            text("unknownTime")}
        </span>
      </div>
      {baselineEntry.userMessage ? (
        <div className="mt-2 text-sm leading-6 text-slate-700">
          {text("baselineInput", { value: baselineEntry.userMessage })}
        </div>
      ) : null}
      {assessment ? (
        <div className="mt-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              className={resolveAssessmentBadgeClassName(assessment.status)}
            >
              {formatMemoryPrefetchAssessmentStatusLabel(
                assessment.status,
                translate,
              )}
            </Badge>
            <span className="text-sm leading-6 text-slate-700">
              {describeMemoryPrefetchAssessment(assessment, translate)}
            </span>
          </div>
        </div>
      ) : null}
      {diff.changed ? (
        <>
          <div className="mt-3 text-xs font-medium text-emerald-700">
            {text("changesTitle")}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {diff.layerChanges.rulesDelta !== 0 ? (
              <Badge
                variant="outline"
                className="border-emerald-200 bg-white text-emerald-700"
              >
                {text("numericLayerDelta", {
                  layer: text("layer.rules"),
                  sign: diff.layerChanges.rulesDelta > 0 ? "+" : "",
                  value: diff.layerChanges.rulesDelta,
                })}
              </Badge>
            ) : null}
            {diff.layerChanges.workingChanged !== "same" ? (
              <Badge
                variant="outline"
                className="border-emerald-200 bg-white text-emerald-700"
              >
                {text("hitLayerDelta", {
                  layer: text("layer.working"),
                  change: formatMemoryPrefetchHitChange(
                    diff.layerChanges.workingChanged,
                    translate,
                  ),
                })}
              </Badge>
            ) : null}
            {diff.layerChanges.durableDelta !== 0 ? (
              <Badge
                variant="outline"
                className="border-emerald-200 bg-white text-emerald-700"
              >
                {text("numericLayerDelta", {
                  layer: text("layer.durable"),
                  sign: diff.layerChanges.durableDelta > 0 ? "+" : "",
                  value: diff.layerChanges.durableDelta,
                })}
              </Badge>
            ) : null}
            {diff.layerChanges.teamDelta !== 0 ? (
              <Badge
                variant="outline"
                className="border-emerald-200 bg-white text-emerald-700"
              >
                {text("numericLayerDelta", {
                  layer: text("layer.team"),
                  sign: diff.layerChanges.teamDelta > 0 ? "+" : "",
                  value: diff.layerChanges.teamDelta,
                })}
              </Badge>
            ) : null}
            {diff.layerChanges.compactionChanged !== "same" ? (
              <Badge
                variant="outline"
                className="border-emerald-200 bg-white text-emerald-700"
              >
                {text("hitLayerDelta", {
                  layer: text("layer.compaction"),
                  change: formatMemoryPrefetchHitChange(
                    diff.layerChanges.compactionChanged,
                    translate,
                  ),
                })}
              </Badge>
            ) : null}
          </div>
          {diff.previewChanges.length > 0 ? (
            <div className="mt-3 space-y-1.5 text-sm leading-6 text-slate-700">
              {diff.previewChanges.slice(0, 3).map((change, index) => (
                <p key={`${change.key}:${index}`}>
                  {resolveMemoryPrefetchPreviewChangeLabel(change, translate)}
                </p>
              ))}
            </div>
          ) : null}
        </>
      ) : (
        <div className="mt-2 text-sm leading-6 text-slate-700">
          {text("noChange")}
        </div>
      )}
    </div>
  );
}
