import type { AgentRuntimeUpdateSessionRequest } from "@/lib/api/agentRuntime/types";
import type {
  WorkspaceArticleObject,
  WorkspaceArticleObjectRef,
  WorkspaceArticleWorkspace,
} from "./workspaceArticleWorkspaceModel";

export interface WorkspaceArticleWorkspaceSelectionChange {
  articleWorkspace: WorkspaceArticleWorkspace;
  object: WorkspaceArticleObject;
}

export function buildWorkspaceArticleWorkspaceSelectionUpdateRequest({
  articleWorkspace,
  object,
}: WorkspaceArticleWorkspaceSelectionChange): AgentRuntimeUpdateSessionRequest | null {
  const sessionId = articleWorkspace.sessionId.trim();
  if (!sessionId) {
    return null;
  }
  return {
    session_id: sessionId,
    article_workspace_selected_object_ref: articleObjectRefToUpdatePayload(
      object.ref,
    ),
  };
}

function articleObjectRefToUpdatePayload(
  ref: WorkspaceArticleObjectRef,
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
