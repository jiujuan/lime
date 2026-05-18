import fs from "node:fs";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

import {
  checkStandaloneReleaseEvidence,
  writeJsonFile,
} from "./agent-app-standalone-release-evidence-core.mjs";

function macosPkgEvidence() {
  return {
    appId: "content-factory-app",
    version: "0.8.0",
    channel: "stable",
    platform: "macos",
    packageFormat: "pkg",
    secretPreflightEvidence: { status: "ready" },
    buildEvidence: {
      status: "completed",
      artifactRefs: [
        {
          kind: "app_bundle",
          path: "dist/Content Factory.app",
          contentHash: "sha256:app",
          signed: true,
        },
        {
          kind: "pkg",
          path: "dist/Content Factory.pkg",
          contentHash: "sha256:pkg",
          signed: true,
          notarized: true,
          stapled: true,
        },
      ],
    },
    signingEvidence: {
      applicationSignedArtifactRefs: ["sha256:app"],
      installerSignedArtifactRefs: ["sha256:pkg"],
    },
    notarizationEvidence: {
      acceptedArtifactRefs: ["sha256:pkg"],
      stapledArtifactRefs: ["sha256:pkg"],
    },
    installerVerificationEvidence: {
      status: "completed",
      commandsRun: [
        { id: "codesign-verify-app", exitCode: 0 },
        { id: "spctl-assess-app", exitCode: 0 },
        { id: "pkgutil-check-signature", exitCode: 0 },
        { id: "stapler-validate", exitCode: 0 },
      ],
    },
    updaterPublishEvidence: {
      status: "uploaded",
      manifestRef: "r2://lime-agent-apps/content-factory/latest.json",
      artifactRefs: ["sha256:pkg"],
    },
    rollbackEvidence: {
      manifestRef: "r2://lime-agent-apps/content-factory/rollback.json",
      previousArtifactRef: "sha256:previous",
    },
  };
}

function sha256(value) {
  return `sha256:${crypto.createHash("sha256").update(value).digest("hex")}`;
}

describe("agent-app standalone final release evidence", () => {
  it("accepts complete macOS pkg final release evidence", () => {
    const result = checkStandaloneReleaseEvidence(macosPkgEvidence());

    expect(result).toMatchObject({
      status: "ready",
      readyToRelease: true,
      releaseReadiness: "final_release_evidence_ready",
      requiredInstallerVerificationCommandIds: [
        "codesign-verify-app",
        "spctl-assess-app",
        "pkgutil-check-signature",
        "stapler-validate",
      ],
      blockers: [],
    });
  });

  it("blocks when installer verification and remote upload evidence are missing", () => {
    const evidence = macosPkgEvidence();
    delete evidence.installerVerificationEvidence;
    delete evidence.updaterPublishEvidence;

    const result = checkStandaloneReleaseEvidence(evidence);

    expect(result).toMatchObject({
      status: "blocked",
      readyToRelease: false,
      blockers: expect.arrayContaining([
        expect.objectContaining({ code: "INSTALLER_VERIFICATION_MISSING" }),
        expect.objectContaining({ code: "UPDATER_REMOTE_UPLOAD_MISSING" }),
      ]),
    });
  });

  it("verifies artifact files under artifact root when requested", () => {
    const artifactRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "lime-agent-app-release-artifacts-"),
    );
    fs.mkdirSync(path.join(artifactRoot, "dist", "Content Factory.app"), {
      recursive: true,
    });
    fs.mkdirSync(path.join(artifactRoot, "dist"), { recursive: true });
    const pkgBytes = "signed pkg bytes";
    fs.writeFileSync(
      path.join(artifactRoot, "dist", "Content Factory.pkg"),
      pkgBytes,
      "utf8",
    );

    const evidence = macosPkgEvidence();
    evidence.buildEvidence.artifactRefs[1].contentHash = sha256(pkgBytes);
    evidence.updaterPublishEvidence.artifactRefs = [sha256(pkgBytes)];

    const result = checkStandaloneReleaseEvidence(evidence, { artifactRoot });

    expect(result).toMatchObject({
      status: "ready",
      artifactRoot,
      blockers: [],
    });
  });

  it("blocks when artifact root hash evidence is weak", () => {
    const artifactRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "lime-agent-app-release-artifacts-"),
    );
    fs.mkdirSync(path.join(artifactRoot, "dist", "Content Factory.app"), {
      recursive: true,
    });
    fs.mkdirSync(path.join(artifactRoot, "dist"), { recursive: true });
    fs.writeFileSync(
      path.join(artifactRoot, "dist", "Content Factory.pkg"),
      "signed pkg bytes",
      "utf8",
    );

    const result = checkStandaloneReleaseEvidence(macosPkgEvidence(), {
      artifactRoot,
    });

    expect(result).toMatchObject({
      status: "blocked",
      blockers: expect.arrayContaining([
        expect.objectContaining({ code: "ARTIFACT_HASH_UNVERIFIED" }),
      ]),
    });
  });

  it("requires Windows signing, signtool verification, upload, and rollback evidence", () => {
    const result = checkStandaloneReleaseEvidence({
      appId: "content-factory-app",
      version: "0.8.0",
      channel: "stable",
      platform: "windows",
      packageFormat: "app",
      secretPreflightEvidence: { status: "ready" },
      buildEvidence: {
        status: "completed",
        artifactRefs: [
          {
            kind: "windows_installer",
            path: "dist/Content Factory.exe",
            contentHash: "sha256:exe",
            signed: true,
          },
        ],
      },
      signingEvidence: {
        windowsSignedArtifactRefs: ["sha256:exe"],
      },
      installerVerificationEvidence: {
        status: "completed",
        commandsRun: [{ id: "signtool-verify-installer", exitCode: 0 }],
      },
      updaterPublishEvidence: {
        remoteUploaded: true,
        manifestRef: "r2://lime-agent-apps/content-factory/latest.json",
        artifactRefs: ["sha256:exe"],
      },
      rollbackEvidence: {
        manifestRef: "r2://lime-agent-apps/content-factory/rollback.json",
        previousArtifactRef: "sha256:previous",
      },
    });

    expect(result).toMatchObject({
      status: "ready",
      readyToRelease: true,
      requiredInstallerVerificationCommandIds: ["signtool-verify-installer"],
      blockers: [],
    });
  });

  it("does not accept remote upload evidence unless it references the distributable", () => {
    const evidence = macosPkgEvidence();
    evidence.updaterPublishEvidence = {
      status: "uploaded",
      manifestRef: "r2://lime-agent-apps/content-factory/latest.json",
      artifactRefs: ["sha256:other"],
    };

    const result = checkStandaloneReleaseEvidence(evidence);

    expect(result).toMatchObject({
      status: "blocked",
      blockers: expect.arrayContaining([
        expect.objectContaining({ code: "UPDATER_REMOTE_UPLOAD_MISSING" }),
      ]),
    });
  });

  it("CLI writes a blocked audit and --check returns non-zero for weak evidence", () => {
    const outputRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "lime-agent-app-release-evidence-"),
    );
    const evidencePath = path.join(outputRoot, "release-evidence.json");
    const auditPath = path.join(outputRoot, "release-audit.json");
    const evidence = macosPkgEvidence();
    evidence.secretPreflightEvidence = { status: "blocked" };
    delete evidence.installerVerificationEvidence;
    writeJsonFile(evidencePath, evidence);

    const result = spawnSync(
      process.execPath,
      [
        path.resolve("scripts/agent-app-standalone-release-evidence-check.mjs"),
        "--evidence",
        evidencePath,
        "--output",
        auditPath,
        "--check",
      ],
      { encoding: "utf8" },
    );

    expect(result.status).toBe(1);
    expect(JSON.parse(fs.readFileSync(auditPath, "utf8"))).toMatchObject({
      status: "blocked",
      blockers: expect.arrayContaining([
        expect.objectContaining({ code: "SECRET_PREFLIGHT_NOT_READY" }),
        expect.objectContaining({ code: "INSTALLER_VERIFICATION_MISSING" }),
      ]),
    });
  });
});
