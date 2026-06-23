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

    expect(projection.entries).toHaveLength(1);
    expect(projection.entries.every((entry) => entry.presentation === "lab-only")).toBe(true);
    expect(projection.requiredCapabilities.map((item) => item.capability)).toEqual([
      "lime.agent",
      "lime.artifacts",
      "lime.evidence",
      "lime.knowledge",
      "lime.media",
      "lime.policy",
      "lime.storage",
      "lime.workflow",
    ]);
    expect(projection.provenance).toMatchObject({
      sourceKind: "agent_app",
      appId: "content-factory-app",
      appVersion: "2.0.0",
    });
    expect(projection.knowledgeBindings.map((binding) => binding.key)).toEqual([]);
    expect(projection.artifactTypes.map((artifact) => artifact.key)).toEqual([
      "content_factory_workspace_patch",
    ]);
    expect(projection.services.map((service) => service.key)).toEqual([]);
    expect(projection.workflows.map((workflow) => workflow.key)).toEqual([]);
    expect(projection.skillRequirements.map((skill) => skill.id)).toEqual([]);
    expect(projection.toolRequirements.map((tool) => tool.key)).toEqual([]);
    expect(projection.runtimePackage).toMatchObject({
      hasWorkerBundle: true,
      workerPath: "./src/runtime/content-factory-worker.mjs",
    });
    expect(projection.evals.map((evalRule) => evalRule.key)).toEqual([]);
    expect(projection.secrets.map((secret) => secret.key)).toEqual([]);
    expect(projection.overlayTemplates.map((overlay) => overlay.key)).toEqual([]);
    expect(projection.ui?.routes ?? []).toHaveLength(0);
    expect(projection.install).toMatchObject({
      supportedModes: ["in_lime"],
      preferredMode: "in_lime",
      branding: {
        name: "内容工厂",
        windowTitle: "内容工厂",
      },
    });
  });

  it("应把 v0.8 app.install.yaml contract 投影为 install projection", () => {
    const manifest = parseManifest({
      manifestVersion: "0.8.0",
      name: "content-factory-app",
      displayName: "内容工厂",
      version: "0.8.0",
      requires: {
        capabilities: ["lime.agent"],
      },
      entries: [{ key: "dashboard", kind: "page" }],
      install: {
        modes: ["in_lime", "standalone", "runtime_backed"],
        runtime: {
          minVersion: "0.8.0",
          distribution: {
            standalone: { embedRuntime: true, shell: "lime-app-shell" },
            runtimeBacked: { requires: "lime-runtime", minVersion: "0.8.0" },
          },
        },
        standalone: {
          shell: "lime-app-shell",
          bundleId: "ai.limecloud.contentfactory",
          platforms: ["macos", "windows"],
        },
        runtimeBacked: {
          requires: "lime-runtime",
          minVersion: "0.8.0",
        },
        branding: {
          name: "Content Factory",
          icon: "./assets/icon.svg",
          windowTitle: "Content Factory",
        },
      },
    });
    const normalized = normalizeManifest(manifest);
    const identity = buildPackageIdentity({ manifest });
    const projection = projectApp({ manifest: normalized, identity });

    expect(projection.install).toMatchObject({
      supportedModes: ["in_lime", "standalone", "runtime_backed"],
      preferredMode: "in_lime",
      runtimeRequirements: [
        { mode: "in_lime", minVersion: "0.8.0" },
        { mode: "standalone", minVersion: "0.8.0" },
        { mode: "runtime_backed", minVersion: "0.8.0", requires: "lime-runtime" },
      ],
      shellRequirements: [
        {
          mode: "standalone",
          shell: "lime-app-shell",
          bundleId: "ai.limecloud.contentfactory",
          platforms: ["macos", "windows"],
        },
        { mode: "runtime_backed" },
      ],
      branding: {
        name: "Content Factory",
        icon: "./assets/icon.svg",
        windowTitle: "Content Factory",
      },
    });
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
    expect(plan.installMode).toBe("in_lime");
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
