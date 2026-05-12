import { Badge } from "@/components/ui/badge";
import {
  formatDiagnosticDurationMs,
  type RuntimeRoutingEvidence,
} from "../utils/runtimeRoutingEvidence";

interface RoutingEvidenceText {
  decisionReason: string;
  evidence: string;
  fallbackSlot: string;
  fallbackChain: string;
  firstText: string;
  firstThinking: string;
  firstVisible: string;
  oemLocked: string;
  oemModelPrefix: string;
  oemQuotaLow: string;
  selectedModel: string;
  title: string;
  unknown: string;
}

interface AgentThreadRoutingEvidenceCardProps {
  evidence: RuntimeRoutingEvidence;
  decisionReason?: string | null;
  fallbackChain?: string[];
  oemPolicy?: unknown;
  labels: RoutingEvidenceText;
}

function asOemPolicyRecord(value: unknown): {
  locked?: boolean | null;
  quotaLow?: boolean | null;
  defaultModel?: string | null;
  selectedModel?: string | null;
} | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as {
        locked?: boolean | null;
        quotaLow?: boolean | null;
        defaultModel?: string | null;
        selectedModel?: string | null;
      })
    : null;
}

export function AgentThreadRoutingEvidenceCard({
  evidence,
  decisionReason,
  fallbackChain = [],
  oemPolicy,
  labels,
}: AgentThreadRoutingEvidenceCardProps) {
  const policy = asOemPolicyRecord(oemPolicy);
  if (
    !decisionReason &&
    fallbackChain.length === 0 &&
    !policy &&
    !evidence.shouldRender
  ) {
    return null;
  }

  const selectedModel =
    [evidence.selectedProvider, evidence.selectedModel]
      .filter(Boolean)
      .join("/") || labels.unknown;
  const policyModel = policy?.defaultModel || policy?.selectedModel || null;

  return (
    <div
      className="mt-4 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3"
      data-testid="agent-thread-reliability-routing-evidence"
    >
      <div className="text-sm font-medium text-foreground">{labels.title}</div>
      <div className="mt-3 space-y-2 text-sm text-slate-700">
        {evidence.shouldRender ? (
          <div className="rounded-xl border border-sky-100 bg-white px-3 py-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant="outline"
                className="border-sky-200 bg-sky-50 text-sky-700"
              >
                {evidence.serviceModelSlot || labels.fallbackSlot}
              </Badge>
              {evidence.decisionSource ? (
                <Badge
                  variant="outline"
                  className="border-slate-200 bg-white text-slate-700"
                >
                  {evidence.decisionSource}
                </Badge>
              ) : null}
              {evidence.settingsSource ? (
                <span className="text-xs text-muted-foreground">
                  {evidence.settingsSource}
                </span>
              ) : null}
            </div>
            <div className="mt-2 grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <div className="text-muted-foreground">
                  {labels.selectedModel}
                </div>
                <div className="mt-0.5 font-medium text-foreground">
                  {selectedModel}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">
                  {labels.firstVisible}
                </div>
                <div className="mt-0.5 font-medium text-foreground">
                  {formatDiagnosticDurationMs(evidence.firstVisibleDeltaMs) ||
                    labels.unknown}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">
                  {labels.firstThinking}
                </div>
                <div className="mt-0.5 font-medium text-foreground">
                  {formatDiagnosticDurationMs(evidence.firstThinkingDeltaMs) ||
                    labels.unknown}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">{labels.firstText}</div>
                <div className="mt-0.5 font-medium text-foreground">
                  {formatDiagnosticDurationMs(evidence.firstTextDeltaMs) ||
                    labels.unknown}
                </div>
              </div>
            </div>
            {evidence.timingSource ||
            evidence.runStatus ||
            evidence.runDurationMs != null ? (
              <div className="mt-2 text-[11px] leading-5 text-muted-foreground">
                {labels.evidence}:{" "}
                {[
                  evidence.timingSource,
                  evidence.runStatus,
                  formatDiagnosticDurationMs(evidence.runDurationMs),
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            ) : null}
          </div>
        ) : null}
        {decisionReason ? (
          <div>
            <span className="font-medium text-foreground">
              {labels.decisionReason}:
            </span>{" "}
            {decisionReason}
          </div>
        ) : null}
        {fallbackChain.length > 0 ? (
          <div>
            <span className="font-medium text-foreground">
              {labels.fallbackChain}:
            </span>{" "}
            {fallbackChain.join(" → ")}
          </div>
        ) : null}
        {policy ? (
          <div className="flex flex-wrap gap-2">
            {policy.locked ? (
              <Badge
                variant="outline"
                className="border-amber-300 bg-white text-amber-700"
              >
                {labels.oemLocked}
              </Badge>
            ) : null}
            {policy.quotaLow ? (
              <Badge
                variant="outline"
                className="border-orange-300 bg-white text-orange-700"
              >
                {labels.oemQuotaLow}
              </Badge>
            ) : null}
            {policyModel ? (
              <span className="text-xs text-muted-foreground">
                {labels.oemModelPrefix} {policyModel}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
