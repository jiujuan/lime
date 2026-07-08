import type {
  PluginRuntimeProcessCost,
  PluginRuntimeProcessModel,
  PluginRuntimeProcessUsage,
  PluginTaskRecord,
  PluginTaskRequest,
} from "../types";

export interface RuntimeModelProjection {
  taskId: string;
  taskKind: string;
  status: PluginTaskRecord["status"];
  startedAt: string;
  finishedAt?: string;
  model: PluginRuntimeProcessModel;
  constraints?: RuntimeModelConstraintsProjection;
}

export interface RuntimeModelConstraintsProjection {
  selectedProvider?: string;
  selectedModel?: string;
  requestedModel?: string;
  routingMode?: string;
  decisionSource?: string;
  decisionReason?: string;
  candidateCount?: number;
  fallbackChain: string[];
  capabilityGap?: string;
  estimatedCostClass?: string;
  limitStatus?: string;
  costStatus?: string;
  singleCandidateOnly?: boolean;
  providerLocked?: boolean;
  settingsLocked?: boolean;
  oemLocked?: boolean;
  inputPerMillion?: number;
  outputPerMillion?: number;
  cacheReadPerMillion?: number;
  cacheWritePerMillion?: number;
  currency?: string;
  source: "app_server_runtime_model_constraints";
}

export interface RuntimeUsageProjection {
  taskId: string;
  taskKind: string;
  status: PluginTaskRecord["status"];
  startedAt: string;
  finishedAt?: string;
  usage: PluginRuntimeProcessUsage;
  model: PluginRuntimeProcessModel;
}

export interface RuntimeCostProjection {
  taskId: string;
  taskKind: string;
  status: PluginTaskRecord["status"];
  startedAt: string;
  finishedAt?: string;
  cost: PluginRuntimeProcessCost;
  model: PluginRuntimeProcessModel;
}

export interface RuntimeBudgetProjection {
  taskId: string;
  taskKind: string;
  status: PluginTaskRecord["status"];
  startedAt: string;
  finishedAt?: string;
  scope: "task";
  limitStatus?: string;
  costStatus?: string;
  estimatedCostClass?: string;
  estimatedTotalCost?: number;
  currency?: string;
  candidateCount?: number;
  singleCandidateOnly?: boolean;
  providerLocked?: boolean;
  settingsLocked?: boolean;
  oemLocked?: boolean;
  capabilityGap?: string;
  notes: string[];
  limitState?: Record<string, unknown>;
  costState?: Record<string, unknown>;
  source: "app_server_runtime_projection";
}

export interface RuntimeSkillProjection {
  skillId: string;
  name: string;
  status: "declared" | "invoked" | "ready_for_manual_enable" | "blocked";
  taskCount: number;
  invocationCount: number;
  taskIds: string[];
  taskKinds: string[];
  lastSeenAt: string;
  source: "app_server_runtime_process" | "workspace_skill_binding";
  description?: string;
  directory?: string;
  bindingStatus?: string;
  nextGate?: string;
  runtimeGate?: string;
  queryLoopVisible?: boolean;
  toolRuntimeVisible?: boolean;
  launchEnabled?: boolean;
  permissionSummary?: string[];
}

export interface RuntimeSkillInvocationProjection {
  invocationId: string;
  skillId: string;
  name: string;
  taskId: string;
  taskKind: string;
  status: PluginTaskRecord["status"];
  startedAt: string;
  finishedAt?: string;
  source: "app_server_runtime_process";
}

export interface RuntimeMemoryProjection {
  taskId: string;
  taskKind: string;
  status: PluginTaskRecord["status"];
  startedAt: string;
  finishedAt?: string;
  scope: "task";
  knowledgeBindingKeys: string[];
  contextCompactionCount: number;
  pendingRequestCount: number;
  memoryBudget?: RuntimeMemoryBudgetProjection;
  contextRefLabels: string[];
  retrievalRefCount: number;
  missingContextCount: number;
  teamMemoryRefCount: number;
  contextGateStatus: string;
  source: "app_server_runtime_projection";
}

export interface RuntimeMemoryBudgetProjection {
  usedTokens?: number;
  maxTokens?: number;
  status?: string;
  source?: string;
}

export interface RuntimeContextProjection {
  taskId: string;
  traceId: string;
  taskKind: string;
  status: PluginTaskRecord["status"];
  startedAt: string;
  finishedAt?: string;
  workspaceId?: string;
  threadId?: string;
  turnIds: string[];
  knowledgeBindingKeys: string[];
  toolKeys: string[];
  fileRefs: string[];
  inputAttached: boolean;
  expectedOutputAttached: boolean;
  pendingRequestCount: number;
  contextGateStatus: string;
  memoryBudget?: RuntimeMemoryBudgetProjection;
  retrievalRefCount: number;
  missingContextCount: number;
  teamMemoryRefCount: number;
  source: "app_server_runtime_projection";
}

export type ToolIntegrationCapability =
  | "lime.search"
  | "lime.browser"
  | "lime.documents"
  | "lime.media"
  | "lime.mcp"
  | "lime.terminal"
  | "lime.connectors";

export interface RuntimeToolRunProjection {
  runId: string;
  capability: ToolIntegrationCapability;
  toolName: string;
  taskId: string;
  taskKind: string;
  status: PluginTaskRecord["status"] | "declared" | "observed" | "completed";
  startedAt: string;
  finishedAt?: string;
  title: string;
  statusText: string;
  message: string;
  detail?: string;
  input?: unknown;
  output?: unknown;
  source: "app_server_runtime_process" | "app_server_runtime_thread_read";
}

export interface ToolExecutionPolicyProjection {
  owner: "lime_agent_runtime";
  scope: "plugin_session";
  approvalRequired: boolean;
  sandboxRequired: boolean;
  mutationExposed: false;
  tokenExposed: false;
  secretBinding?: "host_managed";
  reason: string;
}

export interface ToolExecutionRequestEnvelope {
  capability: string;
  method: string;
  appId: string;
  entryKey?: string;
  taskId?: string;
  sessionId?: string;
  toolName?: string;
  action?: string;
  input: unknown;
  reason: string;
  policy: ToolExecutionPolicyProjection;
  idempotencyKey?: string;
}

export interface ToolExecutionHandoffProjection {
  status: "accepted" | "not_started";
  owner: "lime_agent_runtime";
  source: "lime.agent.startTask";
  reason?: string;
  taskId?: string;
  traceId?: string;
  taskKind?: string;
  taskStatus?: PluginTaskRecord["status"];
}

export interface ConnectorAuthorizationPolicyProjection {
  owner: "lime_connector_policy";
  scope: "plugin_session";
  approvalRequired: true;
  mutationExposed: false;
  tokenExposed: false;
  secretBinding: "host_managed";
  sessionScoped: true;
  reason: string;
}

export interface ConnectorAuthorizationRequestEnvelope {
  capability: "lime.connectors";
  method: "requestAuth";
  appId: string;
  entryKey?: string;
  connectorId: string;
  taskId?: string;
  sessionId?: string;
  input: unknown;
  reason: string;
  policy: ConnectorAuthorizationPolicyProjection;
  idempotencyKey?: string;
}

export interface ConnectorAuthorizationHandoffProjection {
  status: "accepted" | "not_started";
  owner: "lime_connector_policy";
  source: "lime.agent.startTask";
  reason?: string;
  taskId?: string;
  traceId?: string;
  taskKind?: string;
  taskStatus?: PluginTaskRecord["status"];
}

export type ToolExecutionAgentTaskRequest = PluginTaskRequest & {
  requiredCapabilities?: string[];
  capabilityHints?: string[];
  metadata?: Record<string, unknown>;
  sessionId?: string;
};

export type ConnectorAuthorizationAgentTaskRequest = PluginTaskRequest & {
  requiredCapabilities?: string[];
  capabilityHints?: string[];
  metadata?: Record<string, unknown>;
  sessionId?: string;
  queueIfBusy?: boolean;
};

export type RuntimeAggregateProjectionSource =
  | RuntimeToolRunProjection["source"]
  | "mixed";

export interface RuntimeMcpToolProjection {
  toolName: string;
  serverId: string;
  toolId: string;
  runIds: string[];
  taskIds: string[];
  lastSeenAt: string;
  source: RuntimeAggregateProjectionSource;
}

export interface RuntimeConnectorProjection {
  connectorId: string;
  actionIds: string[];
  runIds: string[];
  taskIds: string[];
  lastSeenAt: string;
  source: RuntimeAggregateProjectionSource;
}

export interface RuntimeConnectorAuthorizationProjection {
  connectorId: string;
  actionId?: string;
  taskId: string;
  taskStatus: PluginTaskRecord["status"];
  startedAt: string;
  finishedAt?: string;
  reason?: string;
  secretBinding: "host_managed";
  tokenExposed: false;
  sessionScoped: true;
  source: "plugin_connector_authorization_task";
  secretDelivery?: ConnectorRuntimeFactsProjection["secretDelivery"];
}

export interface ConnectorRuntimeFactsProjection {
  connectorId: string;
  status: "observed" | "authorized";
  authorizationStatus: "observed" | "authorized";
  source:
    | RuntimeAggregateProjectionSource
    | RuntimeConnectorAuthorizationProjection["source"]
    | "mixed"
    | "host_fixture_connector";
  actionIds?: string[];
  runIds?: string[];
  taskIds?: string[];
  secretBinding: "host_managed";
  tokenExposed: false;
  secretDelivery?: {
    status: "ready";
    binding: "host_managed";
    source: "host_managed_secret_delivery_fact";
    target: "cloud_overlay_worker";
    leaseObserved: true;
    leaseRefExposed: false;
    leaseHandleStatus: "host_managed";
    credentialMaterialExposed: false;
    tokenExposed: false;
  };
}

export type ConnectorSecretDeliveryProjection = NonNullable<
  ConnectorRuntimeFactsProjection["secretDelivery"]
>;

export type ConnectorSecretDeliveryInternalFact =
  ConnectorSecretDeliveryProjection & {
    leaseRef: string;
    expiresAt?: string;
  };

export type ConnectorRuntimeFactsInternalProjection = Omit<
  ConnectorRuntimeFactsProjection,
  "secretDelivery"
> & {
  secretDelivery?: ConnectorSecretDeliveryInternalFact;
};

export interface RuntimeTaskProjection {
  taskId: string;
  traceId: string;
  appId: string;
  entryKey?: string;
  title: string;
  taskKind: string;
  status: PluginTaskRecord["status"];
  startedAt: string;
  finishedAt?: string;
  idempotencyKey: string;
  humanReview: boolean;
  toolCount: number;
  eventCount: number;
  hasResult: boolean;
  runtimeStatus?: string;
  source: "app_server_runtime_projection";
}
