import type { AgentUiPhase } from "@limecloud/agent-ui-contracts";
import { definedString } from "@limecloud/agent-runtime-projection";

export function normalizeEvidenceProjectionPhase(
  status: string | undefined,
): AgentUiPhase {
  return status === "failed" || status === "error"
    ? "failed"
    : status === "completed" || status === "ready"
      ? "completed"
      : "acting";
}

export function normalizeHandoffProjectionPhase(
  status: string | undefined,
): AgentUiPhase {
  switch (definedString(status)) {
    case "accepted":
      return "accepted";
    case "active":
    case "running":
      return "acting";
    case "returned":
      return "reconciling";
    case "resumed":
    case "completed":
    case "ready":
      return "completed";
    case "failed":
    case "error":
      return "failed";
    case "cancelled":
      return "cancelled";
    case "handoff_requested":
    case "requested":
    case "pending":
      return "waiting";
    default:
      return normalizeEvidenceProjectionPhase(status);
  }
}
