import { ClipboardCopy } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  buildCloudReleaseAuditReport,
  buildCloudReleaseAuditSummary,
  type PluginCloudReleaseAuditCheckStatus,
  type PluginCloudReleaseEvidence,
  type PluginCloudReleaseEvidenceStatus,
} from "../install/cloudReleaseEvidence";

type EvidenceCheckStatus =
  | "matched"
  | "verified"
  | "unverified"
  | "mismatch"
  | "failed"
  | "missing"
  | "declared";

type AgentTranslate = (key: string) => string;

const STATUS_CLASS: Record<PluginCloudReleaseEvidenceStatus, string> = {
  ready: "border-emerald-200 bg-emerald-50 text-emerald-700",
  warning: "border-amber-200 bg-amber-50 text-amber-700",
  blocked: "border-rose-200 bg-rose-50 text-rose-700",
};

const CHECK_CLASS: Record<EvidenceCheckStatus, string> = {
  matched: "border-emerald-200 bg-emerald-50 text-emerald-700",
  verified: "border-emerald-200 bg-emerald-50 text-emerald-700",
  declared: "border-sky-200 bg-sky-50 text-sky-700",
  unverified: "border-amber-200 bg-amber-50 text-amber-700",
  mismatch: "border-rose-200 bg-rose-50 text-rose-700",
  failed: "border-rose-200 bg-rose-50 text-rose-700",
  missing: "border-rose-200 bg-rose-50 text-rose-700",
};

const AUDIT_CHECK_CLASS: Record<PluginCloudReleaseAuditCheckStatus, string> = {
  passed: "border-emerald-200 bg-emerald-50 text-emerald-700",
  warning: "border-amber-200 bg-amber-50 text-amber-700",
  blocked: "border-rose-200 bg-rose-50 text-rose-700",
};

function resolveHashCheckStatus(
  declared: boolean,
  matched: boolean | null,
): EvidenceCheckStatus {
  if (!declared) {
    return "missing";
  }
  if (matched === true) {
    return "matched";
  }
  if (matched === false) {
    return "mismatch";
  }
  return "unverified";
}

function shortenHash(value: string | undefined): string {
  if (!value) {
    return "-";
  }
  if (value.length <= 22) {
    return value;
  }
  return `${value.slice(0, 16)}...${value.slice(-6)}`;
}

function resolveSignatureCheckStatus(
  evidence: PluginCloudReleaseEvidence,
): EvidenceCheckStatus {
  if (!evidence.signatureDeclared) {
    return "missing";
  }
  if (evidence.signatureVerificationStatus === "verified") {
    return "verified";
  }
  if (evidence.signatureVerificationStatus === "failed") {
    return "failed";
  }
  return "unverified";
}

export function PluginReleaseEvidenceSummary({
  evidence,
}: {
  evidence?: PluginCloudReleaseEvidence;
}) {
  const { t } = useTranslation("agent");
  const translate: AgentTranslate = (key) =>
    String((t as unknown as AgentTranslate)(key));
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">(
    "idle",
  );

  if (!evidence) {
    return null;
  }

  const packageCheckStatus = resolveHashCheckStatus(
    evidence.packageHashDeclared,
    evidence.packageHashMatched,
  );
  const manifestCheckStatus = resolveHashCheckStatus(
    evidence.manifestHashDeclared,
    evidence.manifestHashMatched,
  );
  const signatureCheckStatus = resolveSignatureCheckStatus(evidence);
  const auditSummary = buildCloudReleaseAuditSummary(evidence);
  const auditReport = buildCloudReleaseAuditReport(evidence);
  const rows: Array<{
    key: string;
    labelKey: string;
    status: EvidenceCheckStatus;
    value: string;
    title?: string;
  }> = [
    {
      key: "package",
      labelKey: "plugin.apps.installReview.releaseEvidence.check.packageHash",
      status: packageCheckStatus,
      value: shortenHash(evidence.declaredPackageHash),
      title: evidence.declaredPackageHash,
    },
    {
      key: "manifest",
      labelKey: "plugin.apps.installReview.releaseEvidence.check.manifestHash",
      status: manifestCheckStatus,
      value: shortenHash(evidence.declaredManifestHash),
      title: evidence.declaredManifestHash,
    },
    {
      key: "signature",
      labelKey: "plugin.apps.installReview.releaseEvidence.check.signature",
      status: signatureCheckStatus,
      value: evidence.signatureRef
        ? shortenHash(evidence.signatureRef)
        : t("plugin.apps.installReview.releaseEvidence.emptyValue"),
      title: evidence.signatureRef,
    },
  ];
  const handleCopyReport = async () => {
    try {
      await navigator.clipboard.writeText(auditReport.markdown);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  };

  return (
    <div
      className="mt-4 rounded-lg border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] p-4"
      data-catalog-source={evidence.catalogSource}
      data-source-kind={evidence.sourceKind}
      data-testid="plugins-install-review-release-evidence"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[color:var(--lime-text-strong)]">
            {t("plugin.apps.installReview.releaseEvidence.title")}
          </p>
          <p className="mt-1 text-xs leading-5 text-[color:var(--lime-text-muted)]">
            {t("plugin.apps.installReview.releaseEvidence.sourceLine", {
              catalog: t(
                `plugin.apps.installReview.releaseEvidence.catalogSource.${evidence.catalogSource}`,
              ),
              source: t(
                `plugin.apps.installReview.releaseEvidence.sourceKind.${evidence.sourceKind}`,
              ),
            })}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full border px-2 py-1 text-xs font-medium ${STATUS_CLASS[evidence.status]}`}
          data-testid="plugins-install-review-release-evidence-status"
        >
          {t(
            `plugin.apps.installReview.releaseEvidence.status.${evidence.status}`,
          )}
        </span>
      </div>
      <dl className="mt-3 divide-y divide-[color:var(--lime-surface-border)] text-sm">
        {rows.map((row) => (
          <div
            key={row.key}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-2"
            data-testid={`plugins-install-review-release-evidence-${row.key}`}
          >
            <dt className="min-w-0">
              <span className="block text-xs font-medium text-[color:var(--lime-text-muted)]">
                {translate(row.labelKey)}
              </span>
              <span
                className="mt-0.5 block break-all text-xs text-[color:var(--lime-text)]"
                title={row.title}
              >
                {row.value}
              </span>
            </dt>
            <dd
              className={`rounded-full border px-2 py-1 text-xs font-medium ${CHECK_CLASS[row.status]}`}
            >
              {t(
                `plugin.apps.installReview.releaseEvidence.checkStatus.${row.status}`,
              )}
            </dd>
          </div>
        ))}
      </dl>
      <div
        className="mt-3 rounded-md border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface-muted)] px-3 py-2"
        data-can-install={String(auditSummary.canInstall)}
        data-testid="plugins-install-review-release-audit-summary"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-semibold text-[color:var(--lime-text-strong)]">
            {t("plugin.apps.installReview.releaseEvidence.audit.title")}
          </span>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <span className="text-xs text-[color:var(--lime-text-muted)]">
              {t("plugin.apps.installReview.releaseEvidence.audit.counts", {
                blockers: auditSummary.blockerCount,
                warnings: auditSummary.warningCount,
              })}
            </span>
            <button
              type="button"
              className="inline-flex h-7 items-center gap-1.5 rounded-md border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] px-2 text-xs font-medium text-[color:var(--lime-text)] transition hover:bg-[color:var(--lime-surface-hover)]"
              data-report-filename={auditReport.filename}
              data-testid="plugins-install-review-release-audit-copy"
              onClick={() => void handleCopyReport()}
              title={t(
                "plugin.apps.installReview.releaseEvidence.audit.copyTitle",
              )}
            >
              <ClipboardCopy size={13} />
              {t("plugin.apps.installReview.releaseEvidence.audit.copy")}
            </button>
          </div>
        </div>
        {copyState !== "idle" ? (
          <p
            className="mt-2 text-xs text-[color:var(--lime-text-muted)]"
            data-testid="plugins-install-review-release-audit-copy-state"
          >
            {t(
              `plugin.apps.installReview.releaseEvidence.audit.copyState.${copyState}`,
            )}
          </p>
        ) : null}
        <div className="mt-2 flex flex-wrap gap-1.5">
          {auditSummary.checks.map((check) => (
            <span
              key={check.key}
              className={`rounded-full border px-2 py-1 text-xs font-medium ${AUDIT_CHECK_CLASS[check.status]}`}
              data-issue-codes={check.issueCodes.join(",")}
              data-testid={`plugins-install-review-release-audit-${check.key}`}
              title={check.issueCodes.join(", ")}
            >
              {t(
                `plugin.apps.installReview.releaseEvidence.audit.check.${check.key}`,
              )}
              <span className="ml-1 opacity-80">
                {t(
                  `plugin.apps.installReview.releaseEvidence.audit.checkStatus.${check.status}`,
                )}
              </span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
