import type { AgentRuntimeThreadReadModel } from "@/lib/api/agentRuntime/sessionTypes";

export interface RuntimePolicyEvidence {
  shouldRender: boolean;
  decisionReason: string | null;
  fallbackChain: string[];
  primaryBlockingKind: string | null;
  primaryBlockingSummary: string | null;
  interruptReason: string | null;
  policyName: string | null;
  policyProfile: string | null;
  warningPolicy: string | null;
  warningPolicySource: string | null;
  restrictionProfile: string | null;
  restrictionProfileSource: string | null;
  sandboxPolicy: string | null;
  sandboxPolicySource: string | null;
  sandboxBackend: string | null;
  sandboxBackendStatus: string | null;
  sandboxBackendEnforced: string | null;
  sandboxBackendRequired: string | null;
  sandboxBackendReasonCode: string | null;
  sandboxBackendReason: string | null;
  sandboxBackendPlatform: string | null;
  workspaceSandboxConfigSource: string | null;
  networkRuleId: string | null;
  networkRuleTarget: string | null;
  networkRuleSource: string | null;
  networkRiskLevel: string | null;
  networkRiskReason: string | null;
  networkUrl: string | null;
  networkHost: string | null;
  networkDecision: RuntimePolicyNetworkDecision | null;
  latestWarning: string | null;
}

export interface RuntimePolicyNetworkDecision {
  status: "deny" | "ask" | "unknown";
  reasonCode: string;
  summary: string;
  canRequestPolicyChange: boolean;
}

export interface RuntimePolicyEvidenceLineText {
  decisionReason: string;
  fallbackChain: string;
  network: string;
  networkDecision: string;
  policy: string;
  policyFailure: string;
  policyProfile: string;
  policySources: string;
  sandbox: string;
  sandboxBackend: string;
  unknown: string;
}

const POLICY_FIELD_SOURCES = ["policyName", "policy_name", "policy"] as const;
const POLICY_PROFILE_FIELD_SOURCES = [
  "policyProfile",
  "policy_profile",
  "profile",
] as const;
const SANDBOX_FIELD_SOURCES = [
  "sandboxPolicy",
  "sandbox_policy",
  "sandbox",
] as const;
const WARNING_POLICY_FIELD_SOURCES = [
  "warningPolicy",
  "warning_policy",
] as const;
const WARNING_POLICY_SOURCE_FIELD_SOURCES = [
  "warningPolicySource",
  "warning_policy_source",
] as const;
const RESTRICTION_PROFILE_FIELD_SOURCES = [
  "restrictionProfile",
  "restriction_profile",
] as const;
const RESTRICTION_PROFILE_SOURCE_FIELD_SOURCES = [
  "restrictionProfileSource",
  "restriction_profile_source",
] as const;
const SANDBOX_POLICY_SOURCE_FIELD_SOURCES = [
  "sandboxPolicySource",
  "sandbox_policy_source",
] as const;
const SANDBOX_BACKEND_FIELD_SOURCES = [
  "sandboxBackend",
  "sandbox_backend",
] as const;
const SANDBOX_BACKEND_STATUS_FIELD_SOURCES = [
  "sandboxBackendStatus",
  "sandbox_backend_status",
] as const;
const SANDBOX_BACKEND_ENFORCED_FIELD_SOURCES = [
  "sandboxBackendEnforced",
  "sandbox_backend_enforced",
] as const;
const SANDBOX_BACKEND_REQUIRED_FIELD_SOURCES = [
  "sandboxBackendRequired",
  "sandbox_backend_required",
] as const;
const SANDBOX_BACKEND_REASON_CODE_FIELD_SOURCES = [
  "sandboxBackendReasonCode",
  "sandbox_backend_reason_code",
] as const;
const SANDBOX_BACKEND_REASON_FIELD_SOURCES = [
  "sandboxBackendReason",
  "sandbox_backend_reason",
] as const;
const SANDBOX_BACKEND_PLATFORM_FIELD_SOURCES = [
  "sandboxBackendPlatform",
  "sandbox_backend_platform",
] as const;
const WORKSPACE_SANDBOX_CONFIG_SOURCE_FIELD_SOURCES = [
  "workspaceSandboxConfigSource",
  "workspace_sandbox_config_source",
] as const;
const NETWORK_RULE_ID_FIELD_SOURCES = [
  "networkRuleId",
  "network_rule_id",
] as const;
const NETWORK_RULE_TARGET_FIELD_SOURCES = [
  "networkRuleTarget",
  "network_rule_target",
] as const;
const NETWORK_RULE_SOURCE_FIELD_SOURCES = [
  "networkRuleSource",
  "network_rule_source",
] as const;
const NETWORK_RISK_LEVEL_FIELD_SOURCES = [
  "networkRiskLevel",
  "network_risk_level",
] as const;
const NETWORK_RISK_REASON_FIELD_SOURCES = [
  "networkRiskReasonCode",
  "network_risk_reason_code",
  "networkRiskReason",
  "network_risk_reason",
] as const;
const NETWORK_URL_FIELD_SOURCES = ["networkUrl", "network_url"] as const;
const NETWORK_HOST_FIELD_SOURCES = ["networkHost", "network_host"] as const;

export function asPolicyEvidenceRecord(
  value: unknown,
): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function policyEvidenceStringField(
  record: Record<string, unknown> | null | undefined,
  keys: string[],
): string | null {
  for (const key of keys) {
    const value = record?.[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function policyEvidenceStringArrayField(
  record: Record<string, unknown> | null | undefined,
  keys: string[],
): string[] | null {
  for (const key of keys) {
    const value = record?.[key];
    if (!Array.isArray(value)) {
      continue;
    }
    const values = value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean);
    if (values.length > 0) {
      return values;
    }
  }
  return null;
}

function firstPolicyEvidenceStringField(
  records: Array<Record<string, unknown> | null | undefined>,
  keys: readonly string[],
): string | null {
  for (const record of records) {
    const value = policyEvidenceStringField(record, [...keys]);
    if (value) {
      return value;
    }
  }
  return null;
}

function policyEvidenceScalarStringField(
  record: Record<string, unknown> | null | undefined,
  keys: string[],
): string | null {
  for (const key of keys) {
    const value = record?.[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
    if (typeof value === "boolean") {
      return String(value);
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }
  return null;
}

function firstPolicyEvidenceScalarField(
  records: Array<Record<string, unknown> | null | undefined>,
  keys: readonly string[],
): string | null {
  for (const record of records) {
    const value = policyEvidenceScalarStringField(record, [...keys]);
    if (value) {
      return value;
    }
  }
  return null;
}

function resolveNetworkDecision(
  params: Pick<
    RuntimePolicyEvidence,
    | "primaryBlockingKind"
    | "primaryBlockingSummary"
    | "networkRuleId"
    | "networkRiskLevel"
    | "networkRiskReason"
    | "networkHost"
    | "networkUrl"
  >,
): RuntimePolicyNetworkDecision | null {
  if (!params.networkRuleId && !params.networkHost && !params.networkUrl) {
    return null;
  }
  const normalizedRisk = params.networkRiskLevel?.toLowerCase() ?? "";
  const normalizedBlocking = params.primaryBlockingKind?.toLowerCase() ?? "";
  const isDenied =
    normalizedRisk === "high" ||
    normalizedRisk === "critical" ||
    normalizedBlocking.includes("blocked") ||
    normalizedBlocking.includes("denied");
  const target =
    params.networkHost || params.networkUrl || params.networkRuleId;
  const reasonCode =
    params.networkRiskReason ||
    params.primaryBlockingKind ||
    "network_policy_rule";
  if (isDenied) {
    return {
      status: "deny",
      reasonCode,
      summary:
        params.primaryBlockingSummary ||
        (target
          ? `Network access to ${target} was blocked by policy.`
          : "Network access was blocked by policy."),
      canRequestPolicyChange: true,
    };
  }
  return {
    status: "ask",
    reasonCode,
    summary: target
      ? `Network access to ${target} requires policy review.`
      : "Network access requires policy review.",
    canRequestPolicyChange: true,
  };
}

export function buildRuntimePolicySourceParts(
  evidence: Pick<
    RuntimePolicyEvidence,
    "warningPolicySource" | "restrictionProfileSource" | "sandboxPolicySource"
  >,
): string[] {
  return [
    evidence.warningPolicySource
      ? `warning=${evidence.warningPolicySource}`
      : null,
    evidence.restrictionProfileSource
      ? `restriction=${evidence.restrictionProfileSource}`
      : null,
    evidence.sandboxPolicySource
      ? `sandbox=${evidence.sandboxPolicySource}`
      : null,
  ].filter((item): item is string => Boolean(item));
}

export function buildRuntimeSandboxBackendParts(
  evidence: Pick<
    RuntimePolicyEvidence,
    | "sandboxBackend"
    | "sandboxBackendStatus"
    | "sandboxBackendEnforced"
    | "sandboxBackendRequired"
    | "sandboxBackendPlatform"
    | "workspaceSandboxConfigSource"
    | "sandboxBackendReasonCode"
    | "sandboxBackendReason"
  >,
): string[] {
  return [
    evidence.sandboxBackend ? `backend=${evidence.sandboxBackend}` : null,
    evidence.sandboxBackendStatus
      ? `status=${evidence.sandboxBackendStatus}`
      : null,
    evidence.sandboxBackendEnforced
      ? `enforced=${evidence.sandboxBackendEnforced}`
      : null,
    evidence.sandboxBackendRequired
      ? `required=${evidence.sandboxBackendRequired}`
      : null,
    evidence.sandboxBackendPlatform
      ? `platform=${evidence.sandboxBackendPlatform}`
      : null,
    evidence.workspaceSandboxConfigSource
      ? `source=${evidence.workspaceSandboxConfigSource}`
      : null,
    evidence.sandboxBackendReasonCode
      ? `reason=${evidence.sandboxBackendReasonCode}`
      : null,
    evidence.sandboxBackendReason,
  ].filter((item): item is string => Boolean(item));
}

export function resolveRuntimePolicyEvidence(params: {
  threadRead?: AgentRuntimeThreadReadModel | null;
  decisionReason?: string | null;
  fallbackChain?: string[];
}): RuntimePolicyEvidence {
  const diagnostics = asPolicyEvidenceRecord(params.threadRead?.diagnostics);
  const modelRouting = asPolicyEvidenceRecord(params.threadRead?.model_routing);
  const runtimeSummary = asPolicyEvidenceRecord(
    params.threadRead?.runtime_summary,
  );
  const latestFailedTool = asPolicyEvidenceRecord(
    diagnostics?.latest_failed_tool,
  );
  const latestFailedCommand = asPolicyEvidenceRecord(
    diagnostics?.latest_failed_command,
  );
  const latestWarning = asPolicyEvidenceRecord(diagnostics?.latest_warning);
  const policyMetadataSources = [
    latestFailedCommand,
    latestFailedTool,
    diagnostics,
    modelRouting,
    runtimeSummary,
  ];
  const decisionReason =
    params.decisionReason ||
    policyEvidenceStringField(modelRouting, [
      "decisionReason",
      "decision_reason",
    ]) ||
    policyEvidenceStringField(runtimeSummary, [
      "decisionReason",
      "decision_reason",
    ]);
  const fallbackChain =
    params.fallbackChain && params.fallbackChain.length > 0
      ? params.fallbackChain
      : policyEvidenceStringArrayField(modelRouting, [
          "fallbackChain",
          "fallback_chain",
        ]) || [];
  const evidence: RuntimePolicyEvidence = {
    shouldRender: false,
    decisionReason,
    fallbackChain,
    primaryBlockingKind: policyEvidenceStringField(diagnostics, [
      "primary_blocking_kind",
      "primaryBlockingKind",
    ]),
    primaryBlockingSummary: policyEvidenceStringField(diagnostics, [
      "primary_blocking_summary",
      "primaryBlockingSummary",
    ]),
    interruptReason: policyEvidenceStringField(diagnostics, [
      "interrupt_reason",
      "interruptReason",
    ]),
    policyName: firstPolicyEvidenceStringField(
      policyMetadataSources,
      POLICY_FIELD_SOURCES,
    ),
    policyProfile: firstPolicyEvidenceStringField(
      policyMetadataSources,
      POLICY_PROFILE_FIELD_SOURCES,
    ),
    warningPolicy: firstPolicyEvidenceStringField(
      policyMetadataSources,
      WARNING_POLICY_FIELD_SOURCES,
    ),
    warningPolicySource: firstPolicyEvidenceStringField(
      policyMetadataSources,
      WARNING_POLICY_SOURCE_FIELD_SOURCES,
    ),
    restrictionProfile: firstPolicyEvidenceStringField(
      policyMetadataSources,
      RESTRICTION_PROFILE_FIELD_SOURCES,
    ),
    restrictionProfileSource: firstPolicyEvidenceStringField(
      policyMetadataSources,
      RESTRICTION_PROFILE_SOURCE_FIELD_SOURCES,
    ),
    sandboxPolicy: firstPolicyEvidenceStringField(
      policyMetadataSources,
      SANDBOX_FIELD_SOURCES,
    ),
    sandboxPolicySource: firstPolicyEvidenceStringField(
      policyMetadataSources,
      SANDBOX_POLICY_SOURCE_FIELD_SOURCES,
    ),
    sandboxBackend: firstPolicyEvidenceStringField(
      policyMetadataSources,
      SANDBOX_BACKEND_FIELD_SOURCES,
    ),
    sandboxBackendStatus: firstPolicyEvidenceStringField(
      policyMetadataSources,
      SANDBOX_BACKEND_STATUS_FIELD_SOURCES,
    ),
    sandboxBackendEnforced: firstPolicyEvidenceScalarField(
      policyMetadataSources,
      SANDBOX_BACKEND_ENFORCED_FIELD_SOURCES,
    ),
    sandboxBackendRequired: firstPolicyEvidenceScalarField(
      policyMetadataSources,
      SANDBOX_BACKEND_REQUIRED_FIELD_SOURCES,
    ),
    sandboxBackendReasonCode: firstPolicyEvidenceStringField(
      policyMetadataSources,
      SANDBOX_BACKEND_REASON_CODE_FIELD_SOURCES,
    ),
    sandboxBackendReason: firstPolicyEvidenceStringField(
      policyMetadataSources,
      SANDBOX_BACKEND_REASON_FIELD_SOURCES,
    ),
    sandboxBackendPlatform: firstPolicyEvidenceStringField(
      policyMetadataSources,
      SANDBOX_BACKEND_PLATFORM_FIELD_SOURCES,
    ),
    workspaceSandboxConfigSource: firstPolicyEvidenceStringField(
      policyMetadataSources,
      WORKSPACE_SANDBOX_CONFIG_SOURCE_FIELD_SOURCES,
    ),
    networkRuleId: firstPolicyEvidenceStringField(
      policyMetadataSources,
      NETWORK_RULE_ID_FIELD_SOURCES,
    ),
    networkRuleTarget: firstPolicyEvidenceStringField(
      policyMetadataSources,
      NETWORK_RULE_TARGET_FIELD_SOURCES,
    ),
    networkRuleSource: firstPolicyEvidenceStringField(
      policyMetadataSources,
      NETWORK_RULE_SOURCE_FIELD_SOURCES,
    ),
    networkRiskLevel: firstPolicyEvidenceStringField(
      policyMetadataSources,
      NETWORK_RISK_LEVEL_FIELD_SOURCES,
    ),
    networkRiskReason: firstPolicyEvidenceStringField(
      policyMetadataSources,
      NETWORK_RISK_REASON_FIELD_SOURCES,
    ),
    networkUrl: firstPolicyEvidenceStringField(
      policyMetadataSources,
      NETWORK_URL_FIELD_SOURCES,
    ),
    networkHost: firstPolicyEvidenceStringField(
      policyMetadataSources,
      NETWORK_HOST_FIELD_SOURCES,
    ),
    networkDecision: null,
    latestWarning: latestWarning
      ? policyEvidenceStringField(latestWarning, ["message", "code"])
      : null,
  };
  evidence.networkDecision = resolveNetworkDecision(evidence);
  evidence.shouldRender = Boolean(
    evidence.primaryBlockingKind ||
    evidence.primaryBlockingSummary ||
    evidence.interruptReason ||
    evidence.policyName ||
    evidence.policyProfile ||
    evidence.warningPolicy ||
    evidence.warningPolicySource ||
    evidence.restrictionProfile ||
    evidence.restrictionProfileSource ||
    evidence.sandboxPolicy ||
    evidence.sandboxPolicySource ||
    evidence.sandboxBackend ||
    evidence.sandboxBackendStatus ||
    evidence.sandboxBackendEnforced ||
    evidence.sandboxBackendRequired ||
    evidence.sandboxBackendReasonCode ||
    evidence.sandboxBackendReason ||
    evidence.sandboxBackendPlatform ||
    evidence.workspaceSandboxConfigSource ||
    evidence.networkRuleId ||
    evidence.networkRuleTarget ||
    evidence.networkRuleSource ||
    evidence.networkRiskLevel ||
    evidence.networkRiskReason ||
    evidence.networkUrl ||
    evidence.networkHost ||
    evidence.networkDecision ||
    evidence.latestWarning,
  );
  return evidence;
}

export function buildRuntimePolicyEvidenceLines(
  evidence: RuntimePolicyEvidence,
  labels: RuntimePolicyEvidenceLineText,
): string[] {
  if (!evidence.shouldRender) {
    return [];
  }
  const lines: string[] = [];
  if (evidence.decisionReason) {
    lines.push(`- ${labels.decisionReason}: ${evidence.decisionReason}`);
  }
  if (evidence.fallbackChain.length > 0) {
    lines.push(
      `- ${labels.fallbackChain}: ${evidence.fallbackChain.join(" -> ")}`,
    );
  }
  if (
    evidence.policyName ||
    evidence.warningPolicy ||
    evidence.restrictionProfile ||
    evidence.primaryBlockingKind ||
    evidence.primaryBlockingSummary ||
    evidence.interruptReason
  ) {
    lines.push(
      `- ${labels.policy}: ${[
        evidence.policyName,
        evidence.warningPolicy,
        evidence.restrictionProfile,
        evidence.primaryBlockingKind,
        evidence.primaryBlockingSummary,
        evidence.interruptReason,
      ]
        .filter(Boolean)
        .join(" · ")}`,
    );
  }
  if (evidence.policyProfile) {
    lines.push(`- ${labels.policyProfile}: ${evidence.policyProfile}`);
  }
  const policySourceParts = buildRuntimePolicySourceParts(evidence);
  if (policySourceParts.length > 0) {
    lines.push(`- ${labels.policySources}: ${policySourceParts.join(" · ")}`);
  }
  if (evidence.sandboxPolicy) {
    lines.push(`- ${labels.sandbox}: ${evidence.sandboxPolicy}`);
  }
  const sandboxBackendParts = buildRuntimeSandboxBackendParts(evidence);
  if (sandboxBackendParts.length > 0) {
    lines.push(
      `- ${labels.sandboxBackend}: ${sandboxBackendParts.join(" · ")}`,
    );
  }
  if (
    evidence.networkRuleId ||
    evidence.networkRuleTarget ||
    evidence.networkRuleSource ||
    evidence.networkRiskLevel ||
    evidence.networkRiskReason ||
    evidence.networkHost ||
    evidence.networkUrl
  ) {
    lines.push(
      `- ${labels.network}: ${[
        evidence.networkRuleId,
        evidence.networkRuleTarget,
        evidence.networkRuleSource,
        evidence.networkRiskLevel,
        evidence.networkRiskReason,
        evidence.networkHost,
        evidence.networkUrl,
      ]
        .filter(Boolean)
        .join(" · ")}`,
    );
  }
  if (evidence.networkDecision) {
    lines.push(
      `- ${labels.networkDecision}: ${[
        evidence.networkDecision.status,
        evidence.networkDecision.reasonCode,
        evidence.networkDecision.summary,
      ]
        .filter(Boolean)
        .join(" · ")}`,
    );
  }
  if (evidence.latestWarning) {
    lines.push(`- ${labels.policyFailure}: ${evidence.latestWarning}`);
  }
  return lines;
}
