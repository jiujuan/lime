import type { AgentThreadItem } from "../../types";
import type { AgentThreadOrderedBlock } from "../../utils/agentThreadGrouping";
import { resolveRequiredAgentChatCopy } from "../../utils/agentChatCopy";
import { hasAnyPrefix } from "./textFormatting";
import {
  resolveCollaborationDefaultTitle,
  resolveCollaborationFallback,
  resolveCollaborationPreviewLine,
  resolveCollaborationStatusLabel,
  resolveCollaborationTitle,
} from "./collaborationCopy";

type TimelineStatus = AgentThreadItem["status"];
type TimelineBlockKind = AgentThreadOrderedBlock["kind"];
type ContextCompactionItem = Extract<
  AgentThreadItem,
  { type: "context_compaction" }
>;

function resolveTimelineCopy(
  key: string,
  values: Record<string, unknown> = {},
): string {
  return resolveRequiredAgentChatCopy(`threadTimeline.${key}`, values);
}

function splitKnownPrefixes(value: string): string[] {
  return value
    .split("||")
    .map((prefix) => prefix.trimStart())
    .filter(Boolean);
}

export function resolveTimelineItemStatusLabel(status: TimelineStatus): string {
  switch (status) {
    case "in_progress":
      return resolveTimelineCopy("status.running");
    case "failed":
      return resolveTimelineCopy("status.failed");
    case "completed":
    default:
      return resolveTimelineCopy("status.completed");
  }
}

export function resolveTimelineSubagentStatusLabel(
  statusLabel: string | undefined,
  status: TimelineStatus,
): string {
  return resolveCollaborationStatusLabel(statusLabel, status);
}

export function resolveTimelineTurnSummaryTitle(
  status: TimelineStatus,
): string {
  return resolveTimelineCopy(
    status === "in_progress"
      ? "turnSummary.title.running"
      : "turnSummary.title.completed",
  );
}

export function resolveTimelineReasoningTitle(status: TimelineStatus): string {
  return resolveTimelineCopy(
    status === "in_progress"
      ? "reasoning.title.running"
      : "reasoning.title.completed",
  );
}

export function resolveTimelinePlanTitle(status: TimelineStatus): string {
  return resolveTimelineCopy(
    status === "in_progress" ? "plan.title.running" : "plan.title.completed",
  );
}

export function resolveTimelineContextCompactionParts(
  item: ContextCompactionItem,
): {
  detail: string;
  title: string;
  triggerLabel: string;
} {
  const isCompleted = item.stage === "completed" || item.status === "completed";
  const triggerLabel = resolveTimelineCopy(
    item.trigger === "manual"
      ? "contextCompaction.trigger.manual"
      : item.trigger === "overflow"
        ? "contextCompaction.trigger.overflow"
        : item.trigger === "auto"
          ? "contextCompaction.trigger.auto"
          : "contextCompaction.trigger.default",
  );
  const title = resolveTimelineCopy(
    isCompleted
      ? "contextCompaction.title.completed"
      : "contextCompaction.title.running",
  );
  const detail =
    item.detail?.trim() ||
    resolveTimelineCopy(
      isCompleted
        ? "contextCompaction.detail.completed"
        : "contextCompaction.detail.running",
    );

  return { detail, title, triggerLabel };
}

export function resolveTimelineTechnicalSummary(count: number): string {
  return resolveTimelineCopy("technicalSummary", { count });
}

export function resolveTimelinePreviewLine(
  kind: TimelineBlockKind,
  line: string,
): string {
  const trimmed = line.trim();
  if (!trimmed) {
    return line;
  }

  const previewKeyByKind: Partial<Record<TimelineBlockKind, string>> = {
    alert: "alert",
    approval: "approval",
    artifact: "artifact",
  };
  if (kind === "subagent") {
    return resolveCollaborationPreviewLine(kind, line);
  }

  const previewKey = previewKeyByKind[kind];
  if (!previewKey) {
    return trimmed;
  }

  const knownPrefixes = splitKnownPrefixes(
    resolveTimelineCopy(`preview.${previewKey}.knownPrefixes`),
  );
  if (hasAnyPrefix(trimmed, knownPrefixes)) {
    return trimmed;
  }

  return resolveTimelineCopy(`preview.${previewKey}.prefix`, {
    text: trimmed,
  });
}

export function resolveTimelineApprovalFallback(
  status: TimelineStatus,
): string {
  return resolveTimelineCopy(
    status === "completed" ? "approval.completed" : "approval.pending",
  );
}

export function resolveTimelineAlertFallback(status: TimelineStatus): string {
  return resolveTimelineCopy(
    status === "failed" ? "alert.failed" : "alert.warning",
  );
}

export function resolveTimelineSubagentFallback(
  status: TimelineStatus,
): string {
  return resolveCollaborationFallback(status);
}

export function resolveTimelineSubagentDefaultTitle(): string {
  return resolveCollaborationDefaultTitle();
}

export function resolveTimelineSubagentTitle(title: string): string {
  return resolveCollaborationTitle(title);
}

export function resolveTimelinePendingStatusLabel(): string {
  return resolveTimelineCopy("status.pending");
}

export function resolveTimelineConfirmedStatusLabel(): string {
  return resolveTimelineCopy("status.confirmed");
}

export function resolveTimelinePausedStatusLabel(): string {
  return resolveTimelineCopy("status.paused");
}

export function resolveTimelinePendingActionDetail(): string {
  return resolveTimelineCopy("hint.pendingDetail");
}

export function resolveTimelineRuntimeConfirmationPendingDetail(): string {
  return resolveTimelineCopy("hint.runtimeConfirmationPending");
}

export function resolveTimelineRuntimeConfirmationSubmittedDetail(): string {
  return resolveTimelineCopy("hint.runtimeConfirmationSubmitted");
}

export function resolveTimelinePausedDetail(): string {
  return resolveTimelineCopy("hint.pausedDetail");
}

export function resolveTimelineProcessMixLabel(params: {
  thinkingCount: number;
  toolCount: number;
}): string | null {
  const parts: string[] = [];
  if (params.toolCount > 0) {
    parts.push(
      resolveTimelineCopy("processMix.tools", { count: params.toolCount }),
    );
  }
  if (params.thinkingCount > 0) {
    parts.push(
      resolveTimelineCopy("processMix.thinking", {
        count: params.thinkingCount,
      }),
    );
  }

  if (parts.length === 0) {
    return null;
  }

  return parts.join(resolveTimelineCopy("processMix.separator"));
}
