import type {
  AgentUiProjectionContext,
  AgentUiProjectionEvent,
  AgentUiRuntimeStatus,
} from "@limecloud/agent-ui-contracts";
import { definedString } from "@limecloud/agent-runtime-projection";
import { buildAgentUiRemoteTaskProjectionEvents } from "./remoteTaskAgentUiProjection";

export type AgentUiRemoteTeammateProjectionEvent =
  | "created"
  | "updated"
  | "needs_input"
  | "auth_required"
  | "artifact_updated"
  | "completed"
  | "failed"
  | "cancelled";

export interface AgentUiRemoteTeammateProjectionInput {
  event: AgentUiRemoteTeammateProjectionEvent;
  remoteTaskId: string;
  sessionId?: string | null;
  threadId?: string | null;
  runId?: string | null;
  taskId?: string | null;
  agentId?: string | null;
  agentName?: string | null;
  agentCardId?: string | null;
  agentCardUrl?: string | null;
  provider?: string | null;
  status?: string | null;
  summaryPreview?: string | null;
  inputRequired?: boolean;
  authRequired?: boolean;
  artifactIds?: string[];
  artifactPaths?: string[];
  timestamp?: string | null;
}

export function buildAgentUiRemoteTeammateProjectionEvents(
  input: AgentUiRemoteTeammateProjectionInput,
  context: AgentUiProjectionContext = {},
): AgentUiProjectionEvent[] {
  const artifactIds = input.artifactIds ?? [];
  const artifactPaths = input.artifactPaths ?? [];

  return buildAgentUiRemoteTaskProjectionEvents(
    {
      remoteTaskId: input.remoteTaskId,
      event: input.event,
      taskId: input.taskId,
      title: input.agentName ?? input.summaryPreview,
      inputSummary: input.summaryPreview,
      inputRequired: input.inputRequired,
      authRequired: input.authRequired,
      authStatus: input.event === "auth_required" ? "auth_required" : undefined,
      status: normalizeRemoteTeammateRuntimeStatus(input.status),
      agentCard: {
        id: input.agentCardId ?? input.agentId,
        name: input.agentName,
        provider: input.provider,
        url: input.agentCardUrl,
      },
      artifacts: artifactIds.map((artifactId, index) => ({
        artifactId,
        artifactPath: artifactPaths[index],
      })),
      timestamp: input.timestamp,
      sessionId: input.sessionId,
      threadId: input.threadId,
      runId: input.runId,
    },
    context,
  );
}

function normalizeRemoteTeammateRuntimeStatus(
  status: string | null | undefined,
): AgentUiRuntimeStatus | null {
  switch (definedString(status)) {
    case "idle":
      return "idle";
    case "queued":
      return "queued";
    case "submitted":
      return "submitted";
    case "accepted":
      return "accepted";
    case "preparing":
      return "preparing";
    case "running":
      return "running";
    case "waiting":
      return "waiting";
    case "needs_input":
      return "needs_input";
    case "plan_ready":
      return "plan_ready";
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    case "aborted":
      return "aborted";
    case "cancelled":
      return "cancelled";
    case "closed":
      return "closed";
    case "not_found":
      return "not_found";
    case "unknown":
      return "unknown";
    default:
      return null;
  }
}
