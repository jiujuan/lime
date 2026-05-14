import { describe, expect, it } from "vitest";
import contentEngineeringFixture from "../fixtures/content-engineering-app.json";
import { buildCleanupPlan } from "../install/cleanupPlan";
import { buildPackageIdentity } from "../install/packageIdentity";
import { normalizeManifest } from "../manifest/normalizeManifest";
import { parseManifest } from "../manifest/parseManifest";
import { projectApp } from "./projectApp";

describe("Agent App projection P0", () => {
  it("应生成 lab-only entries、能力需求和 provenance", () => {
    const manifest = parseManifest(contentEngineeringFixture);
    const normalized = normalizeManifest(manifest);
    const identity = buildPackageIdentity({
      manifest,
      loadedAt: "2026-05-15T00:00:00.000Z",
    });
    const projection = projectApp({ manifest: normalized, identity });

    expect(projection.entries).toHaveLength(3);
    expect(projection.entries.every((entry) => entry.presentation === "lab-only")).toBe(true);
    expect(projection.requiredCapabilities.map((item) => item.capability)).toEqual([
      "lime.agent",
      "lime.artifacts",
      "lime.evidence",
      "lime.knowledge",
      "lime.storage",
      "lime.ui",
      "lime.workflow",
    ]);
    expect(projection.provenance).toMatchObject({
      sourceKind: "agent_app",
      appId: "shenlan-content-engineering",
      appVersion: "0.1.0",
    });
  });

  it("应从 projection 生成 cleanup dry-run", () => {
    const manifest = parseManifest(contentEngineeringFixture);
    const normalized = normalizeManifest(manifest);
    const identity = buildPackageIdentity({ manifest });
    const projection = projectApp({ manifest: normalized, identity });
    const plan = buildCleanupPlan({
      projection,
      dataRoot: "/tmp/lime/agent-apps",
      generatedAt: "2026-05-15T00:00:00.000Z",
    });

    expect(plan.mode).toBe("dry-run");
    expect(plan.packageCachePaths[0].value).toContain(identity.packageHash);
    expect(plan.projectionPaths[0].value).toBe(
      "/tmp/lime/agent-apps/projections/shenlan-content-engineering.json",
    );
    expect(plan.storageNamespaces[0]).toMatchObject({
      kind: "namespace",
      safeToDelete: true,
    });
  });
});
