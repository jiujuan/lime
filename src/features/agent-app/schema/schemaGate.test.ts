import { describe, expect, it } from "vitest";
import contentFactoryFixture from "../fixtures/content-factory-app.json";
import { buildPackageIdentity } from "../install/packageIdentity";
import { normalizeManifest } from "../manifest/normalizeManifest";
import { parseManifest } from "../manifest/parseManifest";
import { projectApp } from "../projection/projectApp";
import { checkReadiness } from "../readiness/checkReadiness";
import {
  validateProjectionSchemaCoverage,
  validateReadinessSchemaCoverage,
} from "./schemaGate";

function buildProjectionAndReadiness() {
  const manifest = parseManifest(contentFactoryFixture);
  const normalized = normalizeManifest(manifest);
  const identity = buildPackageIdentity({
    manifest,
    loadedAt: "2026-05-15T00:00:00.000Z",
  });
  const projection = projectApp({ manifest: normalized, identity });
  const readiness = checkReadiness({
    manifest: normalized,
    projection,
    checkedAt: "2026-05-15T00:00:00.000Z",
  });

  return { projection, readiness };
}

describe("Agent App P7 schema gate", () => {
  it("应机械验证 v0.3 projection coverage 和 provenance", () => {
    const { projection } = buildProjectionAndReadiness();

    expect(validateProjectionSchemaCoverage(projection)).toEqual({
      status: "valid",
      issues: [],
    });
    expect(Object.keys(projection).sort()).toEqual(
      expect.arrayContaining([
        "services",
        "workflows",
        "skillRequirements",
        "toolRequirements",
        "evals",
        "events",
        "secrets",
        "overlayTemplates",
        "ui",
        "lifecycle",
        "install",
      ]),
    );
  });

  it("应机械验证 readiness setup issue 具备 kind/key/remediation", () => {
    const { readiness } = buildProjectionAndReadiness();

    expect(validateReadinessSchemaCoverage(readiness)).toEqual({
      status: "valid",
      issues: [],
    });
    expect(readiness.warnings.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "KNOWLEDGE_BINDING_REQUIRED",
        "SKILL_REQUIRED",
        "TOOL_REQUIRED",
        "EVAL_REQUIRED",
        "SECRET_REQUIRED",
        "OVERLAY_REQUIRED",
        "SERVICE_REQUIRED",
        "WORKFLOW_REQUIRED",
      ]),
    );
    expect(readiness.installModes).toEqual([
      expect.objectContaining({ mode: "in_lime", status: "ready" }),
    ]);
  });

  it("缺失 v0.3 projection 字段时应失败", () => {
    const { projection } = buildProjectionAndReadiness();
    const broken = { ...projection, services: undefined } as unknown as typeof projection;

    expect(validateProjectionSchemaCoverage(broken)).toMatchObject({
      status: "invalid",
      issues: expect.arrayContaining([
        expect.objectContaining({
          code: "ARRAY_FIELD_INVALID",
          path: "$.services",
        }),
      ]),
    });
  });
});
