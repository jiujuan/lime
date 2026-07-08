import { buildCleanupPlan } from "../install/cleanupPlan";
import { buildPluginPackageCacheEntry } from "../install/packageCache";
import { loadRuntimePackageDescriptor } from "../runtime/runtimePackageLoader";
import type {
  AppManifest,
  InstalledAppPreview,
  InstalledPluginState,
} from "../types";

export function buildManagerCompanionFixture(base: AppManifest): AppManifest {
  return {
    ...base,
    name: "content-factory-playbook-app",
    displayName: "内容策略复盘 App",
    description:
      "P16-H 本地多 App repository fixture，用于验证 Manager list、选中态和生命周期边界。",
    storage: {
      ...(base.storage ?? {}),
      namespace: "content-factory-playbook-app",
      retention: base.storage?.retention ?? "ask",
    },
    entries: base.entries.map((entry) => ({ ...entry })),
  };
}

export function buildPreviewFromInstalledState(
  state: InstalledPluginState,
): InstalledAppPreview {
  return {
    identity: state.identity,
    manifest: state.manifest,
    projection: state.projection,
    readiness: state.readiness,
    cleanupPlan: buildCleanupPlan({
      projection: state.projection,
      generatedAt: state.updatedAt,
    }),
  };
}

export function buildRuntimePackageLoadForPreview(
  preview: InstalledAppPreview,
) {
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
