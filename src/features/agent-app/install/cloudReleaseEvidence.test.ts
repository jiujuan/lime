import { describe, expect, it } from "vitest";
import type { CloudBootstrapApp } from "../types";
import {
  buildCloudReleaseAuditReport,
  buildCloudReleaseAuditSummary,
  buildCloudReleaseEvidence,
  listCloudReleaseEvidenceIssueCodes,
} from "./cloudReleaseEvidence";

const PACKAGE_HASH =
  "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const MANIFEST_HASH =
  "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

function buildCloudApp(
  overrides: Partial<CloudBootstrapApp> = {},
): CloudBootstrapApp {
  return {
    appId: "content-factory-app",
    displayName: "内容工厂",
    version: "0.3.0",
    releaseId: "release-001",
    channel: "stable",
    signatureRef: "sigstore:content-factory-app@0.3.0",
    registrationRequired: false,
    registrationState: "not_required",
    enabled: true,
    packageUrl:
      "https://packages.limecloud.example/apps/content-factory-app-0.3.0.lapp",
    packageHash: PACKAGE_HASH,
    manifestHash: MANIFEST_HASH,
    capabilityRequirements: {},
    defaultEntries: ["dashboard"],
    policyDefaults: {},
    toolAvailability: [],
    ...overrides,
  };
}

describe("cloudReleaseEvidence", () => {
  it("缺少声明 packageHash / manifestHash 时应阻断发布包 evidence", () => {
    const evidence = buildCloudReleaseEvidence({
      app: buildCloudApp({
        packageHash: "",
        manifestHash: "",
      }),
      catalogSource: "remote",
      sourceKind: "fetched_package",
      actualPackageHash: PACKAGE_HASH,
      actualManifestHash: MANIFEST_HASH,
      packageVerificationStatus: "verified",
    });

    expect(evidence).toMatchObject({
      status: "blocked",
      packageHashDeclared: false,
      manifestHashDeclared: false,
      blockerCodes: ["package_hash_missing", "manifest_hash_missing"],
      warningCodes: ["signature_unverified"],
    });
  });

  it("实际 hash 与声明不一致时应阻断发布包 evidence", () => {
    const evidence = buildCloudReleaseEvidence({
      app: buildCloudApp(),
      catalogSource: "remote",
      sourceKind: "fetched_package",
      actualPackageHash:
        "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      actualManifestHash: MANIFEST_HASH,
      packageVerificationStatus: "verified",
    });

    expect(evidence).toMatchObject({
      status: "blocked",
      packageHashMatched: false,
      manifestHashMatched: true,
      blockerCodes: ["package_hash_mismatch"],
    });
  });

  it("缺少 signatureRef 时应降级为 warning 但不阻断 hash 已验证包", () => {
    const evidence = buildCloudReleaseEvidence({
      app: buildCloudApp({ signatureRef: "" }),
      catalogSource: "remote",
      sourceKind: "verified_cache",
      actualPackageHash: PACKAGE_HASH,
      actualManifestHash: MANIFEST_HASH,
      packageVerificationStatus: "verified",
    });

    expect(evidence).toMatchObject({
      status: "warning",
      signatureDeclared: false,
      signaturePolicy: "optional",
      signatureVerificationStatus: "not_configured",
      packageHashMatched: true,
      manifestHashMatched: true,
      blockerCodes: [],
      warningCodes: ["signature_missing"],
    });
  });

  it("声明 signatureRef 但未完成签名验证时不应标记为 ready", () => {
    const evidence = buildCloudReleaseEvidence({
      app: buildCloudApp(),
      catalogSource: "remote",
      sourceKind: "fetched_package",
      actualPackageHash: PACKAGE_HASH,
      actualManifestHash: MANIFEST_HASH,
      packageVerificationStatus: "verified",
    });

    expect(evidence).toMatchObject({
      status: "warning",
      signatureDeclared: true,
      signatureVerificationStatus: "declared",
      blockerCodes: [],
      warningCodes: ["signature_unverified"],
    });
  });

  it("签名策略要求 verified 时未验证签名必须阻断", () => {
    const evidence = buildCloudReleaseEvidence({
      app: buildCloudApp(),
      catalogSource: "remote",
      sourceKind: "fetched_package",
      actualPackageHash: PACKAGE_HASH,
      actualManifestHash: MANIFEST_HASH,
      signaturePolicy: "required",
      packageVerificationStatus: "verified",
    });

    expect(evidence).toMatchObject({
      status: "blocked",
      signaturePolicy: "required",
      signatureVerificationStatus: "declared",
      blockerCodes: ["signature_unverified"],
      warningCodes: [],
    });
  });

  it("签名验证失败时必须阻断", () => {
    const evidence = buildCloudReleaseEvidence({
      app: buildCloudApp(),
      catalogSource: "remote",
      sourceKind: "fetched_package",
      actualPackageHash: PACKAGE_HASH,
      actualManifestHash: MANIFEST_HASH,
      signatureVerificationStatus: "failed",
      packageVerificationStatus: "verified",
    });

    expect(evidence).toMatchObject({
      status: "blocked",
      signatureVerificationStatus: "failed",
      blockerCodes: ["signature_verification_failed"],
      warningCodes: [],
    });
  });

  it.each([
    ["explicit_manifest" as const, "remote" as const],
    ["verified_cache" as const, "bootstrap" as const],
    ["fetched_package" as const, "remote" as const],
  ])("应投影 %s 获取来源和 %s catalog 来源", (sourceKind, catalogSource) => {
    const evidence = buildCloudReleaseEvidence({
      app: buildCloudApp(),
      catalogSource,
      sourceKind,
      actualPackageHash: PACKAGE_HASH,
      actualManifestHash: MANIFEST_HASH,
      signatureVerificationStatus: "verified",
      packageVerificationStatus: "verified",
    });

    expect(evidence).toMatchObject({
      status: "ready",
      catalogSource,
      sourceKind,
      declaredPackageHash: PACKAGE_HASH,
      declaredManifestHash: MANIFEST_HASH,
      actualPackageHash: PACKAGE_HASH,
      actualManifestHash: MANIFEST_HASH,
      signatureVerificationStatus: "verified",
      blockerCodes: [],
      warningCodes: [],
    });
  });

  it("显式 manifest 缺少实际 hash 时应标记为未本地验证", () => {
    const evidence = buildCloudReleaseEvidence({
      app: buildCloudApp(),
      catalogSource: "remote",
      sourceKind: "explicit_manifest",
      packageVerificationStatus: "verified",
    });

    expect(evidence).toMatchObject({
      status: "warning",
      packageHashMatched: null,
      manifestHashMatched: null,
      warningCodes: [
        "package_hash_unverified",
        "manifest_hash_unverified",
        "signature_unverified",
      ],
    });
  });

  it("应把 release evidence code 投影为稳定发布门禁 code", () => {
    const evidence = buildCloudReleaseEvidence({
      app: buildCloudApp(),
      catalogSource: "remote",
      sourceKind: "fetched_package",
      actualPackageHash:
        "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      actualManifestHash: MANIFEST_HASH,
      signaturePolicy: "required",
      packageVerificationStatus: "verified",
    });

    expect(listCloudReleaseEvidenceIssueCodes(evidence)).toEqual([
      "CLOUD_SIGNATURE_UNVERIFIED",
      "PACKAGE_HASH_MISMATCH",
    ]);
  });

  it("应聚合 ready 发布审计摘要", () => {
    const evidence = buildCloudReleaseEvidence({
      app: buildCloudApp(),
      catalogSource: "remote",
      sourceKind: "fetched_package",
      actualPackageHash: PACKAGE_HASH,
      actualManifestHash: MANIFEST_HASH,
      signatureVerificationStatus: "verified",
      packageVerificationStatus: "verified",
    });

    expect(buildCloudReleaseAuditSummary(evidence)).toEqual({
      status: "ready",
      canInstall: true,
      blockerCount: 0,
      warningCount: 0,
      issueCodes: [],
      checks: [
        { key: "packageHash", status: "passed", issueCodes: [] },
        { key: "manifestHash", status: "passed", issueCodes: [] },
        { key: "signature", status: "passed", issueCodes: [] },
        { key: "packageVerification", status: "passed", issueCodes: [] },
      ],
    });
  });

  it("应把 warning 发布审计聚合到对应审计项", () => {
    const evidence = buildCloudReleaseEvidence({
      app: buildCloudApp(),
      catalogSource: "remote",
      sourceKind: "explicit_manifest",
      packageVerificationStatus: "verified",
    });

    expect(buildCloudReleaseAuditSummary(evidence)).toMatchObject({
      status: "warning",
      canInstall: true,
      blockerCount: 0,
      warningCount: 3,
      issueCodes: [
        "MANIFEST_HASH_UNVERIFIED",
        "PACKAGE_HASH_UNVERIFIED",
        "CLOUD_SIGNATURE_UNVERIFIED",
      ].sort(),
      checks: [
        {
          key: "packageHash",
          status: "warning",
          issueCodes: ["PACKAGE_HASH_UNVERIFIED"],
        },
        {
          key: "manifestHash",
          status: "warning",
          issueCodes: ["MANIFEST_HASH_UNVERIFIED"],
        },
        {
          key: "signature",
          status: "warning",
          issueCodes: ["CLOUD_SIGNATURE_UNVERIFIED"],
        },
        {
          key: "packageVerification",
          status: "passed",
          issueCodes: [],
        },
      ],
    });
  });

  it("应把 blocked 发布审计聚合到阻断项", () => {
    const evidence = buildCloudReleaseEvidence({
      app: buildCloudApp(),
      catalogSource: "remote",
      sourceKind: "fetched_package",
      actualPackageHash:
        "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      actualManifestHash: MANIFEST_HASH,
      signaturePolicy: "required",
      packageVerificationStatus: "manifest_hash_mismatch",
    });

    expect(buildCloudReleaseAuditSummary(evidence)).toMatchObject({
      status: "blocked",
      canInstall: false,
      blockerCount: 3,
      warningCount: 0,
      issueCodes: [
        "CLOUD_SIGNATURE_UNVERIFIED",
        "PACKAGE_HASH_MISMATCH",
        "PACKAGE_VERIFICATION_FAILED",
      ],
      checks: [
        {
          key: "packageHash",
          status: "blocked",
          issueCodes: ["PACKAGE_HASH_MISMATCH"],
        },
        {
          key: "manifestHash",
          status: "passed",
          issueCodes: [],
        },
        {
          key: "signature",
          status: "blocked",
          issueCodes: ["CLOUD_SIGNATURE_UNVERIFIED"],
        },
        {
          key: "packageVerification",
          status: "blocked",
          issueCodes: ["PACKAGE_VERIFICATION_FAILED"],
        },
      ],
    });
  });

  it("应生成稳定的发布审计 Markdown 报告", () => {
    const evidence = buildCloudReleaseEvidence({
      app: buildCloudApp({
        appId: "content factory/app",
        version: "0.3.0-beta.1",
      }),
      catalogSource: "remote",
      sourceKind: "fetched_package",
      actualPackageHash:
        "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      actualManifestHash: MANIFEST_HASH,
      signaturePolicy: "required",
      packageVerificationStatus: "package_hash_mismatch",
    });

    const report = buildCloudReleaseAuditReport(evidence);

    expect(report.filename).toBe(
      "content-factory-app-0.3.0-beta.1-release-audit.md",
    );
    expect(report.markdown).toContain(
      "# Agent App Release Audit: content factory/app@0.3.0-beta.1",
    );
    expect(report.markdown).toContain("- Status: blocked");
    expect(report.markdown).toContain(
      "| packageHash | blocked | PACKAGE_HASH_MISMATCH |",
    );
    expect(report.markdown).toContain(
      "| signature | blocked | CLOUD_SIGNATURE_UNVERIFIED |",
    );
    expect(report.markdown).toContain(
      "- Package verification status: package_hash_mismatch",
    );
  });
});
