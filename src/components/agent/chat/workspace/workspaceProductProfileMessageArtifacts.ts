import type { Message } from "../types";
import { upsertMessageArtifact } from "../utils/messageArtifacts";
import {
  buildWorkspaceProductProfileFromUnknown,
  buildWorkspaceProductProfileViewModel,
  type WorkspaceProductProfile,
} from "./workspaceProductProfileModel";
import { buildWorkspaceProductProfilePreviewArtifact } from "./workspaceProductProfilePreviewArtifact";

export interface AttachWorkspaceProductProfilePreviewArtifactParams {
  messages: Message[];
  profile: WorkspaceProductProfile | null;
  now?: number;
}

export function buildWorkspaceProductProfileFromMessageArtifacts(
  messages: readonly Message[],
): WorkspaceProductProfile | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    const artifacts = message?.artifacts ?? [];
    for (let artifactIndex = artifacts.length - 1; artifactIndex >= 0; artifactIndex -= 1) {
      for (const candidate of workspacePatchCandidates(artifacts[artifactIndex])) {
        const profile = buildWorkspaceProductProfileFromUnknown(
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

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isWorkspacePatch(value: unknown): value is Record<string, unknown> {
  const record = asRecord(value);
  return Boolean(record && Array.isArray(record.objects) && record.objects.length > 0);
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
  pushWorkspacePatchCandidate(candidates, record.productWorkspace);
  pushWorkspacePatchCandidate(candidates, record.product_workspace);
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

export function attachWorkspaceProductProfilePreviewArtifactToMessages({
  messages,
  now,
  profile,
}: AttachWorkspaceProductProfilePreviewArtifactParams): Message[] {
  if (!profile) {
    return messages;
  }

  const artifact = buildProductProfilePreviewArtifact(profile, now);
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

  if (messages.some((message) => message.role === "assistant")) {
    return messages;
  }

  return [
    ...messages,
    {
      id: `product-profile-preview:${artifact.id}`,
      role: "assistant",
      content: "",
      timestamp: new Date(now ?? artifact.updatedAt),
      artifacts: [artifact],
    },
  ];
}

function buildProductProfilePreviewArtifact(
  profile: WorkspaceProductProfile,
  now?: number,
) {
  try {
    const viewModel = buildWorkspaceProductProfileViewModel(profile);
    return buildWorkspaceProductProfilePreviewArtifact({
      artifactIds: viewModel.selectedArtifactIds,
      layout: viewModel.selectedSurface.layout,
      object: viewModel.selectedObject,
      preview: viewModel.selectedPreview,
      profile,
      now,
    });
  } catch {
    return null;
  }
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
