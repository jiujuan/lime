import type { WorkspaceRightSurfacePendingRequest } from "@/lib/api/workspaceRightSurface";
import {
  buildWorkspaceProductProfileFromUnknown,
  type WorkspaceProductProfile,
  type WorkspaceProductProfileSource,
} from "@/components/agent/chat/workspace/workspaceProductProfileModel";
import { buildWorkspaceProductProfileWorkerEvidenceFromThreadRead } from "@/components/agent/chat/workspace/workspaceProductProfileWorkerEvidence";
import { CONTENT_FACTORY_PLUGIN_ID } from "./contentFactoryPlugin";

export const CONTENT_FACTORY_WORKSPACE_PATCH_KIND =
  "content_factory.workspace_patch";

export interface BuildContentFactoryWorkspacePatchProfileOptions {
  source?: WorkspaceProductProfileSource;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function normalizeString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readString(...values: unknown[]): string | null {
  for (const value of values) {
    const normalized = normalizeString(value);
    if (normalized) {
      return normalized;
    }
  }
  return null;
}

function readArray(...values: unknown[]): unknown[] {
  for (const value of values) {
    if (Array.isArray(value)) {
      return value;
    }
  }
  return [];
}

function firstObjectRecord(value: unknown): Record<string, unknown> | null {
  const first = readArray(value)[0];
  return asRecord(first);
}

function objectRefRecord(object: Record<string, unknown> | null): Record<
  string,
  unknown
> | null {
  return asRecord(object?.ref) ?? asRecord(object?.objectRef) ?? null;
}

function readPatchAppId(patch: Record<string, unknown>): string | null {
  const firstRef = objectRefRecord(firstObjectRecord(patch.objects));
  return readString(patch.appId, patch.app_id, firstRef?.appId, firstRef?.app_id);
}

function readPatchSessionId(patch: Record<string, unknown>): string | null {
  const firstRef = objectRefRecord(firstObjectRecord(patch.objects));
  return readString(
    patch.sessionId,
    patch.session_id,
    firstRef?.sessionId,
    firstRef?.session_id,
  );
}

function isPatchRecord(value: unknown): value is Record<string, unknown> {
  const record = asRecord(value);
  return Boolean(record && readArray(record.objects).length > 0);
}

function pushPatchCandidate(
  candidates: Record<string, unknown>[],
  value: unknown,
): void {
  if (isPatchRecord(value)) {
    candidates.push(value);
  }
}

function pushKnownPatchFields(
  candidates: Record<string, unknown>[],
  record: Record<string, unknown> | null,
): void {
  if (!record) {
    return;
  }
  pushPatchCandidate(candidates, record.productWorkspace);
  pushPatchCandidate(candidates, record.product_workspace);
  pushPatchCandidate(candidates, record.workspacePatch);
  pushPatchCandidate(candidates, record.workspace_patch);
  pushPatchCandidate(candidates, record.contentFactoryWorkspacePatch);
}

function pushContentPatch(
  candidates: Record<string, unknown>[],
  record: Record<string, unknown> | null,
): void {
  const content = normalizeString(record?.content);
  if (!content) {
    return;
  }
  try {
    pushPatchCandidate(candidates, JSON.parse(content));
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
  const metadata = asRecord(record.metadata);
  const artifactMetadata = asRecord(artifact?.metadata);
  const candidates: Record<string, unknown>[] = [];

  pushPatchCandidate(candidates, record);
  pushKnownPatchFields(candidates, record);
  pushKnownPatchFields(candidates, metadata);
  pushKnownPatchFields(candidates, artifact);
  pushKnownPatchFields(candidates, artifactMetadata);
  pushContentPatch(candidates, artifact);
  pushContentPatch(candidates, record);

  return candidates;
}

function isContentFactoryPatch(patch: Record<string, unknown>): boolean {
  return (
    readPatchAppId(patch) === CONTENT_FACTORY_PLUGIN_ID &&
    Boolean(readPatchSessionId(patch))
  );
}

function attachSourceArtifactIfMissing(params: {
  profile: WorkspaceProductProfile;
  request: WorkspaceRightSurfacePendingRequest;
}): WorkspaceProductProfile {
  const { profile, request } = params;
  const sourceArtifacts =
    profile.sourceArtifacts && profile.sourceArtifacts.length > 0
      ? profile.sourceArtifacts
      : [
          sourceArtifactFromPendingRequest(request),
        ];
  return {
    ...profile,
    workspaceId: profile.workspaceId ?? request.workspaceId ?? null,
    sourceArtifacts,
    workerEvidence:
      (profile.workerEvidence?.length ?? 0) > 0
        ? (profile.workerEvidence ?? [])
        : buildWorkspaceProductProfileWorkerEvidenceFromThreadRead({
            productWorkspace: profile as unknown as Record<string, unknown>,
            sourceArtifacts,
          }),
    updatedAt: profile.updatedAt ?? request.requestedAt,
  };
}

function sourceArtifactFromPendingRequest(
  request: WorkspaceRightSurfacePendingRequest,
): Record<string, unknown> {
  const metadata = asRecord(request.metadata);
  const artifact = asRecord(metadata?.artifact);
  return {
    requestId: request.requestId,
    origin: request.origin,
    reason: request.reason,
    requestedAt: request.requestedAt,
    ...(readString(artifact?.artifactId, artifact?.artifactRef)
      ? { artifactRef: readString(artifact?.artifactId, artifact?.artifactRef) }
      : {}),
    ...(readString(artifact?.path) ? { path: readString(artifact?.path) } : {}),
    ...(readString(artifact?.kind) ? { kind: readString(artifact?.kind) } : {}),
    ...(readString(artifact?.status)
      ? { status: readString(artifact?.status) }
      : {}),
    ...(readString(artifact?.title)
      ? { title: readString(artifact?.title) }
      : {}),
  };
}

export function buildContentFactoryWorkspacePatchProfile(
  value: unknown,
  options: BuildContentFactoryWorkspacePatchProfileOptions = {},
): WorkspaceProductProfile | null {
  const source = options.source ?? "rightSurfacePending";
  for (const candidate of workspacePatchCandidates(value)) {
    if (!isContentFactoryPatch(candidate)) {
      continue;
    }
    const profile = buildWorkspaceProductProfileFromUnknown(candidate, source);
    if (profile?.appId === CONTENT_FACTORY_PLUGIN_ID) {
      return profile;
    }
  }
  return null;
}

export function buildContentFactoryWorkspacePatchProfileFromPendingRequests(
  pendingRequests: readonly WorkspaceRightSurfacePendingRequest[],
): WorkspaceProductProfile | null {
  for (const request of pendingRequests) {
    if (
      request.status !== "pending" ||
      request.surfaceKind !== "productProfile"
    ) {
      continue;
    }
    const profile = buildContentFactoryWorkspacePatchProfile(request.metadata, {
      source: "rightSurfacePending",
    });
    if (!profile) {
      continue;
    }
    return attachSourceArtifactIfMissing({ profile, request });
  }
  return null;
}
