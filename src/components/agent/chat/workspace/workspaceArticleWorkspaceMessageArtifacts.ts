import type { Message } from "../types";
import type { Artifact, ArtifactStatus } from "@/lib/artifact/types";
import { upsertMessageArtifact } from "../utils/messageArtifacts";
import {
  buildWorkspaceArticleWorkspaceFromUnknown,
  buildWorkspaceArticleWorkspaceViewModel,
  hasWorkspaceArticleFinalDocument,
  selectWorkspaceArticleDraftObject,
  type WorkspaceArticleWorkspace,
} from "./workspaceArticleWorkspaceModel";
import { buildWorkspaceArticleWorkspacePreviewArtifact } from "./workspaceArticleWorkspacePreviewArtifact";
import {
  collectWorkspaceArticlePatchRecordsFromArtifactLike,
  hasWorkspaceArticlePatchMetadata,
  isWorkspaceArticlePatchArtifactKind,
  isWorkspaceArticlePatchRecord,
} from "./workspaceArticleWorkspaceMetadata";

export interface AttachWorkspaceArticleWorkspacePreviewArtifactParams {
  messages: Message[];
  articleWorkspace: WorkspaceArticleWorkspace | null;
  now?: number;
  status?: ArtifactStatus;
}

export function buildWorkspaceArticleWorkspaceFromMessageArtifacts(
  messages: readonly Message[],
): WorkspaceArticleWorkspace | null {
  if (!hasWorkspaceArticleWorkspaceMessageArtifactSignals(messages)) {
    return null;
  }
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    const artifacts = message?.artifacts ?? [];
    for (
      let artifactIndex = artifacts.length - 1;
      artifactIndex >= 0;
      artifactIndex -= 1
    ) {
      for (const candidate of workspacePatchCandidates(
        artifacts[artifactIndex],
      )) {
        const profile = buildWorkspaceArticleWorkspaceFromUnknown(
          candidate,
          "threadRead",
        );
        if (profile) {
          return profile;
        }
      }
    }
  }
  return null;
}

export function hasWorkspaceArticleWorkspaceMessageArtifactSignals(
  messages: readonly Message[],
): boolean {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const artifacts = messages[index]?.artifacts ?? [];
    for (
      let artifactIndex = artifacts.length - 1;
      artifactIndex >= 0;
      artifactIndex -= 1
    ) {
      if (hasWorkspacePatchSignal(artifacts[artifactIndex])) {
        return true;
      }
    }
  }
  return false;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function hasWorkspacePatchSignal(value: unknown): boolean {
  const record = asRecord(value);
  if (!record) {
    return false;
  }
  const artifact = asRecord(record.artifact);
  const meta = asRecord(record.meta);
  const metadata = asRecord(record.metadata);
  const artifactMetadata = asRecord(artifact?.metadata);
  return (
    isWorkspaceArticlePatchRecord(record) ||
    hasKnownWorkspacePatchFields(record) ||
    hasKnownWorkspacePatchFields(meta) ||
    hasKnownWorkspacePatchFields(metadata) ||
    hasKnownWorkspacePatchFields(artifact) ||
    hasKnownWorkspacePatchFields(artifactMetadata) ||
    hasWorkspacePatchKindSignal(record) ||
    hasWorkspacePatchKindSignal(meta) ||
    hasWorkspacePatchKindSignal(metadata) ||
    hasWorkspacePatchKindSignal(artifact) ||
    hasWorkspacePatchKindSignal(artifactMetadata)
  );
}

function hasKnownWorkspacePatchFields(
  record: Record<string, unknown> | null,
): boolean {
  if (!record) {
    return false;
  }
  return hasWorkspaceArticlePatchMetadata(record);
}

function hasWorkspacePatchKindSignal(
  record: Record<string, unknown> | null,
): boolean {
  if (!record) {
    return false;
  }
  const kind = readString(
    record.artifactKind,
    record.artifact_kind,
    record.kind,
    record.type,
    record.outputArtifactKind,
    record.output_artifact_kind,
  );
  if (!kind) {
    return false;
  }
  return isWorkspaceArticlePatchArtifactKind(kind);
}

function workspacePatchCandidates(value: unknown): Record<string, unknown>[] {
  return collectWorkspaceArticlePatchRecordsFromArtifactLike(value);
}

export function attachWorkspaceArticleWorkspacePreviewArtifactToMessages({
  articleWorkspace,
  messages,
  now,
  status,
}: AttachWorkspaceArticleWorkspacePreviewArtifactParams): Message[] {
  if (
    !articleWorkspace ||
    !hasWorkspaceArticleFinalDocument(articleWorkspace)
  ) {
    return messages;
  }

  const artifact = buildArticleWorkspacePreviewArtifact(
    articleWorkspace,
    now,
    status,
  );
  if (!artifact) {
    return messages;
  }

  const messagesWithoutStaleArtifacts =
    removeStaleArticleWorkspacePreviewArtifacts(messages, artifact);
  const targetMessageIndex = findLastStableAssistantMessageIndex(
    messagesWithoutStaleArtifacts,
  );
  if (targetMessageIndex >= 0) {
    const nextMessages = [...messagesWithoutStaleArtifacts];
    nextMessages[targetMessageIndex] = upsertMessageArtifact(
      nextMessages[targetMessageIndex],
      artifact,
    );
    return nextMessages;
  }

  return [
    ...messagesWithoutStaleArtifacts,
    {
      id: `article-workspace-preview:${artifact.id}`,
      role: "assistant",
      content: "",
      timestamp: new Date(now ?? artifact.updatedAt),
      artifacts: [artifact],
    },
  ];
}

interface ArticleWorkspaceArtifactIdentity {
  appId: string | null;
  sessionId: string | null;
  workspaceId: string | null;
  objectKind: string | null;
  objectId: string | null;
  artifactIds: Set<string>;
}

function removeStaleArticleWorkspacePreviewArtifacts(
  messages: readonly Message[],
  nextArtifact: Artifact,
): Message[] {
  const nextIdentity = buildArticleWorkspaceArtifactIdentity(nextArtifact);
  if (!nextIdentity) {
    return messages as Message[];
  }

  let changed = false;
  const nextMessages: Message[] = [];
  for (const message of messages) {
    const artifacts = message.artifacts ?? [];
    if (artifacts.length === 0) {
      nextMessages.push(message);
      continue;
    }

    const nextArtifacts = artifacts.filter(
      (artifact) =>
        !isStaleArticleWorkspacePreviewArtifact(
          artifact,
          nextArtifact,
          nextIdentity,
        ),
    );
    if (nextArtifacts.length === artifacts.length) {
      nextMessages.push(message);
      continue;
    }

    changed = true;
    if (shouldDropEmptyArticleWorkspacePreviewMessage(message, nextArtifacts)) {
      continue;
    }
    nextMessages.push({
      ...message,
      artifacts: nextArtifacts.length > 0 ? nextArtifacts : undefined,
    });
  }

  return changed ? nextMessages : (messages as Message[]);
}

function shouldDropEmptyArticleWorkspacePreviewMessage(
  message: Message,
  nextArtifacts: readonly Artifact[],
): boolean {
  return (
    message.role === "assistant" &&
    message.id.startsWith("article-workspace-preview:") &&
    message.content.trim().length === 0 &&
    nextArtifacts.length === 0
  );
}

function isStaleArticleWorkspacePreviewArtifact(
  candidate: Artifact,
  nextArtifact: Artifact,
  nextIdentity: ArticleWorkspaceArtifactIdentity,
): boolean {
  if (candidate.id === nextArtifact.id) {
    return true;
  }
  if (!isArticleWorkspaceVisibleArtifact(candidate)) {
    return false;
  }
  const candidateIdentity = buildArticleWorkspaceArtifactIdentity(candidate);
  return candidateIdentity
    ? isSameArticleWorkspaceArtifactIdentity(candidateIdentity, nextIdentity)
    : false;
}

function isArticleWorkspaceVisibleArtifact(artifact: Artifact): boolean {
  return (
    readString(artifact.meta.openedFrom, artifact.meta.opened_from) ===
    "right_surface_article_workspace"
  );
}

function buildArticleWorkspaceArtifactIdentity(
  artifact: Artifact,
): ArticleWorkspaceArtifactIdentity | null {
  const articleWorkspace = asRecord(artifact.meta.articleWorkspace);
  const workspacePatch = asRecord(artifact.meta.workspacePatch);
  const selectedObjectRef = asRecord(workspacePatch?.selectedObjectRef);
  const primaryObjectRef = asRecord(workspacePatch?.primaryObjectRef);
  const objectKind = readString(
    articleWorkspace?.objectKind,
    articleWorkspace?.object_kind,
    selectedObjectRef?.kind,
    primaryObjectRef?.kind,
  );
  const objectId = readString(
    articleWorkspace?.objectId,
    articleWorkspace?.object_id,
    selectedObjectRef?.id,
    primaryObjectRef?.id,
  );
  const appId = readString(
    articleWorkspace?.appId,
    articleWorkspace?.app_id,
    workspacePatch?.appId,
    workspacePatch?.app_id,
  );
  const sessionId = readString(
    articleWorkspace?.sessionId,
    articleWorkspace?.session_id,
    workspacePatch?.sessionId,
    workspacePatch?.session_id,
  );
  const workspaceId = readString(
    articleWorkspace?.workspaceId,
    articleWorkspace?.workspace_id,
    workspacePatch?.workspaceId,
    workspacePatch?.workspace_id,
  );
  const artifactIds = readStringSet(
    articleWorkspace?.artifactIds,
    articleWorkspace?.artifact_ids,
    selectedObjectRef?.artifactIds,
    selectedObjectRef?.artifact_ids,
  );

  if (!appId && !sessionId && !objectId && artifactIds.size === 0) {
    return null;
  }

  return {
    appId,
    sessionId,
    workspaceId,
    objectKind,
    objectId,
    artifactIds,
  };
}

function readStringSet(...values: unknown[]): Set<string> {
  const result = new Set<string>();
  for (const value of values) {
    if (!Array.isArray(value)) {
      continue;
    }
    for (const item of value) {
      if (typeof item === "string" && item.trim()) {
        result.add(item.trim());
      }
    }
  }
  return result;
}

function isSameArticleWorkspaceArtifactIdentity(
  left: ArticleWorkspaceArtifactIdentity,
  right: ArticleWorkspaceArtifactIdentity,
): boolean {
  if (
    left.appId &&
    right.appId &&
    left.appId !== right.appId
  ) {
    return false;
  }
  if (
    left.sessionId &&
    right.sessionId &&
    left.sessionId !== right.sessionId
  ) {
    return false;
  }
  if (
    left.workspaceId &&
    right.workspaceId &&
    left.workspaceId !== right.workspaceId
  ) {
    return false;
  }
  if (
    left.objectKind &&
    right.objectKind &&
    left.objectKind !== right.objectKind
  ) {
    return false;
  }
  if (left.objectId && right.objectId) {
    return left.objectId === right.objectId;
  }
  if (left.artifactIds.size > 0 && right.artifactIds.size > 0) {
    return hasStringSetIntersection(left.artifactIds, right.artifactIds);
  }
  return false;
}

function hasStringSetIntersection(left: Set<string>, right: Set<string>) {
  for (const value of left) {
    if (right.has(value)) {
      return true;
    }
  }
  return false;
}

function buildArticleWorkspacePreviewArtifact(
  articleWorkspace: WorkspaceArticleWorkspace,
  now?: number,
  status?: ArtifactStatus,
) {
  try {
    const previewWorkspace = selectArticlePreviewWorkspace(articleWorkspace);
    const viewModel = buildWorkspaceArticleWorkspaceViewModel(previewWorkspace);
    const artifact = buildWorkspaceArticleWorkspacePreviewArtifact({
      artifactIds: viewModel.selectedArtifactIds,
      layout: viewModel.selectedSurface.layout,
      object: viewModel.selectedObject,
      preview: viewModel.selectedPreview,
      articleWorkspace: previewWorkspace,
      now,
    });
    return artifact && status ? { ...artifact, status } : artifact;
  } catch {
    return null;
  }
}

function selectArticlePreviewWorkspace(
  articleWorkspace: WorkspaceArticleWorkspace,
): WorkspaceArticleWorkspace {
  const articleObject = selectWorkspaceArticleDraftObject(
    articleWorkspace.objects,
  );
  if (!articleObject) {
    return articleWorkspace;
  }
  return {
    ...articleWorkspace,
    selectedObjectRef: articleObject.ref,
  };
}

function findLastStableAssistantMessageIndex(
  messages: readonly Message[],
): number {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (
      message?.role === "assistant" &&
      !message.isThinking &&
      !message.runtimeStatus
    ) {
      return index;
    }
  }
  return -1;
}
