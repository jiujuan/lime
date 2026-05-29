import type { AgentToolCallState as ToolCallState } from "@/lib/api/agentProtocol";
import type { AgentThreadItem } from "../../types";

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

export function resolveItemStatusLabel(status: AgentThreadItem["status"]): string {
  switch (status) {
    case "in_progress":
      return "执行中";
    case "failed":
      return "失败";
    case "completed":
    default:
      return "已完成";
  }
}

export function resolveSubagentStatusLabel(
  statusLabel: string | undefined,
  status: AgentThreadItem["status"],
): string {
  const normalized = statusLabel?.trim().toLowerCase();
  switch (normalized) {
    case "queued":
      return "稍后开始";
    case "running":
      return "处理中";
    case "completed":
      return "已完成";
    case "failed":
      return "失败";
    case "aborted":
      return "已暂停";
    default:
      return statusLabel || resolveItemStatusLabel(status);
  }
}
