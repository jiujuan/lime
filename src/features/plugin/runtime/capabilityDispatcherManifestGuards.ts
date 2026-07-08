import type { PluginProjection } from "../types";
import type { PluginHostBridgeCapabilityRequest } from "./hostBridge";
import {
  collectUndeclaredRequestedClawCapabilityIds,
} from "./capabilityDispatcherClawCapabilities";
import { PluginCapabilityDispatcherError } from "./capabilityDispatcherError";

export function assertAgentTaskClawCapabilitiesDeclared(
  projection: PluginProjection,
  input: Record<string, unknown>,
): void {
  const missing = collectUndeclaredRequestedClawCapabilityIds(
    projection,
    input,
  );
  if (!missing.length) {
    return;
  }
  throw new PluginCapabilityDispatcherError(
    "CAPABILITY_NOT_DECLARED",
    `Agent task requested Claw capabilities not declared by manifest: ${missing.join(", ")}.`,
  );
}

export function assertStorageWriteDeclared(projection: PluginProjection): void {
  if (projection.storage) {
    return;
  }
  throw new PluginCapabilityDispatcherError(
    "WRITEBACK_NOT_DECLARED",
    "lime.storage write-back requires a declared storage namespace.",
  );
}

function isCapabilityDeclared(
  projection: PluginProjection,
  capability: string,
  entryKey?: string,
): boolean {
  if (
    projection.requiredCapabilities.some(
      (requirement) => requirement.capability === capability,
    )
  ) {
    return true;
  }
  const entry = projection.entries.find((item) => item.key === entryKey);
  return (
    entry?.requiredCapabilities.some(
      (requirement) => requirement.capability === capability,
    ) ?? false
  );
}

export function assertCapabilityDeclared(
  projection: PluginProjection,
  request: PluginHostBridgeCapabilityRequest,
  fallbackEntryKey: string,
): void {
  const entryKey = request.entryKey ?? fallbackEntryKey;
  if (isCapabilityDeclared(projection, request.capability, entryKey)) {
    return;
  }
  throw new PluginCapabilityDispatcherError(
    "CAPABILITY_NOT_DECLARED",
    `${request.capability} is not declared by Plugin manifest.`,
  );
}

export function assertArtifactKindDeclared(
  projection: PluginProjection,
  kind: string,
): void {
  if (projection.artifactTypes.some((artifact) => artifact.key === kind)) {
    return;
  }
  throw new PluginCapabilityDispatcherError(
    "WRITEBACK_NOT_DECLARED",
    `Artifact kind ${kind} is not declared by this Plugin manifest.`,
  );
}

export function assertEvidenceKindDeclared(
  projection: PluginProjection,
  kind: string,
): void {
  if (projection.evals.some((evalRule) => evalRule.key === kind)) {
    return;
  }
  throw new PluginCapabilityDispatcherError(
    "WRITEBACK_NOT_DECLARED",
    `Evidence kind ${kind} is not declared by this Plugin manifest.`,
  );
}
