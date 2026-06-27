import type { PluginRuntimeAuthorizationDecision } from "@/features/plugin/manifest/pluginRuntimeAuthorization";

export type WorkspaceProductProfileRendererHostPolicyStatus =
  | "placeholder"
  | "blocked";

export type WorkspaceProductProfileRendererExecutionModel =
  "host_placeholder_only";

export type WorkspaceProductProfileRendererEntryLoadPolicy = "not_loaded";

export interface WorkspaceProductProfileRendererHostPolicy {
  status: WorkspaceProductProfileRendererHostPolicyStatus;
  executionMode: string;
  rendererExecutionModel: WorkspaceProductProfileRendererExecutionModel;
  entryLoadPolicy: WorkspaceProductProfileRendererEntryLoadPolicy;
  canLoadEntry: false;
  reasonCode: string;
  requestedOutputArtifactKind: string | null;
  allowedOutputArtifactKinds: string[];
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

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of value) {
    const normalized = readString(item);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

export function buildWorkspaceProductProfileRendererHostPolicy(
  runtimeAuthorization: PluginRuntimeAuthorizationDecision | Record<string, unknown> | null,
): WorkspaceProductProfileRendererHostPolicy {
  const authorization = asRecord(runtimeAuthorization);
  const status = readString(authorization?.status);
  const executionMode =
    readString(
      authorization?.executionMode,
      authorization?.execution_mode,
    ) ?? "host_placeholder";
  const reasonCode =
    readString(
      authorization?.reasonCode,
      authorization?.reason_code,
    ) ?? "app_declared_renderer_placeholder_only";
  const requestedOutputArtifactKind = readString(
    authorization?.requestedOutputArtifactKind,
    authorization?.requested_output_artifact_kind,
  );
  const allowedOutputArtifactKinds = readStringArray(
    authorization?.allowedOutputArtifactKinds ??
      authorization?.allowed_output_artifact_kinds,
  );

  return {
    status: status === "denied" ? "blocked" : "placeholder",
    executionMode,
    rendererExecutionModel: "host_placeholder_only",
    entryLoadPolicy: "not_loaded",
    canLoadEntry: false,
    reasonCode,
    requestedOutputArtifactKind,
    allowedOutputArtifactKinds,
  };
}
