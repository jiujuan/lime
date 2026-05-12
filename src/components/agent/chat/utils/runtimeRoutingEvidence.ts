import type { AgentRuntimeThreadReadModel } from "@/lib/api/agentRuntime";

export interface RuntimeRoutingEvidence {
  shouldRender: boolean;
  decisionSource: string | null;
  decisionReason: string | null;
  fallbackChain: string[];
  settingsSource: string | null;
  serviceModelSlot: string | null;
  selectedProvider: string | null;
  selectedModel: string | null;
  requestedProvider: string | null;
  requestedModel: string | null;
  firstVisibleDeltaMs: number | null;
  firstThinkingDeltaMs: number | null;
  firstTextDeltaMs: number | null;
  runDurationMs: number | null;
  runStatus: string | null;
  runId: string | null;
  timingSource: string | null;
}

export interface RuntimeRoutingEvidenceLineText {
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
  requestedModel: string;
  run: string;
  runUnknown: string;
  selectedModel: string;
  serviceModelSlot: string;
  settingsSource: string;
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

  const evidence: RuntimeRoutingEvidence = {
    shouldRender: false,
    decisionSource,
    decisionReason,
    fallbackChain,
    settingsSource,
    serviceModelSlot,
    selectedProvider,
    selectedModel,
    requestedProvider,
    requestedModel,
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
  };

  evidence.shouldRender = Boolean(
    evidence.decisionSource ||
    evidence.settingsSource ||
    evidence.serviceModelSlot ||
    evidence.selectedProvider ||
    evidence.selectedModel ||
    evidence.firstVisibleDeltaMs != null ||
    evidence.firstThinkingDeltaMs != null ||
    evidence.firstTextDeltaMs != null,
  );

  return evidence;
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
  const requested = [evidence.requestedProvider, evidence.requestedModel]
    .filter(Boolean)
    .join("/");
  if (requested) {
    lines.push(`- ${labels.requestedModel}: ${requested}`);
  }
  if (evidence.decisionReason) {
    lines.push(`- ${labels.decisionReason}: ${evidence.decisionReason}`);
  }
  if (evidence.fallbackChain.length > 0) {
    lines.push(
      `- ${labels.fallbackChain}: ${evidence.fallbackChain.join(" -> ")}`,
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
