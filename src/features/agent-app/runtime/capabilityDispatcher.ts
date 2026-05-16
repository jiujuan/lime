import {
  compatibleAgentAppStandardVersions,
  currentAgentAppStandardVersion,
  p0HostCapabilityProfile,
} from "../readiness/hostCapabilityProfile";
import type { CapabilityHost, LimeAppSdk } from "../sdk/CapabilityHost";
import {
  LIME_CAPABILITY_DEFINITIONS,
  type LimeCapabilityDefinitionRecord,
  type LimeCapabilityName,
} from "../sdk/capabilityCatalog";
import type {
  AgentAppProjection,
  AgentAppRuntimeProcessCost,
  AgentAppRuntimeProcessModel,
  AgentAppRuntimeProcessTimelineItem,
  AgentAppRuntimeProcessUsage,
  AgentAppTaskRecord,
  AgentAppTaskRequest,
  HostCapabilityProfile,
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

interface RuntimeSkillProjection {
  skillId: string;
  name: string;
  status: "declared" | "invoked";
  taskCount: number;
  invocationCount: number;
  taskIds: string[];
  taskKinds: string[];
  lastSeenAt: string;
  source: "agent_runtime_process";
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
  source: "agent_runtime_projection";
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
  status: AgentAppTaskRecord["status"] | "declared" | "observed";
  startedAt: string;
  finishedAt?: string;
  title: string;
  statusText: string;
  message: string;
  detail?: string;
  source: "agent_runtime_process";
}

interface RuntimeMcpToolProjection {
  toolName: string;
  serverId: string;
  toolId: string;
  runIds: string[];
  taskIds: string[];
  lastSeenAt: string;
  source: "agent_runtime_process";
}

interface RuntimeConnectorProjection {
  connectorId: string;
  actionIds: string[];
  runIds: string[];
  taskIds: string[];
  lastSeenAt: string;
  source: "agent_runtime_process";
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
    return sdk.agent.streamTask(readStringParam(request, "taskId", 0));
  }
  if (request.method === "getTask") {
    return sdk.agent.getTask(readStringParam(request, "taskId", 0));
  }
  if (request.method === "cancelTask") {
    return sdk.agent.cancelTask(readStringParam(request, "taskId", 0));
  }
  if (request.method === "retryTask") {
    return sdk.agent.retryTask(readStringParam(request, "taskId", 0));
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
): CapabilityDiscoveryEntry {
  const support = resolveCapabilityProfileSupport(definition, profile);
  const implementation = support?.implementation ?? "none";
  const enabled = support?.enabled === true && implementation !== "none";
  const unavailableReason = enabled
    ? undefined
    : String(definition.stage) === "planned"
      ? "planned"
      : implementation === "none"
        ? "not_implemented"
        : "disabled";

  const entry: CapabilityDiscoveryEntry = {
    name: definition.name,
    version: support?.version ?? definition.version,
    group: definition.group,
    stage: definition.stage,
    owner: definition.owner,
    methods: [...definition.methods],
    summary: definition.summary,
    enabled,
    implementation,
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

function dispatchCapabilities(
  request: AgentAppHostBridgeCapabilityRequest,
  profile: HostCapabilityProfile,
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
      buildCapabilityDiscoveryEntry(definition, profile),
    );
  }
  if (request.method === "get") {
    const capability = readStringParam(request, "capability", 0);
    return buildCapabilityDiscoveryEntry(
      resolveCapabilityDefinition(capability),
      profile,
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
          buildCapabilityDiscoveryEntry(definition, profile),
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
      }
      return;
    }
    summaries.set(key, {
      ...item.model,
      taskCount: 1,
      taskKinds: [item.taskKind],
      lastTaskId: item.taskId,
      lastSeenAt: String(item.finishedAt ?? item.startedAt),
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
  });
  return Array.from(summaries.values()).sort((left, right) =>
    right.lastSeenAt.localeCompare(left.lastSeenAt),
  );
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
    return [...observed, ...declared];
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
  return Object.fromEntries(
    Object.entries(input).filter(([key]) => TOOL_INTENT_KEYS.has(key)),
  );
}

function buildToolIntentResponse(
  request: AgentAppHostBridgeCapabilityRequest,
  capability: ToolIntegrationCapability,
  input: Record<string, unknown>,
  runs: RuntimeToolRunProjection[],
): unknown {
  const spec = TOOL_INTEGRATION_SPECS[capability];
  return {
    appId: request.appId,
    capability,
    method: request.method,
    status: "requires_agent_task",
    reason: spec.reason,
    source: "tool_runtime_policy",
    intent: readToolIntent(input),
    toolHints: spec.toolHints,
    matchingRuns: runs,
    next: {
      capability: "lime.agent",
      method: "startTask",
      reason: "actual_tool_execution_is_owned_by_lime_agent_runtime",
    },
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
      source: "agent_runtime_process",
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
      source: "agent_runtime_process",
    });
  });
  return Array.from(connectors.values()).sort((left, right) =>
    right.lastSeenAt.localeCompare(left.lastSeenAt),
  );
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

function buildRuntimeMemoryProjection(
  task: AgentAppTaskRecord,
): RuntimeMemoryProjection {
  const diagnostics = readTaskThreadDiagnostics(task);
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
    source: "agent_runtime_projection",
  };
}

function buildRuntimeContextProjection(
  task: AgentAppTaskRecord,
): RuntimeContextProjection {
  const threadRead = readTaskThreadRead(task);
  const diagnostics = readTaskThreadDiagnostics(task);
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
        [item.taskId, item.taskKind, ...item.knowledgeBindingKeys]
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

function dispatchSearch(
  host: CapabilityHost,
  request: AgentAppHostBridgeCapabilityRequest,
): unknown {
  const input = readOptionalInputRecord(request);
  const tasks = filterRuntimeProjectionTasks(host, request);
  const runs = buildRuntimeToolRuns(tasks, "lime.search");
  if (request.method === "getRun") {
    return readToolRun(request, runs);
  }
  if (request.method === "query" || request.method === "deepResearch") {
    readStringParam(request, "query", 0);
    return buildToolIntentResponse(request, "lime.search", input, runs);
  }
  throwUnsupportedMethod(request);
}

function dispatchBrowser(
  host: CapabilityHost,
  request: AgentAppHostBridgeCapabilityRequest,
): unknown {
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
  return buildToolIntentResponse(request, "lime.browser", input, runs);
}

function dispatchDocuments(
  host: CapabilityHost,
  request: AgentAppHostBridgeCapabilityRequest,
): unknown {
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
  return buildToolIntentResponse(request, "lime.documents", input, runs);
}

function dispatchMedia(
  host: CapabilityHost,
  request: AgentAppHostBridgeCapabilityRequest,
): unknown {
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
  return buildToolIntentResponse(request, "lime.media", input, runs);
}

function dispatchMcp(
  host: CapabilityHost,
  request: AgentAppHostBridgeCapabilityRequest,
): unknown {
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
    return buildToolIntentResponse(request, "lime.mcp", input, runs);
  }
  throwUnsupportedMethod(request);
}

function dispatchTerminal(
  host: CapabilityHost,
  request: AgentAppHostBridgeCapabilityRequest,
): unknown {
  const input = readOptionalInputRecord(request);
  const tasks = filterRuntimeProjectionTasks(host, request);
  const runs = buildRuntimeToolRuns(tasks, "lime.terminal");
  if (request.method === "getRun") {
    return readToolRun(request, runs);
  }
  if (request.method === "run") {
    readStringParam(request, "command", 0);
    return buildToolIntentResponse(request, "lime.terminal", input, runs);
  }
  if (request.method === "cancel") {
    return {
      status: "not_available",
      reason: "terminal_runtime_cancellation_not_exposed_to_agent_apps",
      source: "tool_runtime_policy",
    };
  }
  throwUnsupportedMethod(request);
}

function dispatchConnectors(
  host: CapabilityHost,
  request: AgentAppHostBridgeCapabilityRequest,
): unknown {
  const input = readOptionalInputRecord(request);
  const tasks = filterRuntimeProjectionTasks(host, request);
  const runs = buildRuntimeToolRuns(tasks, "lime.connectors");
  const connectors = buildRuntimeConnectors(runs);
  if (request.method === "list") {
    return {
      appId: request.appId,
      kind: readString(input.kind),
      status: "read_only_projection",
      source: "agent_runtime_process",
      connectors,
    };
  }
  if (request.method === "getStatus") {
    const connectorId = readStringParam(request, "connectorId", 0);
    const connector = connectors.find(
      (item) => item.connectorId === connectorId,
    );
    return connector
      ? {
          connectorId,
          status: "observed",
          source: "agent_runtime_process",
          connector,
        }
      : {
          connectorId,
          status: "not_connected",
          reason: "no_connector_runtime_facts",
          source: "agent_runtime_process",
        };
  }
  if (request.method === "requestAuth") {
    readStringParam(request, "connectorId", 0);
    return {
      appId: request.appId,
      capability: "lime.connectors",
      method: request.method,
      status: "requires_host_authorization",
      reason: "connector_auth_requires_lime_policy_and_secret_binding",
      source: "tool_runtime_policy",
      intent: readToolIntent(input),
    };
  }
  if (request.method === "invoke") {
    readStringParam(request, "connectorId", 0);
    readStringParam(request, "action", 1);
    return buildToolIntentResponse(request, "lime.connectors", input, runs);
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
    return {
      appId: request.appId,
      scope: readString(input.scope) ?? "app",
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
  manifestVersion,
  agentRuntime,
  requirements,
  boundary,
  integrations,
  operations,
}: CreateAgentAppCapabilityDispatcherOptions): AgentAppCapabilityDispatcher {
  return async (request) => {
    if (request.capability === "lime.capabilities") {
      return dispatchCapabilities(request, profile, {
        manifestVersion,
        agentRuntime,
        requirements,
        boundary,
        integrations,
        operations,
      });
    }

    assertCapabilityDeclared(projection, request, entryKey);

    if (request.capability === "lime.models") {
      return dispatchModels(host, request);
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
    if (request.capability === "lime.search") {
      return dispatchSearch(host, request);
    }
    if (request.capability === "lime.browser") {
      return dispatchBrowser(host, request);
    }
    if (request.capability === "lime.documents") {
      return dispatchDocuments(host, request);
    }
    if (request.capability === "lime.media") {
      return dispatchMedia(host, request);
    }
    if (request.capability === "lime.mcp") {
      return dispatchMcp(host, request);
    }
    if (request.capability === "lime.terminal") {
      return dispatchTerminal(host, request);
    }
    if (request.capability === "lime.connectors") {
      return dispatchConnectors(host, request);
    }

    const sdk = host.createSdkContext(
      request.entryKey ?? entryKey,
      resolveRunId(request, runId),
    );

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
