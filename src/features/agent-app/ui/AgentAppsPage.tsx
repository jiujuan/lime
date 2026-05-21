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
  X,
} from "lucide-react";
import { toast } from "sonner";
import { convertLocalFileSrc } from "@/lib/api/fileSystem";
import {
  AGENT_APPS_CHANGED_EVENT,
  launchAgentAppShell,
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
import { buildLimeRuntimeProfileForInstalledState } from "../runtime-profile";
import { resolveShellLaunchDescriptorForInstalledEntry } from "../shell";
import {
  buildAgentAppDeleteDataConfirmationPhrase,
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
  PackageSourceKind,
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

const APP_CENTER_PAGE_SIZE = 20;

type AppCenterSourceKind = "cloud" | "local" | "hybrid";
type AppCenterStatusKind =
  | "installed"
  | "installable"
  | "update"
  | "registration"
  | "disabled"
  | "partial";
type AppCenterStatusFilter = "all" | "installed" | "installable" | "attention";
type AppCenterSourceFilter = "all" | "cloud" | "local";
type AppCenterActionLabelKey =
  | "agentApp.apps.center.action.open"
  | "agentApp.apps.center.action.install"
  | "agentApp.apps.center.action.update"
  | "agentApp.apps.center.action.updateOneClick"
  | "agentApp.apps.center.action.activate"
  | "agentApp.apps.center.action.enable";

type CloudSourceState = ReturnType<typeof buildCloudAgentAppSourceState>;

interface AppCenterItem {
  appId: string;
  title: string;
  description: string;
  iconSrc: string;
  installedState?: InstalledAgentAppState;
  cloudApp?: CloudBootstrapApp;
  sourceKind: AppCenterSourceKind;
  statusKind: AppCenterStatusKind;
  installedVersion?: string;
  cloudVersion?: string;
  entries: ProjectedEntry[];
  sourceState?: CloudSourceState;
  registrationBlocked: boolean;
  canReviewCloud: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function normalizeOptionalText(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim();
  return normalized || undefined;
}

function escapeSvgText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function svgToDataUri(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function buildAppNameIcon(title: string): string {
  const safeTitle = escapeSvgText(title || "Lime App");
  const initial = escapeSvgText([...safeTitle][0] || "L");
  return svgToDataUri(
    `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96" role="img" aria-label="${safeTitle}"><defs><linearGradient id="g" x1="16" y1="12" x2="82" y2="86" gradientUnits="userSpaceOnUse"><stop stop-color="#ecfdf5"/><stop offset="0.55" stop-color="#eff6ff"/><stop offset="1" stop-color="#f8fafc"/></linearGradient></defs><rect width="96" height="96" rx="22" fill="url(#g)"/><rect x="1" y="1" width="94" height="94" rx="21" fill="none" stroke="#cbd5e1"/><circle cx="70" cy="25" r="9" fill="#10b981" fill-opacity="0.18"/><path d="M24 36h48M24 50h36M24 64h26" stroke="#64748b" stroke-width="5" stroke-linecap="round"/><text x="70" y="74" text-anchor="middle" font-family="ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif" font-size="24" font-weight="800" fill="#0f172a">${initial}</text></svg>`,
  );
}

function isDirectAssetSrc(value: string): boolean {
  return /^(?:https?:|data:|blob:|asset:|tauri:)/i.test(value);
}

function isRelativeIconPath(value: string): boolean {
  return value.startsWith("./") || value.startsWith("../");
}

function joinLocalPath(basePath: string, relativePath: string): string {
  const normalizedBase = basePath.replace(/\/+$/, "");
  const normalizedRelative = relativePath.replace(/^\.?\//, "");
  return `${normalizedBase}/${normalizedRelative}`;
}

function getPresentationString(
  presentation: unknown,
  keys: string[],
): string | undefined {
  if (!isRecord(presentation)) {
    return undefined;
  }
  for (const key of keys) {
    const value = normalizeOptionalText(presentation[key]);
    if (value) {
      return value;
    }
  }
  return undefined;
}

function getCloudAppIconCandidate(
  cloudApp: CloudBootstrapApp | undefined,
): string | undefined {
  if (!cloudApp) {
    return undefined;
  }
  return (
    normalizeOptionalText(cloudApp.iconUrl) ??
    normalizeOptionalText(cloudApp.logoUrl) ??
    getPresentationString(cloudApp.presentation, ["iconUrl", "logoUrl"]) ??
    normalizeOptionalText(cloudApp.icon) ??
    getPresentationString(cloudApp.presentation, ["icon"])
  );
}

function getInstalledAppIconCandidate(
  state: InstalledAgentAppState | undefined,
): string | undefined {
  if (!state) {
    return undefined;
  }
  return (
    normalizeOptionalText(state.projection.install.branding.icon) ??
    getPresentationString(state.projection.app.presentation, [
      "iconUrl",
      "logoUrl",
      "icon",
    ]) ??
    getPresentationString(state.manifest.presentation, [
      "iconUrl",
      "logoUrl",
      "icon",
    ])
  );
}

function getLocalSourceRoot(
  state: InstalledAgentAppState | undefined,
): string | undefined {
  if (
    !state ||
    !["local_folder", "explicit_manifest"].includes(
      state.identity.sourceKind as PackageSourceKind,
    )
  ) {
    return undefined;
  }
  return normalizeOptionalText(state.identity.sourceUri);
}

function resolveAppIconSrc(params: {
  title: string;
  installedState?: InstalledAgentAppState;
  cloudApp?: CloudBootstrapApp;
}): string {
  const candidate =
    getInstalledAppIconCandidate(params.installedState) ??
    getCloudAppIconCandidate(params.cloudApp);
  if (!candidate) {
    return buildAppNameIcon(params.title);
  }
  if (candidate.trim().startsWith("<svg")) {
    return svgToDataUri(candidate.trim());
  }
  if (isDirectAssetSrc(candidate)) {
    return candidate;
  }
  const sourceRoot = getLocalSourceRoot(params.installedState);
  if (sourceRoot && isRelativeIconPath(candidate)) {
    return convertLocalFileSrc(joinLocalPath(sourceRoot, candidate));
  }
  return buildAppNameIcon(params.title);
}

function buildProfile(): HostCapabilityProfile {
  return buildWorkflowRuntimeCapabilityProfile({
    ...PAGE_FLAGS,
    realAdapterEnabled: true,
    uiRuntimeEnabled: true,
    workerRuntimeEnabled: true,
  });
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

function getAppDescription(
  installedState: InstalledAgentAppState | undefined,
  cloudApp: CloudBootstrapApp | undefined,
): string {
  return (
    installedState?.projection.app.description ??
    installedState?.manifest.description ??
    cloudApp?.disabledReason ??
    ""
  );
}

function getAppTitle(
  installedState: InstalledAgentAppState | undefined,
  cloudApp: CloudBootstrapApp | undefined,
  appId: string,
): string {
  return (
    cloudApp?.displayName ??
    (installedState
      ? resolveInstalledAgentAppDisplayName(installedState)
      : null) ??
    appId
  );
}

function getSourceKind(
  installedState: InstalledAgentAppState | undefined,
  cloudApp: CloudBootstrapApp | undefined,
): AppCenterSourceKind {
  if (installedState && cloudApp) {
    return installedState.identity.sourceKind === "cloud_release"
      ? "cloud"
      : "hybrid";
  }
  if (cloudApp || installedState?.identity.sourceKind === "cloud_release") {
    return "cloud";
  }
  return "local";
}

function getStatusKind(params: {
  installedState?: InstalledAgentAppState;
  cloudApp?: CloudBootstrapApp;
  sourceState?: CloudSourceState;
  registrationBlocked: boolean;
}): AppCenterStatusKind {
  const { installedState, cloudApp, sourceState, registrationBlocked } = params;
  if (installedState?.disabled) {
    return "disabled";
  }
  if (registrationBlocked) {
    return "registration";
  }
  if (
    installedState &&
    cloudApp &&
    cloudApp.version !== installedState.identity.appVersion
  ) {
    return "update";
  }
  if (
    installedState &&
    !["ready", "degraded"].includes(installedState.readiness.status)
  ) {
    return "partial";
  }
  if (installedState) {
    return "installed";
  }
  if (sourceState && !sourceState.canReview) {
    return "partial";
  }
  return "installable";
}

function buildAppCenterItems(params: {
  installed: InstalledAgentAppState[];
  cloudApps: CloudBootstrapApp[];
  catalogSource: AgentAppCloudCatalogResult["source"] | "seeded";
}): AppCenterItem[] {
  const installedById = new Map(
    params.installed.map((state) => [state.appId, state] as const),
  );
  const cloudById = new Map<string, CloudBootstrapApp>();
  for (const app of params.cloudApps) {
    if (!cloudById.has(app.appId)) {
      cloudById.set(app.appId, app);
    }
  }

  const appIds = new Set<string>([
    ...params.installed.map((state) => state.appId),
    ...params.cloudApps.map((app) => app.appId),
  ]);

  return Array.from(appIds)
    .map((appId) => {
      const installedState = installedById.get(appId);
      const cloudApp = cloudById.get(appId);
      const sourceState = cloudApp
        ? buildCloudAgentAppSourceState({
            app: cloudApp,
            catalogSource: params.catalogSource,
            installed: params.installed,
          })
        : undefined;
      const registrationBlocked = Boolean(
        cloudApp?.registrationRequired &&
        cloudApp.registrationState !== "active",
      );
      const statusKind = getStatusKind({
        installedState,
        cloudApp,
        sourceState,
        registrationBlocked,
      });
      const title = getAppTitle(installedState, cloudApp, appId);

      return {
        appId,
        title,
        description: getAppDescription(installedState, cloudApp),
        iconSrc: resolveAppIconSrc({ title, installedState, cloudApp }),
        installedState,
        cloudApp,
        sourceKind: getSourceKind(installedState, cloudApp),
        statusKind,
        installedVersion: installedState?.identity.appVersion,
        cloudVersion: cloudApp?.version,
        entries: installedState?.projection.entries ?? [],
        sourceState,
        registrationBlocked,
        canReviewCloud: Boolean(sourceState?.canReview),
      } satisfies AppCenterItem;
    })
    .sort((left, right) => {
      if (Boolean(left.installedState) !== Boolean(right.installedState)) {
        return left.installedState ? -1 : 1;
      }
      if (left.statusKind !== right.statusKind) {
        const weights: Record<AppCenterStatusKind, number> = {
          update: 0,
          registration: 1,
          disabled: 2,
          partial: 3,
          installed: 4,
          installable: 5,
        };
        return weights[left.statusKind] - weights[right.statusKind];
      }
      return left.title.localeCompare(right.title, "zh-Hans-CN");
    });
}

function matchesStatusFilter(
  item: AppCenterItem,
  filter: AppCenterStatusFilter,
): boolean {
  if (filter === "all") {
    return true;
  }
  if (filter === "installed") {
    return Boolean(item.installedState);
  }
  if (filter === "installable") {
    return item.statusKind === "installable";
  }
  return ["update", "registration", "disabled", "partial"].includes(
    item.statusKind,
  );
}

function matchesSourceFilter(
  item: AppCenterItem,
  filter: AppCenterSourceFilter,
): boolean {
  if (filter === "all") {
    return true;
  }
  if (filter === "cloud") {
    return item.sourceKind === "cloud" || item.sourceKind === "hybrid";
  }
  return item.sourceKind === "local" || item.sourceKind === "hybrid";
}

function getDefaultEntry(item: AppCenterItem): ProjectedEntry | null {
  return item.entries.find(isUiEntry) ?? item.entries[0] ?? null;
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
  const [cloudCatalog, setCloudCatalog] =
    useState<AgentAppCloudCatalogResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [registrationCodes, setRegistrationCodes] = useState<
    Record<string, string>
  >({});
  const [launchSummary, setLaunchSummary] = useState<string | null>(null);
  const [mountedUi, setMountedUi] = useState<AgentAppUiMountResult | null>(
    null,
  );
  const [installReview, setInstallReview] =
    useState<AgentAppInstallReviewResult | null>(null);
  const [uninstallPreview, setUninstallPreview] =
    useState<AgentAppUninstallRehearsalResult | null>(null);
  const [uninstallDescriptor, setUninstallDescriptor] =
    useState<AgentAppLifecycleUninstallRehearsalDescriptor | null>(null);
  const [deleteDataConfirmationInput, setDeleteDataConfirmationInput] =
    useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] =
    useState<AppCenterStatusFilter>("all");
  const [sourceFilter, setSourceFilter] =
    useState<AppCenterSourceFilter>("all");
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
      ? buildAgentAppDeleteDataConfirmationPhrase(activeUninstallDescriptor)
      : "";
  const deleteDataConfirmationMatches =
    activeUninstallDescriptor?.mode !== "delete-data" ||
    deleteDataConfirmationInput.trim() === deleteDataConfirmationPhrase;

  const appItems = useMemo(
    () =>
      buildAppCenterItems({
        installed,
        cloudApps,
        catalogSource: cloudCatalog?.source ?? "seeded",
      }),
    [cloudApps, cloudCatalog?.source, installed],
  );

  const filteredItems = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLocaleLowerCase();
    return appItems.filter((item) => {
      if (!matchesStatusFilter(item, statusFilter)) {
        return false;
      }
      if (!matchesSourceFilter(item, sourceFilter)) {
        return false;
      }
      if (!normalizedQuery) {
        return true;
      }
      return [item.title, item.description, item.appId]
        .filter(Boolean)
        .some((value) => value.toLocaleLowerCase().includes(normalizedQuery));
    });
  }, [appItems, searchQuery, sourceFilter, statusFilter]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredItems.length / APP_CENTER_PAGE_SIZE),
  );
  const pagedItems = filteredItems.slice(
    (currentPage - 1) * APP_CENTER_PAGE_SIZE,
    currentPage * APP_CENTER_PAGE_SIZE,
  );
  const selectedItem =
    filteredItems.find((item) => item.appId === selectedAppId) ?? null;
  const selected = selectedItem?.installedState ?? null;

  const filterCounts = useMemo(
    () => ({
      all: appItems.length,
      installed: appItems.filter((item) => Boolean(item.installedState)).length,
      installable: appItems.filter((item) => item.statusKind === "installable")
        .length,
      attention: appItems.filter((item) =>
        ["update", "registration", "disabled", "partial"].includes(
          item.statusKind,
        ),
      ).length,
    }),
    [appItems],
  );

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
        if (requestedAppId) {
          return requestedAppId;
        }
        if (!current) {
          return null;
        }
        const stillExists =
          list.states.some((state) => state.appId === current) ||
          catalog.payload.apps.some((app) => app.appId === current);
        return stillExists ? current : null;
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
    },
    [t],
  );

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
    setMoreInfoOpen(false);
  }

  async function handleConfirmInstallReview() {
    if (!installReview) {
      return;
    }
    const state = await runBusy(
      `confirm-install:${installReview.review.appId}`,
      () => saveInstalledAgentAppState({ state: installReview.state }),
    );
    if (!state) {
      return;
    }
    toast.success(t("agentApp.apps.toast.installed"), {
      description: resolveInstalledAgentAppDisplayName(state),
    });
    setInstallReview(null);
    setMoreInfoOpen(false);
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
    setMoreInfoOpen(false);
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

  async function handleSetDisabled(
    state: InstalledAgentAppState,
    disabled: boolean,
  ) {
    const descriptor = buildAgentAppLifecycleToggleDescriptor({
      state,
      action: disabled ? "disable" : "enable",
    });
    if (descriptor.status === "noop") {
      return;
    }
    const result = await runBusy(
      `${descriptor.action}:${descriptor.appId}`,
      () => setAgentAppDisabled(descriptor.request),
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
      setDeleteDataConfirmationInput("");
      return;
    }
    const result = await runBusy(`uninstall:${descriptor.appId}:${mode}`, () =>
      previewAgentAppUninstall(descriptor.request),
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
    const request =
      descriptor.mode === "delete-data"
        ? {
            ...descriptor.request,
            confirmationPhrase: deleteDataConfirmationInput.trim(),
          }
        : descriptor.request;
    const result = await runBusy(
      `confirm-uninstall:${uninstallPreview.appId}:${uninstallPreview.mode}`,
      () => uninstallAgentApp(request),
    );
    if (!result) {
      return;
    }
    if (result.status === "blocked") {
      const codes = result.blockerCodes?.join(", ") || "blocked";
      setLaunchSummary(
        t("agentApp.apps.uninstall.blocked", {
          codes,
        }),
      );
      toast.error(t("agentApp.apps.toast.uninstallBlocked"));
      return;
    }
    setInstalled(result.list.states);
    setIssueCount(result.list.issues.length);
    setSelectedAppId(null);
    setUninstallPreview(null);
    setUninstallDescriptor(null);
    setDeleteDataConfirmationInput("");
    setLaunchSummary(
      t("agentApp.apps.uninstall.completed", {
        removed: result.removedTargetCount,
        missing: result.missingTargetCount,
      }),
    );
    dispatchAgentAppsChanged();
    toast.success(t("agentApp.apps.toast.uninstalled"));
  }

  const handleLaunchEntry = useCallback(
    async (state: InstalledAgentAppState, entry: ProjectedEntry) => {
      const launchGate = buildAgentAppLifecycleLaunchGate(state);
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
        const guard = evaluateAgentAppEntryRuntimeGuard({
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
          setLaunchSummary(t(`agentApp.lab.guard.summary.${guard.status}`));
          return;
        }

        const shellLaunch = resolveShellLaunchDescriptorForInstalledEntry({
          state,
          preview,
          runtimeProfile,
          entry,
        });
        if (shellLaunch.status === "ready") {
          const result = await launchAgentAppShell({
            descriptor: shellLaunch.descriptor,
          });
          if (result.status === "blocked") {
            const summary = t("agentApp.apps.launch.shellBlocked", {
              codes: result.blockerCodes.join(", "),
            });
            setLaunchSummary(summary);
            toast.error(t("agentApp.apps.toast.failed"), {
              description: result.message ?? summary,
            });
            return;
          }
          const summary = t("agentApp.apps.launch.shellLaunched", {
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
            const runtimeParams: AgentAppPageParams = {
              appId: state.appId,
              entryKey: entry.key,
              launchRequestKey: Date.now(),
            };
            onNavigate("agent-app", runtimeParams);
            return;
          }
          const mount = new UiExtensionHost({
            preview,
            flags: PAGE_FLAGS,
          }).mountEntry(entry.key);
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
    },
    [adapterStore, onNavigate, runBusy, t, uninstallDescriptor],
  );

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

  function openDetail(appId: string) {
    setSelectedAppId(appId);
    setMoreInfoOpen(false);
  }

  function closeDetail() {
    setSelectedAppId(null);
    setMoreInfoOpen(false);
  }

  function hasCloudUpdate(item: AppCenterItem): boolean {
    return Boolean(
      item.installedVersion &&
      item.cloudVersion &&
      item.installedVersion !== item.cloudVersion,
    );
  }

  function canOneClickUpdate(item: AppCenterItem): boolean {
    return Boolean(
      item.installedState &&
      item.cloudApp &&
      hasCloudUpdate(item),
    );
  }

  function getActionLabelKey(item: AppCenterItem): AppCenterActionLabelKey {
    if (item.installedState) {
      if (item.statusKind === "disabled") {
        return "agentApp.apps.center.action.enable";
      }
      if (item.registrationBlocked) {
        return "agentApp.apps.center.action.activate";
      }
      if (canOneClickUpdate(item)) {
        return "agentApp.apps.center.action.updateOneClick";
      }
      return "agentApp.apps.center.action.open";
    }
    if (item.statusKind === "registration") {
      return "agentApp.apps.center.action.activate";
    }
    if (item.statusKind === "update") {
      return "agentApp.apps.center.action.update";
    }
    if (item.statusKind === "installable" || !item.installedState) {
      return "agentApp.apps.center.action.install";
    }
    if (item.statusKind === "disabled") {
      return "agentApp.apps.center.action.enable";
    }
    return "agentApp.apps.center.action.open";
  }

  function getCloudActionLabelKey(
    item: AppCenterItem,
  ): AppCenterActionLabelKey {
    if (item.registrationBlocked) {
      return "agentApp.apps.center.action.activate";
    }
    if (hasCloudUpdate(item)) {
      return "agentApp.apps.center.action.update";
    }
    return "agentApp.apps.center.action.install";
  }

  function getDetailActionLabelKey(
    item: AppCenterItem,
  ): AppCenterActionLabelKey {
    return getActionLabelKey(item);
  }

  function isPrimaryActionDisabled(item: AppCenterItem): boolean {
    if (busyAction) {
      return true;
    }
    if (item.installedState) {
      if (item.statusKind === "disabled") {
        return false;
      }
      if (item.registrationBlocked) {
        return false;
      }
      if (canOneClickUpdate(item)) {
        return !item.canReviewCloud;
      }
      return !getDefaultEntry(item);
    }
    if (item.statusKind === "registration") {
      return true;
    }
    if (!item.installedState && !item.canReviewCloud) {
      return true;
    }
    if (item.cloudApp && ["installable", "update"].includes(item.statusKind)) {
      return !item.canReviewCloud;
    }
    if (item.statusKind === "disabled") {
      return false;
    }
    return Boolean(item.installedState && !getDefaultEntry(item));
  }

  function isCloudActionDisabled(item: AppCenterItem): boolean {
    if (Boolean(busyAction) || !item.cloudApp) {
      return true;
    }
    if (item.registrationBlocked) {
      return true;
    }
    return !item.canReviewCloud;
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
        className="rounded-2xl border border-amber-200 bg-amber-50 p-3"
        data-testid={`agent-apps-registration-${app.appId}`}
      >
        <p className="text-xs font-semibold text-amber-900">
          {t("agentApp.apps.center.detail.registrationHint")}
        </p>
        <p className="mt-1 text-xs leading-5 text-amber-800">
          {app.registrationHint ??
            t("agentApp.apps.registration.hintFallback", {
              state: app.registrationState ?? "required",
            })}
        </p>
        <div className="mt-3 flex gap-2">
          <input
            className="min-w-0 flex-1 rounded-full border border-amber-200 bg-white px-3 py-2 text-xs text-slate-900 outline-none transition focus:border-amber-400"
            value={registrationCodes[app.appId] ?? ""}
            onChange={(event) =>
              updateRegistrationCode(app.appId, event.target.value)
            }
            onInput={(event) =>
              updateRegistrationCode(app.appId, event.currentTarget.value)
            }
            placeholder={t("agentApp.apps.registration.placeholder")}
            aria-label={t("agentApp.apps.registration.placeholder")}
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
    );
  }

  function renderAppIcon(
    item: AppCenterItem,
    className = "size-16",
    testId = `agent-apps-icon-${item.appId}`,
  ): ReactElement {
    return (
      <div
        className={`overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-sm shadow-slate-950/5 ${className}`}
        data-testid={testId}
      >
        <img
          className="h-full w-full object-cover"
          src={item.iconSrc}
          alt={item.title}
          loading="lazy"
        />
      </div>
    );
  }

  return (
    <div
      className="lime-workbench-theme-scope flex h-full min-h-0 flex-col bg-slate-50 text-slate-950"
      data-testid="agent-apps-page"
    >
      <div className="flex-1 overflow-auto px-8 py-8">
        <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-3">
          <header className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <h1 className="text-3xl font-semibold tracking-tight text-slate-950">
                {t("agentApp.apps.center.title")}
              </h1>
              <p className="mt-2 max-w-xl text-base leading-6 text-slate-600">
                {t("agentApp.apps.center.description")}
              </p>
              {issueCount > 0 ? (
                <p
                  className="mt-2 text-sm font-medium text-amber-700"
                  data-testid="agent-apps-load-issues"
                >
                  {t("agentApp.apps.installed.issues", { count: issueCount })}
                </p>
              ) : null}
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <label className="relative w-full sm:w-[360px]">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
                  size={18}
                />
                <input
                  className="h-12 w-full rounded-lg border border-slate-300 bg-white pl-10 pr-3 text-sm text-slate-900 shadow-sm shadow-slate-950/5 outline-none transition placeholder:text-slate-400 focus:border-blue-500"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  onInput={(event) => setSearchQuery(event.currentTarget.value)}
                  placeholder={t("agentApp.apps.center.searchPlaceholder")}
                  data-testid="agent-apps-search"
                />
              </label>
              <div className="flex gap-3">
                <button
                  type="button"
                  className="inline-flex h-12 items-center gap-2 rounded-lg bg-blue-950 px-5 text-sm font-semibold text-white shadow-sm shadow-blue-950/10 transition hover:bg-blue-900 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={Boolean(busyAction)}
                  onClick={() => void handleInstallLocal()}
                  data-testid="agent-apps-install-local"
                >
                  <FolderOpen size={16} />
                  {t("agentApp.apps.center.installLocal")}
                </button>
                <button
                  type="button"
                  className="inline-flex h-12 items-center gap-2 rounded-lg border border-slate-300 bg-white px-5 text-sm font-semibold text-blue-950 shadow-sm shadow-slate-950/5 transition hover:border-blue-300 disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={() => void refresh()}
                  disabled={loading}
                  data-testid="agent-apps-refresh"
                >
                  <RefreshCw size={16} />
                  {t("agentApp.apps.center.refresh")}
                </button>
              </div>
            </div>
          </header>

          <section className="flex flex-wrap items-center gap-7">
            {(["all", "installed", "installable", "attention"] as const).map(
              (filter) => (
                <button
                  key={filter}
                  type="button"
                  className={`min-w-[132px] rounded-lg border px-5 py-2.5 text-sm font-semibold transition ${
                    statusFilter === filter
                      ? "border-blue-950 bg-blue-50 text-blue-950 shadow-sm shadow-blue-950/5"
                      : "border-slate-200 bg-white text-slate-600 hover:border-blue-200"
                  }`}
                  onClick={() => setStatusFilter(filter)}
                  data-testid={`agent-apps-status-filter-${filter}`}
                >
                  {t(`agentApp.apps.center.filter.${filter}`)}
                  <span className="ml-1 opacity-70">
                    {filterCounts[filter]}
                  </span>
                </button>
              ),
            )}
          </section>

          <section
            className="mt-2 grid min-h-[640px] grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm shadow-slate-950/5"
          >
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 px-4 py-3 text-sm text-slate-600">
              <div className="flex flex-wrap items-center gap-3">
                <span>{t("agentApp.apps.center.source.label")}：</span>
                {(["all", "cloud", "local"] as const).map((filter) => (
                  <button
                    key={filter}
                    type="button"
                    className={`font-semibold transition ${
                      sourceFilter === filter
                        ? "text-blue-950"
                        : "text-slate-500 hover:text-slate-900"
                    }`}
                    onClick={() => setSourceFilter(filter)}
                    data-testid={`agent-apps-source-filter-${filter}`}
                  >
                    {t(`agentApp.apps.center.source.${filter}`)}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <span>{t("agentApp.apps.center.status.label")}：</span>
                <button
                  type="button"
                  className={`font-semibold ${
                    statusFilter === "all" ? "text-blue-950" : "text-slate-500"
                  }`}
                  onClick={() => setStatusFilter("all")}
                >
                  {t("agentApp.apps.center.status.all")}
                </button>
                <span className="text-slate-300">/</span>
                <button
                  type="button"
                  className="font-medium text-slate-500 hover:text-slate-900"
                  onClick={() => setStatusFilter("attention")}
                >
                  {t("agentApp.apps.center.status.updateShort")}
                </button>
                <span className="text-slate-300">/</span>
                <button
                  type="button"
                  className="font-medium text-slate-500 hover:text-slate-900"
                  onClick={() => setStatusFilter("attention")}
                >
                  {t("agentApp.apps.center.status.authorizationShort")}
                </button>
              </div>
              <div className="text-slate-500">
                {t("agentApp.apps.center.sort.label")}：
                <span className="ml-2 font-medium text-slate-700">
                  {t("agentApp.apps.center.sort.recent")}
                </span>
              </div>
            </div>
            <main className="min-w-0 bg-slate-50/60">
              <div
                className="grid grid-cols-1 gap-4 p-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"
                data-testid="agent-apps-list"
              >
                {pagedItems.map((item) => {
                  const selectedRow = selectedItem?.appId === item.appId;
                  const defaultEntry = getDefaultEntry(item);
                  return (
                    <div
                      key={item.appId}
                      className={`flex min-h-[292px] flex-col rounded-2xl border bg-white p-4 shadow-sm shadow-slate-950/5 transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md hover:shadow-slate-950/10 ${
                        selectedRow
                          ? "border-emerald-300 ring-1 ring-emerald-200"
                          : "border-slate-200"
                      }`}
                      data-testid={`agent-apps-list-row-${item.appId}`}
                    >
                      <div className="flex min-w-0 items-start gap-3">
                        {renderAppIcon(item)}
                        <div className="min-w-0 flex-1">
                          <div className="flex min-w-0 items-start justify-between gap-3">
                            <h2 className="min-w-0 truncate text-base font-semibold text-slate-950">
                              {item.title}
                            </h2>
                            <span
                              className={`shrink-0 rounded-md border px-2 py-0.5 text-xs font-semibold ${appCenterStatusClass(
                                item.statusKind,
                              )}`}
                            >
                              {t(`agentApp.apps.center.status.${item.statusKind}`)}
                            </span>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <span
                              className={`inline-flex rounded-md border px-2 py-0.5 text-xs font-medium ${appCenterSourceClass(
                                item.sourceKind,
                              )}`}
                            >
                              {t(`agentApp.apps.center.source.${item.sourceKind}`)}
                            </span>
                            {item.sourceState ? (
                              <>
                                <span
                                  className="inline-flex rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-600"
                                  data-testid={`agent-apps-source-state-${item.appId}`}
                                >
                                  {t(item.sourceState.labelKey)}
                                </span>
                              </>
                            ) : null}
                          </div>
                        </div>
                      </div>

                      <p className="mt-4 line-clamp-3 min-h-[60px] text-sm leading-5 text-slate-600">
                        {item.description ||
                          t("agentApp.apps.center.descriptionFallback")}
                      </p>
                      {item.installedState ? (
                        <span
                          className="sr-only"
                          data-testid={`agent-apps-installed-${item.appId}`}
                        />
                      ) : null}
                      {item.registrationBlocked ? (
                        <span
                          className="sr-only"
                          data-testid={`agent-apps-registration-${item.appId}`}
                        />
                      ) : null}

                      <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                        <div className="text-sm text-slate-600">
                          <span className="font-medium text-slate-800">
                            {item.installedVersion
                              ? t("agentApp.apps.center.version.current", {
                                  version: item.installedVersion,
                                })
                              : (item.cloudVersion ?? "-")}
                          </span>
                          {item.installedVersion &&
                          item.cloudVersion &&
                          item.installedVersion !== item.cloudVersion ? (
                            <span className="mt-1 block text-amber-700">
                              {t("agentApp.apps.center.version.cloud", {
                                version: item.cloudVersion,
                              })}
                            </span>
                          ) : null}
                        </div>
                      </div>

                      <div className="mt-auto flex items-center gap-2 pt-4">
                        <button
                          type="button"
                          className="inline-flex h-10 flex-1 min-w-0 items-center justify-center gap-2 rounded-lg bg-blue-950 px-3 text-sm font-semibold text-white transition hover:bg-blue-900 disabled:cursor-not-allowed disabled:opacity-60"
                          disabled={isPrimaryActionDisabled(item)}
                          onClick={(event) => {
                            event.stopPropagation();
                            void handlePrimaryAction(item);
                          }}
                          data-testid={
                            !item.installedState && item.cloudApp
                              ? `agent-apps-install-cloud-${item.appId}`
                              : canOneClickUpdate(item)
                                ? `agent-apps-update-cloud-${item.appId}`
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
                          className="inline-flex h-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:border-blue-300 hover:text-blue-950"
                          onClick={() => openDetail(item.appId)}
                          data-testid={`agent-apps-open-detail-${item.appId}`}
                        >
                          {t("agentApp.apps.center.action.details")}
                        </button>
                      </div>

                      {item.installedState &&
                      item.cloudApp &&
                      hasCloudUpdate(item) ? (
                        <button
                          type="button"
                          className="mt-2 inline-flex h-10 w-full items-center justify-center rounded-lg border border-blue-800 bg-white px-3 text-sm font-semibold text-blue-950 transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
                          disabled={
                            canOneClickUpdate(item)
                              ? isPrimaryActionDisabled(item) || !defaultEntry
                              : isCloudActionDisabled(item)
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
                              ? `agent-apps-launch-installed-${item.appId}`
                              : `agent-apps-install-cloud-${item.appId}`
                          }
                        >
                          {canOneClickUpdate(item)
                            ? t("agentApp.apps.center.action.open")
                            : t(getCloudActionLabelKey(item))}
                        </button>
                      ) : null}
                    </div>
                  );
                })}
                {pagedItems.length === 0 ? (
                  <div className="col-span-full flex min-h-[360px] items-center justify-center p-8 text-center">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        {appItems.length === 0
                          ? t("agentApp.apps.center.empty.noApps")
                          : t("agentApp.apps.center.empty.noMatches")}
                      </p>
                      <p className="mt-2 text-sm text-slate-500">
                        {t("agentApp.apps.center.empty.helper")}
                      </p>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-4 py-3">
                <p className="text-xs text-slate-500">
                  {t("agentApp.apps.center.pagination.summary", {
                    page: currentPage,
                    total: totalPages,
                    count: filteredItems.length,
                  })}
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-blue-300 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={currentPage <= 1}
                    onClick={() =>
                      setCurrentPage((page) => Math.max(1, page - 1))
                    }
                    data-testid="agent-apps-pagination-prev"
                  >
                    <ChevronLeft size={14} />
                    {t("agentApp.apps.center.pagination.previous")}
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-lg border border-blue-800 bg-white px-4 py-2 text-sm font-medium text-blue-950 transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={currentPage >= totalPages}
                    onClick={() =>
                      setCurrentPage((page) => Math.min(totalPages, page + 1))
                    }
                    data-testid="agent-apps-pagination-next"
                  >
                    {t("agentApp.apps.center.pagination.next")}
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            </main>

          </section>

          {selectedItem ? (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/25 p-4 backdrop-blur-sm"
              data-testid="agent-apps-detail-overlay"
              onClick={closeDetail}
            >
              <section
                role="dialog"
                aria-modal="true"
                className="flex max-h-[calc(100vh-3rem)] min-h-[420px] w-full max-w-[820px] flex-col overflow-hidden rounded-[18px] border border-slate-200 bg-white text-slate-950 shadow-2xl shadow-slate-950/20"
                data-testid="agent-apps-detail"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
                  <div className="space-y-4">
                    <div className="flex items-start gap-4">
                      {renderAppIcon(
                        selectedItem,
                        "size-20 shrink-0",
                        `agent-apps-detail-icon-${selectedItem.appId}`,
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-slate-500">
                          {t("agentApp.apps.center.detail.title")}
                        </p>
                        <h2 className="mt-2 text-2xl font-semibold text-slate-950">
                          {selectedItem.title}
                        </h2>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <span
                            className={`rounded-md border px-2.5 py-1 text-sm font-medium ${appCenterSourceClass(
                              selectedItem.sourceKind,
                            )}`}
                          >
                            {t(
                              `agentApp.apps.center.source.${selectedItem.sourceKind}`,
                            )}
                          </span>
                          <span
                            className={`rounded-md border px-2.5 py-1 text-sm font-medium ${appCenterStatusClass(
                              selectedItem.statusKind,
                            )}`}
                          >
                            {t(
                              `agentApp.apps.center.status.${selectedItem.statusKind}`,
                            )}
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="inline-flex h-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-600 shadow-sm shadow-slate-950/5 transition hover:border-slate-300 hover:bg-white hover:text-slate-900"
                        aria-label={t("agentApp.apps.center.detail.close")}
                        title={t("agentApp.apps.center.detail.close")}
                        onClick={closeDetail}
                        data-testid="agent-apps-close-detail"
                      >
                        <span>{t("agentApp.apps.center.detail.close")}</span>
                        <X className="ml-1.5" size={14} />
                      </button>
                    </div>
                    <p className="text-base leading-7 text-slate-700">
                      {selectedItem.description ||
                        t("agentApp.apps.center.descriptionFallback")}
                    </p>
                    <button
                      type="button"
                      className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-blue-950 px-3 text-base font-semibold text-white transition hover:bg-blue-900 disabled:cursor-not-allowed disabled:bg-slate-400 disabled:opacity-80"
                      disabled={isPrimaryActionDisabled(selectedItem)}
                      onClick={() => void handlePrimaryAction(selectedItem)}
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
                        className="inline-flex h-11 w-full items-center justify-center rounded-lg border border-blue-800 bg-white px-3 text-base font-semibold text-blue-950 transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={
                          canOneClickUpdate(selectedItem)
                            ? isPrimaryActionDisabled(selectedItem) ||
                              !getDefaultEntry(selectedItem)
                            : isCloudActionDisabled(selectedItem)
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
                            ? `agent-apps-launch-installed-${selectedItem.appId}`
                            : `agent-apps-install-cloud-${selectedItem.appId}`
                        }
                      >
                        {canOneClickUpdate(selectedItem)
                          ? t("agentApp.apps.center.action.open")
                          : t("agentApp.apps.center.action.update")}
                      </button>
                    ) : null}
                  </div>

                  {selectedItem.registrationBlocked && selectedItem.cloudApp
                    ? renderRegistrationForm(selectedItem.cloudApp)
                    : null}

                  {installReview &&
                  installReview.review.appId === selectedItem.appId ? (
                    <section
                      className="rounded-xl border border-blue-200 bg-blue-50 p-4"
                      data-testid="agent-apps-install-review"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-950">
                            {t("agentApp.apps.installReview.title")}
                          </p>
                          <p className="mt-1 text-xs leading-5 text-slate-600">
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
                      <div className="mt-3 rounded-2xl border border-sky-100 bg-white p-3">
                        <p className="text-sm font-semibold text-slate-900">
                          {installReview.review.displayName}
                        </p>
                        <p className="mt-1 text-xs text-slate-600">
                          {t("agentApp.apps.center.detail.versionLine", {
                            version: installReview.review.version,
                          })}
                        </p>
                        <p className="mt-2 text-xs leading-5 text-slate-600">
                          {t("agentApp.apps.installReview.summary", {
                            entries: installReview.review.entryCount,
                            capabilities: installReview.review.capabilityCount,
                            cleanupTargets:
                              installReview.review.cleanupTargetCount,
                          })}
                        </p>
                      </div>
                      <div className="mt-3 flex gap-2">
                        <button
                          type="button"
                          className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-[color:var(--lime-text-strong)] px-3 py-2 text-sm font-medium text-[color:var(--lime-surface)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
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
                    </section>
                  ) : null}

                  {selectedItem.installedState ? (
                    <section className="space-y-3">
                      <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                        <Layers3 size={16} />
                        {t("agentApp.apps.center.detail.commonEntries")}
                      </div>
                      {selectedItem.entries.length > 0 ? (
                        <div className="grid gap-3 sm:grid-cols-2">
                          {selectedItem.entries.slice(0, 5).map((entry) => (
                            <button
                              key={entry.key}
                              type="button"
                              className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-3 text-left transition hover:border-blue-300 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
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
                              data-testid={`agent-apps-launch-entry-${entry.key}`}
                            >
                              <span className="min-w-0">
                                <span className="block truncate text-sm font-medium text-slate-900">
                                  {entry.title}
                                </span>
                                <span className="mt-1 block truncate text-xs text-slate-500">
                                  {t(
                                    `agentApp.apps.runtime.entryKind.${entry.kind}`,
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
                        <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                          {t("agentApp.apps.center.detail.noEntries")}
                        </p>
                      )}
                    </section>
                  ) : null}

                  {mountedUi && mountedUi.appId === selectedItem.appId ? (
                    <section
                      className="sr-only"
                      data-testid="agent-apps-mounted-ui"
                    >
                      {t("agentApp.apps.surface.title", {
                        title: mountedUi.title,
                      })}
                      {mountedUi.route ?? mountedUi.entryKey}
                    </section>
                  ) : null}

                  {launchSummary ? (
                    <div
                      className="sr-only"
                      data-testid="agent-apps-launch-summary"
                    >
                      {launchSummary}
                    </div>
                  ) : null}

                  <section>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-3 text-left text-sm font-semibold text-slate-900 transition hover:border-slate-300"
                      onClick={() => setMoreInfoOpen((open) => !open)}
                      data-testid="agent-apps-more-info"
                    >
                      {t("agentApp.apps.center.detail.moreInfo")}
                      <span className="text-xs font-medium text-slate-500">
                        {moreInfoOpen
                          ? t("agentApp.apps.center.detail.collapse")
                          : t("agentApp.apps.center.detail.expand")}
                      </span>
                    </button>
                    {moreInfoOpen ? (
                      <div
                        className="mt-2 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600"
                        data-testid="agent-apps-more-info-content"
                      >
                        <p className="break-all">
                          {t("agentApp.apps.center.detail.appId")}:{" "}
                          {selectedItem.appId}
                        </p>
                        <div className="rounded-xl border border-slate-200 bg-white p-3">
                          <p className="text-sm font-semibold text-slate-900">
                            {t("agentApp.apps.center.detail.sourceVersion")}
                          </p>
                          <div className="mt-3 grid gap-2 text-sm text-slate-600">
                            <div className="flex items-center justify-between gap-3">
                              <span>
                                {t(
                                  "agentApp.apps.center.detail.installedVersion",
                                )}
                              </span>
                              <span className="font-medium text-slate-900">
                                {selectedItem.installedVersion ?? "-"}
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-3">
                              <span>
                                {t("agentApp.apps.center.detail.cloudVersion")}
                              </span>
                              <span className="font-medium text-slate-900">
                                {selectedItem.cloudVersion ?? "-"}
                              </span>
                            </div>
                          </div>
                        </div>
                        {selectedItem.installedState ? (
                          <>
                            <p className="break-all">
                              {t("agentApp.apps.installReview.source", {
                                kind: selectedItem.installedState.identity
                                  .sourceKind,
                              })}
                            </p>
                            <p className="break-all">
                              {selectedItem.installedState.identity.sourceUri}
                            </p>
                            <p className="break-all">
                              {t("agentApp.apps.installReview.hashes", {
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
                        {selected ? (
                          <div className="grid gap-2 border-t border-slate-200 pt-3 sm:grid-cols-2">
                            <button
                              type="button"
                              className="inline-flex items-center justify-center gap-2 rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm font-medium text-amber-700 transition hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-60"
                              disabled={
                                selected.disabled || Boolean(busyAction)
                              }
                              onClick={() =>
                                void handleSetDisabled(selected, true)
                              }
                              data-testid="agent-apps-disable"
                            >
                              <Ban size={16} />
                              {t("agentApp.apps.action.disable")}
                            </button>
                            <button
                              type="button"
                              className="inline-flex items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm font-medium text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
                              disabled={
                                !selected.disabled || Boolean(busyAction)
                              }
                              onClick={() =>
                                void handleSetDisabled(selected, false)
                              }
                              data-testid="agent-apps-enable"
                            >
                              <CheckCircle2 size={16} />
                              {t("agentApp.apps.action.enable")}
                            </button>
                            <button
                              type="button"
                              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-sm font-medium text-slate-800 transition hover:border-slate-300"
                              disabled={Boolean(busyAction)}
                              onClick={() =>
                                void handlePreviewUninstall(
                                  selected,
                                  "keep-data",
                                )
                              }
                              data-testid="agent-apps-uninstall-keep-data"
                            >
                              <span className="inline-flex items-center gap-2">
                                <Archive size={16} />
                                {t("agentApp.apps.action.uninstallKeepData")}
                              </span>
                            </button>
                            <button
                              type="button"
                              className="rounded-lg border border-rose-200 bg-white px-3 py-2 text-left text-sm font-medium text-rose-800 transition hover:bg-rose-50"
                              disabled={Boolean(busyAction)}
                              onClick={() =>
                                void handlePreviewUninstall(
                                  selected,
                                  "delete-data",
                                )
                              }
                              data-testid="agent-apps-uninstall-delete-data"
                            >
                              <span className="inline-flex items-center gap-2">
                                <Archive size={16} />
                                {t("agentApp.apps.action.uninstallDeleteData")}
                              </span>
                            </button>
                          </div>
                        ) : null}
                        {uninstallPreview ? (
                          <div
                            className="rounded-xl border border-slate-200 bg-white p-3"
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
                                className="mt-3 space-y-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3"
                                data-testid="agent-apps-cleanup-evidence"
                              >
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
                                <pre
                                  className="max-h-44 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-slate-950 p-3 text-xs leading-5 text-emerald-50"
                                  data-testid="agent-apps-cleanup-evidence-json"
                                >
                                  {JSON.stringify(
                                    activeUninstallDescriptor.cleanupEvidence,
                                    null,
                                    2,
                                  )}
                                </pre>
                                <div
                                  className="grid gap-2 sm:grid-cols-2"
                                  data-testid="agent-apps-residual-audit"
                                >
                                  <span className="rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs text-amber-700">
                                    {t(
                                      "agentApp.lab.manager.evidence.residual.pendingDeletion",
                                      {
                                        count:
                                          activeUninstallDescriptor
                                            .residualAudit.pendingDeletionCount,
                                      },
                                    )}
                                  </span>
                                </div>
                              </div>
                            ) : null}
                            {activeUninstallDescriptor?.mode ===
                            "delete-data" ? (
                              <div
                                className="mt-3 space-y-3 rounded-xl border border-rose-200 bg-rose-50 p-3"
                                data-testid="agent-apps-delete-data-confirmation"
                              >
                                <div className="space-y-1">
                                  <p className="text-sm font-semibold text-rose-900">
                                    {t(
                                      "agentApp.apps.uninstallPreview.deleteDataGate.title",
                                    )}
                                  </p>
                                  <p className="text-sm text-rose-800">
                                    {t(
                                      "agentApp.apps.uninstallPreview.deleteDataGate.description",
                                    )}
                                  </p>
                                </div>
                                <div className="rounded-lg border border-rose-200 bg-white px-3 py-2">
                                  <span className="text-xs font-medium text-rose-700">
                                    {t(
                                      "agentApp.apps.uninstallPreview.deleteDataGate.phraseLabel",
                                    )}
                                  </span>
                                  <code
                                    className="mt-1 block break-all rounded-md bg-slate-950 px-2 py-1.5 text-xs text-rose-50"
                                    data-testid="agent-apps-delete-data-confirmation-phrase"
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
                                  className="w-full rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-rose-400 focus:ring-2 focus:ring-rose-100"
                                  placeholder={t(
                                    "agentApp.apps.uninstallPreview.deleteDataGate.inputPlaceholder",
                                  )}
                                  aria-label={t(
                                    "agentApp.apps.uninstallPreview.deleteDataGate.inputLabel",
                                  )}
                                  data-testid="agent-apps-delete-data-confirmation-input"
                                />
                                <p
                                  className={`text-xs ${
                                    deleteDataConfirmationMatches
                                      ? "text-emerald-700"
                                      : "text-rose-700"
                                  }`}
                                  data-testid="agent-apps-delete-data-confirmation-status"
                                >
                                  {deleteDataConfirmationMatches
                                    ? t(
                                        "agentApp.apps.uninstallPreview.deleteDataGate.ready",
                                      )
                                    : t(
                                        "agentApp.apps.uninstallPreview.deleteDataGate.mismatch",
                                      )}
                                </p>
                              </div>
                            ) : null}
                            <button
                              type="button"
                              className="mt-3 inline-flex items-center gap-2 rounded-lg bg-rose-700 px-3 py-2 text-sm font-medium text-white transition hover:bg-rose-800 disabled:cursor-not-allowed disabled:opacity-60"
                              disabled={
                                Boolean(busyAction) ||
                                !deleteDataConfirmationMatches
                              }
                              onClick={() => void handleConfirmUninstall()}
                              data-testid="agent-apps-uninstall-confirm"
                            >
                              <Archive size={16} />
                              {t("agentApp.apps.action.confirmUninstall")}
                            </button>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </section>
                </div>
              </section>
            </div>
          ) : null}

          {installReview &&
          installReview.review.appId !== selectedItem?.appId ? (
            <section
              className="rounded-2xl border border-sky-200 bg-sky-50 p-4 shadow-sm shadow-slate-950/5"
              data-testid="agent-apps-install-review"
            >
              <p className="text-sm font-semibold text-slate-950">
                {t("agentApp.apps.installReview.title")}
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-[color:var(--lime-text-strong)] px-3 py-2 text-sm font-medium text-[color:var(--lime-surface)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
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
            </section>
          ) : null}

          {!selectedItem && mountedUi ? (
            <section className="sr-only" data-testid="agent-apps-mounted-ui">
              {t("agentApp.apps.surface.title", {
                title: mountedUi.title,
              })}
              {mountedUi.route ?? mountedUi.entryKey}
            </section>
          ) : null}

          {!selectedItem && launchSummary ? (
            <div className="sr-only" data-testid="agent-apps-launch-summary">
              {launchSummary}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
