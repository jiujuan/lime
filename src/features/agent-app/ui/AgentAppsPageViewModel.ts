import {
  buildAgentAppHostLifecycleForInstalledState,
  type AgentAppCloudCatalogResult,
} from "@/lib/api/agentApps";
import {
  buildCloudAgentAppSourceState,
  type AgentAppSourceState,
} from "../install/installReview";
import type {
  AgentAppHostFunctionStatus,
  AgentAppHostLifecycleSnapshot,
} from "../host";
import type {
  CloudBootstrapApp,
  InstalledAgentAppState,
  PackageSourceKind,
  ProjectedEntry,
} from "../types";
import { resolveInstalledAgentAppDisplayName } from "./agentAppDisplay";

export const APP_CENTER_PAGE_SIZE = 20;

export type AppCenterSourceKind = "cloud" | "local" | "hybrid";
export type AppCenterStatusKind =
  | "installed"
  | "installable"
  | "update"
  | "registration"
  | "disabled"
  | "partial";
export type AppCenterStatusFilter =
  | "all"
  | "installed"
  | "installable"
  | "attention";
export type AppCenterSourceFilter = "all" | "cloud" | "local";
export type AppCenterActionLabelKey =
  | "agentApp.apps.center.action.open"
  | "agentApp.apps.center.action.install"
  | "agentApp.apps.center.action.update"
  | "agentApp.apps.center.action.updateOneClick"
  | "agentApp.apps.center.action.activate"
  | "agentApp.apps.center.action.enable";

export interface AppCenterItem {
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
  sourceState?: AgentAppSourceState;
  hostLifecycle?: AgentAppHostLifecycleSnapshot;
  registrationBlocked: boolean;
  canReviewCloud: boolean;
}

export type AppCenterHostLifecycleTone =
  | "emerald"
  | "amber"
  | "rose"
  | "slate";

export interface AppCenterHostLifecycleSummary {
  status: AgentAppHostFunctionStatus;
  labelKey: string;
  tone: AppCenterHostLifecycleTone;
  blockerCount: number;
  productObjectCount: number;
  productProfileEnabled: boolean;
  supportedTabCount: number;
  defaultTab: string | null;
}

export interface AppCenterFilterCounts {
  all: number;
  installed: number;
  installable: number;
  attention: number;
}

type ConvertLocalFileSrc = (path: string) => string;

const ATTENTION_STATUS_KINDS = new Set<AppCenterStatusKind>([
  "update",
  "registration",
  "disabled",
  "partial",
]);

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

function svgToDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function buildAppNameIcon(title: string): string {
  const safeTitle = escapeSvgText(title || "Lime App");
  const initial = escapeSvgText([...safeTitle][0] || "L");
  return svgToDataUrl(
    `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96" role="img" aria-label="${safeTitle}"><defs><linearGradient id="g" x1="16" y1="12" x2="82" y2="86" gradientUnits="userSpaceOnUse"><stop stop-color="#ecfdf5"/><stop offset="0.55" stop-color="#eff6ff"/><stop offset="1" stop-color="#f8fafc"/></linearGradient></defs><rect width="96" height="96" rx="22" fill="url(#g)"/><rect x="1" y="1" width="94" height="94" rx="21" fill="none" stroke="#cbd5e1"/><circle cx="70" cy="25" r="9" fill="#10b981" fill-opacity="0.18"/><path d="M24 36h48M24 50h36M24 64h26" stroke="#64748b" stroke-width="5" stroke-linecap="round"/><text x="70" y="74" text-anchor="middle" font-family="ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif" font-size="24" font-weight="800" fill="#0f172a">${initial}</text></svg>`,
  );
}

function isDirectAssetSrc(value: string): boolean {
  return /^(?:https?:|data:|blob:|asset:)/i.test(value);
}

function isRelativeIconPath(value: string): boolean {
  return value.startsWith("./") || value.startsWith("../");
}

function isAbsoluteLocalIconPath(value: string): boolean {
  return (
    value.startsWith("/") ||
    /^[A-Za-z]:[\\/]/.test(value) ||
    value.startsWith("\\\\")
  );
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
    getPresentationString(cloudApp.presentation, ["icon"]) ??
    normalizeOptionalText(cloudApp.logo) ??
    getPresentationString(cloudApp.presentation, ["logo"])
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
      "logo",
    ]) ??
    getPresentationString(state.manifest.presentation, [
      "iconUrl",
      "logoUrl",
      "icon",
      "logo",
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

function resolveConvertedLocalIconSrc(
  path: string,
  convertLocalFileSrc: ConvertLocalFileSrc | undefined,
): string | undefined {
  if (!convertLocalFileSrc) {
    return undefined;
  }
  const converted = normalizeOptionalText(convertLocalFileSrc(path));
  if (!converted || converted === path || isAbsoluteLocalIconPath(converted)) {
    return undefined;
  }
  return converted;
}

export function resolveAppIconSrc(params: {
  title: string;
  installedState?: InstalledAgentAppState;
  cloudApp?: CloudBootstrapApp;
  convertLocalFileSrc?: ConvertLocalFileSrc;
}): string {
  const candidate =
    getInstalledAppIconCandidate(params.installedState) ??
    getCloudAppIconCandidate(params.cloudApp);
  if (!candidate) {
    return buildAppNameIcon(params.title);
  }
  if (candidate.trim().startsWith("<svg")) {
    return svgToDataUrl(candidate.trim());
  }
  if (isDirectAssetSrc(candidate)) {
    return candidate;
  }
  if (isAbsoluteLocalIconPath(candidate)) {
    return (
      resolveConvertedLocalIconSrc(candidate, params.convertLocalFileSrc) ??
      buildAppNameIcon(params.title)
    );
  }

  const sourceRoot = getLocalSourceRoot(params.installedState);
  if (sourceRoot && isRelativeIconPath(candidate)) {
    return (
      resolveConvertedLocalIconSrc(
        joinLocalPath(sourceRoot, candidate),
        params.convertLocalFileSrc,
      ) ?? buildAppNameIcon(params.title)
    );
  }
  return buildAppNameIcon(params.title);
}

export function isUiEntry(entry: ProjectedEntry): boolean {
  return ["page", "panel", "settings"].includes(entry.kind);
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
  sourceState?: AgentAppSourceState;
  hostLifecycle?: AgentAppHostLifecycleSnapshot;
  registrationBlocked: boolean;
}): AppCenterStatusKind {
  const {
    installedState,
    cloudApp,
    sourceState,
    hostLifecycle,
    registrationBlocked,
  } = params;
  if (installedState?.disabled) {
    return "disabled";
  }
  if (hostLifecycle?.appCenterStatus === "delisted") {
    return "partial";
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
  if (hostLifecycle?.appCenterStatus === "blocked") {
    return "partial";
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

export function buildAppCenterItems(params: {
  installed: InstalledAgentAppState[];
  cloudApps: CloudBootstrapApp[];
  catalogSource: AgentAppCloudCatalogResult["source"] | "seeded";
  convertLocalFileSrc?: ConvertLocalFileSrc;
  hostLifecycleSnapshots?: AgentAppHostLifecycleSnapshot[];
}): AppCenterItem[] {
  const installedById = new Map(
    params.installed.map((state) => [state.appId, state] as const),
  );
  const hostLifecycleByAppId = new Map(
    (params.hostLifecycleSnapshots ?? []).map((snapshot) => [
      snapshot.appId,
      snapshot,
    ]),
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
      const hostLifecycle =
        hostLifecycleByAppId.get(appId) ??
        (params.hostLifecycleSnapshots === undefined && installedState
          ? buildAgentAppHostLifecycleForInstalledState(installedState)
          : undefined);
      const registrationBlocked = Boolean(
        cloudApp?.registrationRequired &&
          cloudApp.registrationState !== "active",
      );
      const statusKind = getStatusKind({
        installedState,
        cloudApp,
        sourceState,
        hostLifecycle,
        registrationBlocked,
      });
      const title = getAppTitle(installedState, cloudApp, appId);

      return {
        appId,
        title,
        description: getAppDescription(installedState, cloudApp),
        iconSrc: resolveAppIconSrc({
          title,
          installedState,
          cloudApp,
          convertLocalFileSrc: params.convertLocalFileSrc,
        }),
        installedState,
        cloudApp,
        sourceKind: getSourceKind(installedState, cloudApp),
        statusKind,
        installedVersion: installedState?.identity.appVersion,
        cloudVersion: cloudApp?.version,
        entries: installedState?.projection.entries ?? [],
        sourceState,
        hostLifecycle,
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
  return ATTENTION_STATUS_KINDS.has(item.statusKind);
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

export function filterAppCenterItems(
  items: AppCenterItem[],
  filters: {
    searchQuery: string;
    statusFilter: AppCenterStatusFilter;
    sourceFilter: AppCenterSourceFilter;
  },
): AppCenterItem[] {
  const normalizedQuery = filters.searchQuery.trim().toLocaleLowerCase();
  return items.filter((item) => {
    if (!matchesStatusFilter(item, filters.statusFilter)) {
      return false;
    }
    if (!matchesSourceFilter(item, filters.sourceFilter)) {
      return false;
    }
    if (!normalizedQuery) {
      return true;
    }
    return [item.title, item.description, item.appId]
      .filter(Boolean)
      .some((value) => value.toLocaleLowerCase().includes(normalizedQuery));
  });
}

export function getAppCenterPageCount(
  itemCount: number,
  pageSize = APP_CENTER_PAGE_SIZE,
): number {
  return Math.max(1, Math.ceil(itemCount / pageSize));
}

export function paginateAppCenterItems(
  items: AppCenterItem[],
  currentPage: number,
  pageSize = APP_CENTER_PAGE_SIZE,
): AppCenterItem[] {
  const page = Math.max(1, Math.floor(currentPage));
  return items.slice((page - 1) * pageSize, page * pageSize);
}

export function buildAppCenterFilterCounts(
  items: AppCenterItem[],
): AppCenterFilterCounts {
  return {
    all: items.length,
    installed: items.filter((item) => Boolean(item.installedState)).length,
    installable: items.filter((item) => item.statusKind === "installable")
      .length,
    attention: items.filter((item) =>
      ATTENTION_STATUS_KINDS.has(item.statusKind),
    ).length,
  };
}

export function getDefaultEntry(item: AppCenterItem): ProjectedEntry | null {
  return item.entries.find(isUiEntry) ?? item.entries[0] ?? null;
}

export function hasCloudUpdate(item: AppCenterItem): boolean {
  return Boolean(
    item.installedVersion &&
      item.cloudVersion &&
      item.installedVersion !== item.cloudVersion,
  );
}

export function canOneClickUpdate(item: AppCenterItem): boolean {
  return Boolean(item.installedState && item.cloudApp && hasCloudUpdate(item));
}

export function getActionLabelKey(
  item: AppCenterItem,
): AppCenterActionLabelKey {
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

export function getCloudActionLabelKey(
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

export function getDetailActionLabelKey(
  item: AppCenterItem,
): AppCenterActionLabelKey {
  return getActionLabelKey(item);
}

export function isPrimaryActionDisabled(
  item: AppCenterItem,
  busyAction: string | null,
): boolean {
  if (busyAction) {
    return true;
  }
  if (item.hostLifecycle?.appCenterStatus === "delisted") {
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
    if (item.hostLifecycle?.appCenterStatus === "blocked") {
      return true;
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

export function isCloudActionDisabled(
  item: AppCenterItem,
  busyAction: string | null,
): boolean {
  if (Boolean(busyAction) || !item.cloudApp) {
    return true;
  }
  if (item.registrationBlocked) {
    return true;
  }
  return !item.canReviewCloud;
}

const HOST_LIFECYCLE_STATUS_LABEL_KEYS: Record<
  AgentAppHostFunctionStatus,
  string
> = {
  ready: "agentApp.apps.center.host.status.ready",
  "needs-setup": "agentApp.apps.center.host.status.needsSetup",
  blocked: "agentApp.apps.center.host.status.blocked",
  delisted: "agentApp.apps.center.host.status.delisted",
  planned: "agentApp.apps.center.host.status.planned",
};

const HOST_LIFECYCLE_TONES: Record<
  AgentAppHostFunctionStatus,
  AppCenterHostLifecycleTone
> = {
  ready: "emerald",
  "needs-setup": "amber",
  blocked: "rose",
  delisted: "rose",
  planned: "slate",
};

export function buildAppCenterHostLifecycleSummary(
  item: Pick<AppCenterItem, "hostLifecycle">,
): AppCenterHostLifecycleSummary | null {
  const lifecycle = item.hostLifecycle;
  if (!lifecycle) {
    return null;
  }
  return {
    status: lifecycle.appCenterStatus,
    labelKey: HOST_LIFECYCLE_STATUS_LABEL_KEYS[lifecycle.appCenterStatus],
    tone: HOST_LIFECYCLE_TONES[lifecycle.appCenterStatus],
    blockerCount: lifecycle.blockers.length,
    productObjectCount: lifecycle.rightSurface.productProfile.objects.length,
    productProfileEnabled: lifecycle.rightSurface.productProfile.enabled,
    supportedTabCount: lifecycle.rightSurface.supportedTabs.length,
    defaultTab: lifecycle.rightSurface.defaultActiveTab,
  };
}
