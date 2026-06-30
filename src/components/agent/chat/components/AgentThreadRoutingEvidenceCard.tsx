import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Settings2 } from "lucide-react";
import {
  buildProviderSettingsFocusFromRoutingEvidence,
  formatDiagnosticDurationMs,
  type RuntimeRoutingEvidence,
} from "../utils/runtimeRoutingEvidence";
import type { ProviderSettingsFocusContext } from "@/types/page";

const routingEvidenceGridClassName =
  "grid min-w-0 gap-2 [grid-template-columns:repeat(auto-fit,minmax(min(100%,10rem),1fr))]";

interface RoutingEvidenceText {
  appliedFallback: string;
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
  requestedModel: string;
  selectedModel: string;
  providerReadiness: string;
  providerReadinessKeys: string;
  providerReadinessOpenSettings: string;
  providerReadinessProviderType: string;
  providerReadinessRecovery: string;
  routingAttempts: string;
  modelRegistry: string;
  modelRegistryAlias: string;
  modelRegistryCapabilities: string;
  modelRegistryReasoning: string;
  title: string;
  unknown: string;
}

interface AgentThreadRoutingEvidenceCardProps {
  evidence: RuntimeRoutingEvidence;
  decisionReason?: string | null;
  fallbackChain?: string[];
  oemPolicy?: unknown;
  labels: RoutingEvidenceText;
  onOpenProviderSettings?: (context?: ProviderSettingsFocusContext) => void;
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

function providerReadinessStatusClassName(status?: string | null): string {
  if (status === "ready") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (status === "blocked") {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }
  if (status === "needs_setup") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }
  return "border-slate-200 bg-white text-slate-700";
}

export function AgentThreadRoutingEvidenceCard({
  evidence,
  decisionReason,
  fallbackChain = [],
  oemPolicy,
  labels,
  onOpenProviderSettings,
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
  const requestedModel =
    [evidence.requestedSelectionProvider, evidence.requestedSelectionModel]
      .filter(Boolean)
      .join("/") ||
    [evidence.requestedProvider, evidence.requestedModel]
      .filter(Boolean)
      .join("/") ||
    labels.unknown;
  const policyModel = policy?.defaultModel || policy?.selectedModel || null;
  const providerSettingsFocus =
    buildProviderSettingsFocusFromRoutingEvidence(evidence);

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
            <div className={`${routingEvidenceGridClassName} mt-2 text-xs`}>
              <div>
                <div className="text-muted-foreground">
                  {labels.selectedModel}
                </div>
                <div className="mt-0.5 break-all font-medium text-foreground">
                  {selectedModel}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">
                  {labels.requestedModel}
                </div>
                <div className="mt-0.5 break-all font-medium text-foreground">
                  {requestedModel}
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
            {evidence.fallbackApplied === true ||
            evidence.routingAttempts.length > 0 ? (
              <div className="mt-3 border-t border-sky-100 pt-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  {evidence.fallbackApplied === true ? (
                    <Badge
                      variant="outline"
                      className="border-sky-200 bg-sky-50 text-sky-700"
                    >
                      {labels.appliedFallback}
                    </Badge>
                  ) : null}
                  {evidence.routingAttempts.length > 0 ? (
                    <span className="text-xs font-medium text-foreground">
                      {labels.routingAttempts}
                    </span>
                  ) : null}
                </div>
                {evidence.routingAttempts.length > 0 ? (
                  <div className="mt-2 space-y-1 text-xs leading-5 text-slate-700">
                    {evidence.routingAttempts.map((attempt, index) => (
                      <div key={`${attempt.slot || "slot"}-${index}`}>
                        <span className="font-medium text-foreground">
                          {attempt.slot || labels.fallbackSlot}
                        </span>
                        {": "}
                        {[
                          [attempt.provider, attempt.model]
                            .filter(Boolean)
                            .join("/"),
                          attempt.providerReadinessStatus,
                          attempt.providerReadinessReason,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
            {evidence.providerReadinessSource ||
            evidence.providerReadinessStatus ||
            evidence.providerReadinessReason ||
            evidence.providerReadinessProviderType ||
            evidence.providerReadinessKeySummary ||
            evidence.providerReadinessRecoveryAction ? (
              <div className="mt-3 border-t border-sky-100 pt-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium text-foreground">
                    {labels.providerReadiness}
                  </span>
                  {evidence.providerReadinessStatus ? (
                    <Badge
                      variant="outline"
                      className={providerReadinessStatusClassName(
                        evidence.providerReadinessStatus,
                      )}
                    >
                      {evidence.providerReadinessStatus}
                    </Badge>
                  ) : null}
                  {evidence.providerReadinessSource ? (
                    <Badge
                      variant="outline"
                      className="border-slate-200 bg-white text-slate-700"
                    >
                      {evidence.providerReadinessSource}
                    </Badge>
                  ) : null}
                  {evidence.providerReadinessReason ? (
                    <span className="min-w-0 break-words text-xs text-muted-foreground">
                      {evidence.providerReadinessReason}
                    </span>
                  ) : null}
                  {evidence.providerReadinessRecoveryAction &&
                  onOpenProviderSettings ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-auto min-h-7 min-w-0 border-slate-300 bg-white px-2 py-1 text-xs text-slate-700"
                      onClick={() =>
                        onOpenProviderSettings(providerSettingsFocus)
                      }
                    >
                      <Settings2 className="mr-1 h-3.5 w-3.5" />
                      {labels.providerReadinessOpenSettings}
                    </Button>
                  ) : null}
                </div>
                <div className={`${routingEvidenceGridClassName} mt-2 text-xs`}>
                  {evidence.providerReadinessProviderType ? (
                    <div>
                      <div className="text-muted-foreground">
                        {labels.providerReadinessProviderType}
                      </div>
                      <div className="mt-0.5 break-all font-medium text-foreground">
                        {evidence.providerReadinessProviderType}
                      </div>
                    </div>
                  ) : null}
                  {evidence.providerReadinessKeySummary ? (
                    <div>
                      <div className="text-muted-foreground">
                        {labels.providerReadinessKeys}
                      </div>
                      <div className="mt-0.5 break-words font-medium text-foreground">
                        {evidence.providerReadinessKeySummary}
                      </div>
                    </div>
                  ) : null}
                  {evidence.providerReadinessRecoveryAction ? (
                    <div>
                      <div className="text-muted-foreground">
                        {labels.providerReadinessRecovery}
                      </div>
                      <div className="mt-0.5 break-all font-medium text-foreground">
                        {evidence.providerReadinessRecoveryAction}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}
            {evidence.modelRegistrySource ||
            evidence.modelRegistryReason ||
            evidence.modelRegistryCapabilityTags.length > 0 ||
            evidence.modelRegistryAlias ||
            evidence.modelRegistryReasoning ? (
              <div className="mt-3 border-t border-sky-100 pt-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium text-foreground">
                    {labels.modelRegistry}
                  </span>
                  {evidence.modelRegistrySource ? (
                    <Badge
                      variant="outline"
                      className="border-slate-200 bg-white text-slate-700"
                    >
                      {evidence.modelRegistrySource}
                    </Badge>
                  ) : null}
                  {evidence.modelRegistryReason ? (
                    <span className="min-w-0 break-words text-xs text-muted-foreground">
                      {evidence.modelRegistryReason}
                    </span>
                  ) : null}
                </div>
                <div className={`${routingEvidenceGridClassName} mt-2 text-xs`}>
                  {evidence.modelRegistryCapabilityTags.length > 0 ? (
                    <div>
                      <div className="text-muted-foreground">
                        {labels.modelRegistryCapabilities}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {evidence.modelRegistryCapabilityTags.map((tag) => (
                          <Badge
                            key={tag}
                            variant="outline"
                            className="border-emerald-200 bg-emerald-50 text-emerald-700"
                          >
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {evidence.modelRegistryAlias ||
                  evidence.modelRegistryReasoning ? (
                    <div>
                      {evidence.modelRegistryAlias ? (
                        <div>
                          <div className="text-muted-foreground">
                            {labels.modelRegistryAlias}
                          </div>
                          <div className="mt-0.5 break-all font-medium text-foreground">
                            {evidence.modelRegistryAlias}
                          </div>
                        </div>
                      ) : null}
                      {evidence.modelRegistryReasoning ? (
                        <div
                          className={
                            evidence.modelRegistryAlias ? "mt-2" : undefined
                          }
                        >
                          <div className="text-muted-foreground">
                            {labels.modelRegistryReasoning}
                          </div>
                          <div className="mt-0.5 font-medium text-foreground">
                            {evidence.modelRegistryReasoning}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
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
