import type {
  AgentEvent,
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
import {
  buildRequestedFixExecutionEventsFromArtifact,
} from "./evidenceProjection";

type ArtifactProjectionEvent = Extract<
  AgentEvent,
  {
    type: "artifact_snapshot" | "context_trace";
  }
>;

export function buildArtifactProjectionEvents(
  event: ArtifactProjectionEvent,
  context: AgentUiProjectionContext,
): AgentUiProjectionEvent[] {
  switch (event.type) {
    case "artifact_snapshot":
      return [
        buildArtifactEvent(event, context),
        ...buildRequestedFixExecutionEventsFromArtifact(event, context),
      ];
    case "context_trace":
      return [buildContextTraceEvent(event, context)];
    default: {
      const exhaustive: never = event;
      return exhaustive;
    }
  }
}

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
