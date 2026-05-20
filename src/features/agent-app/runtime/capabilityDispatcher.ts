import {
  compatibleAgentAppStandardVersions,
  currentAgentAppStandardVersion,
  p0HostCapabilityProfile,
} from "../readiness/hostCapabilityProfile";
import { summarizeRuntimeProfile } from "../runtime-profile";
import type { CapabilityHost, LimeAppSdk } from "../sdk/CapabilityHost";
import {
  LIME_CAPABILITY_DEFINITIONS,
  type LimeCapabilityDefinitionRecord,
  type LimeCapabilityName,
} from "../sdk/capabilityCatalog";
import { resolveOemCloudRuntimeContext } from "@/lib/api/oemCloudRuntime";
import { startOemCloudLogin } from "@/lib/oemCloudLoginLauncher";
import type {
  AgentAppProjection,
  AgentAppRuntimeProcessCost,
  AgentAppRuntimeProcessModel,
  AgentAppRuntimeProcessTimelineItem,
  AgentAppRuntimeProcessUsage,
  AgentAppTaskRecord,
  AgentAppTaskRequest,
  HostCapabilityProfile,
  LimeRuntimeProfile,
} from "../types";
import type { AgentAppHostBridgeCapabilityRequest } from "./hostBridge";

export type AgentAppCapabilityDispatcher = (
  request: AgentAppHostBridgeCapabilityRequest,
) => Promise<unknown>;

export interface CreateAgentAppCapabilityDispatcherOptions {
  host: CapabilityHost;
  projection: AgentAppProjection;
  entryKey: string;
  runId?: string;
  profile?: HostCapabilityProfile;
  runtimeProfile?: LimeRuntimeProfile;
  manifestVersion?: string;
  agentRuntime?: unknown;
  requirements?: unknown;
  boundary?: unknown;
  integrations?: unknown;
  operations?: unknown;
}

export class AgentAppCapabilityDispatcherError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "AgentAppCapabilityDispatcherError";
    this.code = code;
  }
}

const CREATIVE_CAPABILITY_TOOL_KEYS = new Set(
  [
    "creative_capability_search",
    "claw_capability_catalog",
    "agent_runtime_capability_catalog",
  ].map(capabilityMatchToken),
);

const CLAW_CAPABILITY_ALIASES: Array<{
  capabilityId: string;
  aliases: string[];
}> = [
  {
    capabilityId: "lime.capability.image.generate",
    aliases: [
      "lime.capability.image.generate",
      "image.generate",
      "image_generation",
      "image",
      "asset.generate",
    ],
  },
  {
    capabilityId: "lime.capability.cover.generate",
    aliases: [
      "lime.capability.cover.generate",
      "cover.generate",
      "cover_generation",
      "cover",
    ],
  },
  {
    capabilityId: "lime.capability.research.search",
    aliases: [
      "lime.capability.research.search",
      "research.search",
      "research",
      "web_search",
      "search",
    ],
  },
  {
    capabilityId: "lime.capability.report.generate",
    aliases: [
      "lime.capability.report.generate",
      "report.generate",
      "report",
      "competitor_report",
    ],
  },
  {
    capabilityId: "lime.capability.pdf.read",
    aliases: ["lime.capability.pdf.read", "pdf.read", "pdf_extract", "pdf"],
  },
  {
    capabilityId: "lime.capability.summary.generate",
    aliases: [
      "lime.capability.summary.generate",
      "summary.generate",
      "summary",
      "text_summary",
    ],
  },
];

interface CapabilityDiscoveryEntry {
  name: LimeCapabilityName;
  version: string;
  group: LimeCapabilityDefinitionRecord["group"];
  stage: LimeCapabilityDefinitionRecord["stage"];
  owner: LimeCapabilityDefinitionRecord["owner"];
  methods: string[];
  summary: string;
  enabled: boolean;
  implementation: HostCapabilityProfile["capabilities"][string]["implementation"];
  unavailableReason?: "disabled" | "not_implemented" | "planned";
}

type CapabilityProfileSupport = HostCapabilityProfile["capabilities"][string];

interface RuntimeModelProjection {
  taskId: string;
  taskKind: string;
  status: AgentAppTaskRecord["status"];
  startedAt: string;
  finishedAt?: string;
  model: AgentAppRuntimeProcessModel;
  constraints?: RuntimeModelConstraintsProjection;
}

interface RuntimeModelConstraintsProjection {
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
  source: "agent_runtime_model_constraints";
}

interface RuntimeUsageProjection {
  taskId: string;
  taskKind: string;
  status: AgentAppTaskRecord["status"];
  startedAt: string;
  finishedAt?: string;
  usage: AgentAppRuntimeProcessUsage;
  model: AgentAppRuntimeProcessModel;
}

interface RuntimeCostProjection {
  taskId: string;
  taskKind: string;
  status: AgentAppTaskRecord["status"];
  startedAt: string;
  finishedAt?: string;
  cost: AgentAppRuntimeProcessCost;
  model: AgentAppRuntimeProcessModel;
}

interface RuntimeBudgetProjection {
  taskId: string;
  taskKind: string;
  status: AgentAppTaskRecord["status"];
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
  source: "agent_runtime_projection";
}

interface RuntimeSkillProjection {
  skillId: string;
  name: string;
  status: "declared" | "invoked" | "ready_for_manual_enable" | "blocked";
  taskCount: number;
  invocationCount: number;
  taskIds: string[];
  taskKinds: string[];
  lastSeenAt: string;
  source: "agent_runtime_process" | "workspace_skill_binding";
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

interface RuntimeSkillInvocationProjection {
  invocationId: string;
  skillId: string;
  name: string;
  taskId: string;
  taskKind: string;
  status: AgentAppTaskRecord["status"];
  startedAt: string;
  finishedAt?: string;
  source: "agent_runtime_process";
}

interface RuntimeMemoryProjection {
  taskId: string;
  taskKind: string;
  status: AgentAppTaskRecord["status"];
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
  source: "agent_runtime_projection";
}

interface RuntimeMemoryBudgetProjection {
  usedTokens?: number;
  maxTokens?: number;
  status?: string;
  source?: string;
}

interface RuntimeContextProjection {
  taskId: string;
  traceId: string;
  taskKind: string;
  status: AgentAppTaskRecord["status"];
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
  source: "agent_runtime_projection";
}

type ToolIntegrationCapability =
  | "lime.search"
  | "lime.browser"
  | "lime.documents"
  | "lime.media"
  | "lime.mcp"
  | "lime.terminal"
  | "lime.connectors";

interface RuntimeToolRunProjection {
  runId: string;
  capability: ToolIntegrationCapability;
  toolName: string;
  taskId: string;
  taskKind: string;
  status: AgentAppTaskRecord["status"] | "declared" | "observed" | "completed";
  startedAt: string;
  finishedAt?: string;
  title: string;
  statusText: string;
  message: string;
  detail?: string;
  input?: unknown;
  output?: unknown;
  source: "agent_runtime_process" | "agent_runtime_thread_read";
}

interface ToolExecutionPolicyProjection {
  owner: "lime_agent_runtime";
  scope: "agent_app_session";
  approvalRequired: boolean;
  sandboxRequired: boolean;
  mutationExposed: false;
  tokenExposed: false;
  secretBinding?: "host_managed";
  reason: string;
}

interface ToolExecutionRequestEnvelope {
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

const INTERNAL_TOOL_EXECUTION_REQUEST = Symbol(
  "agentAppInternalToolExecutionRequest",
);

type ToolIntentResponse = Record<string, unknown> & {
  [INTERNAL_TOOL_EXECUTION_REQUEST]?: ToolExecutionRequestEnvelope;
};

interface ToolExecutionHandoffProjection {
  status: "accepted" | "not_started";
  owner: "lime_agent_runtime";
  source: "lime.agent.startTask";
  reason?: string;
  taskId?: string;
  traceId?: string;
  taskKind?: string;
  taskStatus?: AgentAppTaskRecord["status"];
}

interface ConnectorAuthorizationPolicyProjection {
  owner: "lime_connector_policy";
  scope: "agent_app_session";
  approvalRequired: true;
  mutationExposed: false;
  tokenExposed: false;
  secretBinding: "host_managed";
  sessionScoped: true;
  reason: string;
}

interface ConnectorAuthorizationRequestEnvelope {
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

interface ConnectorAuthorizationHandoffProjection {
  status: "accepted" | "not_started";
  owner: "lime_connector_policy";
  source: "lime.agent.startTask";
  reason?: string;
  taskId?: string;
  traceId?: string;
  taskKind?: string;
  taskStatus?: AgentAppTaskRecord["status"];
}

type ToolExecutionAgentTaskRequest = AgentAppTaskRequest & {
  requiredCapabilities?: string[];
  capabilityHints?: string[];
  metadata?: Record<string, unknown>;
  sessionId?: string;
};

type ConnectorAuthorizationAgentTaskRequest = AgentAppTaskRequest & {
  requiredCapabilities?: string[];
  capabilityHints?: string[];
  metadata?: Record<string, unknown>;
  sessionId?: string;
  queueIfBusy?: boolean;
};

type RuntimeAggregateProjectionSource =
  | RuntimeToolRunProjection["source"]
  | "mixed";

interface RuntimeMcpToolProjection {
  toolName: string;
  serverId: string;
  toolId: string;
  runIds: string[];
  taskIds: string[];
  lastSeenAt: string;
  source: RuntimeAggregateProjectionSource;
}

interface RuntimeConnectorProjection {
  connectorId: string;
  actionIds: string[];
  runIds: string[];
  taskIds: string[];
  lastSeenAt: string;
  source: RuntimeAggregateProjectionSource;
}

interface RuntimeConnectorAuthorizationProjection {
  connectorId: string;
  actionId?: string;
  taskId: string;
  taskStatus: AgentAppTaskRecord["status"];
  startedAt: string;
  finishedAt?: string;
  reason?: string;
  secretBinding: "host_managed";
  tokenExposed: false;
  sessionScoped: true;
  source: "agent_app_connector_authorization_task";
  secretDelivery?: ConnectorRuntimeFactsProjection["secretDelivery"];
}

interface ConnectorRuntimeFactsProjection {
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

type ConnectorSecretDeliveryProjection = NonNullable<
  ConnectorRuntimeFactsProjection["secretDelivery"]
>;

type ConnectorSecretDeliveryInternalFact = ConnectorSecretDeliveryProjection & {
  leaseRef: string;
  expiresAt?: string;
};

type ConnectorRuntimeFactsInternalProjection = Omit<
  ConnectorRuntimeFactsProjection,
  "secretDelivery"
> & {
  secretDelivery?: ConnectorSecretDeliveryInternalFact;
};

interface RuntimeTaskProjection {
  taskId: string;
  traceId: string;
  appId: string;
  entryKey?: string;
  title: string;
  taskKind: string;
  status: AgentAppTaskRecord["status"];
  startedAt: string;
  finishedAt?: string;
  idempotencyKey: string;
  humanReview: boolean;
  toolCount: number;
  eventCount: number;
  hasResult: boolean;
  runtimeStatus?: string;
  source: "agent_runtime_projection";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readInputRecord(
  request: AgentAppHostBridgeCapabilityRequest,
  method: string,
): Record<string, unknown> {
  if (isRecord(request.input)) {
    return request.input;
  }
  if (isRecord(request.invokeRequest?.args)) {
    return request.invokeRequest.args;
  }
  const firstArg = request.args?.[0];
  if (isRecord(firstArg)) {
    return firstArg;
  }
  throw new AgentAppCapabilityDispatcherError(
    "INVALID_CAPABILITY_INPUT",
    `${request.capability}.${method} requires an input object.`,
  );
}

function readOptionalInputRecord(
  request: AgentAppHostBridgeCapabilityRequest,
): Record<string, unknown> {
  if (isRecord(request.input)) {
    return request.input;
  }
  if (request.input !== undefined) {
    throw new AgentAppCapabilityDispatcherError(
      "INVALID_CAPABILITY_INPUT",
      `${request.capability}.${request.method} requires an input object.`,
    );
  }
  if (isRecord(request.invokeRequest?.args)) {
    return request.invokeRequest.args;
  }
  const firstArg = request.args?.[0];
  if (isRecord(firstArg)) {
    return firstArg;
  }
  return {};
}

function readBooleanOption(
  request: AgentAppHostBridgeCapabilityRequest,
  key: string,
): boolean {
  const input = readOptionalInputRecord(request);
  return input[key] === true;
}

function readStringParam(
  request: AgentAppHostBridgeCapabilityRequest,
  key: string,
  argIndex: number,
): string {
  const fromInput = isRecord(request.input)
    ? readString(request.input[key])
    : undefined;
  const fromInvokeArgs = isRecord(request.invokeRequest?.args)
    ? readString(request.invokeRequest.args[key])
    : undefined;
  const fromArgs = readString(request.args?.[argIndex]);
  const value = fromInput ?? fromInvokeArgs ?? fromArgs;
  if (!value) {
    throw new AgentAppCapabilityDispatcherError(
      "INVALID_CAPABILITY_INPUT",
      `${request.capability}.${request.method} requires ${key}.`,
    );
  }
  return value;
}

function readOptionalStringParam(
  request: AgentAppHostBridgeCapabilityRequest,
  key: string,
  argIndex: number,
): string | undefined {
  const fromInput = isRecord(request.input)
    ? readString(request.input[key])
    : undefined;
  const fromInvokeArgs = isRecord(request.invokeRequest?.args)
    ? readString(request.invokeRequest.args[key])
    : undefined;
  const fromArgs = readString(request.args?.[argIndex]);
  return fromInput ?? fromInvokeArgs ?? fromArgs;
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function capabilityMatchToken(value: string): string {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9]/g, "")
    .toLowerCase();
}

function normalizeStringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean)
    : [];
}

function resolveClawCapabilityId(value: string): string | null {
  const token = capabilityMatchToken(value);
  if (!token) {
    return null;
  }
  const descriptor = CLAW_CAPABILITY_ALIASES.find((item) =>
    item.aliases.some((alias) => capabilityMatchToken(alias) === token),
  );
  return descriptor?.capabilityId ?? null;
}

function collectRequestedClawCapabilityIds(
  input: Record<string, unknown>,
): string[] {
  const requested = [
    ...normalizeStringList(input.requiredCapabilities),
    ...normalizeStringList(input.capabilityHints),
    ...normalizeStringList(input.tools),
  ];
  return Array.from(
    new Set(
      requested
        .map(resolveClawCapabilityId)
        .filter((item): item is string => Boolean(item)),
    ),
  ).sort();
}

function manifestDeclaresClawCapability(
  projection: AgentAppProjection,
  capabilityId: string,
): boolean {
  const descriptor = CLAW_CAPABILITY_ALIASES.find(
    (item) => item.capabilityId === capabilityId,
  );
  if (!descriptor) {
    return false;
  }
  return projection.toolRequirements.some((tool) =>
    toolRequirementDeclaresClawCapability(tool, descriptor),
  );
}

function toolRequirementDeclaresClawCapability(
  tool: AgentAppProjection["toolRequirements"][number],
  descriptor: (typeof CLAW_CAPABILITY_ALIASES)[number],
): boolean {
  const toolKeyToken = capabilityMatchToken(tool.key);
  if (
    descriptor.aliases.some(
      (alias) => capabilityMatchToken(alias) === toolKeyToken,
    )
  ) {
    return true;
  }
  if (!CREATIVE_CAPABILITY_TOOL_KEYS.has(toolKeyToken)) {
    return false;
  }
  return tool.capabilities.some(
    (capability) =>
      resolveClawCapabilityId(capability) === descriptor.capabilityId,
  );
}

function assertAgentTaskClawCapabilitiesDeclared(
  projection: AgentAppProjection,
  input: Record<string, unknown>,
): void {
  const missing = collectRequestedClawCapabilityIds(input).filter(
    (capabilityId) => !manifestDeclaresClawCapability(projection, capabilityId),
  );
  if (!missing.length) {
    return;
  }
  throw new AgentAppCapabilityDispatcherError(
    "CAPABILITY_NOT_DECLARED",
    `Agent task requested Claw capabilities not declared by manifest: ${missing.join(", ")}.`,
  );
}

function assertStorageWriteDeclared(projection: AgentAppProjection): void {
  if (projection.storage) {
    return;
  }
  throw new AgentAppCapabilityDispatcherError(
    "WRITEBACK_NOT_DECLARED",
    "lime.storage write-back requires a declared storage namespace.",
  );
}

function isCapabilityDeclared(
  projection: AgentAppProjection,
  capability: string,
  entryKey?: string,
): boolean {
  if (
    projection.requiredCapabilities.some(
      (requirement) => requirement.capability === capability,
    )
  ) {
    return true;
  }
  const entry = projection.entries.find((item) => item.key === entryKey);
  return (
    entry?.requiredCapabilities.some(
      (requirement) => requirement.capability === capability,
    ) ?? false
  );
}

function assertCapabilityDeclared(
  projection: AgentAppProjection,
  request: AgentAppHostBridgeCapabilityRequest,
  fallbackEntryKey: string,
): void {
  const entryKey = request.entryKey ?? fallbackEntryKey;
  if (isCapabilityDeclared(projection, request.capability, entryKey)) {
    return;
  }
  throw new AgentAppCapabilityDispatcherError(
    "CAPABILITY_NOT_DECLARED",
    `${request.capability} is not declared by Agent App manifest.`,
  );
}

function assertArtifactKindDeclared(
  projection: AgentAppProjection,
  kind: string,
): void {
  if (projection.artifactTypes.some((artifact) => artifact.key === kind)) {
    return;
  }
  throw new AgentAppCapabilityDispatcherError(
    "WRITEBACK_NOT_DECLARED",
    `Artifact kind ${kind} is not declared by this Agent App manifest.`,
  );
}

function assertEvidenceKindDeclared(
  projection: AgentAppProjection,
  kind: string,
): void {
  if (projection.evals.some((evalRule) => evalRule.key === kind)) {
    return;
  }
  throw new AgentAppCapabilityDispatcherError(
    "WRITEBACK_NOT_DECLARED",
    `Evidence kind ${kind} is not declared by this Agent App manifest.`,
  );
}

function resolveRunId(
  request: AgentAppHostBridgeCapabilityRequest,
  fallback?: string,
): string | undefined {
  return (
    fallback ??
    (isRecord(request.rawPayload)
      ? readString(request.rawPayload.runId)
      : undefined) ??
    (request.requestId ? `bridge:${request.requestId}` : undefined)
  );
}

async function dispatchStorage(
  sdk: LimeAppSdk,
  request: AgentAppHostBridgeCapabilityRequest,
  projection: AgentAppProjection,
): Promise<unknown> {
  if (request.method === "get") {
    return sdk.storage.get(readStringParam(request, "key", 0));
  }
  if (request.method === "set") {
    assertStorageWriteDeclared(projection);
    const input = readInputRecord(request, "set");
    if (!hasOwn(input, "value")) {
      throw new AgentAppCapabilityDispatcherError(
        "INVALID_CAPABILITY_INPUT",
        "lime.storage.set requires value.",
      );
    }
    return sdk.storage.set(readStringParam(request, "key", 0), input.value);
  }
  if (request.method === "list") {
    return sdk.storage.list();
  }
  if (request.method === "delete") {
    assertStorageWriteDeclared(projection);
    return sdk.storage.delete(readStringParam(request, "key", 0));
  }
  throwUnsupportedMethod(request);
}

async function dispatchArtifacts(
  sdk: LimeAppSdk,
  request: AgentAppHostBridgeCapabilityRequest,
  projection: AgentAppProjection,
): Promise<unknown> {
  if (request.method === "create") {
    const input = readInputRecord(request, "create");
    const kind = readString(input.kind);
    if (!kind) {
      throw new AgentAppCapabilityDispatcherError(
        "INVALID_CAPABILITY_INPUT",
        "lime.artifacts.create requires kind.",
      );
    }
    assertArtifactKindDeclared(projection, kind);
    return sdk.artifacts.create({
      ...(input as { kind: string; title: string; content: unknown }),
      kind,
    });
  }
  if (request.method === "list") {
    return sdk.artifacts.list();
  }
  throwUnsupportedMethod(request);
}

async function dispatchEvidence(
  sdk: LimeAppSdk,
  request: AgentAppHostBridgeCapabilityRequest,
  projection: AgentAppProjection,
): Promise<unknown> {
  if (request.method === "record") {
    const input = readInputRecord(request, "record");
    const kind = readString(input.kind);
    if (!kind) {
      throw new AgentAppCapabilityDispatcherError(
        "INVALID_CAPABILITY_INPUT",
        "lime.evidence.record requires kind.",
      );
    }
    assertEvidenceKindDeclared(projection, kind);
    return sdk.evidence.record({
      ...(input as { kind: string; message: string; refs?: string[] }),
      kind,
    });
  }
  if (request.method === "list") {
    return sdk.evidence.list();
  }
  throwUnsupportedMethod(request);
}

async function dispatchKnowledge(
  sdk: LimeAppSdk,
  request: AgentAppHostBridgeCapabilityRequest,
): Promise<unknown> {
  if (request.method === "search") {
    return sdk.knowledge.search(
      readInputRecord(request, "search") as {
        query: string;
        limit?: number;
      },
    );
  }
  throwUnsupportedMethod(request);
}

async function dispatchAgent(
  sdk: LimeAppSdk,
  request: AgentAppHostBridgeCapabilityRequest,
  projection: AgentAppProjection,
): Promise<unknown> {
  if (request.method === "startTask") {
    const input = readInputRecord(request, "startTask");
    assertAgentTaskClawCapabilitiesDeclared(projection, input);
    return sdk.agent.startTask(input as unknown as AgentAppTaskRequest);
  }
  if (request.method === "streamTask") {
    const input = readOptionalInputRecord(request);
    const taskId = readStringParam(request, "taskId", 0);
    const sessionId = readString(input.sessionId);
    return sdk.agent.streamTask(sessionId ? { ...input, taskId, sessionId } : taskId);
  }
  if (request.method === "getTask") {
    const input = readOptionalInputRecord(request);
    const taskId = readStringParam(request, "taskId", 0);
    const sessionId = readString(input.sessionId);
    return sdk.agent.getTask(sessionId ? { ...input, taskId, sessionId } : taskId);
  }
  if (request.method === "cancelTask") {
    const input = readOptionalInputRecord(request);
    const taskId = readStringParam(request, "taskId", 0);
    const sessionId = readString(input.sessionId);
    return sdk.agent.cancelTask(sessionId ? { ...input, taskId, sessionId } : taskId);
  }
  if (request.method === "retryTask") {
    const input = readOptionalInputRecord(request);
    const taskId = readStringParam(request, "taskId", 0);
    const sessionId = readString(input.sessionId);
    return sdk.agent.retryTask(sessionId ? { ...input, taskId, sessionId } : taskId);
  }
  if (
    request.method === "submitHostResponse" ||
    request.method === "respondAction"
  ) {
    return sdk.agent.submitHostResponse(
      readInputRecord(request, request.method) as unknown as Parameters<
        typeof sdk.agent.submitHostResponse
      >[0],
    );
  }
  if (request.method === "listTasks") {
    return sdk.agent.listTasks();
  }
  throwUnsupportedMethod(request);
}

function throwUnsupportedMethod(
  request: AgentAppHostBridgeCapabilityRequest,
): never {
  throw new AgentAppCapabilityDispatcherError(
    "UNSUPPORTED_CAPABILITY_METHOD",
    `${request.capability}.${request.method} is not supported by Agent App Host Bridge.`,
  );
}

function resolveCapabilityDefinition(
  name: string,
): LimeCapabilityDefinitionRecord {
  const definition = LIME_CAPABILITY_DEFINITIONS.find(
    (item) => item.name === name,
  );
  if (!definition) {
    throw new AgentAppCapabilityDispatcherError(
      "CAPABILITY_NOT_FOUND",
      `${name} is not a known Lime capability.`,
    );
  }
  return definition;
}

function buildCapabilityDiscoveryEntry(
  definition: LimeCapabilityDefinitionRecord,
  profile: HostCapabilityProfile,
  runtimeProfile?: LimeRuntimeProfile,
): CapabilityDiscoveryEntry {
  const support = resolveCapabilityProfileSupport(definition, profile);
  const runtimeSupport = runtimeProfile?.capabilities[definition.name];
  const implementation = support?.implementation ?? "none";
  const effectiveImplementation = runtimeSupport?.implementation ?? implementation;
  const enabled = runtimeSupport
    ? runtimeSupport.available === true && effectiveImplementation !== "none"
    : support?.enabled === true && effectiveImplementation !== "none";
  const unavailableReason = enabled
    ? undefined
    : String(definition.stage) === "planned"
      ? "planned"
      : effectiveImplementation === "none"
        ? "not_implemented"
        : "disabled";

  const entry: CapabilityDiscoveryEntry = {
    name: definition.name,
    version: runtimeSupport?.version ?? support?.version ?? definition.version,
    group: definition.group,
    stage: definition.stage,
    owner: definition.owner,
    methods: [...definition.methods],
    summary: definition.summary,
    enabled,
    implementation: effectiveImplementation,
  };
  return unavailableReason ? { ...entry, unavailableReason } : entry;
}

function resolveCapabilityProfileSupport(
  definition: LimeCapabilityDefinitionRecord,
  profile: HostCapabilityProfile,
): CapabilityProfileSupport | undefined {
  const support = profile.capabilities[definition.name];
  if (definition.name !== "lime.capabilities") {
    return support;
  }
  return {
    version: support?.version ?? definition.version,
    enabled: true,
    implementation: "native",
  };
}

function readAgentRuntimeTaskContract(
  agentRuntime: unknown,
): Record<string, unknown> {
  if (!isRecord(agentRuntime)) {
    return {};
  }
  const task = isRecord(agentRuntime.agentTask)
    ? agentRuntime.agentTask
    : isRecord(agentRuntime.agent_task)
      ? agentRuntime.agent_task
      : isRecord(agentRuntime.task)
        ? agentRuntime.task
        : {};
  return {
    eventSchema: readString(task.eventSchema),
    resultSchema: readString(task.resultSchema),
    structuredOutput:
      isRecord(task.structuredOutput) ||
      isRecord(agentRuntime.structuredOutput),
    approval: isRecord(task.approval) || isRecord(agentRuntime.approval),
    sessionPolicy:
      isRecord(task.sessionPolicy) || isRecord(agentRuntime.sessionPolicy),
    toolDiscovery:
      isRecord(task.toolDiscovery) || isRecord(agentRuntime.toolDiscovery),
    checkpointScope:
      isRecord(task.checkpointScope) || isRecord(agentRuntime.checkpointScope),
    observability:
      isRecord(task.observability) || isRecord(agentRuntime.observability),
  };
}

function countLayerItems(value: unknown, itemKey: string): number {
  if (Array.isArray(value)) {
    return value.length;
  }
  if (!isRecord(value)) {
    return 0;
  }
  const items = value[itemKey];
  return Array.isArray(items) ? items.length : 0;
}

function hasLayerValue(value: unknown, itemKey: string): boolean {
  if (countLayerItems(value, itemKey) > 0) {
    return true;
  }
  return isRecord(value) && Object.keys(value).length > 0;
}

function isManifestStandardVersion(
  manifestVersion: string | undefined,
  standardVersion: string,
): boolean {
  return (
    manifestVersion === standardVersion ||
    Boolean(manifestVersion?.startsWith(`${standardVersion}.`))
  );
}

function readCapabilityHandoffContract(params: {
  manifestVersion?: string;
  requirements?: unknown;
  boundary?: unknown;
  integrations?: unknown;
  operations?: unknown;
}): Record<string, unknown> {
  const requirementCount = countLayerItems(params.requirements, "requirements");
  const boundaryCount = countLayerItems(params.boundary, "boundaries");
  const integrationCount = countLayerItems(params.integrations, "integrations");
  const operationCount = countLayerItems(params.operations, "operations");
  const hasCapabilityHandoff =
    isManifestStandardVersion(params.manifestVersion, "0.7") ||
    hasLayerValue(params.requirements, "requirements") ||
    hasLayerValue(params.boundary, "boundaries") ||
    hasLayerValue(params.integrations, "integrations") ||
    hasLayerValue(params.operations, "operations");

  return {
    version: "0.7",
    enabled: hasCapabilityHandoff,
    manifestVersion: params.manifestVersion,
    layerFiles: [
      "app.requirements.yaml",
      "app.boundary.yaml",
      "app.integrations.yaml",
      "app.operations.yaml",
    ],
    requirementCount,
    boundaryCount,
    integrationCount,
    operationCount,
    hostCloudManagedExecution: true,
    externalSideEffectsRequireApproval: true,
    appCredentialsBoundary: "host_or_cloud_managed",
  };
}

function buildAgentAppStandardProfile(params: {
  manifestVersion?: string;
  agentRuntime?: unknown;
  requirements?: unknown;
  boundary?: unknown;
  integrations?: unknown;
  operations?: unknown;
}): Record<string, unknown> {
  const hasAgentRuntime = isRecord(params.agentRuntime);
  return {
    layeredManifest: {
      version: "0.5",
      enabled: true,
      layerFiles: [
        "app.capabilities.yaml",
        "app.entries.yaml",
        "app.permissions.yaml",
        "app.errors.yaml",
        "app.i18n.yaml",
        "app.signature.yaml",
        "evals/readiness.yaml",
        "evals/health.yaml",
      ],
    },
    agentRuntime: {
      version: "0.6",
      enabled: hasAgentRuntime,
      manifestVersion: params.manifestVersion,
      layerFiles: ["app.runtime.yaml"],
      ...readAgentRuntimeTaskContract(params.agentRuntime),
    },
    requirementBoundary: readCapabilityHandoffContract(params),
  };
}

function buildCloudSessionSnapshot() {
  const runtime = resolveOemCloudRuntimeContext();
  if (!runtime) {
    return {
      hasSession: false,
    };
  }
  return {
    controlPlaneBaseUrl: runtime.controlPlaneBaseUrl,
    tenantId: runtime.tenantId,
    hasSession: Boolean(runtime.sessionToken),
  };
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const payload = token.split(".")[1];
  if (!payload) {
    return null;
  }

  try {
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(
      base64.length + ((4 - (base64.length % 4)) % 4),
      "=",
    );
    const decoded = atob(padded);
    const parsed = JSON.parse(decoded);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isExpiredJwt(token: string, nowMs = Date.now()): boolean {
  const payload = decodeJwtPayload(token);
  const exp = payload?.exp;
  if (typeof exp !== "number") {
    return false;
  }

  return exp * 1000 <= nowMs + 60_000;
}

async function dispatchCloudSession(
  request: AgentAppHostBridgeCapabilityRequest,
): Promise<unknown> {
  if (request.method === "getSnapshot") {
    return buildCloudSessionSnapshot();
  }
  if (request.method === "getAccessToken") {
    const runtime = resolveOemCloudRuntimeContext();
    if (
      !runtime?.sessionToken ||
      !runtime.tenantId ||
      isExpiredJwt(runtime.sessionToken)
    ) {
      throw new AgentAppCapabilityDispatcherError(
        "SESSION_REQUIRED",
        "Host cloud session is not available.",
      );
    }
    return {
      accessToken: runtime.sessionToken,
      tenantId: runtime.tenantId,
      controlPlaneBaseUrl: runtime.controlPlaneBaseUrl,
    };
  }
  if (request.method === "requestLogin") {
    const runtime = resolveOemCloudRuntimeContext();
    if (!runtime) {
      throw new AgentAppCapabilityDispatcherError(
        "LOGIN_UNAVAILABLE",
        "Host cloud login is not configured.",
      );
    }
    const force = readBooleanOption(request, "force");
    if (
      force ||
      !runtime.sessionToken ||
      isExpiredJwt(runtime.sessionToken)
    ) {
      await startOemCloudLogin(runtime, { waitForCompletion: true });
    }
    return buildCloudSessionSnapshot();
  }
  throwUnsupportedMethod(request);
}

function dispatchCapabilities(
  request: AgentAppHostBridgeCapabilityRequest,
  profile: HostCapabilityProfile,
  runtimeProfile: LimeRuntimeProfile | undefined,
  standardProfile: {
    manifestVersion?: string;
    agentRuntime?: unknown;
    requirements?: unknown;
    boundary?: unknown;
    integrations?: unknown;
    operations?: unknown;
  } = {},
): unknown {
  if (request.method === "list") {
    return LIME_CAPABILITY_DEFINITIONS.map((definition) =>
      buildCapabilityDiscoveryEntry(definition, profile, runtimeProfile),
    );
  }
  if (request.method === "get") {
    const capability = readStringParam(request, "capability", 0);
    return buildCapabilityDiscoveryEntry(
      resolveCapabilityDefinition(capability),
      profile,
      runtimeProfile,
    );
  }
  if (request.method === "getProfile") {
    const agentRuntime = standardProfile.agentRuntime ?? profile.agentRuntime;
    const payload: Record<string, unknown> = {
      appRuntimeVersion: profile.appRuntimeVersion,
      standardVersions: profile.standardVersions ?? {
        current: currentAgentAppStandardVersion,
        compatible: [...compatibleAgentAppStandardVersions],
      },
      runtimeTargets: [...profile.runtimeTargets],
      capabilities: Object.fromEntries(
        LIME_CAPABILITY_DEFINITIONS.map((definition) => [
          definition.name,
          buildCapabilityDiscoveryEntry(definition, profile, runtimeProfile),
        ]),
      ),
      standards: buildAgentAppStandardProfile({
        manifestVersion: standardProfile.manifestVersion,
        agentRuntime,
        requirements: standardProfile.requirements,
        boundary: standardProfile.boundary,
        integrations: standardProfile.integrations,
        operations: standardProfile.operations,
      }),
      featureFlags: { ...profile.featureFlags },
    };
    if (agentRuntime !== undefined) {
      payload.agentRuntime = agentRuntime;
    }
    if (runtimeProfile) {
      payload.runtimeProfile = summarizeRuntimeProfile(runtimeProfile);
      payload.runtimeCapabilities = runtimeProfile.capabilities;
    }
    if (standardProfile.requirements !== undefined) {
      payload.requirements = standardProfile.requirements;
    }
    if (standardProfile.boundary !== undefined) {
      payload.boundary = standardProfile.boundary;
    }
    if (standardProfile.integrations !== undefined) {
      payload.integrations = standardProfile.integrations;
    }
    if (standardProfile.operations !== undefined) {
      payload.operations = standardProfile.operations;
    }
    return payload;
  }
  throwUnsupportedMethod(request);
}

function readTaskRuntimeProcess(task: AgentAppTaskRecord) {
  return task.runtimeProcess ?? task.process ?? null;
}

function hasRoutedModel(
  model: AgentAppRuntimeProcessModel | null | undefined,
): model is AgentAppRuntimeProcessModel {
  if (!model) {
    return false;
  }
  return Boolean(model.provider || model.model);
}

function numberValue(value: unknown): number | undefined {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function integerValue(value: unknown): number {
  const number = numberValue(value);
  return number === undefined ? 0 : Math.max(0, Math.floor(number));
}

function recordString(
  record: Record<string, unknown> | null | undefined,
  key: string,
): string | undefined {
  return record ? readString(record[key]) : undefined;
}

function recordArray(
  record: Record<string, unknown> | null | undefined,
  key: string,
): unknown[] {
  const value = record?.[key];
  return Array.isArray(value) ? value : [];
}

function recordValueByKeys(
  record: Record<string, unknown> | null | undefined,
  keys: string[],
): unknown {
  if (!record) {
    return undefined;
  }
  for (const key of keys) {
    if (record[key] !== undefined) {
      return record[key];
    }
  }
  return undefined;
}

function recordObjectByKeys(
  record: Record<string, unknown> | null | undefined,
  keys: string[],
): Record<string, unknown> | null {
  const value = recordValueByKeys(record, keys);
  return isRecord(value) ? value : null;
}

function recordStringByKeys(
  record: Record<string, unknown> | null | undefined,
  keys: string[],
): string | undefined {
  return readString(recordValueByKeys(record, keys));
}

function recordNumberByKeys(
  record: Record<string, unknown> | null | undefined,
  keys: string[],
): number | undefined {
  return numberValue(recordValueByKeys(record, keys));
}

function recordBooleanByKeys(
  record: Record<string, unknown> | null | undefined,
  keys: string[],
): boolean | undefined {
  const value = recordValueByKeys(record, keys);
  return typeof value === "boolean" ? value : undefined;
}

function recordStringArrayByKeys(
  record: Record<string, unknown> | null | undefined,
  keys: string[],
): string[] {
  const value = recordValueByKeys(record, keys);
  return Array.isArray(value)
    ? value.map(readString).filter((item): item is string => Boolean(item))
    : [];
}

function recordArrayByKeys(
  record: Record<string, unknown> | null | undefined,
  keys: string[],
): unknown[] {
  const value = recordValueByKeys(record, keys);
  return Array.isArray(value) ? value : [];
}

function sortTasksByNewest(tasks: AgentAppTaskRecord[]): AgentAppTaskRecord[] {
  return [...tasks].sort((left, right) =>
    String(right.finishedAt ?? right.startedAt).localeCompare(
      String(left.finishedAt ?? left.startedAt),
    ),
  );
}

function filterRuntimeProjectionTasks(
  host: CapabilityHost,
  request: AgentAppHostBridgeCapabilityRequest,
): AgentAppTaskRecord[] {
  const input = readOptionalInputRecord(request);
  const taskId =
    readString(input.taskId) ?? readOptionalStringParam(request, "taskId", 0);
  const taskKind = readString(input.taskKind);
  return sortTasksByNewest(
    host
      .getTasks({
        appId: request.appId,
        entryKey: request.entryKey,
      })
      .filter((task) => !taskId || task.taskId === taskId)
      .filter((task) => !taskKind || task.taskKind === taskKind),
  );
}

function buildRuntimeTaskProjection(
  task: AgentAppTaskRecord,
): RuntimeTaskProjection {
  const threadRead = readTaskThreadRead(task);
  return {
    taskId: task.taskId,
    traceId: task.traceId,
    appId: task.appId,
    entryKey: task.entryKey,
    title: task.title,
    taskKind: task.taskKind,
    status: task.status,
    startedAt: task.startedAt,
    finishedAt: task.finishedAt,
    idempotencyKey: task.idempotencyKey,
    humanReview: task.humanReview,
    toolCount: task.tools.length,
    eventCount: task.events.length + task.trace.length,
    hasResult: task.result !== undefined,
    runtimeStatus: recordStringByKeys(threadRead, ["status", "profile_status"]),
    source: "agent_runtime_projection",
  };
}

function buildModelProjection(
  task: AgentAppTaskRecord,
): RuntimeModelProjection | null {
  const process = readTaskRuntimeProcess(task);
  if (!hasRoutedModel(process?.model)) {
    return null;
  }
  return {
    taskId: task.taskId,
    taskKind: task.taskKind,
    status: task.status,
    startedAt: task.startedAt,
    finishedAt: task.finishedAt,
    model: process.model,
    constraints: buildRuntimeModelConstraints(task),
  };
}

function buildRuntimeModelConstraints(
  task: AgentAppTaskRecord,
): RuntimeModelConstraintsProjection | undefined {
  const threadRead = readTaskThreadRead(task);
  const routing = recordObjectByKeys(threadRead, [
    "modelRouting",
    "model_routing",
    "routingDecision",
    "routing_decision",
  ]);
  const limitState = recordObjectByKeys(threadRead, [
    "limitState",
    "limit_state",
  ]);
  const costState = recordObjectByKeys(threadRead, ["costState", "cost_state"]);
  if (!routing && !limitState && !costState) {
    return undefined;
  }
  return {
    selectedProvider: recordStringByKeys(routing, [
      "selectedProvider",
      "selected_provider",
    ]),
    selectedModel: recordStringByKeys(routing, [
      "selectedModel",
      "selected_model",
    ]),
    requestedModel: recordStringByKeys(routing, [
      "requestedModel",
      "requested_model",
    ]),
    routingMode: recordStringByKeys(routing, ["routingMode", "routing_mode"]),
    decisionSource: recordStringByKeys(routing, [
      "decisionSource",
      "decision_source",
    ]),
    decisionReason: recordStringByKeys(routing, [
      "decisionReason",
      "decision_reason",
    ]),
    candidateCount:
      recordNumberByKeys(routing, ["candidateCount", "candidate_count"]) ??
      recordNumberByKeys(limitState, ["candidateCount", "candidate_count"]),
    fallbackChain: recordStringArrayByKeys(routing, [
      "fallbackChain",
      "fallback_chain",
    ]),
    capabilityGap:
      recordStringByKeys(routing, ["capabilityGap", "capability_gap"]) ??
      recordStringByKeys(limitState, ["capabilityGap", "capability_gap"]),
    estimatedCostClass:
      recordStringByKeys(routing, [
        "estimatedCostClass",
        "estimated_cost_class",
      ]) ??
      recordStringByKeys(costState, [
        "estimatedCostClass",
        "estimated_cost_class",
      ]),
    limitStatus: recordStringByKeys(limitState, ["status"]),
    costStatus: recordStringByKeys(costState, ["status"]),
    singleCandidateOnly: recordBooleanByKeys(limitState, [
      "singleCandidateOnly",
      "single_candidate_only",
    ]),
    providerLocked: recordBooleanByKeys(limitState, [
      "providerLocked",
      "provider_locked",
    ]),
    settingsLocked: recordBooleanByKeys(limitState, [
      "settingsLocked",
      "settings_locked",
    ]),
    oemLocked: recordBooleanByKeys(limitState, ["oemLocked", "oem_locked"]),
    inputPerMillion: recordNumberByKeys(costState, [
      "inputPerMillion",
      "input_per_million",
    ]),
    outputPerMillion: recordNumberByKeys(costState, [
      "outputPerMillion",
      "output_per_million",
    ]),
    cacheReadPerMillion: recordNumberByKeys(costState, [
      "cacheReadPerMillion",
      "cache_read_per_million",
    ]),
    cacheWritePerMillion: recordNumberByKeys(costState, [
      "cacheWritePerMillion",
      "cache_write_per_million",
    ]),
    currency: recordStringByKeys(costState, ["currency"]),
    source: "agent_runtime_model_constraints",
  };
}

function buildUsageProjection(
  task: AgentAppTaskRecord,
): RuntimeUsageProjection | null {
  const process = readTaskRuntimeProcess(task);
  if (!process?.usage) {
    return null;
  }
  return {
    taskId: task.taskId,
    taskKind: task.taskKind,
    status: task.status,
    startedAt: task.startedAt,
    finishedAt: task.finishedAt,
    usage: process.usage,
    model: process.model,
  };
}

function buildCostProjection(
  task: AgentAppTaskRecord,
): RuntimeCostProjection | null {
  const process = readTaskRuntimeProcess(task);
  if (!process?.cost) {
    return null;
  }
  return {
    taskId: task.taskId,
    taskKind: task.taskKind,
    status: task.status,
    startedAt: task.startedAt,
    finishedAt: task.finishedAt,
    cost: process.cost,
    model: process.model,
  };
}

function buildBudgetProjection(
  task: AgentAppTaskRecord,
): RuntimeBudgetProjection | null {
  const threadRead = readTaskThreadRead(task);
  const limitState = recordObjectByKeys(threadRead, [
    "limitState",
    "limit_state",
  ]);
  const costState = recordObjectByKeys(threadRead, ["costState", "cost_state"]);
  if (!limitState && !costState) {
    return null;
  }
  const processCost = readTaskRuntimeProcess(task)?.cost;
  return {
    taskId: task.taskId,
    taskKind: task.taskKind,
    status: task.status,
    startedAt: task.startedAt,
    finishedAt: task.finishedAt,
    scope: "task",
    limitStatus: recordStringByKeys(limitState, ["status"]),
    costStatus: recordStringByKeys(costState, ["status"]),
    estimatedCostClass:
      recordStringByKeys(costState, [
        "estimatedCostClass",
        "estimated_cost_class",
      ]) ?? processCost?.estimatedCostClass,
    estimatedTotalCost:
      recordNumberByKeys(costState, [
        "estimatedTotalCost",
        "estimated_total_cost",
      ]) ?? processCost?.estimatedTotalCost,
    currency:
      recordStringByKeys(costState, ["currency"]) ?? processCost?.currency,
    candidateCount: recordNumberByKeys(limitState, [
      "candidateCount",
      "candidate_count",
    ]),
    singleCandidateOnly: recordBooleanByKeys(limitState, [
      "singleCandidateOnly",
      "single_candidate_only",
    ]),
    providerLocked: recordBooleanByKeys(limitState, [
      "providerLocked",
      "provider_locked",
    ]),
    settingsLocked: recordBooleanByKeys(limitState, [
      "settingsLocked",
      "settings_locked",
    ]),
    oemLocked: recordBooleanByKeys(limitState, ["oemLocked", "oem_locked"]),
    capabilityGap: recordStringByKeys(limitState, [
      "capabilityGap",
      "capability_gap",
    ]),
    notes: recordStringArrayByKeys(limitState, ["notes"]),
    limitState: limitState ?? undefined,
    costState: costState ?? undefined,
    source: "agent_runtime_projection",
  };
}

function aggregateUsage(
  items: RuntimeUsageProjection[],
): AgentAppRuntimeProcessUsage {
  return items.reduce<AgentAppRuntimeProcessUsage>(
    (total, item) => ({
      inputTokens:
        total.inputTokens +
        (numberValue(item.usage.inputTokens ?? item.usage.input_tokens) ?? 0),
      outputTokens:
        total.outputTokens +
        (numberValue(item.usage.outputTokens ?? item.usage.output_tokens) ?? 0),
      totalTokens:
        total.totalTokens +
        (numberValue(item.usage.totalTokens ?? item.usage.total_tokens) ?? 0),
      cachedInputTokens:
        (total.cachedInputTokens ?? 0) +
        (numberValue(
          item.usage.cachedInputTokens ?? item.usage.cached_input_tokens,
        ) ?? 0),
      cacheCreationInputTokens:
        (total.cacheCreationInputTokens ?? 0) +
        (numberValue(
          item.usage.cacheCreationInputTokens ??
            item.usage.cache_creation_input_tokens,
        ) ?? 0),
    }),
    {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      cachedInputTokens: 0,
      cacheCreationInputTokens: 0,
    },
  );
}

function aggregateCost(items: RuntimeCostProjection[]) {
  const costs = items
    .map((item) =>
      numberValue(
        item.cost.estimatedTotalCost ??
          item.cost.estimated_total_cost ??
          item.cost.totalCost ??
          item.cost.total_cost,
      ),
    )
    .filter((value): value is number => value !== undefined);
  return {
    estimatedTotalCost: costs.reduce((total, value) => total + value, 0),
    currency: readString(items[0]?.cost.currency) ?? "unknown",
  };
}

function uniqueModelSummaries(items: RuntimeModelProjection[]) {
  const summaries = new Map<
    string,
    AgentAppRuntimeProcessModel & {
      taskCount: number;
      taskKinds: string[];
      lastTaskId: string;
      lastSeenAt: string;
      constraints?: RuntimeModelConstraintsProjection;
    }
  >();
  items.forEach((item) => {
    const key = `${item.model.provider}\u0000${item.model.model}\u0000${item.model.label}`;
    const existing = summaries.get(key);
    if (existing) {
      existing.taskCount += 1;
      existing.taskKinds = Array.from(
        new Set([...existing.taskKinds, item.taskKind]),
      ).sort();
      if (String(item.finishedAt ?? item.startedAt) > existing.lastSeenAt) {
        existing.lastTaskId = item.taskId;
        existing.lastSeenAt = String(item.finishedAt ?? item.startedAt);
        existing.constraints = item.constraints ?? existing.constraints;
      }
      return;
    }
    summaries.set(key, {
      ...item.model,
      taskCount: 1,
      taskKinds: [item.taskKind],
      lastTaskId: item.taskId,
      lastSeenAt: String(item.finishedAt ?? item.startedAt),
      constraints: item.constraints,
    });
  });
  return Array.from(summaries.values()).sort((left, right) =>
    right.lastSeenAt.localeCompare(left.lastSeenAt),
  );
}

function normalizeSkillName(value: string): string {
  return value.trim();
}

function buildRuntimeSkillProjection(
  tasks: AgentAppTaskRecord[],
): RuntimeSkillProjection[] {
  const summaries = new Map<string, RuntimeSkillProjection>();
  tasks.forEach((task) => {
    const process = readTaskRuntimeProcess(task);
    const declared = new Set(
      (process?.skillNames ?? []).map(normalizeSkillName).filter(Boolean),
    );
    const invoked = new Set(
      (process?.invokedSkillNames ?? [])
        .map(normalizeSkillName)
        .filter(Boolean),
    );
    new Set([...declared, ...invoked]).forEach((name) => {
      const existing = summaries.get(name);
      const lastSeenAt = String(task.finishedAt ?? task.startedAt);
      const status = invoked.has(name) ? "invoked" : "declared";
      if (existing) {
        existing.taskCount += 1;
        existing.invocationCount += invoked.has(name) ? 1 : 0;
        existing.status =
          existing.status === "invoked" || status === "invoked"
            ? "invoked"
            : "declared";
        existing.taskIds = Array.from(
          new Set([...existing.taskIds, task.taskId]),
        );
        existing.taskKinds = Array.from(
          new Set([...existing.taskKinds, task.taskKind]),
        ).sort();
        if (lastSeenAt > existing.lastSeenAt) {
          existing.lastSeenAt = lastSeenAt;
        }
        return;
      }
      summaries.set(name, {
        skillId: name,
        name,
        status,
        taskCount: 1,
        invocationCount: invoked.has(name) ? 1 : 0,
        taskIds: [task.taskId],
        taskKinds: [task.taskKind],
        lastSeenAt,
        source: "agent_runtime_process",
      });
    });
    collectWorkspaceSkillBindingRecords(task).forEach((binding) => {
      const directory = recordStringByKeys(binding, ["directory"]);
      const name =
        recordStringByKeys(binding, ["name"]) ??
        recordStringByKeys(binding, ["key"]) ??
        directory;
      if (!name) {
        return;
      }
      const skillId = recordStringByKeys(binding, ["key"]) ?? name;
      const lastSeenAt = String(task.finishedAt ?? task.startedAt);
      const bindingStatus =
        recordStringByKeys(binding, ["binding_status", "bindingStatus"]) ??
        "ready_for_manual_enable";
      const status =
        bindingStatus === "blocked" ? "blocked" : "ready_for_manual_enable";
      const existing = summaries.get(skillId);
      if (existing) {
        existing.taskIds = Array.from(
          new Set([...existing.taskIds, task.taskId]),
        );
        existing.taskKinds = Array.from(
          new Set([...existing.taskKinds, task.taskKind]),
        ).sort();
        existing.taskCount = existing.taskIds.length;
        if (lastSeenAt > existing.lastSeenAt) {
          existing.lastSeenAt = lastSeenAt;
        }
        return;
      }
      summaries.set(skillId, {
        skillId,
        name,
        status,
        taskCount: 1,
        invocationCount: 0,
        taskIds: [task.taskId],
        taskKinds: [task.taskKind],
        lastSeenAt,
        source: "workspace_skill_binding",
        description: recordStringByKeys(binding, ["description"]),
        directory,
        bindingStatus,
        nextGate: recordStringByKeys(binding, ["next_gate", "nextGate"]),
        runtimeGate: recordStringByKeys(binding, [
          "runtime_gate",
          "runtimeGate",
        ]),
        queryLoopVisible: recordBooleanByKeys(binding, [
          "query_loop_visible",
          "queryLoopVisible",
        ]),
        toolRuntimeVisible: recordBooleanByKeys(binding, [
          "tool_runtime_visible",
          "toolRuntimeVisible",
        ]),
        launchEnabled: recordBooleanByKeys(binding, [
          "launch_enabled",
          "launchEnabled",
        ]),
        permissionSummary: recordStringArrayByKeys(binding, [
          "permission_summary",
          "permissionSummary",
        ]),
      });
    });
  });
  return Array.from(summaries.values()).sort((left, right) =>
    right.lastSeenAt.localeCompare(left.lastSeenAt),
  );
}

function collectWorkspaceSkillBindingRecords(
  task: AgentAppTaskRecord,
): Record<string, unknown>[] {
  const threadRead = readTaskThreadRead(task);
  const candidates = [
    threadRead,
    recordObjectByKeys(threadRead, ["request_metadata", "requestMetadata"]),
    ...recordArray(threadRead, "turns")
      .filter(isRecord)
      .flatMap((turn) => [
        turn,
        recordObjectByKeys(turn, ["request_metadata", "requestMetadata"]),
      ]),
  ];
  return candidates.flatMap((candidate) => {
    const container = recordObjectByKeys(candidate, [
      "workspace_skill_bindings",
      "workspaceSkillBindings",
    ]);
    return recordArray(container, "bindings").filter(isRecord);
  });
}

function buildRuntimeSkillInvocations(
  tasks: AgentAppTaskRecord[],
): RuntimeSkillInvocationProjection[] {
  return tasks.flatMap((task) => {
    const process = readTaskRuntimeProcess(task);
    return (process?.invokedSkillNames ?? [])
      .map(normalizeSkillName)
      .filter(Boolean)
      .map((name) => ({
        invocationId: `${task.taskId}:${name}`,
        skillId: name,
        name,
        taskId: task.taskId,
        taskKind: task.taskKind,
        status: task.status,
        startedAt: task.startedAt,
        finishedAt: task.finishedAt,
        source: "agent_runtime_process" as const,
      }));
  });
}

const TOOL_INTEGRATION_SPECS: Record<
  ToolIntegrationCapability,
  {
    keywords: string[];
    toolHints: string[];
    reason: string;
  }
> = {
  "lime.search": {
    keywords: ["search", "websearch", "research", "deepresearch", "citation"],
    toolHints: ["lime.capability.research.search", "web_search"],
    reason: "search_execution_requires_lime_agent_task",
  },
  "lime.browser": {
    keywords: [
      "browser",
      "chrome",
      "webpage",
      "readpage",
      "screenshot",
      "navigate",
    ],
    toolHints: ["browser", "read_page", "screenshot"],
    reason: "browser_runtime_execution_requires_lime_tool_runtime_policy",
  },
  "lime.documents": {
    keywords: ["document", "pdf", "docx", "word", "markdown", "ppt", "pptx"],
    toolHints: ["document_parser", "pdf.read"],
    reason: "document_runtime_execution_requires_lime_tool_runtime_policy",
  },
  "lime.media": {
    keywords: [
      "media",
      "image",
      "audio",
      "voice",
      "video",
      "transcribe",
      "synthesize",
      "tts",
    ],
    toolHints: ["image_generation", "audio_transcription", "voice_synthesis"],
    reason: "media_runtime_execution_requires_lime_tool_runtime_policy",
  },
  "lime.mcp": {
    keywords: ["mcp", "mcpserver", "mcp__"],
    toolHints: ["mcp__server__tool"],
    reason: "mcp_execution_requires_lime_tool_runtime_policy",
  },
  "lime.terminal": {
    keywords: ["terminal", "shell", "command", "bash", "powershell", "cmd"],
    toolHints: ["terminal.run"],
    reason: "terminal_execution_requires_lime_sandbox_policy",
  },
  "lime.connectors": {
    keywords: ["connector", "connectors", "integration", "notion", "slack"],
    toolHints: ["connector.invoke"],
    reason: "connector_execution_requires_lime_policy_and_secret_binding",
  },
};

const TOOL_INTENT_KEYS = new Set([
  "action",
  "artifactId",
  "command",
  "connectorId",
  "cwdRef",
  "depth",
  "format",
  "fullPage",
  "input",
  "limit",
  "operation",
  "options",
  "prompt",
  "quality",
  "query",
  "ref",
  "reason",
  "runId",
  "selector",
  "serverId",
  "sessionId",
  "size",
  "style",
  "text",
  "tool",
  "url",
  "voice",
]);

function classifyToolIntegrationCapability(
  value: string,
): ToolIntegrationCapability | null {
  const token = capabilityMatchToken(value);
  if (!token) {
    return null;
  }
  if (token.includes("mcp")) {
    return "lime.mcp";
  }
  if (
    token.includes("terminal") ||
    token.includes("shell") ||
    token.includes("powershell")
  ) {
    return "lime.terminal";
  }
  if (token.includes("connector")) {
    return "lime.connectors";
  }
  const capability = (
    Object.entries(TOOL_INTEGRATION_SPECS) as Array<
      [
        ToolIntegrationCapability,
        (typeof TOOL_INTEGRATION_SPECS)[ToolIntegrationCapability],
      ]
    >
  ).find(([, spec]) =>
    spec.keywords.some((keyword) =>
      token.includes(capabilityMatchToken(keyword)),
    ),
  )?.[0];
  return capability ?? null;
}

function normalizeToolIntegrationName(value: string): string {
  return value
    .replace(/^Tool\s*[·:]\s*/i, "")
    .replace(/^执行参数流\s*[·:]\s*/i, "")
    .replace(/^执行结果流\s*[·:]\s*/i, "")
    .trim();
}

function buildDeclaredToolRun(
  task: AgentAppTaskRecord,
  toolName: string,
): RuntimeToolRunProjection | null {
  const capability = classifyToolIntegrationCapability(toolName);
  if (!capability) {
    return null;
  }
  return {
    runId: `${task.taskId}:${capability}:${capabilityMatchToken(toolName)}:declared`,
    capability,
    toolName,
    taskId: task.taskId,
    taskKind: task.taskKind,
    status: "declared",
    startedAt: task.startedAt,
    finishedAt: task.finishedAt,
    title: `Tool intent · ${toolName}`,
    statusText: "已声明",
    message:
      "Agent App task 声明了该 ToolRuntime intent，实际执行仍由 Lime AgentRuntime 管理。",
    source: "agent_runtime_process",
  };
}

function buildTimelineToolRun(
  task: AgentAppTaskRecord,
  item: AgentAppRuntimeProcessTimelineItem,
  index: number,
): RuntimeToolRunProjection | null {
  const surface = [item.title, item.message, item.detail, item.meta]
    .filter(Boolean)
    .join(" ");
  const capability = classifyToolIntegrationCapability(surface);
  if (!capability) {
    return null;
  }
  const toolName = normalizeToolIntegrationName(
    item.title || item.meta || surface,
  );
  return {
    runId:
      readString(item.meta) ??
      `${task.taskId}:${capability}:${capabilityMatchToken(toolName)}:${index}`,
    capability,
    toolName,
    taskId: task.taskId,
    taskKind: task.taskKind,
    status: task.status === "running" ? "observed" : task.status,
    startedAt: task.startedAt,
    finishedAt: task.finishedAt,
    title: item.title,
    statusText: item.statusText,
    message: item.message,
    detail: item.detail,
    source: "agent_runtime_process",
  };
}

function buildThreadReadToolRun(
  task: AgentAppTaskRecord,
  call: Record<string, unknown>,
  index: number,
): RuntimeToolRunProjection | null {
  const toolName =
    recordStringByKeys(call, ["toolName", "tool_name", "name"]) ??
    recordStringByKeys(recordObjectByKeys(call, ["function"]), ["name"]);
  if (!toolName) {
    return null;
  }
  const capability = classifyToolIntegrationCapability(toolName);
  if (!capability) {
    return null;
  }
  const status =
    recordStringByKeys(call, ["status", "state"]) ??
    (task.status === "succeeded" ? "completed" : task.status);
  return {
    runId:
      recordStringByKeys(call, ["runId", "run_id", "id", "toolCallId"]) ??
      `${task.taskId}:${capability}:${capabilityMatchToken(toolName)}:${index}:thread`,
    capability,
    toolName,
    taskId: task.taskId,
    taskKind: task.taskKind,
    status:
      status === "completed" || status === "declared" || status === "observed"
        ? status
        : task.status,
    startedAt:
      recordStringByKeys(call, ["startedAt", "started_at"]) ?? task.startedAt,
    finishedAt:
      recordStringByKeys(call, ["finishedAt", "finished_at", "completedAt"]) ??
      task.finishedAt,
    title: recordStringByKeys(call, ["title"]) ?? `Tool · ${toolName}`,
    statusText:
      recordStringByKeys(call, ["statusText", "status_text"]) ?? "已记录",
    message:
      recordStringByKeys(call, ["message"]) ??
      "AgentRuntime threadRead 记录了该工具调用。",
    detail: recordStringByKeys(call, ["detail"]),
    input: recordValueByKeys(call, ["input", "args", "arguments"]),
    output: recordValueByKeys(call, ["output", "result"]),
    source: "agent_runtime_thread_read",
  };
}

function collectThreadReadToolRuns(
  task: AgentAppTaskRecord,
): RuntimeToolRunProjection[] {
  const threadRead = readTaskThreadRead(task);
  const candidates = [
    ...recordArrayByKeys(threadRead, ["toolCalls", "tool_calls"]),
    ...recordArray(threadRead, "turns")
      .filter(isRecord)
      .flatMap((turn) => recordArrayByKeys(turn, ["toolCalls", "tool_calls"])),
  ];
  return candidates
    .filter(isRecord)
    .map((call, index) => buildThreadReadToolRun(task, call, index))
    .filter((item): item is RuntimeToolRunProjection => Boolean(item));
}

function buildRuntimeToolRuns(
  tasks: AgentAppTaskRecord[],
  capability?: ToolIntegrationCapability,
): RuntimeToolRunProjection[] {
  const runs = tasks.flatMap((task) => {
    const process = readTaskRuntimeProcess(task);
    const declared = task.tools
      .map((toolName) => buildDeclaredToolRun(task, toolName))
      .filter((item): item is RuntimeToolRunProjection => Boolean(item));
    const observed = (process?.timeline ?? [])
      .filter((item) => item.kind === "tool" || item.kind === "execution")
      .map((item, index) => buildTimelineToolRun(task, item, index))
      .filter((item): item is RuntimeToolRunProjection => Boolean(item));
    const threadRead = collectThreadReadToolRuns(task);
    return [...observed, ...threadRead, ...declared];
  });
  return runs
    .filter((run) => !capability || run.capability === capability)
    .sort((left, right) =>
      String(right.finishedAt ?? right.startedAt).localeCompare(
        String(left.finishedAt ?? left.startedAt),
      ),
    );
}

function readToolIntent(
  input: Record<string, unknown>,
): Record<string, unknown> {
  const intent = Object.fromEntries(
    Object.entries(input).filter(([key]) => TOOL_INTENT_KEYS.has(key)),
  );
  return sanitizeExecutionRequestInput(intent) as Record<string, unknown>;
}

const EXECUTION_SECRET_KEY_PATTERN =
  /(?:secret|token|api[_-]?key|provider[_-]?key|password|credential|authorization|oauth|client[_-]?secret)/i;
const EXECUTION_EVIDENCE_KEY_PATTERN =
  /(?:evidence[_-]?(?:id|ref)?|artifact[_-]?evidence)/i;
const EXECUTION_LOCAL_PATH_KEY_PATTERN =
  /(?:absolute[_-]?path|local[_-]?path|workspace[_-]?root|project[_-]?root|file[_-]?path|directory|dir|cwd|path)$/i;

function isSafeConnectorRuntimeFactValue(
  key: string | undefined,
  value: unknown,
): boolean {
  if (!key) {
    return false;
  }
  switch (key) {
    case "authorizationStatus":
    case "authorization_status":
      return (
        typeof value === "string" &&
        ["authorized", "connected", "observed", "ready"].includes(
          value.trim().toLowerCase(),
        )
      );
    case "secretBinding":
    case "secret_binding":
      return value === "host_managed";
    case "tokenExposed":
    case "token_exposed":
      return value === false;
    case "credentialMaterialExposed":
    case "credential_material_exposed":
      return value === false;
    default:
      return false;
  }
}

function sanitizeConnectorSecretDeliveryFact(
  value: Record<string, unknown>,
  options: { exposeSecretLeaseRef?: boolean } = {},
): Record<string, unknown> | string {
  const sanitized: Record<string, unknown> = {};
  const status = readString(value.status);
  if (
    status &&
    ["ready", "pending", "available", "observed", "lease_observed"].includes(
      status.toLowerCase(),
    )
  ) {
    sanitized.status = status;
  }
  if (value.binding === "host_managed") {
    sanitized.binding = "host_managed";
  }
  if (value.source === "host_managed_secret_delivery_fact") {
    sanitized.source = "host_managed_secret_delivery_fact";
  }
  if (value.target === "cloud_overlay_worker") {
    sanitized.target = "cloud_overlay_worker";
  }
  const leaseRef = readString(value.leaseRef) ?? readString(value.lease_ref);
  if (leaseRef?.startsWith("secret-lease://connector/")) {
    sanitized.leaseObserved = true;
    sanitized.leaseRefExposed = false;
    sanitized.leaseHandleStatus = "host_managed";
    if (options.exposeSecretLeaseRef) {
      sanitized.leaseRef = leaseRef;
    }
  } else if (value.leaseObserved === true || value.lease_observed === true) {
    sanitized.leaseObserved = true;
    sanitized.leaseRefExposed = false;
    sanitized.leaseHandleStatus = "host_managed";
  }
  if (value.leaseRefExposed === false || value.lease_ref_exposed === false) {
    sanitized.leaseRefExposed = false;
  }
  const leaseHandleStatus =
    readString(value.leaseHandleStatus) ??
    readString(value.lease_handle_status);
  if (leaseHandleStatus === "host_managed") {
    sanitized.leaseHandleStatus = "host_managed";
  }
  const expiresAt = readString(value.expiresAt) ?? readString(value.expires_at);
  if (expiresAt) {
    sanitized.expiresAt = expiresAt;
  }
  if (value.credentialMaterialExposed === false) {
    sanitized.credentialMaterialExposed = false;
  }
  if (value.credential_material_exposed === false) {
    sanitized.credential_material_exposed = false;
  }
  if (value.tokenExposed === false) {
    sanitized.tokenExposed = false;
  }
  if (value.token_exposed === false) {
    sanitized.token_exposed = false;
  }
  return Object.keys(sanitized).length > 0
    ? sanitized
    : "[redacted:host_managed_secret]";
}

function isAbsoluteLocalPath(value: string): boolean {
  return (
    value.startsWith("/") ||
    /^[A-Za-z]:[\\/]/.test(value) ||
    value.startsWith("\\\\") ||
    value.startsWith("file:///")
  );
}

function sanitizeExecutionRequestInput(
  value: unknown,
  key?: string,
  depth = 0,
  options: { exposeSecretLeaseRef?: boolean } = {},
): unknown {
  if (isSafeConnectorRuntimeFactValue(key, value)) {
    return value;
  }
  if (
    key &&
    /^(?:secretDelivery|secret_delivery)$/i.test(key) &&
    isRecord(value)
  ) {
    return sanitizeConnectorSecretDeliveryFact(value, options);
  }
  if (key && EXECUTION_SECRET_KEY_PATTERN.test(key)) {
    return "[redacted:host_managed_secret]";
  }
  if (key && EXECUTION_EVIDENCE_KEY_PATTERN.test(key)) {
    return "[redacted:host_owned_evidence]";
  }
  if (
    key &&
    typeof value === "string" &&
    EXECUTION_LOCAL_PATH_KEY_PATTERN.test(key) &&
    isAbsoluteLocalPath(value.trim())
  ) {
    return "[redacted:absolute_local_path]";
  }
  if (depth >= 8) {
    return "[redacted:depth_limit]";
  }
  if (Array.isArray(value)) {
    return value.map((item) =>
      sanitizeExecutionRequestInput(item, key, depth + 1, options),
    );
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([itemKey, itemValue]) => [
        itemKey,
        sanitizeExecutionRequestInput(itemValue, itemKey, depth + 1, options),
      ]),
    );
  }
  return value;
}

function buildToolExecutionPolicy(
  capability: ToolIntegrationCapability | "lime.tools",
  reason: string,
): ToolExecutionPolicyProjection {
  const requiresApproval = new Set<ToolIntegrationCapability | "lime.tools">([
    "lime.browser",
    "lime.mcp",
    "lime.terminal",
    "lime.connectors",
    "lime.tools",
  ]).has(capability);
  const policy: ToolExecutionPolicyProjection = {
    owner: "lime_agent_runtime",
    scope: "agent_app_session",
    approvalRequired: requiresApproval,
    sandboxRequired: capability === "lime.terminal",
    mutationExposed: false,
    tokenExposed: false,
    reason,
  };
  if (capability === "lime.connectors") {
    policy.secretBinding = "host_managed";
  }
  return policy;
}

function buildToolExecutionRequestEnvelope(
  request: AgentAppHostBridgeCapabilityRequest,
  capability: ToolIntegrationCapability | "lime.tools",
  input: Record<string, unknown>,
  reason: string,
  options: {
    toolName?: string;
    action?: string;
    exposeSecretLeaseRef?: boolean;
  } = {},
): ToolExecutionRequestEnvelope {
  const taskId = readString(input.taskId);
  const sessionId = readString(input.sessionId);
  const envelope: ToolExecutionRequestEnvelope = {
    capability,
    method: request.method,
    appId: request.appId,
    action: options.action ?? readString(input.action) ?? request.method,
    input: sanitizeExecutionRequestInput(input, undefined, 0, {
      exposeSecretLeaseRef: options.exposeSecretLeaseRef,
    }),
    reason,
    policy: buildToolExecutionPolicy(capability, reason),
  };
  if (request.entryKey) {
    envelope.entryKey = request.entryKey;
  }
  if (taskId) {
    envelope.taskId = taskId;
  }
  if (sessionId) {
    envelope.sessionId = sessionId;
  }
  if (options.toolName) {
    envelope.toolName = options.toolName;
  }
  if (request.idempotencyKey) {
    envelope.idempotencyKey = request.idempotencyKey;
  }
  return envelope;
}

function buildToolExecutionHandoffTaskRequest(
  executionRequest: ToolExecutionRequestEnvelope,
  toolHints: string[],
  options: { internalExecutionRequest?: ToolExecutionRequestEnvelope } = {},
): ToolExecutionAgentTaskRequest {
  const internalExecutionRequest = options.internalExecutionRequest;
  const uniqueHints = Array.from(
    new Set(
      [
        executionRequest.toolName,
        executionRequest.capability,
        ...toolHints,
      ].filter((item): item is string => Boolean(item?.trim())),
    ),
  );
  return {
    title: `Tool execution · ${
      executionRequest.toolName ?? executionRequest.capability
    }`,
    taskKind: "agent_app.tool_execution",
    idempotencyKey:
      executionRequest.idempotencyKey ??
      `${executionRequest.appId}:${
        executionRequest.entryKey ?? "default"
      }:${executionRequest.capability}:${executionRequest.method}`,
    prompt: [
      "【Agent App Tool Execution Request】",
      `Capability: ${executionRequest.capability}`,
      `Method: ${executionRequest.method}`,
      `Tool: ${executionRequest.toolName ?? "n/a"}`,
      `Action: ${executionRequest.action ?? "n/a"}`,
      "",
      "请由 Lime AgentRuntime / ToolRuntime policy owner 审核并执行该请求。",
      "不要要求 Agent App 直接执行工具、MCP、终端、浏览器或 connector，也不要把 Host secret/token 暴露给 App。",
    ].join("\n"),
    input: {
      executionRequest,
    },
    expectedOutput: {
      kind: "tool_execution_result",
      evidenceRequired: true,
      source: "agent_runtime_tool_runtime",
    },
    tools: uniqueHints,
    requiredCapabilities: [executionRequest.capability],
    capabilityHints: uniqueHints,
    humanReview: executionRequest.policy.approvalRequired,
    sessionId: executionRequest.sessionId,
    queueIfBusy: true,
    metadata: {
      agent_app_tool_execution: {
        version: "p18.7-e2",
        source: "host_bridge_execution_gate",
        request: executionRequest,
        ...(internalExecutionRequest &&
        internalExecutionRequest !== executionRequest
          ? { internalRequest: internalExecutionRequest }
          : {}),
      },
    },
  };
}

function readExecutionRequestFromResponse(
  response: Record<string, unknown>,
): ToolExecutionRequestEnvelope | null {
  const executionGate = isRecord(response.executionGate)
    ? response.executionGate
    : null;
  const request = executionGate?.request;
  return isRecord(request) &&
    typeof request.capability === "string" &&
    typeof request.method === "string" &&
    typeof request.appId === "string" &&
    isRecord(request.policy)
    ? (request as unknown as ToolExecutionRequestEnvelope)
    : null;
}

async function attachToolExecutionHandoff(
  response: Record<string, unknown>,
  toolHints: string[],
  resolveSdk?: () => LimeAppSdk,
): Promise<Record<string, unknown>> {
  if (!resolveSdk) {
    return response;
  }
  const executionGate = isRecord(response.executionGate)
    ? response.executionGate
    : {};
  const publicExecutionRequest = readExecutionRequestFromResponse(response);
  const internalExecutionRequest = (response as ToolIntentResponse)[
    INTERNAL_TOOL_EXECUTION_REQUEST
  ];
  const executionRequest = publicExecutionRequest ?? internalExecutionRequest;
  if (!executionRequest) {
    return response;
  }
  try {
    const task = await resolveSdk().agent.startTask(
      buildToolExecutionHandoffTaskRequest(executionRequest, toolHints, {
        internalExecutionRequest,
      }),
    );
    const handoff: ToolExecutionHandoffProjection = {
      status: "accepted",
      owner: "lime_agent_runtime",
      source: "lime.agent.startTask",
      taskId: task.taskId,
      traceId: task.traceId,
      taskKind: task.taskKind,
      taskStatus: task.status,
    };
    return {
      ...response,
      executionGate: {
        ...executionGate,
        handoff,
      },
    };
  } catch {
    const handoff: ToolExecutionHandoffProjection = {
      status: "not_started",
      owner: "lime_agent_runtime",
      source: "lime.agent.startTask",
      reason: "agent_task_handoff_failed",
    };
    return {
      ...response,
      executionGate: {
        ...executionGate,
        handoff,
      },
    };
  }
}

function buildConnectorAuthorizationPolicy(
  reason: string,
): ConnectorAuthorizationPolicyProjection {
  return {
    owner: "lime_connector_policy",
    scope: "agent_app_session",
    approvalRequired: true,
    mutationExposed: false,
    tokenExposed: false,
    secretBinding: "host_managed",
    sessionScoped: true,
    reason,
  };
}

function buildConnectorAuthorizationRequestEnvelope(
  request: AgentAppHostBridgeCapabilityRequest,
  connectorId: string,
  input: Record<string, unknown>,
  reason: string,
): ConnectorAuthorizationRequestEnvelope {
  const taskId = readString(input.taskId);
  const sessionId = readString(input.sessionId);
  const envelope: ConnectorAuthorizationRequestEnvelope = {
    capability: "lime.connectors",
    method: "requestAuth",
    appId: request.appId,
    connectorId,
    input: sanitizeExecutionRequestInput(input),
    reason,
    policy: buildConnectorAuthorizationPolicy(reason),
  };
  if (request.entryKey) {
    envelope.entryKey = request.entryKey;
  }
  if (taskId) {
    envelope.taskId = taskId;
  }
  if (sessionId) {
    envelope.sessionId = sessionId;
  }
  if (request.idempotencyKey) {
    envelope.idempotencyKey = request.idempotencyKey;
  }
  return envelope;
}

function buildConnectorAuthorizationHandoffTaskRequest(
  authorizationRequest: ConnectorAuthorizationRequestEnvelope,
): ConnectorAuthorizationAgentTaskRequest {
  return {
    title: `Connector authorization · ${authorizationRequest.connectorId}`,
    taskKind: "agent_app.connector_authorization",
    idempotencyKey:
      authorizationRequest.idempotencyKey ??
      `${authorizationRequest.appId}:${
        authorizationRequest.entryKey ?? "default"
      }:lime.connectors:requestAuth:${authorizationRequest.connectorId}`,
    prompt: [
      "【Agent App Connector Authorization Request】",
      `Connector: ${authorizationRequest.connectorId}`,
      "",
      "请由 Lime Host / Connector policy owner 创建或恢复 host-managed 授权绑定。",
      "不要要求 Agent App 输入或保存 OAuth token、refresh token、API key 或 provider secret。",
      "如果需要用户登录或授权，请通过 Host / Cloud Overlay 的授权流程发起，不要把 secret 明文写入任务结果。",
    ].join("\n"),
    input: {
      authorizationRequest,
    },
    expectedOutput: {
      kind: "connector_authorization_request",
      connectorId: authorizationRequest.connectorId,
      secretBinding: "host_managed",
      tokenExposed: false,
      source: "lime_connector_policy",
    },
    requiredCapabilities: ["lime.connectors"],
    capabilityHints: [
      "lime.connectors",
      `connector:${authorizationRequest.connectorId}`,
    ],
    humanReview: true,
    sessionId: authorizationRequest.sessionId,
    queueIfBusy: true,
    metadata: {
      agent_app_connector_authorization: {
        version: "p18.7-e4",
        source: "host_bridge_authorization_gate",
        request: authorizationRequest,
      },
    },
  };
}

function readConnectorAuthorizationRequestFromResponse(
  response: Record<string, unknown>,
): ConnectorAuthorizationRequestEnvelope | null {
  const authorizationGate = isRecord(response.authorizationGate)
    ? response.authorizationGate
    : null;
  const request = authorizationGate?.request;
  return isRecord(request) &&
    request.capability === "lime.connectors" &&
    request.method === "requestAuth" &&
    typeof request.appId === "string" &&
    typeof request.connectorId === "string" &&
    isRecord(request.policy)
    ? (request as unknown as ConnectorAuthorizationRequestEnvelope)
    : null;
}

async function attachConnectorAuthorizationHandoff(
  response: Record<string, unknown>,
  resolveSdk?: () => LimeAppSdk,
): Promise<Record<string, unknown>> {
  if (!resolveSdk) {
    return response;
  }
  const authorizationGate = isRecord(response.authorizationGate)
    ? response.authorizationGate
    : {};
  const authorizationRequest =
    readConnectorAuthorizationRequestFromResponse(response);
  if (!authorizationRequest) {
    return response;
  }
  try {
    const task = await resolveSdk().agent.startTask(
      buildConnectorAuthorizationHandoffTaskRequest(authorizationRequest),
    );
    const handoff: ConnectorAuthorizationHandoffProjection = {
      status: "accepted",
      owner: "lime_connector_policy",
      source: "lime.agent.startTask",
      taskId: task.taskId,
      traceId: task.traceId,
      taskKind: task.taskKind,
      taskStatus: task.status,
    };
    return {
      ...response,
      authorizationGate: {
        ...authorizationGate,
        handoff,
      },
    };
  } catch {
    const handoff: ConnectorAuthorizationHandoffProjection = {
      status: "not_started",
      owner: "lime_connector_policy",
      source: "lime.agent.startTask",
      reason: "connector_authorization_handoff_failed",
    };
    return {
      ...response,
      authorizationGate: {
        ...authorizationGate,
        handoff,
      },
    };
  }
}

function buildToolIntentResponse(
  request: AgentAppHostBridgeCapabilityRequest,
  capability: ToolIntegrationCapability,
  input: Record<string, unknown>,
  runs: RuntimeToolRunProjection[],
  options: {
    toolName?: string;
    action?: string;
    exposeSecretLeaseRefToInternal?: boolean;
  } = {},
): ToolIntentResponse {
  const spec = TOOL_INTEGRATION_SPECS[capability];
  const toolName =
    options.toolName ?? readString(input.tool) ?? spec.toolHints[0];
  const publicExecutionRequest = buildToolExecutionRequestEnvelope(
    request,
    capability,
    input,
    spec.reason,
    {
      toolName,
      action: options.action,
    },
  );
  const internalExecutionRequest = options.exposeSecretLeaseRefToInternal
    ? buildToolExecutionRequestEnvelope(request, capability, input, spec.reason, {
        toolName,
        action: options.action,
        exposeSecretLeaseRef: true,
      })
    : publicExecutionRequest;
  const response: ToolIntentResponse = {
    appId: request.appId,
    capability,
    method: request.method,
    status: "requires_agent_task",
    reason: spec.reason,
    source: "tool_runtime_policy",
    intent: readToolIntent(input),
    toolHints: spec.toolHints,
    matchingRuns: runs,
    executionGate: {
      status: "requires_agent_task",
      owner: "lime_agent_runtime",
      mutationExposed: false,
      evidenceSource: "agent_runtime_projection",
      reason: spec.reason,
      request: publicExecutionRequest,
    },
    next: {
      capability: "lime.agent",
      method: "startTask",
      reason: "actual_tool_execution_is_owned_by_lime_agent_runtime",
    },
  };
  if (internalExecutionRequest !== publicExecutionRequest) {
    Object.defineProperty(response, INTERNAL_TOOL_EXECUTION_REQUEST, {
      value: internalExecutionRequest,
      enumerable: false,
    });
  }
  return response;
}

function toolRunMatchesToolName(
  run: RuntimeToolRunProjection,
  toolName: string,
): boolean {
  const requested = capabilityMatchToken(
    normalizeToolIntegrationName(toolName),
  );
  const observed = capabilityMatchToken(
    normalizeToolIntegrationName(run.toolName),
  );
  return Boolean(
    requested &&
    observed &&
    (requested === observed ||
      requested.includes(observed) ||
      observed.includes(requested)),
  );
}

function buildGenericToolIntentResponse(
  request: AgentAppHostBridgeCapabilityRequest,
  input: Record<string, unknown>,
  runs: RuntimeToolRunProjection[],
): Record<string, unknown> {
  const toolName = readStringParam(request, "tool", 0);
  const reason = "tool_execution_requires_lime_tool_runtime_policy";
  const executionRequest = buildToolExecutionRequestEnvelope(
    request,
    "lime.tools",
    input,
    reason,
    {
      toolName,
      action: readString(input.action) ?? request.method,
    },
  );
  return {
    appId: request.appId,
    capability: "lime.tools",
    method: request.method,
    status: "requires_agent_task",
    reason,
    source: "tool_runtime_policy",
    intent: readToolIntent(input),
    toolHints: [toolName],
    matchingRuns: runs.filter((run) => toolRunMatchesToolName(run, toolName)),
    executionGate: {
      status: "requires_agent_task",
      owner: "lime_agent_runtime",
      mutationExposed: false,
      evidenceSource: "agent_runtime_projection",
      reason,
      request: executionRequest,
    },
    next: {
      capability: "lime.agent",
      method: "startTask",
      reason: "actual_tool_execution_is_owned_by_lime_agent_runtime",
    },
  };
}

function readGenericToolProgress(
  request: AgentAppHostBridgeCapabilityRequest,
  runs: RuntimeToolRunProjection[],
): RuntimeToolRunProjection & { invocationId: string } {
  const invocationId = readStringParam(request, "invocationId", 0);
  const run = runs.find(
    (item) => item.runId === invocationId || item.taskId === invocationId,
  );
  if (!run) {
    throw new AgentAppCapabilityDispatcherError(
      "TOOL_RUN_NOT_FOUND",
      `${invocationId} was not found in AgentRuntime tool projection.`,
    );
  }
  return {
    ...run,
    invocationId,
  };
}

function readToolRun(
  request: AgentAppHostBridgeCapabilityRequest,
  runs: RuntimeToolRunProjection[],
): RuntimeToolRunProjection {
  const runId = readStringParam(request, "runId", 0);
  const run = runs.find(
    (item) => item.runId === runId || item.taskId === runId,
  );
  if (!run) {
    throw new AgentAppCapabilityDispatcherError(
      "TOOL_RUN_NOT_FOUND",
      `${runId} was not found in AgentRuntime tool projection.`,
    );
  }
  return run;
}

async function cancelToolExecutionViaAgentTask(
  request: AgentAppHostBridgeCapabilityRequest,
  input: Record<string, unknown>,
  runs: RuntimeToolRunProjection[],
  resolveSdk?: () => LimeAppSdk,
): Promise<Record<string, unknown>> {
  const taskId = readString(input.taskId) ?? readString(input.task_id);
  const runId =
    readString(input.runId) ??
    readString(input.run_id) ??
    readString(input.invocationId);
  const run = runId
    ? runs.find((item) => item.runId === runId || item.taskId === runId)
    : undefined;
  const resolvedTaskId = taskId ?? run?.taskId;
  if (!resolvedTaskId) {
    return {
      status: "not_available",
      reason: "tool_cancellation_requires_agent_task_id",
      source: "agent_runtime_projection",
      next: {
        capability: "lime.agent",
        method: "cancelTask",
      },
    };
  }
  if (!taskId) {
    return {
      status: "requires_agent_task_cancellation",
      reason: "tool_run_cancellation_must_use_agent_task_id",
      source: "agent_runtime_projection",
      runId,
      taskId: resolvedTaskId,
      next: {
        capability: "lime.agent",
        method: "cancelTask",
        taskId: resolvedTaskId,
      },
    };
  }
  if (!resolveSdk) {
    return {
      status: "requires_agent_task_cancellation",
      reason: "agent_runtime_sdk_unavailable",
      source: "agent_runtime_projection",
      taskId: resolvedTaskId,
      next: {
        capability: "lime.agent",
        method: "cancelTask",
        taskId: resolvedTaskId,
      },
    };
  }
  const task = await resolveSdk().agent.cancelTask(resolvedTaskId);
  return {
    appId: request.appId,
    capability: request.capability,
    method: request.method,
    status: "cancel_requested",
    source: "lime.agent.cancelTask",
    taskId: resolvedTaskId,
    taskStatus: task.status,
    task,
  };
}

function mergeRuntimeProjectionSource(
  current: RuntimeAggregateProjectionSource,
  next: RuntimeToolRunProjection["source"],
): RuntimeAggregateProjectionSource {
  return current === next ? current : "mixed";
}

function parseMcpToolName(toolName: string): {
  serverId: string;
  toolId: string;
} {
  const normalized = toolName
    .replace(/^Tool\s*[·:]\s*/i, "")
    .replace(/^mcp[:./-]/i, "mcp__")
    .trim();
  const match = /^mcp__([^_]+)__(.+)$/i.exec(normalized);
  if (match) {
    return {
      serverId: match[1],
      toolId: match[2],
    };
  }
  return {
    serverId: "unknown",
    toolId: normalized || toolName,
  };
}

function buildRuntimeMcpTools(
  runs: RuntimeToolRunProjection[],
): RuntimeMcpToolProjection[] {
  const tools = new Map<string, RuntimeMcpToolProjection>();
  runs.forEach((run) => {
    const parsed = parseMcpToolName(run.toolName);
    const key = `${parsed.serverId}\u0000${parsed.toolId}`;
    const lastSeenAt = String(run.finishedAt ?? run.startedAt);
    const existing = tools.get(key);
    if (existing) {
      existing.runIds = Array.from(new Set([...existing.runIds, run.runId]));
      existing.taskIds = Array.from(new Set([...existing.taskIds, run.taskId]));
      existing.source = mergeRuntimeProjectionSource(
        existing.source,
        run.source,
      );
      if (lastSeenAt > existing.lastSeenAt) {
        existing.lastSeenAt = lastSeenAt;
      }
      return;
    }
    tools.set(key, {
      toolName: run.toolName,
      serverId: parsed.serverId,
      toolId: parsed.toolId,
      runIds: [run.runId],
      taskIds: [run.taskId],
      lastSeenAt,
      source: run.source,
    });
  });
  return Array.from(tools.values()).sort((left, right) =>
    right.lastSeenAt.localeCompare(left.lastSeenAt),
  );
}

function parseConnectorToolName(toolName: string): {
  connectorId: string;
  actionId?: string;
} {
  const normalized = toolName
    .replace(/^Tool\s*[·:]\s*/i, "")
    .replace(/^connector[:./-]/i, "connector__")
    .trim();
  const match = /^connector__([^_]+)__(.+)$/i.exec(normalized);
  if (match) {
    return {
      connectorId: match[1],
      actionId: match[2],
    };
  }
  return {
    connectorId: normalized || toolName,
  };
}

function isHostFixtureConnectorAction(
  connectorId: string,
  actionId?: string,
): boolean {
  return (
    connectorId === "lime_fixture" &&
    (actionId === undefined ||
      actionId === "recordMutation" ||
      actionId === "record_mutation")
  );
}

function buildRuntimeConnectors(
  runs: RuntimeToolRunProjection[],
): RuntimeConnectorProjection[] {
  const connectors = new Map<string, RuntimeConnectorProjection>();
  runs.forEach((run) => {
    const parsed = parseConnectorToolName(run.toolName);
    const connectorId = parsed.connectorId;
    const lastSeenAt = String(run.finishedAt ?? run.startedAt);
    const existing = connectors.get(connectorId);
    if (existing) {
      existing.actionIds = Array.from(
        new Set(
          parsed.actionId
            ? [...existing.actionIds, parsed.actionId]
            : existing.actionIds,
        ),
      ).sort();
      existing.runIds = Array.from(new Set([...existing.runIds, run.runId]));
      existing.taskIds = Array.from(new Set([...existing.taskIds, run.taskId]));
      existing.source = mergeRuntimeProjectionSource(
        existing.source,
        run.source,
      );
      if (lastSeenAt > existing.lastSeenAt) {
        existing.lastSeenAt = lastSeenAt;
      }
      return;
    }
    connectors.set(connectorId, {
      connectorId,
      actionIds: parsed.actionId ? [parsed.actionId] : [],
      runIds: [run.runId],
      taskIds: [run.taskId],
      lastSeenAt,
      source: run.source,
    });
  });
  return Array.from(connectors.values()).sort((left, right) =>
    right.lastSeenAt.localeCompare(left.lastSeenAt),
  );
}

function readTaskConnectorAuthorizationRequest(
  task: AgentAppTaskRecord,
): Record<string, unknown> | null {
  if (task.taskKind !== "agent_app.connector_authorization") {
    return null;
  }
  if (isRecord(task.input) && isRecord(task.input.authorizationRequest)) {
    return task.input.authorizationRequest;
  }
  if (
    isRecord(task.result) &&
    isRecord(task.result.agent_app_connector_authorization) &&
    isRecord(task.result.agent_app_connector_authorization.request)
  ) {
    return task.result.agent_app_connector_authorization.request;
  }
  return null;
}

function buildConnectorAuthorizationProjection(
  task: AgentAppTaskRecord,
): RuntimeConnectorAuthorizationProjection | null {
  const request = readTaskConnectorAuthorizationRequest(task);
  const connectorId =
    readString(request?.connectorId) ??
    (isRecord(task.expectedOutput)
      ? readString(task.expectedOutput.connectorId)
      : undefined);
  if (!connectorId) {
    return null;
  }

  return {
    connectorId,
    actionId: readString(request?.action),
    taskId: task.taskId,
    taskStatus: task.status,
    startedAt: task.startedAt,
    finishedAt: task.finishedAt,
    reason: readString(request?.reason),
    secretBinding: "host_managed",
    tokenExposed: false,
    sessionScoped: true,
    source: "agent_app_connector_authorization_task",
    secretDelivery: buildHostManagedSecretDeliveryFact(
      connectorId,
      readString(request?.action),
      task.taskId,
      task.status,
    ),
  };
}

function buildConnectorAuthorizationProjections(
  tasks: AgentAppTaskRecord[],
): RuntimeConnectorAuthorizationProjection[] {
  return tasks
    .map(buildConnectorAuthorizationProjection)
    .filter(
      (item): item is RuntimeConnectorAuthorizationProjection =>
        Boolean(item),
    )
    .sort((left, right) => left.connectorId.localeCompare(right.connectorId));
}

function buildConnectorRuntimeFacts(
  connectorId: string,
  connector?: RuntimeConnectorProjection,
  authorizationRequest?: RuntimeConnectorAuthorizationProjection,
  fixtureActionId?: string,
  options: { exposeSecretLeaseRef?: boolean } = {},
):
  | ConnectorRuntimeFactsProjection
  | ConnectorRuntimeFactsInternalProjection
  | undefined {
  if (isHostFixtureConnectorAction(connectorId, fixtureActionId)) {
    return {
      connectorId,
      status: "authorized",
      authorizationStatus: "authorized",
      source: "host_fixture_connector",
      actionIds: fixtureActionId ? [fixtureActionId] : ["recordMutation"],
      secretBinding: "host_managed",
      tokenExposed: false,
    };
  }

  if (!connector && authorizationRequest?.taskStatus !== "succeeded") {
    return undefined;
  }

  const authorizationStatus =
    authorizationRequest?.taskStatus === "succeeded"
      ? "authorized"
      : "observed";
  const taskIds = Array.from(
    new Set([
      ...(connector?.taskIds ?? []),
      ...(authorizationRequest ? [authorizationRequest.taskId] : []),
    ]),
  );
  const secretDelivery = buildHostManagedSecretDeliveryFact(
    connectorId,
    fixtureActionId,
    authorizationRequest?.taskId,
    authorizationRequest?.taskStatus,
    options,
  );

  return {
    connectorId,
    status: connector ? "observed" : "authorized",
    authorizationStatus,
    source:
      connector && authorizationRequest
        ? "mixed"
        : connector?.source ?? "agent_app_connector_authorization_task",
    actionIds: connector?.actionIds,
    runIds: connector?.runIds,
    taskIds: taskIds.length > 0 ? taskIds : undefined,
    secretBinding: "host_managed",
    tokenExposed: false,
    ...(secretDelivery ? { secretDelivery } : {}),
  };
}

function buildHostManagedSecretDeliveryFact(
  connectorId: string,
  actionId: string | undefined,
  authorizationTaskId: string | undefined,
  authorizationTaskStatus: AgentAppTaskRecord["status"] | undefined,
  options: { exposeSecretLeaseRef?: boolean } = {},
): ConnectorSecretDeliveryProjection | ConnectorSecretDeliveryInternalFact | undefined {
  if (authorizationTaskStatus !== "succeeded" || !authorizationTaskId) {
    return undefined;
  }
  const normalizedActionId = actionId?.trim() || "default";
  const leaseRef = [
    "secret-lease://connector",
    encodeURIComponent(connectorId),
    encodeURIComponent(normalizedActionId),
    encodeURIComponent(authorizationTaskId),
  ].join("/");
  const fact: ConnectorSecretDeliveryProjection = {
    status: "ready",
    binding: "host_managed",
    source: "host_managed_secret_delivery_fact",
    target: "cloud_overlay_worker",
    leaseObserved: true,
    leaseRefExposed: false,
    leaseHandleStatus: "host_managed",
    credentialMaterialExposed: false,
    tokenExposed: false,
  };
  return options.exposeSecretLeaseRef ? { ...fact, leaseRef } : fact;
}

function readTaskThreadRead(
  task: AgentAppTaskRecord,
): Record<string, unknown> | null {
  if (!isRecord(task.result)) {
    return null;
  }
  return isRecord(task.result.threadRead)
    ? task.result.threadRead
    : task.result;
}

function readTaskThreadDiagnostics(
  task: AgentAppTaskRecord,
): Record<string, unknown> | null {
  const threadRead = readTaskThreadRead(task);
  return isRecord(threadRead?.diagnostics) ? threadRead.diagnostics : null;
}

function readTaskContextSummary(
  task: AgentAppTaskRecord,
): Record<string, unknown> | null {
  return recordObjectByKeys(readTaskThreadRead(task), [
    "contextSummary",
    "context_summary",
  ]);
}

function readKnowledgeBindingKeys(task: AgentAppTaskRecord): string[] {
  return task.knowledge
    .map((binding) => binding.key.trim())
    .filter(Boolean)
    .sort();
}

function readThreadTurnIds(
  threadRead: Record<string, unknown> | null,
): string[] {
  return recordArray(threadRead, "turns")
    .filter(isRecord)
    .map(
      (turn) =>
        recordString(turn, "turn_id") ??
        recordString(turn, "turnId") ??
        recordString(turn, "id"),
    )
    .filter((item): item is string => Boolean(item));
}

function readContextSummaryRefs(
  summary: Record<string, unknown> | null,
  keys: string[],
): Record<string, unknown>[] {
  return recordArrayByKeys(summary, keys).filter(isRecord);
}

function readContextRefLabels(refs: Record<string, unknown>[]): string[] {
  return Array.from(
    new Set(
      refs
        .flatMap((ref) => [
          recordStringByKeys(ref, ["source_id", "sourceId"]),
          recordStringByKeys(ref, ["title"]),
          recordStringByKeys(ref, ["path"]),
          recordStringByKeys(ref, ["label"]),
          recordStringByKeys(ref, ["key"]),
        ])
        .filter((item): item is string => Boolean(item)),
    ),
  ).sort();
}

function readRuntimeMemoryBudget(
  summary: Record<string, unknown> | null,
): RuntimeMemoryBudgetProjection | undefined {
  const budget = recordObjectByKeys(summary, ["memoryBudget", "memory_budget"]);
  if (!budget) {
    return undefined;
  }
  return {
    usedTokens: recordNumberByKeys(budget, ["usedTokens", "used_tokens"]),
    maxTokens: recordNumberByKeys(budget, ["maxTokens", "max_tokens"]),
    status: recordStringByKeys(budget, ["status"]),
    source: recordStringByKeys(budget, ["source"]),
  };
}

function buildContextGateProjection(task: AgentAppTaskRecord) {
  const summary = readTaskContextSummary(task);
  const retrievalRefs = readContextSummaryRefs(summary, [
    "retrievalRefs",
    "retrieval_refs",
  ]);
  const missingContext = readContextSummaryRefs(summary, [
    "missingContext",
    "missing_context",
  ]);
  const teamMemoryRefs = readContextSummaryRefs(summary, [
    "teamMemoryRefs",
    "team_memory_refs",
  ]);
  const memoryBudget = readRuntimeMemoryBudget(summary);
  return {
    status: missingContext.length
      ? "needs_context"
      : (memoryBudget?.status ?? (summary ? "ready" : "unknown")),
    memoryBudget,
    retrievalRefs,
    missingContext,
    teamMemoryRefs,
    labels: readContextRefLabels([
      ...retrievalRefs,
      ...missingContext,
      ...teamMemoryRefs,
    ]),
  };
}

function buildRuntimeMemoryProjection(
  task: AgentAppTaskRecord,
): RuntimeMemoryProjection {
  const diagnostics = readTaskThreadDiagnostics(task);
  const contextGate = buildContextGateProjection(task);
  return {
    taskId: task.taskId,
    taskKind: task.taskKind,
    status: task.status,
    startedAt: task.startedAt,
    finishedAt: task.finishedAt,
    scope: "task",
    knowledgeBindingKeys: readKnowledgeBindingKeys(task),
    contextCompactionCount: integerValue(
      diagnostics?.context_compaction_count ??
        diagnostics?.contextCompactionCount,
    ),
    pendingRequestCount: integerValue(
      diagnostics?.pending_request_count ?? diagnostics?.pendingRequestCount,
    ),
    memoryBudget: contextGate.memoryBudget,
    contextRefLabels: contextGate.labels,
    retrievalRefCount: contextGate.retrievalRefs.length,
    missingContextCount: contextGate.missingContext.length,
    teamMemoryRefCount: contextGate.teamMemoryRefs.length,
    contextGateStatus: contextGate.status,
    source: "agent_runtime_projection",
  };
}

function buildRuntimeContextProjection(
  task: AgentAppTaskRecord,
): RuntimeContextProjection {
  const threadRead = readTaskThreadRead(task);
  const diagnostics = readTaskThreadDiagnostics(task);
  const contextGate = buildContextGateProjection(task);
  return {
    taskId: task.taskId,
    traceId: task.traceId,
    taskKind: task.taskKind,
    status: task.status,
    startedAt: task.startedAt,
    finishedAt: task.finishedAt,
    workspaceId: task.provenance.workspaceId,
    threadId:
      recordString(threadRead, "thread_id") ??
      recordString(threadRead, "threadId"),
    turnIds: readThreadTurnIds(threadRead),
    knowledgeBindingKeys: readKnowledgeBindingKeys(task),
    toolKeys: [...task.tools].sort(),
    fileRefs: [...task.files].sort(),
    inputAttached: task.input !== undefined,
    expectedOutputAttached: task.expectedOutput !== undefined,
    pendingRequestCount: integerValue(
      diagnostics?.pending_request_count ?? diagnostics?.pendingRequestCount,
    ),
    contextGateStatus: contextGate.status,
    memoryBudget: contextGate.memoryBudget,
    retrievalRefCount: contextGate.retrievalRefs.length,
    missingContextCount: contextGate.missingContext.length,
    teamMemoryRefCount: contextGate.teamMemoryRefs.length,
    source: "agent_runtime_projection",
  };
}

function dispatchModels(
  host: CapabilityHost,
  request: AgentAppHostBridgeCapabilityRequest,
): unknown {
  const tasks = filterRuntimeProjectionTasks(host, request);
  const routedTasks = tasks
    .map(buildModelProjection)
    .filter((item): item is RuntimeModelProjection => Boolean(item));
  if (request.method === "list") {
    return {
      appId: request.appId,
      source: "agent_runtime_projection",
      taskCount: tasks.length,
      models: uniqueModelSummaries(routedTasks),
    };
  }
  if (request.method === "getRouting") {
    return {
      appId: request.appId,
      source: "agent_runtime_projection",
      taskCount: tasks.length,
      routes: routedTasks,
    };
  }
  if (request.method === "select") {
    const selected = routedTasks[0];
    return selected
      ? {
          status: "selected",
          source: "latest_runtime_projection",
          selected,
        }
      : {
          status: "unavailable",
          source: "latest_runtime_projection",
          reason: "no_runtime_routing_facts",
        };
  }
  if (request.method === "estimateCost") {
    const costs = tasks
      .map(buildCostProjection)
      .filter((item): item is RuntimeCostProjection => Boolean(item));
    return {
      appId: request.appId,
      status: costs.length
        ? "estimated_from_runtime_projection"
        : "insufficient_data",
      source: "agent_runtime_projection",
      sampleSize: costs.length,
      cost: aggregateCost(costs),
    };
  }
  throwUnsupportedMethod(request);
}

function dispatchSkills(
  host: CapabilityHost,
  request: AgentAppHostBridgeCapabilityRequest,
): unknown {
  const input = readOptionalInputRecord(request);
  const tasks = filterRuntimeProjectionTasks(host, request);
  const skills = buildRuntimeSkillProjection(tasks);
  if (request.method === "list") {
    const kind = readString(input.kind);
    return {
      appId: request.appId,
      source: "agent_runtime_process",
      taskCount: tasks.length,
      skills: kind
        ? skills.filter(
            (skill) => skill.status === kind || skill.source === kind,
          )
        : skills,
    };
  }
  if (request.method === "resolve") {
    const skillId = readStringParam(request, "skillId", 0);
    const skill = skills.find((item) => item.skillId === skillId);
    if (!skill) {
      throw new AgentAppCapabilityDispatcherError(
        "SKILL_NOT_FOUND",
        `${skillId} was not found in AgentRuntime process projection.`,
      );
    }
    return skill;
  }
  if (request.method === "getInvocation") {
    const invocationId = readStringParam(request, "invocationId", 0);
    const invocation = buildRuntimeSkillInvocations(tasks).find(
      (item) => item.invocationId === invocationId,
    );
    if (!invocation) {
      throw new AgentAppCapabilityDispatcherError(
        "SKILL_INVOCATION_NOT_FOUND",
        `${invocationId} was not found in AgentRuntime process projection.`,
      );
    }
    return invocation;
  }
  if (request.method === "bind" || request.method === "invoke") {
    return {
      status: "not_available",
      reason: "skill_runtime_mutation_not_exposed_to_agent_apps",
      source: "agent_runtime_process",
    };
  }
  throwUnsupportedMethod(request);
}

function dispatchMemory(
  host: CapabilityHost,
  request: AgentAppHostBridgeCapabilityRequest,
): unknown {
  const input = readOptionalInputRecord(request);
  const tasks = filterRuntimeProjectionTasks(host, request);
  const observations = tasks.map(buildRuntimeMemoryProjection);
  if (request.method === "getStatus") {
    return {
      appId: request.appId,
      scope: readString(input.scope) ?? "task",
      status: "read_only_projection",
      source: "agent_runtime_projection",
      taskCount: tasks.length,
      writable: false,
      compactable: false,
      totals: {
        knowledgeBindingCount: observations.reduce(
          (total, item) => total + item.knowledgeBindingKeys.length,
          0,
        ),
        contextCompactionCount: observations.reduce(
          (total, item) => total + item.contextCompactionCount,
          0,
        ),
        pendingRequestCount: observations.reduce(
          (total, item) => total + item.pendingRequestCount,
          0,
        ),
        retrievalRefCount: observations.reduce(
          (total, item) => total + item.retrievalRefCount,
          0,
        ),
        missingContextCount: observations.reduce(
          (total, item) => total + item.missingContextCount,
          0,
        ),
        teamMemoryRefCount: observations.reduce(
          (total, item) => total + item.teamMemoryRefCount,
          0,
        ),
      },
      observations,
    };
  }
  if (request.method === "query") {
    const query = readStringParam(request, "query", 0).toLowerCase();
    return {
      appId: request.appId,
      query,
      status: "limited_projection",
      source: "agent_runtime_projection",
      records: observations.filter((item) =>
        [
          item.taskId,
          item.taskKind,
          ...item.knowledgeBindingKeys,
          ...item.contextRefLabels,
        ]
          .join(" ")
          .toLowerCase()
          .includes(query),
      ),
    };
  }
  if (request.method === "write" || request.method === "compact") {
    return {
      status: "not_available",
      reason: "memory_runtime_mutation_not_exposed_to_agent_apps",
      source: "agent_runtime_projection",
    };
  }
  throwUnsupportedMethod(request);
}

function dispatchContext(
  host: CapabilityHost,
  request: AgentAppHostBridgeCapabilityRequest,
): unknown {
  const input = readOptionalInputRecord(request);
  const tasks = filterRuntimeProjectionTasks(host, request);
  if (request.method === "getSnapshot") {
    return {
      appId: request.appId,
      scope: readString(input.scope) ?? "task",
      source: "agent_runtime_projection",
      taskCount: tasks.length,
      contexts: tasks.map(buildRuntimeContextProjection),
    };
  }
  if (request.method === "attach" || request.method === "detach") {
    return {
      status: "not_available",
      reason: "context_mutation_not_exposed_to_agent_apps",
      source: "agent_runtime_projection",
    };
  }
  throwUnsupportedMethod(request);
}

function dispatchTasks(
  host: CapabilityHost,
  request: AgentAppHostBridgeCapabilityRequest,
): unknown {
  const input = readOptionalInputRecord(request);
  const tasks = filterRuntimeProjectionTasks(host, request);
  if (request.method === "list") {
    const status = readString(input.status);
    const limit = recordNumberByKeys(input, ["limit"]);
    const items = tasks
      .filter((task) => !status || task.status === status)
      .slice(
        0,
        limit === undefined ? undefined : Math.max(0, Math.floor(limit)),
      )
      .map(buildRuntimeTaskProjection);
    return {
      appId: request.appId,
      entryKey: request.entryKey,
      status: "read_only_projection",
      source: "agent_runtime_projection",
      taskCount: items.length,
      tasks: items,
    };
  }
  if (request.method === "get") {
    const taskId = readStringParam(request, "taskId", 0);
    const task = tasks.find((item) => item.taskId === taskId);
    return task
      ? buildRuntimeTaskProjection(task)
      : {
          taskId,
          status: "not_found",
          reason: "task_not_found",
          source: "agent_runtime_projection",
        };
  }
  if (request.method === "cancel") {
    readStringParam(request, "taskId", 0);
    return {
      status: "not_available",
      reason: "task_cancellation_must_use_lime_agent_cancel_task",
      source: "agent_runtime_projection",
      next: {
        capability: "lime.agent",
        method: "cancelTask",
      },
    };
  }
  if (request.method === "subscribe") {
    readStringParam(request, "taskId", 0);
    return {
      status: "not_available",
      reason: "task_subscription_must_use_lime_agent_stream_task",
      source: "agent_runtime_projection",
      next: {
        capability: "lime.agent",
        method: "streamTask",
      },
    };
  }
  throwUnsupportedMethod(request);
}

async function dispatchTools(
  host: CapabilityHost,
  request: AgentAppHostBridgeCapabilityRequest,
  resolveSdk?: () => LimeAppSdk,
): Promise<unknown> {
  const input = readOptionalInputRecord(request);
  const tasks = filterRuntimeProjectionTasks(host, request);
  const runs = buildRuntimeToolRuns(tasks);
  if (request.method === "invoke") {
    const response = buildGenericToolIntentResponse(request, input, runs);
    return attachToolExecutionHandoff(
      response,
      normalizeStringList(response.toolHints),
      resolveSdk,
    );
  }
  if (request.method === "getProgress") {
    return readGenericToolProgress(request, runs);
  }
  throwUnsupportedMethod(request);
}

async function dispatchSearch(
  host: CapabilityHost,
  request: AgentAppHostBridgeCapabilityRequest,
  resolveSdk?: () => LimeAppSdk,
): Promise<unknown> {
  const input = readOptionalInputRecord(request);
  const tasks = filterRuntimeProjectionTasks(host, request);
  const runs = buildRuntimeToolRuns(tasks, "lime.search");
  if (request.method === "getRun") {
    return readToolRun(request, runs);
  }
  if (request.method === "query" || request.method === "deepResearch") {
    readStringParam(request, "query", 0);
    const response = buildToolIntentResponse(
      request,
      "lime.search",
      input,
      runs,
    );
    return attachToolExecutionHandoff(
      response,
      normalizeStringList(response.toolHints),
      resolveSdk,
    );
  }
  throwUnsupportedMethod(request);
}

async function dispatchBrowser(
  host: CapabilityHost,
  request: AgentAppHostBridgeCapabilityRequest,
  resolveSdk?: () => LimeAppSdk,
): Promise<unknown> {
  const input = readOptionalInputRecord(request);
  const tasks = filterRuntimeProjectionTasks(host, request);
  const runs = buildRuntimeToolRuns(tasks, "lime.browser");
  if (request.method === "navigate") {
    readStringParam(request, "sessionId", 0);
    readStringParam(request, "url", 1);
  } else if (
    request.method === "extract" ||
    request.method === "screenshot" ||
    request.method === "close"
  ) {
    readStringParam(request, "sessionId", 0);
  } else if (request.method !== "open") {
    throwUnsupportedMethod(request);
  }
  const response = buildToolIntentResponse(
    request,
    "lime.browser",
    input,
    runs,
  );
  return attachToolExecutionHandoff(
    response,
    normalizeStringList(response.toolHints),
    resolveSdk,
  );
}

async function dispatchDocuments(
  host: CapabilityHost,
  request: AgentAppHostBridgeCapabilityRequest,
  resolveSdk?: () => LimeAppSdk,
): Promise<unknown> {
  const input = readOptionalInputRecord(request);
  const tasks = filterRuntimeProjectionTasks(host, request);
  const runs = buildRuntimeToolRuns(tasks, "lime.documents");
  if (request.method === "parse" || request.method === "summarize") {
    readStringParam(request, "ref", 0);
  } else if (request.method === "export") {
    readStringParam(request, "artifactId", 0);
    readStringParam(request, "format", 1);
  } else if (request.method === "transform") {
    readStringParam(request, "ref", 0);
    readStringParam(request, "operation", 1);
  } else {
    throwUnsupportedMethod(request);
  }
  const response = buildToolIntentResponse(
    request,
    "lime.documents",
    input,
    runs,
  );
  return attachToolExecutionHandoff(
    response,
    normalizeStringList(response.toolHints),
    resolveSdk,
  );
}

async function dispatchMedia(
  host: CapabilityHost,
  request: AgentAppHostBridgeCapabilityRequest,
  resolveSdk?: () => LimeAppSdk,
): Promise<unknown> {
  const input = readOptionalInputRecord(request);
  const tasks = filterRuntimeProjectionTasks(host, request);
  const runs = buildRuntimeToolRuns(tasks, "lime.media");
  if (request.method === "generateImage") {
    readStringParam(request, "prompt", 0);
  } else if (request.method === "editImage") {
    readStringParam(request, "ref", 0);
    readStringParam(request, "prompt", 1);
  } else if (request.method === "transcribe") {
    readStringParam(request, "ref", 0);
  } else if (request.method === "synthesizeVoice") {
    readStringParam(request, "text", 0);
  } else {
    throwUnsupportedMethod(request);
  }
  const response = buildToolIntentResponse(request, "lime.media", input, runs);
  return attachToolExecutionHandoff(
    response,
    normalizeStringList(response.toolHints),
    resolveSdk,
  );
}

async function dispatchMcp(
  host: CapabilityHost,
  request: AgentAppHostBridgeCapabilityRequest,
  resolveSdk?: () => LimeAppSdk,
): Promise<unknown> {
  const input = readOptionalInputRecord(request);
  const tasks = filterRuntimeProjectionTasks(host, request);
  const runs = buildRuntimeToolRuns(tasks, "lime.mcp");
  const tools = buildRuntimeMcpTools(runs);
  if (request.method === "listServers") {
    const servers = new Map<
      string,
      {
        serverId: string;
        toolCount: number;
        runIds: string[];
        lastSeenAt: string;
        source: "agent_runtime_process";
      }
    >();
    tools.forEach((tool) => {
      const existing = servers.get(tool.serverId);
      if (existing) {
        existing.toolCount += 1;
        existing.runIds = Array.from(
          new Set([...existing.runIds, ...tool.runIds]),
        );
        if (tool.lastSeenAt > existing.lastSeenAt) {
          existing.lastSeenAt = tool.lastSeenAt;
        }
        return;
      }
      servers.set(tool.serverId, {
        serverId: tool.serverId,
        toolCount: 1,
        runIds: [...tool.runIds],
        lastSeenAt: tool.lastSeenAt,
        source: "agent_runtime_process",
      });
    });
    return {
      appId: request.appId,
      status: "read_only_projection",
      source: "agent_runtime_process",
      servers: Array.from(servers.values()).sort((left, right) =>
        right.lastSeenAt.localeCompare(left.lastSeenAt),
      ),
    };
  }
  if (request.method === "listTools") {
    const serverId = readString(input.serverId);
    return {
      appId: request.appId,
      status: "read_only_projection",
      source: "agent_runtime_process",
      tools: serverId
        ? tools.filter((tool) => tool.serverId === serverId)
        : tools,
    };
  }
  if (request.method === "invoke") {
    readStringParam(request, "tool", 0);
    const response = buildToolIntentResponse(request, "lime.mcp", input, runs);
    return attachToolExecutionHandoff(
      response,
      normalizeStringList(response.toolHints),
      resolveSdk,
    );
  }
  throwUnsupportedMethod(request);
}

async function dispatchTerminal(
  host: CapabilityHost,
  request: AgentAppHostBridgeCapabilityRequest,
  resolveSdk?: () => LimeAppSdk,
): Promise<unknown> {
  const input = readOptionalInputRecord(request);
  const tasks = filterRuntimeProjectionTasks(host, request);
  const runs = buildRuntimeToolRuns(tasks, "lime.terminal");
  if (request.method === "getRun") {
    return readToolRun(request, runs);
  }
  if (request.method === "run") {
    readStringParam(request, "command", 0);
    const response = buildToolIntentResponse(
      request,
      "lime.terminal",
      input,
      runs,
    );
    return attachToolExecutionHandoff(
      response,
      normalizeStringList(response.toolHints),
      resolveSdk,
    );
  }
  if (request.method === "cancel") {
    return cancelToolExecutionViaAgentTask(request, input, runs, resolveSdk);
  }
  throwUnsupportedMethod(request);
}

async function dispatchConnectors(
  host: CapabilityHost,
  request: AgentAppHostBridgeCapabilityRequest,
  resolveSdk?: () => LimeAppSdk,
): Promise<unknown> {
  const input = readOptionalInputRecord(request);
  const tasks = filterRuntimeProjectionTasks(host, request);
  const runs = buildRuntimeToolRuns(tasks, "lime.connectors");
  const connectors = buildRuntimeConnectors(runs);
  const authorizationRequests = buildConnectorAuthorizationProjections(tasks);
  if (request.method === "list") {
    return {
      appId: request.appId,
      kind: readString(input.kind),
      status: "read_only_projection",
      source: "agent_runtime_process",
      connectors,
      authorizationRequests,
    };
  }
  if (request.method === "getStatus") {
    const connectorId = readStringParam(request, "connectorId", 0);
    const connector = connectors.find(
      (item) => item.connectorId === connectorId,
    );
    const authorizationRequest = authorizationRequests.find(
      (item) => item.connectorId === connectorId,
    );
    if (connector) {
      return {
        connectorId,
        status: "observed",
        source: "agent_runtime_process",
        connector,
        authorizationRequest,
      };
    }
    if (isHostFixtureConnectorAction(connectorId)) {
      return {
        connectorId,
        status: "authorized",
        source: "host_fixture_connector",
        connectorRuntimeFacts: buildConnectorRuntimeFacts(connectorId),
      };
    }
    if (authorizationRequest) {
      if (authorizationRequest.taskStatus === "succeeded") {
        return {
          connectorId,
          status: "authorized",
          source: "agent_app_connector_authorization_task",
          authorizationRequest,
          connectorRuntimeFacts: buildConnectorRuntimeFacts(
            connectorId,
            undefined,
            authorizationRequest,
            authorizationRequest.actionId,
          ),
        };
      }
      return {
        connectorId,
        status: "requires_host_authorization",
        source: "agent_app_connector_authorization_task",
        authorizationRequest,
      };
    }
    return {
      connectorId,
      status: "not_connected",
      reason: "no_connector_runtime_facts",
      source: "agent_runtime_process",
    };
  }
  if (request.method === "requestAuth") {
    const connectorId = readStringParam(request, "connectorId", 0);
    const reason = "connector_auth_requires_lime_policy_and_secret_binding";
    const authorizationRequest = buildConnectorAuthorizationRequestEnvelope(
      request,
      connectorId,
      input,
      reason,
    );
    return attachConnectorAuthorizationHandoff(
      {
        appId: request.appId,
        capability: "lime.connectors",
        method: request.method,
        status: "requires_host_authorization",
        reason,
        source: "tool_runtime_policy",
        intent: readToolIntent(input),
        authorizationGate: {
          status: "requires_host_authorization",
          owner: "lime_connector_policy",
          connectorId,
          secretBinding: "host_managed",
          tokenExposed: false,
          sessionScoped: true,
          request: authorizationRequest,
        },
        next: {
          capability: "lime.connectors",
          method: "invoke",
          reason: "after_host_authorization_and_agent_task",
        },
      },
      resolveSdk,
    );
  }
  if (request.method === "invoke") {
    const connectorId = readStringParam(request, "connectorId", 0);
    const action = readStringParam(request, "action", 1);
    const connector = connectors.find(
      (item) => item.connectorId === connectorId,
    );
    const authorizationRequest = authorizationRequests.find(
      (item) => item.connectorId === connectorId,
    );
    const fixtureRuntimeFacts = buildConnectorRuntimeFacts(
      connectorId,
      undefined,
      undefined,
      action,
    );
    if (
      !connector &&
      !fixtureRuntimeFacts &&
      authorizationRequest?.taskStatus !== "succeeded"
    ) {
      return {
        appId: request.appId,
        capability: "lime.connectors",
        method: request.method,
        status: "requires_host_authorization",
        reason: authorizationRequest
          ? "connector_authorization_task_not_completed"
          : "connector_authorization_required_before_execution",
        source: authorizationRequest
          ? "agent_app_connector_authorization_task"
          : "tool_runtime_policy",
        intent: readToolIntent(input),
        authorizationGate: {
          status: "requires_host_authorization",
          owner: "lime_connector_policy",
          connectorId,
          secretBinding: "host_managed",
          tokenExposed: false,
          sessionScoped: true,
          authorizationRequest,
        },
        next: {
          capability: "lime.connectors",
          method: "requestAuth",
          reason: authorizationRequest
            ? "wait_for_host_managed_authorization_task"
            : "connector_auth_required_before_agent_task_execution",
        },
      };
    }
    const connectorRuntimeFacts = buildConnectorRuntimeFacts(
      connectorId,
      connector,
      authorizationRequest,
      action,
      { exposeSecretLeaseRef: true },
    );
    const executionInput = connectorRuntimeFacts
      ? {
          ...input,
          connectorRuntimeFacts,
        }
      : input;
    const response = buildToolIntentResponse(
      request,
      "lime.connectors",
      executionInput,
      runs,
      {
        toolName: `connector__${connectorId}__${action}`,
        action,
        exposeSecretLeaseRefToInternal: true,
      },
    );
    return attachToolExecutionHandoff(
      response,
      normalizeStringList(response.toolHints),
      resolveSdk,
    );
  }
  throwUnsupportedMethod(request);
}

function dispatchUsage(
  host: CapabilityHost,
  request: AgentAppHostBridgeCapabilityRequest,
): unknown {
  const input = readOptionalInputRecord(request);
  const tasks = filterRuntimeProjectionTasks(host, request);
  const usageItems = tasks
    .map(buildUsageProjection)
    .filter((item): item is RuntimeUsageProjection => Boolean(item));
  const costItems = tasks
    .map(buildCostProjection)
    .filter((item): item is RuntimeCostProjection => Boolean(item));
  const budgetItems = tasks
    .map(buildBudgetProjection)
    .filter((item): item is RuntimeBudgetProjection => Boolean(item));
  if (request.method === "getTokenUsage") {
    return {
      appId: request.appId,
      taskId: readString(input.taskId),
      window: readString(input.window),
      source: "agent_runtime_projection",
      taskCount: tasks.length,
      totals: aggregateUsage(usageItems),
      tasks: usageItems,
    };
  }
  if (request.method === "getCostSummary") {
    return {
      appId: request.appId,
      taskId: readString(input.taskId),
      window: readString(input.window),
      source: "agent_runtime_projection",
      taskCount: tasks.length,
      cost: aggregateCost(costItems),
      tasks: costItems,
    };
  }
  if (request.method === "getBudget") {
    const scope = readString(input.scope) ?? "app";
    if (budgetItems.length > 0) {
      return {
        appId: request.appId,
        scope,
        status: "observed",
        source: "agent_runtime_projection",
        taskCount: tasks.length,
        budgetCount: budgetItems.length,
        observedCost: aggregateCost(costItems),
        latest: budgetItems[0],
        tasks: budgetItems,
      };
    }
    return {
      appId: request.appId,
      scope,
      status: "not_configured",
      reason: "no_agent_runtime_budget_facts",
      source: "agent_runtime_projection",
      observedCost: aggregateCost(costItems),
    };
  }
  throwUnsupportedMethod(request);
}

export function createAgentAppCapabilityDispatcher({
  host,
  projection,
  entryKey,
  runId,
  profile = p0HostCapabilityProfile,
  runtimeProfile,
  manifestVersion,
  agentRuntime,
  requirements,
  boundary,
  integrations,
  operations,
}: CreateAgentAppCapabilityDispatcherOptions): AgentAppCapabilityDispatcher {
  return async (request) => {
    if (request.capability === "lime.capabilities") {
      return dispatchCapabilities(request, profile, runtimeProfile, {
        manifestVersion,
        agentRuntime,
        requirements,
        boundary,
        integrations,
        operations,
      });
    }

    assertCapabilityDeclared(projection, request, entryKey);

    const resolveSdk = () =>
      host.createSdkContext(
        request.entryKey ?? entryKey,
        resolveRunId(request, runId),
      );

    if (request.capability === "lime.models") {
      return dispatchModels(host, request);
    }
    if (request.capability === "lime.cloudSession") {
      return dispatchCloudSession(request);
    }
    if (request.capability === "lime.usage") {
      return dispatchUsage(host, request);
    }
    if (request.capability === "lime.skills") {
      return dispatchSkills(host, request);
    }
    if (request.capability === "lime.memory") {
      return dispatchMemory(host, request);
    }
    if (request.capability === "lime.context") {
      return dispatchContext(host, request);
    }
    if (request.capability === "lime.tasks") {
      return dispatchTasks(host, request);
    }
    if (request.capability === "lime.tools") {
      return dispatchTools(host, request, resolveSdk);
    }
    if (request.capability === "lime.search") {
      return dispatchSearch(host, request, resolveSdk);
    }
    if (request.capability === "lime.browser") {
      return dispatchBrowser(host, request, resolveSdk);
    }
    if (request.capability === "lime.documents") {
      return dispatchDocuments(host, request, resolveSdk);
    }
    if (request.capability === "lime.media") {
      return dispatchMedia(host, request, resolveSdk);
    }
    if (request.capability === "lime.mcp") {
      return dispatchMcp(host, request, resolveSdk);
    }
    if (request.capability === "lime.terminal") {
      return dispatchTerminal(host, request, resolveSdk);
    }
    if (request.capability === "lime.connectors") {
      return dispatchConnectors(host, request, resolveSdk);
    }

    const sdk = resolveSdk();

    if (request.capability === "lime.storage") {
      return dispatchStorage(sdk, request, projection);
    }
    if (request.capability === "lime.artifacts") {
      return dispatchArtifacts(sdk, request, projection);
    }
    if (request.capability === "lime.evidence") {
      return dispatchEvidence(sdk, request, projection);
    }
    if (request.capability === "lime.knowledge") {
      return dispatchKnowledge(sdk, request);
    }
    if (request.capability === "lime.agent") {
      return dispatchAgent(sdk, request, projection);
    }
    throw new AgentAppCapabilityDispatcherError(
      "UNSUPPORTED_CAPABILITY",
      `${request.capability} is not supported by Agent App Host Bridge.`,
    );
  };
}
