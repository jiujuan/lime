import type { AgentToolCallState as ToolCallState } from "@/lib/api/agentProtocol";
import type { AgentThreadItem } from "../../types";
import {
  resolveTimelineItemStatusLabel,
  resolveTimelineSubagentStatusLabel,
} from "./timelineCopy";

export function mapItemStatus(
  status: AgentThreadItem["status"],
): ToolCallState["status"] {
  if (status === "failed") {
    return "failed";
  }
  return status === "completed" ? "completed" : "running";
}

export function resolveStatusBadgeVariant(
  status: AgentThreadItem["status"],
): "secondary" | "outline" | "destructive" {
  if (status === "failed") {
    return "destructive";
  }
  return status === "completed" ? "outline" : "secondary";
}

export function resolveItemStatusLabel(
  status: AgentThreadItem["status"],
): string {
  return resolveTimelineItemStatusLabel(status);
}

export function resolveSubagentStatusLabel(
  statusLabel: string | undefined,
  status: AgentThreadItem["status"],
): string {
  return resolveTimelineSubagentStatusLabel(statusLabel, status);
}

export function resolveSubagentStatusBadgeVariant(
  statusLabel: string | undefined,
  status: AgentThreadItem["status"],
): "secondary" | "outline" | "destructive" {
  switch (statusLabel?.trim().toLowerCase()) {
    case "started":
    case "interacted":
    case "queued":
    case "running":
      return "secondary";
    case "interrupted":
    case "failed":
    case "aborted":
      return "destructive";
    case "completed":
      return "outline";
    default:
      return resolveStatusBadgeVariant(status);
  }
}
