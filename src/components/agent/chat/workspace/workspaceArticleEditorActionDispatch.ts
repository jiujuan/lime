import type { HandleSendOptions } from "../hooks/handleSendTypes";
import type { WorkspaceArticleWorkspaceActionIntent } from "./workspaceArticleWorkspaceModel";
import { buildWorkspaceArticleWorkspaceActionRequestMetadata } from "./workspaceArticleWorkspaceActionRequestMetadata";
import { resolveWorkspaceArticleWorkspaceActionOutputArtifactKind } from "./workspaceArticleWorkspaceActionOutputKind";

export type SubmitWorkspaceArticleEditorAction = (
  prompt: string,
  options: HandleSendOptions,
) => Promise<boolean>;

export interface SubmitWorkspaceArticleEditorActionIntentParams {
  intent: WorkspaceArticleWorkspaceActionIntent;
  submit: SubmitWorkspaceArticleEditorAction;
  restoreInput?: (prompt: string) => void;
}

function readObjectArtifactIds(
  intent: WorkspaceArticleWorkspaceActionIntent,
): string[] {
  return [
    ...(intent.object.ref.artifactIds ?? []),
    intent.object.previewArtifactId,
  ].filter((value): value is string => Boolean(value?.trim()));
}

export function buildWorkspaceArticleEditorActionSystemPrompt(
  intent: WorkspaceArticleWorkspaceActionIntent,
): string {
  const artifactIds = readObjectArtifactIds(intent);
  const outputArtifactKind =
    resolveWorkspaceArticleWorkspaceActionOutputArtifactKind(intent);
  return [
    "本轮请求来自右侧 Article Editor action。",
    "Source: right_surface_article_workspace",
    `App: ${intent.articleWorkspace.appId}`,
    `Session: ${intent.articleWorkspace.sessionId}`,
    intent.articleWorkspace.workspaceId
      ? `Workspace: ${intent.articleWorkspace.workspaceId}`
      : null,
    `Object: ${intent.object.ref.kind}/${intent.object.ref.id}`,
    `Object title: ${intent.object.title}`,
    `Action: ${intent.action.key}`,
    `Action intent: ${intent.action.intent}`,
    `Action risk: ${intent.action.risk}`,
    intent.action.taskKind ? `Task kind: ${intent.action.taskKind}` : null,
    artifactIds.length
      ? `Source artifact ids: ${artifactIds.join(", ")}`
      : null,
    outputArtifactKind ? `Output artifact kind: ${outputArtifactKind}` : null,
    intent.editedMarkdown?.trim()
      ? [
          "Current edited article markdown:",
          "```markdown",
          intent.editedMarkdown.trim(),
          "```",
        ].join("\n")
      : null,
    "必须执行该右侧产物 action，不要把它当作普通聊天、插件搜索、skill_search 或 SkillTool 执行请求。",
    "中间对话可以说明执行过程；结构化产物必须进入 artifact.snapshot，payload 或 metadata 中包含可投影到 Article Editor / right surface 的 workspace patch。",
    "如果无法完成 action，仍需返回可读失败说明，并保留原对象引用，不能伪造成功的 workspace patch。",
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
}

export async function submitWorkspaceArticleEditorActionIntent({
  intent,
  restoreInput,
  submit,
}: SubmitWorkspaceArticleEditorActionIntentParams): Promise<boolean> {
  const normalizedPrompt = intent.prompt.trim();
  if (!normalizedPrompt) {
    return false;
  }

  const sent = await submit(normalizedPrompt, {
    displayContent: normalizedPrompt,
    requestMetadata:
      buildWorkspaceArticleWorkspaceActionRequestMetadata(intent),
    systemPromptOverride: buildWorkspaceArticleEditorActionSystemPrompt(intent),
    skipSceneCommandRouting: true,
    searchMode: "disabled",
    explicitToolPreferences: true,
  });
  if (!sent) {
    restoreInput?.(normalizedPrompt);
  }
  return sent;
}
