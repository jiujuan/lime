import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { AgentRuntimeThreadReadModel } from "@/lib/api/agentRuntime";
import type { ExecutionPolicyFocusContext } from "@/types/page";
import { Settings2 } from "lucide-react";
import {
  buildRuntimePolicySourceParts,
  buildRuntimeSandboxBackendParts,
  resolveRuntimePolicyEvidence,
  type RuntimePolicyEvidence,
} from "../utils/runtimePolicyEvidence";

const policyEvidenceGridClassName =
  "grid min-w-0 gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,14rem),1fr))]";

interface PolicyEvidenceText {
  title: string;
  policy: string;
  policyProfile: string;
  policySources: string;
  sandbox: string;
  sandboxBackend: string;
  network: string;
  networkDecision: string;
  failure: string;
  openSettings: string;
  summary: string;
  none: string;
  unknown: string;
}

interface AgentThreadPolicyEvidenceCardProps {
  threadRead?: AgentRuntimeThreadReadModel | null;
  decisionReason?: string | null;
  fallbackChain?: string[];
  labels: PolicyEvidenceText;
  onOpenExecutionPolicySettings?: (
    context?: ExecutionPolicyFocusContext,
  ) => void;
}

function renderEvidenceList(value: string[] | null | undefined): string | null {
  if (!value || value.length === 0) {
    return null;
  }
  return value.join(" · ");
}

function joinEvidenceParts(
  evidence: RuntimePolicyEvidence,
  fields: Array<keyof RuntimePolicyEvidence>,
): string | null {
  const value = fields
    .map((field) => evidence[field])
    .filter((item): item is string => typeof item === "string" && Boolean(item))
    .join(" · ");
  return value || null;
}

export function AgentThreadPolicyEvidenceCard({
  threadRead,
  decisionReason,
  fallbackChain = [],
  labels,
  onOpenExecutionPolicySettings,
}: AgentThreadPolicyEvidenceCardProps) {
  const evidence = resolveRuntimePolicyEvidence({
    threadRead,
    decisionReason,
    fallbackChain,
  });
  const policyDetails = joinEvidenceParts(evidence, [
    "decisionReason",
    "primaryBlockingKind",
    "primaryBlockingSummary",
    "interruptReason",
    "policyName",
  ]);
  const networkDetails = joinEvidenceParts(evidence, [
    "networkRuleId",
    "networkRuleTarget",
    "networkRuleSource",
    "networkRiskLevel",
    "networkRiskReason",
    "networkHost",
    "networkUrl",
  ]);
  const fallbackText = renderEvidenceList(evidence.fallbackChain);
  const policySourceText = renderEvidenceList(
    buildRuntimePolicySourceParts(evidence),
  );
  const sandboxBackendText = renderEvidenceList(
    buildRuntimeSandboxBackendParts(evidence),
  );
  const executionPolicyFocus: ExecutionPolicyFocusContext | undefined =
    evidence.networkRuleId ||
    evidence.networkHost ||
    evidence.networkUrl ||
    evidence.networkDecision
      ? {
          section: "network",
          ruleId: evidence.networkRuleId ?? undefined,
          target:
            evidence.networkRuleTarget === "host" ||
            evidence.networkRuleTarget === "url"
              ? evidence.networkRuleTarget
              : evidence.networkHost
                ? "host"
                : evidence.networkUrl
                  ? "url"
                  : undefined,
          value:
            evidence.networkHost ??
            evidence.networkUrl ??
            evidence.networkRuleId ??
            undefined,
          reasonCode:
            evidence.networkRiskReason ??
            evidence.networkDecision?.reasonCode ??
            undefined,
        }
      : undefined;

  if (!evidence.shouldRender) {
    return null;
  }

  return (
    <div
      className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3"
      data-testid="agent-thread-reliability-policy-evidence"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-medium text-foreground">
          {labels.title}
        </div>
        {onOpenExecutionPolicySettings ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-auto min-h-7 min-w-0 border-amber-200 bg-white px-2 py-1 text-xs text-amber-800 hover:bg-amber-50"
            onClick={() =>
              onOpenExecutionPolicySettings?.(executionPolicyFocus)
            }
          >
            <Settings2 className="mr-1 h-3.5 w-3.5" />
            {labels.openSettings}
          </Button>
        ) : null}
      </div>
      <div
        className={`${policyEvidenceGridClassName} mt-3 text-sm text-amber-900`}
      >
        <div className="rounded-xl border border-amber-100 bg-white px-3 py-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              className="border-amber-200 bg-amber-50 text-amber-700"
            >
              {labels.policy}
            </Badge>
            {evidence.policyProfile ? (
              <Badge
                variant="outline"
                className="border-slate-200 bg-white text-slate-700"
              >
                {evidence.policyProfile}
              </Badge>
            ) : null}
          </div>
          <div className="mt-2 space-y-1 break-words text-xs leading-5 text-amber-800">
            {policyDetails ? (
              <div>{policyDetails}</div>
            ) : (
              <div>{labels.none}</div>
            )}
            {policySourceText ? (
              <div>
                <span className="font-medium">{labels.policySources}:</span>{" "}
                {policySourceText}
              </div>
            ) : null}
          </div>
        </div>
        <div className="rounded-xl border border-amber-100 bg-white px-3 py-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              className="border-amber-200 bg-amber-50 text-amber-700"
            >
              {labels.sandbox}
            </Badge>
            {evidence.sandboxPolicy ? (
              <span className="text-xs font-medium text-amber-800">
                {evidence.sandboxPolicy}
              </span>
            ) : null}
          </div>
          <div className="mt-2 space-y-1 break-words text-xs leading-5 text-amber-800">
            {sandboxBackendText ? (
              <div>
                <span className="font-medium">{labels.sandboxBackend}:</span>{" "}
                {sandboxBackendText}
              </div>
            ) : null}
            {networkDetails ? (
              <div>
                <span className="font-medium">{labels.network}:</span>{" "}
                {networkDetails}
              </div>
            ) : null}
            {evidence.networkDecision ? (
              <div>
                <span className="font-medium">{labels.networkDecision}:</span>{" "}
                {[
                  evidence.networkDecision.status,
                  evidence.networkDecision.reasonCode,
                  evidence.networkDecision.summary,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            ) : null}
            {evidence.latestWarning ? (
              <div>{evidence.latestWarning}</div>
            ) : null}
            {fallbackText ? (
              <div>
                {labels.summary}: {fallbackText}
              </div>
            ) : null}
          </div>
        </div>
      </div>
      {evidence.policyProfile ||
      evidence.policyName ||
      evidence.sandboxPolicy ? (
        <div className="mt-2 text-[11px] leading-5 text-amber-900">
          {labels.failure}:{" "}
          {evidence.policyProfile ||
            evidence.policyName ||
            evidence.sandboxPolicy ||
            labels.unknown}
        </div>
      ) : null}
    </div>
  );
}
