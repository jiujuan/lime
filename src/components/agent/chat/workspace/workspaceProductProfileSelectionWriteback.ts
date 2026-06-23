import type { AgentRuntimeUpdateSessionRequest } from "@/lib/api/agentRuntime/types";
import type {
  WorkspaceProductObject,
  WorkspaceProductObjectRef,
  WorkspaceProductProfile,
} from "./workspaceProductProfileModel";

export interface WorkspaceProductProfileSelectionChange {
  profile: WorkspaceProductProfile;
  object: WorkspaceProductObject;
}

export function buildWorkspaceProductProfileSelectionUpdateRequest({
  object,
  profile,
}: WorkspaceProductProfileSelectionChange): AgentRuntimeUpdateSessionRequest | null {
  const sessionId = profile.sessionId.trim();
  if (!sessionId) {
    return null;
  }
  return {
    session_id: sessionId,
    product_workspace_selected_object_ref: productObjectRefToUpdatePayload(
      object.ref,
    ),
  };
}

function productObjectRefToUpdatePayload(
  ref: WorkspaceProductObjectRef,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    appId: ref.appId,
    kind: ref.kind,
    id: ref.id,
    sessionId: ref.sessionId,
  };
  if (ref.version) {
    payload.version = ref.version;
  }
  if (ref.artifactIds && ref.artifactIds.length > 0) {
    payload.artifactIds = ref.artifactIds;
  }
  if (ref.sourceTurnId) {
    payload.sourceTurnId = ref.sourceTurnId;
  }
  if (ref.sourceTaskId) {
    payload.sourceTaskId = ref.sourceTaskId;
  }
  return payload;
}
