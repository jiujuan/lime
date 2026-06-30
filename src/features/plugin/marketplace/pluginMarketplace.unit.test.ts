import { describe, expect, it } from "vitest";

import type { InstalledAgentAppState } from "@/features/agent-app/types";
import {
  buildPluginContractFromMarketplaceItem,
  projectPluginMarketplaceItemSkills,
  projectPluginMarketplaceInstalledKeysFromAgentApps,
  projectPluginMarketplaceRegistryFromInstalledAgentApps,
  projectPluginMarketplaceRegistry,
  projectPluginMarketplaceRegistryInputs,
} from "./pluginMarketplace";
import type {
  PluginMarketplaceItem,
  PluginMarketplaceListResponse,
} from "./types";

function marketplaceItem(
  overrides: Partial<PluginMarketplaceItem> = {},
): PluginMarketplaceItem {
  return {
    pluginKey: "research-kit@limecloud",
    pluginName: "research-kit",
    marketplaceName: "limecloud",
    marketplaceDisplayName: "LimeCloud Marketplace",
    displayName: "Research Kit",
    description: "Research plugin package",
    version: "1.2.3",
    category: "research",
    categories: ["research"],
    keywords: ["research", "-style"],
    capabilities: ["lime.skills"],
    sourceKind: "agent_app_release",
    sourceRef: "release-001",
    appId: "research-kit",
    enabled: true,
    installState: "available",
    activationState: "activatable",
    policy: {
      installation: "AVAILABLE",
      authentication: "ON_USE",
    },
    package: {
      releaseId: "release-001",
      packageUrl:
        "https://packages.limecloud.example/plugins/research-kit-1.2.3.lpkg",
      packageHash:
        "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      manifestHash:
        "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    },
    manifestSummary: {
      name: "research-kit",
    },
    ...overrides,
  };
}

function marketplace(
  items: PluginMarketplaceItem[],
): PluginMarketplaceListResponse {
  return {
    schemaVersion: "plugin-marketplace/v1",
    tenantId: "tenant-0001",
    generatedAt: "2026-06-25T00:00:00.000Z",
    marketplaceName: "limecloud",
    marketplaceDisplayName: "LimeCloud Marketplace",
    items,
  };
}

function installedState(
  overrides: {
    appId?: string;
    packageHash?: string;
    manifestHash?: string;
    disabled?: boolean;
    sourceUri?: string;
    loadedAt?: string;
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
      loadedAt: overrides.loadedAt ?? "2026-06-25T00:00:00.000Z",
    },
    manifest: {} as InstalledAgentAppState["manifest"],
    projection: {} as InstalledAgentAppState["projection"],
    readiness: {} as InstalledAgentAppState["readiness"],
    installMode: "in_lime",
    runtimeProfileSummary:
      {} as InstalledAgentAppState["runtimeProfileSummary"],
    setup: {} as InstalledAgentAppState["setup"],
    disabled: overrides.disabled ?? false,
    installedAt: "2026-06-25T00:00:00.000Z",
    updatedAt: "2026-06-25T00:00:00.000Z",
  } as InstalledAgentAppState;
}

function registryItemByPluginId(
  registry: ReturnType<typeof projectPluginMarketplaceRegistry>,
  pluginId: string,
) {
  const item = registry.find((entry) => entry.pluginId === pluginId);
  expect(item).toBeDefined();
  return item as NonNullable<typeof item>;
}

describe("Plugin marketplace projection", () => {
  it("应从 LimeCore marketplace item 建立 plugin contract provenance", () => {
    const contract = buildPluginContractFromMarketplaceItem(marketplaceItem());

    expect(contract).toMatchObject({
      id: "research-kit@limecloud",
      name: "research-kit",
      displayName: "Research Kit",
      version: "1.2.3",
      categories: ["research"],
      capabilities: ["lime.skills"],
      interface: {
        displayName: "Research Kit",
        shortDescription: "Research plugin package",
        category: "research",
        capabilities: ["lime.skills"],
      },
      provenance: {
        sourceKind: "plugin_marketplace",
        sourceId: "research-kit@limecloud",
        sourceVersion: "1.2.3",
        packageHash:
          "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        manifestHash:
          "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      },
    });
    expect(contract.agentApps[0]).toMatchObject({
      id: "research-kit",
      title: "Research Kit",
    });
    expect(contract.activationEntries[0]).toMatchObject({
      key: "research-kit",
      kind: "agentApp",
      intent: "manual",
    });
  });

  it("应把 install contract 从 marketplace item 透传到 plugin contract", () => {
    const contract = buildPluginContractFromMarketplaceItem(
      marketplaceItem({
        install: {
          local: true,
          cloud: false,
          authentication: "on_use",
        },
      }),
    );

    expect(contract.install).toEqual({
      local: true,
      cloud: false,
      authentication: "on_use",
    });
  });

  it("应从 manifestSummary.skills 投影技能声明并过滤坏数据", () => {
    const item = marketplaceItem({
      manifestSummary: {
        name: "research-kit",
        skills: [
          {
            id: "article-writer",
            title: "Article Writer",
            description: "Draft long-form articles",
          },
          {
            id: "image-brief",
          },
          {
            id: "article-writer",
            title: "Duplicate Writer",
          },
          {
            title: "Missing id",
          },
          "bad-entry",
        ],
      },
    });

    expect(projectPluginMarketplaceItemSkills(item)).toEqual([
      {
        id: "article-writer",
        title: "Article Writer",
        description: "Draft long-form articles",
      },
      {
        id: "image-brief",
        title: "image-brief",
      },
    ]);
    expect(buildPluginContractFromMarketplaceItem(item).skills).toMatchObject([
      {
        id: "article-writer",
        title: "Article Writer",
        description: "Draft long-form articles",
      },
      {
        id: "image-brief",
        title: "image-brief",
      },
    ]);
  });

  it("应从 manifestSummary.artifactRenderers 投影 renderer 输出 contract", () => {
    const contract = buildPluginContractFromMarketplaceItem(
      marketplaceItem({
        sourceKind: "plugin_catalog",
        appId: undefined,
        manifestSummary: {
          artifactRenderers: [
            {
              artifactType: "creator.article_draft",
              surfaceKind: "documentCanvas",
              paneKind: "editor",
              rendererKind: "app_declared",
              outputArtifactKind: "creator.workspace_patch",
              actions: [
                {
                  key: "regenerate",
                  risk: "write",
                  taskKind: "creator.generate",
                },
              ],
            },
          ],
          historyRestore: {
            defaultSurface: "selectedObject",
            restoreSelection: true,
            restoreLayout: true,
            fallback: "artifactPreview",
          },
        },
      }),
    );

    expect(contract.artifactRenderers).toEqual([
      expect.objectContaining({
        artifactType: "creator.article_draft",
        surfaceKind: "documentCanvas",
        paneKind: "editor",
        rendererKind: "app_declared",
        outputArtifactKind: "creator.workspace_patch",
        actions: [
          {
            key: "regenerate",
            intent: undefined,
            risk: "write",
            taskKind: "creator.generate",
            title: undefined,
          },
        ],
      }),
    ]);
    expect(contract.rightSurface).toMatchObject({
      articleWorkspace: {
        enabled: true,
        primaryObjectKind: "creator.article_draft",
      },
      historyRestore: {
        enabled: true,
        restoreSelection: true,
        restoreLayout: true,
      },
    });
  });

  it("应把 available marketplace item 投影为可安装，安装后才可激活", () => {
    const item = marketplaceItem();
    const inputs = projectPluginMarketplaceRegistryInputs(marketplace([item]));
    const registry = projectPluginMarketplaceRegistry(marketplace([item]));

    expect(inputs[0]).toMatchObject({
      installed: false,
      installable: true,
      enabled: false,
      readinessStatus: "ready",
    });
    expect(registry[0]).toMatchObject({
      pluginId: "research-kit@limecloud",
      capabilityStates: ["installable"],
      activationState: "blocked",
      blockerCodes: expect.arrayContaining([
        "PLUGIN_ACTIVATION_BLOCKED",
        "PLUGIN_WORKSPACE_MISSING",
      ]),
    });

    const installedRegistry = projectPluginMarketplaceRegistry(
      marketplace([item]),
      {
        installedPluginKeys: ["research-kit@limecloud"],
      },
    );
    expect(installedRegistry[0]).toMatchObject({
      capabilityStates: ["activatable"],
      activationState: "activatable",
      blockerCodes: ["PLUGIN_RENDERER_UNAVAILABLE"],
    });
  });

  it("blocked marketplace item 不应暴露可安装能力，并保留云端阻断原因", () => {
    const registry = projectPluginMarketplaceRegistry(
      marketplace([
        marketplaceItem({
          enabled: false,
          installState: "blocked",
          activationState: "blocked",
          blockedReason: "registration required",
          policy: {
            installation: "NOT_AVAILABLE",
            authentication: "ON_INSTALL",
          },
          package: undefined,
        }),
      ]),
    );

    expect(registry[0]).toMatchObject({
      capabilityStates: [],
      activationState: "blocked",
      blockerCodes: expect.arrayContaining([
        "PLUGIN_MARKETPLACE_BLOCKED:registration required",
        "PLUGIN_INSTALL_UNAVAILABLE",
      ]),
    });
  });

  it("INSTALLED_BY_DEFAULT 插件应直接进入可激活 registry 状态", () => {
    const registry = projectPluginMarketplaceRegistry(
      marketplace([
        marketplaceItem({
          policy: {
            installation: "INSTALLED_BY_DEFAULT",
            authentication: "ON_USE",
          },
        }),
      ]),
    );

    expect(registry[0]).toMatchObject({
      installed: true,
      enabled: true,
      capabilityStates: ["activatable"],
      activationState: "activatable",
    });
  });

  it("应从 installed Agent App state 合并 installed / enabled key，并对 hash 不一致 fail closed", () => {
    const matchItem = marketplaceItem({
      pluginKey: "research-kit@limecloud",
      pluginName: "research-kit",
      appId: "research-kit",
    });
    const disabledItem = marketplaceItem({
      pluginKey: "notes-kit@limecloud",
      pluginName: "notes-kit",
      displayName: "Notes Kit",
      appId: "notes-kit",
      package: {
        releaseId: "release-002",
        packageUrl:
          "https://packages.limecloud.example/plugins/notes-kit-1.2.3.lpkg",
        packageHash:
          "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
        manifestHash:
          "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
      },
    });
    const mismatchItem = marketplaceItem({
      pluginKey: "broken-kit@limecloud",
      pluginName: "broken-kit",
      displayName: "Broken Kit",
      appId: "broken-kit",
      package: {
        releaseId: "release-003",
        packageUrl:
          "https://packages.limecloud.example/plugins/broken-kit-1.2.3.lpkg",
        packageHash:
          "sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
        manifestHash:
          "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
      },
    });
    const installedApps = [
      installedState({
        appId: "research-kit",
      }),
      installedState({
        appId: "notes-kit",
        packageHash:
          "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
        manifestHash:
          "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
        disabled: true,
      }),
      installedState({
        appId: "broken-kit",
        packageHash:
          "sha256:1111111111111111111111111111111111111111111111111111111111111111",
        manifestHash:
          "sha256:2222222222222222222222222222222222222222222222222222222222222222",
      }),
    ];

    const projection = projectPluginMarketplaceInstalledKeysFromAgentApps(
      marketplace([matchItem, disabledItem, mismatchItem]),
      installedApps,
    );
    expect(projection.installedPluginKeys).toEqual([
      "research-kit@limecloud",
      "notes-kit@limecloud",
    ]);
    expect(projection.enabledPluginKeys).toEqual(["research-kit@limecloud"]);
    expect(projection.disabledPluginKeys).toEqual(["notes-kit@limecloud"]);
    expect(projection.blockerCodesByPluginKey).toEqual({
      "broken-kit@limecloud": ["PLUGIN_INSTALLED_PACKAGE_MISMATCH"],
    });

    const registry = projectPluginMarketplaceRegistryFromInstalledAgentApps(
      marketplace([matchItem, disabledItem, mismatchItem]),
      { installedAgentApps: installedApps },
    );

    expect(
      registryItemByPluginId(registry, "research-kit@limecloud"),
    ).toMatchObject({
      installed: true,
      enabled: true,
      capabilityStates: ["activatable"],
      activationState: "activatable",
    });
    expect(
      registryItemByPluginId(registry, "notes-kit@limecloud"),
    ).toMatchObject({
      installed: true,
      enabled: false,
      activationState: "disabled",
      blockerCodes: expect.arrayContaining(["PLUGIN_DISABLED"]),
    });
    expect(
      registryItemByPluginId(registry, "broken-kit@limecloud"),
    ).toMatchObject({
      installed: false,
      enabled: false,
      blockerCodes: expect.arrayContaining([
        "PLUGIN_INSTALLED_PACKAGE_MISMATCH",
      ]),
    });
  });

  it("已安装 Agent App 即使 marketplace 缺包引用也应保持可激活", () => {
    const registry = projectPluginMarketplaceRegistryFromInstalledAgentApps(
      marketplace([
        marketplaceItem({
          package: undefined,
          manifestSummary: {
            artifactRenderers: [
              {
                artifactType: "creator.article_draft",
                surfaceKind: "documentCanvas",
                rendererKind: "host_builtin",
              },
            ],
          },
        }),
      ]),
      {
        installedAgentApps: [installedState()],
      },
    );

    expect(registry[0]).toMatchObject({
      pluginId: "research-kit@limecloud",
      installed: true,
      enabled: true,
      activationState: "activatable",
      rendererState: "renderable",
      capabilityStates: expect.arrayContaining(["activatable", "renderable"]),
      blockerCodes: [],
    });
  });
});
