import type { WorkspaceArticleWorkspaceActionIntent } from "./workspaceArticleWorkspaceModel";
import { resolveWorkspaceArticleWorkspaceActionOutputArtifactKind } from "./workspaceArticleWorkspaceActionOutputKind";
import { resolveWorkspaceArticleObjectArtifactIds } from "./workspaceArticleWorkspaceObjectArtifacts";
import { buildWorkspacePluginPaneActionRequestMetadata } from "./workspacePluginPaneAction";

export function buildWorkspaceArticleWorkspaceActionRequestMetadata(
  intent: WorkspaceArticleWorkspaceActionIntent,
): Record<string, unknown> {
  const artifactIds = resolveWorkspaceArticleObjectArtifactIds(intent.object);
  const editedMarkdown = intent.editedMarkdown?.trim() || null;
  const outputArtifactKind =
    resolveWorkspaceArticleWorkspaceActionOutputArtifactKind(intent);
  const paneActionMetadata = buildWorkspacePluginPaneActionRequestMetadata({
    action: intent.action,
    appId: intent.articleWorkspace.appId,
    sessionId: intent.articleWorkspace.sessionId,
    workspaceId: intent.articleWorkspace.workspaceId ?? null,
    prompt: intent.prompt,
    outputArtifactKind,
    paneKind: intent.object.ref.kind,
    surfaceKind: "articleWorkspace",
    source: "right_surface_article_workspace",
    sourceArtifactIds: artifactIds,
    object: {
      app_id: intent.object.ref.appId,
      kind: intent.object.ref.kind,
      id: intent.object.ref.id,
      session_id: intent.object.ref.sessionId,
      version: intent.object.ref.version ?? null,
      title: intent.object.title,
      status: intent.object.status,
      artifact_ids: artifactIds,
      preview_artifact_id: intent.object.previewArtifactId ?? null,
      source_turn_id: intent.object.ref.sourceTurnId ?? null,
      source_task_id: intent.object.ref.sourceTaskId ?? null,
    },
  });
  const panePlugin =
    typeof paneActionMetadata.plugin === "object" &&
    paneActionMetadata.plugin !== null
      ? (paneActionMetadata.plugin as Record<string, unknown>)
      : {};
  return {
    plugin: {
      ...panePlugin,
      source: "right_surface_article_workspace",
      app_id: intent.articleWorkspace.appId,
      session_id: intent.articleWorkspace.sessionId,
      workspace_id: intent.articleWorkspace.workspaceId ?? null,
      article_workspace_action: {
        key: intent.action.key,
        intent: intent.action.intent,
        risk: intent.action.risk,
        task_kind: intent.action.taskKind ?? null,
        output_artifact_kind: outputArtifactKind,
        prompt: intent.prompt,
        edited_markdown: editedMarkdown,
        object: {
          app_id: intent.object.ref.appId,
          kind: intent.object.ref.kind,
          id: intent.object.ref.id,
          session_id: intent.object.ref.sessionId,
          version: intent.object.ref.version ?? null,
          title: intent.object.title,
          status: intent.object.status,
          artifact_ids: artifactIds,
          preview_artifact_id: intent.object.previewArtifactId ?? null,
          source_turn_id: intent.object.ref.sourceTurnId ?? null,
          source_task_id: intent.object.ref.sourceTaskId ?? null,
        },
      },
    },
    right_surface: {
      surface_kind: "articleWorkspace",
      pane_kind: intent.object.ref.kind,
      source: intent.articleWorkspace.source,
      action_key: intent.action.key,
    },
  };
}
