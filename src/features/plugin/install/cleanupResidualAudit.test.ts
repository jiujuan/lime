import { describe, expect, it } from "vitest";
import contentFactoryFixture from "../testing/fixtures/content-factory-app.json";
import { buildPluginCleanupRehearsalEvidence } from "./cleanupRehearsalEvidence";
import { buildPluginCleanupResidualAudit } from "./cleanupResidualAudit";
import { buildInstalledAppPreview } from "./installedAppPreview";
import { buildInstalledPluginState } from "./installedAppState";

const now = "2026-05-15T00:00:00.000Z";

function buildInstalledStateFixture() {
  const preview = buildInstalledAppPreview({
    fixture: contentFactoryFixture,
    loadedAt: now,
    checkedAt: now,
    generatedAt: now,
  });
  const state = buildInstalledPluginState({
    preview,
    installedAt: now,
    updatedAt: now,
  });
  return { preview, state };
}

describe("cleanup residual audit P16-H.4", () => {
  it("delete-data audit 应把 evidence delete targets 标为 pending deletion", () => {
    const { preview, state } = buildInstalledStateFixture();
    const cleanupEvidence = buildPluginCleanupRehearsalEvidence({
      state,
      cleanupPlan: preview.cleanupPlan,
      strategy: "delete-data",
      generatedAt: now,
    });

    const audit = buildPluginCleanupResidualAudit({
      state,
      cleanupEvidence,
      generatedAt: now,
    });

    expect(audit).toMatchObject({
      appId: "content-factory-app",
      strategy: "delete-data",
      retainedCount: 0,
      blockedOutOfScopeCount: 0,
      repositoryIssueCount: 0,
    });
    expect(audit.pendingDeletionCount).toBe(cleanupEvidence.deletedTargetCount);
    expect(audit.pendingDeletionTargets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "storage-namespace",
          value: "<LimeAppData>/plugins/storage/content-factory-app",
        }),
      ]),
    );
  });

  it("keep-data audit 应区分 retained 与 pending deletion", () => {
    const { preview, state } = buildInstalledStateFixture();
    const cleanupEvidence = buildPluginCleanupRehearsalEvidence({
      state,
      cleanupPlan: preview.cleanupPlan,
      strategy: "keep-data",
      generatedAt: now,
    });

    const audit = buildPluginCleanupResidualAudit({
      state,
      cleanupEvidence,
      generatedAt: now,
    });

    expect(audit.retainedCount).toBeGreaterThan(0);
    expect(audit.pendingDeletionCount).toBeGreaterThan(0);
    expect(audit.retainedTargets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ category: "storage-namespace" }),
      ]),
    );
    expect(audit.pendingDeletionTargets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ category: "installed-state" }),
      ]),
    );
  });

  it("audit 应保留 out-of-scope blocker 与当前 App repository issue", () => {
    const { preview, state } = buildInstalledStateFixture();
    const cleanupPlan = {
      ...preview.cleanupPlan,
      storageNamespaces: [
        ...preview.cleanupPlan.storageNamespaces,
        {
          kind: "path" as const,
          value: "/Users/example/Documents/customer-notes.md",
          exists: "unknown" as const,
          safeToDelete: true,
          reason: "Out-of-scope user document should never be deleted by Plugin cleanup.",
        },
      ],
    };
    const cleanupEvidence = buildPluginCleanupRehearsalEvidence({
      state,
      cleanupPlan,
      strategy: "delete-data",
      generatedAt: now,
    });

    const audit = buildPluginCleanupResidualAudit({
      state,
      cleanupEvidence,
      repositoryIssues: [
        {
          code: "PARSE_FAILED",
          appId: "content-factory-app",
          path: "<LimeAppData>/plugins/installed/content-factory-app.json",
          message: "Installed state JSON parse failed.",
        },
        {
          code: "READ_FAILED",
          appId: "other-app",
          path: "<LimeAppData>/plugins/installed/other-app.json",
          message: "Other app issue should not leak into this audit.",
        },
      ],
      generatedAt: now,
    });

    expect(audit.blockedOutOfScopeTargets).toEqual([
      expect.objectContaining({
        value: "/Users/example/Documents/customer-notes.md",
      }),
    ]);
    expect(audit.repositoryIssues).toEqual([
      expect.objectContaining({
        code: "PARSE_FAILED",
        appId: "content-factory-app",
      }),
    ]);
    expect(JSON.stringify(audit)).not.toContain("Other app issue");
  });
});
