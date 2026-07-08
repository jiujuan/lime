import type { AgentRuntimeOutcomeView } from "@/lib/api/agentRuntime";
import type { AgentThreadTurn } from "../types";
import { isRuntimePermissionConfirmationWaitMessage } from "./runtimeActionConfirmation";
import {
  createThreadReliabilityViewTextContext,
  formatTimeLabel,
  normalizeText,
  shortenText,
  viewText,
} from "./threadReliabilityText";
import type {
  ThreadReliabilityOutcomeDisplay,
  ThreadReliabilityTone,
  ThreadReliabilityViewTextContext,
} from "./threadReliabilityTypes";

export function resolveOutcomeTone(
  outcomeType?: string,
): ThreadReliabilityTone {
  const normalized = (outcomeType || "").toLowerCase();
  if (normalized.includes("complete")) {
    return "completed";
  }
  if (normalized.includes("interrupt") || normalized.includes("abort")) {
    return "paused";
  }
  if (normalized.includes("wait")) {
    return "waiting";
  }
  if (normalized.includes("fail") || normalized.includes("error")) {
    return "failed";
  }
  return "neutral";
}

export function resolveOutcomeLabel(
  outcomeType: string | undefined,
  context: ThreadReliabilityViewTextContext = createThreadReliabilityViewTextContext(
    {},
  ),
): string {
  const normalized = (outcomeType || "").toLowerCase();
  if (normalized.includes("complete")) {
    return viewText(context, "outcome.label.completed", "Completed");
  }
  if (normalized.includes("interrupt") || normalized.includes("abort")) {
    return viewText(context, "outcome.label.interrupted", "Interrupted");
  }
  if (normalized.includes("provider")) {
    return viewText(context, "outcome.label.providerFailed", "Provider failed");
  }
  if (normalized.includes("tool")) {
    return viewText(context, "outcome.label.toolFailed", "Tool failed");
  }
  if (normalized.includes("wait") && normalized.includes("approval")) {
    return viewText(
      context,
      "outcome.label.waitingApproval",
      "Waiting for approval",
    );
  }
  if (normalized.includes("wait") && normalized.includes("user")) {
    return viewText(context, "outcome.label.waitingUser", "Waiting for input");
  }
  if (normalized.includes("fail") || normalized.includes("error")) {
    return viewText(context, "outcome.label.failed", "Failed");
  }
  return viewText(context, "outcome.label.recent", "Latest result");
}

function deriveOutcomeFromTurn(
  latestTurn: AgentThreadTurn | null,
  context: ThreadReliabilityViewTextContext,
): ThreadReliabilityOutcomeDisplay | null {
  if (!latestTurn) {
    return null;
  }

  if (latestTurn.status === "completed") {
    return {
      label: viewText(context, "outcome.label.completed", "Completed"),
      summary: viewText(
        context,
        "outcome.summary.completed",
        "The latest turn completed successfully",
      ),
      retryable: false,
      endedAtLabel: formatTimeLabel(latestTurn.completed_at, context),
      tone: "completed",
      outcomeType: "completed",
    };
  }

  if (latestTurn.status === "failed") {
    if (isRuntimePermissionConfirmationWaitMessage(latestTurn.error_message)) {
      return {
        label: viewText(context, "status.waiting", "Waiting"),
        summary: viewText(
          context,
          "outcome.summary.permissionWait",
          "This turn is waiting for runtime permission confirmation",
        ),
        retryable: true,
        endedAtLabel: formatTimeLabel(latestTurn.completed_at, context),
        tone: "waiting",
        outcomeType: "waiting_permission",
      };
    }

    return {
      label: viewText(context, "outcome.label.failed", "Failed"),
      summary:
        normalizeText(latestTurn.error_message) ||
        viewText(
          context,
          "outcome.summary.failedFallback",
          "The latest turn failed",
        ),
      primaryCause: normalizeText(latestTurn.error_message),
      retryable: true,
      endedAtLabel: formatTimeLabel(latestTurn.completed_at, context),
      tone: "failed",
      outcomeType: "failed",
    };
  }

  if (latestTurn.status === "aborted") {
    return {
      label: viewText(context, "outcome.label.interrupted", "Interrupted"),
      summary: viewText(
        context,
        "outcome.summary.aborted",
        "The latest turn was interrupted",
      ),
      retryable: true,
      endedAtLabel: formatTimeLabel(latestTurn.completed_at, context),
      tone: "paused",
      outcomeType: "aborted",
    };
  }

  return null;
}

export function normalizeOutcome(
  outcome: AgentRuntimeOutcomeView | null | undefined,
  latestTurn: AgentThreadTurn | null,
  context: ThreadReliabilityViewTextContext,
): ThreadReliabilityOutcomeDisplay | null {
  if (!outcome) {
    return deriveOutcomeFromTurn(latestTurn, context);
  }

  return {
    label: resolveOutcomeLabel(outcome.outcome_type, context),
    summary:
      shortenText(outcome.summary, 72) ||
      shortenText(outcome.primary_cause, 72) ||
      viewText(context, "outcome.summary.updated", "Latest result updated"),
    primaryCause: shortenText(outcome.primary_cause, 72),
    retryable: Boolean(outcome.retryable),
    endedAtLabel: formatTimeLabel(outcome.ended_at, context),
    tone: resolveOutcomeTone(outcome.outcome_type),
    outcomeType: outcome.outcome_type,
  };
}
