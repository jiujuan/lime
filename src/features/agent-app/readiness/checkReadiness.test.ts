import { describe, expect, it } from "vitest";
import contentFactoryFixture from "../fixtures/content-factory-app.json";
import { buildPackageIdentity } from "../install/packageIdentity";
import { normalizeManifest } from "../manifest/normalizeManifest";
import { parseManifest } from "../manifest/parseManifest";
import { projectApp } from "../projection/projectApp";
import type { AgentAppSetupState, HostCapabilityProfile } from "../types";
import { checkReadiness } from "./checkReadiness";
import { p0HostCapabilityProfile } from "./hostCapabilityProfile";

function buildProjection() {
  const manifest = parseManifest(contentFactoryFixture);
  const normalized = normalizeManifest(manifest);
  const identity = buildPackageIdentity({ manifest });
  return {
    manifest: normalized,
    projection: projectApp({ manifest: normalized, identity }),
  };
}

const resolvedSetup: AgentAppSetupState = {
  knowledgeBindings: {
    ip_knowledge: true,
    project_knowledge: true,
    material_library: true,
  },
  skills: { "article-writer": true },
  tools: {
    document_parser: true,
    competitor_research: true,
  },
  artifactTypes: { content_table: true },
  evals: { fact_grounding: true },
  secrets: { publishing_workspace_token: true },
  overlays: { workspace_content_rules: true },
  services: { content_worker: true },
  workflows: { content_scenario_planning: true },
};

describe("Agent App readiness P0", () => {
  it("默认 P0 host 应把 fixture 标记为 blocked 并解释缺失能力", () => {
    const { manifest, projection } = buildProjection();
    const readiness = checkReadiness({
      manifest,
      projection,
      checkedAt: "2026-05-15T00:00:00.000Z",
    });

    expect(readiness.status).toBe("blocked");
    expect(readiness.blockers.map((issue) => issue.code)).toContain("CAPABILITY_MISSING");
    expect(readiness.warnings.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "KNOWLEDGE_BINDING_REQUIRED",
        "SKILL_REQUIRED",
        "TOOL_REQUIRED",
        "ARTIFACT_TYPE_REQUIRED",
        "EVAL_REQUIRED",
        "SERVICE_REQUIRED",
        "WORKFLOW_REQUIRED",
      ]),
    );
    expect(readiness.warnings.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "STORAGE_DECLARED_BUT_DISABLED",
        "UI_RUNTIME_DISABLED",
        "WORKER_RUNTIME_DISABLED",
        "SECRET_REQUIRED",
        "OVERLAY_REQUIRED",
      ]),
    );
    expect(
      readiness.warnings.find((issue) => issue.code === "KNOWLEDGE_BINDING_REQUIRED"),
    ).toHaveProperty("remediation");
  });

  it("能力启用后仍应进入 needs-setup 而不是假装 ready", () => {
    const { manifest, projection } = buildProjection();
    const profile: HostCapabilityProfile = {
      ...p0HostCapabilityProfile,
      capabilities: Object.fromEntries(
        Object.entries(p0HostCapabilityProfile.capabilities).map(([key, value]) => [
          key,
          { ...value, enabled: true, implementation: "mock" as const },
        ]),
      ),
    };
    const readiness = checkReadiness({ manifest, projection, profile });

    expect(readiness.status).toBe("needs-setup");
    expect(readiness.warnings.map((issue) => issue.code)).toContain(
      "KNOWLEDGE_BINDING_REQUIRED",
    );
    expect(readiness.missingCapabilities).toHaveLength(0);
  });

  it("setup resolver 全部满足后应回到 runtime degraded 状态", () => {
    const { manifest, projection } = buildProjection();
    const profile: HostCapabilityProfile = {
      ...p0HostCapabilityProfile,
      capabilities: Object.fromEntries(
        Object.entries(p0HostCapabilityProfile.capabilities).map(([key, value]) => [
          key,
          { ...value, enabled: true, implementation: "mock" as const },
        ]),
      ),
    };
    const readiness = checkReadiness({
      manifest,
      projection,
      profile,
      setup: resolvedSetup,
    });

    expect(readiness.status).toBe("degraded");
    expect(readiness.warnings.map((issue) => issue.code)).not.toContain(
      "KNOWLEDGE_BINDING_REQUIRED",
    );
    expect(readiness.blockers).toHaveLength(0);
  });

  it("package verification mismatch 应产生 blocker，不能只作为 warning 继续启用", () => {
    const { manifest, projection } = buildProjection();
    const profile: HostCapabilityProfile = {
      ...p0HostCapabilityProfile,
      capabilities: Object.fromEntries(
        Object.entries(p0HostCapabilityProfile.capabilities).map(([key, value]) => [
          key,
          { ...value, enabled: true, implementation: "mock" as const },
        ]),
      ),
    };
    const readiness = checkReadiness({
      manifest,
      projection,
      profile,
      setup: resolvedSetup,
      packageVerification: {
        status: "package_hash_mismatch",
        expectedPackageHash: projection.package.packageHash,
        actualPackageHash: "package-fnv1a-badbad00",
        expectedManifestHash: projection.package.manifestHash,
        actualManifestHash: projection.package.manifestHash,
        message: "Agent App package hash does not match package identity.",
      },
    });

    expect(readiness.status).toBe("blocked");
    expect(readiness.blockers).toEqual([
      expect.objectContaining({
        code: "PACKAGE_HASH_MISMATCH",
        severity: "blocker",
      }),
    ]);
  });
});
