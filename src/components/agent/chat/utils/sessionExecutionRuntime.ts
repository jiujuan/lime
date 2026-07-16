import { getProviderLabel } from "@/lib/constants/providerMappings";
import { isLikelyImageGenerationSearchText } from "@/lib/imageGen/providerMatchers";
import type {
  AgentSessionExecutionRuntime,
  AgentSessionExecutionRuntimePreferences,
  AgentTurnOutputSchemaRuntime,
} from "@/lib/api/agentExecutionRuntime";
import type { AgentSessionDetail } from "@/lib/api/agentRuntime/sessionTypes";
import type { SessionModelPreference } from "../hooks/agentChatShared";
import { normalizeHarnessSessionMode } from "./harnessSessionMode";
import {
  alignChatToolPreferencesWithExecutionStrategy,
  type ChatToolPreferences,
} from "./chatToolPreferences";
import { createAccessModeFromExecutionRuntime } from "./accessModeRuntime";

export {
  applyModelChangeExecutionRuntime,
  applyTurnContextExecutionRuntime,
} from "../projection/sessionExecutionRuntimeProjection";

export function createExecutionRuntimeFromSessionDetail(
  detail?: Pick<AgentSessionDetail, "execution_runtime"> | null,
): AgentSessionExecutionRuntime | null {
  const runtime = detail?.execution_runtime || null;
  if (!runtime) {
    return null;
  }

  const normalizedRecentSessionMode = normalizeHarnessSessionMode(
    runtime.recent_session_mode,
  );
  if (normalizedRecentSessionMode === runtime.recent_session_mode) {
    return runtime;
  }

  return {
    ...runtime,
    recent_session_mode: normalizedRecentSessionMode,
  };
}

export function isImportedSourceExecutionRuntime(
  runtime?:
    | (Pick<
        AgentSessionExecutionRuntime,
        "provider_selector" | "provider_name" | "model_name"
      > & {
        imported_continuation?: unknown;
        imported_thread_settings?: unknown;
        source_client?: string | null;
      })
    | null,
): boolean {
  const record = runtime as Record<string, unknown> | null | undefined;
  if (!record) {
    return false;
  }

  const sourceClient =
    typeof record.source_client === "string"
      ? record.source_client.trim().toLowerCase()
      : typeof record.sourceClient === "string"
        ? record.sourceClient.trim().toLowerCase()
        : "";
  return Boolean(
    sourceClient ||
    record.imported_continuation ||
    record.importedContinuation ||
    record.imported_thread_settings ||
    record.importedThreadSettings,
  );
}

export function createSessionModelPreferenceFromExecutionRuntime(
  runtime?:
    | (Pick<
        AgentSessionExecutionRuntime,
        "provider_selector" | "provider_name" | "model_name"
      > & {
        imported_continuation?: unknown;
        imported_thread_settings?: unknown;
        source_client?: string | null;
      })
    | null,
): SessionModelPreference | null {
  const importedRuntimeWithoutCurrentSelection =
    isImportedSourceExecutionRuntime(runtime) &&
    !runtime?.provider_selector?.trim();
  const providerType =
    runtime?.provider_selector?.trim() ||
    (importedRuntimeWithoutCurrentSelection
      ? null
      : runtime?.provider_name?.trim()) ||
    null;
  const model = runtime?.model_name?.trim() || null;

  if (!providerType || !model) {
    return null;
  }

  const preference = {
    providerType,
    model,
  };

  return isImageGenerationSessionModelPreference(preference)
    ? null
    : preference;
}

export function isImageGenerationSessionModelPreference(
  preference?: Pick<SessionModelPreference, "providerType" | "model"> | null,
): boolean {
  const providerType = preference?.providerType?.trim() || "";
  const model = preference?.model?.trim() || "";
  if (!providerType && !model) {
    return false;
  }

  return isLikelyImageGenerationSearchText(`${providerType} ${model}`);
}

export function normalizeChatSessionModelPreference(
  preference?: SessionModelPreference | null,
): SessionModelPreference | null {
  if (!preference) {
    return null;
  }

  const providerType = preference.providerType?.trim() || "";
  const model = preference.model?.trim() || "";
  if (!providerType && !model) {
    return null;
  }

  if (isImageGenerationSessionModelPreference({ providerType, model })) {
    return null;
  }

  return {
    providerType,
    model,
  };
}

function normalizeRecentPreferenceBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

export function createChatToolPreferencesFromExecutionRuntime(
  runtime?: Pick<
    AgentSessionExecutionRuntime,
    "recent_preferences" | "execution_strategy"
  > | null,
): ChatToolPreferences | null {
  const preferences = runtime?.recent_preferences as
    | AgentSessionExecutionRuntimePreferences
    | null
    | undefined;
  if (!preferences) {
    return null;
  }

  const task = normalizeRecentPreferenceBoolean(preferences.task);
  const subagent = normalizeRecentPreferenceBoolean(preferences.subagent);

  if (task === null && subagent === null) {
    return null;
  }

  return alignChatToolPreferencesWithExecutionStrategy(
    {
      task: task ?? false,
      subagent: subagent ?? false,
    },
    runtime?.execution_strategy,
  );
}

export function createSessionAccessModeFromExecutionRuntime(
  runtime?: Pick<AgentSessionExecutionRuntime, "recent_access_mode"> | null,
) {
  return createAccessModeFromExecutionRuntime(runtime);
}

export function createSessionRecentPreferencesFromChatToolPreferences(
  preferences: ChatToolPreferences,
): AgentSessionExecutionRuntimePreferences {
  return {
    task: preferences.task,
    subagent: preferences.subagent,
  };
}

export function getExecutionRuntimeProviderLabel(
  runtime?: AgentSessionExecutionRuntime | null,
): string | null {
  const providerKey =
    runtime?.provider_selector?.trim() ||
    runtime?.provider_name?.trim() ||
    null;
  if (!providerKey) {
    return null;
  }
  return getProviderLabel(providerKey);
}

export function getOutputSchemaRuntimeLabel(
  runtime?: AgentTurnOutputSchemaRuntime | null,
): string | null {
  if (!runtime) {
    return null;
  }

  const strategyLabel =
    runtime.strategy === "native" ? "Native schema" : "Final output tool";
  const sourceLabel =
    runtime.source === "turn" ? "turn contract" : "session contract";
  return `${strategyLabel} · ${sourceLabel}`;
}

export function getExecutionRuntimeSummaryLabel(
  runtime?: AgentSessionExecutionRuntime | null,
): string | null {
  const providerLabel = getExecutionRuntimeProviderLabel(runtime);
  const modelLabel = runtime?.model_name?.trim() || null;
  if (providerLabel && modelLabel) {
    return `执行模型 ${providerLabel} · ${modelLabel}`;
  }
  if (modelLabel) {
    return `执行模型 ${modelLabel}`;
  }
  if (providerLabel) {
    return `执行提供方 ${providerLabel}`;
  }
  return null;
}

export function getExecutionRuntimeDisplayLabel(
  runtime?: AgentSessionExecutionRuntime | null,
  options?: { active?: boolean },
): string | null {
  const summaryLabel = getExecutionRuntimeSummaryLabel(runtime);
  if (!summaryLabel) {
    return null;
  }

  return summaryLabel.replace(
    /^执行/,
    options?.active ? "实际执行" : "最近执行",
  );
}
