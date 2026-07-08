import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { convertLocalFileSrc } from "@/lib/api/fileSystem";
import {
  saveInstalledPluginState,
  getPluginCloudCatalog,
  listPluginHostLifecycleSnapshots,
  listInstalledPlugins,
  previewPluginUninstall,
  reviewCloudPluginRelease,
  reviewLocalPluginPackage,
  selectLocalPluginDirectory,
  setPluginDisabled,
  submitPluginRegistrationCode,
  uninstallPlugin,
  type PluginCloudCatalogResult,
  type PluginInstallReviewResult,
  type PluginUninstallRehearsalResult,
} from "@/lib/api/plugins";
import {
  buildPluginDeleteDataConfirmationPhrase,
  buildPluginLifecycleToggleDescriptor,
  buildPluginLifecycleUninstallRehearsalDescriptor,
  type PluginLifecycleUninstallRehearsalDescriptor,
} from "../install/lifecycleAction";
import { repairStaleInstalledPluginReadinessList } from "../install/staleReadinessRepair";
import { resolveInstalledPluginDisplayName } from "./pluginDisplay";
import {
  buildAppCenterFilterCounts,
  buildAppCenterItems,
  canOneClickUpdate,
  filterAppCenterItems,
  getAppCenterPageCount,
  getDefaultEntry,
  paginateAppCenterItems,
  type AppCenterItem,
  type AppCenterSourceFilter,
  type AppCenterStatusFilter,
} from "./PluginsPageViewModel";
import {
  PluginInstallReviewDialog,
  type PluginDynamicTranslation,
} from "./PluginsPagePresentation";
import type { PluginRightSurfaceLaunchTarget } from "./pluginRightSurfaceLaunch";
import {
  resolvePluginLaunchTargetPolicy,
  type PluginLaunchTargetMode,
} from "./pluginLaunchTargetPolicy";
import { PluginAppCenterList } from "./PluginAppCenterList";
import { PluginAppDetailView } from "./PluginAppDetailView";
import {
  buildPreviewFromInstalledState,
  buildProfile,
  dispatchPluginsChanged,
  isDeleteDataExecutionBlocked,
  normalizeStatusFilter,
} from "./PluginsPageHelpers";
import { usePluginAppLaunchActions } from "./usePluginAppLaunchActions";
import type {
  PluginsPageParams,
  Page,
  PageParams,
} from "@/types/page";
import type {
  PluginUiMountResult,
  CloudBootstrapApp,
  InstalledPluginState,
} from "../types";
import type { PluginHostLifecycleSnapshot } from "../host";

export function PluginsPage({
  onNavigate,
  pageParams,
  rightSurfaceTarget,
  rightSurfaceTargets,
}: {
  onNavigate?: (page: Page, params?: PageParams) => void;
  pageParams?: PluginsPageParams;
  rightSurfaceTarget?: PluginRightSurfaceLaunchTarget | null;
  rightSurfaceTargets?: PluginRightSurfaceLaunchTarget[] | null;
}) {
  const { t } = useTranslation("agent");
  const dynamicT = t as PluginDynamicTranslation;
  const profile = useMemo(buildProfile, []);
  const [installed, setInstalled] = useState<InstalledPluginState[]>([]);
  const [hostLifecycleSnapshots, setHostLifecycleSnapshots] = useState<
    PluginHostLifecycleSnapshot[] | null
  >(null);
  const [issueCount, setIssueCount] = useState(0);
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null);
  const [cloudCatalog, setCloudCatalog] =
    useState<PluginCloudCatalogResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [registrationCodes, setRegistrationCodes] = useState<
    Record<string, string>
  >({});
  const [launchSummary, setLaunchSummary] = useState<string | null>(null);
  const [mountedUi, setMountedUi] = useState<PluginUiMountResult | null>(null);
  const [installReview, setInstallReview] =
    useState<PluginInstallReviewResult | null>(null);
  const [uninstallPreview, setUninstallPreview] =
    useState<PluginUninstallRehearsalResult | null>(null);
  const [uninstallDescriptor, setUninstallDescriptor] =
    useState<PluginLifecycleUninstallRehearsalDescriptor | null>(null);
  const [deleteDataConfirmationInput, setDeleteDataConfirmationInput] =
    useState("");
  const [searchQuery, setSearchQuery] = useState(
    () => pageParams?.query?.trim() ?? "",
  );
  const [statusFilter, setStatusFilter] = useState<AppCenterStatusFilter>(() =>
    normalizeStatusFilter(pageParams?.statusFilter),
  );
  const [sourceFilter, setSourceFilter] =
    useState<AppCenterSourceFilter>("all");
  const [publishWorkbenchOpen, setPublishWorkbenchOpen] = useState(false);
  const [releaseReviewWorkbenchOpen, setReleaseReviewWorkbenchOpen] =
    useState(false);
  const [launchTargetMode, setLaunchTargetMode] =
    useState<PluginLaunchTargetMode>("standalone");
  const [selectedRightSurfaceTargetId, setSelectedRightSurfaceTargetId] =
    useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [moreInfoOpen, setMoreInfoOpen] = useState(false);
  const handledLaunchRequestRef = useRef<string | null>(null);

  const cloudApps = useMemo(
    () => cloudCatalog?.payload.apps ?? [],
    [cloudCatalog?.payload.apps],
  );
  const activeUninstallDescriptor =
    uninstallPreview &&
    uninstallDescriptor?.appId === uninstallPreview.appId &&
    uninstallDescriptor.mode === uninstallPreview.mode
      ? uninstallDescriptor
      : null;
  const deleteDataConfirmationPhrase =
    activeUninstallDescriptor?.mode === "delete-data"
      ? buildPluginDeleteDataConfirmationPhrase(activeUninstallDescriptor)
      : "";
  const deleteDataExecutionBlocked = isDeleteDataExecutionBlocked({
    descriptor: activeUninstallDescriptor,
    preview: uninstallPreview,
  });
  const deleteDataConfirmationMatches =
    activeUninstallDescriptor?.mode !== "delete-data" ||
    (!deleteDataExecutionBlocked &&
      deleteDataConfirmationInput.trim() === deleteDataConfirmationPhrase);

  const appItems = useMemo(
    () =>
      buildAppCenterItems({
        installed,
        cloudApps,
        catalogSource: cloudCatalog?.source ?? "unknown",
        convertLocalFileSrc,
        hostLifecycleSnapshots: hostLifecycleSnapshots ?? undefined,
      }),
    [cloudApps, cloudCatalog?.source, hostLifecycleSnapshots, installed],
  );
  const searchPlaceholder = t("plugin.apps.center.searchPlaceholder");
  const effectiveSearchQuery =
    searchQuery.trim() === searchPlaceholder.trim() ? "" : searchQuery;

  const filteredItems = useMemo(
    () =>
      filterAppCenterItems(appItems, {
        searchQuery: effectiveSearchQuery,
        sourceFilter,
        statusFilter,
      }),
    [appItems, effectiveSearchQuery, sourceFilter, statusFilter],
  );

  const totalPages = getAppCenterPageCount(filteredItems.length);
  const pagedItems = paginateAppCenterItems(filteredItems, currentPage);
  const selectedItem =
    filteredItems.find((item) => item.appId === selectedAppId) ?? null;
  const selected = selectedItem?.installedState ?? null;

  const filterCounts = useMemo(
    () => buildAppCenterFilterCounts(appItems),
    [appItems],
  );
  const launchTargetPolicy = useMemo(
    () =>
      resolvePluginLaunchTargetPolicy({
        mode: launchTargetMode,
        rightSurfaceTarget,
        rightSurfaceTargets,
        selectedRightSurfaceTargetId,
      }),
    [
      launchTargetMode,
      rightSurfaceTarget,
      rightSurfaceTargets,
      selectedRightSurfaceTargetId,
    ],
  );

  useEffect(() => {
    if (
      launchTargetMode === "rightSurface" &&
      !launchTargetPolicy.rightSurfaceAvailable
    ) {
      setLaunchTargetMode("standalone");
    }
  }, [launchTargetMode, launchTargetPolicy.rightSurfaceAvailable]);

  useEffect(() => {
    if (!launchTargetPolicy.rightSurfaceTargets.length) {
      setSelectedRightSurfaceTargetId(null);
      return;
    }
    setSelectedRightSurfaceTargetId((current) => {
      if (
        current &&
        launchTargetPolicy.rightSurfaceTargets.some(
          (option) => option.id === current,
        )
      ) {
        return current;
      }
      return launchTargetPolicy.rightSurfaceTargetId;
    });
  }, [
    launchTargetPolicy.rightSurfaceTargetId,
    launchTargetPolicy.rightSurfaceTargets,
  ]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [list, catalog, hostLifecycle] = await Promise.all([
        listInstalledPlugins(),
        getPluginCloudCatalog(),
        listPluginHostLifecycleSnapshots(),
      ]);
      let states = list.states;
      try {
        states = await repairStaleInstalledPluginReadinessList(
          list.states,
          profile,
          {
            reviewLocalPackage: reviewLocalPluginPackage,
            saveInstalledState: saveInstalledPluginState,
          },
        );
      } catch (error) {
        console.warn("[plugins] stale readiness repair failed", error);
      }
      setInstalled(states);
      setHostLifecycleSnapshots(hostLifecycle.snapshots);
      setIssueCount(list.issues.length + hostLifecycle.issues.length);
      setCloudCatalog(catalog);
      setSelectedAppId((current) => {
        const requestedAppId = pageParams?.selectedPluginId?.trim();
        if (requestedAppId) {
          return requestedAppId;
        }
        if (!current) {
          return null;
        }
        const stillExists =
          states.some((state) => state.appId === current) ||
          catalog.payload.apps.some((app) => app.appId === current);
        return stillExists ? current : null;
      });
    } finally {
      setLoading(false);
    }
  }, [pageParams?.selectedPluginId, profile]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handlePluginPublishStateChanged = useCallback(() => {
    dispatchPluginsChanged();
    void refresh().catch((error) => {
      console.warn(
        "[plugins] refresh after publish state change failed",
        error,
      );
    });
  }, [refresh]);

  useEffect(() => {
    const requestedAppId = pageParams?.selectedPluginId?.trim();
    if (requestedAppId) {
      setSelectedAppId(requestedAppId);
    }
  }, [pageParams?.selectedPluginId]);

  useEffect(() => {
    const requestedQuery = pageParams?.query?.trim() ?? "";
    setSearchQuery((current) =>
      current.trim() === requestedQuery ? current : requestedQuery,
    );
  }, [pageParams?.query]);

  useEffect(() => {
    setStatusFilter(normalizeStatusFilter(pageParams?.statusFilter));
  }, [pageParams?.statusFilter]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, sourceFilter, statusFilter]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const runBusy = useCallback(
    async <T,>(key: string, action: () => Promise<T>): Promise<T | null> => {
      function describeOperationError(error: unknown): string {
        if (
          error instanceof Error &&
          error.name === "PluginRegistrationRequiredError"
        ) {
          return t("plugin.apps.registration.localInstallBlocked");
        }
        return error instanceof Error ? error.message : String(error);
      }

      setBusyAction(key);
      try {
        return await action();
      } catch (error) {
        toast.error(t("plugin.apps.toast.failed"), {
          description: describeOperationError(error),
        });
        return null;
      } finally {
        setBusyAction(null);
      }
    },
    [t],
  );

  async function handleInstallLocal() {
    setBusyAction("select-local");
    let appDir: string | null;
    try {
      appDir = await selectLocalPluginDirectory({
        title: t("plugin.apps.localSource.dialogTitle"),
      });
    } catch (error) {
      toast.error(t("plugin.apps.toast.failed"), {
        description: error instanceof Error ? error.message : String(error),
      });
      setBusyAction(null);
      return;
    }
    setBusyAction(null);

    if (!appDir) {
      toast.info(t("plugin.apps.toast.localSelectionCancelled"));
      return;
    }

    const review = await runBusy("review-local", () =>
      reviewLocalPluginPackage({
        appDir,
        profile,
      }),
    );
    if (!review) {
      return;
    }
    setInstallReview(review);
    setMoreInfoOpen(false);
  }

  async function handleConfirmInstallReview() {
    if (!installReview) {
      return;
    }
    if (installReview.review.releaseEvidence?.status === "blocked") {
      toast.error("plugin.apps.installReview.releaseEvidence.blockedConfirm");
      return;
    }
    const state = await runBusy(
      `confirm-install:${installReview.review.appId}`,
      () => saveInstalledPluginState({ state: installReview.state }),
    );
    if (!state) {
      return;
    }
    setInstallReview(null);
    setMoreInfoOpen(false);
    dispatchPluginsChanged();
    await refresh();
  }

  async function handleInstallCloud(app: CloudBootstrapApp) {
    if (app.registrationRequired && app.registrationState !== "active") {
      toast.error(t("plugin.apps.registration.required"));
      return;
    }
    const review = await runBusy(`review-cloud:${app.appId}`, () =>
      reviewCloudPluginRelease({
        app,
        profile,
        installed,
        catalogSource: cloudCatalog?.source ?? "unknown",
      }),
    );
    if (!review) {
      return;
    }
    setInstallReview(review);
    setMoreInfoOpen(false);
  }

  async function handleSubmitRegistration(app: CloudBootstrapApp) {
    const code = registrationCodes[app.appId]?.trim() ?? "";
    if (!code) {
      toast.error(t("plugin.apps.registration.codeRequired"));
      return;
    }
    const result = await runBusy(`registration:${app.appId}`, () =>
      submitPluginRegistrationCode(app.appId, code),
    );
    if (!result) {
      return;
    }
    setRegistrationCodes((current) => ({
      ...current,
      [app.appId]: "",
    }));
    toast.success(t("plugin.apps.toast.registered"), {
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

  async function handleSetDisabled(
    state: InstalledPluginState,
    disabled: boolean,
  ) {
    const descriptor = buildPluginLifecycleToggleDescriptor({
      state,
      action: disabled ? "disable" : "enable",
    });
    if (descriptor.status === "noop") {
      return;
    }
    const result = await runBusy(
      `${descriptor.action}:${descriptor.appId}`,
      () => setPluginDisabled(descriptor.request),
    );
    if (!result) {
      return;
    }
    setInstalled(result.states);
    setIssueCount(result.issues.length);
    dispatchPluginsChanged();
    toast.success(
      disabled
        ? t("plugin.apps.toast.disabled")
        : t("plugin.apps.toast.enabled"),
      { description: resolveInstalledPluginDisplayName(state) },
    );
  }

  async function handlePreviewUninstall(
    state: InstalledPluginState,
    mode: "keep-data" | "delete-data",
  ) {
    const preview = buildPreviewFromInstalledState(state);
    const descriptor = buildPluginLifecycleUninstallRehearsalDescriptor({
      state,
      cleanupPlan: preview.cleanupPlan,
      mode,
    });
    if (descriptor.status === "blocked") {
      setUninstallDescriptor(descriptor);
      setUninstallPreview(null);
      setDeleteDataConfirmationInput("");
      return;
    }
    const result = await runBusy(`uninstall:${descriptor.appId}:${mode}`, () =>
      previewPluginUninstall(descriptor.request),
    );
    if (result) {
      setUninstallDescriptor(descriptor);
      setUninstallPreview(result);
      setDeleteDataConfirmationInput("");
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
    if (
      isDeleteDataExecutionBlocked({
        descriptor,
        preview: uninstallPreview,
      })
    ) {
      setLaunchSummary(
        t("plugin.apps.uninstallPreview.deleteDataGate.dryRunOnly"),
      );
      toast.error(t("plugin.apps.toast.uninstallBlocked"));
      return;
    }
    const request =
      descriptor.mode === "delete-data"
        ? {
            ...descriptor.request,
            confirmationPhrase: deleteDataConfirmationInput.trim(),
          }
        : descriptor.request;
    const result = await runBusy(
      `confirm-uninstall:${uninstallPreview.appId}:${uninstallPreview.mode}`,
      () => uninstallPlugin(request),
    );
    if (!result) {
      return;
    }
    if (result.status === "blocked") {
      const codes = result.blockerCodes?.join(", ") || "blocked";
      setLaunchSummary(
        t("plugin.apps.uninstall.blocked", {
          codes,
        }),
      );
      toast.error(t("plugin.apps.toast.uninstallBlocked"));
      return;
    }
    setInstalled(result.list.states);
    setIssueCount(result.list.issues.length);
    setSelectedAppId(null);
    setUninstallPreview(null);
    setUninstallDescriptor(null);
    setDeleteDataConfirmationInput("");
    setLaunchSummary(
      t("plugin.apps.uninstall.completed", {
        removed: result.removedTargetCount,
        missing: result.missingTargetCount,
      }),
    );
    dispatchPluginsChanged();
    toast.success(t("plugin.apps.toast.uninstalled"));
  }

  const { handleLaunchActivationDeclaration, handleLaunchEntry } =
    usePluginAppLaunchActions({
      launchTargetPolicy,
      onLaunchSummaryChange: setLaunchSummary,
      onMountedUiChange: setMountedUi,
      onNavigate,
      projectId: pageParams?.projectId?.trim() || undefined,
      runBusy,
      t: dynamicT,
      uninstallDescriptor,
    });

  useEffect(() => {
    const requestedAppId = pageParams?.selectedPluginId?.trim();
    const requestedEntryKey = pageParams?.launchPluginEntryKey?.trim();
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
    pageParams?.launchPluginEntryKey,
    pageParams?.launchRequestKey,
    pageParams?.selectedPluginId,
    handleLaunchEntry,
  ]);

  function openDetail(appId: string) {
    setSelectedAppId(appId);
    setMoreInfoOpen(false);
  }

  function closeDetail() {
    setSelectedAppId(null);
    setMoreInfoOpen(false);
  }

  async function handlePrimaryAction(item: AppCenterItem) {
    if (item.statusKind === "disabled" && item.installedState) {
      await handleSetDisabled(item.installedState, false);
      return;
    }
    if (item.registrationBlocked && item.cloudApp) {
      openDetail(item.appId);
      await handleSubmitRegistration(item.cloudApp);
      return;
    }
    if (canOneClickUpdate(item) && item.cloudApp) {
      await handleInstallCloud(item.cloudApp);
      return;
    }
    const entry = getDefaultEntry(item);
    if (item.installedState && entry) {
      await handleLaunchEntry(item.installedState, entry);
      return;
    }
    if (item.statusKind === "registration" && item.cloudApp) {
      return;
    }
    if (
      item.cloudApp &&
      (item.statusKind === "installable" || item.statusKind === "update")
    ) {
      await handleInstallCloud(item.cloudApp);
      return;
    }
  }

  async function handleCloudAction(item: AppCenterItem) {
    if (!item.cloudApp) {
      return;
    }
    if (item.registrationBlocked) {
      await handleSubmitRegistration(item.cloudApp);
      return;
    }
    await handleInstallCloud(item.cloudApp);
  }

  return (
    <div
      className="lime-workbench-theme-scope flex h-full min-h-0 flex-col overflow-hidden bg-[color:var(--lime-app-bg)] text-[color:var(--lime-text)]"
      data-testid="plugins-page"
    >
      <div className="min-h-0 flex-1 overflow-auto bg-[color:var(--lime-surface)] px-5 pb-10 pt-10">
        <div className="mx-auto flex w-full max-w-[1040px] flex-col gap-8">
          {selectedItem ? null : (
            <PluginAppCenterList
              appItemsCount={appItems.length}
              busyAction={busyAction}
              currentPage={currentPage}
              filterCounts={filterCounts}
              filteredItemsCount={filteredItems.length}
              issueCount={issueCount}
              launchTargetPolicy={launchTargetPolicy}
              loading={loading}
              pagedItems={pagedItems}
              profile={profile}
              publishWorkbenchOpen={publishWorkbenchOpen}
              releaseReviewWorkbenchOpen={releaseReviewWorkbenchOpen}
              searchQuery={searchQuery}
              selectedRightSurfaceTargetId={selectedRightSurfaceTargetId}
              sourceFilter={sourceFilter}
              statusFilter={statusFilter}
              t={dynamicT}
              totalPages={totalPages}
              onCloudAction={handleCloudAction}
              onClosePublishWorkbench={() => setPublishWorkbenchOpen(false)}
              onCloseReleaseReviewWorkbench={() =>
                setReleaseReviewWorkbenchOpen(false)
              }
              onInstallLocal={handleInstallLocal}
              onLaunchEntry={handleLaunchEntry}
              onNextPage={() =>
                setCurrentPage((page) => Math.min(totalPages, page + 1))
              }
              onOpenDetail={openDetail}
              onPluginPublishStateChanged={handlePluginPublishStateChanged}
              onPreviousPage={() =>
                setCurrentPage((page) => Math.max(1, page - 1))
              }
              onPrimaryAction={handlePrimaryAction}
              onRefresh={refresh}
              onSearchQueryChange={setSearchQuery}
              onSelectedTargetIdChange={setSelectedRightSurfaceTargetId}
              onSourceFilterChange={setSourceFilter}
              onStatusFilterChange={setStatusFilter}
              onTargetModeChange={setLaunchTargetMode}
              onTogglePublishWorkbench={() => {
                const nextOpen = !publishWorkbenchOpen;
                setPublishWorkbenchOpen(nextOpen);
                if (nextOpen) {
                  setReleaseReviewWorkbenchOpen(false);
                }
              }}
              onToggleReleaseReviewWorkbench={() => {
                const nextOpen = !releaseReviewWorkbenchOpen;
                setReleaseReviewWorkbenchOpen(nextOpen);
                if (nextOpen) {
                  setPublishWorkbenchOpen(false);
                }
              }}
            />
          )}

          {selectedItem ? (
            <PluginAppDetailView
              activeUninstallDescriptor={activeUninstallDescriptor}
              busyAction={busyAction}
              deleteDataConfirmationInput={deleteDataConfirmationInput}
              deleteDataConfirmationMatches={deleteDataConfirmationMatches}
              deleteDataConfirmationPhrase={deleteDataConfirmationPhrase}
              deleteDataExecutionBlocked={deleteDataExecutionBlocked}
              item={selectedItem}
              launchSummary={launchSummary}
              moreInfoOpen={moreInfoOpen}
              mountedUi={mountedUi}
              registrationCode={registrationCodes[selectedItem.appId] ?? ""}
              selected={selected}
              t={dynamicT}
              uninstallPreview={uninstallPreview}
              onCloudAction={handleCloudAction}
              onClose={closeDetail}
              onConfirmUninstall={handleConfirmUninstall}
              onDeleteDataConfirmationInputChange={
                setDeleteDataConfirmationInput
              }
              onLaunchActivationDeclaration={
                handleLaunchActivationDeclaration
              }
              onLaunchEntry={handleLaunchEntry}
              onMoreInfoToggle={() => setMoreInfoOpen((open) => !open)}
              onPreviewUninstall={handlePreviewUninstall}
              onPrimaryAction={handlePrimaryAction}
              onRegistrationCodeChange={updateRegistrationCode}
              onSetDisabled={handleSetDisabled}
              onSubmitRegistration={handleSubmitRegistration}
            />
          ) : null}

          <PluginInstallReviewDialog
            installReview={installReview}
            busyAction={busyAction}
            t={dynamicT}
            onClose={() => setInstallReview(null)}
            onConfirm={handleConfirmInstallReview}
          />

          {!selectedItem && mountedUi ? (
            <section className="sr-only" data-testid="plugins-mounted-ui">
              {t("plugin.apps.surface.title", {
                title: mountedUi.title,
              })}
              {mountedUi.route ?? mountedUi.entryKey}
            </section>
          ) : null}

          {!selectedItem && launchSummary ? (
            <div className="sr-only" data-testid="plugins-launch-summary">
              {launchSummary}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
