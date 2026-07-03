import { describe, expect, it } from "vitest";
import {
  currentPluginHostRuntimeVersion,
  p0HostCapabilityProfile,
} from "../readiness/hostCapabilityProfile";
import {
  buildLimeRuntimeProfileForPreview,
  buildLimeRuntimeProfileFromHostProfile,
  runtimeProfileIssueForInstallMode,
  shellKindForInstallMode,
  summarizeRuntimeProfile,
} from "./index";
import { buildInstalledAppPreview } from "../install/installedAppPreview";
import contentFactoryFixture from "../testing/fixtures/content-factory-app.json";

describe("Plugin v2 LimeRuntimeProfile", () => {
  it("应把 install mode 映射为 host-neutral shell kind", () => {
    expect(shellKindForInstallMode("in_lime")).toBe("desktop");
    expect(shellKindForInstallMode("standalone")).toBe("app_shell");
    expect(shellKindForInstallMode("runtime_backed")).toBe("runtime_backed");
    expect(shellKindForInstallMode("web_host")).toBe("web_host");
  });

  it("应从 HostCapabilityProfile 生成统一 LimeRuntimeProfile", () => {
    const profile = buildLimeRuntimeProfileFromHostProfile({
      appId: "content-factory-app",
      installMode: "standalone",
      hostProfile: p0HostCapabilityProfile,
    });

    expect(profile).toMatchObject({
      runtimeId: `content-factory-app:standalone:${currentPluginHostRuntimeVersion}`,
      runtimeVersion: currentPluginHostRuntimeVersion,
      shellKind: "app_shell",
      installMode: "standalone",
      policy: {
        permissionPrompt: "required",
        externalSideEffects: "confirm",
        maxRisk: "medium",
      },
      storage: {
        namespaceRoot: "<LimeAppData>/plugins/storage/content-factory-app",
        cleanupSupported: true,
      },
      evidence: {
        recordRequired: true,
        exportSupported: true,
      },
    });
    expect(Object.keys(profile.capabilities)).toContain("lime.agent");
  });

  it("应汇总 runtime capability 可用性，避免 UI 直接读 host profile", () => {
    const profile = buildLimeRuntimeProfileFromHostProfile({
      appId: "content-factory-app",
      installMode: "in_lime",
      hostProfile: p0HostCapabilityProfile,
    });
    const summary = summarizeRuntimeProfile(profile);

    expect(summary.runtimeVersion).toBe(currentPluginHostRuntimeVersion);
    expect(summary.availableCapabilityCount + summary.unavailableCapabilityCount).toBe(
      Object.keys(profile.capabilities).length,
    );
  });

  it("应从 preview 构建 RuntimeProfile，复用 projection storage namespace", () => {
    const preview = buildInstalledAppPreview({
      fixture: contentFactoryFixture,
      profile: p0HostCapabilityProfile,
    });
    const profile = buildLimeRuntimeProfileForPreview({
      preview,
      hostProfile: p0HostCapabilityProfile,
    });

    expect(profile).toMatchObject({
      runtimeId: `content-factory-app:in_lime:${currentPluginHostRuntimeVersion}`,
      installMode: "in_lime",
      storage: {
        namespaceRoot: "content-factory-app",
      },
    });
  });

  it("install mode 与 runtime profile 不一致时应产生 stable blocker", () => {
    const profile = buildLimeRuntimeProfileFromHostProfile({
      appId: "content-factory-app",
      installMode: "in_lime",
      hostProfile: p0HostCapabilityProfile,
    });

    expect(
      runtimeProfileIssueForInstallMode({ profile, installMode: "standalone" }),
    ).toMatchObject({
      code: "RUNTIME_PROFILE_MISSING",
      severity: "blocker",
      key: "standalone",
    });
  });
});
