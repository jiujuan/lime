import { Archive, Ban, CheckCircle2, Layers3, PlayCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import type {
  PluginLabInstallFlowResult,
} from "../install/labInstallFlow";
import type { InstalledPluginState, ProjectedEntry } from "../types";
import {
  getPluginManagerStatus,
  type PluginManagerEvidenceSummary,
  type PluginManagerLifecycleStatus,
} from "./pluginManagerStatus";

function managerStatusTone(status: PluginManagerLifecycleStatus): string {
  if (status === "launchable") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (status === "setup-required") {
    return "border-sky-200 bg-sky-50 text-sky-700";
  }
  if (status === "disabled") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }
  if (status === "blocked") {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function isUiEntry(entry: ProjectedEntry): boolean {
  return ["page", "panel", "settings"].includes(entry.kind);
}

export function PluginManagerPanel({
  flow,
  disabled,
  selectedAppId,
  onSetDisabled,
  onSelectApp,
  onLaunchEntry,
  onPreviewUninstall,
  evidence,
  uiRuntimeAvailable,
  capabilityHostAvailable,
  repositoryStates,
  repositoryIssueCount,
}: {
  flow: PluginLabInstallFlowResult;
  disabled: boolean;
  selectedAppId?: string;
  onSetDisabled: (disabled: boolean, state: InstalledPluginState) => void;
  onSelectApp: (appId: string) => void;
  onLaunchEntry: (entry: ProjectedEntry, state: InstalledPluginState) => void;
  onPreviewUninstall: (
    mode: "keep-data" | "delete-data",
    state: InstalledPluginState,
  ) => void;
  evidence: PluginManagerEvidenceSummary | null;
  uiRuntimeAvailable: boolean;
  capabilityHostAvailable: boolean;
  repositoryStates: InstalledPluginState[];
  repositoryIssueCount: number;
}) {
  const { t } = useTranslation("agent");
  const repositoryList =
    repositoryStates.length > 0
      ? repositoryStates
      : flow.installedState
        ? [flow.installedState]
        : [];
  const installedState =
    repositoryList.find((state) => state.appId === selectedAppId) ??
    repositoryList.find((state) => state.appId === flow.review.appId) ??
    flow.installedState;
  const selectedCanLaunch =
    installedState?.appId === flow.review.appId
      ? flow.canLaunch
      : installedState?.readiness.status === "ready" ||
        installedState?.readiness.status === "degraded";
  const selectedSetupCount =
    installedState?.readiness.blockers.concat(installedState.readiness.warnings).filter(
      (issue) => issue.required === true && issue.kind && issue.key,
    ).length ?? flow.review.requiredSetupCount;
  const selectedPermissionCount =
    installedState?.manifest.permissions.length ?? flow.review.requestedPermissionCount;
  const status = getPluginManagerStatus({
    installedState,
    canLaunch: selectedCanLaunch,
    disabled,
  });
  const launchDisabledReason = disabled
    ? t("plugin.lab.manager.launchDisabled.disabled")
    : t("plugin.lab.manager.launchDisabled.guard");

  return (
    <div className="space-y-4" data-testid="plugin-manager">
      <div className={`rounded-2xl border p-4 ${managerStatusTone(status)}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">
              {t(`plugin.lab.manager.status.${status}`)}
            </p>
            <p className="mt-1 font-mono text-xs">
              {installedState
                ? `${installedState.appId}@${installedState.identity.appVersion}`
                : `${flow.review.appId}@${flow.review.appVersion}`}
            </p>
          </div>
          <span className="rounded-full border border-white/70 bg-white/70 px-2 py-1 text-xs font-medium">
            {t("plugin.lab.manager.installedApps", {
              count: repositoryList.length,
            })}
          </span>
        </div>
      </div>

      <div
        className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
        data-testid="plugin-manager-repository-list"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-semibold text-slate-900">
            {t("plugin.lab.manager.repository")}
          </p>
          <p className="text-sm text-slate-600">
            {t("plugin.lab.manager.repositorySummary", {
              count: repositoryList.length,
              issues: repositoryIssueCount,
            })}
          </p>
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {repositoryList.map((state) => {
            const isSelected = state.appId === installedState?.appId;
            const itemStatus = getPluginManagerStatus({
              installedState: state,
              canLaunch:
                state.readiness.status === "ready" ||
                state.readiness.status === "degraded",
              disabled: state.disabled,
            });
            return (
              <button
                key={state.appId}
                type="button"
                className={`rounded-2xl border p-3 text-left transition ${
                  isSelected
                    ? "border-sky-300 bg-white shadow-sm shadow-slate-950/5"
                    : "border-slate-200 bg-white hover:border-sky-200 hover:bg-sky-50"
                }`}
                data-testid={`plugin-manager-repository-app-${state.appId}`}
                onClick={() => onSelectApp(state.appId)}
              >
                <span className="flex items-center justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-slate-900">
                      {state.projection.app.displayName}
                    </span>
                    <span className="mt-1 block truncate font-mono text-xs text-slate-500">
                      {state.appId}@{state.identity.appVersion}
                    </span>
                  </span>
                  <span
                    className={`shrink-0 rounded-full border px-2 py-1 text-xs font-medium ${managerStatusTone(
                      itemStatus,
                    )}`}
                  >
                    {t(`plugin.lab.manager.status.${itemStatus}`)}
                  </span>
                </span>
                <span className="mt-2 block truncate font-mono text-xs text-slate-500">
                  {state.identity.sourceKind}:{state.identity.sourceUri}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-3" data-testid="plugin-manager-selected-app">
        <div
          className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
          data-testid="plugin-manager-repository"
        >
          <p className="text-sm font-semibold text-slate-900">
            {t("plugin.lab.manager.identity")}
          </p>
          <p className="mt-2 font-mono text-xs text-slate-600">
            {installedState
              ? `${installedState.identity.sourceKind}:${installedState.identity.sourceUri}`
              : `${flow.review.sourceKind}:${flow.review.sourceUri}`}
          </p>
          <p className="mt-2 font-mono text-xs text-slate-500">
            {installedState?.identity.packageHash ?? flow.review.packageHash}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-semibold text-slate-900">
            {t("plugin.lab.manager.readiness")}
          </p>
          <p className="mt-2 text-sm text-slate-600">
            {t("plugin.lab.manager.readinessSummary", {
              status: installedState?.readiness.status ?? flow.review.readinessStatus,
              setup: selectedSetupCount,
              permissions: selectedPermissionCount,
            })}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-semibold text-slate-900">
            {t("plugin.lab.manager.repository")}
          </p>
          <p className="mt-2 text-sm text-slate-600">
            {t("plugin.lab.manager.repositorySummary", {
              count: repositoryStates.length,
              issues: repositoryIssueCount,
            })}
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-semibold text-slate-900">
            {t("plugin.lab.manager.lifecycle")}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-white px-3 py-1.5 text-xs font-medium text-amber-700 transition hover:border-amber-300 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-60"
              data-testid="plugin-manager-disable"
              disabled={disabled || !installedState}
              onClick={() => installedState && onSetDisabled(true, installedState)}
            >
              <Ban size={14} />
              {t("plugin.lab.manager.action.disable")}
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white px-3 py-1.5 text-xs font-medium text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
              data-testid="plugin-manager-enable"
              disabled={!disabled || !installedState}
              onClick={() => installedState && onSetDisabled(false, installedState)}
            >
              <CheckCircle2 size={14} />
              {t("plugin.lab.manager.action.enable")}
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
          <Layers3 size={16} />
          {t("plugin.lab.manager.entries")}
        </div>
        <div className="grid gap-2 md:grid-cols-2">
          {installedState?.projection.entries.map((entry) => {
            const runtimeAvailable = isUiEntry(entry)
              ? uiRuntimeAvailable
              : capabilityHostAvailable;
            const isDisabled = disabled || !selectedCanLaunch || !runtimeAvailable;
            return (
              <button
                key={entry.key}
                type="button"
                className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-left text-sm transition hover:border-sky-200 hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-60"
                data-testid={`plugin-manager-launch-entry-${entry.key}`}
                disabled={isDisabled}
                title={isDisabled ? launchDisabledReason : entry.title}
                onClick={() => onLaunchEntry(entry, installedState)}
              >
                <span>
                  <span className="block font-medium text-slate-900">{entry.title}</span>
                  <span className="mt-1 block font-mono text-xs text-slate-500">
                    {entry.kind}:{entry.key}
                  </span>
                </span>
                <PlayCircle className="shrink-0 text-sky-600" size={16} />
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <button
          type="button"
          className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left transition hover:border-slate-300 hover:bg-white"
          data-testid="plugin-manager-uninstall-keep-data"
          onClick={() => installedState && onPreviewUninstall("keep-data", installedState)}
          disabled={!installedState}
        >
          <span className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Archive size={16} />
            {t("plugin.lab.manager.action.keepData")}
          </span>
          <span className="mt-2 block text-sm text-slate-600">
            {t("plugin.lab.manager.uninstallCounts", {
              deleted: flow.uninstallPreview.keepData.deletedTargetCount,
              retained: flow.uninstallPreview.keepData.retainedTargetCount,
            })}
          </span>
        </button>
        <button
          type="button"
          className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-left transition hover:border-rose-300 hover:bg-white"
          data-testid="plugin-manager-uninstall-delete-data"
          onClick={() =>
            installedState && onPreviewUninstall("delete-data", installedState)
          }
          disabled={!installedState}
        >
          <span className="inline-flex items-center gap-2 text-sm font-semibold text-rose-900">
            <Archive size={16} />
            {t("plugin.lab.manager.action.deleteData")}
          </span>
          <span className="mt-2 block text-sm text-rose-700">
            {t("plugin.lab.manager.uninstallCounts", {
              deleted: flow.uninstallPreview.deleteData.deletedTargetCount,
              retained: flow.uninstallPreview.deleteData.retainedTargetCount,
            })}
          </span>
        </button>
      </div>

      {evidence ? (
        <div
          className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4"
          data-testid="plugin-manager-cleanup-evidence"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-white px-2 py-1 text-xs font-medium text-emerald-700">
              {t(`plugin.lab.manager.evidence.action.${evidence.action}`)}
            </span>
            {evidence.entryKey ? (
              <span className="font-mono text-xs text-emerald-700">
                {evidence.entryKey}
              </span>
            ) : null}
            {evidence.guardStatus ? (
              <span className="font-mono text-xs text-emerald-700">
                guard:{evidence.guardStatus}
              </span>
            ) : null}
          </div>
          <p className="mt-2 text-sm text-emerald-800">
            {t("plugin.lab.manager.evidence.summary", {
              deleted:
                evidence.cleanupEvidence?.deletedTargetCount ??
                evidence.deletedTargetCount,
              retained:
                evidence.cleanupEvidence?.retainedTargetCount ??
                evidence.retainedTargetCount,
            })}
          </p>
          {evidence.cleanupEvidence ? (
            <div className="mt-3 space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-xs text-emerald-700">
                <span className="rounded-full border border-emerald-200 bg-white px-2 py-1 font-medium">
                  {evidence.cleanupEvidence.strategy}
                </span>
                <span className="rounded-full border border-emerald-200 bg-white px-2 py-1 font-medium">
                  {t("plugin.lab.manager.evidence.blockedSummary", {
                    count: evidence.cleanupEvidence.blockedTargetCount,
                  })}
                </span>
              </div>
              <div className="rounded-2xl border border-emerald-200 bg-white p-3">
                <p className="text-xs font-semibold text-emerald-900">
                  {t("plugin.lab.manager.evidence.jsonPreview")}
                </p>
                <pre
                  className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-xl bg-slate-950 p-3 text-xs leading-5 text-emerald-50"
                  data-testid="plugin-manager-evidence-json"
                >
                  {JSON.stringify(evidence.cleanupEvidence, null, 2)}
                </pre>
              </div>
              {evidence.residualAudit ? (
                <div
                  className="grid gap-2 rounded-2xl border border-emerald-200 bg-white p-3 sm:grid-cols-2"
                  data-testid="plugin-manager-residual-audit"
                >
                  <p className="sm:col-span-2 text-xs font-semibold text-emerald-900">
                    {t("plugin.lab.manager.evidence.residualTitle")}
                  </p>
                  <span
                    className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700"
                    data-testid="plugin-manager-residual-retained"
                  >
                    {t("plugin.lab.manager.evidence.residual.retained", {
                      count: evidence.residualAudit.retainedCount,
                    })}
                  </span>
                  <span
                    className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700"
                    data-testid="plugin-manager-residual-pending"
                  >
                    {t("plugin.lab.manager.evidence.residual.pendingDeletion", {
                      count: evidence.residualAudit.pendingDeletionCount,
                    })}
                  </span>
                  <span
                    className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700"
                    data-testid="plugin-manager-residual-blocked"
                  >
                    {t("plugin.lab.manager.evidence.residual.blockedOutOfScope", {
                      count: evidence.residualAudit.blockedOutOfScopeCount,
                    })}
                  </span>
                  <span
                    className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-700"
                    data-testid="plugin-manager-residual-repository"
                  >
                    {t("plugin.lab.manager.evidence.residual.repositoryIssue", {
                      count: evidence.residualAudit.repositoryIssueCount,
                    })}
                  </span>
                </div>
              ) : null}
            </div>
          ) : null}
          <p className="mt-2 font-mono text-xs text-emerald-700">
            {evidence.packageHash} / {evidence.manifestHash}
          </p>
          <p className="mt-2 text-xs text-emerald-700">
            {t("plugin.lab.manager.evidence.noNonAppData")}
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          {t("plugin.lab.manager.evidence.empty")}
        </div>
      )}
    </div>
  );
}
