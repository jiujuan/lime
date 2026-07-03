import { buildPluginPackageCacheEntry } from "../install/packageCache";
import { loadRuntimePackageDescriptor } from "../runtime/runtimePackageLoader";
import type { InstalledAppPreview } from "../types";

export function buildRuntimePackageLoadForPreview(preview: InstalledAppPreview) {
  const cacheEntry = buildPluginPackageCacheEntry({
    identity: preview.identity,
    manifestSnapshot: preview.manifest,
    actualPackageHash: preview.identity.packageHash,
    actualManifestHash: preview.identity.manifestHash,
    cachedAt: "2026-05-15T00:00:00.000Z",
  });

  return loadRuntimePackageDescriptor({
    cacheEntry,
    identity: preview.identity,
    projection: preview.projection,
  });
}
