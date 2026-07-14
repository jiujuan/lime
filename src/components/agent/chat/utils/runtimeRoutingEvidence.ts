import type { AgentRuntimeThreadReadModel } from "@/lib/api/agentRuntime/sessionTypes";
import type { ProviderSettingsFocusContext } from "@/types/page";

export interface RuntimeRoutingEvidence {
  shouldRender: boolean;
  decisionSource: string | null;
  decisionReason: string | null;
  fallbackApplied: boolean | null;
  fallbackChain: string[];
  settingsSource: string | null;
  serviceModelSlot: string | null;
  selectedProvider: string | null;
  selectedModel: string | null;
  requestedProvider: string | null;
  requestedModel: string | null;
  requestedSelectionProvider: string | null;
  requestedSelectionModel: string | null;
  requestedSelectionSource: string | null;
  routingAttempts: RuntimeRoutingAttemptEvidence[];
  firstVisibleDeltaMs: number | null;
  firstThinkingDeltaMs: number | null;
  firstTextDeltaMs: number | null;
  runDurationMs: number | null;
  runStatus: string | null;
  runId: string | null;
  timingSource: string | null;
  providerReadinessSource: string | null;
  providerReadinessStatus: string | null;
  providerReadinessReason: string | null;
  providerReadinessProviderType: string | null;
  providerReadinessKeySummary: string | null;
  providerReadinessRecoveryAction: string | null;
  modelRegistrySource: string | null;
  modelRegistryStatus: string | null;
  modelRegistryReason: string | null;
  modelRegistryMatchedModel: string | null;
  modelRegistryCapabilityTags: string[];
  modelRegistryAlias: string | null;
  modelRegistryReasoning: string | null;
}

export interface RuntimeRoutingAttemptEvidence {
  slot: string | null;
  provider: string | null;
  model: string | null;
  source: string | null;
  providerReadinessStatus: string | null;
  providerReadinessReason: string | null;
}

export interface RuntimeRoutingEvidenceLineText {
  appliedFallback: string;
  decisionReason: string;
  decisionSource: string;
  durationUnknown: string;
  evidenceSource: string;
  fallbackChain: string;
  firstText: string;
  firstThinking: string;
  firstTokenMetrics: string;
  firstVisible: string;
  none: string;
  network: string;
  networkDecision: string;
  policy: string;
  policyFailure: string;
  policySources: string;
  sandbox: string;
  sandboxBackend: string;
  policyOpenSettings: string;
  policyProfile: string;
  policySummary: string;
  policyTitle: string;
  requestedModel: string;
  run: string;
  runUnknown: string;
  selectedModel: string;
  serviceModelSlot: string;
  settingsSource: string;
  providerReadiness: string;
  providerReadinessKeys: string;
  providerReadinessProviderType: string;
  providerReadinessRecovery: string;
  routingAttempts: string;
  modelRegistry: string;
  modelRegistryAlias: string;
  modelRegistryCapabilities: string;
  modelRegistryReasoning: string;
  unknown: string;
  unset: string;
}

function asDiagnosticRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function diagnosticStringField(
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

function diagnosticStringArrayField(
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

function diagnosticNumberField(
  record: Record<string, unknown> | null | undefined,
  keys: string[],
): number | null {
  for (const key of keys) {
    const value = record?.[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return null;
}

function diagnosticBooleanField(
  record: Record<string, unknown> | null | undefined,
  keys: string[],
): boolean | null {
  for (const key of keys) {
    const value = record?.[key];
    if (typeof value === "boolean") {
      return value;
    }
  }
  return null;
}

function diagnosticRecordArrayField(
  record: Record<string, unknown> | null | undefined,
  keys: string[],
): Record<string, unknown>[] {
  for (const key of keys) {
    const value = record?.[key];
    if (!Array.isArray(value)) {
      continue;
    }
    const records = value
      .map(asDiagnosticRecord)
      .filter((item): item is Record<string, unknown> => Boolean(item));
    if (records.length > 0) {
      return records;
    }
  }
  return [];
}

export function formatDiagnosticDurationMs(
  value?: number | null,
): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(value >= 10_000 ? 1 : 2)}s`;
  }
  return `${Math.round(value)}ms`;
}

export function resolveRuntimeRoutingEvidence(
  threadRead?: AgentRuntimeThreadReadModel | null,
): RuntimeRoutingEvidence {
  const modelRouting = asDiagnosticRecord(threadRead?.model_routing);
  const runtimeSummary = asDiagnosticRecord(threadRead?.runtime_summary);
  const latestTiming = asDiagnosticRecord(modelRouting?.latestModelDeltaTiming);
  const latestRunRouting = asDiagnosticRecord(latestTiming?.routing);
  const requestedSelection =
    asDiagnosticRecord(modelRouting?.requestedSelection) ||
    asDiagnosticRecord(modelRouting?.requested_selection) ||
    asDiagnosticRecord(latestRunRouting?.requestedSelection) ||
    asDiagnosticRecord(latestRunRouting?.requested_selection);
  const modelRegistry =
    asDiagnosticRecord(modelRouting?.modelRegistry) ||
    asDiagnosticRecord(modelRouting?.model_registry) ||
    asDiagnosticRecord(latestRunRouting?.modelRegistry) ||
    asDiagnosticRecord(latestRunRouting?.model_registry);
  const providerReadiness =
    asDiagnosticRecord(modelRouting?.providerReadiness) ||
    asDiagnosticRecord(modelRouting?.provider_readiness) ||
    asDiagnosticRecord(latestRunRouting?.providerReadiness) ||
    asDiagnosticRecord(latestRunRouting?.provider_readiness);
  const modelRegistryCapabilities =
    asDiagnosticRecord(modelRegistry?.modelCapabilities) ||
    asDiagnosticRecord(modelRegistry?.model_capabilities);
  const modelRegistryCapabilityObject = asDiagnosticRecord(
    modelRegistryCapabilities?.capabilities,
  );
  const modelRegistryAlias =
    asDiagnosticRecord(modelRegistry?.modelAlias) ||
    asDiagnosticRecord(modelRegistry?.model_alias);
  const modelRegistryReasoning = asDiagnosticRecord(modelRegistry?.reasoning);
  const reasoningEffort =
    asDiagnosticRecord(modelRegistryReasoning?.reasoningEffort) ||
    asDiagnosticRecord(modelRegistryReasoning?.reasoning_effort);
  const timingSource = diagnosticStringField(latestTiming, ["source"]);

  const decisionSource =
    diagnosticStringField(modelRouting, [
      "decisionSource",
      "decision_source",
    ]) ||
    threadRead?.decision_source ||
    diagnosticStringField(runtimeSummary, [
      "decisionSource",
      "decision_source",
    ]) ||
    diagnosticStringField(latestRunRouting, [
      "decisionSource",
      "decision_source",
    ]) ||
    null;
  const settingsSource =
    diagnosticStringField(modelRouting, [
      "settingsSource",
      "settings_source",
    ]) ||
    diagnosticStringField(latestRunRouting, [
      "settingsSource",
      "settings_source",
    ]) ||
    null;
  const decisionReason =
    diagnosticStringField(modelRouting, [
      "decisionReason",
      "decision_reason",
    ]) ||
    diagnosticStringField(latestRunRouting, [
      "decisionReason",
      "decision_reason",
    ]) ||
    null;
  const fallbackChain =
    diagnosticStringArrayField(modelRouting, [
      "fallbackChain",
      "fallback_chain",
    ]) ||
    diagnosticStringArrayField(latestRunRouting, [
      "fallbackChain",
      "fallback_chain",
    ]) ||
    [];
  const serviceModelSlot =
    diagnosticStringField(modelRouting, [
      "serviceModelSlot",
      "service_model_slot",
    ]) ||
    threadRead?.service_model_slot ||
    diagnosticStringField(latestRunRouting, [
      "serviceModelSlot",
      "service_model_slot",
    ]) ||
    null;
  const selectedProvider =
    diagnosticStringField(modelRouting, [
      "selectedProvider",
      "selected_provider",
    ]) ||
    diagnosticStringField(latestRunRouting, [
      "selectedProvider",
      "selected_provider",
    ]) ||
    null;
  const selectedModel =
    diagnosticStringField(modelRouting, ["selectedModel", "selected_model"]) ||
    diagnosticStringField(latestRunRouting, [
      "selectedModel",
      "selected_model",
    ]) ||
    null;
  const requestedProvider =
    diagnosticStringField(modelRouting, [
      "requestedProvider",
      "requested_provider",
    ]) ||
    diagnosticStringField(latestRunRouting, [
      "requestedProvider",
      "requested_provider",
    ]) ||
    null;
  const requestedModel =
    diagnosticStringField(modelRouting, [
      "requestedModel",
      "requested_model",
    ]) ||
    diagnosticStringField(latestRunRouting, [
      "requestedModel",
      "requested_model",
    ]) ||
    null;
  const modelRegistryCapabilityTags = resolveModelRegistryCapabilityTags(
    modelRegistryCapabilityObject,
    modelRegistryCapabilities,
  );
  const modelRegistryReasoningText = resolveModelRegistryReasoningText(
    modelRegistryReasoning,
    reasoningEffort,
  );
  const providerReadinessStatus = diagnosticStringField(providerReadiness, [
    "status",
  ]);
  const providerReadinessReason = diagnosticStringField(providerReadiness, [
    "reasonCode",
    "reason_code",
  ]);
  const providerReadinessKeySummary =
    resolveProviderReadinessKeySummary(providerReadiness);
  const providerReadinessRecoveryAction =
    resolveProviderReadinessRecoveryAction(
      providerReadinessStatus,
      providerReadinessReason,
    );
  const routingAttempts = resolveRoutingAttempts(
    diagnosticRecordArrayField(modelRouting, [
      "routingAttempts",
      "routing_attempts",
    ]),
  );

  const evidence: RuntimeRoutingEvidence = {
    shouldRender: false,
    decisionSource,
    decisionReason,
    fallbackApplied:
      diagnosticBooleanField(modelRouting, [
        "fallbackApplied",
        "fallback_applied",
      ]) ??
      diagnosticBooleanField(latestRunRouting, [
        "fallbackApplied",
        "fallback_applied",
      ]),
    fallbackChain,
    settingsSource,
    serviceModelSlot,
    selectedProvider,
    selectedModel,
    requestedProvider,
    requestedModel,
    requestedSelectionProvider: diagnosticStringField(requestedSelection, [
      "provider",
      "selectedProvider",
      "selected_provider",
    ]),
    requestedSelectionModel: diagnosticStringField(requestedSelection, [
      "model",
      "selectedModel",
      "selected_model",
    ]),
    requestedSelectionSource: diagnosticStringField(requestedSelection, [
      "source",
      "decisionSource",
      "decision_source",
    ]),
    routingAttempts,
    firstVisibleDeltaMs: diagnosticNumberField(latestTiming, [
      "firstVisibleDeltaMs",
      "first_visible_delta_ms",
    ]),
    firstThinkingDeltaMs: diagnosticNumberField(latestTiming, [
      "firstThinkingDeltaMs",
      "first_thinking_delta_ms",
    ]),
    firstTextDeltaMs: diagnosticNumberField(latestTiming, [
      "firstTextDeltaMs",
      "first_text_delta_ms",
    ]),
    runDurationMs: diagnosticNumberField(latestTiming, [
      "durationMs",
      "duration_ms",
    ]),
    runStatus: diagnosticStringField(latestTiming, ["runStatus", "run_status"]),
    runId: diagnosticStringField(latestTiming, ["runId", "run_id"]),
    timingSource,
    providerReadinessSource: diagnosticStringField(providerReadiness, [
      "source",
    ]),
    providerReadinessStatus,
    providerReadinessReason,
    providerReadinessProviderType: diagnosticStringField(providerReadiness, [
      "providerType",
      "provider_type",
    ]),
    providerReadinessKeySummary,
    providerReadinessRecoveryAction,
    modelRegistrySource: diagnosticStringField(modelRegistry, [
      "source",
      "sourceLabel",
      "source_label",
    ]),
    modelRegistryStatus: diagnosticStringField(modelRegistry, ["status"]),
    modelRegistryReason: diagnosticStringField(modelRegistry, [
      "reasonCode",
      "reason_code",
    ]),
    modelRegistryMatchedModel: diagnosticStringField(modelRegistry, [
      "matchedModelId",
      "matched_model_id",
    ]),
    modelRegistryCapabilityTags,
    modelRegistryAlias: resolveModelRegistryAlias(modelRegistryAlias),
    modelRegistryReasoning: modelRegistryReasoningText,
  };

  evidence.shouldRender = Boolean(
    evidence.decisionSource ||
    evidence.settingsSource ||
    evidence.serviceModelSlot ||
    evidence.selectedProvider ||
    evidence.selectedModel ||
    evidence.fallbackApplied === true ||
    evidence.requestedSelectionProvider ||
    evidence.requestedSelectionModel ||
    evidence.requestedSelectionSource ||
    evidence.routingAttempts.length > 0 ||
    evidence.providerReadinessSource ||
    evidence.providerReadinessStatus ||
    evidence.providerReadinessReason ||
    evidence.providerReadinessProviderType ||
    evidence.providerReadinessKeySummary ||
    evidence.providerReadinessRecoveryAction ||
    evidence.modelRegistrySource ||
    evidence.modelRegistryReason ||
    evidence.modelRegistryCapabilityTags.length > 0 ||
    evidence.modelRegistryAlias ||
    evidence.modelRegistryReasoning ||
    evidence.firstVisibleDeltaMs != null ||
    evidence.firstThinkingDeltaMs != null ||
    evidence.firstTextDeltaMs != null,
  );

  return evidence;
}

export function buildProviderSettingsFocusFromRoutingEvidence(
  evidence: RuntimeRoutingEvidence,
): ProviderSettingsFocusContext | undefined {
  const providerId =
    evidence.selectedProvider ||
    evidence.requestedSelectionProvider ||
    evidence.requestedProvider ||
    evidence.routingAttempts.find((attempt) => attempt.provider)?.provider ||
    null;
  const modelId =
    evidence.selectedModel ||
    evidence.requestedSelectionModel ||
    evidence.requestedModel ||
    evidence.routingAttempts.find((attempt) => attempt.model)?.model ||
    null;
  if (!providerId && !modelId) {
    return undefined;
  }

  return {
    providerId: providerId ?? undefined,
    modelId: modelId ?? undefined,
    reasonCode:
      evidence.providerReadinessReason ||
      evidence.modelRegistryReason ||
      undefined,
    recoveryAction: evidence.providerReadinessRecoveryAction ?? undefined,
  };
}

function resolveRoutingAttempts(
  attempts: Record<string, unknown>[],
): RuntimeRoutingAttemptEvidence[] {
  return attempts
    .map((attempt) => {
      const readiness =
        asDiagnosticRecord(attempt.providerReadiness) ||
        asDiagnosticRecord(attempt.provider_readiness);
      return {
        slot: diagnosticStringField(attempt, [
          "slot",
          "serviceModelSlot",
          "service_model_slot",
        ]),
        provider: diagnosticStringField(attempt, [
          "provider",
          "selectedProvider",
          "selected_provider",
        ]),
        model: diagnosticStringField(attempt, [
          "model",
          "selectedModel",
          "selected_model",
        ]),
        source: diagnosticStringField(attempt, ["source"]),
        providerReadinessStatus: diagnosticStringField(readiness, ["status"]),
        providerReadinessReason: diagnosticStringField(readiness, [
          "reasonCode",
          "reason_code",
        ]),
      };
    })
    .filter(
      (attempt) =>
        attempt.slot ||
        attempt.provider ||
        attempt.model ||
        attempt.source ||
        attempt.providerReadinessStatus ||
        attempt.providerReadinessReason,
    )
    .slice(0, 6);
}

function resolveProviderReadinessKeySummary(
  readiness: Record<string, unknown> | null,
): string | null {
  const enabled = diagnosticNumberField(readiness, [
    "enabledKeyCount",
    "enabled_key_count",
  ]);
  const total = diagnosticNumberField(readiness, [
    "totalKeyCount",
    "total_key_count",
  ]);
  if (enabled == null && total == null) {
    return null;
  }
  return `${enabled ?? "?"}/${total ?? "?"}`;
}

function resolveProviderReadinessRecoveryAction(
  status: string | null,
  reason: string | null,
): string | null {
  if (!status || status === "ready") {
    return null;
  }
  switch (reason) {
    case "provider_not_configured":
      return "configure_provider";
    case "provider_disabled":
      return "enable_provider";
    case "missing_enabled_api_key":
      return "add_enabled_api_key";
    case "provider_not_chat_capable":
      return "choose_chat_capable_provider";
    default:
      return status === "blocked" || status === "needs_setup"
        ? "review_provider_settings"
        : null;
  }
}

function resolveModelRegistryCapabilityTags(
  capabilities: Record<string, unknown> | null,
  metadata: Record<string, unknown> | null,
): string[] {
  const tags = new Set<string>();
  for (const [key, value] of Object.entries(capabilities ?? {})) {
    if (value === true) {
      tags.add(key);
    }
  }
  for (const key of [
    "taskFamilies",
    "task_families",
    "runtimeFeatures",
    "runtime_features",
  ]) {
    for (const tag of diagnosticStringArrayField(metadata, [key]) ?? []) {
      tags.add(tag);
    }
  }
  return Array.from(tags).slice(0, 8);
}

function resolveModelRegistryAlias(
  alias: Record<string, unknown> | null,
): string | null {
  const canonical = diagnosticStringField(alias, [
    "canonicalModelId",
    "canonical_model_id",
  ]);
  const providerModel = diagnosticStringField(alias, [
    "providerModelId",
    "provider_model_id",
  ]);
  const aliasSource = diagnosticStringField(alias, [
    "aliasSource",
    "alias_source",
  ]);
  const pairs = [
    canonical ? `canonical=${canonical}` : null,
    providerModel ? `provider=${providerModel}` : null,
    aliasSource ? `source=${aliasSource}` : null,
  ].filter(Boolean);
  return pairs.length > 0 ? pairs.join(" · ") : null;
}

function resolveModelRegistryReasoningText(
  reasoning: Record<string, unknown> | null,
  reasoningEffort: Record<string, unknown> | null,
): string | null {
  const supported = diagnosticBooleanField(reasoning, ["supported"]);
  const effortSupported = diagnosticBooleanField(reasoningEffort, [
    "supported",
  ]);
  const levels = diagnosticStringArrayField(reasoningEffort, ["levels"]) ?? [];
  const defaultLevel = diagnosticStringField(reasoningEffort, ["default"]);
  if (supported == null && effortSupported == null && levels.length === 0) {
    return null;
  }
  const parts = [
    supported != null ? `supported=${supported}` : null,
    effortSupported != null ? `effort=${effortSupported}` : null,
    levels.length > 0 ? `levels=${levels.join("/")}` : null,
    defaultLevel ? `default=${defaultLevel}` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
}

export function buildRuntimeRoutingEvidenceLines(
  evidence: RuntimeRoutingEvidence,
  labels: RuntimeRoutingEvidenceLineText,
): string[] {
  if (!evidence.shouldRender) {
    return [`- ${labels.none}`];
  }

  const lines = [
    `- ${labels.decisionSource}: ${evidence.decisionSource || labels.unknown}`,
    `- ${labels.serviceModelSlot}: ${evidence.serviceModelSlot || labels.unset}`,
    `- ${labels.settingsSource}: ${evidence.settingsSource || labels.unset}`,
    `- ${labels.selectedModel}: ${[evidence.selectedProvider, evidence.selectedModel].filter(Boolean).join("/") || labels.unknown}`,
  ];
  if (evidence.fallbackApplied === true) {
    lines.push(`- ${labels.appliedFallback}: true`);
  }
  const requested = [evidence.requestedProvider, evidence.requestedModel]
    .filter(Boolean)
    .join("/");
  const requestedSelection = [
    evidence.requestedSelectionProvider,
    evidence.requestedSelectionModel,
  ]
    .filter(Boolean)
    .join("/");
  if (requested) {
    lines.push(`- ${labels.requestedModel}: ${requested}`);
  } else if (requestedSelection) {
    lines.push(`- ${labels.requestedModel}: ${requestedSelection}`);
  }
  if (evidence.decisionReason) {
    lines.push(`- ${labels.decisionReason}: ${evidence.decisionReason}`);
  }
  if (evidence.fallbackChain.length > 0) {
    lines.push(
      `- ${labels.fallbackChain}: ${evidence.fallbackChain.join(" -> ")}`,
    );
  }
  if (evidence.routingAttempts.length > 0) {
    lines.push(
      `- ${labels.routingAttempts}: ${evidence.routingAttempts
        .map((attempt) =>
          [
            attempt.slot,
            [attempt.provider, attempt.model].filter(Boolean).join("/"),
            attempt.providerReadinessStatus,
            attempt.providerReadinessReason,
          ]
            .filter(Boolean)
            .join(" · "),
        )
        .join(" -> ")}`,
    );
  }
  if (
    evidence.providerReadinessSource ||
    evidence.providerReadinessStatus ||
    evidence.providerReadinessReason ||
    evidence.providerReadinessProviderType
  ) {
    lines.push(
      `- ${labels.providerReadiness}: ${[
        evidence.providerReadinessSource,
        evidence.providerReadinessStatus,
        evidence.providerReadinessReason,
        evidence.providerReadinessProviderType,
      ]
        .filter(Boolean)
        .join(" · ")}`,
    );
  }
  if (evidence.providerReadinessKeySummary) {
    lines.push(
      `- ${labels.providerReadinessKeys}: ${evidence.providerReadinessKeySummary}`,
    );
  }
  if (evidence.providerReadinessRecoveryAction) {
    lines.push(
      `- ${labels.providerReadinessRecovery}: ${evidence.providerReadinessRecoveryAction}`,
    );
  }
  if (
    evidence.modelRegistrySource ||
    evidence.modelRegistryStatus ||
    evidence.modelRegistryReason ||
    evidence.modelRegistryMatchedModel
  ) {
    lines.push(
      `- ${labels.modelRegistry}: ${[
        evidence.modelRegistrySource,
        evidence.modelRegistryStatus,
        evidence.modelRegistryReason,
        evidence.modelRegistryMatchedModel,
      ]
        .filter(Boolean)
        .join(" · ")}`,
    );
  }
  if (evidence.modelRegistryCapabilityTags.length > 0) {
    lines.push(
      `- ${labels.modelRegistryCapabilities}: ${evidence.modelRegistryCapabilityTags.join(", ")}`,
    );
  }
  if (evidence.modelRegistryAlias) {
    lines.push(
      `- ${labels.modelRegistryAlias}: ${evidence.modelRegistryAlias}`,
    );
  }
  if (evidence.modelRegistryReasoning) {
    lines.push(
      `- ${labels.modelRegistryReasoning}: ${evidence.modelRegistryReasoning}`,
    );
  }
  if (
    evidence.firstVisibleDeltaMs != null ||
    evidence.firstThinkingDeltaMs != null ||
    evidence.firstTextDeltaMs != null
  ) {
    lines.push(
      `- ${labels.firstTokenMetrics}: ${labels.firstVisible}=${formatDiagnosticDurationMs(evidence.firstVisibleDeltaMs) || labels.unknown}｜${labels.firstThinking}=${formatDiagnosticDurationMs(evidence.firstThinkingDeltaMs) || labels.unknown}｜${labels.firstText}=${formatDiagnosticDurationMs(evidence.firstTextDeltaMs) || labels.unknown}`,
    );
  }
  if (evidence.runDurationMs != null || evidence.runStatus || evidence.runId) {
    lines.push(
      `- ${labels.run}: ${evidence.runStatus || labels.unknown}｜${formatDiagnosticDurationMs(evidence.runDurationMs) || labels.durationUnknown}｜${evidence.runId || labels.runUnknown}`,
    );
  }
  if (evidence.timingSource) {
    lines.push(`- ${labels.evidenceSource}: ${evidence.timingSource}`);
  }

  return lines;
}
