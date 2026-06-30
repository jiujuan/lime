import type { WorkspaceArticleObject } from "./workspaceArticleWorkspaceModel";
import {
  buildWorkspaceArticleWorkspaceRendererHostPolicy,
  type WorkspaceArticleWorkspaceRendererHostPolicy,
} from "./workspaceArticleWorkspaceRendererHostPolicy";

export interface WorkspaceArticleWorkspaceRendererHost {
  pluginId: string | null;
  rendererKind: string;
  artifactType: string | null;
  outputArtifactKind: string | null;
  surfaceKind: string | null;
  paneKind: string | null;
  entry: string | null;
  actionKeys: string[];
  policy: WorkspaceArticleWorkspaceRendererHostPolicy;
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

function readStringArray(...values: unknown[]): string[] {
  const result = new Set<string>();
  for (const value of values) {
    if (!Array.isArray(value)) {
      continue;
    }
    for (const item of value) {
      const normalized = normalizeString(item);
      if (normalized) {
        result.add(normalized);
      }
    }
  }
  return Array.from(result);
}

function readRendererActionKeys(contract: Record<string, unknown>): string[] {
  const directKeys = readStringArray(contract.actionKeys, contract.action_keys);
  const actionKeys = Array.isArray(contract.actions)
    ? contract.actions
        .map((action) => {
          const actionRecord = asRecord(action);
          return readString(actionRecord ? actionRecord.key : null);
        })
        .filter((key): key is string => Boolean(key))
    : [];
  return Array.from(new Set([...directKeys, ...actionKeys]));
}

export function buildWorkspaceArticleWorkspaceRendererHost(
  object: WorkspaceArticleObject,
): WorkspaceArticleWorkspaceRendererHost | null {
  const source = asRecord(object.source);
  if (!source) {
    return null;
  }
  const contract = asRecord(source.rendererContract) ?? source;
  const rendererKind = readString(
    contract.rendererKind,
    contract.renderer_kind,
    source.rendererKind,
    source.renderer_kind,
  );
  if (rendererKind !== "app_declared") {
    return null;
  }

  return {
    pluginId: readString(
      contract.pluginId,
      contract.plugin_id,
      source.pluginId,
      source.plugin_id,
      object.ref.appId,
    ),
    rendererKind,
    artifactType: readString(
      contract.artifactType,
      contract.artifact_type,
      source.artifactType,
      source.artifact_type,
      object.ref.kind,
    ),
    outputArtifactKind: readString(
      contract.outputArtifactKind,
      contract.output_artifact_kind,
      source.outputArtifactKind,
      source.output_artifact_kind,
    ),
    surfaceKind: readString(
      contract.surfaceKind,
      contract.surface_kind,
      source.surfaceKind,
      source.surface_kind,
    ),
    paneKind: readString(
      contract.paneKind,
      contract.pane_kind,
      source.paneKind,
      source.pane_kind,
    ),
    entry: readString(contract.entry, source.entry),
    actionKeys: readRendererActionKeys(contract),
    policy: buildWorkspaceArticleWorkspaceRendererHostPolicy(
      asRecord(contract.runtimeAuthorization) ??
        asRecord(contract.runtime_authorization) ??
        asRecord(source.runtimeAuthorization) ??
        asRecord(source.runtime_authorization),
    ),
  };
}
