import {
  collectRuntimeCapabilityManifestValidationIssues,
  collectRuntimeResumeContractValidationIssues,
  type AgentRuntimeCapabilityEntry,
  type AgentRuntimeCapabilityManifest,
  type AgentRuntimeResumeActionDecision,
  type AgentRuntimeResumeContract,
} from "@limecloud/agent-ui-contracts";
import type {
  AppServerCapabilityDescriptor,
  AppServerRuntimeCapabilityManifest,
} from "@/lib/api/appServer";

const CAPABILITY_MANIFEST_SCHEMA_VERSION =
  "lime-runtime-capability-manifest/v0.1";
const RESUME_CONTRACT_SCHEMA_VERSION = "lime-runtime-resume-contract/v0.1";
const DEFAULT_RUNTIME_ID = "app-server";

export interface BuildAgentRuntimeCapabilityManifestOptions {
  runtimeId?: string;
  providerId?: string;
  sessionId?: string;
  generatedAt?: string;
}

export interface BuildAgentRuntimeResumeContractOptions {
  runtimeId?: string;
  sessionId: string;
  turnId?: string;
  openActionIds?: string[];
  decisions?: AgentRuntimeResumeActionDecision[];
  createdAt?: string;
  expiresAt?: string;
}

export function buildAgentRuntimeCapabilityManifest(
  capabilities: AppServerCapabilityDescriptor[],
  options: BuildAgentRuntimeCapabilityManifestOptions = {},
): AgentRuntimeCapabilityManifest {
  const manifest: AgentRuntimeCapabilityManifest = {
    schemaVersion: CAPABILITY_MANIFEST_SCHEMA_VERSION,
    runtimeId: normalizeString(options.runtimeId) ?? DEFAULT_RUNTIME_ID,
    ...(normalizeString(options.providerId)
      ? { providerId: normalizeString(options.providerId) }
      : {}),
    ...(normalizeString(options.sessionId)
      ? { sessionId: normalizeString(options.sessionId) }
      : {}),
    generatedAt: normalizeString(options.generatedAt) ?? new Date().toISOString(),
    capabilities: capabilities.map(agentRuntimeCapabilityEntryFromDescriptor),
  };
  assertAgentRuntimeCapabilityManifest(manifest);
  return manifest;
}

export function agentRuntimeCapabilityManifestFromAppServerResponse(
  capabilities: AppServerCapabilityDescriptor[],
  manifest?: AppServerRuntimeCapabilityManifest | null,
  options: BuildAgentRuntimeCapabilityManifestOptions = {},
): AgentRuntimeCapabilityManifest {
  if (manifest) {
    assertAgentRuntimeCapabilityManifest(manifest);
    return manifest;
  }
  return buildAgentRuntimeCapabilityManifest(capabilities, options);
}

export function buildAgentRuntimeResumeContract(
  options: BuildAgentRuntimeResumeContractOptions,
): AgentRuntimeResumeContract {
  const sessionId = requireNonEmptyString(options.sessionId, "sessionId");
  const openActionIds = uniqueStrings(options.openActionIds);
  const decisions = options.decisions ?? [];
  const contract: AgentRuntimeResumeContract = {
    schemaVersion: RESUME_CONTRACT_SCHEMA_VERSION,
    runtimeId: normalizeString(options.runtimeId) ?? DEFAULT_RUNTIME_ID,
    sessionId,
    turnId: normalizeString(options.turnId) ?? "thread",
    resumeMode: openActionIds.length > 0 ? "selected-actions" : "all-open-actions",
    openActionIds,
    decisions,
    ...(normalizeString(options.expiresAt)
      ? { expiresAt: normalizeString(options.expiresAt) }
      : {}),
    createdAt: normalizeString(options.createdAt) ?? new Date().toISOString(),
  };
  assertAgentRuntimeResumeContract(contract);
  return contract;
}

export function assertAgentRuntimeCapabilityManifest(
  manifest: AgentRuntimeCapabilityManifest,
): void {
  const issues = collectRuntimeCapabilityManifestValidationIssues(manifest);
  if (issues.length > 0) {
    throw new Error(
      `Invalid Agent Runtime capability manifest: ${issues
        .map((issue) => `${issue.path} ${issue.message}`)
        .join("; ")}`,
    );
  }
}

export function assertAgentRuntimeResumeContract(
  contract: AgentRuntimeResumeContract,
): void {
  const issues = collectRuntimeResumeContractValidationIssues(contract);
  if (issues.length > 0) {
    throw new Error(
      `Invalid Agent Runtime resume contract: ${issues
        .map((issue) => `${issue.path} ${issue.message}`)
        .join("; ")}`,
    );
  }
}

function agentRuntimeCapabilityEntryFromDescriptor(
  descriptor: AppServerCapabilityDescriptor,
): AgentRuntimeCapabilityEntry {
  const id = requireNonEmptyString(descriptor.id, "capability.id");
  return {
    id: capabilityIdFromDescriptorId(id),
    status: "supported",
    scope: capabilityScopeFromDescriptorId(id),
    title: normalizeString(descriptor.title) ?? id,
    ...(normalizeString(descriptor.description)
      ? { detail: normalizeString(descriptor.description) }
      : {}),
    metadata: {
      appServerCapabilityId: id,
      methods: Array.isArray(descriptor.methods)
        ? descriptor.methods.filter(
            (method): method is string =>
              typeof method === "string" && method.trim().length > 0,
          )
        : [],
    },
  };
}

function capabilityIdFromDescriptorId(id: string): string {
  if (id === "agent.session") return "transport.jsonrpc";
  if (id.includes("state.delta")) return "state.delta";
  if (id.includes("snapshot") || id.includes("session")) return "state.snapshot";
  if (id.includes("action") || id.includes("hitl")) return "hitl.actions";
  if (id.includes("resume")) return "hitl.resume";
  if (id.includes("subagent")) return "subagents.handoff";
  if (id.includes("evidence")) return "evidence.export";
  if (id.includes("tool")) return "tools.native";
  return id;
}

function capabilityScopeFromDescriptorId(id: string): AgentRuntimeCapabilityEntry["scope"] {
  if (id.startsWith("session.") || id.includes(".session")) return "session";
  if (id.startsWith("turn.") || id.includes(".turn")) return "turn";
  if (id.startsWith("tool.") || id.includes(".tool")) return "tool";
  if (id.startsWith("provider.") || id.includes(".provider")) return "provider";
  return "runtime";
}

function normalizeString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function requireNonEmptyString(value: unknown, field: string): string {
  const normalized = normalizeString(value);
  if (!normalized) {
    throw new Error(`${field} is required`);
  }
  return normalized;
}

function uniqueStrings(values: unknown[] | undefined): string[] {
  if (!Array.isArray(values)) return [];
  return Array.from(
    new Set(
      values
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter((value) => value.length > 0),
    ),
  );
}
