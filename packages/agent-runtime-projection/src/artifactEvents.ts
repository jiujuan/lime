import type {
  AgentUiProjectionContext,
  AgentUiProjectionEvent,
  AgentUiProjectionSourceType,
} from "@limecloud/agent-ui-contracts";

import { buildAgentUiProjectionBase } from "./envelope.js";
import { definedString, metadataKeys } from "./normalization.js";

export interface AgentUiArtifactSnapshotProjectionInput {
  sourceType?: AgentUiProjectionSourceType | string;
  artifactId: string;
  filePath?: string | null;
  content?: string | null;
  metadata?: Record<string, unknown> | null;
}

export function buildAgentUiArtifactSnapshotEvent(
  input: AgentUiArtifactSnapshotProjectionInput,
  context: AgentUiProjectionContext = {},
): AgentUiProjectionEvent {
  const complete = input.metadata?.complete;
  const isComplete = complete === undefined ? true : complete !== false;
  const artifactId = definedString(input.artifactId);
  const artifactPath = definedString(input.filePath ?? undefined);

  return {
    ...buildAgentUiProjectionBase(
      { sourceType: input.sourceType ?? "artifact_snapshot" },
      context,
    ),
    type: isComplete ? "artifact.preview.ready" : "artifact.updated",
    artifactId,
    owner: "artifact",
    scope: "artifact",
    phase: isComplete ? "completed" : "producing",
    surface: "artifact_workspace",
    persistence: "artifact_store",
    payload: {
      filePath: artifactPath,
      contentLength: input.content?.length ?? 0,
      complete: isComplete,
      metadataKeys: metadataKeys(input.metadata),
    },
    refs: {
      ...(artifactId ? { artifactIds: [artifactId] } : {}),
      ...(artifactPath ? { artifactPaths: [artifactPath] } : {}),
    },
  };
}
