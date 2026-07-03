import { describe, expect, it, vi } from "vitest";
import {
  repairStaleInstalledPluginReadiness,
  repairStaleInstalledPluginReadinessList,
} from "./staleReadinessRepair";
import type {
  HostCapabilityProfile,
  InstalledPluginState,
} from "../types";

function buildState(
  overrides: Partial<InstalledPluginState> = {},
): InstalledPluginState {
  return {
    appId: "content-factory-app",
    identity: {
      sourceKind: "local_folder",
      sourceUri: "/tmp/content-factory-app",
      appId: "content-factory-app",
      appVersion: "2.2.2",
      packageHash: "sha256:old-package",
      manifestHash: "sha256:old-manifest",
      loadedAt: "2026-07-03T00:00:00.000Z",
    },
    manifest: {},
    projection: {
      entries: [],
    },
    readiness: {
      status: "ready",
      blockers: [],
      warnings: [],
    },
    installMode: "in_lime",
    runtimeProfileSummary: {},
    setup: {},
    disabled: true,
    installedAt: "2026-07-03T00:00:00.000Z",
    updatedAt: "2026-07-03T00:00:00.000Z",
    ...overrides,
  } as unknown as InstalledPluginState;
}

const profile = {
  capabilities: {},
} as HostCapabilityProfile;

describe("repairStaleInstalledPluginReadiness", () => {
  it("本地目录包 hash 变化时自动刷新 installed state 并保留用户安装状态", async () => {
    const stale = buildState();
    const refreshed = buildState({
      identity: {
        ...stale.identity,
        packageHash: "sha256:new-package",
        manifestHash: "sha256:new-manifest",
      },
      projection: {
        entries: [
          {
            key: "content_factory",
            kind: "page",
            title: "内容工厂",
            route: "/",
          },
        ],
      },
      disabled: false,
      installMode: "runtime_backed",
      installedAt: "2026-07-04T00:00:00.000Z",
    } as unknown as InstalledPluginState);
    const reviewLocalPackage = vi.fn(async () => ({ state: refreshed }));
    const saveInstalledState = vi.fn(async ({ state }) => state);

    const repaired = await repairStaleInstalledPluginReadiness(
      stale,
      profile,
      {
        reviewLocalPackage,
        saveInstalledState,
      },
    );

    expect(reviewLocalPackage).toHaveBeenCalledWith({
      appDir: stale.identity.sourceUri,
      profile,
      sourceKind: "local_folder",
    });
    expect(saveInstalledState).toHaveBeenCalledWith({
      state: expect.objectContaining({
        disabled: true,
        installMode: "in_lime",
        installedAt: stale.installedAt,
        identity: expect.objectContaining({
          packageHash: "sha256:new-package",
          manifestHash: "sha256:new-manifest",
        }),
        projection: expect.objectContaining({
          entries: expect.arrayContaining([
            expect.objectContaining({
              key: "content_factory",
              kind: "page",
            }),
          ]),
        }),
      }),
    });
    expect(repaired.projection.entries[0]).toMatchObject({
      key: "content_factory",
      kind: "page",
    });
  });

  it("本地目录包 hash 未变化时不写回 installed state", async () => {
    const current = buildState();
    const reviewLocalPackage = vi.fn(async () => ({ state: current }));
    const saveInstalledState = vi.fn(async ({ state }) => state);

    const repaired = await repairStaleInstalledPluginReadinessList(
      [current],
      profile,
      {
        reviewLocalPackage,
        saveInstalledState,
      },
    );

    expect(reviewLocalPackage).toHaveBeenCalledOnce();
    expect(saveInstalledState).not.toHaveBeenCalled();
    expect(repaired[0]).toBe(current);
  });
});
