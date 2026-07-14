import type { AgentThreadItem } from "../../types";
import type { AgentThreadOrderedBlock } from "../../utils/agentThreadGrouping";
import { resolveRequiredAgentChatCopy } from "../../utils/agentChatCopy";
import { hasAnyPrefix } from "./textFormatting";

type TimelineStatus = AgentThreadItem["status"];
type TimelineBlockKind = AgentThreadOrderedBlock["kind"];

function resolveCollaborationCopy(
  key: string,
  values: Record<string, unknown> = {},
): string {
  return resolveRequiredAgentChatCopy(`collaboration.${key}`, values);
}

function resolveThreadTimelineCopy(
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

export function resolveCollaborationOpenSubagentLabel(): string {
  return resolveCollaborationCopy("openSubagent");
}

export function resolveCollaborationStatusLabel(
  statusLabel: string | undefined,
  status: TimelineStatus,
): string {
  const normalized = statusLabel?.trim().toLowerCase();
  switch (normalized) {
    case "started":
      return resolveCollaborationCopy("status.started");
    case "interacted":
      return resolveCollaborationCopy("status.interacted");
    case "interrupted":
      return resolveCollaborationCopy("status.interrupted");
    case "queued":
      return resolveCollaborationCopy("status.queued");
    case "running":
      return resolveCollaborationCopy("status.running");
    case "completed":
      return resolveCollaborationCopy("status.completed");
    case "failed":
      return resolveCollaborationCopy("status.failed");
    case "aborted":
      return resolveCollaborationCopy("status.paused");
    default:
      return resolveThreadTimelineCopy(
        status === "in_progress"
          ? "status.running"
          : status === "failed"
            ? "status.failed"
            : "status.completed",
      );
  }
}

export function resolveCollaborationPreviewLine(
  kind: TimelineBlockKind,
  line: string,
): string {
  if (kind !== "subagent") {
    return line.trim();
  }

  const trimmed = line.trim();
  if (!trimmed) {
    return line;
  }

  const knownPrefixes = splitKnownPrefixes(
    resolveCollaborationCopy("preview.knownPrefixes"),
  );
  if (hasAnyPrefix(trimmed, knownPrefixes)) {
    return trimmed;
  }

  return resolveCollaborationCopy("preview.prefix", { text: trimmed });
}

export function resolveCollaborationFallback(status: TimelineStatus): string {
  return resolveCollaborationCopy(
    status === "completed" ? "fallback.completed" : "fallback.running",
  );
}

export function resolveCollaborationDefaultTitle(): string {
  return resolveCollaborationCopy("defaultTitle");
}

export function resolveCollaborationTitle(title: string): string {
  return resolveCollaborationCopy("title", { title });
}
