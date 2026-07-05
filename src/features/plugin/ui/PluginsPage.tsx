import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from "react";
import { useTranslation } from "react-i18next";
import {
  Archive,
  Ban,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FolderOpen,
  Layers3,
  PlayCircle,
  RefreshCw,
  Search,
  ShieldCheck,
  UploadCloud,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { convertLocalFileSrc } from "@/lib/api/fileSystem";
import {
  PLUGINS_CHANGED_EVENT,
  launchPluginShell,
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
import { buildCleanupPlan } from "../install/cleanupPlan";
import { buildLimeRuntimeProfileForInstalledState } from "../runtime-profile";
import { resolveShellLaunchDescriptorForInstalledEntry } from "../shell";
import {
  buildPluginDeleteDataConfirmationPhrase,
  buildPluginLifecycleLaunchGate,
  buildPluginLifecycleToggleDescriptor,
  buildPluginLifecycleUninstallRehearsalDescriptor,
  type PluginLifecycleUninstallRehearsalDescriptor,
} from "../install/lifecycleAction";
import { repairStaleInstalledPluginReadinessList } from "../install/staleReadinessRepair";
import { buildRuntimePackageLoadForPreview } from "./pluginsRuntime";
import { resolveInstalledPluginDisplayName } from "./pluginDisplay";
import {
  buildAppCenterFilterCounts,
  buildAppCenterItems,
  buildAppCenterHostLifecycleSummary,
  canOneClickUpdate,
  filterAppCenterItems,
  getActionLabelKey,
  getAppCenterPageCount,
  getCloudActionLabelKey,
  getDefaultEntry,
  getDetailActionLabelKey,
  hasCloudUpdate,
  isCloudActionDisabled,
  isPrimaryActionDisabled,
  isUiEntry,
  paginateAppCenterItems,
  resolveAppIconSrc,
  type AppCenterItem,
  type AppCenterHostLifecycleTone,
  type AppCenterSourceFilter,
  type AppCenterSourceKind,
  type AppCenterStatusFilter,
  type AppCenterStatusKind,
} from "./PluginsPageViewModel";
import {
  requestPluginRightSurfaceLaunch,
  type PluginRightSurfaceLaunchTarget,
} from "./pluginRightSurfaceLaunch";
import {
  resolvePluginLaunchTargetPolicy,
  type PluginLaunchTargetMode,
} from "./pluginLaunchTargetPolicy";
import { PluginLaunchTargetControl } from "./PluginLaunchTargetControl";
import { PluginReadinessIssueSummary } from "./PluginReadinessIssueSummary";
import { PluginReleaseEvidenceSummary } from "./PluginReleaseEvidenceSummary";
import { PluginReleaseReviewWorkbench } from "../publish/PluginReleaseReviewWorkbench";
import { PluginPublishWorkbench } from "../publish/PluginPublishWorkbench";
import { UiExtensionHost } from "../runtime/uiExtensionHost";
import { evaluatePluginEntryRuntimeGuard } from "../runtime/entryRuntimeGuard";
import {
  APP_CENTER_PLUGIN_FLAGS,
  buildAppCenterRuntimeCapabilityProfile,
} from "../runtime/appCenterRuntimeProfile";
import type {
  AgentPageParams,
  PluginPageParams,
  PluginsPageParams,
  Page,
  PageParams,
} from "@/types/page";
import type {
  PluginUiMountResult,
  CloudBootstrapApp,
  HostCapabilityProfile,
  InstalledAppPreview,
  InstalledPluginState,
  ProjectedEntry,
} from "../types";
import type { PluginHostLifecycleSnapshot } from "../host";

const PAGE_FLAGS = APP_CENTER_PLUGIN_FLAGS;

function buildProfile(): HostCapabilityProfile {
  return buildAppCenterRuntimeCapabilityProfile();
}

function normalizeStatusFilter(
  statusFilter: PluginsPageParams["statusFilter"] | undefined,
): AppCenterStatusFilter {
  if (
    statusFilter === "all" ||
    statusFilter === "installed" ||
    statusFilter === "installable" ||
    statusFilter === "attention"
  ) {
    return statusFilter;
  }
  if (statusFilter === "activatable") {
    return "attention";
  }
  return "all";
}

function isDeleteDataExecutionBlocked(params: {
  descriptor: PluginLifecycleUninstallRehearsalDescriptor | null;
  preview: PluginUninstallRehearsalResult | null;
}): boolean {
  return (
    params.descriptor?.mode === "delete-data" &&
    (params.descriptor.realDeleteAllowed === false ||
      params.preview?.warnings.includes("DRY_RUN_ONLY") === true)
  );
}

function buildPreviewFromInstalledState(
  state: InstalledPluginState,
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

function dispatchPluginsChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(PLUGINS_CHANGED_EVENT));
  }
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

function appCenterStatusClass(status: AppCenterStatusKind): string {
  if (status === "installed") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (status === "installable") {
    return "border-sky-200 bg-sky-50 text-sky-700";
  }
  if (status === "update" || status === "registration") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }
  if (status === "disabled" || status === "partial") {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function appCenterSourceClass(source: AppCenterSourceKind): string {
  if (source === "cloud") {
    return "border-sky-200 bg-sky-50 text-sky-700";
  }
  if (source === "local") {
    return "border-slate-200 bg-slate-50 text-slate-700";
  }
  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}

function hostLifecycleClass(tone: AppCenterHostLifecycleTone): string {
  if (tone === "emerald") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (tone === "amber") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }
  if (tone === "rose") {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }
  return "border-slate-200 bg-slate-50 text-slate-600";
}

type PluginDynamicTranslation = (
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

type DetailDeclaration = {
  key: string;
  title: string;
  description?: string;
  meta?: string;
  aliases?: string[];
  required?: boolean;
  taskKind?: string;
  workflowKey?: string;
  outputArtifactKind?: string;
  rightSurface?: string;
  expectedObjects?: string[];
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readTextArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.flatMap((item) => {
        const text = readText(item);
        return text ? [text] : [];
      })
    : [];
}

function readRecordArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const records: Record<string, unknown>[] = [];
  for (const item of value) {
    const record = asRecord(item);
    if (record) {
      records.push(record);
    }
  }
  return records;
}

function detailDeclarationFromRecord(
  entry: Record<string, unknown>,
  fallback: DetailDeclaration | undefined,
  fallbackTitle: string,
): DetailDeclaration {
  const key = readText(entry.key) ?? fallback?.key ?? "";
  const aliases = readTextArray(entry.aliases);
  const taskKind =
    readText(entry.taskKind) ?? readText(entry.task_kind) ?? fallback?.taskKind;
  const workflowKey =
    readText(entry.workflowKey) ??
    readText(entry.workflow_key) ??
    readText(entry.workflow) ??
    fallback?.workflowKey;
  const outputArtifactKind =
    readText(entry.outputArtifactKind) ??
    readText(entry.output_artifact_kind) ??
    fallback?.outputArtifactKind;
  const rightSurface =
    readText(entry.rightSurface) ??
    readText(entry.right_surface) ??
    fallback?.rightSurface;
  const expectedObjects = readTextArray(
    entry.expectedObjects ?? entry.expected_objects,
  );
  const defaultObjectKind =
    readText(entry.defaultObjectKind) ?? readText(entry.default_object_kind);
  const mergedExpectedObjects =
    expectedObjects.length > 0
      ? expectedObjects
      : fallback?.expectedObjects?.length
        ? fallback.expectedObjects
        : defaultObjectKind
          ? [defaultObjectKind]
          : undefined;

  return {
    key,
    title:
      readText(entry.title) ??
      fallback?.title ??
      taskKind ??
      key ??
      fallbackTitle,
    description: readText(entry.description) ?? fallback?.description,
    meta: taskKind ?? outputArtifactKind ?? fallback?.meta,
    aliases: aliases.length > 0 ? aliases : fallback?.aliases,
    taskKind,
    workflowKey,
    outputArtifactKind,
    rightSurface,
    expectedObjects: mergedExpectedObjects,
  };
}

function uniqueDetailDeclarations(
  declarations: DetailDeclaration[],
): DetailDeclaration[] {
  const seen = new Set<string>();
  const result: DetailDeclaration[] = [];
  for (const declaration of declarations) {
    if (!declaration.key || seen.has(declaration.key)) {
      continue;
    }
    seen.add(declaration.key);
    result.push(declaration);
  }
  return result;
}

function normalizeActivationLookupKey(value: string | undefined): string {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, "");
}

function activationDeclarationMatchesProjectedEntry(
  declaration: DetailDeclaration,
  entry: ProjectedEntry,
): boolean {
  const declarationKeys = [
    declaration.key,
    declaration.title,
    declaration.taskKind,
    declaration.workflowKey,
  ].map(normalizeActivationLookupKey);
  const entryKeys = [entry.key, entry.title, entry.route].map(
    normalizeActivationLookupKey,
  );
  return declarationKeys.some(
    (left) =>
      left &&
      entryKeys.some(
        (right) => right && (left === right || left.includes(right)),
      ),
  );
}

function buildDetailActivationEntriesFromState(params: {
  state?: InstalledPluginState;
  fallbackTitle: string;
}): DetailDeclaration[] {
  const manifest = params.state?.manifest;
  const runtime = asRecord(manifest?.agentRuntime);
  const manifestActivationRecords = readRecordArray(
    manifest?.activationEntries,
  );
  const manifestActivationByKey = new Map<string, DetailDeclaration>();
  for (const entry of manifestActivationRecords) {
    const declaration = detailDeclarationFromRecord(
      entry,
      undefined,
      params.fallbackTitle,
    );
    if (declaration.key) {
      manifestActivationByKey.set(declaration.key, declaration);
    }
  }
  const runtimeRecords = [
    ...readRecordArray(runtime?.activationEntries),
    ...readRecordArray(runtime?.intents),
  ];
  const declaredRecords =
    runtimeRecords.length > 0 ? runtimeRecords : manifestActivationRecords;
  const declared = declaredRecords.map<DetailDeclaration>((entry) => {
    const key = readText(entry.key);
    return detailDeclarationFromRecord(
      entry,
      key ? manifestActivationByKey.get(key) : undefined,
      params.fallbackTitle,
    );
  });
  return uniqueDetailDeclarations(declared);
}

function buildDetailActivationEntries(
  item: AppCenterItem,
): DetailDeclaration[] {
  const runtimeDeclared = buildDetailActivationEntriesFromState({
    state: item.installedState,
    fallbackTitle: item.title,
  });
  const projected = item.entries.map<DetailDeclaration>((entry) => ({
    key: entry.key,
    title: entry.title,
    description: entry.description,
    meta: entry.kind,
  }));
  return runtimeDeclared.length > 0
    ? runtimeDeclared
    : uniqueDetailDeclarations(projected);
}

function resolveActivationDeclarationForProjectedEntry(params: {
  state: InstalledPluginState;
  entry: ProjectedEntry;
}): DetailDeclaration {
  const declarations = buildDetailActivationEntriesFromState({
    state: params.state,
    fallbackTitle: params.entry.title,
  });
  return (
    declarations.find((declaration) =>
      activationDeclarationMatchesProjectedEntry(declaration, params.entry),
    ) ?? {
      key: params.entry.key,
      title: params.entry.title,
      description: params.entry.description,
      meta: params.entry.kind,
    }
  );
}

function activationMentionTrigger(declaration: DetailDeclaration): string {
  const alias = declaration.aliases?.find((item) => item.trim())?.trim();
  const raw = alias || declaration.title || declaration.key;
  return raw.startsWith("@") ? raw : `@${raw}`;
}

function hasAgentActivationRoute(declaration: DetailDeclaration): boolean {
  return Boolean(
    declaration.taskKind ||
    declaration.workflowKey ||
    declaration.outputArtifactKind ||
    declaration.rightSurface ||
    declaration.aliases?.some((item) => item.trim()),
  );
}

function buildPluginActivationAgentParams(params: {
  state: InstalledPluginState;
  declaration: DetailDeclaration;
  projectId?: string;
}): AgentPageParams {
  const trigger = activationMentionTrigger(params.declaration);
  const launchRequestId = Date.now();
  return {
    agentEntry: "new-task",
    ...(params.projectId ? { projectId: params.projectId } : {}),
    initialUserPrompt: `${trigger} `,
    initialSessionName: params.declaration.title,
    autoRunInitialPromptOnMount: false,
    newChatAt: launchRequestId,
    immersiveHome: false,
  };
}

function buildDetailSubagents(item: AppCenterItem): DetailDeclaration[] {
  return uniqueDetailDeclarations(
    (item.installedState?.manifest.subagents ?? []).map((subagent) => ({
      key: subagent.id,
      title: subagent.title ?? subagent.id,
      description: subagent.description,
      meta: subagent.activation,
      required: subagent.required,
      aliases: readTextArray(subagent.skills),
    })),
  );
}

function buildDetailSkills(item: AppCenterItem): DetailDeclaration[] {
  return uniqueDetailDeclarations(
    (item.installedState?.manifest.skillRefs ?? []).map((skill) => ({
      key: skill.id,
      title: skill.title ?? skill.id,
      description: skill.description,
      meta: skill.activation,
      required: skill.required,
    })),
  );
}

function getDetailCategory(item: AppCenterItem): string | undefined {
  const manifest = item.installedState?.manifest;
  const manifestInterface = asRecord(manifest?.interface);
  return (
    readText(manifest?.presentation?.category) ??
    readText(manifestInterface?.category) ??
    readText(manifest?.appType)
  );
}

function getDetailDeveloper(item: AppCenterItem): string | undefined {
  const manifest = item.installedState?.manifest;
  const distribution = asRecord(manifest?.distribution);
  const presentation = asRecord(manifest?.presentation);
  const publisher = asRecord(presentation?.publisher);
  const cloudPresentation = asRecord(item.cloudApp?.presentation);
  const cloudPublisher = asRecord(cloudPresentation?.publisher);
  return (
    readText(distribution?.publisher) ??
    readText(publisher?.name) ??
    readText(cloudPublisher?.name)
  );
}

function getDetailCapabilityCount(item: AppCenterItem): number {
  return (
    item.installedState?.projection.requiredCapabilities?.length ??
    Object.keys(item.cloudApp?.capabilityRequirements ?? {}).length
  );
}

function buildDetailTags(item: AppCenterItem): string[] {
  const manifest = item.installedState?.manifest;
  const manifestRecord = asRecord(manifest);
  const manifestInterface = asRecord(manifest?.interface);
  const manifestRequires = asRecord(manifest?.requires);
  const manifestRequiredCapabilities = asRecord(manifestRequires?.capabilities);
  return Array.from(
    new Set([
      ...readTextArray(manifestInterface?.capabilities),
      ...Object.keys(manifestRequiredCapabilities ?? {}),
      ...readTextArray(manifestRecord?.capabilities),
    ]),
  ).slice(0, 6);
}

function getDetailPermissions(item: AppCenterItem) {
  return item.installedState?.manifest.permissions ?? [];
}

function getDetailCommonEntries(item: AppCenterItem) {
  return item.entries ?? [];
}

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
      console.warn("[plugins] refresh after publish state change failed", error);
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

  const handleLaunchActivationDeclaration = useCallback(
    (state: InstalledPluginState, declaration: DetailDeclaration) => {
      const launchGate = buildPluginLifecycleLaunchGate(state);
      if (!launchGate.allowed) {
        return;
      }
      const params = buildPluginActivationAgentParams({
        state,
        declaration,
        projectId: pageParams?.projectId?.trim() || undefined,
      });
      if (!onNavigate) {
        const summary = t("plugin.apps.launch.agentRouteUnavailable", {
          title: declaration.title,
        });
        setMountedUi(null);
        setLaunchSummary(summary);
        toast.error(t("plugin.apps.toast.failed"), {
          description: summary,
        });
        return;
      }
      setMountedUi(null);
      setLaunchSummary(null);
      onNavigate("agent", params);
    },
    [onNavigate, pageParams?.projectId, t],
  );

  const handleLaunchEntry = useCallback(
    async (state: InstalledPluginState, entry: ProjectedEntry) => {
      const launchGate = buildPluginLifecycleLaunchGate(state);
      if (!launchGate.allowed) {
        return;
      }
      await runBusy(`launch:${state.appId}:${entry.key}`, async () => {
        const preview = buildPreviewFromInstalledState(state);
        const hostProfile = buildProfile();
        const runtimeProfile = buildLimeRuntimeProfileForInstalledState({
          state,
          hostProfile,
        });
        const guard = evaluatePluginEntryRuntimeGuard({
          preview,
          entryKey: entry.key,
          flags: PAGE_FLAGS,
          operation: isUiEntry(entry) ? "mount-ui" : "run-entry",
          runtimePackageLoad: buildRuntimePackageLoadForPreview(preview),
          permissionDecision: "accepted",
          installMode: state.installMode,
          runtimeProfile,
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
          setLaunchSummary(t(`plugin.lab.guard.summary.${guard.status}`));
          return;
        }

        const shellLaunch = resolveShellLaunchDescriptorForInstalledEntry({
          state,
          preview,
          runtimeProfile,
          entry,
        });
        if (shellLaunch.status === "ready") {
          const result = await launchPluginShell({
            descriptor: shellLaunch.descriptor,
          });
          if (result.status === "blocked") {
            const summary = t("plugin.apps.launch.shellBlocked", {
              codes: result.blockerCodes.join(", "),
            });
            setLaunchSummary(summary);
            toast.error(t("plugin.apps.toast.failed"), {
              description: result.message ?? summary,
            });
            return;
          }
          try {
            if (launchTargetPolicy.rightSurfaceTarget) {
              await requestPluginRightSurfaceLaunch({
                appId: state.appId,
                title: resolveInstalledPluginDisplayName(state),
                entry,
                shellLaunch: result,
                target: launchTargetPolicy.rightSurfaceTarget,
              });
            }
          } catch (error) {
            toast.error(t("plugin.apps.toast.failed"), {
              description:
                error instanceof Error ? error.message : String(error),
            });
          }
          const summary = t("plugin.apps.launch.shellLaunched", {
            title: entry.title,
            target:
              result.shellWindow?.url ??
              result.runtimeStatus?.entryUrl ??
              result.packageMount?.path ??
              entry.route ??
              entry.key,
          });
          setMountedUi(null);
          setLaunchSummary(summary);
          toast.success(summary);
          return;
        }

        if (isUiEntry(entry)) {
          if (onNavigate) {
            const runtimeParams: PluginPageParams = {
              appId: state.appId,
              entryKey: entry.key,
              ...(pageParams?.projectId?.trim()
                ? { projectId: pageParams.projectId.trim() }
                : {}),
              launchRequestKey: Date.now(),
              rightSurfaceTarget: launchTargetPolicy.rightSurfaceTarget,
            };
            onNavigate("plugin", runtimeParams);
            return;
          }
          const mount = new UiExtensionHost({
            preview,
            flags: PAGE_FLAGS,
          }).mountEntry(entry.key);
          setMountedUi(mount);
          setLaunchSummary(
            t("plugin.apps.launch.uiMounted", {
              title: mount.title,
              route: mount.route ?? entry.key,
            }),
          );
          return;
        }

        const activationDeclaration =
          resolveActivationDeclarationForProjectedEntry({ state, entry });
        if (
          entry.kind === "workflow" ||
          hasAgentActivationRoute(activationDeclaration)
        ) {
          handleLaunchActivationDeclaration(state, activationDeclaration);
          return;
        }
        setMountedUi(null);
        const summary = t("plugin.apps.launch.entryRouteUnavailable", {
          title: entry.title,
        });
        setLaunchSummary(summary);
        toast.error(t("plugin.apps.toast.failed"), {
          description: summary,
        });
      });
    },
    [
      handleLaunchActivationDeclaration,
      launchTargetPolicy.rightSurfaceTarget,
      onNavigate,
      pageParams?.projectId,
      runBusy,
      t,
      uninstallDescriptor,
    ],
  );

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

  function renderRegistrationForm(app: CloudBootstrapApp) {
    return (
      <div
        className="rounded-lg border border-[color:var(--lime-info-border)] bg-[color:var(--lime-info-soft)] px-4 py-3"
        data-testid={`plugins-registration-${app.appId}`}
      >
        <p className="text-xs font-semibold text-[color:var(--lime-text-strong)]">
          {t("plugin.apps.center.detail.registrationHint")}
        </p>
        <p className="mt-1 text-xs leading-5 text-[color:var(--lime-text-muted)]">
          {app.registrationHint ??
            t("plugin.apps.registration.hintFallback", {
              state: app.registrationState ?? "required",
            })}
        </p>
        <div className="mt-3 flex gap-2">
          <input
            className="min-w-0 flex-1 rounded-full border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] px-3 py-2 text-xs text-[color:var(--lime-text-strong)] outline-none transition focus:border-[color:var(--lime-surface-border-strong)]"
            value={registrationCodes[app.appId] ?? ""}
            onChange={(event) =>
              updateRegistrationCode(app.appId, event.target.value)
            }
            onInput={(event) =>
              updateRegistrationCode(app.appId, event.currentTarget.value)
            }
            placeholder={t("plugin.apps.registration.placeholder")}
            aria-label={t("plugin.apps.registration.placeholder")}
            data-testid={`plugins-registration-code-${app.appId}`}
          />
          <button
            type="button"
            className="shrink-0 rounded-full bg-[color:var(--lime-text-strong)] px-3 py-2 text-xs font-medium text-[color:var(--lime-surface)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={Boolean(busyAction)}
            onClick={() => void handleSubmitRegistration(app)}
            data-testid={`plugins-submit-registration-${app.appId}`}
          >
            {t("plugin.apps.registration.submit")}
          </button>
        </div>
      </div>
    );
  }

  function renderAppIcon(
    item: AppCenterItem,
    className = "size-12",
    testId = `plugins-icon-${item.appId}`,
  ): ReactElement {
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

  function renderInstallReviewDialog() {
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
        onClick={() => setInstallReview(null)}
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
                onClick={() => setInstallReview(null)}
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
                  ? t(
                      "plugin.apps.installReview.releaseEvidence.blockedConfirm",
                    )
                  : undefined
              }
              onClick={() => void handleConfirmInstallReview()}
              data-testid="plugins-install-review-confirm"
            >
              <ShieldCheck size={16} />
              {t("plugin.apps.installReview.confirm")}
            </button>
            <button
              type="button"
              className="inline-flex h-10 items-center justify-center rounded-full border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] px-4 text-sm font-semibold text-[color:var(--lime-text)] transition hover:bg-[color:var(--lime-surface-hover)] disabled:cursor-not-allowed disabled:opacity-60"
              disabled={Boolean(busyAction)}
              onClick={() => setInstallReview(null)}
              data-testid="plugins-install-review-cancel"
            >
              {t("plugin.apps.installReview.cancel")}
            </button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div
      className="lime-workbench-theme-scope flex h-full min-h-0 flex-col overflow-hidden bg-[color:var(--lime-app-bg)] text-[color:var(--lime-text)]"
      data-testid="plugins-page"
    >
      <div className="min-h-0 flex-1 overflow-auto bg-[color:var(--lime-surface)] px-5 pb-10 pt-10">
        <div className="mx-auto flex w-full max-w-[1040px] flex-col gap-8">
          {selectedItem ? null : (
            <>
              <header className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <h1 className="text-[28px] font-semibold text-[color:var(--lime-text-strong)]">
                    {t("plugin.apps.center.title")}
                  </h1>
                  <p className="mt-2 max-w-xl text-sm leading-6 text-[color:var(--lime-text-muted)]">
                    {t("plugin.apps.center.description")}
                  </p>
                  {issueCount > 0 ? (
                    <p
                      className="mt-2 text-sm font-medium text-amber-700"
                      data-testid="plugins-load-issues"
                    >
                      {t("plugin.apps.installed.issues", { count: issueCount })}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <label className="relative w-full sm:w-[360px]">
                    <Search
                      className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[color:var(--lime-text-muted)]"
                      size={18}
                    />
                    <input
                      className="h-9 w-full rounded-full border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] pl-10 pr-4 text-sm font-semibold text-[color:var(--lime-text-strong)] shadow-none outline-none transition placeholder:text-[color:var(--lime-text-muted)] focus:border-[color:var(--lime-surface-border-strong)]"
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                      onInput={(event) =>
                        setSearchQuery(event.currentTarget.value)
                      }
                      placeholder={t("plugin.apps.center.searchPlaceholder")}
                      data-testid="plugins-search"
                    />
                  </label>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      className="inline-flex h-9 items-center gap-2 rounded-full border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] px-4 text-sm font-semibold text-[color:var(--lime-text-strong)] shadow-none transition hover:bg-[color:var(--lime-surface-hover)]"
                      onClick={() => {
                        const nextOpen = !publishWorkbenchOpen;
                        setPublishWorkbenchOpen(nextOpen);
                        if (nextOpen) {
                          setReleaseReviewWorkbenchOpen(false);
                        }
                      }}
                      data-testid="plugins-open-publish"
                    >
                      <UploadCloud size={16} />
                      {t("plugin.apps.center.publish")}
                    </button>
                    <button
                      type="button"
                      className="inline-flex h-9 items-center gap-2 rounded-full border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] px-4 text-sm font-semibold text-[color:var(--lime-text-strong)] shadow-none transition hover:bg-[color:var(--lime-surface-hover)]"
                      onClick={() => {
                        const nextOpen = !releaseReviewWorkbenchOpen;
                        setReleaseReviewWorkbenchOpen(nextOpen);
                        if (nextOpen) {
                          setPublishWorkbenchOpen(false);
                        }
                      }}
                      data-testid="plugins-open-release-review"
                    >
                      <ShieldCheck size={16} />
                      {t("plugin.apps.center.review")}
                    </button>
                    <button
                      type="button"
                      className="inline-flex h-9 items-center gap-2 rounded-full bg-[color:var(--lime-text-strong)] px-5 text-sm font-semibold text-[color:var(--lime-surface)] shadow-none transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={Boolean(busyAction)}
                      onClick={() => void handleInstallLocal()}
                      data-testid="plugins-install-local"
                    >
                      <FolderOpen size={16} />
                      {t("plugin.apps.center.installLocal")}
                    </button>
                    <button
                      type="button"
                      className="inline-flex h-9 items-center gap-2 rounded-full border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] px-4 text-sm font-semibold text-[color:var(--lime-text-strong)] shadow-none transition hover:bg-[color:var(--lime-surface-hover)] disabled:cursor-not-allowed disabled:opacity-60"
                      onClick={() => void refresh()}
                      disabled={loading}
                      data-testid="plugins-refresh"
                    >
                      <RefreshCw size={16} />
                      {t("plugin.apps.center.refresh")}
                    </button>
                  </div>
                </div>
              </header>

              {publishWorkbenchOpen ? (
                <PluginPublishWorkbench
                  profile={profile}
                  onClose={() => setPublishWorkbenchOpen(false)}
                  onSubmissionCreated={handlePluginPublishStateChanged}
                />
              ) : null}
              {releaseReviewWorkbenchOpen ? (
                <PluginReleaseReviewWorkbench
                  onClose={() => setReleaseReviewWorkbenchOpen(false)}
                  onPublished={handlePluginPublishStateChanged}
                />
              ) : null}

              <section className="flex flex-wrap items-center gap-5">
                {(
                  ["all", "installed", "installable", "attention"] as const
                ).map((filter) => (
                  <button
                    key={filter}
                    type="button"
                    className={`inline-flex h-8 items-center gap-2 rounded-full text-base font-semibold transition ${
                      statusFilter === filter
                        ? "text-[color:var(--lime-text-strong)]"
                        : "text-[color:var(--lime-text-muted)] hover:text-[color:var(--lime-text-strong)]"
                    }`}
                    onClick={() => setStatusFilter(filter)}
                    data-testid={`plugins-status-filter-${filter}`}
                  >
                    {t(`plugin.apps.center.filter.${filter}`)}
                    <span className="text-xs text-[color:var(--lime-text-muted)]">
                      {filterCounts[filter]}
                    </span>
                  </button>
                ))}
              </section>

              <section className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-[color:var(--lime-text-muted)]">
                  <div className="flex flex-wrap items-center gap-3">
                    <span>{t("plugin.apps.center.source.label")}：</span>
                    {(["all", "cloud", "local"] as const).map((filter) => (
                      <button
                        key={filter}
                        type="button"
                        className={`h-8 rounded-lg border px-3 text-xs font-semibold transition ${
                          sourceFilter === filter
                            ? "border-[color:var(--lime-surface-border-strong)] bg-[color:var(--lime-surface-hover)] text-[color:var(--lime-text-strong)]"
                            : "border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] text-[color:var(--lime-text)] hover:bg-[color:var(--lime-surface-hover)]"
                        }`}
                        onClick={() => setSourceFilter(filter)}
                        data-testid={`plugins-source-filter-${filter}`}
                      >
                        {t(`plugin.apps.center.source.${filter}`)}
                      </button>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <span>{t("plugin.apps.center.status.label")}：</span>
                    <button
                      type="button"
                      className={`font-semibold ${
                        statusFilter === "all"
                          ? "text-[color:var(--lime-text-strong)]"
                          : "text-[color:var(--lime-text-muted)]"
                      }`}
                      onClick={() => setStatusFilter("all")}
                    >
                      {t("plugin.apps.center.status.all")}
                    </button>
                    <span className="text-slate-300">/</span>
                    <button
                      type="button"
                      className="font-medium text-[color:var(--lime-text-muted)] hover:text-[color:var(--lime-text-strong)]"
                      onClick={() => setStatusFilter("attention")}
                    >
                      {t("plugin.apps.center.status.updateShort")}
                    </button>
                    <span className="text-slate-300">/</span>
                    <button
                      type="button"
                      className="font-medium text-[color:var(--lime-text-muted)] hover:text-[color:var(--lime-text-strong)]"
                      onClick={() => setStatusFilter("attention")}
                    >
                      {t("plugin.apps.center.status.authorizationShort")}
                    </button>
                  </div>
                  <div className="text-[color:var(--lime-text-muted)]">
                    {t("plugin.apps.center.sort.label")}：
                    <span className="ml-2 font-medium text-[color:var(--lime-text)]">
                      {t("plugin.apps.center.sort.recent")}
                    </span>
                  </div>
                </div>
                <PluginLaunchTargetControl
                  policy={launchTargetPolicy}
                  selectedTargetId={selectedRightSurfaceTargetId}
                  onModeChange={setLaunchTargetMode}
                  onSelectedTargetIdChange={setSelectedRightSurfaceTargetId}
                />
                <main className="min-w-0">
                  <div
                    className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
                    data-testid="plugins-list"
                  >
                    {pagedItems.map((item) => {
                      const selectedRow = false;
                      const defaultEntry = getDefaultEntry(item);
                      const hostSummary =
                        buildAppCenterHostLifecycleSummary(item);
                      return (
                        <div
                          key={item.appId}
                          className={`group flex min-h-[188px] flex-col rounded-[10px] border bg-[color:var(--lime-surface)] p-4 text-left shadow-sm shadow-[color:var(--lime-shadow-color)] transition hover:border-[color:var(--lime-surface-border-strong)] hover:bg-[color:var(--lime-surface-hover)] hover:shadow-md ${
                            selectedRow
                              ? "border-emerald-300 ring-1 ring-emerald-200"
                              : "border-[color:var(--lime-surface-border)]"
                          }`}
                          data-testid={`plugins-list-row-${item.appId}`}
                        >
                          <div className="flex min-w-0 items-start gap-3">
                            {renderAppIcon(item)}
                            <div className="min-w-0 flex-1">
                              <div className="flex min-w-0 items-start justify-between gap-3">
                                <h2 className="min-w-0 truncate text-sm font-semibold text-[color:var(--lime-text-strong)]">
                                  {item.title}
                                </h2>
                                <span
                                  className={`shrink-0 rounded-md border px-2 py-0.5 text-xs font-semibold ${appCenterStatusClass(
                                    item.statusKind,
                                  )}`}
                                >
                                  {t(
                                    `plugin.apps.center.status.${item.statusKind}`,
                                  )}
                                </span>
                              </div>
                              <div className="mt-2 flex flex-wrap gap-2">
                                <span
                                  className={`inline-flex rounded-md border px-2 py-0.5 text-xs font-medium ${appCenterSourceClass(
                                    item.sourceKind,
                                  )}`}
                                >
                                  {t(
                                    `plugin.apps.center.source.${item.sourceKind}`,
                                  )}
                                </span>
                                {item.sourceState ? (
                                  <>
                                    <span
                                      className="inline-flex rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-600"
                                      data-testid={`plugins-source-state-${item.appId}`}
                                    >
                                      {t(item.sourceState.labelKey)}
                                    </span>
                                  </>
                                ) : null}
                              </div>
                              {hostSummary ? (
                                <div className="mt-2 flex flex-wrap gap-2">
                                  <span
                                    className={`inline-flex rounded-md border px-2 py-0.5 text-xs font-medium ${hostLifecycleClass(
                                      hostSummary.tone,
                                    )}`}
                                    data-testid={`plugins-host-status-${item.appId}`}
                                  >
                                    {dynamicT(hostSummary.labelKey)}
                                  </span>
                                  {hostSummary.articleWorkspaceEnabled ? (
                                    <span
                                      className="inline-flex rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-600"
                                      data-testid={`plugins-host-article-workspace-${item.appId}`}
                                    >
                                      {t(
                                        "plugin.apps.center.host.articleWorkspace",
                                        {
                                          count: hostSummary.productObjectCount,
                                        },
                                      )}
                                    </span>
                                  ) : null}
                                </div>
                              ) : null}
                            </div>
                          </div>

                          <p className="mt-3 line-clamp-2 min-h-[40px] text-sm leading-5 text-[color:var(--lime-text-muted)]">
                            {item.description ||
                              t("plugin.apps.center.descriptionFallback")}
                          </p>
                          {item.installedState ? (
                            <span
                              className="sr-only"
                              data-testid={`plugins-installed-${item.appId}`}
                            />
                          ) : null}
                          {item.registrationBlocked ? (
                            <span
                              className="sr-only"
                              data-testid={`plugins-registration-${item.appId}`}
                            />
                          ) : null}

                          <div className="mt-3 border-t border-[color:var(--lime-surface-border)] pt-3">
                            <div className="text-xs text-[color:var(--lime-text-muted)]">
                              <span className="font-medium text-[color:var(--lime-text)]">
                                {item.installedVersion
                                  ? t("plugin.apps.center.version.current", {
                                      version: item.installedVersion,
                                    })
                                  : (item.cloudVersion ?? "-")}
                              </span>
                              {item.installedVersion &&
                              item.cloudVersion &&
                              item.installedVersion !== item.cloudVersion ? (
                                <span className="mt-1 block text-amber-700">
                                  {t("plugin.apps.center.version.cloud", {
                                    version: item.cloudVersion,
                                  })}
                                </span>
                              ) : null}
                            </div>
                          </div>

                          <div className="mt-auto flex items-center gap-2 pt-3">
                            <button
                              type="button"
                              className="inline-flex h-8 flex-1 min-w-0 items-center justify-center gap-2 rounded-full bg-[color:var(--lime-text-strong)] px-3 text-xs font-semibold text-[color:var(--lime-surface)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                              disabled={isPrimaryActionDisabled(
                                item,
                                busyAction,
                              )}
                              onClick={(event) => {
                                event.stopPropagation();
                                void handlePrimaryAction(item);
                              }}
                              data-testid={
                                !item.installedState && item.cloudApp
                                  ? `plugins-install-cloud-${item.appId}`
                                  : canOneClickUpdate(item)
                                    ? `plugins-update-cloud-${item.appId}`
                                    : undefined
                              }
                            >
                              {canOneClickUpdate(item) ? (
                                <RefreshCw size={14} />
                              ) : defaultEntry && item.installedState ? (
                                <PlayCircle size={14} />
                              ) : (
                                <ShieldCheck size={14} />
                              )}
                              {t(getActionLabelKey(item))}
                            </button>
                            <button
                              type="button"
                              className="inline-flex h-8 shrink-0 items-center justify-center rounded-full border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] px-3 text-xs font-semibold text-[color:var(--lime-text)] transition hover:bg-[color:var(--lime-surface-hover)]"
                              onClick={() => openDetail(item.appId)}
                              data-testid={`plugins-open-detail-${item.appId}`}
                            >
                              {t("plugin.apps.center.action.details")}
                            </button>
                          </div>

                          {item.installedState &&
                          item.cloudApp &&
                          hasCloudUpdate(item) ? (
                            <button
                              type="button"
                              className="mt-2 inline-flex h-8 w-full items-center justify-center rounded-full border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] px-3 text-xs font-semibold text-[color:var(--lime-text)] transition hover:bg-[color:var(--lime-surface-hover)] disabled:cursor-not-allowed disabled:opacity-60"
                              disabled={
                                canOneClickUpdate(item)
                                  ? isPrimaryActionDisabled(item, busyAction) ||
                                    !defaultEntry
                                  : isCloudActionDisabled(item, busyAction)
                              }
                              onClick={(event) => {
                                event.stopPropagation();
                                if (
                                  canOneClickUpdate(item) &&
                                  item.installedState &&
                                  defaultEntry
                                ) {
                                  void handleLaunchEntry(
                                    item.installedState,
                                    defaultEntry,
                                  );
                                  return;
                                }
                                void handleCloudAction(item);
                              }}
                              data-testid={
                                canOneClickUpdate(item)
                                  ? `plugins-launch-installed-${item.appId}`
                                  : `plugins-install-cloud-${item.appId}`
                              }
                            >
                              {canOneClickUpdate(item)
                                ? t("plugin.apps.center.action.open")
                                : t(getCloudActionLabelKey(item))}
                            </button>
                          ) : null}
                        </div>
                      );
                    })}
                    {pagedItems.length === 0 ? (
                      <div className="col-span-full flex min-h-[260px] items-center justify-center rounded-lg border border-dashed border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface-soft)] px-4 py-8 text-center">
                        <div>
                          <p className="text-sm font-semibold text-[color:var(--lime-text-strong)]">
                            {appItems.length === 0
                              ? t("plugin.apps.center.empty.noApps")
                              : t("plugin.apps.center.empty.noMatches")}
                          </p>
                          <p className="mt-2 text-sm text-[color:var(--lime-text-muted)]">
                            {t("plugin.apps.center.empty.helper")}
                          </p>
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[color:var(--lime-surface-border)] pt-4">
                    <p className="text-xs text-[color:var(--lime-text-muted)]">
                      {t("plugin.apps.center.pagination.summary", {
                        page: currentPage,
                        total: totalPages,
                        count: filteredItems.length,
                      })}
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="inline-flex h-8 items-center gap-1 rounded-full border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] px-4 text-sm font-medium text-[color:var(--lime-text)] transition hover:bg-[color:var(--lime-surface-hover)] disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={currentPage <= 1}
                        onClick={() =>
                          setCurrentPage((page) => Math.max(1, page - 1))
                        }
                        data-testid="plugins-pagination-prev"
                      >
                        <ChevronLeft size={14} />
                        {t("plugin.apps.center.pagination.previous")}
                      </button>
                      <button
                        type="button"
                        className="inline-flex h-8 items-center gap-1 rounded-full border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] px-4 text-sm font-medium text-[color:var(--lime-text)] transition hover:bg-[color:var(--lime-surface-hover)] disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={currentPage >= totalPages}
                        onClick={() =>
                          setCurrentPage((page) =>
                            Math.min(totalPages, page + 1),
                          )
                        }
                        data-testid="plugins-pagination-next"
                      >
                        {t("plugin.apps.center.pagination.next")}
                        <ChevronRight size={14} />
                      </button>
                    </div>
                  </div>
                </main>
              </section>
            </>
          )}

          {selectedItem ? (
            <main
              className="mt-5 grid items-start gap-6 xl:grid-cols-[minmax(0,760px)_280px]"
              data-testid="plugins-detail"
            >
              <div className="min-w-0 space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-[color:var(--lime-text-muted)]">
                  <div className="flex min-w-0 items-center gap-2">
                    <span>{t("plugin.apps.center.title")}</span>
                    <ChevronRight size={14} />
                    <span className="truncate font-medium text-[color:var(--lime-text-strong)]">
                      {selectedItem.title}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] px-3 text-xs font-semibold text-[color:var(--lime-text)] transition hover:bg-[color:var(--lime-surface-hover)]"
                    aria-label={t("plugin.apps.center.detail.backToList")}
                    title={t("plugin.apps.center.detail.backToList")}
                    onClick={closeDetail}
                    data-testid="plugins-close-detail"
                  >
                    <ChevronLeft size={14} />
                    {t("plugin.apps.center.detail.backToList")}
                  </button>
                </div>

                <section className="space-y-4">
                  <div className="flex items-start gap-4">
                    {renderAppIcon(
                      selectedItem,
                      "size-20 shrink-0",
                      `plugins-detail-icon-${selectedItem.appId}`,
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-[color:var(--lime-text-muted)]">
                        {t("plugin.apps.center.detail.title")}
                      </p>
                      <h2 className="mt-2 text-[22px] font-semibold text-[color:var(--lime-text-strong)]">
                        {selectedItem.title}
                      </h2>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <span
                          className={`rounded-md border px-2.5 py-1 text-sm font-medium ${appCenterSourceClass(
                            selectedItem.sourceKind,
                          )}`}
                        >
                          {t(
                            `plugin.apps.center.source.${selectedItem.sourceKind}`,
                          )}
                        </span>
                        <span
                          className={`rounded-md border px-2.5 py-1 text-sm font-medium ${appCenterStatusClass(
                            selectedItem.statusKind,
                          )}`}
                        >
                          {t(
                            `plugin.apps.center.status.${selectedItem.statusKind}`,
                          )}
                        </span>
                      </div>
                    </div>
                  </div>
                  <p className="text-sm leading-6 text-[color:var(--lime-text-muted)]">
                    {selectedItem.description ||
                      t("plugin.apps.center.descriptionFallback")}
                  </p>
                  <button
                    type="button"
                    className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-full bg-[color:var(--lime-text-strong)] px-3 text-sm font-semibold text-[color:var(--lime-surface)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500 disabled:opacity-100"
                    disabled={isPrimaryActionDisabled(selectedItem, busyAction)}
                    onClick={() => void handlePrimaryAction(selectedItem)}
                    data-testid={`plugins-detail-primary-action-${selectedItem.appId}`}
                  >
                    {canOneClickUpdate(selectedItem) ? (
                      <RefreshCw size={16} />
                    ) : (
                      <PlayCircle size={16} />
                    )}
                    {t(getDetailActionLabelKey(selectedItem))}
                  </button>
                  {selectedItem.installedState &&
                  selectedItem.cloudApp &&
                  hasCloudUpdate(selectedItem) ? (
                    <button
                      type="button"
                      className="inline-flex h-10 w-full items-center justify-center rounded-full border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] px-3 text-sm font-semibold text-[color:var(--lime-text)] transition hover:bg-[color:var(--lime-surface-hover)] disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={
                        canOneClickUpdate(selectedItem)
                          ? isPrimaryActionDisabled(selectedItem, busyAction) ||
                            !getDefaultEntry(selectedItem)
                          : isCloudActionDisabled(selectedItem, busyAction)
                      }
                      onClick={() => {
                        if (canOneClickUpdate(selectedItem)) {
                          const entry = getDefaultEntry(selectedItem);
                          if (selectedItem.installedState && entry) {
                            void handleLaunchEntry(
                              selectedItem.installedState,
                              entry,
                            );
                            return;
                          }
                        }
                        void handleCloudAction(selectedItem);
                      }}
                      data-testid={
                        canOneClickUpdate(selectedItem)
                          ? `plugins-launch-installed-${selectedItem.appId}`
                          : `plugins-install-cloud-${selectedItem.appId}`
                      }
                    >
                      {canOneClickUpdate(selectedItem)
                        ? t("plugin.apps.center.action.open")
                        : t("plugin.apps.center.action.update")}
                    </button>
                  ) : null}
                </section>

                {selectedItem.registrationBlocked && selectedItem.cloudApp
                  ? renderRegistrationForm(selectedItem.cloudApp)
                  : null}

                {(() => {
                  const hostSummary =
                    buildAppCenterHostLifecycleSummary(selectedItem);
                  if (!hostSummary) {
                    return null;
                  }
                  return (
                    <section
                      className="space-y-3 rounded-lg border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface-soft)] p-3"
                      data-testid="plugins-host-lifecycle"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2 text-sm font-semibold text-[color:var(--lime-text-strong)]">
                          <ShieldCheck size={16} />
                          {t("plugin.apps.center.host.title")}
                        </div>
                        <span
                          className={`rounded-md border px-2.5 py-1 text-xs font-medium ${hostLifecycleClass(
                            hostSummary.tone,
                          )}`}
                          data-testid={`plugins-detail-host-status-${selectedItem.appId}`}
                        >
                          {dynamicT(hostSummary.labelKey)}
                        </span>
                      </div>
                      <div className="grid gap-2 text-xs text-[color:var(--lime-text-muted)] sm:grid-cols-2">
                        <div className="rounded-lg border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] px-3 py-2">
                          {t("plugin.apps.center.host.rightSurface", {
                            tabs: hostSummary.supportedTabCount,
                            tab: hostSummary.defaultTab ?? "-",
                          })}
                        </div>
                        <div className="rounded-lg border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] px-3 py-2">
                          {t(
                            hostSummary.blockerCount > 0
                              ? "plugin.apps.center.host.blockers"
                              : "plugin.apps.center.host.noBlockers",
                            {
                              count: hostSummary.blockerCount,
                            },
                          )}
                        </div>
                        {hostSummary.articleWorkspaceEnabled ? (
                          <div className="rounded-lg border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] px-3 py-2 sm:col-span-2">
                            {t("plugin.apps.center.host.articleWorkspace", {
                              count: hostSummary.productObjectCount,
                            })}
                          </div>
                        ) : null}
                      </div>
                      <PluginReadinessIssueSummary
                        summary={hostSummary}
                        appId={selectedItem.appId}
                      />
                    </section>
                  );
                })()}

                {(() => {
                  const activationEntries =
                    buildDetailActivationEntries(selectedItem);
                  if (activationEntries.length === 0) {
                    return null;
                  }
                  return (
                    <section
                      className="space-y-3"
                      data-testid="plugins-detail-agents"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="text-sm font-semibold text-[color:var(--lime-text-strong)]">
                          {t("plugin.apps.center.detail.agents")}
                        </h3>
                        <span className="text-xs text-[color:var(--lime-text-muted)]">
                          {activationEntries.length}
                        </span>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {activationEntries.map((entry) => (
                          <button
                            key={entry.key}
                            type="button"
                            className="rounded-[12px] border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] px-3 py-3 text-left transition hover:border-[color:var(--lime-surface-border-strong)] hover:bg-[color:var(--lime-surface-hover)] disabled:cursor-not-allowed disabled:opacity-60"
                            disabled={
                              !selectedItem.installedState ||
                              selectedItem.installedState.disabled ||
                              Boolean(busyAction)
                            }
                            onClick={() => {
                              if (!selectedItem.installedState) {
                                return;
                              }
                              handleLaunchActivationDeclaration(
                                selectedItem.installedState,
                                entry,
                              );
                            }}
                            data-testid={`plugins-detail-agent-${entry.key}`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-[color:var(--lime-text-strong)]">
                                  {entry.title}
                                </p>
                                {entry.meta ? (
                                  <p className="mt-1 truncate text-xs text-[color:var(--lime-text-muted)]">
                                    {entry.meta}
                                  </p>
                                ) : null}
                              </div>
                              <PlayCircle
                                className="shrink-0 text-emerald-600"
                                size={16}
                              />
                            </div>
                            {entry.aliases?.length ? (
                              <div className="mt-3 flex flex-wrap gap-1.5">
                                {entry.aliases.map((alias) => (
                                  <span
                                    key={alias}
                                    className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700"
                                  >
                                    {alias}
                                  </span>
                                ))}
                              </div>
                            ) : null}
                          </button>
                        ))}
                      </div>
                    </section>
                  );
                })()}

                {(() => {
                  const subagents = buildDetailSubagents(selectedItem);
                  if (subagents.length === 0) {
                    return null;
                  }
                  return (
                    <section
                      className="space-y-3"
                      data-testid="plugins-detail-subagents"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="text-sm font-semibold text-[color:var(--lime-text-strong)]">
                          {t("plugin.apps.center.detail.subagents")}
                        </h3>
                        <span className="text-xs text-[color:var(--lime-text-muted)]">
                          {subagents.length}
                        </span>
                      </div>
                      <div className="space-y-2">
                        {subagents.map((subagent) => (
                          <div
                            key={subagent.key}
                            className="rounded-[12px] border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] px-3 py-3"
                            data-testid={`plugins-detail-subagent-${subagent.key}`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-[color:var(--lime-text-strong)]">
                                  {subagent.title}
                                </p>
                                {subagent.description ? (
                                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-[color:var(--lime-text-muted)]">
                                    {subagent.description}
                                  </p>
                                ) : null}
                              </div>
                              {subagent.required ? (
                                <span className="shrink-0 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                                  {t("plugin.apps.center.detail.required")}
                                </span>
                              ) : null}
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>
                  );
                })()}

                <section
                  className="space-y-3"
                  data-testid="plugins-detail-authorizations"
                >
                  <h3 className="text-sm font-semibold text-[color:var(--lime-text-strong)]">
                    {t("plugin.apps.center.detail.authorizations")}
                  </h3>
                  {getDetailPermissions(selectedItem).length ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {getDetailPermissions(selectedItem).map((permission) => (
                        <div
                          key={permission.key}
                          className="rounded-[12px] border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] px-3 py-3"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-[color:var(--lime-text-strong)]">
                                {permission.key}
                              </p>
                              {permission.reason ? (
                                <p className="mt-1 line-clamp-2 text-xs leading-5 text-[color:var(--lime-text-muted)]">
                                  {permission.reason}
                                </p>
                              ) : null}
                            </div>
                            <span
                              className={`shrink-0 rounded-md border px-2 py-0.5 text-xs font-medium ${
                                permission.required
                                  ? "border-amber-200 bg-amber-50 text-amber-700"
                                  : "border-slate-200 bg-slate-50 text-slate-600"
                              }`}
                            >
                              {permission.required
                                ? t("plugin.apps.center.detail.required")
                                : t("plugin.apps.center.detail.optional")}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-[12px] border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface-soft)] px-3 py-3 text-sm text-[color:var(--lime-text-muted)]">
                      {selectedItem.registrationBlocked
                        ? t("plugin.apps.center.detail.authorizationRequired")
                        : t("plugin.apps.center.detail.noAuthorizations")}
                    </div>
                  )}
                </section>

                {(() => {
                  const skills = buildDetailSkills(selectedItem);
                  if (skills.length === 0) {
                    return null;
                  }
                  return (
                    <section
                      className="space-y-3"
                      data-testid="plugins-detail-skills"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="text-sm font-semibold text-[color:var(--lime-text-strong)]">
                          {t("plugin.apps.center.detail.skills")}
                        </h3>
                        <span className="text-xs text-[color:var(--lime-text-muted)]">
                          {skills.length}
                        </span>
                      </div>
                      <div className="space-y-2">
                        {skills.map((skill) => (
                          <div
                            key={skill.key}
                            className="rounded-[12px] border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] px-3 py-3"
                            data-testid={`plugins-detail-skill-${skill.key}`}
                          >
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-semibold text-[color:var(--lime-text-strong)]">
                                {skill.title}
                              </span>
                              {skill.description ? (
                                <span className="mt-1 block line-clamp-2 text-xs leading-5 text-[color:var(--lime-text-muted)]">
                                  {skill.description}
                                </span>
                              ) : null}
                            </span>
                          </div>
                        ))}
                      </div>
                    </section>
                  );
                })()}

                {selectedItem.installedState ? (
                  <section className="space-y-3">
                    <div className="flex items-center gap-2 text-sm font-semibold text-[color:var(--lime-text-strong)]">
                      <Layers3 size={16} />
                      {t("plugin.apps.center.detail.commonEntries")}
                    </div>
                    {getDetailCommonEntries(selectedItem).length > 0 ? (
                      <div className="grid gap-3 sm:grid-cols-2">
                        {getDetailCommonEntries(selectedItem)
                          .slice(0, 5)
                          .map((entry) => (
                            <button
                              key={entry.key}
                              type="button"
                              className="flex items-center justify-between gap-3 rounded-[10px] border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] px-3 py-3 text-left transition hover:border-[color:var(--lime-surface-border-strong)] hover:bg-[color:var(--lime-surface-hover)] disabled:cursor-not-allowed disabled:opacity-60"
                              disabled={
                                selectedItem.installedState?.disabled ||
                                Boolean(busyAction)
                              }
                              onClick={() =>
                                selectedItem.installedState
                                  ? void handleLaunchEntry(
                                      selectedItem.installedState,
                                      entry,
                                    )
                                  : undefined
                              }
                              data-testid={`plugins-launch-entry-${entry.key}`}
                            >
                              <span className="min-w-0">
                                <span className="block truncate text-sm font-medium text-[color:var(--lime-text-strong)]">
                                  {entry.title}
                                </span>
                                <span className="mt-1 block truncate text-xs text-[color:var(--lime-text-muted)]">
                                  {t(
                                    `plugin.apps.runtime.entryKind.${entry.kind}`,
                                  )}
                                </span>
                              </span>
                              <PlayCircle
                                className="shrink-0 text-sky-600"
                                size={16}
                              />
                            </button>
                          ))}
                      </div>
                    ) : (
                      <p className="rounded-lg border border-dashed border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface-soft)] p-4 text-sm text-[color:var(--lime-text-muted)]">
                        {t("plugin.apps.center.detail.noEntries")}
                      </p>
                    )}
                  </section>
                ) : null}

                {mountedUi && mountedUi.appId === selectedItem.appId ? (
                  <section className="sr-only" data-testid="plugins-mounted-ui">
                    {t("plugin.apps.surface.title", {
                      title: mountedUi.title,
                    })}
                    {mountedUi.route ?? mountedUi.entryKey}
                  </section>
                ) : null}

                {launchSummary ? (
                  <div
                    role="status"
                    className="rounded-lg border border-[color:var(--lime-info-border)] bg-[color:var(--lime-info-soft)] px-4 py-3 text-sm font-medium text-[color:var(--lime-text-strong)]"
                    data-testid="plugins-launch-summary"
                  >
                    {launchSummary}
                  </div>
                ) : null}

                {selected ? (
                  <section
                    className="space-y-3 rounded-lg border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface-soft)] p-3"
                    data-testid="plugins-lifecycle-actions"
                  >
                    <div className="grid gap-2 sm:grid-cols-2">
                      <button
                        type="button"
                        className="inline-flex items-center justify-center gap-2 rounded-full border border-amber-200 bg-[color:var(--lime-surface)] px-3 py-2 text-xs font-medium text-amber-700 transition hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={selected.disabled || Boolean(busyAction)}
                        onClick={() => void handleSetDisabled(selected, true)}
                        data-testid="plugins-disable"
                      >
                        <Ban size={16} />
                        {t("plugin.apps.action.disable")}
                      </button>
                      <button
                        type="button"
                        className="inline-flex items-center justify-center gap-2 rounded-full border border-emerald-200 bg-[color:var(--lime-surface)] px-3 py-2 text-xs font-medium text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={!selected.disabled || Boolean(busyAction)}
                        onClick={() => void handleSetDisabled(selected, false)}
                        data-testid="plugins-enable"
                      >
                        <CheckCircle2 size={16} />
                        {t("plugin.apps.action.enable")}
                      </button>
                      <button
                        type="button"
                        className="rounded-full border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] px-3 py-2 text-left text-xs font-medium text-[color:var(--lime-text)] transition hover:bg-[color:var(--lime-surface-hover)] disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={Boolean(busyAction)}
                        onClick={() =>
                          void handlePreviewUninstall(selected, "keep-data")
                        }
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
                        onClick={() =>
                          void handlePreviewUninstall(selected, "delete-data")
                        }
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
                                {t(
                                  "plugin.lab.manager.evidence.residual.pendingDeletion",
                                  {
                                    count:
                                      activeUninstallDescriptor.residualAudit
                                        .pendingDeletionCount,
                                  },
                                )}
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
                                {t(
                                  "plugin.apps.uninstallPreview.deleteDataGate.title",
                                )}
                              </p>
                              <p className="text-sm text-rose-800">
                                {t(
                                  "plugin.apps.uninstallPreview.deleteDataGate.description",
                                )}
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
                                      void handlePreviewUninstall(
                                        selected,
                                        "keep-data",
                                      )
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
                                setDeleteDataConfirmationInput(
                                  event.target.value,
                                )
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
                                ? t(
                                    "plugin.apps.uninstallPreview.deleteDataGate.dryRunOnly",
                                  )
                                : deleteDataConfirmationMatches
                                  ? t(
                                      "plugin.apps.uninstallPreview.deleteDataGate.ready",
                                    )
                                  : t(
                                      "plugin.apps.uninstallPreview.deleteDataGate.mismatch",
                                    )}
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
                          onClick={() => void handleConfirmUninstall()}
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
                ) : null}

                <section>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-3 rounded-[10px] border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] px-3 py-3 text-left text-sm font-semibold text-[color:var(--lime-text-strong)] transition hover:bg-[color:var(--lime-surface-hover)]"
                    onClick={() => setMoreInfoOpen((open) => !open)}
                    data-testid="plugins-more-info"
                  >
                    {t("plugin.apps.center.detail.moreInfo")}
                    <span className="text-xs font-medium text-[color:var(--lime-text-muted)]">
                      {moreInfoOpen
                        ? t("plugin.apps.center.detail.collapse")
                        : t("plugin.apps.center.detail.expand")}
                    </span>
                  </button>
                  {moreInfoOpen ? (
                    <div
                      className="mt-2 space-y-3 rounded-lg border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface-soft)] p-3 text-xs text-[color:var(--lime-text-muted)]"
                      data-testid="plugins-more-info-content"
                    >
                      <p className="break-all">
                        {t("plugin.apps.center.detail.appId")}:{" "}
                        {selectedItem.appId}
                      </p>
                      <div className="rounded-lg border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] p-3">
                        <p className="text-sm font-semibold text-[color:var(--lime-text-strong)]">
                          {t("plugin.apps.center.detail.sourceVersion")}
                        </p>
                        <div className="mt-3 grid gap-2 text-sm text-[color:var(--lime-text-muted)]">
                          <div className="flex items-center justify-between gap-3">
                            <span>
                              {t("plugin.apps.center.detail.installedVersion")}
                            </span>
                            <span className="font-medium text-[color:var(--lime-text-strong)]">
                              {selectedItem.installedVersion ?? "-"}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <span>
                              {t("plugin.apps.center.detail.cloudVersion")}
                            </span>
                            <span className="font-medium text-[color:var(--lime-text-strong)]">
                              {selectedItem.cloudVersion ?? "-"}
                            </span>
                          </div>
                        </div>
                      </div>
                      {selectedItem.installedState ? (
                        <>
                          <p className="break-all">
                            {t("plugin.apps.installReview.source", {
                              kind: selectedItem.installedState.identity
                                .sourceKind,
                            })}
                          </p>
                          <p className="break-all">
                            {selectedItem.installedState.identity.sourceUri}
                          </p>
                          <p className="break-all">
                            {t("plugin.apps.installReview.hashes", {
                              packageHash:
                                selectedItem.installedState.identity
                                  .packageHash,
                              manifestHash:
                                selectedItem.installedState.identity
                                  .manifestHash,
                            })}
                          </p>
                        </>
                      ) : null}
                      {selectedItem.sourceState?.reason ? (
                        <p>{selectedItem.sourceState.reason}</p>
                      ) : null}
                    </div>
                  ) : null}
                </section>
              </div>
              <aside
                className="sticky top-4 space-y-1 rounded-[16px] border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] p-4 text-sm shadow-sm shadow-[color:var(--lime-shadow-color)]"
                data-testid="plugins-detail-summary"
              >
                {[
                  [
                    t("plugin.apps.center.detail.summary.category"),
                    getDetailCategory(selectedItem) ??
                      t(`plugin.apps.center.source.${selectedItem.sourceKind}`),
                  ],
                  [
                    t("plugin.apps.center.detail.summary.version"),
                    selectedItem.installedVersion ??
                      selectedItem.cloudVersion ??
                      "-",
                  ],
                  [
                    t("plugin.apps.center.detail.summary.source"),
                    t(`plugin.apps.center.source.${selectedItem.sourceKind}`),
                  ],
                  [
                    t("plugin.apps.center.detail.summary.installedAt"),
                    selectedItem.installedState?.installedAt ?? "-",
                  ],
                  [
                    t("plugin.apps.center.detail.summary.capabilities"),
                    t("plugin.apps.center.detail.summary.capabilityCount", {
                      count: getDetailCapabilityCount(selectedItem),
                    }),
                  ],
                  [
                    t("plugin.apps.center.detail.summary.developer"),
                    getDetailDeveloper(selectedItem) ?? "-",
                  ],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="flex items-start justify-between gap-4 border-b border-[color:var(--lime-surface-border)] py-2 last:border-b-0"
                  >
                    <span className="text-xs text-[color:var(--lime-text-muted)]">
                      {label}
                    </span>
                    <span className="max-w-[150px] text-right text-xs font-semibold text-[color:var(--lime-text-strong)]">
                      {value}
                    </span>
                  </div>
                ))}
                {buildDetailTags(selectedItem).length ? (
                  <div className="pt-3">
                    <p className="text-xs text-[color:var(--lime-text-muted)]">
                      {t("plugin.apps.center.detail.summary.tags")}
                    </p>
                    <div className="mt-2 flex flex-wrap justify-end gap-1.5">
                      {buildDetailTags(selectedItem).map((tag) => (
                        <span
                          key={tag}
                          className="rounded-md bg-[color:var(--lime-surface-soft)] px-2 py-0.5 text-xs font-medium text-[color:var(--lime-text-muted)]"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
              </aside>
            </main>
          ) : null}

          {renderInstallReviewDialog()}

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
