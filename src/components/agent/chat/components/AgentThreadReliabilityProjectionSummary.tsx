import { Bot } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  formatAgentUiProjectionEventDetail,
  formatAgentUiProjectionEventType,
  formatAgentUiProjectionPhase,
  type AgentUiProjectionSummary,
  type AgentUiProjectionTranslation,
} from "../projection/agentUiProjectionSummary";

interface AgentThreadReliabilityProjectionSummaryLabels {
  artifact: string;
  action: string;
  count: string;
  diagnostics: string;
  evidence: string;
  latestEventPrefix: string;
  source: string;
  task: string;
  title: string;
}

interface AgentThreadReliabilityProjectionSummaryProps {
  labels: AgentThreadReliabilityProjectionSummaryLabels;
  summary: AgentUiProjectionSummary;
  translateProjection: AgentUiProjectionTranslation;
}

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-sky-100 bg-white px-3 py-2">
      <div className="text-[11px] text-sky-700">{label}</div>
      <div className="mt-1 text-lg font-semibold text-sky-950">{value}</div>
    </div>
  );
}

export function AgentThreadReliabilityProjectionSummary({
  labels,
  summary,
  translateProjection,
}: AgentThreadReliabilityProjectionSummaryProps) {
  if (summary.total <= 0) {
    return null;
  }

  return (
    <div
      className="mt-4 rounded-2xl border border-sky-200 bg-sky-50/70 px-4 py-3"
      data-testid="agent-thread-reliability-agentui-projection"
    >
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 text-sm font-medium text-sky-900">
          <Bot className="h-4 w-4" />
          <span>{labels.title}</span>
        </div>
        <Badge variant="outline" className="border-sky-300 bg-white text-sky-700">
          {labels.count}
        </Badge>
        <span className="text-xs text-sky-800">{labels.source}</span>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <MetricCard label={labels.action} value={summary.actionCount} />
        <MetricCard label={labels.task} value={summary.taskCount} />
        <MetricCard label={labels.artifact} value={summary.artifactCount} />
        <MetricCard label={labels.evidence} value={summary.evidenceCount} />
        <MetricCard
          label={labels.diagnostics}
          value={summary.diagnosticsCount}
        />
      </div>
      {summary.latestEvent ? (
        <div className="mt-3 text-xs leading-5 text-sky-900">
          {labels.latestEventPrefix}
          {formatAgentUiProjectionEventType(
            summary.latestEvent.type,
            translateProjection,
          )}
          {" · "}
          {formatAgentUiProjectionPhase(
            summary.latestEvent.phase,
            translateProjection,
          )}
          {" · "}
          {formatAgentUiProjectionEventDetail(summary.latestEvent)}
        </div>
      ) : null}
    </div>
  );
}
