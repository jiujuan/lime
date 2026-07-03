import { parseManifest } from "../manifest/parseManifest";
import { normalizeManifest } from "../manifest/normalizeManifest";
import { projectApp } from "../projection/projectApp";
import { checkReadiness } from "../readiness/checkReadiness";
import { buildPackageIdentity } from "./packageIdentity";
import { buildCleanupPlan } from "./cleanupPlan";
import type {
  PluginSetupState,
  PluginPackageVerificationResult,
  CloudBootstrapApp,
  HostCapabilityProfile,
  InstalledAppPreview,
  PackageIdentity,
} from "../types";

export class PluginInstalledPreviewError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PluginInstalledPreviewError";
  }
}

function assertIdentityMatchesManifest(
  identity: PackageIdentity,
  manifest: { appId: string; version: string },
): void {
  if (identity.appId !== manifest.appId) {
    throw new PluginInstalledPreviewError(
      `Package identity appId ${identity.appId} does not match manifest appId ${manifest.appId}`,
    );
  }
  if (identity.appVersion !== manifest.version) {
    throw new PluginInstalledPreviewError(
      `Package identity version ${identity.appVersion} does not match manifest version ${manifest.version}`,
    );
  }
}

export function buildInstalledAppPreview(params: {
  fixture: unknown;
  identity?: PackageIdentity;
  cloud?: CloudBootstrapApp;
  packageVerification?: PluginPackageVerificationResult;
  setup?: PluginSetupState;
  profile?: HostCapabilityProfile;
  loadedAt?: string;
  checkedAt?: string;
  generatedAt?: string;
}): InstalledAppPreview {
  const manifest = parseManifest(params.fixture);
  const normalized = normalizeManifest(manifest);
  const identity =
    params.identity ??
    buildPackageIdentity({
      manifest,
      sourceKind: "fixture",
      sourceUri: "fixture:content-factory-app",
      loadedAt: params.loadedAt,
    });
  assertIdentityMatchesManifest(identity, normalized);
  const projection = projectApp({ manifest: normalized, identity });
  const readiness = checkReadiness({
    manifest: normalized,
    projection,
    profile: params.profile,
    cloud: params.cloud,
    packageVerification: params.packageVerification,
    setup: params.setup,
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
