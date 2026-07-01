import type { Message } from "../types";
import type { ArtifactStatus } from "@/lib/artifact/types";
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

  const targetMessageIndex = findLastStableAssistantMessageIndex(messages);
  if (targetMessageIndex >= 0) {
    const nextMessages = [...messages];
    nextMessages[targetMessageIndex] = upsertMessageArtifact(
      nextMessages[targetMessageIndex],
      artifact,
    );
    return nextMessages;
  }

  return [
    ...messages,
    {
      id: `article-workspace-preview:${artifact.id}`,
      role: "assistant",
      content: "",
      timestamp: new Date(now ?? artifact.updatedAt),
      artifacts: [artifact],
    },
  ];
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
