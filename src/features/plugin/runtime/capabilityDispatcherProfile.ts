import {
  type LimeCapabilityDefinitionRecord,
  type LimeCapabilityName,
} from "../sdk/capabilityCatalog";
import type { HostCapabilityProfile, LimeRuntimeProfile } from "../types";

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

export function buildCapabilityDiscoveryEntry(
  definition: LimeCapabilityDefinitionRecord,
  profile: HostCapabilityProfile,
  runtimeProfile?: LimeRuntimeProfile,
): CapabilityDiscoveryEntry {
  const support = resolveCapabilityProfileSupport(definition, profile);
  const runtimeSupport = runtimeProfile?.capabilities[definition.name];
  const implementation = support?.implementation ?? "none";
  const effectiveImplementation =
    runtimeSupport?.implementation ?? implementation;
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

export function buildPluginStandardProfile(params: {
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

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
