import { describe, expect, it } from "vitest";
import { currentPluginHostRuntimeVersion } from "../readiness/hostCapabilityProfile";
import type { CloudBootstrapApp, InstalledPluginState } from "../types";
import type { PluginCloudReleaseEvidence } from "./cloudReleaseEvidence";
import { buildCloudPluginSourceState } from "./installReview";

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

function buildInstalledState(): InstalledPluginState {
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
    manifest: {} as InstalledPluginState["manifest"],
    projection: {} as InstalledPluginState["projection"],
    readiness: {} as InstalledPluginState["readiness"],
    installMode: "in_lime",
    runtimeProfileSummary: {
      installMode: "in_lime",
      shellKind: "desktop",
      runtimeVersion: currentPluginHostRuntimeVersion,
      checkedAt: "2026-05-15T00:00:00.000Z",
    },
    setup: {} as InstalledPluginState["setup"],
    disabled: false,
    installedAt: "2026-05-15T00:00:00.000Z",
    updatedAt: "2026-05-15T00:00:00.000Z",
  };
}

function buildReleaseEvidence(
  overrides: Partial<PluginCloudReleaseEvidence> = {},
): PluginCloudReleaseEvidence {
  return {
    appId: "content-factory-app",
    version: "0.3.0",
    catalogSource: "remote",
    sourceKind: "fetched_package",
    packageHashDeclared: true,
    manifestHashDeclared: true,
    signatureDeclared: true,
    declaredPackageHash:
      "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    declaredManifestHash:
      "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    actualPackageHash:
      "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    actualManifestHash:
      "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    packageHashMatched: true,
    manifestHashMatched: true,
    signatureRef: "sigstore:content-factory-app@0.3.0",
    signaturePolicy: "required",
    signatureVerificationStatus: "verified",
    packageVerificationStatus: "verified",
    status: "ready",
    blockerCodes: [],
    warningCodes: [],
    ...overrides,
  };
}

describe("installReview", () => {
  it("应把需要注册码的 Cloud release 阻断在 source state", () => {
    const state = buildCloudPluginSourceState({
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
      labelKey: "plugin.apps.sourceState.registrationRequired",
    });
  });

  it("注册码已激活后仍只允许进入安装审查", () => {
    const state = buildCloudPluginSourceState({
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
      labelKey: "plugin.apps.sourceState.registrationActive",
    });
  });

  it("缺少 hash 的 Cloud release 必须阻断安装审查", () => {
    const state = buildCloudPluginSourceState({
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
      labelKey: "plugin.apps.sourceState.hashMissing",
    });
  });

  it("release evidence blocked 时应进入 source state 发布门禁", () => {
    const state = buildCloudPluginSourceState({
      app: buildCloudApp(),
      catalogSource: "remote",
      installed: [],
      releaseEvidence: buildReleaseEvidence({
        status: "blocked",
        signatureVerificationStatus: "failed",
        blockerCodes: ["signature_verification_failed"],
      }),
    });

    expect(state).toMatchObject({
      kind: "release-evidence-blocked",
      canReview: false,
      labelKey: "plugin.apps.sourceState.releaseEvidenceBlocked",
      tone: "rose",
      reason: "CLOUD_SIGNATURE_VERIFICATION_FAILED",
    });
  });

  it("release evidence warning 时应保留可审查但标记需要复核", () => {
    const state = buildCloudPluginSourceState({
      app: buildCloudApp({
        registrationRequired: true,
        registrationState: "active",
      }),
      catalogSource: "remote",
      installed: [],
      releaseEvidence: buildReleaseEvidence({
        status: "warning",
        signatureVerificationStatus: "declared",
        warningCodes: ["signature_unverified"],
      }),
    });

    expect(state).toMatchObject({
      kind: "release-evidence-warning",
      canReview: true,
      labelKey: "plugin.apps.sourceState.releaseEvidenceWarning",
      tone: "amber",
      reason: "CLOUD_SIGNATURE_UNVERIFIED",
    });
  });

  it("已安装版本不应重复进入安装审查", () => {
    const remote = buildCloudPluginSourceState({
      app: buildCloudApp(),
      catalogSource: "remote",
      installed: [buildInstalledState()],
    });
    const bootstrap = buildCloudPluginSourceState({
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
    const state = buildCloudPluginSourceState({
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
