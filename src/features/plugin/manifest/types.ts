import type { ReadinessStatus } from "@/features/agent-app/types";

export type PluginActivationEntryKind = "plugin" | "agentApp" | "skill";
export type PluginActivationIntent =
  | "manual"
  | "at_command"
  | "history_restore"
  | "chip";
export type PluginRendererKind =
  | "host_builtin"
  | "app_declared"
  | "artifact_viewer";
export type PluginRendererActionRisk = "read" | "write";
export type PluginConnectorKind =
  | "account"
  | "api"
  | "data_source"
  | "external_app";
export type PluginAgentAppUiKind = "page" | "pane" | "webcontents_view";
export type PluginHistoryDefaultSurface =
  | "primaryArtifact"
  | "selectedObject"
  | "chat";
export type PluginHistoryFallback = "artifactPreview" | "chatOnly";
export type PluginWorkspaceSelectionPolicy = "last" | "primary" | "manual";

export interface PluginManifest {
  schemaVersion?: string;
  id?: string;
  name?: string;
  displayName?: string;
  version: string;
  description?: string;
  keywords?: string[];
  categories?: string[];
  capabilities?: string[];
  author?: PluginManifestAuthor;
  publisher?: PluginManifestAuthor;
  homepage?: string;
  repository?: string;
  license?: string;
  interface?: PluginManifestInterface;
  contributions?: PluginManifestContributions;
  componentPaths?: PluginManifestComponentPaths;
  skills?: PluginSkillDeclaration[];
  agentApps?: PluginAgentAppDeclaration[];
  subagents?: PluginSubagentDeclaration[];
  workflows?: PluginWorkflowDeclaration[];
  connectors?: PluginConnectorDeclaration[];
  mcpServers?: PluginMcpServerDeclaration[];
  artifactRenderers?: PluginArtifactRendererDeclaration[];
  activationEntries?: PluginActivationEntryDeclaration[];
  historyRestore?: PluginHistoryRestoreDeclaration;
}

export interface PluginManifestAuthor {
  name?: string;
  email?: string;
  url?: string;
}

export interface PluginManifestComponentPaths {
  agents?: string;
  subagents?: string;
  skills?: string;
  cli?: string;
  clis?: string;
  connectors?: string;
  resources?: string;
  workflows?: string;
  artifacts?: string;
  locales?: string;
  examples?: string;
  mcpServers?: string | Record<string, unknown>;
  apps?: string;
  hooks?: string;
  runtime?: string;
  workbench?: string;
}

export interface PluginManifestContributions {
  runtime?: string;
  workbench?: string;
  skills?: string;
  subagents?: string;
  clis?: string;
  connectors?: string;
  hooks?: string;
  resources?: string;
  workflows?: string;
  artifacts?: string;
  locales?: string;
  examples?: string;
  mcpServers?: string | Record<string, unknown>;
}

export interface PluginManifestInterface {
  displayName?: string;
  shortDescription?: string;
  longDescription?: string;
  developerName?: string;
  category?: string;
  capabilities: string[];
  websiteUrl?: string;
  privacyPolicyUrl?: string;
  termsOfServiceUrl?: string;
  defaultPrompt?: string[];
  brandColor?: string;
  composerIcon?: string;
  logo?: string;
  logoDark?: string;
  screenshots: string[];
}

export interface PluginSkillDeclaration {
  id: string;
  title: string;
  description?: string;
  path?: string;
  required?: boolean;
}

export interface PluginAgentAppDeclaration {
  id: string;
  title: string;
  description?: string;
  uiKind?: PluginAgentAppUiKind;
  defaultSurfaceKind?: string;
  entryKey?: string;
}

export interface PluginSubagentDeclaration {
  id: string;
  title: string;
  description?: string;
  activation?: string;
  required?: boolean;
  skills?: string[];
}

export interface PluginWorkflowStepDeclaration {
  id: string;
  title?: string;
  subagent?: string;
  skillRefs?: string[];
  expectedOutput?: string;
}

export interface PluginWorkflowDeclaration {
  key: string;
  title?: string;
  path?: string;
  taskKind?: string;
  triggerIntents?: string[];
  outputArtifactKind?: string;
  steps?: PluginWorkflowStepDeclaration[];
  humanReview?: boolean;
  required?: boolean;
}

export interface PluginConnectorDeclaration {
  id: string;
  title: string;
  kind: PluginConnectorKind;
  required?: boolean;
}

export interface PluginMcpServerDeclaration {
  id: string;
  title: string;
  serverKey?: string;
  required?: boolean;
}

export interface PluginActivationEntryDeclaration {
  key: string;
  title: string;
  aliases?: string[];
  kind: PluginActivationEntryKind;
  intent?: PluginActivationIntent;
  defaultObjectKind?: string;
}

export interface PluginArtifactRendererDeclaration {
  artifactType: string;
  surfaceKind: string;
  rendererKind: PluginRendererKind;
  entry?: string;
  outputArtifactKind?: string;
  paneKind?: string;
  actionKeys?: string[];
  actions?: PluginArtifactRendererActionDeclaration[];
  capabilities?: string[];
  fallbackRendererKind?: string;
  defaultPane?: string;
}

export interface PluginArtifactRendererActionDeclaration {
  key: string;
  intent?: string;
  risk: PluginRendererActionRisk;
  taskKind?: string;
  title?: string;
}

export interface PluginHistoryRestoreDeclaration {
  defaultSurface: PluginHistoryDefaultSurface;
  restoreSelection: boolean;
  restoreLayout: boolean;
  fallback: PluginHistoryFallback;
}

export interface PluginRightSurfaceContract {
  defaultActiveTab?: string;
  supportedTabs: string[];
  historyRestore: {
    enabled: boolean;
    restoreSelection: boolean;
    restoreLayout: boolean;
  };
  productWorkspace: {
    enabled: boolean;
    primaryObjectKind?: string;
    selectionPolicy: PluginWorkspaceSelectionPolicy;
  };
  panes: Array<{
    kind: string;
    title: string;
    rendererKind: PluginRendererKind;
  }>;
}

export interface PluginContractProvenance {
  sourceKind: "plugin_manifest" | "agent_app_manifest" | "plugin_marketplace";
  sourceId: string;
  sourceVersion: string;
  packageHash?: string;
  manifestHash?: string;
}

export interface PluginContract {
  schemaVersion: 1;
  id: string;
  packageSchemaVersion?: string;
  name?: string;
  displayName: string;
  version: string;
  description: string;
  keywords: string[];
  categories: string[];
  capabilities: string[];
  interface?: PluginManifestInterface;
  contributions?: PluginManifestContributions;
  componentPaths: PluginManifestComponentPaths;
  skills: PluginSkillDeclaration[];
  agentApps: PluginAgentAppDeclaration[];
  subagents: PluginSubagentDeclaration[];
  workflows: PluginWorkflowDeclaration[];
  connectors: PluginConnectorDeclaration[];
  mcpServers: PluginMcpServerDeclaration[];
  artifactRenderers: PluginArtifactRendererDeclaration[];
  activationEntries: PluginActivationEntryDeclaration[];
  historyRestore: PluginHistoryRestoreDeclaration;
  rightSurface: PluginRightSurfaceContract;
  provenance: PluginContractProvenance;
}

export type PluginRegistryCapabilityState =
  | "installable"
  | "activatable"
  | "renderable"
  | "read_only_history";

export type PluginRegistryActivationState =
  | "activatable"
  | "blocked"
  | "disabled"
  | "missing_entry";

export type PluginRegistryRendererState = "renderable" | "missing_renderer";
export type PluginRegistryHistoryState =
  | "read_write"
  | "read_only_history"
  | "unavailable";

export interface PluginRegistryProjectionInput {
  contract: PluginContract;
  installed?: boolean;
  installable?: boolean;
  enabled?: boolean;
  readinessStatus?: ReadinessStatus | "unknown";
  hasHistoryWorkspace?: boolean;
  blockerCodes?: string[];
}

export interface PluginRegistryItem {
  pluginId: string;
  displayName: string;
  version: string;
  installed: boolean;
  enabled: boolean;
  capabilityStates: PluginRegistryCapabilityState[];
  activationState: PluginRegistryActivationState;
  rendererState: PluginRegistryRendererState;
  historyState: PluginRegistryHistoryState;
  blockerCodes: string[];
}
