import contentFactoryFixture from "../fixtures/content-factory-app.json";
import { parseManifest } from "../manifest/parseManifest";
import { normalizeManifest } from "../manifest/normalizeManifest";
import { projectApp } from "../projection/projectApp";
import { checkReadiness } from "../readiness/checkReadiness";
import { buildPackageIdentity } from "./packageIdentity";
import { buildCleanupPlan } from "./cleanupPlan";
import type {
  AgentAppSetupState,
  AgentAppPackageVerificationResult,
  CloudBootstrapApp,
  HostCapabilityProfile,
  InstalledAppPreview,
  PackageIdentity,
} from "../types";

export class AgentAppInstalledPreviewError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentAppInstalledPreviewError";
  }
}

function assertIdentityMatchesManifest(
  identity: PackageIdentity,
  manifest: { appId: string; version: string },
): void {
  if (identity.appId !== manifest.appId) {
    throw new AgentAppInstalledPreviewError(
      `Package identity appId ${identity.appId} does not match manifest appId ${manifest.appId}`,
    );
  }
  if (identity.appVersion !== manifest.version) {
    throw new AgentAppInstalledPreviewError(
      `Package identity version ${identity.appVersion} does not match manifest version ${manifest.version}`,
    );
  }
}

export function buildInstalledAppPreview(params: {
  fixture?: unknown;
  identity?: PackageIdentity;
  cloud?: CloudBootstrapApp;
  packageVerification?: AgentAppPackageVerificationResult;
  setup?: AgentAppSetupState;
  profile?: HostCapabilityProfile;
  loadedAt?: string;
  checkedAt?: string;
  generatedAt?: string;
} = {}): InstalledAppPreview {
  const manifest = parseManifest(params.fixture ?? contentFactoryFixture);
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
