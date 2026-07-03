import { describe, expect, it } from "vitest";
import { buildPackageIdentity } from "../install/packageIdentity";
import { normalizeManifest } from "../manifest/normalizeManifest";
import { parseManifest } from "../manifest/parseManifest";
import { projectApp } from "../projection/projectApp";
import { p0HostCapabilityProfile } from "../readiness/hostCapabilityProfile";
import { buildLimeRuntimeProfileFromHostProfile } from "../runtime-profile";
import { buildStandaloneShellDescriptor } from "../shell";
import {
  buildMacOsStandaloneIdentity,
  buildPackageDescriptor,
  buildStandaloneReleasePipelinePlan,
  buildStandaloneReleasePlan,
} from "./index";

function buildStandaloneShell() {
  const manifest = parseManifest({
    manifestVersion: "0.8.0",
    name: "content-factory-app",
    displayName: "内容工厂",
    version: "0.8.0",
    entries: [
      { key: "dashboard", kind: "page", title: "首页", route: "/dashboard" },
    ],
    install: {
      modes: ["standalone"],
      runtime: { minVersion: "0.8.0" },
      standalone: {
        shell: "lime-app-shell",
        bundleId: "ai.limecloud.contentfactory",
      },
      branding: { name: "Content Factory", windowTitle: "Content Factory" },
    },
  });
  const normalized = normalizeManifest(manifest);
  const projection = projectApp({
    manifest: normalized,
    identity: buildPackageIdentity({ manifest }),
  });
  const runtimeProfile = buildLimeRuntimeProfileFromHostProfile({
    appId: projection.app.appId,
    installMode: "standalone",
    hostProfile: p0HostCapabilityProfile,
  });
  return buildStandaloneShellDescriptor({ projection, runtimeProfile });
}

function buildReleasePlan() {
  const shell = buildStandaloneShell();
  const descriptor = buildPackageDescriptor({
    target: {
      kind: "standalone",
      platform: "macos",
      packageFormat: "dmg",
      macosIdentity: buildMacOsStandaloneIdentity({
        teamId: "TEAMID1234",
        bundleId: "com.limecloud.plugin.contentfactory",
      }),
      productionReady: false,
    },
    shell,
  });
  return buildStandaloneReleasePlan({
    descriptor,
    channel: "stable",
    signing: {
      applicationCertificateKind: "developer_id_application",
      notarizationConfigured: true,
      notarizationProfileRef: "notarytool:lime-prod",
    },
    updater: {
      enabled: true,
      endpoint: "https://updates.limecloud.example/content-factory",
    },
    rollback: {
      strategy: "restore_previous_package",
      previousPackageHash: "sha256:previous",
    },
    productionArtifactBuilderAvailable: true,
  });
}

describe("Plugin standalone release pipeline", () => {
  it("build evidence blocker 使用 production artifact build 口径", () => {
    const releasePlan = buildReleasePlan();

    const missingBuildEvidence = buildStandaloneReleasePipelinePlan({
      releasePlan,
    });
    const incompleteBuildEvidence = buildStandaloneReleasePipelinePlan({
      releasePlan,
      buildEvidence: {
        status: "blocked",
        artifactRefs: [],
      },
    });

    const missingMessage = missingBuildEvidence.blockers.find(
      (item) => item.code === "BUILD_EVIDENCE_MISSING",
    )?.message;
    const incompleteMessage = incompleteBuildEvidence.blockers.find(
      (item) => item.code === "BUILD_NOT_COMPLETED",
    )?.message;

    expect(missingMessage).toBe(
      "Standalone release requires production artifact build evidence before signing or publishing.",
    );
    expect(incompleteMessage).toBe(
      "Standalone release requires a completed production artifact build before signing or publishing.",
    );
  });

  it("缺少 build artifact refs 时必须阻断发布", () => {
    const releasePlan = buildReleasePlan();

    const plan = buildStandaloneReleasePipelinePlan({
      releasePlan,
      buildEvidence: {
        status: "completed",
        artifactRefs: [],
        evidenceRef: ".lime/plugins/build.json",
      },
    });

    expect(plan).toMatchObject({
      status: "blocked",
      readyToPublish: false,
      buildEvidenceRef: ".lime/plugins/build.json",
      blockers: expect.arrayContaining([
        expect.objectContaining({ code: "PACKAGE_DESCRIPTOR_NON_PRODUCTION" }),
        expect.objectContaining({ code: "BUILD_ARTIFACT_REFS_MISSING" }),
        expect.objectContaining({ code: "ROLLBACK_MANIFEST_MISSING" }),
      ]),
    });
  });

  it("未签名 / 未公证 / 未发布 updater manifest 的产物不能发布", () => {
    const releasePlan = buildReleasePlan();

    const plan = buildStandaloneReleasePipelinePlan({
      releasePlan,
      buildEvidence: {
        status: "completed",
        artifactRefs: [
          {
            kind: "app_bundle",
            path: "dist/Content Factory.app",
            contentHash: "sha256:app",
          },
          {
            kind: "dmg",
            path: "dist/Content Factory.dmg",
            contentHash: "sha256:dmg",
          },
        ],
      },
    });

    expect(plan.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "APPLICATION_ARTIFACT_SIGNING_MISSING",
        }),
        expect.objectContaining({ code: "NOTARIZATION_EVIDENCE_MISSING" }),
        expect.objectContaining({ code: "UPDATER_MANIFEST_MISSING" }),
      ]),
    );
  });

  it("产物级 evidence 齐全时仍不会绕过 non-production descriptor 门禁", () => {
    const releasePlan = buildReleasePlan();

    const plan = buildStandaloneReleasePipelinePlan({
      releasePlan,
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
            kind: "dmg",
            path: "dist/Content Factory.dmg",
            contentHash: "sha256:dmg",
            signed: true,
            notarized: true,
            stapled: true,
          },
        ],
      },
      signingEvidence: {
        applicationSignedArtifactRefs: ["sha256:app"],
        evidenceRef: ".lime/plugins/signing.json",
      },
      notarizationEvidence: {
        acceptedArtifactRefs: ["sha256:dmg"],
        stapledArtifactRefs: ["sha256:dmg"],
        logRef: ".lime/plugins/notarization.json",
      },
      updaterEvidence: {
        manifestRef: ".lime/plugins/latest.json",
        artifactRefs: ["sha256:dmg"],
      },
      rollbackEvidence: {
        manifestRef: ".lime/plugins/rollback.json",
        previousArtifactRef: "sha256:previous",
      },
    });

    expect(plan.blockers).toEqual([
      expect.objectContaining({ code: "PACKAGE_DESCRIPTOR_NON_PRODUCTION" }),
    ]);
    expect(plan).toMatchObject({
      status: "blocked",
      readyToPublish: false,
      signingEvidenceRef: ".lime/plugins/signing.json",
      notarizationEvidenceRef: ".lime/plugins/notarization.json",
      updaterManifestRef: ".lime/plugins/latest.json",
      rollbackManifestRef: ".lime/plugins/rollback.json",
    });
  });
});
