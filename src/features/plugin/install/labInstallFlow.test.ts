import { describe, expect, it } from "vitest";
import contentFactoryFixture from "../testing/fixtures/content-factory-app.json";
import { buildWorkflowRuntimeCapabilityProfile } from "../runtime/workflowRuntimeCapabilityProfile";
import { buildInstalledAppPreview } from "./installedAppPreview";
import {
  buildPluginLabResolvedSetupState,
  evaluatePluginLabInstallFlow,
} from "./labInstallFlow";

const now = "2026-05-15T00:00:00.000Z";

function buildFlags() {
  return buildWorkflowRuntimeCapabilityProfile({
    realAdapterEnabled: true,
  }).featureFlags;
}

function buildPreviewWithResolvedSetup() {
  const base = buildInstalledAppPreview({
    fixture: contentFactoryFixture,
    profile: buildWorkflowRuntimeCapabilityProfile({
      realAdapterEnabled: true,
    }),
    loadedAt: now,
    checkedAt: now,
    generatedAt: now,
  });
  const setup = buildPluginLabResolvedSetupState(base.projection);
  const preview = buildInstalledAppPreview({
    fixture: contentFactoryFixture,
    setup,
    profile: buildWorkflowRuntimeCapabilityProfile({
      realAdapterEnabled: true,
    }),
    loadedAt: now,
    checkedAt: now,
    generatedAt: now,
  });
  return { preview, setup };
}

describe("Plugin P15 Lab install flow", () => {
  it("应串联 review、verified cache、installed state，并在授权未确认时停在 permission-review", () => {
    const preview = buildInstalledAppPreview({
      fixture: contentFactoryFixture,
      profile: buildWorkflowRuntimeCapabilityProfile({
        realAdapterEnabled: true,
      }),
      loadedAt: now,
      checkedAt: now,
      generatedAt: now,
    });
    const result = evaluatePluginLabInstallFlow({
      preview,
      flags: buildFlags(),
      entryKey: "content_factory",
      operation: "run-entry",
      permissionDecision: "requires-review",
      now,
    });

    expect(result.status).toBe("permission-review");
    expect(result.completedStages).toEqual([
      "source-selected",
      "package-reviewed",
      "package-verified",
      "installed",
      "setup-review",
      "permission-review",
    ]);
    expect(result.review).toMatchObject({
      appId: "content-factory-app",
      sourceKind: "fixture",
      requiredSetupCount: 0,
    });
    expect(result.cacheSave.verification.status).toBe("verified");
    expect(result.installedState?.appId).toBe("content-factory-app");
    expect(result.guard?.status).toBe("allow");
    expect(result.canLaunch).toBe(false);
  });

  it("setup 和授权满足时应进入 permission-review，并在请求启动后进入 launched", () => {
    const { preview, setup } = buildPreviewWithResolvedSetup();
    const review = evaluatePluginLabInstallFlow({
      preview,
      setup,
      flags: buildFlags(),
      entryKey: "content_factory",
      operation: "run-entry",
      permissionDecision: "accepted",
      now,
    });

    expect(review.status).toBe("permission-review");
    expect(review.canLaunch).toBe(true);
    expect(review.guard?.status).toBe("allow");
    expect(review.completedStages).toContain("permission-review");

    const launched = evaluatePluginLabInstallFlow({
      preview,
      setup,
      flags: buildFlags(),
      entryKey: "content_factory",
      operation: "run-entry",
      permissionDecision: "accepted",
      launchRequested: true,
      now,
    });

    expect(launched.status).toBe("launched");
    expect(launched.completedStages).toEqual([
      "source-selected",
      "package-reviewed",
      "package-verified",
      "installed",
      "setup-review",
      "permission-review",
      "launched",
      "cleanup-preview",
    ]);
    expect(launched.cleanupPreview.storageNamespaces[0]?.value).toContain(
      "content-factory-app",
    );
    expect(launched.uninstallPreview.keepData).toMatchObject({
      mode: "keep-data",
      retainedTargetCount: expect.any(Number),
      warningCodes: ["APP_DATA_RETAINED"],
    });
    expect(launched.uninstallPreview.deleteData).toMatchObject({
      mode: "delete-data",
      retainedTargetCount: 0,
      warningCodes: [],
    });
    expect(launched.uninstallPreview.deleteData.deletedTargetCount).toBeGreaterThan(
      launched.uninstallPreview.keepData.deletedTargetCount,
    );
  });

  it("hash mismatch 应在安装前阻断，不写入 installed state", () => {
    const { preview, setup } = buildPreviewWithResolvedSetup();
    const result = evaluatePluginLabInstallFlow({
      preview,
      setup,
      flags: buildFlags(),
      actualPackageHash: "package-fnv1a-badbad00",
      permissionDecision: "accepted",
      now,
    });

    expect(result.status).toBe("package-mismatch");
    expect(result.cacheSave.status).toBe("blocked");
    expect(result.installedState).toBeUndefined();
    expect(result.completedStages).toEqual([
      "source-selected",
      "package-reviewed",
    ]);
  });

  it("用户拒绝授权时应停在 permission-denied，不触发 launch", () => {
    const { preview, setup } = buildPreviewWithResolvedSetup();
    const result = evaluatePluginLabInstallFlow({
      preview,
      setup,
      flags: buildFlags(),
      entryKey: "content_factory",
      operation: "run-entry",
      permissionDecision: "denied",
      launchRequested: true,
      now,
    });

    expect(result.status).toBe("permission-denied");
    expect(result.guard?.status).toBe("denied");
    expect(result.canLaunch).toBe(false);
    expect(result.completedStages).not.toContain("launched");
  });
});
