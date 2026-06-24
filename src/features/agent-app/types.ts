export type PackageSourceKind =
  | "fixture"
  | "local_folder"
  | "local_archive"
  | "cloud_release";
export type RuntimeTarget = "local" | "hybrid" | "server-assisted" | "cloud";
export type AppStatus =
  | "draft"
  | "ready"
  | "needs-review"
  | "preview"
  | "stable"
  | "deprecated"
  | "archived";
export type AppType =
  | "agent-app"
  | "workflow-app"
  | "domain-app"
  | "customer-app"
  | "tool-app"
  | "expert-pack"
  | "custom";

export type AppEntryKind =
  | "page"
  | "panel"
  | "expert-chat"
  | "command"
  | "workflow"
  | "artifact"
  | "artifact-viewer"
  | "background-task"
  | "settings";

export interface AppRequires {
  lime?: {
    appRuntime?: string;
    sdk?: string;
  };
  sdk?: string;
  capabilities?: Record<string, string> | string[];
}

export interface RuntimePackageDeclaration {
  ui?: {
    path: string;
    hash?: string;
  };
  worker?: {
    path?: string;
    entrypoint?: string;
    contract?: string;
    sampleRequest?: string;
    outputArtifactKind?: string;
    hash?: string;
  };
  storage?: {
    schema?: string;
    migrations?: string;
    hash?: string;
  };
}

export type AgentAppInstallMode =
  | "in_lime"
  | "standalone"
  | "runtime_backed"
  | "web_host";

export type AgentAppInstallPlatform = "macos" | "windows" | "linux";

export interface AgentAppInstallContract {
  modes: AgentAppInstallMode[];
  runtime?: {
    minVersion?: string;
    distribution?: {
      standalone?: {
        embedRuntime?: boolean;
        shell?: string;
      };
      runtimeBacked?: {
        requires?: string;
        minVersion?: string;
      };
    };
  };
  standalone?: {
    shell?: string;
    bundleId?: string;
    platforms?: AgentAppInstallPlatform[];
    autoUpdate?: boolean;
  };
  runtimeBacked?: {
    requires?: string;
    minVersion?: string;
  };
  branding?: {
    name?: string;
    icon?: string;
    windowTitle?: string;
  };
  compatibility?: Record<string, unknown>;
}

export interface NormalizedAgentAppInstallContract {
  schemaVersion: 1;
  supportedModes: AgentAppInstallMode[];
  preferredMode: AgentAppInstallMode;
  runtime: {
    minVersion?: string;
    standalone?: {
      embedRuntime: boolean;
      shell?: string;
    };
    runtimeBacked?: {
      requires: string;
      minVersion?: string;
    };
  };
  standalone?: {
    shell?: string;
    bundleId?: string;
    platforms: AgentAppInstallPlatform[];
    autoUpdate: boolean;
  };
  runtimeBacked?: {
    requires: string;
    minVersion?: string;
  };
  branding: {
    name: string;
    icon?: string;
    windowTitle: string;
  };
  compatibility: Record<string, unknown>;
}

export interface AgentAppInstallProjectionWarning {
  code: "INSTALL_MODE_RESERVED" | "INSTALL_CONTRACT_DEFAULTED";
  mode?: AgentAppInstallMode;
  message: string;
}

export interface AgentAppInstallProjection {
  supportedModes: AgentAppInstallMode[];
  preferredMode: AgentAppInstallMode;
  runtimeRequirements: Array<{
    mode: AgentAppInstallMode;
    minVersion?: string;
    requires?: string;
  }>;
  shellRequirements: Array<{
    mode: AgentAppInstallMode;
    shell?: string;
    bundleId?: string;
    platforms?: AgentAppInstallPlatform[];
  }>;
  branding: NormalizedAgentAppInstallContract["branding"];
  warnings: AgentAppInstallProjectionWarning[];
}

export interface AgentAppInstallSetupAction {
  code:
    | "select_install_mode"
    | "install_lime_runtime"
    | "upgrade_lime_runtime"
    | "use_lime_desktop";
  label: string;
  mode: AgentAppInstallMode;
}

export interface InstallModeReadiness {
  mode: AgentAppInstallMode;
  status: "ready" | "needs-setup" | "blocked";
  blockers: ReadinessIssue[];
  setupActions: AgentAppInstallSetupAction[];
  evidencePolicy: "required" | "optional";
  runtimeVersion?: string;
}

export interface AgentAppRuntimeProfileSummary {
  installMode: AgentAppInstallMode;
  shellKind: "desktop" | "app_shell" | "runtime_backed" | "web_host";
  runtimeVersion?: string;
  runtimeMinVersion?: string;
  checkedAt: string;
}

export type LimeRuntimeShellKind =
  | "desktop"
  | "app_shell"
  | "runtime_backed"
  | "web_host";

export interface LimeRuntimeProfileCapability {
  version: string;
  available: boolean;
  reason?: string;
  implementation: CapabilityImplementation;
}

export interface LimeRuntimeProfile {
  runtimeId: string;
  runtimeVersion: string;
  shellKind: LimeRuntimeShellKind;
  installMode: AgentAppInstallMode;
  capabilities: Record<string, LimeRuntimeProfileCapability>;
  policy: {
    permissionPrompt: "required" | "optional" | "disabled";
    externalSideEffects: "deny" | "confirm" | "allow";
    maxRisk: "low" | "medium" | "high";
  };
  storage: {
    namespaceRoot: string;
    quotaBytes?: number;
    cleanupSupported: boolean;
  };
  evidence: {
    recordRequired: boolean;
    exportSupported: boolean;
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
  uninstallPolicy?: "keep-on-uninstall" | "delete-on-uninstall" | "ask";
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
  required?: boolean;
}

export interface PolicyDeclaration {
  key: string;
  title?: string;
  required?: boolean;
}

export interface ServiceDeclaration {
  key: string;
  kind?: string;
  path?: string;
  required?: boolean;
}

export interface WorkflowDeclaration {
  key: string;
  path?: string;
  humanReview?: boolean;
  required?: boolean;
}

export interface SkillRefDeclaration {
  id: string;
  standard?: string;
  activation?: string;
  required?: boolean;
}

export interface ToolRefDeclaration {
  key: string;
  provider?: string;
  capabilities?: string[];
  required?: boolean;
}

export interface EvalDeclaration {
  key: string;
  kind?: string;
  evidenceRequired?: boolean;
  required?: boolean;
}

export interface EventDeclaration {
  key: string;
  direction?: "publish" | "subscribe" | "both";
  required?: boolean;
}

export interface SecretDeclaration {
  key: string;
  provider?: string;
  scope?: string;
  required?: boolean;
}

export interface OverlayTemplateDeclaration {
  key: string;
  scope?: string;
  required?: boolean;
}

export interface UiDeclaration {
  routes?: unknown[];
  panels?: unknown[];
  cards?: unknown[];
  settings?: unknown[];
  artifactViewers?: unknown[];
}

export interface LifecycleDeclaration {
  install?: unknown;
  activate?: unknown;
  upgrade?: unknown;
  disable?: unknown;
  uninstall?: unknown;
}

export interface AgentAppPresentation {
  icon?: string;
  iconUrl?: string;
  logo?: string;
  logoUrl?: string;
  category?: string;
  title?: string;
  summary?: string;
  [key: string]: unknown;
}

export type AgentAppProfile = "classic" | "workbench";

export interface AgentAppDistributionDeclaration {
  primaryInstallSurface?: "lime-app-center" | "standalone" | string;
  channel?: string;
  visibility?: string;
  publishFlow?: string;
  [key: string]: unknown;
}

export interface WorkbenchProductWorkspaceDeclaration {
  scope?: "session" | "workspace" | string;
  primaryObjectKinds?: string[];
  snapshotPolicy?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface WorkbenchProductionObjectDeclaration {
  kind: string;
  title?: string;
  artifactKind?: string;
  defaultSurface?: string;
  versioning?: string;
  primary?: boolean;
  [key: string]: unknown;
}

export interface WorkbenchTaskDeclaration {
  kind: string;
  title?: string;
  expectedObjects?: string[];
  requiredCapabilities?: string[];
  defaultSurface?: string;
  [key: string]: unknown;
}

export interface WorkbenchObjectSurfaceDeclaration {
  objectKind: string;
  surfaceKind: string;
  renderer?: "host_builtin" | "app_surface" | string;
  layout?: string;
  actions?: unknown[];
  [key: string]: unknown;
}

export interface WorkbenchHistoryRestoreDeclaration {
  defaultSurface?: string;
  restoreSelection?: boolean;
  restoreLayout?: boolean;
  fallback?: string;
  [key: string]: unknown;
}

export interface WorkbenchDeclaration {
  profile?: "production" | string;
  productWorkspace?: WorkbenchProductWorkspaceDeclaration;
  productionObjects?: WorkbenchProductionObjectDeclaration[];
  workbenchTasks?: WorkbenchTaskDeclaration[];
  objectSurfaces?: WorkbenchObjectSurfaceDeclaration[];
  historyRestore?: WorkbenchHistoryRestoreDeclaration;
  [key: string]: unknown;
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
  artifactTypes?: ArtifactDeclaration[];
  policies?: PolicyDeclaration[];
  services?: ServiceDeclaration[];
  workflows?: WorkflowDeclaration[];
  skillRefs?: SkillRefDeclaration[];
  toolRefs?: ToolRefDeclaration[];
  evals?: EvalDeclaration[];
  events?: EventDeclaration[];
  secrets?: SecretDeclaration[];
  overlayTemplates?: OverlayTemplateDeclaration[];
  ui?: UiDeclaration;
  lifecycle?: LifecycleDeclaration;
  install?: unknown;
  profiles?: AgentAppProfile[] | string[];
  workbench?: WorkbenchDeclaration;
  distribution?: AgentAppDistributionDeclaration;
  presentation?: AgentAppPresentation;
  agentRuntime?: unknown;
  requirements?: unknown;
  boundary?: unknown;
  integrations?: unknown;
  operations?: unknown;
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
    path?: string;
    entrypoint?: string;
    contract?: string;
    sampleRequest?: string;
    outputArtifactKind?: string;
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
  manifestVersion:
    | "0.2"
    | "0.3"
    | "0.5"
    | "0.6"
    | "0.7"
    | "0.8"
    | "0.9"
    | "0.10"
    | "0.11";
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
  services: ServiceDeclaration[];
  workflows: WorkflowDeclaration[];
  skillRefs: SkillRefDeclaration[];
  toolRefs: ToolRefDeclaration[];
  evals: EvalDeclaration[];
  events: EventDeclaration[];
  secrets: SecretDeclaration[];
  overlayTemplates: OverlayTemplateDeclaration[];
  ui?: UiDeclaration;
  lifecycle: LifecycleDeclaration;
  install: NormalizedAgentAppInstallContract;
  profiles: AgentAppProfile[];
  workbench?: WorkbenchDeclaration;
  distribution?: AgentAppDistributionDeclaration;
  presentation?: AgentAppPresentation;
  agentRuntime?: unknown;
  requirements?: unknown;
  boundary?: unknown;
  integrations?: unknown;
  operations?: unknown;
}

export interface PackageIdentity {
  sourceKind: PackageSourceKind;
  sourceUri: string;
  appId: string;
  appVersion: string;
  packageHash: string;
  manifestHash: string;
  loadedAt: string;
  releaseId?: string;
  tenantId?: string;
  tenantEnablementRef?: string;
  channel?: string;
  signatureRef?: string;
}

export type AgentAppCloudReleaseSignatureAlgorithm =
  | "RSASSA-PKCS1-v1_5-SHA256"
  | "RSA-PSS-SHA256"
  | "ECDSA-P256-SHA256"
  | "Ed25519";

export interface AgentAppCloudReleaseSignatureProof {
  schemaVersion?: string;
  publicKeyId: string;
  algorithm: AgentAppCloudReleaseSignatureAlgorithm;
  signature: string;
  payloadHash?: string;
  signedAt?: string;
}

export interface AgentAppCloudReleaseSignatureTrustRoot {
  publicKeyId: string;
  algorithm: AgentAppCloudReleaseSignatureAlgorithm;
  publicKey: string;
  appIds?: string[];
  notBefore?: string;
  notAfter?: string;
  revoked?: boolean;
  revokedAt?: string;
}

export type AgentAppPackageVerificationStatus =
  | "verified"
  | "missing"
  | "package_hash_mismatch"
  | "manifest_hash_mismatch";

export interface AgentAppPackageVerificationResult {
  status: AgentAppPackageVerificationStatus;
  expectedPackageHash: string;
  actualPackageHash?: string;
  expectedManifestHash: string;
  actualManifestHash?: string;
  message: string;
}

export type CloudBootstrapToolAvailabilityStatus =
  | "available"
  | "not-enabled"
  | "missing"
  | "unknown";

export interface CloudBootstrapToolAvailability {
  key: string;
  status: CloudBootstrapToolAvailabilityStatus;
  version?: string;
  required?: boolean;
  reason?: string;
}

export type CloudBootstrapLicenseState =
  | "active"
  | "trial"
  | "expired"
  | "revoked"
  | "unknown";

export type CloudBootstrapRegistrationState =
  | "not_required"
  | "required"
  | "active"
  | "expired"
  | "revoked";

export interface CloudBootstrapApp {
  appId: string;
  displayName?: string;
  version: string;
  icon?: string;
  iconUrl?: string;
  logo?: string;
  logoUrl?: string;
  presentation?: AgentAppPresentation;
  releaseId?: string;
  tenantId?: string;
  tenantEnablementRef?: string;
  channel?: string;
  signatureRef?: string;
  signatureProof?: AgentAppCloudReleaseSignatureProof;
  licenseState?: CloudBootstrapLicenseState;
  registrationRequired: boolean;
  registrationState?: CloudBootstrapRegistrationState;
  registrationHint?: string;
  enabled: boolean;
  disabledReason?: string;
  packageUrl: string;
  packageHash: string;
  manifestHash: string;
  capabilityRequirements: Record<string, string>;
  defaultEntries: string[];
  policyDefaults: Record<string, unknown>;
  toolAvailability: CloudBootstrapToolAvailability[];
}

export interface CloudBootstrapPayload {
  schemaVersion?: string;
  tenantId?: string;
  generatedAt?: string;
  fetchedAt?: string;
  apps: CloudBootstrapApp[];
}

export interface CloudBootstrapPackageSource {
  sourceKind: "cloud_release";
  sourceUri: string;
  identity: PackageIdentity;
  app: CloudBootstrapApp;
  enabled: boolean;
  defaultEntries: string[];
  policyDefaults: Record<string, unknown>;
  toolAvailability: CloudBootstrapToolAvailability[];
}

export interface CloudBootstrapReleaseDescriptor {
  sourceKind: "cloud_release";
  sourceUri: string;
  appId: string;
  version: string;
  releaseId?: string;
  tenantId?: string;
  tenantEnablementRef?: string;
  channel?: string;
  packageUrl: string;
  packageHash: string;
  manifestHash: string;
  signatureRef?: string;
  signatureProof?: AgentAppCloudReleaseSignatureProof;
  compatibility: {
    capabilities: Record<string, string>;
  };
  identity: PackageIdentity;
  loadedAt: string;
}

export type CloudBootstrapInstallDecisionStatus =
  | "install_required"
  | "up_to_date"
  | "upgrade_available"
  | "disabled"
  | "hash_mismatch"
  | "offline_available"
  | "offline_unavailable";

export interface CloudBootstrapInstallDecision {
  appId: string;
  status: CloudBootstrapInstallDecisionStatus;
  canRunInstalled: boolean;
  shouldDownload: boolean;
  preserveData: true;
  shouldDeleteData: false;
  reason: string;
  installedIdentity?: PackageIdentity;
  targetIdentity?: PackageIdentity;
}

export type CloudBootstrapValidationIssueCode =
  | "PAYLOAD_INVALID"
  | "APPS_INVALID"
  | "APP_INVALID"
  | "FIELD_MISSING"
  | "FIELD_INVALID"
  | "APP_ID_INVALID"
  | "PACKAGE_URL_UNSUPPORTED"
  | "HASH_INVALID"
  | "SENSITIVE_FIELD_FORBIDDEN"
  | "SERVER_ASSISTED_DEFAULT_UNSUPPORTED";

export interface CloudBootstrapValidationIssue {
  code: CloudBootstrapValidationIssueCode;
  path: string;
  message: string;
  severity: "blocker" | "warning";
}

export interface CloudBootstrapValidationResult {
  status: "valid" | "invalid";
  payload?: CloudBootstrapPayload;
  blockers: CloudBootstrapValidationIssue[];
  warnings: CloudBootstrapValidationIssue[];
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
  presentation?: AgentAppPresentation;
}

export type ProjectedEntryReadiness =
  | "unknown"
  | "ready"
  | "degraded"
  | "blocked";

export interface ProjectedEntry {
  appId: string;
  key: string;
  kind: AppEntryKind;
  title: string;
  description?: string;
  route?: string;
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
  required: boolean;
}

export interface PolicyProjection {
  key: string;
  title?: string;
  required: boolean;
}

export interface ServiceProjection {
  key: string;
  kind?: string;
  path?: string;
  required: boolean;
}

export interface WorkflowProjection {
  key: string;
  path?: string;
  humanReview: boolean;
  required: boolean;
}

export interface SkillRequirementProjection {
  id: string;
  standard?: string;
  activation?: string;
  required: boolean;
}

export interface ToolRequirementProjection {
  key: string;
  provider?: string;
  capabilities: string[];
  required: boolean;
}

export interface EvalProjection {
  key: string;
  kind?: string;
  evidenceRequired: boolean;
  required: boolean;
}

export interface EventProjection {
  key: string;
  direction: "publish" | "subscribe" | "both";
  required: boolean;
}

export interface SecretProjection {
  key: string;
  provider?: string;
  scope?: string;
  required: boolean;
}

export interface OverlayTemplateProjection {
  key: string;
  scope?: string;
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
  services: ServiceProjection[];
  workflows: WorkflowProjection[];
  skillRequirements: SkillRequirementProjection[];
  toolRequirements: ToolRequirementProjection[];
  evals: EvalProjection[];
  events: EventProjection[];
  secrets: SecretProjection[];
  overlayTemplates: OverlayTemplateProjection[];
  ui?: UiDeclaration;
  lifecycle: LifecycleDeclaration;
  install: AgentAppInstallProjection;
  readinessHints: ReadinessHint[];
  provenance: AgentAppProvenance;
}

export type ReadinessStatus = "ready" | "degraded" | "needs-setup" | "blocked";
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
    | "CLOUD_APP_DISABLED"
    | "CLOUD_LICENSE_UNAVAILABLE"
    | "CLOUD_REGISTRATION_REQUIRED"
    | "CLOUD_TOOL_UNAVAILABLE"
    | "CLOUD_POLICY_UNSUPPORTED"
    | "CLOUD_ENTRY_NOT_ENABLED"
    | "KNOWLEDGE_BINDING_REQUIRED"
    | "SKILL_REQUIRED"
    | "TOOL_REQUIRED"
    | "ARTIFACT_TYPE_REQUIRED"
    | "EVAL_REQUIRED"
    | "SECRET_REQUIRED"
    | "OVERLAY_REQUIRED"
    | "SERVICE_REQUIRED"
    | "WORKFLOW_REQUIRED"
    | "PACKAGE_HASH_MISSING"
    | "PACKAGE_HASH_MISMATCH"
    | "INSTALL_MODE_UNSUPPORTED"
    | "RUNTIME_VERSION_UNSUPPORTED"
    | "RUNTIME_PROFILE_MISSING";
  severity: "blocker" | "warning";
  message: string;
  capability?: string;
  entryKey?: string;
  kind?: string;
  key?: string;
  required?: boolean;
  remediation?: string;
}

export interface AgentAppSetupState {
  knowledgeBindings?: Record<string, boolean>;
  skills?: Record<string, boolean>;
  tools?: Record<string, boolean>;
  artifactTypes?: Record<string, boolean>;
  evals?: Record<string, boolean>;
  secrets?: Record<string, boolean>;
  overlays?: Record<string, boolean>;
  services?: Record<string, boolean>;
  workflows?: Record<string, boolean>;
}

export type AgentAppSetupBindingKind =
  | "knowledge"
  | "skill"
  | "tool"
  | "artifact"
  | "eval"
  | "secret"
  | "overlay"
  | "service"
  | "workflow";

export interface AgentAppSetupBindingRecord {
  appId: string;
  kind: AgentAppSetupBindingKind;
  key: string;
  resolved: boolean;
  ref?: string;
  source?: "user" | "workspace" | "tenant" | "system";
  updatedAt: string;
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
  installModes: InstallModeReadiness[];
}

export interface AgentAppHostFlags {
  labEnabled: boolean;
  localPackageEnabled: boolean;
  projectionEnabled: boolean;
  readinessEnabled: boolean;
  cleanupDryRunEnabled: boolean;
  mockSdkEnabled: boolean;
  localStorageEnabled: boolean;
  realAdapterEnabled: boolean;
  uiRuntimeEnabled: boolean;
  workerRuntimeEnabled: boolean;
  cloudBootstrapEnabled: boolean;
}

export interface HostCapabilityProfile {
  appRuntimeVersion: string;
  standardVersions?: {
    current: string;
    compatible: string[];
  };
  runtimeTargets: RuntimeTarget[];
  capabilities: Record<
    string,
    {
      version: string;
      enabled: boolean;
      implementation: CapabilityImplementation;
    }
  >;
  agentRuntime?: unknown;
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
  installMode: AgentAppInstallMode;
  packageHash: string;
  generatedAt: string;
  installedStatePaths: CleanupTarget[];
  packageCachePaths: CleanupTarget[];
  packageCacheIndexPaths: CleanupTarget[];
  packageStagingPaths: CleanupTarget[];
  projectionPaths: CleanupTarget[];
  readinessPaths: CleanupTarget[];
  setupStatePaths: CleanupTarget[];
  overlayRefs: CleanupTarget[];
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

export interface InstalledAgentAppState {
  appId: string;
  identity: PackageIdentity;
  manifest: NormalizedAppManifest;
  projection: AgentAppProjection;
  readiness: ReadinessResult;
  installMode: AgentAppInstallMode;
  runtimeProfileSummary: AgentAppRuntimeProfileSummary;
  setup: AgentAppSetupState;
  disabled: boolean;
  installedAt: string;
  updatedAt: string;
}

export type AgentAppCapabilityErrorCode =
  | "FEATURE_DISABLED"
  | "ENTRY_NOT_FOUND"
  | "UI_ENTRY_UNSUPPORTED"
  | "READINESS_BLOCKED"
  | "CAPABILITY_NOT_DECLARED"
  | "STORAGE_KEY_NOT_FOUND"
  | "TASK_NOT_FOUND"
  | "APP_RUNTIME_UNSUPPORTED"
  | "WORKFLOW_RUNTIME_DISABLED"
  | "WORKFLOW_POLICY_VIOLATION";

export interface AgentAppCapabilityErrorPayload {
  code: AgentAppCapabilityErrorCode;
  message: string;
  appId?: string;
  entryKey?: string;
  capability?: string;
}

export interface AgentAppStorageEntry {
  appId?: string;
  key: string;
  value: unknown;
  updatedAt: string;
  provenance: AgentAppProvenance;
}

export interface AgentAppArtifactRecord {
  id: string;
  appId: string;
  entryKey?: string;
  kind: string;
  title: string;
  content: unknown;
  createdAt: string;
  provenance: AgentAppProvenance;
}

export interface AgentAppEvidenceRecord {
  id: string;
  appId: string;
  entryKey?: string;
  runId?: string;
  kind: string;
  message: string;
  createdAt: string;
  refs: string[];
  provenance: AgentAppProvenance;
}

export interface AgentAppKnowledgeRecord {
  id: string;
  appId: string;
  bindingKey: string;
  title: string;
  type?: string;
  standard?: string;
  snippet: string;
  provenance: AgentAppProvenance;
}

export interface AgentAppKnowledgeSearchResult {
  query: string;
  records: AgentAppKnowledgeRecord[];
  searchedAt: string;
  provenance: AgentAppProvenance;
}

export type AgentAppTaskStatus =
  | "running"
  | "succeeded"
  | "cancelled"
  | "failed";

export interface AgentAppTaskTraceEvent {
  at: string;
  message: string;
}

export type AgentAppTaskEventType =
  | "task:queued"
  | "task:status"
  | "task:progress"
  | "task:toolCall"
  | "task:citation"
  | "task:partialArtifact"
  | "task:blocked"
  | "task:missingContextRequested"
  | "task:reviewRequested"
  | "task:error"
  | "task:cancelled"
  | "task:completed"
  | "task:incident"
  | "artifact:created"
  | "evidence:recorded"
  | "evidence:verified";

export interface AgentAppTaskStreamEvent {
  eventId: string;
  taskId: string;
  traceId: string;
  type: AgentAppTaskEventType;
  at: string;
  status?: AgentAppTaskStatus;
  message?: string;
  payload?: unknown;
  refs?: string[];
}

export type AgentAppRuntimeProcessTimelineKind =
  | "progress"
  | "thinking"
  | "output"
  | "execution"
  | "routing"
  | "metrics"
  | "skill"
  | "tool"
  | "artifact"
  | "blocked"
  | "warning"
  | "completed";

export interface AgentAppRuntimeProcessTimelineItem {
  kind: AgentAppRuntimeProcessTimelineKind;
  title: string;
  statusText: string;
  message: string;
  detail?: string;
  meta?: string;
  collapseKey?: string;
}

export interface AgentAppRuntimeProcessModel {
  provider: string;
  model: string;
  label: string;
}

export interface AgentAppRuntimeProcessUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cachedInputTokens?: number;
  cacheCreationInputTokens?: number;
  [key: string]: unknown;
}

export interface AgentAppRuntimeProcessCost {
  estimatedTotalCost?: number;
  estimatedCostClass?: string;
  currency?: string;
  [key: string]: unknown;
}

export interface AgentAppRuntimeProcessView {
  timeline: AgentAppRuntimeProcessTimelineItem[];
  streamText: string;
  thinkingText: string;
  executionText: string;
  skillNames: string[];
  invokedSkillNames: string[];
  model: AgentAppRuntimeProcessModel;
  usage: AgentAppRuntimeProcessUsage | null;
  cost: AgentAppRuntimeProcessCost | null;
  terminal: boolean;
  collapsedByDefault: boolean;
  routingCount: number;
  executionCount: number;
  artifactCount: number;
}

export interface AgentAppTaskKnowledgeBinding {
  key: string;
  mode?: "retrieval" | "data";
  required?: boolean;
}

export type AgentAppApprovalPolicy =
  | "never"
  | "on-request"
  | "on-failure"
  | "untrusted";

export type AgentAppSandboxPolicy =
  | "read-only"
  | "workspace-write"
  | "danger-full-access";

export type AgentAppExecutionStrategy = "react";

export type AgentAppWebSearchMode = "disabled" | "allowed" | "required";

export interface AgentAppProviderConfig {
  provider_id?: string;
  provider_name: string;
  model_name: string;
  api_key?: string;
  base_url?: string;
  model_capabilities?: Record<string, unknown>;
  tool_call_strategy?: "native" | "tool_shim";
  toolshim_model?: string;
}

export interface AgentAppAutoContinueRequest {
  enabled: boolean;
  fast_mode_enabled: boolean;
  continuation_length: number;
  sensitivity: number;
  source?: string;
}

export interface AgentAppTurnConfigSnapshot {
  provider_config?: AgentAppProviderConfig;
  provider_preference?: string;
  model_preference?: string;
  reasoning_effort?: string;
  thinking_enabled?: boolean;
  approval_policy?: AgentAppApprovalPolicy;
  sandbox_policy?: AgentAppSandboxPolicy;
  execution_strategy?: AgentAppExecutionStrategy;
  web_search?: boolean;
  search_mode?: AgentAppWebSearchMode;
  auto_continue?: AgentAppAutoContinueRequest;
  system_prompt?: string;
  metadata?: Record<string, unknown>;
}

export interface AgentAppTaskRequest {
  title: string;
  prompt?: string;
  sessionId?: string;
  workspaceId?: string;
  taskId?: string;
  turnId?: string;
  eventName?: string;
  taskKind?: string;
  idempotencyKey?: string;
  queueIfBusy?: boolean;
  skipPreSubmitResume?: boolean;
  runStartHooks?: boolean;
  providerPreference?: string;
  modelPreference?: string;
  turnConfig?: AgentAppTurnConfigSnapshot;
  input?: unknown;
  expectedOutput?: unknown;
  knowledge?: AgentAppTaskKnowledgeBinding[];
  tools?: string[];
  files?: string[];
  secrets?: string[];
  humanReview?: boolean;
}

export type AgentAppTaskHostResponseActionType =
  | "tool_confirmation"
  | "ask_user"
  | "elicitation";

export interface AgentAppTaskHostResponseRequest {
  taskId: string;
  requestId: string;
  actionType: AgentAppTaskHostResponseActionType;
  confirmed?: boolean;
  response?: string;
  userData?: unknown;
  metadata?: Record<string, unknown>;
  actionScope?: {
    sessionId?: string;
    threadId?: string;
    turnId?: string;
  };
}

export interface AgentAppTaskHostResponseResult {
  taskId: string;
  requestId: string;
  status: "submitted";
  submittedAt: string;
}

export interface AgentAppTaskRecord {
  taskId: string;
  traceId: string;
  sessionId?: string;
  turnId?: string;
  workspaceId?: string;
  appId: string;
  entryKey?: string;
  retryOfTaskId?: string;
  retryAttempt?: number;
  title: string;
  prompt: string;
  taskKind: string;
  idempotencyKey: string;
  input?: unknown;
  expectedOutput?: unknown;
  knowledge: AgentAppTaskKnowledgeBinding[];
  tools: string[];
  files: string[];
  secrets: string[];
  humanReview: boolean;
  status: AgentAppTaskStatus;
  startedAt: string;
  finishedAt?: string;
  cancelledAt?: string;
  result?: unknown;
  trace: AgentAppTaskTraceEvent[];
  events: AgentAppTaskStreamEvent[];
  runtimeProcess?: AgentAppRuntimeProcessView;
  process?: AgentAppRuntimeProcessView;
  provenance: AgentAppProvenance;
}

export interface AgentAppRunRecord {
  runId: string;
  appId: string;
  entryKey: string;
  status: "running" | "succeeded" | "failed";
  startedAt: string;
  finishedAt?: string;
  artifactIds: string[];
  evidenceIds: string[];
  storageKeys: string[];
  taskIds: string[];
  provenance: AgentAppProvenance;
}

export interface AgentAppRunResult {
  run: AgentAppRunRecord;
  artifacts: AgentAppArtifactRecord[];
  evidence: AgentAppEvidenceRecord[];
  tasks: AgentAppTaskRecord[];
  knowledge: AgentAppKnowledgeSearchResult[];
}

export type AgentAppUiEntryKind = "page" | "panel" | "settings";

export interface AgentAppUiSandboxPolicy {
  allowScripts: boolean;
  allowSameOrigin: boolean;
  allowForms: boolean;
  allowPopups: boolean;
  allowDownloads: boolean;
  allowRawHostApi: boolean;
  allowNodeApi: boolean;
  allowNetworkAccess: boolean;
}

export interface AgentAppUiBridgeBlockedCapability {
  capability: string;
  reason: string;
}

export interface AgentAppUiSdkBridgeDescriptor {
  bridgeKind: "injected-sdk";
  appId: string;
  entryKey: string;
  allowedCapabilities: string[];
  blockedCapabilities: AgentAppUiBridgeBlockedCapability[];
  rawHostApi: false;
  nodeApi: false;
}

export interface AgentAppUiMountResult {
  appId: string;
  entryKey: string;
  entryKind: AgentAppUiEntryKind;
  title: string;
  route?: string;
  bundlePath: string;
  mountedAt: string;
  fallback: "lab-projection";
  sandboxPolicy: AgentAppUiSandboxPolicy;
  sdkBridge: AgentAppUiSdkBridgeDescriptor;
  provenance: AgentAppProvenance;
}

export interface AgentAppUninstallResult {
  appId: string;
  mode: "keep-data" | "delete-data";
  deletedTargets: CleanupTarget[];
  retainedTargets: CleanupTarget[];
  warnings: CleanupWarning[];
}

export interface AgentAppProvenanceQuery {
  appId?: string;
  entryKey?: string;
  workflowRunId?: string;
}
