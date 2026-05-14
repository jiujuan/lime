import contentEngineeringFixture from "../fixtures/content-engineering-app.json";
import { parseManifest } from "../manifest/parseManifest";
import { normalizeManifest } from "../manifest/normalizeManifest";
import { projectApp } from "../projection/projectApp";
import { checkReadiness } from "../readiness/checkReadiness";
import { buildPackageIdentity } from "./packageIdentity";
import { buildCleanupPlan } from "./cleanupPlan";
import type { HostCapabilityProfile, InstalledAppPreview } from "../types";

export function buildInstalledAppPreview(params: {
  fixture?: unknown;
  profile?: HostCapabilityProfile;
  loadedAt?: string;
  checkedAt?: string;
  generatedAt?: string;
} = {}): InstalledAppPreview {
  const manifest = parseManifest(params.fixture ?? contentEngineeringFixture);
  const normalized = normalizeManifest(manifest);
  const identity = buildPackageIdentity({
    manifest,
    sourceKind: "fixture",
    sourceUri: "fixture:content-engineering-app",
    loadedAt: params.loadedAt,
  });
  const projection = projectApp({ manifest: normalized, identity });
  const readiness = checkReadiness({
    manifest: normalized,
    projection,
    profile: params.profile,
    checkedAt: params.checkedAt,
  });
  const cleanupPlan = buildCleanupPlan({
    projection,
    generatedAt: params.generatedAt,
  });

  return {
    identity,
    manifest: normalized,
    projection,
    readiness,
    cleanupPlan,
  };
}
