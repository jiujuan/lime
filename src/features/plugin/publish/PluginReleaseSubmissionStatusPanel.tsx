import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, History, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import {
  listClientPluginReleaseSubmissions,
  type PluginReleaseSubmission,
  type PluginReleaseSubmissionStatus,
} from "@/lib/api/oemCloudPluginPublish";
import { summarizePluginReleaseSubmission } from "./pluginReleaseReviewWorkbenchViewModel";

export interface PluginReleaseSubmissionStatusPanelProps {
  targetTenantId?: string;
  pluginName?: string;
  marketplaceName?: string;
  latestSubmission?: PluginReleaseSubmission | null;
  deps?: {
    listClientPluginReleaseSubmissions?: typeof listClientPluginReleaseSubmissions;
  };
}

function statusClass(status: PluginReleaseSubmissionStatus): string {
  if (status === "published") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (status === "pending_review") {
    return "border-sky-200 bg-sky-50 text-sky-700";
  }
  if (status === "blocked") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }
  return "border-rose-200 bg-rose-50 text-rose-700";
}

function normalizeText(value?: string): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
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

function sortSubmissions(
  submissions: PluginReleaseSubmission[],
): PluginReleaseSubmission[] {
  return [...submissions].sort((left, right) => {
    const rightTime = Date.parse(right.updatedAt || right.createdAt);
    const leftTime = Date.parse(left.updatedAt || left.createdAt);
    return (Number.isFinite(rightTime) ? rightTime : 0) -
      (Number.isFinite(leftTime) ? leftTime : 0);
  });
}

export function PluginReleaseSubmissionStatusPanel({
  targetTenantId,
  pluginName,
  marketplaceName,
  latestSubmission,
  deps,
}: PluginReleaseSubmissionStatusPanelProps) {
  const { t } = useTranslation("agent");
  const translateRef = useRef(t);
  const [submissions, setSubmissions] = useState<PluginReleaseSubmission[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  translateRef.current = t;

  const tenantId = normalizeText(targetTenantId);
  const selectedPluginName = normalizeText(pluginName);
  const selectedMarketplaceName = normalizeText(marketplaceName);
  const listSubmissions =
    deps?.listClientPluginReleaseSubmissions ??
    listClientPluginReleaseSubmissions;

  const visibleSubmissions = useMemo(
    () => sortSubmissions(submissions).slice(0, 5),
    [submissions],
  );

  const refresh = useCallback(async () => {
    if (!tenantId) {
      setSubmissions([]);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await listSubmissions({
        tenantId,
        pluginName: selectedPluginName,
        marketplaceName: selectedMarketplaceName,
      });
      setSubmissions(result.items);
    } catch (refreshError) {
      const message =
        refreshError instanceof Error
          ? refreshError.message
          : translateRef.current("plugin.publish.submissions.toast.loadFailed");
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [listSubmissions, selectedMarketplaceName, selectedPluginName, tenantId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!latestSubmission) {
      return;
    }
    setSubmissions((current) =>
      sortSubmissions(replaceSubmission(current, latestSubmission)),
    );
  }, [latestSubmission]);

  return (
    <div
      className="rounded-2xl border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface-soft)] p-4"
      data-testid="plugin-publish-submissions"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold text-[color:var(--lime-text-strong)]">
            <History size={16} />
            {t("plugin.publish.submissions.title")}
          </div>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-[color:var(--lime-text-muted)]">
            {t("plugin.publish.submissions.description")}
          </p>
        </div>
        <button
          type="button"
          className="inline-flex h-8 items-center gap-2 rounded-full border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] px-3 text-xs font-semibold text-[color:var(--lime-text-strong)] transition hover:bg-[color:var(--lime-surface-hover)] disabled:cursor-not-allowed disabled:opacity-60"
          disabled={loading || !tenantId}
          onClick={() => void refresh()}
          data-testid="plugin-publish-submissions-refresh"
        >
          <RefreshCw size={14} />
          {loading
            ? t("plugin.publish.submissions.loading")
            : t("plugin.publish.submissions.refresh")}
        </button>
      </div>

      {!tenantId ? (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
          {t("plugin.publish.submissions.missingTenant")}
        </div>
      ) : null}

      {error ? (
        <div
          className="mt-3 flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700"
          data-testid="plugin-publish-submissions-error"
        >
          <AlertTriangle size={14} />
          {error}
        </div>
      ) : null}

      <div className="mt-4 space-y-3">
        {visibleSubmissions.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[color:var(--lime-surface-border)] px-4 py-6 text-center text-sm text-[color:var(--lime-text-muted)]">
            {loading
              ? t("plugin.publish.submissions.loading")
              : t("plugin.publish.submissions.empty")}
          </div>
        ) : (
          visibleSubmissions.map((submission) => {
            const summary = summarizePluginReleaseSubmission(submission);
            return (
              <div
                key={submission.id}
                className="rounded-xl border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] p-3"
                data-testid={`plugin-publish-submission-${submission.id}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
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
                    className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass(
                      submission.status,
                    )}`}
                  >
                    {t(`plugin.review.status.${submission.status}`)}
                  </span>
                </div>
                <div className="mt-3 grid gap-2 text-xs text-[color:var(--lime-text-muted)] md:grid-cols-2">
                  <p className="break-all">
                    {t("plugin.publish.submissions.payloadHash")}：
                    {submission.payloadHash}
                  </p>
                  <p>
                    {t("plugin.publish.submissions.updatedAt")}：
                    {submission.updatedAt}
                  </p>
                  {submission.scanEvidenceRef ? (
                    <p className="break-all">
                      {t("plugin.publish.submissions.scanEvidence")}：
                      {submission.scanEvidenceRef}
                    </p>
                  ) : null}
                  {submission.reviewNotes ? (
                    <p>
                      {t("plugin.publish.submissions.reviewNotes")}：
                      {submission.reviewNotes}
                    </p>
                  ) : null}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
