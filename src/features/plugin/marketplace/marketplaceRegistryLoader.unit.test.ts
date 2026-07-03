import { beforeEach, describe, expect, it, vi } from "vitest";

import type { InstalledAgentAppStateListResult } from "@/features/agent-app";
import contentFactoryFixtureData from "@/features/agent-app/testing/fixtures/content-factory-app.json";
import { buildInstalledAgentAppState } from "@/features/agent-app/install/installedAppState";
import { buildInstalledAppPreview } from "@/features/agent-app/install/installedAppPreview";
import { buildAgentAppLabResolvedSetupState } from "@/features/agent-app/install/labInstallFlow";
import { buildLocalAgentAppSourceState } from "@/features/agent-app/install/installReview";
import { buildPackageIdentity } from "@/features/agent-app/install/packageIdentity";
import type { AppManifest } from "@/features/agent-app/types";
import type { InstalledAgentAppState } from "@/features/agent-app/types";
import { OemCloudControlPlaneError } from "@/lib/api/oemCloudControlPlane";
import type { PluginMarketplaceListResponse } from "./types";
import { loadPluginMarketplaceRegistry } from "./marketplaceRegistryLoader";

function marketplace(): PluginMarketplaceListResponse {
  return {
    schemaVersion: "plugin-marketplace/v1",
    tenantId: "tenant-0001",
    generatedAt: "2026-06-25T00:00:00.000Z",
    marketplaceName: "limecloud",
    items: [
      {
        pluginKey: "research-kit@limecloud",
        pluginName: "research-kit",
        marketplaceName: "limecloud",
        displayName: "Research Kit",
        version: "1.2.3",
        sourceKind: "agent_app_release",
        appId: "research-kit",
        enabled: true,
        installState: "available",
        activationState: "activatable",
        policy: {
          installation: "AVAILABLE",
          authentication: "ON_USE",
        },
        package: {
          packageUrl:
            "https://packages.limecloud.example/plugins/research-kit-1.2.3.lpkg",
          packageHash:
            "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          manifestHash:
            "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        },
      },
      {
        pluginKey: "stale-kit@limecloud",
        pluginName: "stale-kit",
        marketplaceName: "limecloud",
        displayName: "Stale Kit",
        version: "1.2.3",
        sourceKind: "agent_app_release",
        appId: "stale-kit",
        enabled: true,
        installState: "available",
        activationState: "activatable",
        policy: {
          installation: "AVAILABLE",
          authentication: "ON_USE",
        },
        package: {
          packageUrl:
            "https://packages.limecloud.example/plugins/stale-kit-1.2.3.lpkg",
          packageHash:
            "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
          manifestHash:
            "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
        },
      },
    ],
  };
}

function installedState(
  overrides: {
    appId?: string;
    packageHash?: string;
    manifestHash?: string;
    sourceUri?: string;
    disabled?: boolean;
  } = {},
): InstalledAgentAppState {
  const appId = overrides.appId ?? "research-kit";
  return {
    appId,
    identity: {
      sourceKind: "cloud_release",
      sourceUri:
        overrides.sourceUri ??
        "https://packages.limecloud.example/plugins/research-kit-1.2.3.lpkg",
      appId,
      appVersion: "1.2.3",
      packageHash:
        overrides.packageHash ??
        "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      manifestHash:
        overrides.manifestHash ??
        "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      loadedAt: "2026-06-25T00:00:00.000Z",
    },
    manifest: {} as InstalledAgentAppState["manifest"],
    projection: {} as InstalledAgentAppState["projection"],
    readiness: {
      appId,
      status: "ready",
      checkedAt: "2026-06-25T00:00:00.000Z",
      blockers: [],
      warnings: [],
      supportedCapabilities: [],
      missingCapabilities: [],
      entryReadiness: [],
      installModes: [],
    },
    installMode: "in_lime",
    runtimeProfileSummary:
      {} as InstalledAgentAppState["runtimeProfileSummary"],
    setup: {} as InstalledAgentAppState["setup"],
    disabled: overrides.disabled ?? false,
    installedAt: "2026-06-25T00:00:00.000Z",
    updatedAt: "2026-06-25T00:00:00.000Z",
  } as InstalledAgentAppState;
}

function readyInstalledState(): InstalledAgentAppState {
  const loadedAt = "2026-06-25T00:00:00.000Z";
  const manifest = contentFactoryFixtureData as AppManifest;
  const identity = buildPackageIdentity({
    manifest,
    sourceKind: "local_folder",
    sourceUri: "/tmp/lime/content-factory-app",
    loadedAt,
  });
  const setupPreview = buildInstalledAppPreview({
    fixture: manifest,
    identity,
    loadedAt,
    checkedAt: loadedAt,
    generatedAt: loadedAt,
  });
  const setup = buildAgentAppLabResolvedSetupState(setupPreview.projection);
  const preview = buildInstalledAppPreview({
    fixture: manifest,
    identity,
    setup,
    loadedAt,
    checkedAt: loadedAt,
    generatedAt: loadedAt,
  });
  return buildInstalledAgentAppState({
    preview,
    setup,
    installedAt: loadedAt,
    updatedAt: loadedAt,
  });
}

function staleProfileBlockedInstalledState(): InstalledAgentAppState {
  const state = readyInstalledState();
  return {
    ...state,
    readiness: {
      ...state.readiness,
      status: "blocked",
      blockers: [
        "lime.agent",
        "lime.artifacts",
        "lime.evidence",
        "lime.knowledge",
        "lime.storage",
        "lime.workflow",
      ].map((capability) => ({
        code: "CAPABILITY_MISSING" as const,
        severity: "blocker" as const,
        message: `${capability} missing`,
        capability,
      })),
      warnings: [],
    },
  };
}

describe("plugin marketplace registry loader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("应组合 LimeCore marketplace 与 App Server installed state 为统一 registry snapshot", async () => {
    const getMarketplace = vi.fn(async () => marketplace());
    const listInstalled = vi.fn(
      async (): Promise<InstalledAgentAppStateListResult> => ({
        states: [
          installedState(),
          installedState({
            appId: "stale-kit",
            packageHash:
              "sha256:1111111111111111111111111111111111111111111111111111111111111111",
            manifestHash:
              "sha256:2222222222222222222222222222222222222222222222222222222222222222",
          }),
        ],
        issues: [
          {
            code: "READ_FAILED",
            path: "<LimeAppData>/agent-apps/installed/broken.json",
            message: "read failed",
          },
        ],
      }),
    );

    const snapshot = await loadPluginMarketplaceRegistry(
      "tenant-0001",
      { category: "research", sort: "recommended" },
      { getMarketplace, listInstalled },
    );

    expect(getMarketplace).toHaveBeenCalledWith("tenant-0001", {
      category: "research",
      sort: "recommended",
    });
    expect(listInstalled).toHaveBeenCalledTimes(1);
    expect(snapshot.installed.issues).toHaveLength(1);
    expect(snapshot.registry).toEqual([
      expect.objectContaining({
        pluginId: "research-kit@limecloud",
        installed: true,
        enabled: true,
        activationState: "activatable",
      }),
      expect.objectContaining({
        pluginId: "stale-kit@limecloud",
        installed: true,
        enabled: true,
        activationState: "activatable",
        blockerCodes: expect.arrayContaining([
          "PLUGIN_INSTALLED_PACKAGE_MISMATCH",
        ]),
      }),
    ]);
    expect(snapshot.projectionInputs).toHaveLength(2);
  });

  it("没有云端租户时只使用本地已安装插件，不再读取 Agent App 云端目录", async () => {
    const getMarketplace = vi.fn(async () => marketplace());
    const localState = readyInstalledState();
    const listInstalled = vi.fn(
      async (): Promise<InstalledAgentAppStateListResult> => ({
        states: [localState],
        issues: [],
      }),
    );

    const snapshot = await loadPluginMarketplaceRegistry(
      "",
      {},
      { getMarketplace, listInstalled },
    );

    expect(getMarketplace).not.toHaveBeenCalled();
    expect(listInstalled).toHaveBeenCalledTimes(1);
    expect(snapshot.marketplace.marketplaceName).toBe("local");
    expect(snapshot.marketplace.items).toHaveLength(1);
    expect(snapshot.marketplace.items[0]).toMatchObject({
      pluginKey: localState.appId,
      displayName: localState.manifest.displayName,
      policy: {
        installation: "INSTALLED_BY_DEFAULT",
        authentication: "ON_USE",
      },
    });
    expect(
      snapshot.registry.find((item) => item.pluginId === localState.appId),
    ).toMatchObject({
      pluginId: localState.appId,
      installed: true,
      enabled: true,
    });
  });

  it("本地旧 profile 造成的 blocked readiness 应在加载 registry 时自动修复", async () => {
    const staleState = staleProfileBlockedInstalledState();
    const repairedState = {
      ...staleState,
      readiness: {
        ...staleState.readiness,
        status: "degraded" as const,
        blockers: [],
      },
    };
    const listInstalled = vi.fn(
      async (): Promise<InstalledAgentAppStateListResult> => ({
        states: [staleState],
        issues: [],
      }),
    );
    const reviewLocalPackage = vi.fn(async () => ({
      review: {
        id: `${staleState.appId}:${staleState.identity.appVersion}`,
        appId: staleState.appId,
        displayName: staleState.manifest.displayName,
        version: staleState.identity.appVersion,
        manifestVersion: staleState.manifest.manifestVersion,
        sourceKind: staleState.identity.sourceKind,
        sourceUri: staleState.identity.sourceUri,
        sourceState: buildLocalAgentAppSourceState(),
        packageHash: staleState.identity.packageHash,
        manifestHash: staleState.identity.manifestHash,
        entryCount: staleState.projection.entries.length,
        capabilityCount: staleState.projection.requiredCapabilities.length,
        requiredCapabilityKeys: staleState.projection.requiredCapabilities.map(
          (item) => item.capability,
        ),
        permissionCount: staleState.manifest.permissions.length,
        storageNamespace: staleState.projection.storage?.namespace,
        cleanupTargetCount: 0,
        readinessStatus: repairedState.readiness.status,
        blockerCount: repairedState.readiness.blockers.length,
        warningCount: repairedState.readiness.warnings.length,
        generatedAt: staleState.updatedAt,
      },
      state: repairedState,
    }));
    const saveInstalledState = vi.fn(async () => repairedState);

    const snapshot = await loadPluginMarketplaceRegistry("", {}, {
      listInstalled,
      reviewLocalPackage,
      saveInstalledState,
    });

    expect(reviewLocalPackage).toHaveBeenCalledWith({
      appDir: staleState.identity.sourceUri,
      profile: expect.objectContaining({
        capabilities: expect.objectContaining({
          "lime.agent": expect.objectContaining({ enabled: true }),
          "lime.workflow": expect.objectContaining({ enabled: true }),
          "lime.storage": expect.objectContaining({ enabled: true }),
          "lime.artifacts": expect.objectContaining({ enabled: true }),
        }),
      }),
      sourceKind: "local_folder",
    });
    expect(saveInstalledState).toHaveBeenCalledWith({ state: repairedState });
    expect(snapshot.installed.states[0].readiness).toMatchObject({
      status: "degraded",
      blockers: [],
    });
    expect(
      snapshot.registry.find((item) => item.pluginId === staleState.appId),
    ).toMatchObject({
      installed: true,
      enabled: true,
      activationState: "activatable",
    });
  });

  it("远端 marketplace 条目应复用已安装 Agent App manifest 补齐说明与 renderer", async () => {
    const localState = readyInstalledState();
    const getMarketplace = vi.fn(
      async (): Promise<PluginMarketplaceListResponse> => ({
        schemaVersion: "plugin-marketplace/v1",
        tenantId: "tenant-0001",
        generatedAt: "2026-06-25T00:00:00.000Z",
        marketplaceName: "limecloud",
        items: [
          {
            pluginKey: localState.appId,
            pluginName: "content_factory",
            marketplaceName: "limecloud",
            displayName: "内容工厂",
            description: "",
            version: localState.manifest.version,
            sourceKind: "agent_app_release",
            enabled: true,
            installState: "available",
            activationState: "activatable",
            policy: {
              installation: "AVAILABLE",
              authentication: "ON_USE",
            },
            package: {
              packageHash: localState.identity.packageHash,
              manifestHash: localState.identity.manifestHash,
            },
          },
        ],
      }),
    );
    const listInstalled = vi.fn(
      async (): Promise<InstalledAgentAppStateListResult> => ({
        states: [localState],
        issues: [],
      }),
    );

    const snapshot = await loadPluginMarketplaceRegistry("tenant-0001", {}, {
      getMarketplace,
      listInstalled,
    });

    expect(snapshot.marketplace.items[0]).toMatchObject({
      pluginKey: localState.appId,
      appId: localState.appId,
      description: localState.manifest.description,
      manifestSummary: {
        agentRuntime: expect.objectContaining({
          intents: expect.arrayContaining([
            expect.objectContaining({
              key: "content_article_generate",
              taskKind: "content.article.generate",
            }),
          ]),
        }),
        workbench: expect.objectContaining({
          workbenchTasks: expect.arrayContaining([
            expect.objectContaining({
              kind: "content.article.generate",
              expectedObjects: ["articleDraft"],
            }),
          ]),
        }),
        artifactRenderers: expect.arrayContaining([
          expect.objectContaining({
            rendererKind: "host_builtin",
            outputArtifactKind: "content_factory.workspace_patch",
          }),
        ]),
        historyRestore: expect.objectContaining({
          fallback: "artifactPreview",
        }),
        skillRefs: expect.arrayContaining([
          expect.objectContaining({
            id: "article-research",
            activation: "content.article.generate",
          }),
        ]),
        toolRefs: expect.arrayContaining([
          expect.objectContaining({
            key: "content-factory-worker",
            provider: "local-worker",
          }),
        ]),
      },
    });
    expect(snapshot.registry[0]).toMatchObject({
      pluginId: localState.appId,
      installed: true,
      enabled: true,
      activationState: "activatable",
      rendererState: "renderable",
      capabilityStates: expect.arrayContaining(["activatable", "renderable"]),
      blockerCodes: expect.not.arrayContaining([
        "PLUGIN_RENDERER_UNAVAILABLE",
      ]),
    });
  });

  it("本地已安装插件不再与旧 Agent App 目录做包匹配", async () => {
    const localState = readyInstalledState();
    const listInstalled = vi.fn(
      async (): Promise<InstalledAgentAppStateListResult> => ({
        states: [localState],
        issues: [],
      }),
    );

    const snapshot = await loadPluginMarketplaceRegistry(
      "",
      {},
      {
        getMarketplace: vi.fn(async () => marketplace()),
        listInstalled,
      },
    );

    expect(snapshot.registry).toEqual([
      expect.objectContaining({
        pluginId: localState.appId,
        installed: true,
        enabled: true,
        activationState: "activatable",
        blockerCodes: expect.not.arrayContaining([
          "PLUGIN_INSTALLED_PACKAGE_MISMATCH",
        ]),
      }),
    ]);
  });

  it("云端认证失败时应回退到本地已安装插件目录", async () => {
    const getMarketplace = vi.fn(async () => {
      throw new OemCloudControlPlaneError("invalid auth token", {
        status: 401,
      });
    });
    const localState = readyInstalledState();
    const listInstalled = vi.fn(
      async (): Promise<InstalledAgentAppStateListResult> => ({
        states: [localState],
        issues: [],
      }),
    );

    const snapshot = await loadPluginMarketplaceRegistry(
      "tenant-0001",
      { sort: "name" },
      { getMarketplace, listInstalled },
    );

    expect(getMarketplace).toHaveBeenCalledWith("tenant-0001", {
      sort: "name",
    });
    expect(snapshot.marketplace.marketplaceName).toBe("local");
    expect(snapshot.registry[0]).toMatchObject({
      pluginId: localState.appId,
      installed: true,
      enabled: true,
    });
  });
});
