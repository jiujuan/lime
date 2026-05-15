import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Archive,
  Ban,
  Boxes,
  CheckCircle2,
  Cloud,
  FolderOpen,
  Layers3,
  PlayCircle,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import {
  AGENT_APPS_CHANGED_EVENT,
  saveInstalledAgentAppState,
  getAgentAppCloudCatalog,
  listInstalledAgentApps,
  previewAgentAppUninstall,
  reviewCloudAgentAppRelease,
  reviewLocalAgentAppPackage,
  selectLocalAgentAppDirectory,
  setAgentAppDisabled,
  submitAgentAppRegistrationCode,
  uninstallAgentApp,
  type AgentAppCloudCatalogResult,
  type AgentAppInstallReviewResult,
  type AgentAppUninstallRehearsalResult,
} from "@/lib/api/agentApps";
import { buildCloudAgentAppSourceState } from "../install/installReview";
import { resolveAgentAppHostFlags } from "../featureFlag";
import { InMemoryAgentAppCapabilityStore } from "../adapters/InMemoryAgentAppCapabilityStore";
import { AdapterCapabilityHost } from "../adapters/AdapterCapabilityHost";
import { buildCleanupPlan } from "../install/cleanupPlan";
import {
  buildAgentAppLifecycleLaunchGate,
  buildAgentAppLifecycleToggleDescriptor,
  buildAgentAppLifecycleUninstallRehearsalDescriptor,
  type AgentAppLifecycleUninstallRehearsalDescriptor,
} from "../install/lifecycleAction";
import { buildRuntimePackageLoadForPreview } from "./agentAppsRuntime";
import { resolveInstalledAgentAppDisplayName } from "./agentAppDisplay";
import { UiExtensionHost } from "../runtime/uiExtensionHost";
import { WorkflowRuntimeHost } from "../runtime/workflowRuntimeHost";
import { evaluateAgentAppEntryRuntimeGuard } from "../runtime/entryRuntimeGuard";
import { buildWorkflowRuntimeCapabilityProfile } from "../runtime/workflowRuntimeCapabilityProfile";
import type {
  AgentAppPageParams,
  AgentAppsPageParams,
  Page,
  PageParams,
} from "@/types/page";
import type {
  AgentAppUiMountResult,
  CloudBootstrapApp,
  HostCapabilityProfile,
  InstalledAppPreview,
  InstalledAgentAppState,
  ProjectedEntry,
} from "../types";

const PAGE_FLAGS = resolveAgentAppHostFlags({
  labEnabled: true,
  localPackageEnabled: true,
  projectionEnabled: true,
  readinessEnabled: true,
  cleanupDryRunEnabled: true,
  realAdapterEnabled: true,
  uiRuntimeEnabled: true,
  workerRuntimeEnabled: true,
  cloudBootstrapEnabled: true,
});

function buildProfile(): HostCapabilityProfile {
  return buildWorkflowRuntimeCapabilityProfile({
    ...PAGE_FLAGS,
    realAdapterEnabled: true,
    uiRuntimeEnabled: true,
    workerRuntimeEnabled: true,
  });
}

function statusClass(disabled: boolean, status: string): string {
  if (disabled) {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }
  if (status === "ready" || status === "degraded") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (status === "needs-setup") {
    return "border-sky-200 bg-sky-50 text-sky-700";
  }
  return "border-rose-200 bg-rose-50 text-rose-700";
}

function isUiEntry(entry: ProjectedEntry): boolean {
  return ["page", "panel", "settings"].includes(entry.kind);
}

function buildPreviewFromInstalledState(
  state: InstalledAgentAppState,
): InstalledAppPreview {
  return {
    identity: state.identity,
    manifest: state.manifest,
    projection: state.projection,
    readiness: state.readiness,
    cleanupPlan: buildCleanupPlan({
      projection: state.projection,
      generatedAt: state.updatedAt,
    }),
  };
}

function dispatchAgentAppsChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(AGENT_APPS_CHANGED_EVENT));
  }
}

export function AgentAppsPage({
  onNavigate,
  pageParams,
}: {
  onNavigate?: (page: Page, params?: PageParams) => void;
  pageParams?: AgentAppsPageParams;
}) {
  const { t } = useTranslation("agent");
  const profile = useMemo(buildProfile, []);
  const adapterStore = useMemo(() => new InMemoryAgentAppCapabilityStore(), []);
  const [installed, setInstalled] = useState<InstalledAgentAppState[]>([]);
  const [issueCount, setIssueCount] = useState(0);
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null);
  const [cloudCatalog, setCloudCatalog] = useState<AgentAppCloudCatalogResult | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [registrationCodes, setRegistrationCodes] = useState<Record<string, string>>(
    {},
  );
  const [launchSummary, setLaunchSummary] = useState<string | null>(null);
  const [mountedUi, setMountedUi] = useState<AgentAppUiMountResult | null>(null);
  const [installReview, setInstallReview] =
    useState<AgentAppInstallReviewResult | null>(null);
  const [uninstallPreview, setUninstallPreview] =
    useState<AgentAppUninstallRehearsalResult | null>(null);
  const [uninstallDescriptor, setUninstallDescriptor] =
    useState<AgentAppLifecycleUninstallRehearsalDescriptor | null>(null);
  const handledLaunchRequestRef = useRef<string | null>(null);

  const selected =
    installed.find((state) => state.appId === selectedAppId) ?? installed[0] ?? null;
  const cloudApps = cloudCatalog?.payload.apps ?? [];
  const activeUninstallDescriptor =
    uninstallPreview &&
    uninstallDescriptor?.appId === uninstallPreview.appId &&
    uninstallDescriptor.mode === uninstallPreview.mode
      ? uninstallDescriptor
      : null;

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [list, catalog] = await Promise.all([
        listInstalledAgentApps(),
        getAgentAppCloudCatalog(),
      ]);
      setInstalled(list.states);
      setIssueCount(list.issues.length);
      setCloudCatalog(catalog);
      setSelectedAppId((current) => {
        const requestedAppId = pageParams?.selectedAgentAppId?.trim();
        return requestedAppId || current || list.states[0]?.appId || null;
      });
    } finally {
      setLoading(false);
    }
  }, [pageParams?.selectedAgentAppId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const requestedAppId = pageParams?.selectedAgentAppId?.trim();
    if (requestedAppId) {
      setSelectedAppId(requestedAppId);
    }
  }, [pageParams?.selectedAgentAppId]);

  const runBusy = useCallback(async <T,>(
    key: string,
    action: () => Promise<T>,
  ): Promise<T | null> => {
    function describeOperationError(error: unknown): string {
      if (
        error instanceof Error &&
        error.name === "AgentAppRegistrationRequiredError"
      ) {
        return t("agentApp.apps.registration.localInstallBlocked");
      }
      return error instanceof Error ? error.message : String(error);
    }

    setBusyAction(key);
    try {
      return await action();
    } catch (error) {
      toast.error(t("agentApp.apps.toast.failed"), {
        description: describeOperationError(error),
      });
      return null;
    } finally {
      setBusyAction(null);
    }
  }, [t]);

  async function handleInstallLocal() {
    setBusyAction("select-local");
    let appDir: string | null;
    try {
      appDir = await selectLocalAgentAppDirectory({
        title: t("agentApp.apps.localSource.dialogTitle"),
      });
    } catch (error) {
      toast.error(t("agentApp.apps.toast.failed"), {
        description: error instanceof Error ? error.message : String(error),
      });
      setBusyAction(null);
      return;
    }
    setBusyAction(null);

    if (!appDir) {
      toast.info(t("agentApp.apps.toast.localSelectionCancelled"));
      return;
    }

    const review = await runBusy("review-local", () =>
      reviewLocalAgentAppPackage({
        appDir,
        profile,
      }),
    );
    if (!review) {
      return;
    }
    setInstallReview(review);
  }

  async function handleConfirmInstallReview() {
    if (!installReview) {
      return;
    }
    const state = await runBusy(`confirm-install:${installReview.review.appId}`, () =>
      saveInstalledAgentAppState({ state: installReview.state }),
    );
    if (!state) {
      return;
    }
    toast.success(t("agentApp.apps.toast.installed"), {
      description: resolveInstalledAgentAppDisplayName(state),
    });
    setSelectedAppId(state.appId);
    setInstallReview(null);
    dispatchAgentAppsChanged();
    await refresh();
  }

  async function handleInstallCloud(app: CloudBootstrapApp) {
    if (app.registrationRequired && app.registrationState !== "active") {
      toast.error(t("agentApp.apps.registration.required"));
      return;
    }
    const review = await runBusy(`review-cloud:${app.appId}`, () =>
      reviewCloudAgentAppRelease({
        app,
        profile,
        installed,
        catalogSource: cloudCatalog?.source ?? "seeded",
      }),
    );
    if (!review) {
      return;
    }
    setInstallReview(review);
  }

  async function handleSubmitRegistration(app: CloudBootstrapApp) {
    const code = registrationCodes[app.appId]?.trim() ?? "";
    if (!code) {
      toast.error(t("agentApp.apps.registration.codeRequired"));
      return;
    }
    const result = await runBusy(`registration:${app.appId}`, () =>
      submitAgentAppRegistrationCode(app.appId, code),
    );
    if (!result) {
      return;
    }
    setRegistrationCodes((current) => ({
      ...current,
      [app.appId]: "",
    }));
    toast.success(t("agentApp.apps.toast.registered"), {
      description: app.displayName ?? app.appId,
    });
    await refresh();
    setCloudCatalog(result);
  }

  function updateRegistrationCode(appId: string, value: string) {
    setRegistrationCodes((current) => ({
      ...current,
      [appId]: value,
    }));
  }

  function sourceStateClass(tone: string): string {
    if (tone === "emerald") {
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    }
    if (tone === "amber") {
      return "border-amber-200 bg-amber-50 text-amber-700";
    }
    if (tone === "rose") {
      return "border-rose-200 bg-rose-50 text-rose-700";
    }
    if (tone === "sky") {
      return "border-sky-200 bg-sky-50 text-sky-700";
    }
    return "border-slate-200 bg-slate-50 text-slate-600";
  }

  async function handleSetDisabled(state: InstalledAgentAppState, disabled: boolean) {
    const descriptor = buildAgentAppLifecycleToggleDescriptor({
      state,
      action: disabled ? "disable" : "enable",
    });
    if (descriptor.status === "noop") {
      return;
    }
    const result = await runBusy(`${descriptor.action}:${descriptor.appId}`, () =>
      setAgentAppDisabled(descriptor.request),
    );
    if (!result) {
      return;
    }
    setInstalled(result.states);
    setIssueCount(result.issues.length);
    dispatchAgentAppsChanged();
    toast.success(
      disabled
        ? t("agentApp.apps.toast.disabled")
        : t("agentApp.apps.toast.enabled"),
      { description: resolveInstalledAgentAppDisplayName(state) },
    );
  }

  async function handlePreviewUninstall(
    state: InstalledAgentAppState,
    mode: "keep-data" | "delete-data",
  ) {
    const preview = buildPreviewFromInstalledState(state);
    const descriptor = buildAgentAppLifecycleUninstallRehearsalDescriptor({
      state,
      cleanupPlan: preview.cleanupPlan,
      mode,
    });
    if (descriptor.status === "blocked") {
      setUninstallDescriptor(descriptor);
      setUninstallPreview(null);
      return;
    }
    const result = await runBusy(`uninstall:${descriptor.appId}:${mode}`, () =>
      previewAgentAppUninstall(descriptor.request),
    );
    if (result) {
      setUninstallDescriptor(descriptor);
      setUninstallPreview(result);
    }
  }

  async function handleConfirmUninstall() {
    if (!uninstallPreview) {
      return;
    }
    const descriptor =
      uninstallDescriptor?.appId === uninstallPreview.appId &&
      uninstallDescriptor.mode === uninstallPreview.mode
        ? uninstallDescriptor
        : null;
    if (!descriptor || descriptor.status !== "ready") {
      return;
    }
    const result = await runBusy(
      `confirm-uninstall:${uninstallPreview.appId}:${uninstallPreview.mode}`,
      () => uninstallAgentApp(descriptor.request),
    );
    if (!result) {
      return;
    }
    setInstalled(result.list.states);
    setIssueCount(result.list.issues.length);
    setSelectedAppId(result.list.states[0]?.appId ?? null);
    setUninstallPreview(null);
    setUninstallDescriptor(null);
    setLaunchSummary(
      t("agentApp.apps.uninstall.completed", {
        removed: result.removedTargetCount,
        missing: result.missingTargetCount,
      }),
    );
    dispatchAgentAppsChanged();
    toast.success(t("agentApp.apps.toast.uninstalled"));
  }

  const handleLaunchEntry = useCallback(async (
    state: InstalledAgentAppState,
    entry: ProjectedEntry,
  ) => {
    const launchGate = buildAgentAppLifecycleLaunchGate(state);
    if (!launchGate.allowed) {
      return;
    }
    await runBusy(`launch:${state.appId}:${entry.key}`, async () => {
      const preview = buildPreviewFromInstalledState(state);
      const guard = evaluateAgentAppEntryRuntimeGuard({
        preview,
        entryKey: entry.key,
        flags: PAGE_FLAGS,
        operation: isUiEntry(entry) ? "mount-ui" : "run-entry",
        runtimePackageLoad: buildRuntimePackageLoadForPreview(preview),
        permissionDecision: "accepted",
        lifecycle: {
          disabled: state.disabled,
          cleanupStatus:
            uninstallDescriptor?.appId === state.appId &&
            uninstallDescriptor.status === "blocked"
              ? "blocked"
              : "ready",
          cleanupBlockerCodes:
            uninstallDescriptor?.appId === state.appId
              ? uninstallDescriptor.blockerCodes
              : [],
        },
      });
      if (guard.status !== "allow") {
        setLaunchSummary(t(`agentApp.lab.guard.summary.${guard.status}`));
        return;
      }

      if (isUiEntry(entry)) {
        if (onNavigate) {
          const runtimeParams: AgentAppPageParams = {
            appId: state.appId,
            entryKey: entry.key,
            launchRequestKey: Date.now(),
          };
          onNavigate("agent-app", runtimeParams);
          return;
        }
        const mount = new UiExtensionHost({ preview, flags: PAGE_FLAGS }).mountEntry(
          entry.key,
        );
        setMountedUi(mount);
        setLaunchSummary(
          t("agentApp.apps.launch.uiMounted", {
            title: mount.title,
            route: mount.route ?? entry.key,
          }),
        );
        return;
      }

      const host = new AdapterCapabilityHost({
        preview,
        realAdapterEnabled: true,
        store: adapterStore,
      });
      const workflowHost = new WorkflowRuntimeHost({
        host,
        flags: PAGE_FLAGS,
      });
      if (entry.kind === "workflow") {
        const result = await workflowHost.runWorkflow({
          workflowKey: entry.key,
          entryKey: entry.key,
          title: entry.title,
          steps: [
            {
              id: "record-launch",
              kind: "evidence.record",
              evidenceKind: "agent_app_entry_launch",
              message: `Agent App entry ${entry.key} launched from Agent Apps.`,
            },
          ],
        });
        setLaunchSummary(
          t("agentApp.apps.launch.workflowCompleted", {
            title: entry.title,
            runId: result.run.runId,
          }),
        );
        return;
      }
      const result = await host.runEntry(entry.key);
      setMountedUi(null);
      setLaunchSummary(
        t("agentApp.apps.launch.entryCompleted", {
          title: entry.title,
          runId: result.run.runId,
        }),
      );
    });
  }, [adapterStore, onNavigate, runBusy, t, uninstallDescriptor]);

  useEffect(() => {
    const requestedAppId = pageParams?.selectedAgentAppId?.trim();
    const requestedEntryKey = pageParams?.launchAgentAppEntryKey?.trim();
    if (!requestedAppId || !requestedEntryKey) {
      return;
    }
    const requestKey = `${requestedAppId}:${requestedEntryKey}:${
      pageParams?.launchRequestKey ?? 0
    }`;
    if (handledLaunchRequestRef.current === requestKey || loading) {
      return;
    }
    const state = installed.find((item) => item.appId === requestedAppId);
    const entry = state?.projection.entries.find(
      (item) => item.key === requestedEntryKey,
    );
    if (!state || !entry) {
      return;
    }
    handledLaunchRequestRef.current = requestKey;
    void handleLaunchEntry(state, entry);
  }, [
    installed,
    loading,
    pageParams?.launchAgentAppEntryKey,
    pageParams?.launchRequestKey,
    pageParams?.selectedAgentAppId,
    handleLaunchEntry,
  ]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-50">
      <div className="flex-1 overflow-auto px-6 py-6">
        <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-5">
          <header className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <div className="rounded-2xl border border-slate-200 bg-white p-2 text-slate-700 shadow-sm shadow-slate-950/5">
                  <Boxes size={20} />
                </div>
                <div>
                  <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                    {t("agentApp.apps.badge.formalEntry")}
                  </span>
                  <h1 className="text-xl font-semibold text-slate-950">
                    {t("agentApp.apps.title")}
                  </h1>
                  <p className="mt-1 text-sm text-slate-600">
                    {t("agentApp.apps.description")}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    {t("agentApp.apps.boundaryNote")}
                  </p>
                </div>
              </div>
            </div>
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm shadow-slate-950/5 transition hover:border-slate-300"
              onClick={() => void refresh()}
              disabled={loading}
              data-testid="agent-apps-refresh"
            >
              <RefreshCw size={16} />
              {t("agentApp.apps.action.refresh")}
            </button>
          </header>

          <section className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
            <div className="space-y-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-950/5">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <FolderOpen size={16} />
                    {t("agentApp.apps.localSource.title")}
                  </div>
                  <span className="rounded-full border border-slate-200 px-2 py-1 text-xs text-slate-600">
                    local
                  </span>
                </div>
                <p className="text-xs leading-5 text-slate-500">
                  {t("agentApp.apps.localSource.description")}
                </p>
                <button
                  type="button"
                  className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-slate-950 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={Boolean(busyAction)}
                  onClick={() => void handleInstallLocal()}
                  data-testid="agent-apps-install-local"
                >
                  <ShieldCheck size={16} />
                  {t("agentApp.apps.action.selectAndInstallLocal")}
                </button>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-950/5">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <Cloud size={16} />
                    {t("agentApp.apps.cloudSource.title")}
                  </div>
                  <span className="rounded-full border border-slate-200 px-2 py-1 text-xs text-slate-600">
                    {cloudCatalog?.source ?? "seeded"}
                  </span>
                </div>
                <div className="space-y-2">
                  {cloudApps.map((app) => {
                    const registrationBlocked =
                      app.registrationRequired && app.registrationState !== "active";
                    const sourceState = buildCloudAgentAppSourceState({
                      app,
                      catalogSource: cloudCatalog?.source ?? "seeded",
                      installed,
                    });
                    return (
                      <div
                        key={`${app.appId}:${app.version}`}
                        className="rounded-2xl border border-slate-200 bg-slate-50 p-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <span className="block text-sm font-semibold text-slate-900">
                              {app.displayName ?? app.appId}
                            </span>
                            <span className="mt-1 block truncate font-mono text-xs text-slate-500">
                              {app.appId}@{app.version}
                            </span>
                          </div>
                          {app.registrationRequired ? (
                            <span className="shrink-0 rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700">
                              {t("agentApp.apps.registration.badge")}
                            </span>
                          ) : null}
                        </div>
                        <div
                          className={`mt-3 rounded-xl border px-3 py-2 text-xs font-medium ${sourceStateClass(
                            sourceState.tone,
                          )}`}
                          data-testid={`agent-apps-source-state-${app.appId}`}
                        >
                          {t(sourceState.labelKey)}
                          {sourceState.reason ? (
                            <span className="ml-1 font-normal">
                              {sourceState.reason}
                            </span>
                          ) : null}
                        </div>
                        {registrationBlocked ? (
                          <div
                            className="mt-3 rounded-xl border border-amber-200 bg-white p-3"
                            data-testid={`agent-apps-registration-${app.appId}`}
                          >
                            <p className="text-xs font-medium text-amber-800">
                              {t("agentApp.apps.registration.required")}
                            </p>
                            <p className="mt-1 text-xs text-slate-600">
                              {app.registrationHint ??
                                t("agentApp.apps.registration.hintFallback", {
                                  state: app.registrationState ?? "required",
                                })}
                            </p>
                            <div className="mt-3 flex gap-2">
                              <input
                                className="min-w-0 flex-1 rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 outline-none transition focus:border-amber-300"
                                value={registrationCodes[app.appId] ?? ""}
                                onChange={(event) =>
                                  updateRegistrationCode(app.appId, event.target.value)
                                }
                                onInput={(event) =>
                                  updateRegistrationCode(
                                    app.appId,
                                    event.currentTarget.value,
                                  )
                                }
                                placeholder={t(
                                  "agentApp.apps.registration.placeholder",
                                )}
                                aria-label={t(
                                  "agentApp.apps.registration.placeholder",
                                )}
                                data-testid={`agent-apps-registration-code-${app.appId}`}
                              />
                              <button
                                type="button"
                                className="shrink-0 rounded-full bg-amber-700 px-3 py-2 text-xs font-medium text-white transition hover:bg-amber-800 disabled:cursor-not-allowed disabled:opacity-60"
                                disabled={Boolean(busyAction)}
                                onClick={() => void handleSubmitRegistration(app)}
                                data-testid={`agent-apps-submit-registration-${app.appId}`}
                              >
                                {t("agentApp.apps.registration.submit")}
                              </button>
                            </div>
                          </div>
                        ) : null}
                        <button
                          type="button"
                          className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-sky-200 hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-60"
                          disabled={Boolean(busyAction) || !sourceState.canReview}
                          onClick={() => void handleInstallCloud(app)}
                          data-testid={`agent-apps-install-cloud-${app.appId}`}
                        >
                          <ShieldCheck size={16} />
                          {t("agentApp.apps.action.installCloud")}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              {installReview ? (
                <div
                  className="rounded-2xl border border-sky-200 bg-white p-4 shadow-sm shadow-slate-950/5"
                  data-testid="agent-apps-install-review"
                >
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-950">
                        {t("agentApp.apps.installReview.title")}
                      </p>
                      <p className="mt-1 text-xs leading-5 text-slate-500">
                        {t("agentApp.apps.installReview.description")}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full border px-2 py-1 text-xs font-medium ${sourceStateClass(
                        installReview.review.sourceState.tone,
                      )}`}
                    >
                      {t(installReview.review.sourceState.labelKey)}
                    </span>
                  </div>
                  <div className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        {installReview.review.displayName}
                      </p>
                      <p className="mt-1 truncate font-mono text-xs text-slate-500">
                        {installReview.review.appId}@{installReview.review.version}
                      </p>
                    </div>
                    <div className="grid gap-2 text-xs text-slate-600">
                      <p>
                        {t("agentApp.apps.installReview.source", {
                          kind: installReview.review.sourceKind,
                        })}
                      </p>
                      <p className="truncate font-mono">
                        {installReview.review.sourceUri}
                      </p>
                      <p>
                        {t("agentApp.apps.installReview.hashes", {
                          packageHash: installReview.review.packageHash,
                          manifestHash: installReview.review.manifestHash,
                        })}
                      </p>
                      <p>
                        {t("agentApp.apps.installReview.summary", {
                          entries: installReview.review.entryCount,
                          capabilities: installReview.review.capabilityCount,
                          cleanupTargets: installReview.review.cleanupTargetCount,
                        })}
                      </p>
                      <p>
                        {t("agentApp.apps.installReview.readiness", {
                          status: installReview.review.readinessStatus,
                          blockers: installReview.review.blockerCount,
                          warnings: installReview.review.warningCount,
                        })}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-slate-950 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={Boolean(busyAction)}
                      onClick={() => void handleConfirmInstallReview()}
                      data-testid="agent-apps-install-review-confirm"
                    >
                      <ShieldCheck size={16} />
                      {t("agentApp.apps.installReview.confirm")}
                    </button>
                    <button
                      type="button"
                      className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={Boolean(busyAction)}
                      onClick={() => setInstallReview(null)}
                      data-testid="agent-apps-install-review-cancel"
                    >
                      {t("agentApp.apps.installReview.cancel")}
                    </button>
                  </div>
                </div>
              ) : null}

              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-950/5">
                <div className="mb-3 text-sm font-semibold text-slate-900">
                  {t("agentApp.apps.installed.title")}
                </div>
                <div className="space-y-2">
                  {installed.map((state) => (
                    <button
                      key={state.appId}
                      type="button"
                      className={`w-full rounded-2xl border p-3 text-left transition ${
                        selected?.appId === state.appId
                          ? "border-sky-300 bg-sky-50"
                          : "border-slate-200 bg-slate-50 hover:border-sky-200"
                      }`}
                      onClick={() => setSelectedAppId(state.appId)}
                      data-testid={`agent-apps-installed-${state.appId}`}
                    >
                      <span className="flex items-center justify-between gap-3">
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold text-slate-900">
                            {resolveInstalledAgentAppDisplayName(state)}
                          </span>
                          <span className="mt-1 block truncate font-mono text-xs text-slate-500">
                            {state.appId}@{state.identity.appVersion}
                          </span>
                        </span>
                        <span
                          className={`shrink-0 rounded-full border px-2 py-1 text-xs font-medium ${statusClass(
                            state.disabled,
                            state.readiness.status,
                          )}`}
                        >
                          {state.disabled
                            ? t("agentApp.apps.status.disabled")
                            : t(`agentApp.lab.status.${state.readiness.status}`)}
                        </span>
                      </span>
                    </button>
                  ))}
                  {installed.length === 0 ? (
                    <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                      {t("agentApp.apps.installed.empty")}
                    </p>
                  ) : null}
                </div>
                <p className="mt-3 text-xs text-slate-500">
                  {t("agentApp.apps.installed.issues", { count: issueCount })}
                </p>
              </div>
            </div>

            <main className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-950/5">
              {selected ? (
                <div className="space-y-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <h2 className="text-lg font-semibold text-slate-950">
                        {resolveInstalledAgentAppDisplayName(selected)}
                      </h2>
                      <p className="mt-1 max-w-3xl text-sm text-slate-600">
                        {selected.projection.app.description}
                      </p>
                      <p className="mt-2 font-mono text-xs text-slate-500">
                        {selected.identity.sourceKind}:{selected.identity.sourceUri}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-white px-3 py-2 text-sm font-medium text-amber-700 transition hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={selected.disabled || Boolean(busyAction)}
                        onClick={() => void handleSetDisabled(selected, true)}
                        data-testid="agent-apps-disable"
                      >
                        <Ban size={16} />
                        {t("agentApp.apps.action.disable")}
                      </button>
                      <button
                        type="button"
                        className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white px-3 py-2 text-sm font-medium text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={!selected.disabled || Boolean(busyAction)}
                        onClick={() => void handleSetDisabled(selected, false)}
                        data-testid="agent-apps-enable"
                      >
                        <CheckCircle2 size={16} />
                        {t("agentApp.apps.action.enable")}
                      </button>
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-sm font-semibold text-slate-900">
                        {t("agentApp.apps.detail.readiness")}
                      </p>
                      <p className="mt-2 text-sm text-slate-600">
                        {selected.readiness.status}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-sm font-semibold text-slate-900">
                        {t("agentApp.apps.detail.entries")}
                      </p>
                      <p className="mt-2 text-sm text-slate-600">
                        {selected.projection.entries.length}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-sm font-semibold text-slate-900">
                        {t("agentApp.apps.detail.hash")}
                      </p>
                      <p className="mt-2 truncate font-mono text-xs text-slate-600">
                        {selected.identity.packageHash}
                      </p>
                    </div>
                  </div>

                  <section>
                    <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
                      <Layers3 size={16} />
                      {t("agentApp.apps.entries.title")}
                    </div>
                    <div className="grid gap-2 md:grid-cols-2">
                      {selected.projection.entries.map((entry) => (
                        <button
                          key={entry.key}
                          type="button"
                          className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-left transition hover:border-sky-200 hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-60"
                          disabled={selected.disabled || Boolean(busyAction)}
                          onClick={() => void handleLaunchEntry(selected, entry)}
                          data-testid={`agent-apps-launch-entry-${entry.key}`}
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium text-slate-900">
                              {entry.title}
                            </span>
                            <span className="mt-1 block truncate font-mono text-xs text-slate-500">
                              {entry.kind}:{entry.key}
                            </span>
                          </span>
                          <PlayCircle className="shrink-0 text-sky-600" size={16} />
                        </button>
                      ))}
                    </div>
                  </section>

                  {mountedUi && mountedUi.appId === selected.appId ? (
                    <section
                      className="rounded-2xl border border-sky-200 bg-sky-50 p-4"
                      data-testid="agent-apps-mounted-ui"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-950">
                            {t("agentApp.apps.surface.title", {
                              title: mountedUi.title,
                            })}
                          </p>
                          <p className="mt-1 font-mono text-xs text-slate-600">
                            {mountedUi.route ?? mountedUi.entryKey}
                          </p>
                        </div>
                        <span className="rounded-full border border-sky-200 bg-white px-2 py-1 text-xs font-medium text-sky-700">
                          {mountedUi.entryKind}
                        </span>
                      </div>
                      <div className="mt-3 grid gap-2 md:grid-cols-2">
                        <div className="rounded-xl border border-sky-100 bg-white px-3 py-2">
                          <p className="text-xs font-medium text-slate-500">
                            {t("agentApp.apps.surface.bundle")}
                          </p>
                          <p className="mt-1 truncate font-mono text-xs text-slate-700">
                            {mountedUi.bundlePath}
                          </p>
                        </div>
                        <div className="rounded-xl border border-sky-100 bg-white px-3 py-2">
                          <p className="text-xs font-medium text-slate-500">
                            {t("agentApp.apps.surface.capabilities")}
                          </p>
                          <p className="mt-1 truncate text-xs text-slate-700">
                            {mountedUi.sdkBridge.allowedCapabilities.join(", ") ||
                              t("agentApp.apps.surface.noCapabilities")}
                          </p>
                        </div>
                      </div>
                    </section>
                  ) : null}

                  <section className="grid gap-3 md:grid-cols-2">
                    <button
                      type="button"
                      className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left transition hover:border-slate-300 hover:bg-white"
                      disabled={Boolean(busyAction)}
                      onClick={() => void handlePreviewUninstall(selected, "keep-data")}
                      data-testid="agent-apps-uninstall-keep-data"
                    >
                      <span className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900">
                        <Archive size={16} />
                        {t("agentApp.apps.action.uninstallKeepData")}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-left transition hover:border-rose-300 hover:bg-white"
                      disabled={Boolean(busyAction)}
                      onClick={() => void handlePreviewUninstall(selected, "delete-data")}
                      data-testid="agent-apps-uninstall-delete-data"
                    >
                      <span className="inline-flex items-center gap-2 text-sm font-semibold text-rose-900">
                        <Archive size={16} />
                        {t("agentApp.apps.action.uninstallDeleteData")}
                      </span>
                    </button>
                  </section>

                  {launchSummary ? (
                    <div
                      className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"
                      data-testid="agent-apps-launch-summary"
                    >
                      {launchSummary}
                    </div>
                  ) : null}
                  {uninstallPreview ? (
                    <div
                      className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                      data-testid="agent-apps-uninstall-preview"
                    >
                      <p className="text-sm font-semibold text-slate-900">
                        {t("agentApp.apps.uninstallPreview.title")}
                      </p>
                      <p className="mt-2 text-sm text-slate-600">
                        {t("agentApp.apps.uninstallPreview.summary", {
                          deleted: uninstallPreview.deletedTargetCount,
                          retained: uninstallPreview.retainedTargetCount,
                        })}
                      </p>
                      {activeUninstallDescriptor ? (
                        <div
                          className="mt-3 space-y-3 rounded-2xl border border-emerald-200 bg-white p-3"
                          data-testid="agent-apps-cleanup-evidence"
                        >
                          <div className="flex flex-wrap items-center gap-2 text-xs text-emerald-700">
                            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 font-medium">
                              {activeUninstallDescriptor.cleanupEvidence.strategy}
                            </span>
                            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 font-medium">
                              {t("agentApp.lab.manager.evidence.blockedSummary", {
                                count:
                                  activeUninstallDescriptor.cleanupEvidence
                                    .blockedTargetCount,
                              })}
                            </span>
                          </div>
                          <p className="text-sm text-emerald-800">
                            {t("agentApp.lab.manager.evidence.summary", {
                              deleted:
                                activeUninstallDescriptor.cleanupEvidence
                                  .deletedTargetCount,
                              retained:
                                activeUninstallDescriptor.cleanupEvidence
                                  .retainedTargetCount,
                            })}
                          </p>
                          <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-3">
                            <p className="text-xs font-semibold text-emerald-900">
                              {t("agentApp.lab.manager.evidence.jsonPreview")}
                            </p>
                            <pre
                              className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-xl bg-slate-950 p-3 text-xs leading-5 text-emerald-50"
                              data-testid="agent-apps-cleanup-evidence-json"
                            >
                              {JSON.stringify(
                                activeUninstallDescriptor.cleanupEvidence,
                                null,
                                2,
                              )}
                            </pre>
                          </div>
                          <div
                            className="grid gap-2 rounded-2xl border border-emerald-100 bg-white p-3 sm:grid-cols-2"
                            data-testid="agent-apps-residual-audit"
                          >
                            <p className="text-xs font-semibold text-emerald-900 sm:col-span-2">
                              {t("agentApp.lab.manager.evidence.residualTitle")}
                            </p>
                            <span className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                              {t("agentApp.lab.manager.evidence.residual.retained", {
                                count:
                                  activeUninstallDescriptor.residualAudit
                                    .retainedCount,
                              })}
                            </span>
                            <span className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                              {t(
                                "agentApp.lab.manager.evidence.residual.pendingDeletion",
                                {
                                  count:
                                    activeUninstallDescriptor.residualAudit
                                      .pendingDeletionCount,
                                },
                              )}
                            </span>
                            <span className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                              {t(
                                "agentApp.lab.manager.evidence.residual.blockedOutOfScope",
                                {
                                  count:
                                    activeUninstallDescriptor.residualAudit
                                      .blockedOutOfScopeCount,
                                },
                              )}
                            </span>
                            <span className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-700">
                              {t(
                                "agentApp.lab.manager.evidence.residual.repositoryIssue",
                                {
                                  count:
                                    activeUninstallDescriptor.residualAudit
                                      .repositoryIssueCount,
                                },
                              )}
                            </span>
                          </div>
                          <p className="text-xs text-emerald-700">
                            {t("agentApp.lab.manager.evidence.noNonAppData")}
                          </p>
                        </div>
                      ) : null}
                      <button
                        type="button"
                        className="mt-3 inline-flex items-center gap-2 rounded-full bg-rose-700 px-3 py-2 text-sm font-medium text-white transition hover:bg-rose-800 disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={Boolean(busyAction)}
                        onClick={() => void handleConfirmUninstall()}
                        data-testid="agent-apps-uninstall-confirm"
                      >
                        <Archive size={16} />
                        {t("agentApp.apps.action.confirmUninstall")}
                      </button>
                      <div className="mt-3 max-h-52 space-y-2 overflow-auto">
                        {uninstallPreview.targets.map((target) => (
                          <div
                            key={`${target.action}:${target.value}`}
                            className="rounded-xl border border-slate-200 bg-white px-3 py-2"
                          >
                            <span className="font-mono text-xs text-slate-600">
                              {target.action} {target.value}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="flex min-h-[420px] items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">
                  {t("agentApp.apps.detail.empty")}
                </div>
              )}
            </main>
          </section>
        </div>
      </div>
    </div>
  );
}
