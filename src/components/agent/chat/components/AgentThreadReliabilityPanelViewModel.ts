import type {
  AgentRuntimeThreadReadModel,
  AgentRuntimeSummary,
} from "@/lib/api/agentRuntime";
import type { TeamMemoryShadowRequestMetadata } from "@/lib/teamMemorySync";
import type { AgentThreadTurn } from "../types";
import type { RuntimeRoutingEvidence } from "../utils/runtimeRoutingEvidence";
import type { ThreadReliabilityTone } from "../utils/threadReliabilityView";

export function serializeReliabilityClipboardPayload(value: unknown): string {
  return JSON.stringify(
    value,
    (_key, item) => (item instanceof Date ? item.toISOString() : item),
    2,
  );
}

export function resolveToneClassName(tone: ThreadReliabilityTone): string {
  switch (tone) {
    case "running":
      return "border-sky-200 bg-sky-50 text-sky-700";
    case "waiting":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "completed":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "failed":
      return "border-rose-200 bg-rose-50 text-rose-700";
    case "paused":
      return "border-slate-200 bg-slate-50 text-slate-700";
    default:
      return "border-slate-200 bg-slate-50 text-slate-700";
  }
}

export function resolveStatShellClassName(tone: ThreadReliabilityTone): string {
  switch (tone) {
    case "running":
      return "border-sky-200/80 bg-sky-50";
    case "waiting":
      return "border-amber-200/80 bg-amber-50";
    case "completed":
      return "border-emerald-200/80 bg-emerald-50";
    case "failed":
      return "border-rose-200/80 bg-rose-50";
    case "paused":
      return "border-slate-200/80 bg-slate-50";
    default:
      return "border-slate-200/80 bg-slate-50";
  }
}

function resolveRuntimeSummaryFallbackChain(
  runtimeSummary: AgentRuntimeSummary | null,
): string[] | null {
  const value = (runtimeSummary as { fallbackChain?: unknown } | null)
    ?.fallbackChain;
  if (!Array.isArray(value)) {
    return null;
  }
  return value.filter((item): item is string => typeof item === "string");
}

export function resolveRuntimeFallbackChain(
  threadRead: AgentRuntimeThreadReadModel | null | undefined,
  runtimeRoutingEvidence: Pick<RuntimeRoutingEvidence, "fallbackChain">,
): string[] {
  if (Array.isArray(threadRead?.fallback_chain)) {
    return threadRead.fallback_chain || [];
  }

  const runtimeSummaryFallback = resolveRuntimeSummaryFallbackChain(
    threadRead?.runtime_summary || null,
  );
  if (runtimeSummaryFallback) {
    return runtimeSummaryFallback;
  }

  return runtimeRoutingEvidence.fallbackChain;
}

export function resolveRuntimeDecisionReason(
  threadRead: AgentRuntimeThreadReadModel | null | undefined,
  runtimeRoutingEvidence: Pick<RuntimeRoutingEvidence, "decisionReason">,
): string | null {
  return (
    threadRead?.decision_reason ||
    ((threadRead?.runtime_summary as { decisionReason?: string | null } | null)
      ?.decisionReason ??
      runtimeRoutingEvidence.decisionReason)
  );
}

export function resolveLatestTurnPrompt(
  turns: AgentThreadTurn[],
  currentTurnId?: string | null,
): string {
  const activeTurn =
    turns.find((turn) => turn.id === currentTurnId) || turns[turns.length - 1];
  return activeTurn?.prompt_text?.trim() || "";
}

export function resolveTeamMemoryShadowKey(
  metadata?: TeamMemoryShadowRequestMetadata | null,
): string {
  if (!metadata) {
    return "";
  }
  return [
    metadata.repo_scope,
    ...metadata.entries.map((entry) => `${entry.key}:${entry.updated_at}`),
  ].join("|");
}
