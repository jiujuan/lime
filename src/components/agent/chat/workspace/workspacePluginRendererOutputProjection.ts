import type {
  PluginContract,
  PluginRendererOutputContract,
} from "@/features/plugin";
import { resolvePluginRendererOutputContract } from "@/features/plugin";
import type { WorkspaceRightSurfacePendingRequest } from "@/lib/api/workspaceRightSurface";
import { normalizeWorkspaceRightSurfaceKind } from "./right-surface";
import type {
  WorkspaceArticleObject,
  WorkspaceArticleWorkspace,
} from "./workspaceArticleWorkspaceModel";

export interface EnrichWorkspaceArticleWorkspaceRendererOutputParams {
  contracts: readonly PluginContract[];
  pendingRequests: readonly WorkspaceRightSurfacePendingRequest[];
  articleWorkspace: WorkspaceArticleWorkspace | null;
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

function firstPendingArticleWorkspaceRequest(
  pendingRequests: readonly WorkspaceRightSurfacePendingRequest[],
  articleWorkspace: WorkspaceArticleWorkspace,
): WorkspaceRightSurfacePendingRequest | null {
  return (
    pendingRequests.find((request) => {
      if (
        request.status !== "pending" ||
        normalizeWorkspaceRightSurfaceKind(request.surfaceKind) !==
          "articleWorkspace"
      ) {
        return false;
      }
      if (
        articleWorkspace.sessionId &&
        request.sessionId &&
        request.sessionId !== articleWorkspace.sessionId
      ) {
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
  object: WorkspaceArticleObject;
  pendingRequest: WorkspaceRightSurfacePendingRequest | null;
  articleWorkspace: WorkspaceArticleWorkspace;
}): string | null {
  const { object, pendingRequest, articleWorkspace } = params;
  const metadata = asRecord(pendingRequest?.metadata);
  const artifact = asRecord(metadata?.artifact);
  const objectSource = asRecord(object.source);

  return (
    readOutputArtifactKindFromRecord(objectSource) ??
    readOutputArtifactKindFromRecord(metadata) ??
    readOutputArtifactKindFromRecord(artifact) ??
    articleWorkspace.sourceArtifacts
      ?.map((source) => readOutputArtifactKindFromRecord(asRecord(source)))
      .find((value): value is string => Boolean(value)) ??
    articleWorkspace.workerEvidence
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
  object: WorkspaceArticleObject;
  pendingRequest: WorkspaceRightSurfacePendingRequest | null;
  articleWorkspace: WorkspaceArticleWorkspace;
}): string | null {
  const { object, pendingRequest, articleWorkspace } = params;
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
      articleWorkspace.layoutState?.activePaneKind,
    ) ?? object.ref.kind
  );
}

function readSurfaceKind(params: {
  object: WorkspaceArticleObject;
  pendingRequest: WorkspaceRightSurfacePendingRequest | null;
  articleWorkspace: WorkspaceArticleWorkspace;
}): string | null {
  const { object, pendingRequest, articleWorkspace } = params;
  const metadata = asRecord(pendingRequest?.metadata);
  const objectSource = asRecord(object.source);
  return readString(
    objectSource?.surfaceKind,
    objectSource?.surface_kind,
    metadata?.rendererSurfaceKind,
    metadata?.renderer_surface_kind,
    articleWorkspace.layoutState?.activePaneKind,
  );
}

function resolveObjectRendererContract(params: {
  contract: PluginContract;
  object: WorkspaceArticleObject;
  pendingRequest: WorkspaceRightSurfacePendingRequest | null;
  articleWorkspace: WorkspaceArticleWorkspace;
}): PluginRendererOutputContract | null {
  const { articleWorkspace, contract, object, pendingRequest } = params;
  return resolvePluginRendererOutputContract(contract, {
    artifactType: object.ref.kind,
    outputArtifactKind: readOutputArtifactKind({
      object,
      pendingRequest,
      articleWorkspace,
    }),
    paneKind: readPaneKind({ object, pendingRequest, articleWorkspace }),
    surfaceKind: readSurfaceKind({ object, pendingRequest, articleWorkspace }),
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
  object: WorkspaceArticleObject;
  pendingRequest: WorkspaceRightSurfacePendingRequest | null;
  articleWorkspace: WorkspaceArticleWorkspace;
}): WorkspaceArticleObject {
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
  articleWorkspace: WorkspaceArticleWorkspace;
  sourceArtifact: Record<string, unknown>;
}): Record<string, unknown> {
  const artifactType =
    readString(
      params.sourceArtifact.artifactType,
      params.sourceArtifact.artifact_type,
      params.sourceArtifact.objectKind,
      params.sourceArtifact.object_kind,
      params.articleWorkspace.selectedObjectRef?.kind,
      params.articleWorkspace.primaryObjectRef?.kind,
      params.articleWorkspace.objects[0]?.ref.kind,
    ) ?? null;
  const rendererContract = resolvePluginRendererOutputContract(
    params.contract,
    {
      artifactType,
      outputArtifactKind:
        readOutputArtifactKindFromRecord(params.sourceArtifact) ??
        readPendingOutputArtifactKind(params.pendingRequest),
      paneKind:
        readString(
          params.sourceArtifact.paneKind,
          params.sourceArtifact.pane_kind,
          params.articleWorkspace.layoutState?.activePaneKind,
        ) ?? artifactType,
    },
  );
  if (!rendererContract) {
    return params.sourceArtifact;
  }
  return {
    ...params.sourceArtifact,
    ...rendererSourceProjection(rendererContract),
  };
}

export function enrichWorkspaceArticleWorkspaceRendererOutput({
  articleWorkspace,
  contracts,
  pendingRequests,
}: EnrichWorkspaceArticleWorkspaceRendererOutputParams): WorkspaceArticleWorkspace | null {
  if (!articleWorkspace) {
    return null;
  }
  const contract = contracts.find(
    (candidate) => candidate.id === articleWorkspace.appId,
  );
  if (!contract || contract.artifactRenderers.length === 0) {
    return articleWorkspace;
  }

  const pendingRequest = firstPendingArticleWorkspaceRequest(
    pendingRequests,
    articleWorkspace,
  );
  return {
    ...articleWorkspace,
    objects: articleWorkspace.objects.map((object) =>
      enrichObject({ contract, object, pendingRequest, articleWorkspace }),
    ),
    sourceArtifacts: (articleWorkspace.sourceArtifacts ?? []).map(
      (sourceArtifact) =>
        enrichSourceArtifact({
          articleWorkspace,
          contract,
          pendingRequest,
          sourceArtifact,
        }),
    ),
  };
}
