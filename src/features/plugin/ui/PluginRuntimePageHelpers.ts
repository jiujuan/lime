import { buildCleanupPlan } from "../install/cleanupPlan";
import { checkReadiness } from "../readiness/checkReadiness";
import { buildUiRuntimeCapabilityProfile } from "../runtime/uiRuntimeCapabilityProfile";
import type { PluginHostBridgeCapabilities } from "../runtime/hostBridge";
import type {
  CloudBootstrapApp,
  InstalledPluginState,
  ProjectedEntry,
} from "../types";

const HOST_BRIDGE_DISPATCH_CAPABILITIES = new Set([
  "lime.capabilities",
  "lime.storage",
  "lime.artifacts",
  "lime.evidence",
  "lime.knowledge",
  "lime.agent",
  "lime.models",
  "lime.usage",
  "lime.skills",
  "lime.memory",
  "lime.context",
  "lime.search",
  "lime.browser",
  "lime.documents",
  "lime.media",
  "lime.mcp",
  "lime.terminal",
  "lime.connectors",
  "lime.cloudSession",
]);

const HOST_BRIDGE_KNOWN_CAPABILITIES = new Set([
  ...HOST_BRIDGE_DISPATCH_CAPABILITIES,
  "lime.workflow",
]);

export const RUNTIME_PAGE_PROFILE = buildUiRuntimeCapabilityProfile({
  realAdapterEnabled: true,
  uiRuntimeEnabled: true,
});

export const RUNTIME_PAGE_FLAGS = RUNTIME_PAGE_PROFILE.featureFlags;

function isUiEntry(entry: ProjectedEntry): boolean {
  return ["page", "panel", "settings"].includes(entry.kind);
}

function resolveDefaultEntry(
  state: InstalledPluginState,
): ProjectedEntry | undefined {
  return (
    state.projection.entries.find(
      (entry) => entry.key === "dashboard" && isUiEntry(entry),
    ) ?? state.projection.entries.find((entry) => isUiEntry(entry))
  );
}

export function resolveActiveEntry(
  state: InstalledPluginState,
  entryKey?: string,
): ProjectedEntry | undefined {
  const requested = state.projection.entries.find(
    (entry) => entry.key === entryKey && isUiEntry(entry),
  );
  return requested ?? resolveDefaultEntry(state);
}

export function normalizeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function parseAppVersion(
  value: string | undefined,
): [number, number, number] | null {
  const match = value?.match(/^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?/i);
  if (!match) {
    return null;
  }
  return [Number(match[1] ?? 0), Number(match[2] ?? 0), Number(match[3] ?? 0)];
}

function compareAppVersion(
  left: string | undefined,
  right: string | undefined,
): number {
  const leftParts = parseAppVersion(left);
  const rightParts = parseAppVersion(right);
  if (!leftParts || !rightParts) {
    return 0;
  }
  for (let index = 0; index < leftParts.length; index += 1) {
    const diff = leftParts[index] - rightParts[index];
    if (diff !== 0) {
      return diff;
    }
  }
  return 0;
}

export function hasNewerCloudVersion(
  state: InstalledPluginState | null,
  cloudApp: CloudBootstrapApp | undefined,
): boolean {
  if (!state || !cloudApp) {
    return false;
  }
  return compareAppVersion(cloudApp.version, state.identity.appVersion) > 0;
}

export function sourceLabelKey(
  state: InstalledPluginState,
):
  | "plugin.apps.runtime.appInfo.source.cloud"
  | "plugin.apps.runtime.appInfo.source.local" {
  return state.identity.sourceKind === "cloud_release"
    ? "plugin.apps.runtime.appInfo.source.cloud"
    : "plugin.apps.runtime.appInfo.source.local";
}

export function buildPreviewFromInstalledState(state: InstalledPluginState) {
  return {
    identity: state.identity,
    manifest: state.manifest,
    projection: state.projection,
    readiness: buildRuntimeReadinessFromInstalledState(state),
    cleanupPlan: buildCleanupPlan({
      projection: state.projection,
      generatedAt: state.updatedAt,
    }),
  };
}

function buildRuntimeReadinessFromInstalledState(state: InstalledPluginState) {
  return checkReadiness({
    manifest: state.manifest,
    projection: state.projection,
    profile: RUNTIME_PAGE_PROFILE,
    setup: state.setup,
    checkedAt: state.readiness.checkedAt,
  });
}

export function resolveHostBridgeCapabilities(
  state: InstalledPluginState,
): PluginHostBridgeCapabilities {
  const readiness = buildRuntimeReadinessFromInstalledState(state);
  const available = readiness.supportedCapabilities
    .filter(
      (item) =>
        item.enabled && HOST_BRIDGE_DISPATCH_CAPABILITIES.has(item.capability),
    )
    .map((item) => item.capability);
  available.push("lime.capabilities");
  const declared = state.projection.requiredCapabilities.map(
    (item) => item.capability,
  );
  const blocked = [
    ...HOST_BRIDGE_KNOWN_CAPABILITIES,
    ...readiness.missingCapabilities.map((item) => item.capability),
    ...declared,
  ].filter((capability) => !available.includes(capability));

  return {
    available,
    blocked,
  };
}

export function shouldExposeCloudSession(state: InstalledPluginState): boolean {
  return state.projection.requiredCapabilities.some(
    (item) => item.capability === "lime.cloudSession",
  );
}
