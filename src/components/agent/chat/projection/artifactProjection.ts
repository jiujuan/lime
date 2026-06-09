import type {
  AgentEventArtifactSnapshot,
  AgentEventContextTrace,
} from "@/lib/api/agentProtocol";
import type {
  AgentUiProjectionContext,
  AgentUiProjectionEvent,
} from "@limecloud/agent-ui-contracts";
import {
  metadataKeys,
  truncateText,
} from "@limecloud/agent-runtime-projection";
import { buildAgentUiProjectionBase as buildBase } from "./projectionBase";

export function buildArtifactEvent(
  event: AgentEventArtifactSnapshot,
  context: AgentUiProjectionContext,
): AgentUiProjectionEvent {
  const metadata = event.artifact.metadata;
  const complete = metadata?.complete;
  const isComplete = complete === undefined ? true : complete !== false;
  return {
    ...buildBase(event, context),
    type: isComplete ? "artifact.preview.ready" : "artifact.updated",
    artifactId: event.artifact.artifactId,
    owner: "artifact",
    scope: "artifact",
    phase: isComplete ? "completed" : "producing",
    surface: "artifact_workspace",
    persistence: "artifact_store",
    payload: {
      filePath: event.artifact.filePath,
      contentLength: event.artifact.content?.length ?? 0,
      complete: isComplete,
      metadataKeys: metadataKeys(metadata),
    },
    refs: {
      artifactIds: [event.artifact.artifactId],
      ...(event.artifact.filePath
        ? { artifactPaths: [event.artifact.filePath] }
        : {}),
    },
  };
}

export function buildContextTraceEvent(
  event: AgentEventContextTrace,
  context: AgentUiProjectionContext,
): AgentUiProjectionEvent {
  return {
    ...buildBase(event, context),
    type: "context.changed",
    owner: "context",
    scope: "turn",
    phase: "preparing",
    surface: "runtime_status",
    persistence: "snapshot",
    payload: {
      stepCount: event.steps.length,
      latestStage: event.steps[event.steps.length - 1]?.stage,
      latestDetailPreview: truncateText(
        event.steps[event.steps.length - 1]?.detail,
      ),
    },
  };
}
