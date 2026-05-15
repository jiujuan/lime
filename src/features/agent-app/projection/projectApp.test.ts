import { describe, expect, it } from "vitest";
import contentFactoryFixture from "../fixtures/content-factory-app.json";
import { buildCleanupPlan } from "../install/cleanupPlan";
import { buildPackageIdentity } from "../install/packageIdentity";
import { normalizeManifest } from "../manifest/normalizeManifest";
import { parseManifest } from "../manifest/parseManifest";
import { projectApp } from "./projectApp";

describe("Agent App projection P0", () => {
  it("应生成 lab-only entries、能力需求和 provenance", () => {
    const manifest = parseManifest(contentFactoryFixture);
    const normalized = normalizeManifest(manifest);
    const identity = buildPackageIdentity({
      manifest,
      loadedAt: "2026-05-15T00:00:00.000Z",
    });
    const projection = projectApp({ manifest: normalized, identity });

    expect(projection.entries).toHaveLength(5);
    expect(projection.entries.every((entry) => entry.presentation === "lab-only")).toBe(true);
    expect(projection.requiredCapabilities.map((item) => item.capability)).toEqual([
      "lime.agent",
      "lime.artifacts",
      "lime.evidence",
      "lime.files",
      "lime.knowledge",
      "lime.storage",
      "lime.tools",
      "lime.ui",
      "lime.workflow",
    ]);
    expect(projection.provenance).toMatchObject({
      sourceKind: "agent_app",
      appId: "content-factory-app",
      appVersion: "0.3.0",
    });
    expect(projection.knowledgeBindings.map((binding) => binding.key)).toEqual([
      "ip_knowledge",
      "project_knowledge",
      "material_library",
    ]);
    expect(projection.artifactTypes.map((artifact) => artifact.key)).toEqual([
      "content_table",
    ]);
    expect(projection.services.map((service) => service.key)).toEqual([
      "content_worker",
    ]);
    expect(projection.workflows.map((workflow) => workflow.key)).toEqual([
      "content_scenario_planning",
    ]);
    expect(projection.skillRequirements.map((skill) => skill.id)).toEqual([
      "article-writer",
    ]);
    expect(projection.toolRequirements.map((tool) => tool.key)).toEqual([
      "document_parser",
      "competitor_research",
    ]);
    expect(projection.evals.map((evalRule) => evalRule.key)).toEqual([
      "fact_grounding",
    ]);
    expect(projection.secrets.map((secret) => secret.key)).toEqual([
      "publishing_workspace_token",
    ]);
    expect(projection.overlayTemplates.map((overlay) => overlay.key)).toEqual([
      "workspace_content_rules",
    ]);
    expect(projection.ui?.routes).toHaveLength(2);
  });

  it("应从 projection 生成 cleanup dry-run", () => {
    const manifest = parseManifest(contentFactoryFixture);
    const normalized = normalizeManifest(manifest);
    const identity = buildPackageIdentity({ manifest });
    const projection = projectApp({ manifest: normalized, identity });
    const plan = buildCleanupPlan({
      projection,
      dataRoot: "/tmp/lime/agent-apps",
      generatedAt: "2026-05-15T00:00:00.000Z",
    });

    expect(plan.mode).toBe("dry-run");
    expect(plan.installedStatePaths[0].value).toBe(
      "/tmp/lime/agent-apps/installed/content-factory-app.json",
    );
    expect(plan.packageCachePaths[0].value).toContain(identity.packageHash);
    expect(plan.packageCacheIndexPaths[0].value).toBe(
      "/tmp/lime/agent-apps/package-index/content-factory-app.json",
    );
    expect(plan.packageStagingPaths[0].value).toBe(
      "/tmp/lime/agent-apps/staging/content-factory-app",
    );
    expect(plan.projectionPaths[0].value).toBe(
      "/tmp/lime/agent-apps/projections/content-factory-app.json",
    );
    expect(plan.setupStatePaths[0].value).toBe(
      "/tmp/lime/agent-apps/setup/content-factory-app.json",
    );
    expect(plan.storageNamespaces[0]).toMatchObject({
      kind: "namespace",
      safeToDelete: true,
    });
  });
});
