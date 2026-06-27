export type PluginMarketplaceSourceKind =
  | "plugin_catalog"
  | "agent_app_release";

export type PluginMarketplaceInstallationPolicy =
  | "NOT_AVAILABLE"
  | "AVAILABLE"
  | "INSTALLED_BY_DEFAULT";

export type PluginMarketplaceAuthenticationPolicy = "ON_INSTALL" | "ON_USE";

export type PluginMarketplaceInstallState = "available" | "blocked";

export type PluginMarketplaceActivationState = "activatable" | "blocked";

export type ClientPluginInstallState =
  | "installed"
  | "enabled"
  | "disabled"
  | "uninstalled"
  | "failed";

export interface PluginMarketplacePackageRef {
  releaseId?: string;
  packageUrl?: string;
  packageHash?: string;
  manifestHash?: string;
  signatureRef?: string;
}

export interface PluginMarketplacePolicy {
  installation: PluginMarketplaceInstallationPolicy;
  authentication: PluginMarketplaceAuthenticationPolicy;
  products?: string[];
}

export interface PluginMarketplaceItem {
  pluginKey: string;
  pluginName: string;
  marketplaceName: string;
  marketplaceDisplayName?: string;
  displayName: string;
  description?: string;
  version?: string;
  category?: string;
  categories?: string[];
  keywords?: string[];
  capabilities?: string[];
  sourceKind: PluginMarketplaceSourceKind;
  sourceRef?: string;
  appId?: string;
  enabled: boolean;
  installState: PluginMarketplaceInstallState;
  activationState: PluginMarketplaceActivationState;
  blockedReason?: string;
  policy: PluginMarketplacePolicy;
  package?: PluginMarketplacePackageRef;
  manifestSummary?: Record<string, unknown>;
  updatedAt?: string;
}

export interface PluginMarketplaceListResponse {
  schemaVersion: string;
  tenantId: string;
  generatedAt: string;
  marketplaceName: string;
  marketplaceDisplayName?: string;
  items: PluginMarketplaceItem[];
}

export interface ClientPluginInstallStateReport {
  tenantId: string;
  userId: string;
  pluginName: string;
  marketplaceName: string;
  pluginKey: string;
  sourceKind: PluginMarketplaceSourceKind;
  sourceRef?: string;
  state: ClientPluginInstallState;
  releaseId?: string;
  packageHash?: string;
  manifestHash?: string;
  reason?: string;
  reportedAt: string;
  updatedAt: string;
}

export interface ReportClientPluginInstallStatePayload {
  state: ClientPluginInstallState;
  releaseId?: string;
  packageHash?: string;
  manifestHash?: string;
  reason?: string;
  reportedAt?: string;
}
