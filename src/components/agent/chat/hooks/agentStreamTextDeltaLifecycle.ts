import type { AgentEvent } from "@/lib/api/agentProtocol";
import { isAgentMessageFinalAnswerPhase } from "../utils/agentMessagePhase";
import type { StreamRequestState } from "./agentStreamRuntimeHandlerTypes";

export type TextDeltaAgentEvent = Extract<
  AgentEvent,
  { type: "text_delta" | "text_delta_batch" }
>;

export type TextSegmentFinalEligibility =
  | "explicit_final"
  | "item_scoped_legacy"
  | "legacy_unphased";

function normalizeOptionalText(value?: string | null): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function isLegacyFinalFallbackEligibility(
  eligibility: TextSegmentFinalEligibility | null,
): eligibility is "item_scoped_legacy" | "legacy_unphased" {
  return (
    eligibility === "item_scoped_legacy" ||
    eligibility === "legacy_unphased"
  );
}

function isUnscopedLegacyFinalFallbackEligibility(
  eligibility: TextSegmentFinalEligibility | null,
): eligibility is "legacy_unphased" {
  return eligibility === "legacy_unphased";
}

export function resolveTextSegmentFinalEligibility(
  event: TextDeltaAgentEvent,
): TextSegmentFinalEligibility | null {
  const phase = normalizeOptionalText(event.phase);
  if (phase) {
    return isAgentMessageFinalAnswerPhase(phase) ? "explicit_final" : null;
  }
  return normalizeOptionalText(event.itemId)
    ? "item_scoped_legacy"
    : "legacy_unphased";
}

export function shouldRouteTextDeltaToFinalOverlay(params: {
  event: TextDeltaAgentEvent;
  requestState: StreamRequestState;
}): boolean {
  const eligibility = resolveTextSegmentFinalEligibility(params.event);
  if (eligibility === "explicit_final") {
    return true;
  }
  if (isLegacyFinalFallbackEligibility(eligibility)) {
    return !params.requestState.hasFinalAnswerRequiredProcessBoundary;
  }
  return false;
}

export function shouldSuppressLegacyTextDeltaAfterProcessBoundary(params: {
  event: TextDeltaAgentEvent;
  requestState: StreamRequestState;
}): boolean {
  if (!params.requestState.hasFinalAnswerRequiredProcessBoundary) {
    return false;
  }
  const eligibility = resolveTextSegmentFinalEligibility(params.event);
  return isLegacyFinalFallbackEligibility(eligibility);
}

export function noteActiveFinalTextSegment(params: {
  event: TextDeltaAgentEvent;
  requestState: StreamRequestState;
}): void {
  if (typeof params.requestState.activeTextSegmentStartOffset !== "number") {
    params.requestState.activeTextSegmentStartOffset =
      params.requestState.accumulatedContent.length;
  }
  params.requestState.activeTextSegmentFinalEligibility =
    resolveTextSegmentFinalEligibility(params.event);
}

export function shouldCommitActiveTextSegmentAsFinal(
  requestState: StreamRequestState,
): boolean {
  const eligibility = requestState.activeTextSegmentFinalEligibility;
  if (eligibility === "explicit_final" || eligibility === "item_scoped_legacy") {
    return eligibility === "explicit_final"
      ? true
      : !requestState.hasFinalAnswerRequiredProcessBoundary;
  }
  if (eligibility === "legacy_unphased") {
    return !requestState.hasFinalAnswerRequiredProcessBoundary;
  }
  return !requestState.hasFinalAnswerRequiredProcessBoundary;
}

export function hasActiveTextSegmentProvenance(
  requestState: StreamRequestState,
): boolean {
  return Boolean(
    normalizeOptionalText(requestState.activeTextSegmentItemId) ||
      normalizeOptionalText(requestState.activeTextSegmentPhase) ||
      normalizeOptionalText(requestState.activeTextSegmentTurnId) ||
      typeof requestState.activeTextSegmentSequence === "number",
  );
}

export function resolveAccumulatedContentBeforeActiveTextSegment(
  requestState: StreamRequestState,
): string {
  const content = requestState.accumulatedContent || "";
  const startOffset = requestState.activeTextSegmentStartOffset;
  if (
    typeof startOffset !== "number" ||
    !Number.isFinite(startOffset) ||
    startOffset <= 0
  ) {
    return "";
  }
  return content.slice(0, Math.min(startOffset, content.length));
}

export function resolveAccumulatedFinalContentForCompletion(
  requestState: StreamRequestState,
): string {
  const content = requestState.accumulatedContent || "";
  if (
    !requestState.hasFinalAnswerRequiredProcessBoundary ||
    requestState.hasAssistantTextAfterLatestFinalAnswerRequiredProcessBoundary !==
      true ||
    requestState.activeTextSegmentFinalEligibility !== "explicit_final"
  ) {
    return content;
  }

  const startOffset = requestState.activeTextSegmentStartOffset;
  if (
    typeof startOffset !== "number" ||
    !Number.isFinite(startOffset) ||
    startOffset <= 0
  ) {
    return content;
  }

  return content.slice(Math.min(startOffset, content.length));
}

export function clearActiveTextSegmentState(
  requestState: StreamRequestState,
): void {
  requestState.activeTextSegmentItemId = null;
  requestState.activeTextSegmentPhase = null;
  requestState.activeTextSegmentSequence = null;
  requestState.activeTextSegmentTurnId = null;
  requestState.activeTextSegmentStartOffset = null;
  requestState.activeTextSegmentFinalEligibility = null;
}
