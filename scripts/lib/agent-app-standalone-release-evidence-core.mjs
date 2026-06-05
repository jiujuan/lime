import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";

function artifactKey(artifact) {
  return artifact?.contentHash ?? artifact?.path;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function hasRef(refs, artifact) {
  const key = artifactKey(artifact);
  return asArray(refs).includes(key) || asArray(refs).includes(artifact?.path);
}

function blocker(code, message, source, details = undefined) {
  return { code, message, source, details };
}

function expectedDistributableKind({ packageFormat = "app", platform = "macos" }) {
  if (platform === "windows") return "windows_installer";
  if (packageFormat === "pkg") return "pkg";
  if (packageFormat === "dmg") return "dmg";
  return "app_bundle";
}

function expectedInstallerVerificationCommandIds({ packageFormat, platform }) {
  if (platform === "windows") return ["signtool-verify-installer"];
  const ids = ["codesign-verify-app", "spctl-assess-app", "stapler-validate"];
  if (packageFormat === "pkg") ids.splice(2, 0, "pkgutil-check-signature");
  if (packageFormat === "dmg") ids.splice(2, 0, "hdiutil-verify-dmg");
  return ids;
}

function installerVerificationCommandIds(evidence) {
  return new Set(asArray(evidence?.commandsRun).map((item) => item?.id));
}

function hasRemoteUploadEvidence(evidence, artifact) {
  if (!evidence) return false;
  const hasManifest = Boolean(evidence.manifestRef || evidence.uploadedManifestRef);
  const uploadedRefs = evidence.uploadedArtifactRefs ?? evidence.artifactRefs;
  const artifactUploaded = hasRef(uploadedRefs, artifact);
  if (!hasManifest || !artifactUploaded) return false;
  if (evidence.remoteUploaded === true) return true;
  if (evidence.status === "uploaded") return true;
  return Boolean(
    evidence.uploadedManifestRef && evidence.uploadedArtifactRefs,
  );
}

function hasRollbackEvidence(evidence) {
  return Boolean(evidence?.manifestRef && evidence?.previousArtifactRef);
}

function normalizeBoundaryPath(value) {
  const normalized = String(value ?? "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/\/+/g, "/");
  if (normalized.length > 1 && normalized.endsWith("/")) {
    return normalized.slice(0, -1);
  }
  return normalized;
}

function hasTraversal(filePath) {
  return normalizeBoundaryPath(filePath).split("/").includes("..");
}

function isInsideRoot(filePath, root) {
  const normalizedPath = normalizeBoundaryPath(path.resolve(filePath));
  const normalizedRoot = normalizeBoundaryPath(path.resolve(root));
  return (
    normalizedPath === normalizedRoot ||
    normalizedPath.startsWith(`${normalizedRoot}/`)
  );
}

function resolveArtifactPath(artifact, artifactRoot) {
  const rawPath = String(artifact?.path ?? "").trim();
  if (!rawPath) return "";
  return path.isAbsolute(rawPath) ? rawPath : path.join(artifactRoot, rawPath);
}

function expectedSha256(contentHash) {
  const match = String(contentHash ?? "").match(/^sha256:([a-f0-9]{64})$/i);
  return match?.[1]?.toLowerCase() ?? "";
}

function fileSha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function verifyArtifactFiles({ artifactRoot, artifacts }) {
  if (!String(artifactRoot ?? "").trim()) return [];
  const blockers = [];
  if (!fs.existsSync(artifactRoot) || !fs.statSync(artifactRoot).isDirectory()) {
    return [
      blocker(
        "ARTIFACT_ROOT_MISSING",
        "Artifact root must exist when final release file verification is enabled.",
        "artifact_files",
        { artifactRoot },
      ),
    ];
  }

  for (const artifact of artifacts) {
    if (!String(artifact?.path ?? "").trim()) {
      blockers.push(
        blocker(
          "ARTIFACT_PATH_MISSING",
          "Artifact refs require a non-empty path.",
          "artifact_files",
          { kind: artifact?.kind },
        ),
      );
      continue;
    }
    if (hasTraversal(artifact.path)) {
      blockers.push(
        blocker(
          "ARTIFACT_PATH_TRAVERSAL",
          "Artifact paths must not contain parent traversal.",
          "artifact_files",
          { path: artifact.path },
        ),
      );
      continue;
    }

    const resolvedPath = resolveArtifactPath(artifact, artifactRoot);
    if (!isInsideRoot(resolvedPath, artifactRoot)) {
      blockers.push(
        blocker(
          "ARTIFACT_OUTSIDE_ROOT",
          "Artifact path must stay inside artifact root.",
          "artifact_files",
          { path: artifact.path, artifactRoot },
        ),
      );
      continue;
    }
    if (!fs.existsSync(resolvedPath)) {
      blockers.push(
        blocker(
          "ARTIFACT_FILE_MISSING",
          "Artifact path does not exist under artifact root.",
          "artifact_files",
          { path: artifact.path },
        ),
      );
      continue;
    }

    const stat = fs.statSync(resolvedPath);
    const hash = expectedSha256(artifact.contentHash);
    if (["dmg", "pkg", "windows_installer"].includes(artifact.kind)) {
      if (!stat.isFile()) {
        blockers.push(
          blocker(
            "ARTIFACT_FILE_EXPECTED",
            "Distributable artifact must be a file.",
            "artifact_files",
            { path: artifact.path, kind: artifact.kind },
          ),
        );
        continue;
      }
      if (!hash) {
        blockers.push(
          blocker(
            "ARTIFACT_HASH_UNVERIFIED",
            "Distributable artifact requires sha256:<64 hex> contentHash.",
            "artifact_files",
            { path: artifact.path, contentHash: artifact.contentHash },
          ),
        );
        continue;
      }
      const actualHash = fileSha256(resolvedPath);
      if (actualHash !== hash) {
        blockers.push(
          blocker(
            "ARTIFACT_HASH_MISMATCH",
            "Distributable artifact content hash does not match evidence.",
            "artifact_files",
            { path: artifact.path },
          ),
        );
      }
    }
  }
  return blockers;
}

export function checkStandaloneReleaseEvidence(input = {}, options = {}) {
  const platform = input.platform ?? "macos";
  const packageFormat = input.packageFormat ?? "app";
  const channel = input.channel ?? "stable";
  const artifacts = asArray(input.buildEvidence?.artifactRefs);
  const blockers = [];
  blockers.push(
    ...verifyArtifactFiles({
      artifactRoot: options.artifactRoot,
      artifacts,
    }),
  );

  if (input.secretPreflightEvidence?.status !== "ready") {
    blockers.push(
      blocker(
        "SECRET_PREFLIGHT_NOT_READY",
        "Final release requires ready CI secret preflight evidence.",
        "secret_preflight",
        { status: input.secretPreflightEvidence?.status ?? "missing" },
      ),
    );
  }

  if (!input.buildEvidence) {
    blockers.push(
      blocker(
        "BUILD_EVIDENCE_MISSING",
        "Final release requires completed standalone build evidence.",
        "build",
      ),
    );
  } else if (input.buildEvidence.status !== "completed") {
    blockers.push(
      blocker(
        "BUILD_NOT_COMPLETED",
        "Final release requires build evidence with status=completed.",
        "build",
        { status: input.buildEvidence.status },
      ),
    );
  }

  const appBundle = artifacts.find((artifact) => artifact?.kind === "app_bundle");
  const distributableKind = expectedDistributableKind({ packageFormat, platform });
  const distributable = artifacts.find(
    (artifact) => artifact?.kind === distributableKind,
  );

  if (platform === "macos" && !appBundle) {
    blockers.push(
      blocker(
        "APP_BUNDLE_ARTIFACT_MISSING",
        "macOS final release evidence requires the .app bundle artifact ref.",
        "build",
      ),
    );
  }
  if (!distributable) {
    blockers.push(
      blocker(
        "DISTRIBUTABLE_ARTIFACT_MISSING",
        "Final release evidence requires the target distributable artifact ref.",
        "build",
        { expectedKind: distributableKind },
      ),
    );
  }

  if (platform === "macos" && appBundle) {
    const applicationSigned = Boolean(appBundle.signed) || hasRef(
      input.signingEvidence?.applicationSignedArtifactRefs,
      appBundle,
    );
    if (!applicationSigned) {
      blockers.push(
        blocker(
          "APPLICATION_SIGNING_MISSING",
          "macOS final release requires Developer ID Application signing evidence.",
          "signing",
          { artifact: artifactKey(appBundle) },
        ),
      );
    }
  }

  if (platform === "macos" && packageFormat === "pkg" && distributable) {
    const installerSigned =
      Boolean(distributable.signed) ||
      hasRef(input.signingEvidence?.installerSignedArtifactRefs, distributable);
    if (!installerSigned) {
      blockers.push(
        blocker(
          "INSTALLER_SIGNING_MISSING",
          "pkg final release requires Developer ID Installer signing evidence.",
          "signing",
          { artifact: artifactKey(distributable) },
        ),
      );
    }
  }

  if (platform === "windows" && distributable) {
    const windowsSigned =
      Boolean(distributable.signed) ||
      hasRef(input.signingEvidence?.windowsSignedArtifactRefs, distributable) ||
      hasRef(input.signingEvidence?.installerSignedArtifactRefs, distributable);
    if (!windowsSigned) {
      blockers.push(
        blocker(
          "WINDOWS_SIGNING_MISSING",
          "Windows final release requires installer signing evidence.",
          "signing",
          { artifact: artifactKey(distributable) },
        ),
      );
    }
  }

  if (platform === "macos" && distributable) {
    const notarized =
      Boolean(distributable.notarized) ||
      hasRef(input.notarizationEvidence?.acceptedArtifactRefs, distributable);
    const stapled =
      Boolean(distributable.stapled) ||
      hasRef(input.notarizationEvidence?.stapledArtifactRefs, distributable);
    if (!notarized) {
      blockers.push(
        blocker(
          "NOTARIZATION_MISSING",
          "macOS final release requires notarization acceptance evidence.",
          "notarization",
          { artifact: artifactKey(distributable) },
        ),
      );
    }
    if (!stapled) {
      blockers.push(
        blocker(
          "STAPLE_MISSING",
          "macOS final release requires stapler evidence for the distributable.",
          "notarization",
          { artifact: artifactKey(distributable) },
        ),
      );
    }
  }

  const verificationEvidence = input.installerVerificationEvidence;
  const requiredCommandIds = expectedInstallerVerificationCommandIds({
    packageFormat,
    platform,
  });
  if (!verificationEvidence) {
    blockers.push(
      blocker(
        "INSTALLER_VERIFICATION_MISSING",
        "Final release requires installer verification execution evidence.",
        "installer_verify",
      ),
    );
  } else if (verificationEvidence.status !== "completed") {
    blockers.push(
      blocker(
        "INSTALLER_VERIFICATION_INCOMPLETE",
        "Final release requires installer verification status=completed.",
        "installer_verify",
        { status: verificationEvidence.status },
      ),
    );
  } else {
    const commandIds = installerVerificationCommandIds(verificationEvidence);
    for (const id of requiredCommandIds) {
      if (!commandIds.has(id)) {
        blockers.push(
          blocker(
            "INSTALLER_VERIFICATION_COMMAND_MISSING",
            "Installer verification evidence is missing a required command.",
            "installer_verify",
            { commandId: id },
          ),
        );
      }
    }
  }

  if (distributable && !hasRemoteUploadEvidence(input.updaterPublishEvidence, distributable)) {
    blockers.push(
      blocker(
        "UPDATER_REMOTE_UPLOAD_MISSING",
        "Final release requires remote updater upload evidence tied to the distributable.",
        "updater",
        { artifact: artifactKey(distributable) },
      ),
    );
  }

  if (channel === "stable" && !hasRollbackEvidence(input.rollbackEvidence)) {
    blockers.push(
      blocker(
        "ROLLBACK_EVIDENCE_MISSING",
        "Stable final release requires rollback manifest and previous artifact evidence.",
        "rollback",
      ),
    );
  }

  const ready = blockers.length === 0;
  return {
    schemaVersion: 1,
    status: ready ? "ready" : "blocked",
    readyToRelease: ready,
    releaseReadiness: ready
      ? "final_release_evidence_ready"
      : "final_release_evidence_blocked",
    appId: input.appId,
    version: input.version,
    channel,
    platform,
    packageFormat,
    artifactRefs: artifacts.map((artifact) => ({
      kind: artifact.kind,
      path: artifact.path,
      contentHash: artifact.contentHash,
    })),
    requiredInstallerVerificationCommandIds: requiredCommandIds,
    artifactRoot: options.artifactRoot,
    blockers,
  };
}

export function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

export function writeJsonFile(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
