import type { Message } from "../types";
import { upsertMessageArtifact } from "../utils/messageArtifacts";
import {
  buildWorkspaceArticleWorkspaceFromUnknown,
  buildWorkspaceArticleWorkspaceViewModel,
  selectWorkspaceArticleDraftObject,
  type WorkspaceArticleWorkspace,
} from "./workspaceArticleWorkspaceModel";
import { buildWorkspaceArticleWorkspacePreviewArtifact } from "./workspaceArticleWorkspacePreviewArtifact";

export interface AttachWorkspaceArticleWorkspacePreviewArtifactParams {
  messages: Message[];
  articleWorkspace: WorkspaceArticleWorkspace | null;
  now?: number;
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

function isWorkspacePatch(value: unknown): value is Record<string, unknown> {
  const record = asRecord(value);
  return Boolean(
    record && Array.isArray(record.objects) && record.objects.length > 0,
  );
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
    isWorkspacePatch(record) ||
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
  return Boolean(
    record.articleWorkspace ||
    record.article_workspace ||
    record.workspacePatch ||
    record.workspace_patch ||
    record.contentFactoryWorkspacePatch,
  );
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
  return (
    kind === "content_factory.workspace_patch" ||
    kind === "content_factory_workspace_patch" ||
    kind === "workspace_patch" ||
    kind.endsWith(".workspace_patch")
  );
}

function pushWorkspacePatchCandidate(
  candidates: Record<string, unknown>[],
  value: unknown,
) {
  if (isWorkspacePatch(value)) {
    candidates.push(value);
  }
}

function pushKnownWorkspacePatchFields(
  candidates: Record<string, unknown>[],
  record: Record<string, unknown> | null,
) {
  if (!record) {
    return;
  }
  pushWorkspacePatchCandidate(candidates, record.articleWorkspace);
  pushWorkspacePatchCandidate(candidates, record.article_workspace);
  pushWorkspacePatchCandidate(candidates, record.workspacePatch);
  pushWorkspacePatchCandidate(candidates, record.workspace_patch);
  pushWorkspacePatchCandidate(candidates, record.contentFactoryWorkspacePatch);
}

function pushContentWorkspacePatch(
  candidates: Record<string, unknown>[],
  record: Record<string, unknown> | null,
) {
  const content = readString(record?.content);
  if (!content) {
    return;
  }
  try {
    pushWorkspacePatchCandidate(candidates, JSON.parse(content));
  } catch {
    return;
  }
}

function workspacePatchCandidates(value: unknown): Record<string, unknown>[] {
  const record = asRecord(value);
  if (!record) {
    return [];
  }
  const artifact = asRecord(record.artifact);
  const meta = asRecord(record.meta);
  const metadata = asRecord(record.metadata);
  const artifactMetadata = asRecord(artifact?.metadata);
  const candidates: Record<string, unknown>[] = [];

  pushWorkspacePatchCandidate(candidates, record);
  pushKnownWorkspacePatchFields(candidates, record);
  pushKnownWorkspacePatchFields(candidates, meta);
  pushKnownWorkspacePatchFields(candidates, metadata);
  pushKnownWorkspacePatchFields(candidates, artifact);
  pushKnownWorkspacePatchFields(candidates, artifactMetadata);
  pushContentWorkspacePatch(candidates, record);
  pushContentWorkspacePatch(candidates, artifact);

  return candidates;
}

export function attachWorkspaceArticleWorkspacePreviewArtifactToMessages({
  articleWorkspace,
  messages,
  now,
}: AttachWorkspaceArticleWorkspacePreviewArtifactParams): Message[] {
  if (!articleWorkspace) {
    return messages;
  }

  const artifact = buildArticleWorkspacePreviewArtifact(articleWorkspace, now);
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
) {
  try {
    const previewWorkspace = selectArticlePreviewWorkspace(articleWorkspace);
    const viewModel = buildWorkspaceArticleWorkspaceViewModel(previewWorkspace);
    return buildWorkspaceArticleWorkspacePreviewArtifact({
      artifactIds: viewModel.selectedArtifactIds,
      layout: viewModel.selectedSurface.layout,
      object: viewModel.selectedObject,
      preview: viewModel.selectedPreview,
      articleWorkspace: previewWorkspace,
      now,
    });
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
