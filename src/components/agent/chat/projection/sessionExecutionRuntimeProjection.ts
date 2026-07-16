import type {
  AgentSessionExecutionRuntime,
  AgentSessionExecutionRuntimeSource,
} from "@/lib/api/agentExecutionRuntime";
import type {
  AgentEventModelChange,
  AgentEventTurnContext,
} from "@/lib/api/agentProtocol";
import { normalizeExecutionStrategy } from "../hooks/agentChatCoreUtils";
import { normalizeHarnessSessionMode } from "../utils/harnessSessionMode";

function mergeExecutionRuntime(
  current: AgentSessionExecutionRuntime | null,
  updates: Partial<AgentSessionExecutionRuntime>,
  source: AgentSessionExecutionRuntimeSource,
): AgentSessionExecutionRuntime | null {
  const sessionId = updates.session_id || current?.session_id;
  const providerSelector =
    updates.provider_selector ?? current?.provider_selector ?? null;
  const providerName = updates.provider_name ?? current?.provider_name ?? null;
  const modelName = updates.model_name ?? current?.model_name ?? null;
  const executionStrategy =
    updates.execution_strategy ?? current?.execution_strategy ?? null;
  const normalizedExecutionStrategy = executionStrategy
    ? normalizeExecutionStrategy(executionStrategy)
    : null;
  const outputSchemaRuntime =
    updates.output_schema_runtime ?? current?.output_schema_runtime ?? null;
  const recentAccessMode =
    updates.recent_access_mode ?? current?.recent_access_mode ?? null;
  const recentPreferences =
    updates.recent_preferences ?? current?.recent_preferences ?? null;
  const recentTheme = updates.recent_theme ?? current?.recent_theme ?? null;
  const recentSessionMode = normalizeHarnessSessionMode(
    updates.recent_session_mode ?? current?.recent_session_mode ?? null,
  );
  const recentGateKey =
    updates.recent_gate_key ?? current?.recent_gate_key ?? null;
  const recentRunTitle =
    updates.recent_run_title ?? current?.recent_run_title ?? null;
  const recentContentId =
    updates.recent_content_id ?? current?.recent_content_id ?? null;
  const mode = updates.mode ?? current?.mode ?? null;
  const latestTurnId =
    updates.latest_turn_id ?? current?.latest_turn_id ?? null;
  const latestTurnStatus =
    updates.latest_turn_status ?? current?.latest_turn_status ?? null;

  if (!sessionId) {
    return null;
  }

  if (
    !providerSelector &&
    !providerName &&
    !modelName &&
    !outputSchemaRuntime &&
    !executionStrategy &&
    !recentPreferences &&
    !recentTheme &&
    !recentSessionMode &&
    !recentGateKey &&
    !recentRunTitle &&
    !recentContentId
  ) {
    return null;
  }

  return {
    session_id: sessionId,
    provider_selector: providerSelector,
    provider_name: providerName,
    model_name: modelName,
    execution_strategy: normalizedExecutionStrategy,
    output_schema_runtime: outputSchemaRuntime,
    recent_access_mode: recentAccessMode,
    recent_preferences: recentPreferences,
    recent_theme: recentTheme,
    recent_session_mode: recentSessionMode,
    recent_gate_key: recentGateKey,
    recent_run_title: recentRunTitle,
    recent_content_id: recentContentId,
    source,
    mode,
    latest_turn_id: latestTurnId,
    latest_turn_status: latestTurnStatus,
  };
}

export function applyTurnContextExecutionRuntime(
  current: AgentSessionExecutionRuntime | null,
  event: AgentEventTurnContext,
): AgentSessionExecutionRuntime | null {
  const outputSchemaRuntime = event.output_schema_runtime || null;
  return mergeExecutionRuntime(
    current,
    {
      session_id: event.session_id,
      execution_strategy: event.execution_strategy ?? undefined,
      output_schema_runtime: outputSchemaRuntime,
      provider_name: outputSchemaRuntime?.providerName ?? undefined,
      model_name: outputSchemaRuntime?.modelName ?? undefined,
      latest_turn_id: event.turn_id,
      latest_turn_status: "running",
    },
    "turn_context",
  );
}

export function applyModelChangeExecutionRuntime(
  current: AgentSessionExecutionRuntime | null,
  event: AgentEventModelChange,
): AgentSessionExecutionRuntime | null {
  return mergeExecutionRuntime(
    current,
    {
      model_name: event.model,
      mode: event.mode,
      latest_turn_status: current?.latest_turn_status || "running",
    },
    "model_change",
  );
}
