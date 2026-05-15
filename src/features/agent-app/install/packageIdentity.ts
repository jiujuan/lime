import { normalizeManifest } from "../manifest/normalizeManifest";
import type { AppManifest, PackageIdentity, PackageSourceKind } from "../types";

export function stableStringifyAgentAppValue(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringifyAgentAppValue).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringifyAgentAppValue(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function buildPackageIdentity(params: {
  manifest: AppManifest;
  sourceKind?: PackageSourceKind;
  sourceUri?: string;
  loadedAt?: string;
}): PackageIdentity {
  const normalized = normalizeManifest(params.manifest);
  const manifestHash = buildAgentAppManifestHash(params.manifest);
  const packageHash = buildAgentAppPackageHash({
    manifest: params.manifest,
    sourceUri: params.sourceUri ?? "fixture",
  });

  return {
    sourceKind: params.sourceKind ?? "fixture",
    sourceUri: params.sourceUri ?? "fixture:content-factory-app",
    appId: normalized.appId,
    appVersion: normalized.version,
    packageHash,
    manifestHash,
    loadedAt: params.loadedAt ?? new Date().toISOString(),
  };
}

export function buildAgentAppManifestHash(manifest: unknown): string {
  return `manifest-fnv1a-${fnv1a(stableStringifyAgentAppValue(manifest))}`;
}

export function buildAgentAppPackageHash(params: {
  manifest: unknown;
  sourceUri?: string;
}): string {
  return `package-fnv1a-${fnv1a(
    stableStringifyAgentAppValue({
      manifest: params.manifest,
      sourceUri: params.sourceUri ?? "fixture",
    }),
  )}`;
}
