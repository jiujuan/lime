import type { PluginRendererKind } from "./types";

export const PLUGIN_RUNTIME_ALLOWED_LOCAL_WORKER_PLUGIN_IDS = [
  "content-factory-app",
] as const;

export const PLUGIN_RUNTIME_ALLOWED_LOCAL_WORKER_OUTPUT_ARTIFACT_KINDS = [
  "content_factory.workspace_patch",
] as const;

export type PluginRuntimeBoundary =
  | "local_worker_allowlist"
  | "host_placeholder_only"
  | "remote_runtime_disabled"
  | "output_kind_missing"
  | "output_kind_unsupported";

export type PluginRuntimeExecutionMode =
  | "local_plugin_worker"
  | "host_placeholder"
  | "none";

export type PluginRuntimeAuthorizationStatus =
  | "allowed"
  | "placeholder_only"
  | "denied";

export type PluginRuntimeAuthorizationReasonCode =
  | "local_worker_output_allowed"
  | "app_declared_renderer_placeholder_only"
  | "plugin_runtime_app_not_allowlisted"
  | "remote_plugin_runtime_disabled"
  | "plugin_runtime_output_kind_missing"
  | "plugin_runtime_output_kind_unsupported";

export interface PluginRemoteRuntimePolicy {
  status: "disabled";
  clientBehavior: "fail_closed";
  serviceBoundary: "marketplace_control_plane_only";
  reasonCode: Extract<
    PluginRuntimeAuthorizationReasonCode,
    "remote_plugin_runtime_disabled"
  >;
}

export interface PluginRuntimeAuthorizationDecision {
  status: PluginRuntimeAuthorizationStatus;
  executionMode: PluginRuntimeExecutionMode;
  runtimeBoundary: PluginRuntimeBoundary;
  remoteRuntimePolicy: PluginRemoteRuntimePolicy;
  reasonCode: PluginRuntimeAuthorizationReasonCode;
  pluginId: string;
  requestedOutputArtifactKind: string | null;
  allowedOutputArtifactKinds: string[];
}

export interface ResolvePluginRuntimeAuthorizationParams {
  pluginId: string;
  outputArtifactKind?: string | null;
  rendererKind?: PluginRendererKind | null;
}

function normalizeString(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function isAllowedLocalWorkerPlugin(pluginId: string): boolean {
  return PLUGIN_RUNTIME_ALLOWED_LOCAL_WORKER_PLUGIN_IDS.some(
    (allowedPluginId) => allowedPluginId === pluginId,
  );
}

function isAllowedLocalWorkerOutput(outputArtifactKind: string): boolean {
  return PLUGIN_RUNTIME_ALLOWED_LOCAL_WORKER_OUTPUT_ARTIFACT_KINDS.some(
    (allowedOutputArtifactKind) =>
      allowedOutputArtifactKind === outputArtifactKind,
  );
}

export function resolvePluginRemoteRuntimePolicy(): PluginRemoteRuntimePolicy {
  return {
    status: "disabled",
    clientBehavior: "fail_closed",
    serviceBoundary: "marketplace_control_plane_only",
    reasonCode: "remote_plugin_runtime_disabled",
  };
}

export function resolvePluginRuntimeAuthorization({
  outputArtifactKind,
  pluginId,
  rendererKind,
}: ResolvePluginRuntimeAuthorizationParams): PluginRuntimeAuthorizationDecision {
  const normalizedPluginId = normalizeString(pluginId) ?? "";
  const normalizedOutputArtifactKind = normalizeString(outputArtifactKind);
  const allowedOutputArtifactKinds = [
    ...PLUGIN_RUNTIME_ALLOWED_LOCAL_WORKER_OUTPUT_ARTIFACT_KINDS,
  ];
  const remoteRuntimePolicy = resolvePluginRemoteRuntimePolicy();

  if (!isAllowedLocalWorkerPlugin(normalizedPluginId)) {
    const hostPlaceholderOnly = rendererKind === "app_declared";
    return {
      status: hostPlaceholderOnly ? "placeholder_only" : "denied",
      executionMode: hostPlaceholderOnly ? "host_placeholder" : "none",
      runtimeBoundary: hostPlaceholderOnly
        ? "host_placeholder_only"
        : "remote_runtime_disabled",
      remoteRuntimePolicy,
      reasonCode:
        hostPlaceholderOnly
          ? "app_declared_renderer_placeholder_only"
          : remoteRuntimePolicy.reasonCode,
      pluginId: normalizedPluginId,
      requestedOutputArtifactKind: normalizedOutputArtifactKind,
      allowedOutputArtifactKinds,
    };
  }

  if (!normalizedOutputArtifactKind) {
    return {
      status: "denied",
      executionMode: "none",
      runtimeBoundary: "output_kind_missing",
      remoteRuntimePolicy,
      reasonCode: "plugin_runtime_output_kind_missing",
      pluginId: normalizedPluginId,
      requestedOutputArtifactKind: null,
      allowedOutputArtifactKinds,
    };
  }

  if (!isAllowedLocalWorkerOutput(normalizedOutputArtifactKind)) {
    const hostPlaceholderOnly = rendererKind === "app_declared";
    return {
      status: hostPlaceholderOnly ? "placeholder_only" : "denied",
      executionMode: hostPlaceholderOnly ? "host_placeholder" : "none",
      runtimeBoundary: hostPlaceholderOnly
        ? "host_placeholder_only"
        : "output_kind_unsupported",
      remoteRuntimePolicy,
      reasonCode:
        hostPlaceholderOnly
          ? "app_declared_renderer_placeholder_only"
          : "plugin_runtime_output_kind_unsupported",
      pluginId: normalizedPluginId,
      requestedOutputArtifactKind: normalizedOutputArtifactKind,
      allowedOutputArtifactKinds,
    };
  }

  return {
    status: "allowed",
    executionMode: "local_plugin_worker",
    runtimeBoundary: "local_worker_allowlist",
    remoteRuntimePolicy,
    reasonCode: "local_worker_output_allowed",
    pluginId: normalizedPluginId,
    requestedOutputArtifactKind: normalizedOutputArtifactKind,
    allowedOutputArtifactKinds,
  };
}
