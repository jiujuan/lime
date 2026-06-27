import type {
  PluginContract,
  PluginRendererOutputContract,
} from "@/features/plugin";
import { resolvePluginRendererOutputContract } from "@/features/plugin";
import type { WorkspaceRightSurfacePendingRequest } from "@/lib/api/workspaceRightSurface";
import type {
  WorkspaceProductObject,
  WorkspaceProductProfile,
} from "./workspaceProductProfileModel";

export interface EnrichWorkspaceProductProfileRendererOutputParams {
  contracts: readonly PluginContract[];
  pendingRequests: readonly WorkspaceRightSurfacePendingRequest[];
  profile: WorkspaceProductProfile | null;
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

function firstRecord(...values: unknown[]): Record<string, unknown> | null {
  for (const value of values) {
    const record = asRecord(value);
    if (record) {
      return record;
    }
  }
  return null;
}

function firstPendingProductProfileRequest(
  pendingRequests: readonly WorkspaceRightSurfacePendingRequest[],
  profile: WorkspaceProductProfile,
): WorkspaceRightSurfacePendingRequest | null {
  return (
    pendingRequests.find((request) => {
      if (request.status !== "pending" || request.surfaceKind !== "productProfile") {
        return false;
      }
      if (profile.sessionId && request.sessionId && request.sessionId !== profile.sessionId) {
        return false;
      }
      return true;
    }) ?? null
  );
}

function readOutputArtifactKindFromRecord(
  record: Record<string, unknown> | null | undefined,
): string | null {
  if (!record) {
    return null;
  }
  return readString(
    record.outputArtifactKind,
    record.output_artifact_kind,
    record.workerOutputArtifactKind,
    record.worker_output_artifact_kind,
    record.artifactKind,
    record.artifact_kind,
    record.kind,
  );
}

function readOutputArtifactKind(params: {
  object: WorkspaceProductObject;
  pendingRequest: WorkspaceRightSurfacePendingRequest | null;
  profile: WorkspaceProductProfile;
}): string | null {
  const { object, pendingRequest, profile } = params;
  const metadata = asRecord(pendingRequest?.metadata);
  const artifact = asRecord(metadata?.artifact);
  const objectSource = asRecord(object.source);

  return (
    readOutputArtifactKindFromRecord(objectSource) ??
    readOutputArtifactKindFromRecord(metadata) ??
    readOutputArtifactKindFromRecord(artifact) ??
    profile.sourceArtifacts
      ?.map((source) => readOutputArtifactKindFromRecord(asRecord(source)))
      .find((value): value is string => Boolean(value)) ??
    profile.workerEvidence
      ?.map((evidence) => normalizeString(evidence.artifactKind))
      .find((value): value is string => Boolean(value)) ??
    null
  );
}

function readPendingOutputArtifactKind(
  pendingRequest: WorkspaceRightSurfacePendingRequest | null,
): string | null {
  const metadata = asRecord(pendingRequest?.metadata);
  const artifact = asRecord(metadata?.artifact);
  return (
    readOutputArtifactKindFromRecord(metadata) ??
    readOutputArtifactKindFromRecord(artifact)
  );
}

function readPaneKind(params: {
  object: WorkspaceProductObject;
  pendingRequest: WorkspaceRightSurfacePendingRequest | null;
  profile: WorkspaceProductProfile;
}): string | null {
  const { object, pendingRequest, profile } = params;
  const metadata = asRecord(pendingRequest?.metadata);
  const objectSource = asRecord(object.source);
  return (
    readString(
      objectSource?.paneKind,
      objectSource?.pane_kind,
      metadata?.paneKind,
      metadata?.pane_kind,
      firstRecord(metadata?.rightSurface, metadata?.right_surface)?.paneKind,
      firstRecord(metadata?.rightSurface, metadata?.right_surface)?.pane_kind,
      profile.layoutState?.activePaneKind,
    ) ?? object.ref.kind
  );
}

function readSurfaceKind(params: {
  object: WorkspaceProductObject;
  pendingRequest: WorkspaceRightSurfacePendingRequest | null;
  profile: WorkspaceProductProfile;
}): string | null {
  const { object, pendingRequest, profile } = params;
  const metadata = asRecord(pendingRequest?.metadata);
  const objectSource = asRecord(object.source);
  return readString(
    objectSource?.surfaceKind,
    objectSource?.surface_kind,
    metadata?.rendererSurfaceKind,
    metadata?.renderer_surface_kind,
    profile.layoutState?.activePaneKind,
  );
}

function resolveObjectRendererContract(params: {
  contract: PluginContract;
  object: WorkspaceProductObject;
  pendingRequest: WorkspaceRightSurfacePendingRequest | null;
  profile: WorkspaceProductProfile;
}): PluginRendererOutputContract | null {
  const { contract, object, pendingRequest, profile } = params;
  return resolvePluginRendererOutputContract(contract, {
    artifactType: object.ref.kind,
    outputArtifactKind: readOutputArtifactKind({
      object,
      pendingRequest,
      profile,
    }),
    paneKind: readPaneKind({ object, pendingRequest, profile }),
    surfaceKind: readSurfaceKind({ object, pendingRequest, profile }),
  });
}

function rendererSourceProjection(
  rendererContract: PluginRendererOutputContract,
): Record<string, unknown> {
  return {
    rendererContract,
    outputArtifactKind: rendererContract.outputArtifactKind,
    artifactType: rendererContract.artifactType,
    surfaceKind: rendererContract.surfaceKind,
    paneKind: rendererContract.paneKind,
    rendererKind: rendererContract.rendererKind,
    pluginId: rendererContract.pluginId,
  };
}

function enrichObject(params: {
  contract: PluginContract;
  object: WorkspaceProductObject;
  pendingRequest: WorkspaceRightSurfacePendingRequest | null;
  profile: WorkspaceProductProfile;
}): WorkspaceProductObject {
  const rendererContract = resolveObjectRendererContract(params);
  if (!rendererContract) {
    return params.object;
  }

  return {
    ...params.object,
    source: {
      ...(params.object.source ?? {}),
      ...rendererSourceProjection(rendererContract),
    },
  };
}

function enrichSourceArtifact(params: {
  contract: PluginContract;
  pendingRequest: WorkspaceRightSurfacePendingRequest | null;
  profile: WorkspaceProductProfile;
  sourceArtifact: Record<string, unknown>;
}): Record<string, unknown> {
  const artifactType =
    readString(
      params.sourceArtifact.artifactType,
      params.sourceArtifact.artifact_type,
      params.sourceArtifact.objectKind,
      params.sourceArtifact.object_kind,
      params.profile.selectedObjectRef?.kind,
      params.profile.primaryObjectRef?.kind,
      params.profile.objects[0]?.ref.kind,
    ) ?? null;
  const rendererContract = resolvePluginRendererOutputContract(params.contract, {
    artifactType,
    outputArtifactKind:
      readOutputArtifactKindFromRecord(params.sourceArtifact) ??
      readPendingOutputArtifactKind(params.pendingRequest),
    paneKind:
      readString(
        params.sourceArtifact.paneKind,
        params.sourceArtifact.pane_kind,
        params.profile.layoutState?.activePaneKind,
      ) ?? artifactType,
  });
  if (!rendererContract) {
    return params.sourceArtifact;
  }
  return {
    ...params.sourceArtifact,
    ...rendererSourceProjection(rendererContract),
  };
}

export function enrichWorkspaceProductProfileRendererOutput({
  contracts,
  pendingRequests,
  profile,
}: EnrichWorkspaceProductProfileRendererOutputParams): WorkspaceProductProfile | null {
  if (!profile) {
    return null;
  }
  const contract = contracts.find((candidate) => candidate.id === profile.appId);
  if (!contract || contract.artifactRenderers.length === 0) {
    return profile;
  }

  const pendingRequest = firstPendingProductProfileRequest(
    pendingRequests,
    profile,
  );
  return {
    ...profile,
    objects: profile.objects.map((object) =>
      enrichObject({ contract, object, pendingRequest, profile }),
    ),
    sourceArtifacts: (profile.sourceArtifacts ?? []).map((sourceArtifact) =>
      enrichSourceArtifact({
        contract,
        pendingRequest,
        profile,
        sourceArtifact,
      }),
    ),
  };
}
