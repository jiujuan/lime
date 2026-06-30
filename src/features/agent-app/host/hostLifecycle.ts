import type {
  AgentAppProfile,
  InstalledAgentAppState,
  NormalizedAppManifest,
  ReadinessIssue,
  ReadinessResult,
  ReadinessStatus,
  WorkbenchDeclaration,
  WorkbenchObjectSurfaceDeclaration,
  WorkbenchProductionObjectDeclaration,
} from "../types";

export type AgentAppHostFunctionKey =
  | "appCenterPublishing"
  | "packageInspection"
  | "installReview"
  | "readinessGate"
  | "capabilitySdk"
  | "appServerBridge"
  | "uiRuntime"
  | "agentRuntime"
  | "rightSurfaceDock"
  | "articleWorkspace"
  | "historyRestore"
  | "uninstall";

export type AgentAppHostFunctionStatus =
  | "ready"
  | "needs-setup"
  | "blocked"
  | "delisted"
  | "planned";

export type AgentAppRightSurfaceTabKind =
  | "articleWorkspace"
  | "file"
  | "evidence"
  | "terminal"
  | "browser"
  | "sideChat";

export type AgentAppArticleWorkspacePaneKind =
  | "artifact"
  | "inspector"
  | "runtime"
  | "evidence"
  | "expertInfo"
  | "appSurface"
  | string;

export interface AgentAppHostFunctionState {
  key: AgentAppHostFunctionKey;
  status: AgentAppHostFunctionStatus;
  currentOwner: "app-server" | "desktop-host" | "claw" | "agent-app-host";
  blockers: string[];
  followUps: string[];
}

export interface AgentAppArticleWorkspaceObject {
  kind: string;
  title: string;
  defaultPane: AgentAppArticleWorkspacePaneKind;
  artifactKind?: string;
  primary: boolean;
}

export interface AgentAppRightSurfaceContract {
  dock: "right";
  physicalDockCount: 1;
  defaultActiveTab: AgentAppRightSurfaceTabKind | null;
  supportedTabs: AgentAppRightSurfaceTabKind[];
  articleWorkspace: {
    enabled: boolean;
    objects: AgentAppArticleWorkspaceObject[];
    panes: AgentAppArticleWorkspacePaneKind[];
    rendererKinds: string[];
  };
  historyRestore: {
    enabled: boolean;
    defaultTab: AgentAppRightSurfaceTabKind | null;
    defaultPane: AgentAppArticleWorkspacePaneKind | null;
    restoreSelection: boolean;
    restoreLayout: boolean;
    fallback: string;
  };
}

export interface AgentAppTaskRuntimeContract {
  enabled: boolean;
  packageRootPath: string | null;
  workerEntrypoint: string | null;
  contractPath: string | null;
  sampleRequestPath: string | null;
  outputArtifactKind: string | null;
  taskKinds: string[];
  directProviderAccess: boolean;
  directFilesystemAccess: boolean;
  blockers: string[];
  followUps: string[];
}

export interface AgentAppHostLifecycleIssueCategorySummary {
  category: string;
  count: number;
  codes: string[];
}

export interface AgentAppHostLifecycleSnapshot {
  appId: string;
  displayName: string;
  profiles: AgentAppProfile[];
  appCenterStatus: AgentAppHostFunctionStatus;
  readinessStatus: ReadinessStatus;
  rightSurface: AgentAppRightSurfaceContract;
  taskRuntime: AgentAppTaskRuntimeContract;
  functions: AgentAppHostFunctionState[];
  blockers: string[];
  followUps: string[];
  publishBlocked?: boolean;
  primaryIssueCategory?: string | null;
  issueCategories?: AgentAppHostLifecycleIssueCategorySummary[];
  generatedAt: string;
}

export interface BuildAgentAppHostLifecycleSnapshotParams {
  manifest: NormalizedAppManifest;
  readiness: ReadinessResult;
  installedState?: InstalledAgentAppState;
  generatedAt?: string;
}

const DEFAULT_RIGHT_SURFACE_TABS: AgentAppRightSurfaceTabKind[] = [
  "articleWorkspace",
  "file",
  "evidence",
  "terminal",
  "browser",
  "sideChat",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function stringifyUnknown(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(stringifyUnknown).join(" ");
  }
  if (isRecord(value)) {
    return Object.values(value).map(stringifyUnknown).join(" ");
  }
  return "";
}

function hasWorkbenchProfile(manifest: NormalizedAppManifest): boolean {
  return manifest.profiles.includes("workbench") || Boolean(manifest.workbench);
}

function normalizePane(
  surfaceKind: string | undefined,
): AgentAppArticleWorkspacePaneKind {
  const value = surfaceKind?.trim();
  return value || "artifact";
}

function normalizeProductObject(
  object: WorkbenchProductionObjectDeclaration,
): AgentAppArticleWorkspaceObject {
  return {
    kind: object.kind,
    title: object.title ?? object.kind,
    defaultPane: normalizePane(object.defaultSurface),
    artifactKind: object.artifactKind,
    primary: object.primary === true,
  };
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  return Array.from(
    new Set(values.filter((value): value is string => Boolean(value?.trim()))),
  );
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

function readBooleanAt(value: unknown, path: string[]): boolean | undefined {
  let current: unknown = value;
  for (const segment of path) {
    const record = readRecord(current);
    if (!record) {
      return undefined;
    }
    current = record[segment];
  }
  return typeof current === "boolean" ? current : undefined;
}

function readTaskKinds(agentRuntime: unknown): string[] {
  const tasks = readRecord(agentRuntime)?.tasks;
  if (!Array.isArray(tasks)) {
    return [];
  }
  return uniqueStrings(
    tasks.map((task) => readString(readRecord(task)?.kind)),
  );
}

export function buildAgentAppTaskRuntimeContract(
  manifest: NormalizedAppManifest,
): AgentAppTaskRuntimeContract {
  const runtimePackageWorker = readRecord(manifest.runtimePackage.worker);
  const agentRuntime = readRecord(manifest.agentRuntime);
  const worker = readRecord(agentRuntime?.worker);
  const workerEntrypoint =
    readString(runtimePackageWorker?.entrypoint) ??
    readString(runtimePackageWorker?.path) ??
    readString(worker?.entrypoint) ??
    null;
  const contractPath =
    readString(runtimePackageWorker?.contract) ??
    readString(worker?.contract) ??
    null;
  const sampleRequestPath =
    readString(runtimePackageWorker?.sampleRequest) ??
    readString(worker?.sampleRequest) ??
    null;
  const outputArtifactKind =
    readString(runtimePackageWorker?.outputArtifactKind) ??
    readString(worker?.outputArtifactKind) ??
    null;
  const taskKinds = readTaskKinds(agentRuntime);
  const enabled = Boolean(runtimePackageWorker || worker || taskKinds.length > 0);
  const directProviderAccess =
    readBooleanAt(agentRuntime, ["worker", "directProviderAccess"]) ?? false;
  const directFilesystemAccess =
    readBooleanAt(agentRuntime, ["worker", "directFilesystemAccess"]) ?? false;
  const blockers = [
    enabled && !workerEntrypoint ? "TASK_RUNTIME_WORKER_ENTRYPOINT_MISSING" : undefined,
    enabled && taskKinds.length === 0 ? "TASK_RUNTIME_TASKS_MISSING" : undefined,
    directProviderAccess ? "TASK_RUNTIME_DIRECT_PROVIDER_ACCESS_UNSUPPORTED" : undefined,
    directFilesystemAccess
      ? "TASK_RUNTIME_DIRECT_FILESYSTEM_ACCESS_UNSUPPORTED"
      : undefined,
  ].filter((item): item is string => Boolean(item));

  return {
    enabled,
    packageRootPath: null,
    workerEntrypoint,
    contractPath,
    sampleRequestPath,
    outputArtifactKind,
    taskKinds,
    directProviderAccess,
    directFilesystemAccess,
    blockers,
    followUps: enabled
      ? [
          "补 worker 输出到 ArtifactDocument / Article Workspace 版本链。",
          "补 worker 执行 evidence、超时 / 失败分类和发布签名门禁。",
        ]
      : ["需要声明 runtimePackage.worker 或 agentRuntime.worker 后才能运行后台任务。"],
  };
}

function listObjectSurfaces(
  workbench: WorkbenchDeclaration | undefined,
): WorkbenchObjectSurfaceDeclaration[] {
  return Array.isArray(workbench?.objectSurfaces)
    ? workbench.objectSurfaces
    : [];
}

function listProductObjects(
  workbench: WorkbenchDeclaration | undefined,
): AgentAppArticleWorkspaceObject[] {
  const objects = Array.isArray(workbench?.productionObjects)
    ? workbench.productionObjects
    : [];
  return objects
    .filter((object) => typeof object.kind === "string" && object.kind.trim())
    .map(normalizeProductObject);
}

function resolveHistoryDefaultPane(params: {
  restoreDefaultSurface?: string;
  objects: AgentAppArticleWorkspaceObject[];
}): AgentAppArticleWorkspacePaneKind {
  const { restoreDefaultSurface, objects } = params;
  if (
    restoreDefaultSurface === "selectedObject" ||
    restoreDefaultSurface === "primaryObject" ||
    restoreDefaultSurface == null
  ) {
    return (
      objects.find((object) => object.primary)?.defaultPane ??
      objects[0]?.defaultPane ??
      "artifact"
    );
  }
  return normalizePane(restoreDefaultSurface);
}

export function buildAgentAppRightSurfaceContract(
  manifest: NormalizedAppManifest,
): AgentAppRightSurfaceContract {
  const workbench = manifest.workbench;
  const enabled = hasWorkbenchProfile(manifest);
  const objects = listProductObjects(workbench);
  const objectSurfacePanes = listObjectSurfaces(workbench).map(
    (surface) => surface.surfaceKind,
  );
  const objectDefaultPanes = objects.map((object) => object.defaultPane);
  const panes = uniqueStrings([
    ...objectSurfacePanes,
    ...objectDefaultPanes,
    "artifact",
    "inspector",
    "runtime",
    "evidence",
    "expertInfo",
    "appSurface",
  ]);
  const rendererKinds = uniqueStrings(
    listObjectSurfaces(workbench).map((surface) => surface.renderer),
  );
  const restore = workbench?.historyRestore;

  return {
    dock: "right",
    physicalDockCount: 1,
    defaultActiveTab: enabled ? "articleWorkspace" : null,
    supportedTabs: [...DEFAULT_RIGHT_SURFACE_TABS],
    articleWorkspace: {
      enabled,
      objects,
      panes,
      rendererKinds,
    },
    historyRestore: {
      enabled: Boolean(enabled && restore),
      defaultTab: enabled ? "articleWorkspace" : null,
      defaultPane: resolveHistoryDefaultPane({
        restoreDefaultSurface: restore?.defaultSurface,
        objects,
      }),
      restoreSelection: restore?.restoreSelection !== false,
      restoreLayout: restore?.restoreLayout !== false,
      fallback: restore?.fallback ?? "artifactPreview",
    },
  };
}

function detectsLegacyPrimaryPath(manifest: NormalizedAppManifest): boolean {
  const raw = stringifyUnknown({
    runtimePackage: manifest.runtimePackage,
    requirements: manifest.requirements,
    boundary: manifest.boundary,
    integrations: manifest.integrations,
    operations: manifest.operations,
  }).toLowerCase();

  return [
    "src-tauri",
    "tauri command",
    "tauri_command",
    "iframe-only",
    "browserview",
    "<webview",
  ].some((needle) => raw.includes(needle));
}

function issueCodes(issues: ReadinessIssue[]): string[] {
  return Array.from(new Set(issues.map((issue) => issue.code)));
}

function statusFromReadiness(
  readiness: ReadinessResult,
): AgentAppHostFunctionStatus {
  if (readiness.status === "blocked") {
    return "blocked";
  }
  if (readiness.status === "needs-setup" || readiness.status === "degraded") {
    return "needs-setup";
  }
  return "ready";
}

function buildAppCenterStatus(
  manifest: NormalizedAppManifest,
  readiness: ReadinessResult,
): AgentAppHostFunctionStatus {
  if (manifest.status === "archived" || manifest.status === "deprecated") {
    return "delisted";
  }
  if (detectsLegacyPrimaryPath(manifest)) {
    return "delisted";
  }
  return statusFromReadiness(readiness);
}

function createFunctionState(params: {
  key: AgentAppHostFunctionKey;
  status: AgentAppHostFunctionStatus;
  currentOwner: AgentAppHostFunctionState["currentOwner"];
  blockers?: string[];
  followUps?: string[];
}): AgentAppHostFunctionState {
  return {
    key: params.key,
    status: params.status,
    currentOwner: params.currentOwner,
    blockers: params.blockers ?? [],
    followUps: params.followUps ?? [],
  };
}

export function buildAgentAppHostLifecycleSnapshot(
  params: BuildAgentAppHostLifecycleSnapshotParams,
): AgentAppHostLifecycleSnapshot {
  const { manifest, readiness, installedState } = params;
  const generatedAt = params.generatedAt ?? new Date().toISOString();
  const rightSurface = buildAgentAppRightSurfaceContract(manifest);
  const taskRuntime = buildAgentAppTaskRuntimeContract(manifest);
  const readinessBlockers = issueCodes(readiness.blockers);
  const appCenterStatus = buildAppCenterStatus(manifest, readiness);
  const readinessStatus = statusFromReadiness(readiness);
  const workbenchEnabled = hasWorkbenchProfile(manifest);
  const uiRuntimeReady =
    Boolean(installedState) && readiness.status !== "blocked";

  const functions: AgentAppHostFunctionState[] = [
    createFunctionState({
      key: "appCenterPublishing",
      status: appCenterStatus,
      currentOwner: "agent-app-host",
      blockers:
        appCenterStatus === "delisted" ? ["LEGACY_OR_DEPRECATED_APP"] : [],
      followUps: ["接入真实 App Center card 上架 / 下架状态。"],
    }),
    createFunctionState({
      key: "packageInspection",
      status: "ready",
      currentOwner: "app-server",
      followUps: ["补 archive package 和签名校验的 GUI 证据。"],
    }),
    createFunctionState({
      key: "installReview",
      status: installedState ? "ready" : "needs-setup",
      currentOwner: "app-server",
      followUps: ["把 review 结果接入安装确认弹窗。"],
    }),
    createFunctionState({
      key: "readinessGate",
      status: readinessStatus,
      currentOwner: "app-server",
      blockers: readinessBlockers,
    }),
    createFunctionState({
      key: "capabilitySdk",
      status: readiness.missingCapabilities.length > 0 ? "blocked" : "ready",
      currentOwner: "agent-app-host",
      blockers: readiness.missingCapabilities.map((item) => item.capability),
    }),
    createFunctionState({
      key: "appServerBridge",
      status: "ready",
      currentOwner: "app-server",
      followUps: [
        "后续把 host lifecycle snapshot 暴露为 JSON-RPC current method。",
      ],
    }),
    createFunctionState({
      key: "uiRuntime",
      status: uiRuntimeReady ? "ready" : "needs-setup",
      currentOwner: "app-server",
      followUps: [
        "Electron Desktop Host 补 Right Surface WebContentsView 嵌入接线。",
      ],
    }),
    createFunctionState({
      key: "agentRuntime",
      status:
        taskRuntime.blockers.length > 0
          ? "blocked"
          : taskRuntime.enabled
            ? readinessStatus
            : "needs-setup",
      currentOwner: "app-server",
      blockers: [...readinessBlockers, ...taskRuntime.blockers],
      followUps: taskRuntime.followUps,
    }),
    createFunctionState({
      key: "rightSurfaceDock",
      status: workbenchEnabled ? "ready" : "planned",
      currentOwner: "claw",
      followUps: ["接入 WorkspaceConversationScene 的右侧 tab strip。"],
    }),
    createFunctionState({
      key: "articleWorkspace",
      status:
        workbenchEnabled && rightSurface.articleWorkspace.objects.length > 0
          ? "ready"
          : "needs-setup",
      currentOwner: "claw",
      blockers:
        workbenchEnabled && rightSurface.articleWorkspace.objects.length === 0
          ? ["WORKBENCH_PRODUCTION_OBJECTS_MISSING"]
          : [],
    }),
    createFunctionState({
      key: "historyRestore",
      status: rightSurface.historyRestore.enabled ? "ready" : "needs-setup",
      currentOwner: "app-server",
      blockers: rightSurface.historyRestore.enabled
        ? []
        : ["WORKBENCH_HISTORY_RESTORE_MISSING"],
    }),
    createFunctionState({
      key: "uninstall",
      status: "ready",
      currentOwner: "app-server",
      followUps: [
        "真实 delete-data 仍需 evidence / residual audit / confirmation gate。",
      ],
    }),
  ];

  return {
    appId: manifest.appId,
    displayName: manifest.displayName,
    profiles: manifest.profiles,
    appCenterStatus,
    readinessStatus: readiness.status,
    rightSurface,
    taskRuntime,
    functions,
    blockers: Array.from(new Set(functions.flatMap((item) => item.blockers))),
    followUps: Array.from(new Set(functions.flatMap((item) => item.followUps))),
    generatedAt,
  };
}
