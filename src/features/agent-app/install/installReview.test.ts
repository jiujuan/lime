import { describe, expect, it } from "vitest";
import { currentAgentAppHostRuntimeVersion } from "../readiness/hostCapabilityProfile";
import type { CloudBootstrapApp, InstalledAgentAppState } from "../types";
import { buildCloudAgentAppSourceState } from "./installReview";

function buildCloudApp(
  overrides: Partial<CloudBootstrapApp> = {},
): CloudBootstrapApp {
  return {
    appId: "content-factory-app",
    displayName: "内容工厂",
    version: "0.3.0",
    registrationRequired: false,
    registrationState: "not_required",
    enabled: true,
    packageUrl:
      "https://packages.limecloud.example/apps/content-factory-app-0.3.0.lapp",
    packageHash:
      "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    manifestHash:
      "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    capabilityRequirements: {},
    defaultEntries: ["dashboard"],
    policyDefaults: {},
    toolAvailability: [],
    ...overrides,
  };
}

function buildInstalledState(): InstalledAgentAppState {
  return {
    appId: "content-factory-app",
    identity: {
      sourceKind: "cloud_release",
      sourceUri:
        "https://packages.limecloud.example/apps/content-factory-app-0.3.0.lapp",
      appId: "content-factory-app",
      appVersion: "0.3.0",
      packageHash:
        "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      manifestHash:
        "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      loadedAt: "2026-05-15T00:00:00.000Z",
    },
    manifest: {} as InstalledAgentAppState["manifest"],
    projection: {} as InstalledAgentAppState["projection"],
    readiness: {} as InstalledAgentAppState["readiness"],
    installMode: "in_lime",
    runtimeProfileSummary: {
      installMode: "in_lime",
      shellKind: "desktop",
      runtimeVersion: currentAgentAppHostRuntimeVersion,
      checkedAt: "2026-05-15T00:00:00.000Z",
    },
    setup: {} as InstalledAgentAppState["setup"],
    disabled: false,
    installedAt: "2026-05-15T00:00:00.000Z",
    updatedAt: "2026-05-15T00:00:00.000Z",
  };
}

describe("installReview", () => {
  it("应把需要注册码的 Cloud release 阻断在 source state", () => {
    const state = buildCloudAgentAppSourceState({
      app: buildCloudApp({
        registrationRequired: true,
        registrationState: "required",
        enabled: false,
        disabledReason: "registration required",
      }),
      catalogSource: "remote",
      installed: [],
    });

    expect(state).toMatchObject({
      kind: "registration-required",
      canReview: false,
      labelKey: "agentApp.apps.sourceState.registrationRequired",
    });
  });

  it("注册码已激活后仍只允许进入安装审查", () => {
    const state = buildCloudAgentAppSourceState({
      app: buildCloudApp({
        registrationRequired: true,
        registrationState: "active",
      }),
      catalogSource: "remote",
      installed: [],
    });

    expect(state).toMatchObject({
      kind: "registration-active",
      canReview: true,
      labelKey: "agentApp.apps.sourceState.registrationActive",
    });
  });

  it("缺少 hash 的 Cloud release 必须阻断安装审查", () => {
    const state = buildCloudAgentAppSourceState({
      app: buildCloudApp({
        packageHash: "",
        manifestHash: "",
      }),
      catalogSource: "remote",
      installed: [],
    });

    expect(state).toMatchObject({
      kind: "hash-missing",
      canReview: false,
      labelKey: "agentApp.apps.sourceState.hashMissing",
    });
  });

  it("已安装版本不应重复进入安装审查", () => {
    const remote = buildCloudAgentAppSourceState({
      app: buildCloudApp(),
      catalogSource: "remote",
      installed: [buildInstalledState()],
    });
    const bootstrap = buildCloudAgentAppSourceState({
      app: buildCloudApp(),
      catalogSource: "bootstrap",
      installed: [buildInstalledState()],
    });

    expect(remote).toMatchObject({
      kind: "installed",
      canReview: false,
    });
    expect(bootstrap).toMatchObject({
      kind: "offline-cached",
      canReview: false,
    });
  });

  it("同版本但 hash 不一致时不能伪装成 cached fallback", () => {
    const state = buildCloudAgentAppSourceState({
      app: buildCloudApp({
        packageHash:
          "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      }),
      catalogSource: "bootstrap",
      installed: [buildInstalledState()],
    });

    expect(state).toMatchObject({
      kind: "cloud-discovered",
      canReview: true,
    });
  });
});
