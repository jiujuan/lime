import type {
  PluginStandaloneReleaseGate,
  PluginStandaloneReleasePlan,
} from "./releasePlan";

export type PluginStandaloneReleaseArtifactKind =
  | "app_bundle"
  | "dmg"
  | "windows_installer";

export interface PluginStandaloneReleaseArtifactRef {
  kind: PluginStandaloneReleaseArtifactKind;
  path: string;
  contentHash?: string;
  signed?: boolean;
  notarized?: boolean;
  stapled?: boolean;
}

export interface PluginStandaloneBuildEvidence {
  status: "blocked" | "completed" | "failed";
  artifactRefs?: PluginStandaloneReleaseArtifactRef[];
  evidenceRef?: string;
}

export interface PluginStandaloneSigningEvidence {
  applicationSignedArtifactRefs?: string[];
  evidenceRef?: string;
}

export interface PluginStandaloneNotarizationEvidence {
  acceptedArtifactRefs?: string[];
  stapledArtifactRefs?: string[];
  submissionRef?: string;
  logRef?: string;
}

export interface PluginStandaloneUpdaterPublishEvidence {
  manifestRef?: string;
  artifactRefs?: string[];
}

export interface PluginStandaloneRollbackPublishEvidence {
  manifestRef?: string;
  previousArtifactRef?: string;
}

export type PluginStandaloneReleasePipelineBlockerCode =
  | PluginStandaloneReleaseGate["code"]
  | "APPLICATION_ARTIFACT_SIGNING_MISSING"
  | "BUILD_ARTIFACT_REFS_MISSING"
  | "BUILD_EVIDENCE_MISSING"
  | "BUILD_NOT_COMPLETED"
  | "DISTRIBUTABLE_ARTIFACT_MISSING"
  | "NOTARIZATION_EVIDENCE_MISSING"
  | "ROLLBACK_MANIFEST_MISSING"
  | "UPDATER_MANIFEST_MISSING";

export interface PluginStandaloneReleasePipelineBlocker {
  code: PluginStandaloneReleasePipelineBlockerCode;
  message: string;
  source:
    | "artifact_build"
    | "notarization"
    | "release_plan"
    | "rollback"
    | "signing"
    | "updater";
  details?: unknown;
}

export interface PluginStandaloneReleasePipelineInput {
  releasePlan: PluginStandaloneReleasePlan;
  buildEvidence?: PluginStandaloneBuildEvidence;
  signingEvidence?: PluginStandaloneSigningEvidence;
  notarizationEvidence?: PluginStandaloneNotarizationEvidence;
  updaterEvidence?: PluginStandaloneUpdaterPublishEvidence;
  rollbackEvidence?: PluginStandaloneRollbackPublishEvidence;
}

export interface PluginStandaloneReleasePipelinePlan {
  schemaVersion: 1;
  appId: string;
  channel: PluginStandaloneReleasePlan["channel"];
  descriptorHash: string;
  target: PluginStandaloneReleasePlan["target"];
  status: "blocked";
  readyToPublish: false;
  buildEvidenceRef?: string;
  artifactRefs: PluginStandaloneReleaseArtifactRef[];
  signingEvidenceRef?: string;
  notarizationEvidenceRef?: string;
  updaterManifestRef?: string;
  rollbackManifestRef?: string;
  blockers: PluginStandaloneReleasePipelineBlocker[];
}

function artifactKey(artifact: PluginStandaloneReleaseArtifactRef): string {
  return artifact.contentHash ?? artifact.path;
}

function hasEvidenceRef(
  refs: string[] | undefined,
  artifact: PluginStandaloneReleaseArtifactRef,
): boolean {
  const key = artifactKey(artifact);
  return Boolean(refs?.includes(key) || refs?.includes(artifact.path));
}

function blocker(
  code: PluginStandaloneReleasePipelineBlockerCode,
  message: string,
  source: PluginStandaloneReleasePipelineBlocker["source"],
  details?: unknown,
): PluginStandaloneReleasePipelineBlocker {
  return { code, message, source, details };
}

function expectedDistributableKind(
  releasePlan: PluginStandaloneReleasePlan,
): PluginStandaloneReleaseArtifactKind {
  if (releasePlan.target.platform === "windows") return "windows_installer";
  if (releasePlan.target.packageFormat === "dmg") return "dmg";
  return "app_bundle";
}

function dedupeBlockers(
  blockers: PluginStandaloneReleasePipelineBlocker[],
): PluginStandaloneReleasePipelineBlocker[] {
  const seen = new Set<string>();
  return blockers.filter((item) => {
    const key = `${item.source}:${item.code}:${JSON.stringify(item.details ?? {})}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function buildStandaloneReleasePipelinePlan(
  input: PluginStandaloneReleasePipelineInput,
): PluginStandaloneReleasePipelinePlan {
  const { releasePlan } = input;
  const blockers: PluginStandaloneReleasePipelineBlocker[] =
    releasePlan.blockers.map((item) =>
      blocker(item.code, item.message, "release_plan", item.details),
    );
  const artifacts = input.buildEvidence?.artifactRefs ?? [];

  if (!input.buildEvidence) {
    blockers.push(
      blocker(
        "BUILD_EVIDENCE_MISSING",
        "Standalone release requires production artifact build evidence before signing or publishing.",
        "artifact_build",
      ),
    );
  } else if (input.buildEvidence.status !== "completed") {
    blockers.push(
      blocker(
        "BUILD_NOT_COMPLETED",
        "Standalone release requires a completed production artifact build before signing or publishing.",
        "artifact_build",
        { status: input.buildEvidence.status },
      ),
    );
  }
  if (artifacts.length === 0) {
    blockers.push(
      blocker(
        "BUILD_ARTIFACT_REFS_MISSING",
        "Standalone release requires explicit build artifact refs.",
        "artifact_build",
      ),
    );
  }

  const appBundle = artifacts.find(
    (artifact) => artifact.kind === "app_bundle",
  );
  const distributableKind = expectedDistributableKind(releasePlan);
  const distributable = artifacts.find(
    (artifact) => artifact.kind === distributableKind,
  );

  if (!distributable && artifacts.length > 0) {
    blockers.push(
      blocker(
        "DISTRIBUTABLE_ARTIFACT_MISSING",
        "Standalone release requires the target distributable artifact ref.",
        "artifact_build",
        { expectedKind: distributableKind },
      ),
    );
  }

  if (releasePlan.target.platform === "macos") {
    if (
      appBundle &&
      !appBundle.signed &&
      !hasEvidenceRef(
        input.signingEvidence?.applicationSignedArtifactRefs,
        appBundle,
      )
    ) {
      blockers.push(
        blocker(
          "APPLICATION_ARTIFACT_SIGNING_MISSING",
          "macOS standalone release requires application signing evidence for the .app bundle.",
          "signing",
          { artifact: artifactKey(appBundle) },
        ),
      );
    }

    const notarizationRequired = Boolean(
      releasePlan.target.macosIdentity?.notarizationRequired,
    );
    if (
      notarizationRequired &&
      distributable &&
      !distributable.notarized &&
      !hasEvidenceRef(
        input.notarizationEvidence?.acceptedArtifactRefs,
        distributable,
      )
    ) {
      blockers.push(
        blocker(
          "NOTARIZATION_EVIDENCE_MISSING",
          "macOS Developer ID release requires notarization acceptance evidence for the distributable artifact.",
          "notarization",
          { artifact: artifactKey(distributable) },
        ),
      );
    }
  }

  if (
    releasePlan.updater.enabled &&
    (!input.updaterEvidence?.manifestRef ||
      (distributable &&
        !hasEvidenceRef(input.updaterEvidence.artifactRefs, distributable)))
  ) {
    blockers.push(
      blocker(
        "UPDATER_MANIFEST_MISSING",
        "Standalone updater publication requires a manifest ref tied to the signed distributable artifact.",
        "updater",
        distributable ? { artifact: artifactKey(distributable) } : undefined,
      ),
    );
  }

  if (releasePlan.rollback.required && !input.rollbackEvidence?.manifestRef) {
    blockers.push(
      blocker(
        "ROLLBACK_MANIFEST_MISSING",
        "Stable standalone release requires rollback manifest evidence before publishing.",
        "rollback",
      ),
    );
  }

  return {
    schemaVersion: 1,
    appId: releasePlan.appId,
    channel: releasePlan.channel,
    descriptorHash: releasePlan.descriptorHash,
    target: releasePlan.target,
    status: "blocked",
    readyToPublish: false,
    buildEvidenceRef: input.buildEvidence?.evidenceRef,
    artifactRefs: artifacts,
    signingEvidenceRef: input.signingEvidence?.evidenceRef,
    notarizationEvidenceRef: input.notarizationEvidence?.logRef,
    updaterManifestRef: input.updaterEvidence?.manifestRef,
    rollbackManifestRef: input.rollbackEvidence?.manifestRef,
    blockers: dedupeBlockers(blockers),
  };
}
