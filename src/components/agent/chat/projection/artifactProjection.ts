import type {
  AgentEventArtifactSnapshot,
  AgentEventContextTrace,
} from "@/lib/api/agentProtocol";
import type {
  AgentUiProjectionContext,
  AgentUiProjectionEvent,
} from "@limecloud/agent-ui-contracts";
import {
  buildAgentUiArtifactSnapshotEvent,
  buildAgentUiContextTraceEvent,
} from "@limecloud/agent-runtime-projection";

export function buildArtifactEvent(
  event: AgentEventArtifactSnapshot,
  context: AgentUiProjectionContext,
): AgentUiProjectionEvent {
  return buildAgentUiArtifactSnapshotEvent(
    {
      sourceType: event.type,
      artifactId: event.artifact.artifactId,
      filePath: event.artifact.filePath,
      content: event.artifact.content,
      metadata: event.artifact.metadata,
    },
    context,
  );
}

export function buildContextTraceEvent(
  event: AgentEventContextTrace,
  context: AgentUiProjectionContext,
): AgentUiProjectionEvent {
  return buildAgentUiContextTraceEvent(
    {
      sourceType: event.type,
      steps: event.steps,
    },
    context,
  );
}
