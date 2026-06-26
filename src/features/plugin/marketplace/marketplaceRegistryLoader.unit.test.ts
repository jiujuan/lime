import { beforeEach, describe, expect, it, vi } from "vitest";

import type { InstalledAgentAppStateListResult } from "@/features/agent-app";
import type { InstalledAgentAppState } from "@/features/agent-app/types";
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
    disabled?: boolean;
  } = {},
): InstalledAgentAppState {
  const appId = overrides.appId ?? "research-kit";
  return {
    appId,
    identity: {
      sourceKind: "cloud_release",
      sourceUri:
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
        installed: false,
        blockerCodes: expect.arrayContaining([
          "PLUGIN_INSTALLED_PACKAGE_MISMATCH",
        ]),
      }),
    ]);
    expect(snapshot.projectionInputs).toHaveLength(2);
  });
});
