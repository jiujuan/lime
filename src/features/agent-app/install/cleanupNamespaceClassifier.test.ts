import { describe, expect, it } from "vitest";
import contentFactoryFixture from "../fixtures/content-factory-app.json";
import { buildInstalledAppPreview } from "./installedAppPreview";
import { buildInstalledAgentAppState } from "./installedAppState";
import {
  classifyAgentAppCleanupNamespaceTargets,
  listAgentAppCleanupNamespaceGroups,
} from "./cleanupNamespaceClassifier";

const now = "2026-05-15T00:00:00.000Z";

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

describe("Agent App P17.3 cleanup namespace classifier", () => {
  it("应把 cleanup plan 归类为 package / setup / overlay / storage / artifact / evidence / secret namespace", () => {
    const { preview } = buildInstalledStateFixture();

    const groups = listAgentAppCleanupNamespaceGroups(preview.cleanupPlan);
    const nonEmptyGroups = groups.filter((group) => group.targets.length > 0);

    expect(nonEmptyGroups).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "package-cache",
          namespaceKind: "package",
          appData: false,
        }),
        expect.objectContaining({
          category: "setup-state",
          namespaceKind: "setup",
          appData: false,
        }),
        expect.objectContaining({
          category: "overlay-ref",
          namespaceKind: "overlay",
          appData: true,
        }),
        expect.objectContaining({
          category: "storage-namespace",
          namespaceKind: "storage",
          appData: true,
        }),
        expect.objectContaining({
          category: "artifact-ref",
          namespaceKind: "artifact",
          appData: true,
        }),
        expect.objectContaining({
          category: "evidence-ref",
          namespaceKind: "evidence",
          appData: true,
        }),
        expect.objectContaining({
          category: "secret-ref",
          namespaceKind: "secret",
          appData: true,
        }),
      ]),
    );
    expect(preview.cleanupPlan.overlayRefs[0]?.value).toBe(
      "overlay-ref:content-factory-app:workspace_content_rules",
    );
    expect(preview.cleanupPlan.secretRefs[0]?.value).toBe(
      "secret-ref:content-factory-app:publishing_workspace_token",
    );
  });

  it("keep-data 应保留 appData namespace，delete-data 应删除同一组 appData namespace", () => {
    const { preview, state } = buildInstalledStateFixture();

    const keepData = classifyAgentAppCleanupNamespaceTargets({
      state,
      cleanupPlan: preview.cleanupPlan,
      strategy: "keep-data",
    });
    const deleteData = classifyAgentAppCleanupNamespaceTargets({
      state,
      cleanupPlan: preview.cleanupPlan,
      strategy: "delete-data",
    });
    const appDataCategories = [
      "overlay-ref",
      "storage-namespace",
      "artifact-ref",
      "evidence-ref",
      "secret-ref",
    ];

    appDataCategories.forEach((category) => {
      expect(keepData.targets).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ category, disposition: "retain" }),
        ]),
      );
      expect(deleteData.targets).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ category, disposition: "delete" }),
        ]),
      );
    });
    expect(keepData.retainedTargetCount).toBeGreaterThan(0);
    expect(deleteData.retainedTargetCount).toBe(0);
  });

  it("应阻断越界 namespace 并继续隐藏非 ref 格式的 secret value", () => {
    const { preview, state } = buildInstalledStateFixture();
    const classification = classifyAgentAppCleanupNamespaceTargets({
      state,
      cleanupPlan: {
        ...preview.cleanupPlan,
        storageNamespaces: [
          ...preview.cleanupPlan.storageNamespaces,
          {
            kind: "path" as const,
            value: "/Users/example/Documents/customer-notes.md",
            exists: "unknown" as const,
            safeToDelete: true,
            reason: "Out-of-scope user document should never be deleted.",
          },
        ],
        secretRefs: [
          ...preview.cleanupPlan.secretRefs,
          {
            kind: "ref" as const,
            value: "sk-secret-value",
            exists: "unknown" as const,
            safeToDelete: true,
            reason: "Secret binding ref only.",
          },
        ],
      },
      strategy: "delete-data",
    });

    expect(classification.blockedTargets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "storage-namespace",
          blockedReason: "OUT_OF_SCOPE",
        }),
      ]),
    );
    expect(JSON.stringify(classification)).not.toContain("sk-secret-value");
    expect(classification.targets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "secret-ref",
          value: "secret-ref:redacted",
        }),
      ]),
    );
  });
});
