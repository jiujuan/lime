import { describe, expect, it } from "vitest";
import contentEngineeringFixture from "../fixtures/content-engineering-app.json";
import { buildPackageIdentity } from "../install/packageIdentity";
import { normalizeManifest } from "../manifest/normalizeManifest";
import { parseManifest } from "../manifest/parseManifest";
import { projectApp } from "../projection/projectApp";
import type { HostCapabilityProfile } from "../types";
import { checkReadiness } from "./checkReadiness";
import { p0HostCapabilityProfile } from "./hostCapabilityProfile";

function buildProjection() {
  const manifest = parseManifest(contentEngineeringFixture);
  const normalized = normalizeManifest(manifest);
  const identity = buildPackageIdentity({ manifest });
  return {
    manifest: normalized,
    projection: projectApp({ manifest: normalized, identity }),
  };
}

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
      expect.arrayContaining(["STORAGE_DECLARED_BUT_DISABLED", "UI_RUNTIME_DISABLED", "WORKER_RUNTIME_DISABLED"]),
    );
  });

  it("能力启用后应只保留 P0 runtime 降级警告", () => {
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

    expect(readiness.status).toBe("degraded");
    expect(readiness.blockers).toHaveLength(0);
    expect(readiness.missingCapabilities).toHaveLength(0);
  });
});
