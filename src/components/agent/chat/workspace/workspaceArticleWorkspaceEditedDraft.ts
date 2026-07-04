import type { AgentRuntimeUpdateSessionRequest } from "@/lib/api/agentRuntime/types";
import type {
  WorkspaceArticleObject,
  WorkspaceArticleObjectRef,
  WorkspaceArticleWorkspace,
} from "./workspaceArticleWorkspaceModel";

export interface WorkspaceArticleEditedDraft {
  objectKey: string;
  markdown: string;
  updatedAt: string;
}

export interface WorkspaceArticleMarkdownChange {
  articleWorkspace: WorkspaceArticleWorkspace;
  markdown: string | null;
  object: WorkspaceArticleObject;
}

const INLINE_IMAGE_TASK_MARKER_RE =
  /(?:lime:image-task-slot:|pending-image-task:\/\/)/;
const RESOLVED_MARKDOWN_IMAGE_RE =
  /!\[[^\]]*]\((?!pending-image-task:\/\/)(?:https?:\/\/|file:\/\/|asset:\/\/|data:image\/)[^)]+\)/i;

export function buildWorkspaceArticleEditedDraftKey(
  object: WorkspaceArticleObject,
): string {
  return `${object.ref.appId}:${object.ref.sessionId}:${object.ref.kind}:${object.ref.id}`;
}

export function buildWorkspaceArticleEditedDraftFromChange(
  change: WorkspaceArticleMarkdownChange,
  now: () => Date = () => new Date(),
): WorkspaceArticleEditedDraft | null {
  const markdown = change.markdown?.trim();
  if (!markdown || change.object.ref.kind !== "articleDraft") {
    return null;
  }
  return {
    objectKey: buildWorkspaceArticleEditedDraftKey(change.object),
    markdown,
    updatedAt: now().toISOString(),
  };
}

export function markdownContainsWorkspaceArticleInlineImageTask(
  markdown: string | null | undefined,
): boolean {
  return INLINE_IMAGE_TASK_MARKER_RE.test(markdown ?? "");
}

function markdownContainsResolvedWorkspaceArticleImage(
  markdown: string | null | undefined,
): boolean {
  return RESOLVED_MARKDOWN_IMAGE_RE.test(markdown ?? "");
}

export function readWorkspaceArticleObjectMarkdown(
  object: WorkspaceArticleObject,
): string {
  const source = object.source ?? {};
  return readString(
    source.documentText,
    source.document_text,
    source.finalMarkdown,
    source.final_markdown,
    source.draftMarkdown,
    source.draft_markdown,
    source.markdown,
    source.content,
  );
}

export function shouldRejectWorkspaceArticleEditedDraftChange(params: {
  currentDraft: WorkspaceArticleEditedDraft | null;
  currentMarkdown?: string | null;
  nextDraft: WorkspaceArticleEditedDraft | null;
}): boolean {
  const { currentDraft, nextDraft } = params;
  if (!nextDraft) {
    return false;
  }
  const currentMarkdown =
    currentDraft?.objectKey === nextDraft.objectKey
      ? currentDraft.markdown
      : (params.currentMarkdown ?? "");
  if (!markdownContainsWorkspaceArticleInlineImageTask(currentMarkdown)) {
    return false;
  }
  return (
    !markdownContainsWorkspaceArticleInlineImageTask(nextDraft.markdown) &&
    !markdownContainsResolvedWorkspaceArticleImage(nextDraft.markdown)
  );
}

export function applyWorkspaceArticleEditedDraft(
  articleWorkspace: WorkspaceArticleWorkspace | null,
  editedDraft: WorkspaceArticleEditedDraft | null,
): WorkspaceArticleWorkspace | null {
  if (!articleWorkspace || !editedDraft) {
    return articleWorkspace;
  }

  let changed = false;
  const objects = articleWorkspace.objects.map((object) => {
    if (buildWorkspaceArticleEditedDraftKey(object) !== editedDraft.objectKey) {
      return object;
    }
    changed = true;
    return {
      ...object,
      source: {
        ...(object.source ?? {}),
        documentText: editedDraft.markdown,
        finalMarkdown: editedDraft.markdown,
        updatedAt: editedDraft.updatedAt,
      },
    };
  });

  if (!changed) {
    return articleWorkspace;
  }
  return {
    ...articleWorkspace,
    objects,
    updatedAt: editedDraft.updatedAt,
  };
}

export function readWorkspaceArticleEditedDraftFromUnknown(
  value: unknown,
): WorkspaceArticleEditedDraft | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }
  const markdown = readString(record.markdown).trim();
  const updatedAt = readString(record.updatedAt, record.updated_at).trim();
  const objectKey =
    readString(record.objectKey, record.object_key).trim() ||
    readObjectKeyFromRef(
      asRecord(record.objectRef) ?? asRecord(record.object_ref),
    );
  if (!objectKey || !markdown) {
    return null;
  }
  return {
    objectKey,
    markdown,
    updatedAt,
  };
}

export function buildWorkspaceArticleEditedDraftUpdateRequest(
  change: WorkspaceArticleMarkdownChange,
  editedDraft: WorkspaceArticleEditedDraft | null,
): AgentRuntimeUpdateSessionRequest | null {
  const sessionId = change.articleWorkspace.sessionId.trim();
  if (!sessionId || !editedDraft) {
    return null;
  }
  return {
    session_id: sessionId,
    article_workspace_selected_object_ref: articleObjectRefToUpdatePayload(
      change.object.ref,
    ),
    article_workspace_edited_draft: {
      objectKey: editedDraft.objectKey,
      objectRef: articleObjectRefToUpdatePayload(change.object.ref),
      markdown: editedDraft.markdown,
      documentText: editedDraft.markdown,
      finalMarkdown: editedDraft.markdown,
      updatedAt: editedDraft.updatedAt,
    },
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

function readObjectKeyFromRef(ref: Record<string, unknown> | null): string {
  if (!ref) {
    return "";
  }
  const appId = readString(ref.appId, ref.app_id).trim();
  const kind = readString(ref.kind).trim();
  const id = readString(ref.id).trim();
  const sessionId = readString(ref.sessionId, ref.session_id).trim();
  if (!appId || !kind || !id || !sessionId) {
    return "";
  }
  return `${appId}:${sessionId}:${kind}:${id}`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string") {
      return value;
    }
  }
  return "";
}
