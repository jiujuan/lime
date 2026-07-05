import { useMemo, useState, type ChangeEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  CheckCircle2,
  FolderOpen,
  KeyRound,
  Send,
  UploadCloud,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  exportLocalPluginPackage,
  reviewLocalPluginPackage,
  selectLocalPluginDirectory,
  type PluginLocalPackageExport,
  type PluginInstallReviewResult,
} from "@/lib/api/plugins";
import {
  completeClientPluginPackageUploadSession,
  createClientPluginPackageUploadSession,
  createClientPluginReleaseSubmission,
  listClientPluginReleaseSubmissions,
  preflightClientPluginReleaseSubmission,
  summarizePluginPublishPreflight,
  uploadClientPluginPackageContent,
  type BulkPublishPluginPreflightResponse,
  type CompletePluginPackageUploadSessionResponse,
  type PluginPackageScanReport,
  type PluginReleaseSubmission,
  type PluginPackageUploadSession,
  type UploadPluginPackageContentResponse,
} from "@/lib/api/oemCloudPluginPublish";
import { resolveOemCloudRuntimeContext } from "@/lib/api/oemCloudRuntime";
import type { HostCapabilityProfile } from "../types";
import {
  buildBulkPublishPluginPayload,
  buildPluginPublishStageState,
  createDefaultPluginPublishDraft,
  validatePluginPublishDraft,
  type PluginPublishDraft,
  type PluginPublishDraftBlocker,
  type PluginPublishPackageArtifact,
} from "./pluginPublishWorkbenchViewModel";
import { PluginPublishPreflightPlan } from "./PluginPublishPreflightPlan";
import { PluginReleaseSubmissionStatusPanel } from "./PluginReleaseSubmissionStatusPanel";

type PluginPublishBusyState = "select" | "upload" | "preflight" | "submit";

type PluginPublishPackageUploadState = PluginPublishPackageArtifact & {
  uploadSessionId: string;
  status: "verified" | "rejected" | "expired" | "uploaded" | "created";
  sizeBytes: number;
  fileCount: number;
  evidenceRef?: string;
  blockers: PluginPackageScanReport["blockers"];
  warnings: PluginPackageScanReport["warnings"];
};

export interface PluginPublishWorkbenchProps {
  profile?: HostCapabilityProfile;
  onClose?: () => void;
  onSubmissionCreated?: (submission: PluginReleaseSubmission) => void;
  deps?: {
    selectLocalPluginDirectory?: typeof selectLocalPluginDirectory;
    reviewLocalPluginPackage?: typeof reviewLocalPluginPackage;
    exportLocalPluginPackage?: typeof exportLocalPluginPackage;
    createClientPluginPackageUploadSession?: typeof createClientPluginPackageUploadSession;
    uploadClientPluginPackageContent?: typeof uploadClientPluginPackageContent;
    completeClientPluginPackageUploadSession?: typeof completeClientPluginPackageUploadSession;
    preflightClientPluginReleaseSubmission?: typeof preflightClientPluginReleaseSubmission;
    createClientPluginReleaseSubmission?: typeof createClientPluginReleaseSubmission;
    listClientPluginReleaseSubmissions?: typeof listClientPluginReleaseSubmissions;
    resolveTenantId?: () => string | undefined;
    now?: () => Date;
  };
}

function statusTone(active: boolean): string {
  return active
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : "border-slate-200 bg-slate-50 text-slate-600";
}

function issueTone(severity: "blocker" | "warning"): string {
  return severity === "warning"
    ? "border-amber-200 bg-amber-50 text-amber-700"
    : "border-rose-200 bg-rose-50 text-rose-700";
}

function defaultTenantId(): string | undefined {
  return resolveOemCloudRuntimeContext()?.tenantId;
}

function buildDraftWithRuntimeTenant(
  deps: PluginPublishWorkbenchProps["deps"],
): PluginPublishDraft {
  return createDefaultPluginPublishDraft({
    tenantId: deps?.resolveTenantId?.() ?? defaultTenantId(),
    signedAt: (deps?.now?.() ?? new Date()).toISOString(),
  });
}

function buildPackageUploadState(
  exported: PluginLocalPackageExport,
  session: PluginPackageUploadSession,
  completed: CompletePluginPackageUploadSessionResponse,
): PluginPublishPackageUploadState {
  return {
    uploadSessionId: session.id,
    packageUrl: completed.session.packageUrl ?? "",
    packageHash: completed.scanReport.packageHash || exported.packageHash,
    manifestHash: completed.scanReport.manifestHash || exported.manifestHash,
    status: completed.session.status,
    sizeBytes: completed.scanReport.sizeBytes || session.sizeBytes,
    fileCount: completed.scanReport.fileCount || exported.fileCount,
    evidenceRef: completed.scanReport.evidenceRef,
    blockers: completed.scanReport.blockers,
    warnings: completed.scanReport.warnings,
  };
}

export function PluginPublishWorkbench({
  profile,
  onClose,
  onSubmissionCreated,
  deps,
}: PluginPublishWorkbenchProps) {
  const { t } = useTranslation("agent");
  const [review, setReview] = useState<PluginInstallReviewResult | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [draft, setDraft] = useState<PluginPublishDraft>(() =>
    buildDraftWithRuntimeTenant(deps),
  );
  const [preflight, setPreflight] =
    useState<BulkPublishPluginPreflightResponse | null>(null);
  const [submissionResult, setSubmissionResult] =
    useState<PluginReleaseSubmission | null>(null);
  const [packageUpload, setPackageUpload] =
    useState<PluginPublishPackageUploadState | null>(null);
  const [busy, setBusy] = useState<PluginPublishBusyState | null>(null);

  const packageArtifact =
    packageUpload?.status === "verified" && packageUpload.packageUrl
      ? packageUpload
      : null;

  const blockers = useMemo(
    () => validatePluginPublishDraft({ review, draft, packageArtifact }),
    [draft, packageArtifact, review],
  );
  const stages = useMemo(
    () =>
      buildPluginPublishStageState({
        review,
        draft,
        preflight,
        packageArtifact,
      }),
    [draft, packageArtifact, preflight, review],
  );
  const preflightSummary = preflight
    ? summarizePluginPublishPreflight(preflight)
    : null;
  const packageTitle =
    review?.state.manifest.displayName ?? review?.state.appId;
  const canUpload =
    Boolean(
      review &&
      selectedPath &&
      draft.targetTenantId.trim() &&
      draft.marketplaceName.trim(),
    ) && !busy;
  const canPreflight = blockers.length === 0 && !busy;
  const canSubmit = blockers.length === 0 && preflight?.valid === true && !busy;

  function updateDraft<K extends keyof PluginPublishDraft>(
    key: K,
    value: PluginPublishDraft[K],
  ) {
    setDraft((current) => ({ ...current, [key]: value }));
    if (key === "packageUrl") {
      setPackageUpload(null);
    }
    setPreflight(null);
    setSubmissionResult(null);
  }

  function handleTextChange(key: keyof PluginPublishDraft) {
    return (
      event: ChangeEvent<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >,
    ) => {
      updateDraft(key, event.currentTarget.value as never);
    };
  }

  async function handleSelectPackage() {
    setBusy("select");
    try {
      const selectDirectory =
        deps?.selectLocalPluginDirectory ?? selectLocalPluginDirectory;
      const reviewPackage =
        deps?.reviewLocalPluginPackage ?? reviewLocalPluginPackage;
      const appDir = await selectDirectory({
        title: t("plugin.publish.local.dialogTitle"),
      });
      if (!appDir) {
        return;
      }
      const nextReview = await reviewPackage({ appDir, profile });
      setSelectedPath(appDir);
      setReview(nextReview);
      setPackageUpload(null);
      setPreflight(null);
      setSubmissionResult(null);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("plugin.publish.toast.packageFailed"),
      );
    } finally {
      setBusy(null);
    }
  }

  async function handleUploadPackage() {
    if (!review || !selectedPath) {
      return;
    }
    setBusy("upload");
    try {
      const exportPackage =
        deps?.exportLocalPluginPackage ?? exportLocalPluginPackage;
      const createUploadSession =
        deps?.createClientPluginPackageUploadSession ??
        createClientPluginPackageUploadSession;
      const uploadContent =
        deps?.uploadClientPluginPackageContent ??
        uploadClientPluginPackageContent;
      const completeUploadSession =
        deps?.completeClientPluginPackageUploadSession ??
        completeClientPluginPackageUploadSession;
      const exported = await exportPackage({ appDir: selectedPath });
      const session = await createUploadSession({
        tenantId: draft.targetTenantId.trim(),
        pluginName: review.state.manifest.appId,
        marketplaceName: draft.marketplaceName.trim(),
        version: review.state.manifest.version,
        expectedPackageHash: exported.packageHash,
        expectedManifestHash: exported.manifestHash,
        sizeBytes: exported.sizeBytes,
        contentType: exported.contentType,
      });
      await uploadContent({
        tenantId: draft.targetTenantId.trim(),
        sessionId: session.id,
        uploadUrl: session.uploadUrl,
        contentBase64: exported.packageBase64,
        contentType: exported.contentType,
      });
      const completed = await completeUploadSession({
        tenantId: draft.targetTenantId.trim(),
        sessionId: session.id,
      });
      const nextUpload = buildPackageUploadState(exported, session, completed);
      setPackageUpload(nextUpload);
      setPreflight(null);
      setSubmissionResult(null);
      if (nextUpload.status !== "verified" || !nextUpload.packageUrl) {
        toast.error(t("plugin.publish.toast.uploadBlocked"));
        return;
      }
      setDraft((current) => ({
        ...current,
        packageUrl: nextUpload.packageUrl,
      }));
      toast.success(t("plugin.publish.toast.uploadSucceeded"));
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("plugin.publish.toast.uploadFailed"),
      );
    } finally {
      setBusy(null);
    }
  }

  async function handleSubmit() {
    if (
      !review ||
      !packageUpload?.uploadSessionId ||
      preflight?.valid !== true
    ) {
      return;
    }
    const payload = buildBulkPublishPluginPayload({
      review,
      draft,
      packageArtifact,
    });
    setBusy("submit");
    try {
      const createSubmission =
        deps?.createClientPluginReleaseSubmission ??
        createClientPluginReleaseSubmission;
      const result = await createSubmission({
        tenantId: draft.targetTenantId.trim(),
        uploadSessionId: packageUpload.uploadSessionId,
        payload,
      });
      setSubmissionResult(result);
      setPreflight(result.preflight ?? null);
      setDraft((current) => ({ ...current, registrationCode: "" }));
      toast.success(t("plugin.publish.toast.publishSucceeded"));
      try {
        onSubmissionCreated?.(result);
      } catch (callbackError) {
        console.warn(
          "[plugins] publish submission callback failed",
          callbackError,
        );
      }
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("plugin.publish.toast.publishFailed"),
      );
    } finally {
      setBusy(null);
    }
  }

  async function handlePreflight() {
    if (!review || !packageUpload?.uploadSessionId) {
      return;
    }
    const payload = buildBulkPublishPluginPayload({
      review,
      draft,
      packageArtifact,
    });
    setBusy("preflight");
    try {
      const preflightSubmission =
        deps?.preflightClientPluginReleaseSubmission ??
        preflightClientPluginReleaseSubmission;
      const result = await preflightSubmission({
        tenantId: draft.targetTenantId.trim(),
        uploadSessionId: packageUpload.uploadSessionId,
        payload,
      });
      setPreflight(result);
      setSubmissionResult(null);
      if (result.valid) {
        toast.success(t("plugin.publish.toast.preflightPassed"));
      } else {
        toast.error(t("plugin.publish.toast.preflightBlocked"));
      }
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("plugin.publish.toast.preflightFailed"),
      );
    } finally {
      setBusy(null);
    }
  }

  function renderBlockers(items: PluginPublishDraftBlocker[]) {
    if (items.length === 0) {
      return null;
    }
    return (
      <div
        className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
        data-testid="plugin-publish-local-blockers"
      >
        <div className="flex items-center gap-2 font-semibold">
          <AlertTriangle size={16} />
          {t("plugin.publish.blockers.title", { count: items.length })}
        </div>
        <ul className="mt-2 space-y-1">
          {items.map((item) => (
            <li key={`${item.code}:${item.field}`}>
              {t(`plugin.publish.blockers.${item.code}`)}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <section
      className="rounded-[18px] border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] p-5 shadow-sm shadow-slate-950/5"
      data-testid="plugin-publish-workbench"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">
            <UploadCloud size={14} />
            {t("plugin.publish.eyebrow")}
          </div>
          <h2 className="mt-3 text-xl font-semibold text-[color:var(--lime-text-strong)]">
            {t("plugin.publish.title")}
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[color:var(--lime-text-muted)]">
            {t("plugin.publish.description")}
          </p>
        </div>
        {onClose ? (
          <button
            type="button"
            className="inline-flex size-9 items-center justify-center rounded-full border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] text-[color:var(--lime-text-muted)] transition hover:bg-[color:var(--lime-surface-hover)]"
            onClick={onClose}
            aria-label={t("plugin.publish.close")}
            data-testid="plugin-publish-close"
          >
            <X size={16} />
          </button>
        ) : null}
      </div>

      <div className="mt-5 grid gap-2 md:grid-cols-5">
        {[
          ["packageSelected", "package"],
          ["releaseReady", "release"],
          ["signatureReady", "signature"],
          ["targetReady", "target"],
          ["preflightPassed", "preflight"],
        ].map(([stateKey, labelKey]) => {
          const active = Boolean(stages[stateKey as keyof typeof stages]);
          return (
            <div
              key={labelKey}
              className={`rounded-xl border px-3 py-2 text-xs font-semibold ${statusTone(
                active,
              )}`}
              data-testid={`plugin-publish-stage-${labelKey}`}
            >
              {t(`plugin.publish.stage.${labelKey}`)}
            </div>
          );
        })}
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="rounded-2xl border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface-soft)] p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-[color:var(--lime-text-strong)]">
                {t("plugin.publish.local.title")}
              </h3>
              <p className="mt-1 text-xs leading-5 text-[color:var(--lime-text-muted)]">
                {t("plugin.publish.local.description")}
              </p>
            </div>
            <button
              type="button"
              className="inline-flex h-9 items-center gap-2 rounded-full bg-[color:var(--lime-text-strong)] px-4 text-sm font-semibold text-[color:var(--lime-surface)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={Boolean(busy)}
              onClick={() => void handleSelectPackage()}
              data-testid="plugin-publish-select-package"
            >
              <FolderOpen size={16} />
              {t("plugin.publish.local.select")}
            </button>
          </div>

          {review ? (
            <div className="mt-4 space-y-3 text-sm">
              <div>
                <p className="font-semibold text-[color:var(--lime-text-strong)]">
                  {packageTitle}
                </p>
                <p className="text-xs text-[color:var(--lime-text-muted)]">
                  {review.state.manifest.appId} ·{" "}
                  {review.state.manifest.version}
                </p>
              </div>
              <div className="space-y-2 rounded-xl border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] p-3 font-mono text-[11px] leading-5 text-[color:var(--lime-text-muted)]">
                <p>{review.state.identity.packageHash}</p>
                <p>{review.state.identity.manifestHash}</p>
              </div>
              {selectedPath ? (
                <p className="break-all text-xs text-[color:var(--lime-text-muted)]">
                  {selectedPath}
                </p>
              ) : null}
            </div>
          ) : (
            <div className="mt-4 rounded-xl border border-dashed border-[color:var(--lime-surface-border)] px-4 py-8 text-center text-sm text-[color:var(--lime-text-muted)]">
              {t("plugin.publish.local.empty")}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1 text-xs font-semibold text-[color:var(--lime-text-muted)]">
              {t("plugin.publish.field.marketplaceName")}
              <input
                className="h-10 w-full rounded-xl border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] px-3 text-sm font-semibold text-[color:var(--lime-text-strong)] outline-none transition focus:border-[color:var(--lime-surface-border-strong)]"
                value={draft.marketplaceName}
                onChange={handleTextChange("marketplaceName")}
                data-testid="plugin-publish-marketplace"
              />
            </label>
            <label className="space-y-1 text-xs font-semibold text-[color:var(--lime-text-muted)]">
              {t("plugin.publish.field.targetTenantId")}
              <input
                className="h-10 w-full rounded-xl border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] px-3 text-sm font-semibold text-[color:var(--lime-text-strong)] outline-none transition focus:border-[color:var(--lime-surface-border-strong)]"
                value={draft.targetTenantId}
                onChange={handleTextChange("targetTenantId")}
                data-testid="plugin-publish-target-tenant"
              />
            </label>
          </div>

          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label
                className="text-xs font-semibold text-[color:var(--lime-text-muted)]"
                htmlFor="plugin-publish-package-url-input"
              >
                {t("plugin.publish.field.packageUrl")}
              </label>
              <button
                type="button"
                className="inline-flex h-8 items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 text-xs font-semibold text-sky-700 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={!canUpload}
                onClick={() => void handleUploadPackage()}
                data-testid="plugin-publish-upload-package"
              >
                <UploadCloud size={14} />
                {busy === "upload"
                  ? t("plugin.publish.action.uploading")
                  : t("plugin.publish.action.upload")}
              </button>
            </div>
            <input
              id="plugin-publish-package-url-input"
              className="h-10 w-full rounded-xl border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] px-3 text-sm font-semibold text-[color:var(--lime-text-strong)] outline-none transition focus:border-[color:var(--lime-surface-border-strong)]"
              value={draft.packageUrl}
              onChange={handleTextChange("packageUrl")}
              placeholder="https://cdn.example.com/plugin.zip"
              data-testid="plugin-publish-package-url"
            />
            {packageUpload ? (
              <div
                className={`rounded-xl border px-3 py-2 text-xs font-semibold ${
                  packageUpload.status === "verified"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-rose-200 bg-rose-50 text-rose-700"
                }`}
                data-testid="plugin-publish-upload-result"
              >
                {packageUpload.status === "verified"
                  ? t("plugin.publish.upload.verified", {
                      count: packageUpload.fileCount,
                    })
                  : t("plugin.publish.upload.blocked", {
                      count: packageUpload.blockers?.length ?? 0,
                    })}
              </div>
            ) : null}
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1 text-xs font-semibold text-[color:var(--lime-text-muted)]">
              {t("plugin.publish.field.categories")}
              <input
                className="h-10 w-full rounded-xl border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] px-3 text-sm text-[color:var(--lime-text-strong)] outline-none transition focus:border-[color:var(--lime-surface-border-strong)]"
                value={draft.categoriesText}
                onChange={handleTextChange("categoriesText")}
                data-testid="plugin-publish-categories"
              />
            </label>
            <label className="space-y-1 text-xs font-semibold text-[color:var(--lime-text-muted)]">
              {t("plugin.publish.field.keywords")}
              <input
                className="h-10 w-full rounded-xl border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] px-3 text-sm text-[color:var(--lime-text-strong)] outline-none transition focus:border-[color:var(--lime-surface-border-strong)]"
                value={draft.keywordsText}
                onChange={handleTextChange("keywordsText")}
                data-testid="plugin-publish-keywords"
              />
            </label>
          </div>

          <div className="rounded-2xl border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface-soft)] p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-[color:var(--lime-text-strong)]">
              <KeyRound size={16} />
              {t("plugin.publish.signature.title")}
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <label className="space-y-1 text-xs font-semibold text-[color:var(--lime-text-muted)]">
                {t("plugin.publish.field.signatureRef")}
                <input
                  className="h-10 w-full rounded-xl border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] px-3 text-sm text-[color:var(--lime-text-strong)] outline-none transition focus:border-[color:var(--lime-surface-border-strong)]"
                  value={draft.signatureRef}
                  onChange={handleTextChange("signatureRef")}
                  data-testid="plugin-publish-signature-ref"
                />
              </label>
              <label className="space-y-1 text-xs font-semibold text-[color:var(--lime-text-muted)]">
                {t("plugin.publish.field.publicKeyId")}
                <input
                  className="h-10 w-full rounded-xl border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] px-3 text-sm text-[color:var(--lime-text-strong)] outline-none transition focus:border-[color:var(--lime-surface-border-strong)]"
                  value={draft.signaturePublicKeyId}
                  onChange={handleTextChange("signaturePublicKeyId")}
                  data-testid="plugin-publish-public-key-id"
                />
              </label>
              <label className="space-y-1 text-xs font-semibold text-[color:var(--lime-text-muted)]">
                {t("plugin.publish.field.algorithm")}
                <select
                  className="h-10 w-full rounded-xl border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] px-3 text-sm text-[color:var(--lime-text-strong)] outline-none transition focus:border-[color:var(--lime-surface-border-strong)]"
                  value={draft.signatureAlgorithm}
                  onChange={handleTextChange("signatureAlgorithm")}
                  data-testid="plugin-publish-algorithm"
                >
                  <option value="Ed25519">Ed25519</option>
                  <option value="ECDSA-P256-SHA256">ECDSA-P256-SHA256</option>
                  <option value="RSA-PSS-SHA256">RSA-PSS-SHA256</option>
                  <option value="RSASSA-PKCS1-v1_5-SHA256">
                    RSASSA-PKCS1-v1_5-SHA256
                  </option>
                </select>
              </label>
              <label className="space-y-1 text-xs font-semibold text-[color:var(--lime-text-muted)]">
                {t("plugin.publish.field.signedAt")}
                <input
                  className="h-10 w-full rounded-xl border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] px-3 text-sm text-[color:var(--lime-text-strong)] outline-none transition focus:border-[color:var(--lime-surface-border-strong)]"
                  value={draft.signatureSignedAt}
                  onChange={handleTextChange("signatureSignedAt")}
                  data-testid="plugin-publish-signed-at"
                />
              </label>
            </div>
            <label className="mt-3 block space-y-1 text-xs font-semibold text-[color:var(--lime-text-muted)]">
              {t("plugin.publish.field.payloadHash")}
              <input
                className="h-10 w-full rounded-xl border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] px-3 font-mono text-xs text-[color:var(--lime-text-strong)] outline-none transition focus:border-[color:var(--lime-surface-border-strong)]"
                value={draft.signaturePayloadHash}
                onChange={handleTextChange("signaturePayloadHash")}
                data-testid="plugin-publish-payload-hash"
              />
            </label>
            <label className="mt-3 block space-y-1 text-xs font-semibold text-[color:var(--lime-text-muted)]">
              {t("plugin.publish.field.signature")}
              <textarea
                className="min-h-[72px] w-full resize-y rounded-xl border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] px-3 py-2 font-mono text-xs text-[color:var(--lime-text-strong)] outline-none transition focus:border-[color:var(--lime-surface-border-strong)]"
                value={draft.signature}
                onChange={handleTextChange("signature")}
                data-testid="plugin-publish-signature"
              />
            </label>
          </div>

          <div className="rounded-2xl border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface-soft)] p-4">
            <label className="flex items-center gap-2 text-sm font-semibold text-[color:var(--lime-text-strong)]">
              <input
                type="checkbox"
                checked={draft.registrationRequired}
                onChange={(event) =>
                  updateDraft(
                    "registrationRequired",
                    event.currentTarget.checked,
                  )
                }
                data-testid="plugin-publish-registration-required"
              />
              {t("plugin.publish.registration.required")}
            </label>
            {draft.registrationRequired ? (
              <div className="mt-3 space-y-3">
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
                  {t("plugin.publish.registration.cloudManaged")}
                </div>
                <label className="space-y-1 text-xs font-semibold text-[color:var(--lime-text-muted)]">
                  {t("plugin.publish.field.registrationHint")}
                  <input
                    className="h-10 w-full rounded-xl border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] px-3 text-sm text-[color:var(--lime-text-strong)] outline-none transition focus:border-[color:var(--lime-surface-border-strong)]"
                    value={draft.registrationHint}
                    onChange={handleTextChange("registrationHint")}
                    data-testid="plugin-publish-registration-hint"
                  />
                </label>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mt-5 space-y-3">
        {renderBlockers(blockers)}
        {preflight ? (
          <div
            className={`rounded-xl border px-4 py-3 text-sm ${
              preflight.valid
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-rose-200 bg-rose-50 text-rose-700"
            }`}
            data-testid="plugin-publish-preflight-result"
          >
            <div className="flex items-center gap-2 font-semibold">
              {preflight.valid ? (
                <CheckCircle2 size={16} />
              ) : (
                <AlertTriangle size={16} />
              )}
              {preflight.valid
                ? t("plugin.publish.preflight.valid", {
                    count: preflightSummary?.targetCount ?? 0,
                  })
                : t("plugin.publish.preflight.invalid", {
                    count: preflight.blockers.length,
                  })}
            </div>
            {preflight.blockers.length > 0 || preflight.warnings?.length ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {[...preflight.blockers, ...(preflight.warnings ?? [])].map(
                  (item) => (
                    <span
                      key={`${item.severity}:${item.code}:${item.field ?? ""}`}
                      className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${issueTone(
                        item.severity,
                      )}`}
                    >
                      {item.code}
                    </span>
                  ),
                )}
              </div>
            ) : null}
            <PluginPublishPreflightPlan preflight={preflight} />
          </div>
        ) : null}
        {submissionResult ? (
          <div
            className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700"
            data-testid="plugin-publish-result"
          >
            {t("plugin.publish.result.summary", {
              status: submissionResult.status,
            })}
          </div>
        ) : null}
      </div>

      <div className="mt-5">
        <PluginReleaseSubmissionStatusPanel
          targetTenantId={draft.targetTenantId}
          pluginName={review?.state.manifest.appId}
          marketplaceName={draft.marketplaceName}
          latestSubmission={submissionResult}
          deps={{
            listClientPluginReleaseSubmissions:
              deps?.listClientPluginReleaseSubmissions,
          }}
        />
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-end gap-3">
        <button
          type="button"
          className="inline-flex h-10 items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-5 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={!canPreflight}
          onClick={() => void handlePreflight()}
          data-testid="plugin-publish-preflight"
        >
          <CheckCircle2 size={16} />
          {busy === "preflight"
            ? t("plugin.publish.action.preflighting")
            : t("plugin.publish.action.preflight")}
        </button>
        <button
          type="button"
          className="inline-flex h-10 items-center gap-2 rounded-full bg-[color:var(--lime-text-strong)] px-5 text-sm font-semibold text-[color:var(--lime-surface)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={!canSubmit}
          onClick={() => void handleSubmit()}
          data-testid="plugin-publish-confirm"
        >
          <Send size={16} />
          {busy === "submit"
            ? t("plugin.publish.action.publishing")
            : t("plugin.publish.action.publish")}
        </button>
      </div>
    </section>
  );
}
