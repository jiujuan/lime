import { describe, expect, it } from "vitest";
import { buildInstalledAppPreview } from "../install/installedAppPreview";
import { buildPluginPackageCacheEntry } from "../install/packageCache";
import { PluginCapabilityError } from "../sdk/capabilityErrors";
import {
  buildContentFactoryUiRuntimeResolvedSetup,
  buildContentFactoryUiRuntimeTestManifest,
} from "../testing/contentFactoryTestManifest";
import { buildUiRuntimeCapabilityProfile } from "./uiRuntimeCapabilityProfile";
import {
  findUiBundleDescriptor,
  loadRuntimePackageDescriptor,
  mountRuntimePackageUiEntry,
} from "./runtimePackageLoader";

const now = "2026-05-15T00:00:00.000Z";

function buildPreview() {
  return buildInstalledAppPreview({
    fixture: buildContentFactoryUiRuntimeTestManifest(),
    setup: buildContentFactoryUiRuntimeResolvedSetup(),
    profile: buildUiRuntimeCapabilityProfile({
      realAdapterEnabled: true,
      uiRuntimeEnabled: true,
    }),
    loadedAt: now,
    checkedAt: now,
    generatedAt: now,
  });
}

describe("RuntimePackageLoader P13", () => {
  it("应只从 verified package cache 生成 runtime descriptor 和 UI bundle descriptor", () => {
    const preview = buildPreview();
    const cacheEntry = buildPluginPackageCacheEntry({
      identity: preview.identity,
      manifestSnapshot: preview.manifest,
      actualPackageHash: preview.identity.packageHash,
      actualManifestHash: preview.identity.manifestHash,
      cachedAt: now,
    });

    const loaded = loadRuntimePackageDescriptor({
      cacheEntry,
      identity: preview.identity,
      projection: preview.projection,
    });

    expect(loaded.status).toBe("loaded");
    expect(loaded.verification.status).toBe("verified");
    expect(loaded.descriptor).toMatchObject({
      appId: "content-factory-app",
      loadedFrom: "package-cache",
      cachePath: expect.stringContaining(preview.identity.packageHash),
      policyEvidence: {
        rawWorkerAllowed: false,
        networkAllowed: false,
        fileSystemAllowed: false,
        rawHostApiAllowed: false,
        nodeApiAllowed: false,
      },
    });
    expect(loaded.descriptor?.uiBundles.map((bundle) => bundle.entryKey)).toEqual(
      expect.arrayContaining(["dashboard", "knowledge", "content_factory"]),
    );
  });

  it("hash mismatch 的 package 不得进入 loader", () => {
    const preview = buildPreview();
    const cacheEntry = buildPluginPackageCacheEntry({
      identity: preview.identity,
      manifestSnapshot: preview.manifest,
      actualPackageHash: "package-fnv1a-badbad00",
      cachedAt: now,
    });

    const loaded = loadRuntimePackageDescriptor({
      cacheEntry,
      identity: preview.identity,
      projection: preview.projection,
    });

    expect(loaded).toMatchObject({
      status: "blocked",
      verification: {
        status: "package_hash_mismatch",
      },
      issues: [
        {
          code: "PACKAGE_NOT_VERIFIED",
        },
      ],
    });
  });

  it("bundle descriptor entry 必须存在于 projection 且必须是 UI entry", () => {
    const preview = buildPreview();
    const cacheEntry = buildPluginPackageCacheEntry({
      identity: preview.identity,
      manifestSnapshot: preview.manifest,
      actualPackageHash: preview.identity.packageHash,
      actualManifestHash: preview.identity.manifestHash,
      cachedAt: now,
    });
    const loaded = loadRuntimePackageDescriptor({
      cacheEntry,
      identity: preview.identity,
      projection: preview.projection,
    });
    const descriptor = loaded.descriptor!;

    expect(() =>
      findUiBundleDescriptor({
        descriptor,
        projection: preview.projection,
        entryKey: "content_scenario_planning",
      }),
    ).toThrow(PluginCapabilityError);
    try {
      findUiBundleDescriptor({
        descriptor,
        projection: preview.projection,
        entryKey: "content_scenario_planning",
      });
    } catch (error) {
      expect(error).toMatchObject({ code: "UI_ENTRY_UNSUPPORTED" });
    }
  });

  it("应通过现有 UiExtensionHost mount contract 挂载 UI entry", () => {
    const preview = buildPreview();
    const cacheEntry = buildPluginPackageCacheEntry({
      identity: preview.identity,
      manifestSnapshot: preview.manifest,
      actualPackageHash: preview.identity.packageHash,
      actualManifestHash: preview.identity.manifestHash,
      cachedAt: now,
    });
    const loaded = loadRuntimePackageDescriptor({
      cacheEntry,
      identity: preview.identity,
      projection: preview.projection,
    });
    const mounted = mountRuntimePackageUiEntry({
      descriptor: loaded.descriptor!,
      preview,
      flags: buildUiRuntimeCapabilityProfile({
        realAdapterEnabled: true,
        uiRuntimeEnabled: true,
      }).featureFlags,
      entryKey: "dashboard",
      now: () => now,
    });

    expect(mounted.bundle).toMatchObject({
      entryKey: "dashboard",
      bundlePath: "./dist/ui",
      packageHash: preview.identity.packageHash,
    });
    expect(mounted.mounted).toMatchObject({
      entryKey: "dashboard",
      fallback: "lab-projection",
      sandboxPolicy: {
        allowRawHostApi: false,
        allowNodeApi: false,
        allowNetworkAccess: false,
      },
      sdkBridge: {
        bridgeKind: "injected-sdk",
        rawHostApi: false,
        nodeApi: false,
      },
    });
  });
});
