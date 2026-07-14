import type { AgentSessionExecutionRuntime } from "@/lib/api/agentExecutionRuntime";
import type { ChatToolPreferences } from "./chatToolPreferences";

const HARNESS_THINKING_PREFERENCE_KEYS = [
  "thinking",
  "thinking_enabled",
  "thinkingEnabled",
] as const;
const HARNESS_WEB_SEARCH_PREFERENCE_KEYS = [
  "web_search",
  "webSearch",
  "web_search_enabled",
  "webSearchEnabled",
] as const;
const HARNESS_TASK_PREFERENCE_KEYS = ["task", "task_mode", "taskMode"] as const;
const HARNESS_SUBAGENT_PREFERENCE_KEYS = [
  "subagent",
  "subagent_mode",
  "subagentMode",
] as const;

interface CompactSubmitOpToolPreferencesOptions {
  requestMetadata?: Record<string, unknown>;
  executionRuntime?: AgentSessionExecutionRuntime | null;
  syncedRecentPreferences?: ChatToolPreferences | null;
  requestedWebSearch?: boolean;
  requestedThinking?: boolean;
}

interface CompactSubmitOpToolPreferencesResult {
  metadata?: Record<string, unknown>;
  shouldSubmitWebSearch: boolean;
  shouldSubmitThinking: boolean;
  webSearchPreference?: boolean;
  thinkingPreference?: boolean;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function omitHarnessPreferenceFromRequestMetadata(
  requestMetadata: Record<string, unknown> | undefined,
  keys: readonly string[],
): Record<string, unknown> | undefined {
  if (!requestMetadata) {
    return requestMetadata;
  }

  const nestedHarness = requestMetadata.harness;
  const usesNestedHarness = isPlainRecord(nestedHarness);
  const harness = usesNestedHarness
    ? (nestedHarness as Record<string, unknown>)
    : requestMetadata;
  const preferences = harness.preferences;
  if (!isPlainRecord(preferences)) {
    return requestMetadata;
  }

  let changed = false;
  const nextPreferences = { ...preferences };
  for (const key of keys) {
    if (!(key in nextPreferences)) {
      continue;
    }
    delete nextPreferences[key];
    changed = true;
  }

  if (!changed) {
    return requestMetadata;
  }

  const nextHarness = { ...harness };
  if (Object.keys(nextPreferences).length === 0) {
    delete nextHarness.preferences;
  } else {
    nextHarness.preferences = nextPreferences;
  }

  if (!usesNestedHarness) {
    return Object.keys(nextHarness).length > 0 ? nextHarness : undefined;
  }

  if (Object.keys(nextHarness).length === 0) {
    const { harness: _removedHarness, ...rest } = requestMetadata;
    return Object.keys(rest).length > 0 ? rest : undefined;
  }

  return {
    ...requestMetadata,
    harness: nextHarness,
  };
}

function readHarnessPreferenceFromRequestMetadata(
  requestMetadata: Record<string, unknown> | undefined,
  keys: readonly string[],
): boolean | null {
  if (!requestMetadata) {
    return null;
  }

  const nestedHarness = requestMetadata.harness;
  const harness = isPlainRecord(nestedHarness)
    ? (nestedHarness as Record<string, unknown>)
    : requestMetadata;
  const preferences = harness.preferences;
  if (!isPlainRecord(preferences)) {
    return null;
  }

  for (const key of keys) {
    if (typeof preferences[key] === "boolean") {
      return preferences[key] as boolean;
    }
  }

  return null;
}

function readRuntimePreference(
  preferences: AgentSessionExecutionRuntime["recent_preferences"] | undefined,
  keys: readonly string[],
): boolean | null {
  if (!isPlainRecord(preferences)) {
    return null;
  }

  for (const key of keys) {
    const value = preferences[key];
    if (typeof value === "boolean") {
      return value;
    }
  }

  return null;
}

function shouldSubmitRequestPreference(
  requestPreference: boolean | null,
  knownPreference: boolean | null,
): boolean {
  if (requestPreference === null) {
    return false;
  }
  if (knownPreference === null) {
    return requestPreference;
  }
  return requestPreference !== knownPreference;
}

function knownRuntimePreference(
  executionRuntime: AgentSessionExecutionRuntime | null | undefined,
  syncedRecentPreferences: ChatToolPreferences | null | undefined,
  keys: readonly string[],
  syncedKey: "webSearch" | "thinking",
): boolean | null {
  return (
    readRuntimePreference(executionRuntime?.recent_preferences, keys) ??
    (typeof syncedRecentPreferences?.[syncedKey] === "boolean"
      ? syncedRecentPreferences[syncedKey]
      : null)
  );
}

export function compactSubmitOpToolPreferences(
  options: CompactSubmitOpToolPreferencesOptions,
): CompactSubmitOpToolPreferencesResult {
  const {
    requestMetadata,
    executionRuntime,
    syncedRecentPreferences,
    requestedWebSearch,
    requestedThinking,
  } = options;
  const requestWebSearchPreference =
    typeof requestedWebSearch === "boolean"
      ? requestedWebSearch
      : readHarnessPreferenceFromRequestMetadata(
          requestMetadata,
          HARNESS_WEB_SEARCH_PREFERENCE_KEYS,
        );
  const requestThinkingPreference =
    typeof requestedThinking === "boolean"
      ? requestedThinking
      : readHarnessPreferenceFromRequestMetadata(
          requestMetadata,
          HARNESS_THINKING_PREFERENCE_KEYS,
        );
  const knownWebSearchPreference = knownRuntimePreference(
    executionRuntime,
    syncedRecentPreferences,
    HARNESS_WEB_SEARCH_PREFERENCE_KEYS,
    "webSearch",
  );
  const knownThinkingPreference = knownRuntimePreference(
    executionRuntime,
    syncedRecentPreferences,
    HARNESS_THINKING_PREFERENCE_KEYS,
    "thinking",
  );
  const knownTaskPreference =
    typeof syncedRecentPreferences?.task === "boolean"
      ? syncedRecentPreferences.task
      : typeof executionRuntime?.recent_preferences?.task === "boolean"
        ? executionRuntime.recent_preferences.task
        : null;
  const knownSubagentPreference =
    typeof syncedRecentPreferences?.subagent === "boolean"
      ? syncedRecentPreferences.subagent
      : typeof executionRuntime?.recent_preferences?.subagent === "boolean"
        ? executionRuntime.recent_preferences.subagent
        : null;
  const requestTaskPreference = readHarnessPreferenceFromRequestMetadata(
    requestMetadata,
    HARNESS_TASK_PREFERENCE_KEYS,
  );
  const requestSubagentPreference = readHarnessPreferenceFromRequestMetadata(
    requestMetadata,
    HARNESS_SUBAGENT_PREFERENCE_KEYS,
  );

  let metadata = omitHarnessPreferenceFromRequestMetadata(
    requestMetadata,
    HARNESS_THINKING_PREFERENCE_KEYS,
  );
  metadata = omitHarnessPreferenceFromRequestMetadata(
    metadata,
    HARNESS_WEB_SEARCH_PREFERENCE_KEYS,
  );
  if (
    requestTaskPreference !== null &&
    knownTaskPreference !== null &&
    knownTaskPreference === requestTaskPreference
  ) {
    metadata = omitHarnessPreferenceFromRequestMetadata(
      metadata,
      HARNESS_TASK_PREFERENCE_KEYS,
    );
  }
  if (
    requestSubagentPreference !== null &&
    knownSubagentPreference !== null &&
    knownSubagentPreference === requestSubagentPreference
  ) {
    metadata = omitHarnessPreferenceFromRequestMetadata(
      metadata,
      HARNESS_SUBAGENT_PREFERENCE_KEYS,
    );
  }

  return {
    metadata,
    shouldSubmitWebSearch: shouldSubmitRequestPreference(
      requestWebSearchPreference,
      knownWebSearchPreference,
    ),
    shouldSubmitThinking: shouldSubmitRequestPreference(
      requestThinkingPreference,
      knownThinkingPreference,
    ),
    webSearchPreference:
      requestWebSearchPreference === null
        ? undefined
        : requestWebSearchPreference,
    thinkingPreference:
      requestThinkingPreference === null
        ? undefined
        : requestThinkingPreference,
  };
}
