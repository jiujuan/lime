import type { CloudBootstrapApp } from "../types";

export type AgentAppCloudReleaseEvidenceSourceKind =
  | "explicit_manifest"
  | "verified_cache"
  | "fetched_package"
  | "unknown";

export type AgentAppCloudReleaseEvidenceCatalogSource =
  | "remote"
  | "bootstrap"
  | "seeded"
  | "unknown";

export type AgentAppCloudReleaseEvidenceStatus =
  | "ready"
  | "warning"
  | "blocked";

export type AgentAppCloudReleaseEvidenceBlockerCode =
  | "package_hash_missing"
  | "manifest_hash_missing"
  | "package_hash_mismatch"
  | "manifest_hash_mismatch"
  | "package_verification_failed"
  | "signature_missing"
  | "signature_unverified"
  | "signature_verification_failed";

export type AgentAppCloudReleaseEvidenceWarningCode =
  | "package_hash_unverified"
  | "manifest_hash_unverified"
  | "signature_missing"
  | "signature_unverified";

export type AgentAppCloudReleaseSignaturePolicy = "optional" | "required";

export type AgentAppCloudReleaseSignatureVerificationStatus =
  | "not_configured"
  | "declared"
  | "verified"
  | "failed";

export interface AgentAppCloudReleaseEvidence {
  appId: string;
  version: string;
  catalogSource: AgentAppCloudReleaseEvidenceCatalogSource;
  sourceKind: AgentAppCloudReleaseEvidenceSourceKind;
  packageHashDeclared: boolean;
  manifestHashDeclared: boolean;
  signatureDeclared: boolean;
  declaredPackageHash?: string;
  declaredManifestHash?: string;
  actualPackageHash?: string;
  actualManifestHash?: string;
  packageHashMatched: boolean | null;
  manifestHashMatched: boolean | null;
  signatureRef?: string;
  signaturePolicy: AgentAppCloudReleaseSignaturePolicy;
  signatureVerificationStatus: AgentAppCloudReleaseSignatureVerificationStatus;
  packageVerificationStatus?: string;
  status: AgentAppCloudReleaseEvidenceStatus;
  blockerCodes: AgentAppCloudReleaseEvidenceBlockerCode[];
  warningCodes: AgentAppCloudReleaseEvidenceWarningCode[];
}

export type AgentAppCloudReleaseAuditCheckKey =
  | "packageHash"
  | "manifestHash"
  | "signature"
  | "packageVerification";

export type AgentAppCloudReleaseAuditCheckStatus =
  | "passed"
  | "warning"
  | "blocked";

export interface AgentAppCloudReleaseAuditCheck {
  key: AgentAppCloudReleaseAuditCheckKey;
  status: AgentAppCloudReleaseAuditCheckStatus;
  issueCodes: AgentAppCloudReleaseEvidenceIssueCode[];
}

export interface AgentAppCloudReleaseAuditSummary {
  status: AgentAppCloudReleaseEvidenceStatus;
  canInstall: boolean;
  blockerCount: number;
  warningCount: number;
  issueCodes: AgentAppCloudReleaseEvidenceIssueCode[];
  checks: AgentAppCloudReleaseAuditCheck[];
}

export interface AgentAppCloudReleaseAuditReport {
  filename: string;
  markdown: string;
}

export type AgentAppCloudReleaseEvidenceIssueCode =
  | "PACKAGE_HASH_MISSING"
  | "MANIFEST_HASH_MISSING"
  | "PACKAGE_HASH_MISMATCH"
  | "MANIFEST_HASH_MISMATCH"
  | "PACKAGE_VERIFICATION_FAILED"
  | "PACKAGE_HASH_UNVERIFIED"
  | "MANIFEST_HASH_UNVERIFIED"
  | "CLOUD_SIGNATURE_MISSING"
  | "CLOUD_SIGNATURE_UNVERIFIED"
  | "CLOUD_SIGNATURE_VERIFICATION_FAILED";

export interface BuildCloudReleaseEvidenceParams {
  app: CloudBootstrapApp;
  catalogSource?: AgentAppCloudReleaseEvidenceCatalogSource;
  sourceKind?: AgentAppCloudReleaseEvidenceSourceKind;
  actualPackageHash?: string;
  actualManifestHash?: string;
  signaturePolicy?: AgentAppCloudReleaseSignaturePolicy;
  signatureVerificationStatus?: AgentAppCloudReleaseSignatureVerificationStatus;
  packageVerificationStatus?: string;
}

function normalizeOptionalString(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}

function normalizeHash(value: string | undefined): string | undefined {
  return normalizeOptionalString(value)?.toLowerCase();
}

function compareHash(
  declaredHash: string | undefined,
  actualHash: string | undefined,
): boolean | null {
  if (!declaredHash || !actualHash) {
    return null;
  }
  return normalizeHash(declaredHash) === normalizeHash(actualHash);
}

function pushIfMissing<T extends string>(items: T[], item: T): void {
  if (!items.includes(item)) {
    items.push(item);
  }
}

const RELEASE_EVIDENCE_BLOCKER_ISSUE_CODE_BY_CODE: Record<
  AgentAppCloudReleaseEvidenceBlockerCode,
  AgentAppCloudReleaseEvidenceIssueCode
> = {
  package_hash_missing: "PACKAGE_HASH_MISSING",
  manifest_hash_missing: "MANIFEST_HASH_MISSING",
  package_hash_mismatch: "PACKAGE_HASH_MISMATCH",
  manifest_hash_mismatch: "MANIFEST_HASH_MISMATCH",
  package_verification_failed: "PACKAGE_VERIFICATION_FAILED",
  signature_missing: "CLOUD_SIGNATURE_MISSING",
  signature_unverified: "CLOUD_SIGNATURE_UNVERIFIED",
  signature_verification_failed: "CLOUD_SIGNATURE_VERIFICATION_FAILED",
};

const RELEASE_EVIDENCE_WARNING_ISSUE_CODE_BY_CODE: Record<
  AgentAppCloudReleaseEvidenceWarningCode,
  AgentAppCloudReleaseEvidenceIssueCode
> = {
  package_hash_unverified: "PACKAGE_HASH_UNVERIFIED",
  manifest_hash_unverified: "MANIFEST_HASH_UNVERIFIED",
  signature_missing: "CLOUD_SIGNATURE_MISSING",
  signature_unverified: "CLOUD_SIGNATURE_UNVERIFIED",
};

const RELEASE_AUDIT_ISSUE_CODES_BY_CHECK: Record<
  AgentAppCloudReleaseAuditCheckKey,
  AgentAppCloudReleaseEvidenceIssueCode[]
> = {
  packageHash: [
    "PACKAGE_HASH_MISSING",
    "PACKAGE_HASH_MISMATCH",
    "PACKAGE_HASH_UNVERIFIED",
  ],
  manifestHash: [
    "MANIFEST_HASH_MISSING",
    "MANIFEST_HASH_MISMATCH",
    "MANIFEST_HASH_UNVERIFIED",
  ],
  signature: [
    "CLOUD_SIGNATURE_MISSING",
    "CLOUD_SIGNATURE_UNVERIFIED",
    "CLOUD_SIGNATURE_VERIFICATION_FAILED",
  ],
  packageVerification: ["PACKAGE_VERIFICATION_FAILED"],
};

export function listCloudReleaseEvidenceIssueCodes(
  evidence: AgentAppCloudReleaseEvidence | undefined,
): AgentAppCloudReleaseEvidenceIssueCode[] {
  if (!evidence) {
    return [];
  }
  const issueCodes = [
    ...evidence.blockerCodes.map(
      (code) => RELEASE_EVIDENCE_BLOCKER_ISSUE_CODE_BY_CODE[code],
    ),
    ...evidence.warningCodes.map(
      (code) => RELEASE_EVIDENCE_WARNING_ISSUE_CODE_BY_CODE[code],
    ),
  ];
  return Array.from(new Set(issueCodes)).sort();
}

function listCloudReleaseEvidenceBlockerIssueCodes(
  evidence: AgentAppCloudReleaseEvidence,
): AgentAppCloudReleaseEvidenceIssueCode[] {
  return Array.from(
    new Set(
      evidence.blockerCodes.map(
        (code) => RELEASE_EVIDENCE_BLOCKER_ISSUE_CODE_BY_CODE[code],
      ),
    ),
  ).sort();
}

function listCloudReleaseEvidenceWarningIssueCodes(
  evidence: AgentAppCloudReleaseEvidence,
): AgentAppCloudReleaseEvidenceIssueCode[] {
  return Array.from(
    new Set(
      evidence.warningCodes.map(
        (code) => RELEASE_EVIDENCE_WARNING_ISSUE_CODE_BY_CODE[code],
      ),
    ),
  ).sort();
}

function buildCloudReleaseAuditCheck(params: {
  key: AgentAppCloudReleaseAuditCheckKey;
  blockerIssueCodes: AgentAppCloudReleaseEvidenceIssueCode[];
  warningIssueCodes: AgentAppCloudReleaseEvidenceIssueCode[];
}): AgentAppCloudReleaseAuditCheck {
  const checkIssueCodes = RELEASE_AUDIT_ISSUE_CODES_BY_CHECK[params.key];
  const blockerIssueCodes = params.blockerIssueCodes.filter((code) =>
    checkIssueCodes.includes(code),
  );
  const warningIssueCodes = params.warningIssueCodes.filter((code) =>
    checkIssueCodes.includes(code),
  );
  const issueCodes = [...blockerIssueCodes, ...warningIssueCodes];

  return {
    key: params.key,
    status:
      blockerIssueCodes.length > 0
        ? "blocked"
        : warningIssueCodes.length > 0
          ? "warning"
          : "passed",
    issueCodes,
  };
}

export function buildCloudReleaseAuditSummary(
  evidence: AgentAppCloudReleaseEvidence,
): AgentAppCloudReleaseAuditSummary {
  const blockerIssueCodes = listCloudReleaseEvidenceBlockerIssueCodes(evidence);
  const warningIssueCodes = listCloudReleaseEvidenceWarningIssueCodes(evidence);
  const checks: AgentAppCloudReleaseAuditCheck[] = [
    buildCloudReleaseAuditCheck({
      key: "packageHash",
      blockerIssueCodes,
      warningIssueCodes,
    }),
    buildCloudReleaseAuditCheck({
      key: "manifestHash",
      blockerIssueCodes,
      warningIssueCodes,
    }),
    buildCloudReleaseAuditCheck({
      key: "signature",
      blockerIssueCodes,
      warningIssueCodes,
    }),
    buildCloudReleaseAuditCheck({
      key: "packageVerification",
      blockerIssueCodes,
      warningIssueCodes,
    }),
  ];

  return {
    status: evidence.status,
    canInstall: evidence.status !== "blocked",
    blockerCount: blockerIssueCodes.length,
    warningCount: warningIssueCodes.length,
    issueCodes: [...blockerIssueCodes, ...warningIssueCodes],
    checks,
  };
}

function formatReportValue(value: string | number | boolean | undefined): string {
  if (value === undefined) {
    return "n/a";
  }
  return String(value);
}

function formatReportIssueCodes(
  issueCodes: readonly AgentAppCloudReleaseEvidenceIssueCode[],
): string {
  return issueCodes.length > 0 ? issueCodes.join(", ") : "none";
}

function sanitizeReportFilenameSegment(value: string): string {
  const normalized = value.trim().toLowerCase();
  return normalized
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function buildCloudReleaseAuditReport(
  evidence: AgentAppCloudReleaseEvidence,
): AgentAppCloudReleaseAuditReport {
  const auditSummary = buildCloudReleaseAuditSummary(evidence);
  const appSegment = sanitizeReportFilenameSegment(evidence.appId) || "agent-app";
  const versionSegment =
    sanitizeReportFilenameSegment(evidence.version) || "unknown-version";
  const lines = [
    `# Agent App Release Audit: ${evidence.appId}@${evidence.version}`,
    "",
    "## Summary",
    "",
    `- Status: ${auditSummary.status}`,
    `- Can install: ${auditSummary.canInstall}`,
    `- Catalog source: ${evidence.catalogSource}`,
    `- Package source: ${evidence.sourceKind}`,
    `- Blockers: ${auditSummary.blockerCount}`,
    `- Warnings: ${auditSummary.warningCount}`,
    `- Issue codes: ${formatReportIssueCodes(auditSummary.issueCodes)}`,
    "",
    "## Checks",
    "",
    "| Check | Status | Issue codes |",
    "| --- | --- | --- |",
    ...auditSummary.checks.map(
      (check) =>
        `| ${check.key} | ${check.status} | ${formatReportIssueCodes(
          check.issueCodes,
        )} |`,
    ),
    "",
    "## Evidence",
    "",
    `- Declared package hash: ${formatReportValue(
      evidence.declaredPackageHash,
    )}`,
    `- Actual package hash: ${formatReportValue(evidence.actualPackageHash)}`,
    `- Package hash matched: ${formatReportValue(
      evidence.packageHashMatched ?? undefined,
    )}`,
    `- Declared manifest hash: ${formatReportValue(
      evidence.declaredManifestHash,
    )}`,
    `- Actual manifest hash: ${formatReportValue(evidence.actualManifestHash)}`,
    `- Manifest hash matched: ${formatReportValue(
      evidence.manifestHashMatched ?? undefined,
    )}`,
    `- Signature ref: ${formatReportValue(evidence.signatureRef)}`,
    `- Signature policy: ${evidence.signaturePolicy}`,
    `- Signature status: ${evidence.signatureVerificationStatus}`,
    `- Package verification status: ${formatReportValue(
      evidence.packageVerificationStatus,
    )}`,
    "",
  ];

  return {
    filename: `${appSegment}-${versionSegment}-release-audit.md`,
    markdown: lines.join("\n"),
  };
}

export function buildCloudReleaseEvidence({
  app,
  catalogSource = "unknown",
  sourceKind = "unknown",
  actualPackageHash,
  actualManifestHash,
  signaturePolicy = "optional",
  signatureVerificationStatus,
  packageVerificationStatus,
}: BuildCloudReleaseEvidenceParams): AgentAppCloudReleaseEvidence {
  const declaredPackageHash = normalizeOptionalString(app.packageHash);
  const declaredManifestHash = normalizeOptionalString(app.manifestHash);
  const normalizedActualPackageHash = normalizeOptionalString(actualPackageHash);
  const normalizedActualManifestHash = normalizeOptionalString(actualManifestHash);
  const signatureRef = normalizeOptionalString(app.signatureRef);
  const packageHashMatched = compareHash(
    declaredPackageHash,
    normalizedActualPackageHash,
  );
  const manifestHashMatched = compareHash(
    declaredManifestHash,
    normalizedActualManifestHash,
  );
  const blockerCodes: AgentAppCloudReleaseEvidenceBlockerCode[] = [];
  const warningCodes: AgentAppCloudReleaseEvidenceWarningCode[] = [];

  if (!declaredPackageHash) {
    pushIfMissing(blockerCodes, "package_hash_missing");
  } else if (!normalizedActualPackageHash) {
    pushIfMissing(warningCodes, "package_hash_unverified");
  } else if (packageHashMatched === false) {
    pushIfMissing(blockerCodes, "package_hash_mismatch");
  }

  if (!declaredManifestHash) {
    pushIfMissing(blockerCodes, "manifest_hash_missing");
  } else if (!normalizedActualManifestHash) {
    pushIfMissing(warningCodes, "manifest_hash_unverified");
  } else if (manifestHashMatched === false) {
    pushIfMissing(blockerCodes, "manifest_hash_mismatch");
  }

  const normalizedSignatureVerificationStatus =
    signatureVerificationStatus ??
    (signatureRef ? "declared" : "not_configured");

  if (!signatureRef) {
    if (signaturePolicy === "required") {
      pushIfMissing(blockerCodes, "signature_missing");
    } else {
      pushIfMissing(warningCodes, "signature_missing");
    }
  } else if (normalizedSignatureVerificationStatus === "failed") {
    pushIfMissing(blockerCodes, "signature_verification_failed");
  } else if (normalizedSignatureVerificationStatus !== "verified") {
    if (signaturePolicy === "required") {
      pushIfMissing(blockerCodes, "signature_unverified");
    } else {
      pushIfMissing(warningCodes, "signature_unverified");
    }
  }

  if (
    packageVerificationStatus &&
    packageVerificationStatus !== "verified"
  ) {
    pushIfMissing(blockerCodes, "package_verification_failed");
  }

  return {
    appId: app.appId,
    version: app.version,
    catalogSource,
    sourceKind,
    packageHashDeclared: Boolean(declaredPackageHash),
    manifestHashDeclared: Boolean(declaredManifestHash),
    signatureDeclared: Boolean(signatureRef),
    declaredPackageHash,
    declaredManifestHash,
    actualPackageHash: normalizedActualPackageHash,
    actualManifestHash: normalizedActualManifestHash,
    packageHashMatched,
    manifestHashMatched,
    signatureRef,
    signaturePolicy,
    signatureVerificationStatus: normalizedSignatureVerificationStatus,
    packageVerificationStatus,
    status:
      blockerCodes.length > 0
        ? "blocked"
        : warningCodes.length > 0
          ? "warning"
          : "ready",
    blockerCodes,
    warningCodes,
  };
}
