export type PackageSourceKind = "fixture" | "local_folder" | "local_archive" | "cloud_release";
export type RuntimeTarget = "local" | "server-assisted" | "cloud";
export type AppStatus = "draft" | "preview" | "stable" | "deprecated";
export type AppType = "domain-app" | "tool-app" | "expert-pack" | "workflow-app";

export type AppEntryKind =
  | "page"
  | "panel"
  | "expert-chat"
  | "command"
  | "workflow"
  | "artifact-viewer"
  | "background-task"
  | "settings";

export interface AppRequires {
  lime?: {
    appRuntime?: string;
    sdk?: string;
  };
  capabilities?: Record<string, string> | string[];
}

export interface RuntimePackageDeclaration {
  ui?: {
    path: string;
    hash?: string;
  };
  worker?: {
    path: string;
    hash?: string;
  };
  storage?: {
    schema?: string;
    migrations?: string;
    hash?: string;
  };
}

export interface PermissionDeclaration {
  key: string;
  reason?: string;
  required?: boolean;
}

export interface AppEntry {
  key: string;
  kind: AppEntryKind;
  title?: string;
  description?: string;
  route?: string;
  workflow?: string;
  persona?: string;
  requiredCapabilities?: string[];
  capabilities?: string[];
  permissions?: string[];
  enabledByDefault?: boolean;
}

export interface StorageDeclaration {
  namespace?: string;
  schema?: string;
  migrations?: string;
  retention?: "keep-on-uninstall" | "delete-on-uninstall" | "ask";
}

export interface KnowledgeTemplateDeclaration {
  key: string;
  standard?: string;
  type?: string;
  required?: boolean;
}

export interface ArtifactDeclaration {
  key: string;
  title?: string;
  type?: string;
}

export interface PolicyDeclaration {
  key: string;
  title?: string;
  required?: boolean;
}

export interface AppManifest {
  manifestVersion: string;
  name: string;
  version: string;
  title?: string;
  displayName?: string;
  status?: AppStatus;
  appType?: AppType;
  description?: string;
  runtimeTargets?: RuntimeTarget[];
  requires?: AppRequires;
  runtimePackage?: RuntimePackageDeclaration;
  capabilities?: string[];
  permissions?: PermissionDeclaration[];
  entries: AppEntry[];
  storage?: StorageDeclaration;
  knowledgeTemplates?: KnowledgeTemplateDeclaration[];
  artifacts?: ArtifactDeclaration[];
  policies?: PolicyDeclaration[];
}

export interface NormalizedRequires {
  appRuntime: string;
  sdk?: string;
  capabilities: Record<string, string>;
}

export interface NormalizedRuntimePackage {
  ui?: {
    path: string;
    hash?: string;
  };
  worker?: {
    path: string;
    hash?: string;
  };
  storage?: {
    schema?: string;
    migrations?: string;
    hash?: string;
  };
}

export interface NormalizedStorageDeclaration {
  namespace: string;
  schema?: string;
  migrations?: string;
  retention: "keep-on-uninstall" | "delete-on-uninstall" | "ask";
}

export interface NormalizedAppEntry {
  key: string;
  kind: AppEntryKind;
  title: string;
  description?: string;
  route?: string;
  workflow?: string;
  persona?: string;
  requiredCapabilities: string[];
  permissions: string[];
  enabledByDefault: boolean;
}

export interface NormalizedAppManifest {
  manifestVersion: "0.2";
  appId: string;
  displayName: string;
  version: string;
  status: AppStatus;
  appType: AppType;
  description: string;
  runtimeTargets: RuntimeTarget[];
  requires: NormalizedRequires;
  runtimePackage: NormalizedRuntimePackage;
  permissions: PermissionDeclaration[];
  entries: NormalizedAppEntry[];
  storage?: NormalizedStorageDeclaration;
  knowledgeTemplates: KnowledgeTemplateDeclaration[];
  artifacts: ArtifactDeclaration[];
  policies: PolicyDeclaration[];
}

export interface PackageIdentity {
  sourceKind: PackageSourceKind;
  sourceUri: string;
  appId: string;
  appVersion: string;
  packageHash: string;
  manifestHash: string;
  loadedAt: string;
}

export interface AgentAppProvenance {
  sourceKind: "agent_app";
  appId: string;
  appVersion: string;
  packageHash: string;
  manifestHash: string;
  entryKey?: string;
  workflowRunId?: string;
  workspaceId?: string;
  taskId?: string;
}

export type CapabilityDeclaredBy =
  | "requires"
  | "entry"
  | "storage"
  | "policy"
  | "runtimePackage";

export interface CapabilityRequirement {
  capability: string;
  requestedRange: string;
  required: boolean;
  declaredBy: CapabilityDeclaredBy[];
  entryKey?: string;
}

export interface AppSummary {
  appId: string;
  displayName: string;
  version: string;
  status: AppStatus;
  appType: AppType;
  description: string;
}

export type ProjectedEntryReadiness = "unknown" | "ready" | "degraded" | "blocked";

export interface ProjectedEntry {
  appId: string;
  key: string;
  kind: AppEntryKind;
  title: string;
  description?: string;
  presentation: "lab-only" | "eligible-for-main-entry";
  readiness: ProjectedEntryReadiness;
  requiredCapabilities: CapabilityRequirement[];
  provenance: AgentAppProvenance;
}

export interface RuntimePackageProjection {
  hasUiBundle: boolean;
  hasWorkerBundle: boolean;
  uiPath?: string;
  workerPath?: string;
}

export interface StorageProjection {
  namespace: string;
  schema?: string;
  migrations?: string;
  retention: NormalizedStorageDeclaration["retention"];
}

export interface KnowledgeBindingProjection {
  key: string;
  standard?: string;
  type?: string;
  required: boolean;
}

export interface ArtifactProjection {
  key: string;
  title?: string;
  type?: string;
}

export interface PolicyProjection {
  key: string;
  title?: string;
  required: boolean;
}

export interface ReadinessHint {
  code: string;
  message: string;
  severity: "info" | "warning";
}

export interface AgentAppProjection {
  app: AppSummary;
  package: PackageIdentity;
  entries: ProjectedEntry[];
  requiredCapabilities: CapabilityRequirement[];
  runtimePackage: RuntimePackageProjection;
  storage?: StorageProjection;
  knowledgeBindings: KnowledgeBindingProjection[];
  artifactTypes: ArtifactProjection[];
  policies: PolicyProjection[];
  readinessHints: ReadinessHint[];
  provenance: AgentAppProvenance;
}

export type ReadinessStatus = "ready" | "degraded" | "blocked";
export type CapabilityImplementation = "none" | "mock" | "adapter" | "native";

export interface ReadinessIssue {
  code:
    | "MANIFEST_VERSION_UNSUPPORTED"
    | "RUNTIME_TARGET_UNSUPPORTED"
    | "CAPABILITY_MISSING"
    | "CAPABILITY_VERSION_UNSUPPORTED"
    | "PERMISSION_REQUIRED"
    | "STORAGE_DECLARED_BUT_DISABLED"
    | "UI_RUNTIME_DISABLED"
    | "WORKER_RUNTIME_DISABLED"
    | "PACKAGE_HASH_MISSING"
    | "PACKAGE_HASH_MISMATCH";
  severity: "blocker" | "warning";
  message: string;
  capability?: string;
  entryKey?: string;
}

export interface CapabilitySupport {
  capability: string;
  requestedRange: string;
  hostVersion?: string;
  supported: boolean;
  enabled: boolean;
  implementation: CapabilityImplementation;
}

export interface EntryReadiness {
  entryKey: string;
  status: ReadinessStatus;
  issues: ReadinessIssue[];
}

export interface ReadinessResult {
  appId: string;
  status: ReadinessStatus;
  checkedAt: string;
  blockers: ReadinessIssue[];
  warnings: ReadinessIssue[];
  supportedCapabilities: CapabilitySupport[];
  missingCapabilities: CapabilityRequirement[];
  entryReadiness: EntryReadiness[];
}

export interface AgentAppHostFlags {
  labEnabled: boolean;
  localPackageEnabled: boolean;
  projectionEnabled: boolean;
  readinessEnabled: boolean;
  cleanupDryRunEnabled: boolean;
  mockSdkEnabled: false;
  localStorageEnabled: boolean;
  realAdapterEnabled: false;
  uiRuntimeEnabled: boolean;
  workerRuntimeEnabled: boolean;
  cloudBootstrapEnabled: false;
}

export interface HostCapabilityProfile {
  appRuntimeVersion: string;
  runtimeTargets: RuntimeTarget[];
  capabilities: Record<
    string,
    {
      version: string;
      enabled: boolean;
      implementation: CapabilityImplementation;
    }
  >;
  featureFlags: AgentAppHostFlags;
}

export interface CleanupTarget {
  kind: "path" | "namespace" | "ref";
  value: string;
  exists: boolean | "unknown";
  safeToDelete: boolean;
  reason: string;
}

export interface CleanupWarning {
  code: string;
  message: string;
}

export interface AppCleanupPlan {
  mode: "dry-run";
  appId: string;
  packageHash: string;
  generatedAt: string;
  packageCachePaths: CleanupTarget[];
  projectionPaths: CleanupTarget[];
  readinessPaths: CleanupTarget[];
  storageNamespaces: CleanupTarget[];
  artifactRefs: CleanupTarget[];
  evidenceRefs: CleanupTarget[];
  taskRefs: CleanupTarget[];
  secretRefs: CleanupTarget[];
  logPaths: CleanupTarget[];
  exportPaths: CleanupTarget[];
  warnings: CleanupWarning[];
}

export interface InstalledAppPreview {
  identity: PackageIdentity;
  manifest: NormalizedAppManifest;
  projection: AgentAppProjection;
  readiness: ReadinessResult;
  cleanupPlan: AppCleanupPlan;
}
