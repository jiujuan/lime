import { Archive, Ban, CheckCircle2 } from "lucide-react";
import type {
  PluginUninstallRehearsalResult,
} from "@/lib/api/plugins";
import type { PluginLifecycleUninstallRehearsalDescriptor } from "../install/lifecycleAction";
import type { InstalledPluginState } from "../types";
import type { PluginDynamicTranslation } from "./PluginsPagePresentation";

type UninstallMode = "keep-data" | "delete-data";

export function PluginLifecycleActionsSection({
  selected,
  busyAction,
  uninstallPreview,
  activeUninstallDescriptor,
  deleteDataExecutionBlocked,
  deleteDataConfirmationPhrase,
  deleteDataConfirmationInput,
  deleteDataConfirmationMatches,
  t,
  onSetDisabled,
  onPreviewUninstall,
  onConfirmUninstall,
  onDeleteDataConfirmationInputChange,
}: {
  selected: InstalledPluginState | null;
  busyAction: string | null;
  uninstallPreview: PluginUninstallRehearsalResult | null;
  activeUninstallDescriptor: PluginLifecycleUninstallRehearsalDescriptor | null;
  deleteDataExecutionBlocked: boolean;
  deleteDataConfirmationPhrase: string;
  deleteDataConfirmationInput: string;
  deleteDataConfirmationMatches: boolean;
  t: PluginDynamicTranslation;
  onSetDisabled: (
    state: InstalledPluginState,
    disabled: boolean,
  ) => void | Promise<void>;
  onPreviewUninstall: (
    state: InstalledPluginState,
    mode: UninstallMode,
  ) => void | Promise<void>;
  onConfirmUninstall: () => void | Promise<void>;
  onDeleteDataConfirmationInputChange: (value: string) => void;
}) {
  if (!selected) {
    return null;
  }
  return (
    <section
      className="space-y-3 rounded-lg border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface-soft)] p-3"
      data-testid="plugins-lifecycle-actions"
    >
      <div className="grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          className="inline-flex items-center justify-center gap-2 rounded-full border border-amber-200 bg-[color:var(--lime-surface)] px-3 py-2 text-xs font-medium text-amber-700 transition hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={selected.disabled || Boolean(busyAction)}
          onClick={() => void onSetDisabled(selected, true)}
          data-testid="plugins-disable"
        >
          <Ban size={16} />
          {t("plugin.apps.action.disable")}
        </button>
        <button
          type="button"
          className="inline-flex items-center justify-center gap-2 rounded-full border border-emerald-200 bg-[color:var(--lime-surface)] px-3 py-2 text-xs font-medium text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={!selected.disabled || Boolean(busyAction)}
          onClick={() => void onSetDisabled(selected, false)}
          data-testid="plugins-enable"
        >
          <CheckCircle2 size={16} />
          {t("plugin.apps.action.enable")}
        </button>
        <button
          type="button"
          className="rounded-full border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] px-3 py-2 text-left text-xs font-medium text-[color:var(--lime-text)] transition hover:bg-[color:var(--lime-surface-hover)] disabled:cursor-not-allowed disabled:opacity-60"
          disabled={Boolean(busyAction)}
          onClick={() => void onPreviewUninstall(selected, "keep-data")}
          data-testid="plugins-uninstall-keep-data"
        >
          <span className="inline-flex items-center gap-2">
            <Archive size={16} />
            {t("plugin.apps.action.uninstallKeepData")}
          </span>
        </button>
        <button
          type="button"
          className="rounded-full border border-rose-200 bg-[color:var(--lime-surface)] px-3 py-2 text-left text-xs font-medium text-rose-800 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={Boolean(busyAction)}
          onClick={() => void onPreviewUninstall(selected, "delete-data")}
          data-testid="plugins-uninstall-delete-data"
        >
          <span className="inline-flex items-center gap-2">
            <Archive size={16} />
            {t("plugin.apps.action.uninstallDeleteData")}
          </span>
        </button>
      </div>
      {uninstallPreview ? (
        <div
          className="rounded-lg border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] p-3"
          data-testid="plugins-uninstall-preview"
        >
          <p className="text-sm font-semibold text-[color:var(--lime-text-strong)]">
            {t("plugin.apps.uninstallPreview.title")}
          </p>
          <p className="mt-2 text-sm text-[color:var(--lime-text-muted)]">
            {t("plugin.apps.uninstallPreview.summary", {
              deleted: uninstallPreview.deletedTargetCount,
              retained: uninstallPreview.retainedTargetCount,
            })}
          </p>
          {activeUninstallDescriptor ? (
            <div
              className="mt-3 space-y-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3"
              data-testid="plugins-cleanup-evidence"
            >
              <p className="text-sm text-emerald-800">
                {t("plugin.lab.manager.evidence.summary", {
                  deleted:
                    activeUninstallDescriptor.cleanupEvidence
                      .deletedTargetCount,
                  retained:
                    activeUninstallDescriptor.cleanupEvidence
                      .retainedTargetCount,
                })}
              </p>
              <pre
                className="max-h-44 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-slate-950 p-3 text-xs leading-5 text-emerald-50"
                data-testid="plugins-cleanup-evidence-json"
              >
                {JSON.stringify(
                  activeUninstallDescriptor.cleanupEvidence,
                  null,
                  2,
                )}
              </pre>
              <div
                className="grid gap-2 sm:grid-cols-2"
                data-testid="plugins-residual-audit"
              >
                <span className="rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs text-amber-700">
                  {t("plugin.lab.manager.evidence.residual.pendingDeletion", {
                    count:
                      activeUninstallDescriptor.residualAudit
                        .pendingDeletionCount,
                  })}
                </span>
              </div>
            </div>
          ) : null}
          {activeUninstallDescriptor?.mode === "delete-data" ? (
            <div
              className="mt-3 space-y-3 rounded-lg border border-rose-200 bg-rose-50 p-3"
              data-testid="plugins-delete-data-confirmation"
            >
              <div className="space-y-1">
                <p className="text-sm font-semibold text-rose-900">
                  {t("plugin.apps.uninstallPreview.deleteDataGate.title")}
                </p>
                <p className="text-sm text-rose-800">
                  {t("plugin.apps.uninstallPreview.deleteDataGate.description")}
                </p>
                {deleteDataExecutionBlocked ? (
                  <div
                    className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2"
                    data-testid="plugins-delete-data-current-phase-gate"
                  >
                    <p className="text-xs text-amber-800">
                      {t(
                        "plugin.apps.uninstallPreview.deleteDataGate.dryRunOnly",
                      )}
                    </p>
                    <button
                      type="button"
                      className="inline-flex items-center gap-2 rounded-full border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-800 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={Boolean(busyAction)}
                      onClick={() =>
                        void onPreviewUninstall(selected, "keep-data")
                      }
                      data-testid="plugins-uninstall-switch-keep-data"
                    >
                      <Archive size={14} />
                      {t("plugin.apps.action.uninstallKeepData")}
                    </button>
                  </div>
                ) : null}
              </div>
              <div className="rounded-lg border border-rose-200 bg-[color:var(--lime-surface)] px-3 py-2">
                <span className="text-xs font-medium text-rose-700">
                  {t(
                    "plugin.apps.uninstallPreview.deleteDataGate.phraseLabel",
                  )}
                </span>
                <code
                  className="mt-1 block break-all rounded-md bg-slate-950 px-2 py-1.5 text-xs text-rose-50"
                  data-testid="plugins-delete-data-confirmation-phrase"
                >
                  {deleteDataConfirmationPhrase}
                </code>
              </div>
              <input
                value={deleteDataConfirmationInput}
                onChange={(event) =>
                  onDeleteDataConfirmationInputChange(event.target.value)
                }
                className="w-full rounded-full border border-rose-200 bg-[color:var(--lime-surface)] px-3 py-2 text-sm text-[color:var(--lime-text-strong)] outline-none transition placeholder:text-[color:var(--lime-text-muted)] focus:border-rose-400 focus:ring-2 focus:ring-rose-100"
                placeholder={t(
                  "plugin.apps.uninstallPreview.deleteDataGate.inputPlaceholder",
                )}
                aria-label={t(
                  "plugin.apps.uninstallPreview.deleteDataGate.inputLabel",
                )}
                disabled={deleteDataExecutionBlocked}
                data-testid="plugins-delete-data-confirmation-input"
              />
              <p
                className={`text-xs ${
                  deleteDataExecutionBlocked
                    ? "text-amber-700"
                    : deleteDataConfirmationMatches
                      ? "text-emerald-700"
                      : "text-rose-700"
                }`}
                data-testid="plugins-delete-data-confirmation-status"
              >
                {deleteDataExecutionBlocked
                  ? t("plugin.apps.uninstallPreview.deleteDataGate.dryRunOnly")
                  : deleteDataConfirmationMatches
                    ? t("plugin.apps.uninstallPreview.deleteDataGate.ready")
                    : t("plugin.apps.uninstallPreview.deleteDataGate.mismatch")}
              </p>
            </div>
          ) : null}
          <button
            type="button"
            className="mt-3 inline-flex items-center gap-2 rounded-full bg-rose-700 px-3 py-2 text-xs font-medium text-white transition hover:bg-rose-800 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={
              Boolean(busyAction) ||
              deleteDataExecutionBlocked ||
              !deleteDataConfirmationMatches
            }
            onClick={() => void onConfirmUninstall()}
            data-testid="plugins-uninstall-confirm"
          >
            <Archive size={16} />
            {deleteDataExecutionBlocked
              ? t("plugin.apps.action.deleteDataUnavailable")
              : t("plugin.apps.action.confirmUninstall")}
          </button>
        </div>
      ) : null}
    </section>
  );
}
