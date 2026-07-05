import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  CheckCircle2,
  History,
  RefreshCw,
  ShieldCheck,
  X,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import {
  approvePluginReleaseSubmission,
  listPlatformPluginAuditLogs,
  listPluginReleaseSubmissions,
  rejectPluginReleaseSubmission,
  type PluginAuditLog,
  type PluginPublishPreflightIssue,
  type PluginReleaseSubmission,
} from "@/lib/api/oemCloudPluginPublish";
import {
  buildPluginReleaseReviewCounts,
  filterPluginReleaseReviewSubmissions,
  isPluginReleaseReviewActionAvailable,
  PLUGIN_RELEASE_REVIEW_STATUS_FILTERS,
  summarizePluginReleaseSubmission,
  type PluginReleaseReviewStatusFilter,
} from "./pluginReleaseReviewWorkbenchViewModel";

type PluginReleaseReviewBusyState =
  | "load"
  | `approve:${string}`
  | `reject:${string}`;

export interface PluginReleaseReviewWorkbenchProps {
  onClose?: () => void;
  onPublished?: (submission: PluginReleaseSubmission) => void;
  deps?: {
    listPluginReleaseSubmissions?: typeof listPluginReleaseSubmissions;
    listPlatformPluginAuditLogs?: typeof listPlatformPluginAuditLogs;
    approvePluginReleaseSubmission?: typeof approvePluginReleaseSubmission;
    rejectPluginReleaseSubmission?: typeof rejectPluginReleaseSubmission;
  };
}

function statusClass(status: PluginReleaseReviewStatusFilter): string {
  if (status === "published") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (status === "pending_review") {
    return "border-sky-200 bg-sky-50 text-sky-700";
  }
  if (status === "blocked") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }
  if (status === "rejected") {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function issueClass(severity: PluginPublishPreflightIssue["severity"]): string {
  return severity === "warning"
    ? "border-amber-200 bg-amber-50 text-amber-700"
    : "border-rose-200 bg-rose-50 text-rose-700";
}

function replaceSubmission(
  submissions: PluginReleaseSubmission[],
  next: PluginReleaseSubmission,
): PluginReleaseSubmission[] {
  let found = false;
  const updated = submissions.map((submission) => {
    if (submission.id !== next.id) {
      return submission;
    }
    found = true;
    return next;
  });
  return found ? updated : [next, ...updated];
}

export function PluginReleaseReviewWorkbench({
  onClose,
  onPublished,
  deps,
}: PluginReleaseReviewWorkbenchProps) {
  const { t } = useTranslation("agent");
  const translateRef = useRef(t);
  const [submissions, setSubmissions] = useState<PluginReleaseSubmission[]>([]);
  const [statusFilter, setStatusFilter] =
    useState<PluginReleaseReviewStatusFilter>("pending_review");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [auditLogs, setAuditLogs] = useState<PluginAuditLog[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [busy, setBusy] = useState<PluginReleaseReviewBusyState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const counts = useMemo(
    () => buildPluginReleaseReviewCounts(submissions),
    [submissions],
  );
  const visibleSubmissions = useMemo(
    () => filterPluginReleaseReviewSubmissions(submissions, statusFilter),
    [statusFilter, submissions],
  );
  const selectedSubmission =
    visibleSubmissions.find((submission) => submission.id === selectedId) ??
    visibleSubmissions[0] ??
    null;
  const selectedSummary = selectedSubmission
    ? summarizePluginReleaseSubmission(selectedSubmission)
    : null;
  const actionAvailable =
    isPluginReleaseReviewActionAvailable(selectedSubmission);
  const loading = busy === "load";
  const approving =
    selectedSubmission && busy === `approve:${selectedSubmission.id}`;
  const rejecting =
    selectedSubmission && busy === `reject:${selectedSubmission.id}`;
  const listReleaseSubmissions =
    deps?.listPluginReleaseSubmissions ?? listPluginReleaseSubmissions;
  const listAuditLogs =
    deps?.listPlatformPluginAuditLogs ?? listPlatformPluginAuditLogs;

  translateRef.current = t;

  const loadSubmissions = useCallback(async () => {
    setBusy("load");
    setLoadError(null);
    try {
      const result = await listReleaseSubmissions();
      setSubmissions(result.items);
      setSelectedId((current) => current ?? result.items[0]?.id ?? null);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : translateRef.current("plugin.review.toast.loadFailed");
      setLoadError(message);
      toast.error(message);
    } finally {
      setBusy(null);
    }
  }, [listReleaseSubmissions]);

  useEffect(() => {
    void loadSubmissions();
  }, [loadSubmissions]);

  const loadAuditLogs = useCallback(
    async (submission: PluginReleaseSubmission | null) => {
      if (!submission) {
        setAuditLogs([]);
        setAuditError(null);
        return;
      }
      setAuditLoading(true);
      setAuditError(null);
      try {
        const result = await listAuditLogs({
          tenantIds: [submission.tenantId],
          pluginName: submission.pluginName,
          marketplaceName: submission.marketplaceName,
        });
        setAuditLogs(result.items.slice(0, 6));
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : translateRef.current("plugin.review.audit.toast.loadFailed");
        setAuditLogs([]);
        setAuditError(message);
        toast.error(message);
      } finally {
        setAuditLoading(false);
      }
    },
    [listAuditLogs],
  );

  useEffect(() => {
    void loadAuditLogs(selectedSubmission);
  }, [loadAuditLogs, selectedSubmission]);

  async function handleApprove() {
    if (!selectedSubmission || !actionAvailable) {
      return;
    }
    setBusy(`approve:${selectedSubmission.id}`);
    try {
      const approve =
        deps?.approvePluginReleaseSubmission ?? approvePluginReleaseSubmission;
      const result = await approve(selectedSubmission.id, {
        notes: reviewNotes.trim() || undefined,
      });
      setSubmissions((current) =>
        replaceSubmission(current, result.submission),
      );
      setSelectedId(result.submission.id);
      setReviewNotes("");
      toast.success(t("plugin.review.toast.approveSucceeded"));
      if (result.publish || result.submission.status === "published") {
        try {
          onPublished?.(result.submission);
        } catch (callbackError) {
          console.warn(
            "[plugins] release review publish callback failed",
            callbackError,
          );
        }
      }
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("plugin.review.toast.approveFailed"),
      );
    } finally {
      setBusy(null);
    }
  }

  async function handleReject() {
    if (!selectedSubmission || !actionAvailable) {
      return;
    }
    const reason = rejectReason.trim();
    if (!reason) {
      toast.error(t("plugin.review.toast.reasonRequired"));
      return;
    }
    setBusy(`reject:${selectedSubmission.id}`);
    try {
      const reject =
        deps?.rejectPluginReleaseSubmission ?? rejectPluginReleaseSubmission;
      const result = await reject(selectedSubmission.id, { reason });
      setSubmissions((current) => replaceSubmission(current, result));
      setSelectedId(result.id);
      setRejectReason("");
      toast.success(t("plugin.review.toast.rejectSucceeded"));
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("plugin.review.toast.rejectFailed"),
      );
    } finally {
      setBusy(null);
    }
  }

  function renderIssues(
    titleKey: string,
    issues: PluginPublishPreflightIssue[] | undefined,
  ) {
    if (!issues?.length) {
      return null;
    }
    return (
      <div className="space-y-2">
        <p className="text-xs font-semibold text-[color:var(--lime-text-muted)]">
          {t(titleKey, { count: issues.length })}
        </p>
        <div className="flex flex-wrap gap-2">
          {issues.map((issue) => (
            <span
              key={`${issue.severity}:${issue.code}:${issue.field ?? ""}`}
              className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${issueClass(
                issue.severity,
              )}`}
            >
              {issue.field ? `${issue.field}: ${issue.code}` : issue.code}
            </span>
          ))}
        </div>
      </div>
    );
  }

  return (
    <section
      className="rounded-[18px] border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] p-5 shadow-sm shadow-slate-950/5"
      data-testid="plugin-review-workbench"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
            <ShieldCheck size={14} />
            {t("plugin.review.eyebrow")}
          </div>
          <h2 className="mt-3 text-xl font-semibold text-[color:var(--lime-text-strong)]">
            {t("plugin.review.title")}
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[color:var(--lime-text-muted)]">
            {t("plugin.review.description")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="inline-flex h-9 items-center gap-2 rounded-full border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] px-4 text-sm font-semibold text-[color:var(--lime-text-strong)] transition hover:bg-[color:var(--lime-surface-hover)] disabled:cursor-not-allowed disabled:opacity-60"
            disabled={loading}
            onClick={() => void loadSubmissions()}
            data-testid="plugin-review-refresh"
          >
            <RefreshCw size={16} />
            {t("plugin.review.action.refresh")}
          </button>
          {onClose ? (
            <button
              type="button"
              className="inline-flex size-9 items-center justify-center rounded-full border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] text-[color:var(--lime-text-muted)] transition hover:bg-[color:var(--lime-surface-hover)]"
              onClick={onClose}
              aria-label={t("plugin.review.close")}
              data-testid="plugin-review-close"
            >
              <X size={16} />
            </button>
          ) : null}
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {PLUGIN_RELEASE_REVIEW_STATUS_FILTERS.map((filter) => (
          <button
            key={filter}
            type="button"
            className={`inline-flex h-8 items-center gap-2 rounded-full border px-3 text-xs font-semibold transition ${
              statusFilter === filter
                ? statusClass(filter)
                : "border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] text-[color:var(--lime-text-muted)] hover:bg-[color:var(--lime-surface-hover)]"
            }`}
            onClick={() => {
              setStatusFilter(filter);
              setSelectedId(null);
            }}
            data-testid={`plugin-review-filter-${filter}`}
          >
            {t(`plugin.review.status.${filter}`)}
            <span>{counts[filter]}</span>
          </button>
        ))}
      </div>

      {loadError ? (
        <div
          className="mt-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700"
          data-testid="plugin-review-load-error"
        >
          {loadError}
        </div>
      ) : null}

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(280px,0.88fr)_minmax(0,1.12fr)]">
        <div className="space-y-3" data-testid="plugin-review-list">
          {visibleSubmissions.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[color:var(--lime-surface-border)] px-4 py-8 text-center text-sm text-[color:var(--lime-text-muted)]">
              {loading
                ? t("plugin.review.empty.loading")
                : t("plugin.review.empty.noSubmissions")}
            </div>
          ) : (
            visibleSubmissions.map((submission) => {
              const summary = summarizePluginReleaseSubmission(submission);
              const selected = selectedSubmission?.id === submission.id;
              return (
                <button
                  key={submission.id}
                  type="button"
                  className={`w-full rounded-2xl border p-4 text-left transition ${
                    selected
                      ? "border-[color:var(--lime-surface-border-strong)] bg-[color:var(--lime-surface-hover)]"
                      : "border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface-soft)] hover:bg-[color:var(--lime-surface-hover)]"
                  }`}
                  onClick={() => setSelectedId(submission.id)}
                  data-testid={`plugin-review-item-${submission.id}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[color:var(--lime-text-strong)]">
                        {summary.displayName}
                      </p>
                      <p className="mt-1 text-xs text-[color:var(--lime-text-muted)]">
                        {submission.marketplaceName}/{submission.pluginName} ·{" "}
                        {submission.version}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass(
                        submission.status,
                      )}`}
                    >
                      {t(`plugin.review.status.${submission.status}`)}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-[color:var(--lime-text-muted)]">
                    <span>{submission.tenantId}</span>
                    <span>{submission.createdAt}</span>
                  </div>
                </button>
              );
            })
          )}
        </div>

        <div className="rounded-2xl border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface-soft)] p-4">
          {selectedSubmission && selectedSummary ? (
            <div data-testid="plugin-review-detail">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-lg font-semibold text-[color:var(--lime-text-strong)]">
                    {selectedSummary.displayName}
                  </h3>
                  <p className="mt-1 text-sm text-[color:var(--lime-text-muted)]">
                    {selectedSubmission.marketplaceName}/
                    {selectedSubmission.pluginName} ·{" "}
                    {selectedSubmission.version}
                  </p>
                </div>
                <span
                  className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusClass(
                    selectedSubmission.status,
                  )}`}
                  data-testid="plugin-review-detail-status"
                >
                  {t(`plugin.review.status.${selectedSubmission.status}`)}
                </span>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div className="rounded-xl border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] p-3">
                  <p className="text-xs font-semibold text-[color:var(--lime-text-muted)]">
                    {t("plugin.review.field.tenant")}
                  </p>
                  <p className="mt-1 break-all text-sm font-semibold text-[color:var(--lime-text-strong)]">
                    {selectedSubmission.tenantId}
                  </p>
                </div>
                <div className="rounded-xl border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] p-3">
                  <p className="text-xs font-semibold text-[color:var(--lime-text-muted)]">
                    {t("plugin.review.field.developer")}
                  </p>
                  <p className="mt-1 break-all text-sm font-semibold text-[color:var(--lime-text-strong)]">
                    {selectedSubmission.developerId ??
                      selectedSubmission.developerUserId}
                  </p>
                </div>
              </div>

              <div className="mt-4 space-y-2 rounded-xl border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] p-3 font-mono text-[11px] leading-5 text-[color:var(--lime-text-muted)]">
                <p>{selectedSubmission.packageHash}</p>
                <p>{selectedSubmission.manifestHash}</p>
                <p>{selectedSubmission.payloadHash}</p>
                {selectedSubmission.scanEvidenceRef ? (
                  <p>{selectedSubmission.scanEvidenceRef}</p>
                ) : null}
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <div className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-semibold text-sky-700">
                  {t("plugin.review.summary.targets", {
                    count: selectedSummary.targetTenantIds.length,
                  })}
                </div>
                <div
                  className={`rounded-xl border px-3 py-2 text-sm font-semibold ${
                    selectedSummary.blockerCount > 0
                      ? "border-rose-200 bg-rose-50 text-rose-700"
                      : "border-emerald-200 bg-emerald-50 text-emerald-700"
                  }`}
                >
                  {t("plugin.review.summary.blockers", {
                    count: selectedSummary.blockerCount,
                  })}
                </div>
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-700">
                  {t("plugin.review.summary.warnings", {
                    count: selectedSummary.warningCount,
                  })}
                </div>
              </div>

              <div className="mt-4 space-y-3">
                <div className="rounded-xl border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] px-3 py-2 text-sm text-[color:var(--lime-text)]">
                  <span className="font-semibold text-[color:var(--lime-text-strong)]">
                    {t("plugin.review.field.signatureStatus")}：
                  </span>
                  {selectedSummary.signatureStatus}
                </div>
                {selectedSummary.registrationRequired ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-700">
                    {t("plugin.review.registration.required")}
                    {selectedSummary.registrationHint
                      ? ` · ${selectedSummary.registrationHint}`
                      : ""}
                  </div>
                ) : null}
                {renderIssues(
                  "plugin.review.issue.blockers",
                  selectedSubmission.preflight?.blockers,
                )}
                {renderIssues(
                  "plugin.review.issue.warnings",
                  selectedSubmission.preflight?.warnings,
                )}
              </div>

              <div
                className="mt-4 rounded-xl border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] p-3"
                data-testid="plugin-review-audit-trail"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm font-semibold text-[color:var(--lime-text-strong)]">
                      <History size={16} />
                      {t("plugin.review.audit.title")}
                    </div>
                    <p className="mt-1 text-xs leading-5 text-[color:var(--lime-text-muted)]">
                      {t("plugin.review.audit.description")}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="inline-flex h-8 items-center gap-2 rounded-full border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] px-3 text-xs font-semibold text-[color:var(--lime-text-strong)] transition hover:bg-[color:var(--lime-surface-hover)] disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={auditLoading}
                    onClick={() => void loadAuditLogs(selectedSubmission)}
                    data-testid="plugin-review-audit-refresh"
                  >
                    <RefreshCw size={14} />
                    {auditLoading
                      ? t("plugin.review.audit.loading")
                      : t("plugin.review.audit.refresh")}
                  </button>
                </div>
                {auditError ? (
                  <div className="mt-3 flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
                    <AlertTriangle size={14} />
                    {auditError}
                  </div>
                ) : null}
                <div className="mt-3 space-y-2">
                  {auditLogs.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-[color:var(--lime-surface-border)] px-3 py-4 text-center text-xs font-semibold text-[color:var(--lime-text-muted)]">
                      {auditLoading
                        ? t("plugin.review.audit.loading")
                        : t("plugin.review.audit.empty")}
                    </div>
                  ) : (
                    auditLogs.map((log) => (
                      <div
                        key={log.id}
                        className="rounded-xl border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface-soft)] px-3 py-2 text-xs text-[color:var(--lime-text-muted)]"
                        data-testid={`plugin-review-audit-${log.id}`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-semibold text-[color:var(--lime-text-strong)]">
                            {log.action}
                          </span>
                          <span>{log.createdAt}</span>
                        </div>
                        <div className="mt-1 flex flex-wrap gap-2">
                          {log.tenantId ? <span>{log.tenantId}</span> : null}
                          {log.releaseId ? <span>{log.releaseId}</span> : null}
                          {log.operator ? <span>{log.operator}</span> : null}
                        </div>
                        {log.summary ? (
                          <p className="mt-1 leading-5">{log.summary}</p>
                        ) : null}
                      </div>
                    ))
                  )}
                </div>
              </div>

              {selectedSubmission.developerNotes ? (
                <div className="mt-4 rounded-xl border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] p-3">
                  <p className="text-xs font-semibold text-[color:var(--lime-text-muted)]">
                    {t("plugin.review.field.developerNotes")}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-[color:var(--lime-text)]">
                    {selectedSubmission.developerNotes}
                  </p>
                </div>
              ) : null}

              <div className="mt-5 space-y-3 border-t border-[color:var(--lime-surface-border)] pt-4">
                {actionAvailable ? (
                  <>
                    <label className="block space-y-1 text-xs font-semibold text-[color:var(--lime-text-muted)]">
                      {t("plugin.review.field.reviewNotes")}
                      <textarea
                        className="min-h-[68px] w-full resize-y rounded-xl border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] px-3 py-2 text-sm text-[color:var(--lime-text-strong)] outline-none transition focus:border-[color:var(--lime-surface-border-strong)]"
                        value={reviewNotes}
                        onChange={(event) =>
                          setReviewNotes(event.currentTarget.value)
                        }
                        data-testid="plugin-review-notes"
                      />
                    </label>
                    <label className="block space-y-1 text-xs font-semibold text-[color:var(--lime-text-muted)]">
                      {t("plugin.review.field.rejectReason")}
                      <textarea
                        className="min-h-[68px] w-full resize-y rounded-xl border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] px-3 py-2 text-sm text-[color:var(--lime-text-strong)] outline-none transition focus:border-[color:var(--lime-surface-border-strong)]"
                        value={rejectReason}
                        onChange={(event) =>
                          setRejectReason(event.currentTarget.value)
                        }
                        data-testid="plugin-review-reject-reason"
                      />
                    </label>
                    <div className="flex flex-wrap justify-end gap-3">
                      <button
                        type="button"
                        className="inline-flex h-10 items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-4 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={Boolean(busy)}
                        onClick={() => void handleReject()}
                        data-testid="plugin-review-reject"
                      >
                        <XCircle size={16} />
                        {rejecting
                          ? t("plugin.review.action.rejecting")
                          : t("plugin.review.action.reject")}
                      </button>
                      <button
                        type="button"
                        className="inline-flex h-10 items-center gap-2 rounded-full bg-[color:var(--lime-text-strong)] px-5 text-sm font-semibold text-[color:var(--lime-surface)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={Boolean(busy)}
                        onClick={() => void handleApprove()}
                        data-testid="plugin-review-approve"
                      >
                        <CheckCircle2 size={16} />
                        {approving
                          ? t("plugin.review.action.approving")
                          : t("plugin.review.action.approve")}
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="rounded-xl border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] px-3 py-2 text-sm font-semibold text-[color:var(--lime-text-muted)]">
                    {t("plugin.review.action.unavailable")}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex min-h-[260px] items-center justify-center rounded-xl border border-dashed border-[color:var(--lime-surface-border)] text-sm text-[color:var(--lime-text-muted)]">
              {t("plugin.review.empty.selectSubmission")}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
