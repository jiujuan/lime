import { describe, expect, it } from "vitest";
import contentFactoryFixture from "../testing/fixtures/content-factory-app.json";
import { buildInstalledAppPreview } from "./installedAppPreview";
import { buildInstalledPluginState } from "./installedAppState";
import {
  buildPluginDeleteDataConfirmationPhrase,
  buildPluginDeleteDataExecutionGate,
  buildPluginLifecycleActionDescriptor,
  buildPluginLifecycleLaunchGate,
  buildPluginLifecycleToggleDescriptor,
  buildPluginLifecycleUninstallRehearsalDescriptor,
} from "./lifecycleAction";

const now = "2026-05-15T00:00:00.000Z";

function buildInstalledStateFixture(params: { disabled?: boolean } = {}) {
  const preview = buildInstalledAppPreview({
    fixture: contentFactoryFixture,
    loadedAt: now,
    checkedAt: now,
    generatedAt: now,
  });
  const state = buildInstalledPluginState({
    preview,
    disabled: params.disabled,
    installedAt: now,
    updatedAt: now,
  });
  return { preview, state };
}

describe("Plugin P17.3 lifecycle action descriptor", () => {
  it("应为 disable / enable 生成可持久化 request，并识别 no-op", () => {
    const { state } = buildInstalledStateFixture();

    const disable = buildPluginLifecycleToggleDescriptor({
      state,
      action: "disable",
      generatedAt: now,
    });
    expect(disable).toMatchObject({
      action: "disable",
      status: "ready",
      currentDisabled: false,
      nextDisabled: true,
      completionEffect: "set-disabled",
      request: {
        appId: "content-factory-app",
        disabled: true,
        updatedAt: now,
      },
    });

    const disabled = { ...state, disabled: true };
    const enable = buildPluginLifecycleActionDescriptor({
      state: disabled,
      action: "enable",
      generatedAt: now,
    });
    expect(enable).toMatchObject({
      action: "enable",
      status: "ready",
      currentDisabled: true,
      nextDisabled: false,
      completionEffect: "set-enabled",
    });

    const noop = buildPluginLifecycleToggleDescriptor({
      state: disabled,
      action: "disable",
      generatedAt: now,
    });
    expect(noop.status).toBe("noop");
    expect(noop.request.disabled).toBe(true);
  });

  it("应把卸载保持为 rehearsal-only，并复用 cleanup evidence / residual audit", () => {
    const { preview, state } = buildInstalledStateFixture();

    const descriptor = buildPluginLifecycleUninstallRehearsalDescriptor({
      state,
      cleanupPlan: preview.cleanupPlan,
      mode: "delete-data",
      generatedAt: now,
    });

    expect(descriptor).toMatchObject({
      action: "uninstall-rehearsal",
      status: "ready",
      mode: "delete-data",
      realDeleteAllowed: false,
      completionEffect: "rehearsal-only",
      request: {
        appId: "content-factory-app",
        mode: "delete-data",
      },
    });
    expect(descriptor.cleanupEvidence.deletedTargetCount).toBeGreaterThan(0);
    expect(descriptor.cleanupEvidence.warningCodes).toContain("DRY_RUN_ONLY");
    expect(descriptor.residualAudit.pendingDeletionCount).toBe(
      descriptor.cleanupEvidence.deletedTargetCount,
    );
  });

  it("应在 cleanup target 越界时阻断 uninstall rehearsal", () => {
    const { preview, state } = buildInstalledStateFixture();
    const descriptor = buildPluginLifecycleUninstallRehearsalDescriptor({
      state,
      cleanupPlan: {
        ...preview.cleanupPlan,
        storageNamespaces: [
          ...preview.cleanupPlan.storageNamespaces,
          {
            kind: "path",
            value: "/Users/example/Documents/customer-notes.md",
            exists: "unknown",
            safeToDelete: true,
            reason: "Out-of-scope user document should never be deleted.",
          },
        ],
      },
      mode: "delete-data",
      generatedAt: now,
    });

    expect(descriptor.status).toBe("blocked");
    expect(descriptor.blockerCodes).toContain("OUT_OF_SCOPE");
    expect(descriptor.cleanupEvidence.blockedTargetCount).toBe(1);
    expect(descriptor.realDeleteAllowed).toBe(false);
  });

  it("delete-data 真实执行 gate 必须要求精确确认短语", () => {
    const { preview, state } = buildInstalledStateFixture();
    const descriptor = buildPluginLifecycleUninstallRehearsalDescriptor({
      state,
      cleanupPlan: preview.cleanupPlan,
      mode: "delete-data",
      generatedAt: now,
    });
    const confirmationPhrase =
      buildPluginDeleteDataConfirmationPhrase(descriptor);

    expect(
      buildPluginDeleteDataExecutionGate({
        descriptor,
        confirmationPhrase: "delete it",
        generatedAt: now,
      }),
    ).toMatchObject({
      allowed: false,
      blockerCodes: ["CONFIRMATION_MISMATCH"],
      confirmationPhrase,
    });

    expect(
      buildPluginDeleteDataExecutionGate({
        descriptor,
        confirmationPhrase,
        generatedAt: now,
      }),
    ).toMatchObject({
      allowed: true,
      appId: "content-factory-app",
      pendingDeletionCount: descriptor.residualAudit.pendingDeletionCount,
      confirmationPhrase,
    });
  });

  it("delete-data gate 应拒绝 keep-data 或越界 rehearsal", () => {
    const { preview, state } = buildInstalledStateFixture();
    const keepData = buildPluginLifecycleUninstallRehearsalDescriptor({
      state,
      cleanupPlan: preview.cleanupPlan,
      mode: "keep-data",
      generatedAt: now,
    });
    expect(
      buildPluginDeleteDataExecutionGate({
        descriptor: keepData,
        confirmationPhrase: buildPluginDeleteDataConfirmationPhrase(keepData),
        generatedAt: now,
      }),
    ).toMatchObject({
      allowed: false,
      blockerCodes: ["MODE_NOT_DELETE_DATA"],
    });

    const outOfScope = buildPluginLifecycleUninstallRehearsalDescriptor({
      state,
      cleanupPlan: {
        ...preview.cleanupPlan,
        storageNamespaces: [
          ...preview.cleanupPlan.storageNamespaces,
          {
            kind: "path",
            value: "/Users/example/Documents/customer-notes.md",
            exists: "unknown",
            safeToDelete: true,
            reason: "Out-of-scope user document should never be deleted.",
          },
        ],
      },
      mode: "delete-data",
      generatedAt: now,
    });
    expect(
      buildPluginDeleteDataExecutionGate({
        descriptor: outOfScope,
        confirmationPhrase:
          buildPluginDeleteDataConfirmationPhrase(outOfScope),
        generatedAt: now,
      }),
    ).toMatchObject({
      allowed: false,
      blockerCodes: ["REHEARSAL_BLOCKED", "OUT_OF_SCOPE_TARGETS"],
    });
  });

  it("应给 disabled App 生成启动阻断 gate", () => {
    const { state } = buildInstalledStateFixture({ disabled: true });

    expect(buildPluginLifecycleLaunchGate(state)).toEqual({
      allowed: false,
      appId: "content-factory-app",
      reason: "disabled",
    });
    expect(
      buildPluginLifecycleLaunchGate({ ...state, disabled: false }),
    ).toEqual({
      allowed: true,
      appId: "content-factory-app",
    });
  });
});
