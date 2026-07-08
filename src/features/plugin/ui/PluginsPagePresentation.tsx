import { ShieldCheck, X } from "lucide-react";
import { convertLocalFileSrc } from "@/lib/api/fileSystem";
import type { PluginInstallReviewResult } from "@/lib/api/plugins";
import {
  resolveAppIconSrc,
  type AppCenterItem,
} from "./PluginsPageViewModel";
import { PluginReleaseEvidenceSummary } from "./PluginReleaseEvidenceSummary";
import { sourceStateClass } from "./PluginsPageStyles";

export type PluginDynamicTranslation = (
  key: string,
  options?: Record<string, unknown>,
) => string;

function applyAppIconFallback(
  event: { currentTarget: HTMLImageElement },
  title: string,
): void {
  const fallback = resolveAppIconSrc({ title });
  if (event.currentTarget.getAttribute("src") !== fallback) {
    event.currentTarget.src = fallback;
  }
}

export function PluginAppIcon({
  item,
  className = "size-12",
  testId = `plugins-icon-${item.appId}`,
}: {
  item: AppCenterItem;
  className?: string;
  testId?: string;
}) {
  return (
    <div
      className={`overflow-hidden rounded-xl border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface-soft)] ${className}`}
      data-testid={testId}
    >
      <img
        className="h-full w-full object-cover"
        src={item.iconSrc}
        alt={item.title}
        loading="lazy"
        onError={(event) => applyAppIconFallback(event, item.title)}
      />
    </div>
  );
}

export function PluginInstallReviewDialog({
  installReview,
  busyAction,
  t,
  onClose,
  onConfirm,
}: {
  installReview: PluginInstallReviewResult | null;
  busyAction: string | null;
  t: PluginDynamicTranslation;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
}) {
  if (!installReview) {
    return null;
  }
  const reviewIconSrc = resolveAppIconSrc({
    title: installReview.review.displayName,
    installedState: installReview.state,
    convertLocalFileSrc,
  });
  const installReviewBlocked =
    installReview.review.releaseEvidence?.status === "blocked";

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/35 p-4"
      data-testid="plugins-install-review-overlay"
      onClick={onClose}
    >
      <section
        role="dialog"
        aria-modal="true"
        className="lime-workbench-surface-scope flex max-h-[calc(100vh-3rem)] w-full max-w-[560px] flex-col overflow-hidden rounded-[18px] border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] text-[color:var(--lime-text)] shadow-2xl shadow-slate-950/20"
        data-testid="plugins-install-review"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[color:var(--lime-text-strong)]">
                {t("plugin.apps.installReview.title")}
              </p>
              <p className="mt-1 text-sm leading-6 text-[color:var(--lime-text-muted)]">
                {t("plugin.apps.installReview.description")}
              </p>
            </div>
            <button
              type="button"
              className="inline-flex h-9 shrink-0 items-center justify-center rounded-full border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] px-3 text-sm font-medium text-[color:var(--lime-text-muted)] shadow-none transition hover:bg-[color:var(--lime-surface-hover)] hover:text-[color:var(--lime-text-strong)]"
              aria-label={t("plugin.apps.center.detail.close")}
              title={t("plugin.apps.center.detail.close")}
              onClick={onClose}
              data-testid="plugins-install-review-close"
            >
              <span>{t("plugin.apps.center.detail.close")}</span>
              <X className="ml-1.5" size={14} />
            </button>
          </div>

          <div className="mt-4 rounded-lg border border-[color:var(--lime-info-border)] bg-[color:var(--lime-info-soft)] p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <div
                  className="size-12 shrink-0 overflow-hidden rounded-xl border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface-soft)]"
                  data-testid={`plugins-install-review-icon-${installReview.review.appId}`}
                >
                  <img
                    className="h-full w-full object-cover"
                    src={reviewIconSrc}
                    alt={installReview.review.displayName}
                    loading="lazy"
                    onError={(event) =>
                      applyAppIconFallback(
                        event,
                        installReview.review.displayName,
                      )
                    }
                  />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-base font-semibold text-[color:var(--lime-text-strong)]">
                    {installReview.review.displayName}
                  </p>
                  <p className="mt-1 text-sm text-[color:var(--lime-text-muted)]">
                    {t("plugin.apps.center.detail.versionLine", {
                      version: installReview.review.version,
                    })}
                  </p>
                </div>
              </div>
              <span
                className={`shrink-0 rounded-full border px-2 py-1 text-xs font-medium ${sourceStateClass(
                  installReview.review.sourceState.tone,
                )}`}
              >
                {t(installReview.review.sourceState.labelKey)}
              </span>
            </div>
            <p className="mt-3 text-sm leading-6 text-[color:var(--lime-text)]">
              {t("plugin.apps.installReview.summary", {
                entries: installReview.review.entryCount,
                capabilities: installReview.review.capabilityCount,
                cleanupTargets: installReview.review.cleanupTargetCount,
              })}
            </p>
          </div>
          <PluginReleaseEvidenceSummary
            evidence={installReview.review.releaseEvidence}
          />
        </div>

        <div className="flex flex-wrap gap-2 border-t border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] px-5 py-4">
          <button
            type="button"
            className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-full bg-[color:var(--lime-text-strong)] px-4 text-sm font-semibold text-[color:var(--lime-surface)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={Boolean(busyAction) || installReviewBlocked}
            title={
              installReviewBlocked
                ? t("plugin.apps.installReview.releaseEvidence.blockedConfirm")
                : undefined
            }
            onClick={() => void onConfirm()}
            data-testid="plugins-install-review-confirm"
          >
            <ShieldCheck size={16} />
            {t("plugin.apps.installReview.confirm")}
          </button>
          <button
            type="button"
            className="inline-flex h-10 items-center justify-center rounded-full border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] px-4 text-sm font-semibold text-[color:var(--lime-text)] transition hover:bg-[color:var(--lime-surface-hover)] disabled:cursor-not-allowed disabled:opacity-60"
            disabled={Boolean(busyAction)}
            onClick={onClose}
            data-testid="plugins-install-review-cancel"
          >
            {t("plugin.apps.installReview.cancel")}
          </button>
        </div>
      </section>
    </div>
  );
}
