import { describe, expect, it } from "vitest";
import contentFactoryFixture from "../fixtures/content-factory-app.json";
import { buildInstalledAppPreview } from "./installedAppPreview";
import { buildInstalledAgentAppState } from "./installedAppState";
import { buildAgentAppCleanupRehearsalEvidence } from "./cleanupRehearsalEvidence";

const now = "2026-05-15T00:00:00.000Z";
const contentFactoryAppVersion = contentFactoryFixture.version;

function buildInstalledStateFixture() {
  const preview = buildInstalledAppPreview({
    fixture: contentFactoryFixture,
    loadedAt: now,
    checkedAt: now,
    generatedAt: now,
  });
  const state = buildInstalledAgentAppState({
    preview,
    installedAt: now,
    updatedAt: now,
  });
  return { preview, state };
}

describe("cleanup rehearsal evidence P16-H.3", () => {
  it("delete-data summary 应包含 App 身份、hash、strategy、targets 与 timestamp", () => {
    const { preview, state } = buildInstalledStateFixture();

    const evidence = buildAgentAppCleanupRehearsalEvidence({
      state,
      cleanupPlan: preview.cleanupPlan,
      strategy: "delete-data",
      generatedAt: now,
    });

    expect(evidence).toMatchObject({
      appId: "content-factory-app",
      appVersion: contentFactoryAppVersion,
      packageHash: state.identity.packageHash,
      manifestHash: state.identity.manifestHash,
      strategy: "delete-data",
      generatedAt: now,
      blockedTargetCount: 0,
      retainedTargetCount: 0,
    });
    expect(evidence.targetCount).toBeGreaterThan(0);
    expect(evidence.deletedTargetCount).toBe(evidence.targetCount);
    expect(evidence.targets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "storage-namespace",
          disposition: "delete",
          value: "<LimeAppData>/agent-apps/storage/content-factory-app",
        }),
      ]),
    );
    expect(evidence.warningCodes).toContain("DRY_RUN_ONLY");
  });

  it("keep-data summary 应保留 App 数据 target 并只删除 host 元数据 target", () => {
    const { preview, state } = buildInstalledStateFixture();

    const evidence = buildAgentAppCleanupRehearsalEvidence({
      state,
      cleanupPlan: preview.cleanupPlan,
      strategy: "keep-data",
      generatedAt: now,
    });

    expect(evidence.strategy).toBe("keep-data");
    expect(evidence.retainedTargetCount).toBeGreaterThan(0);
    expect(evidence.targets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "installed-state",
          disposition: "delete",
        }),
        expect.objectContaining({
          category: "storage-namespace",
          disposition: "retain",
        }),
      ]),
    );
  });

  it("summary 应阻断越界 target 且不记录 secret value", () => {
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
          reason: "Out-of-scope user document should never be deleted by Agent App cleanup.",
        },
      ],
      secretRefs: [
        {
          kind: "ref" as const,
          value: "sk-secret-value",
          exists: "unknown" as const,
          safeToDelete: true,
          reason: "Secret binding ref only.",
        },
      ],
    };

    const evidence = buildAgentAppCleanupRehearsalEvidence({
      state,
      cleanupPlan,
      strategy: "delete-data",
      generatedAt: now,
    });

    expect(evidence.blockedTargets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "storage-namespace",
          value: "/Users/example/Documents/customer-notes.md",
          blockedReason: "OUT_OF_SCOPE",
        }),
      ]),
    );
    expect(JSON.stringify(evidence)).not.toContain("sk-secret-value");
    expect(evidence.targets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "secret-ref",
          value: "secret-ref:redacted",
        }),
      ]),
    );
  });
});
