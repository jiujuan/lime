import type { AgentSessionExecutionRuntime } from "@/lib/api/agentExecutionRuntime";
import { isLikelyImageGenerationModelId } from "@/lib/imageGen/providerMatchers";
import type { SessionModelPreference } from "../hooks/agentChatShared";
import type { ChatToolPreferences } from "./chatToolPreferences";
import { normalizeHarnessSessionMode } from "./harnessSessionMode";

const HARNESS_CONTENT_ID_KEYS = ["content_id", "contentId"] as const;
const HARNESS_ACCESS_MODE_KEYS = ["access_mode", "accessMode"] as const;
const HARNESS_THEME_KEYS = ["theme", "harness_theme", "harnessTheme"] as const;
const HARNESS_SESSION_MODE_KEYS = ["session_mode", "sessionMode"] as const;
const HARNESS_GATE_KEY_KEYS = ["gate_key", "gateKey"] as const;
const HARNESS_RUN_TITLE_KEYS = ["run_title", "runTitle", "title"] as const;
const HARNESS_IMAGE_COMMAND_INTENT_KEYS = [
  "image_command_intent",
  "imageCommandIntent",
] as const;
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
const RETIRED_HARNESS_IMAGE_SKILL_LAUNCH_KEYS = [
  "image_skill_launch",
  "imageSkillLaunch",
] as const;
const RETIRED_HARNESS_TEAM_SELECTION_KEYS = [
  "selected_team_disabled",
  "selectedTeamDisabled",
  "preferred_team_preset_id",
  "preferredTeamPresetId",
  "selected_team_id",
  "selectedTeamId",
  "selected_team_source",
  "selectedTeamSource",
  "selected_team_label",
  "selectedTeamLabel",
  "selected_team_description",
  "selectedTeamDescription",
  "selected_team_summary",
  "selectedTeamSummary",
  "selected_team_roles",
  "selectedTeamRoles",
] as const;
const IMAGE_GENERATION_CONTRACT_KEY = "image_generation";
const IMAGE_GENERATION_ROUTING_SLOT = "image_generation_model";

function normalizeRuntimeIdentifier(value?: string | null): string {
  return value?.trim().toLowerCase() || "";
}

function selectionLooksImageGenerationOnly(params: {
  provider?: string | null;
  model?: string | null;
}): boolean {
  const provider = normalizeRuntimeIdentifier(params.provider);
  const model = normalizeRuntimeIdentifier(params.model);
  return (
    provider === "fal" ||
    provider.includes("fal-ai") ||
    isLikelyImageGenerationModelId(model)
  );
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requestHarness(
  requestMetadata: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!requestMetadata) {
    return undefined;
  }
  return isPlainRecord(requestMetadata.harness)
    ? requestMetadata.harness
    : requestMetadata;
}

function readHarnessStringFromRequestMetadata(
  requestMetadata: Record<string, unknown> | undefined,
  keys: readonly string[],
): string | null {
  const harness = requestHarness(requestMetadata);
  if (!harness) {
    return null;
  }
  for (const key of keys) {
    const value = harness[key];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }
  return null;
}

function readHarnessObjectFromRequestMetadata(
  requestMetadata: Record<string, unknown> | undefined,
  keys: readonly string[],
): Record<string, unknown> | null {
  const harness = requestHarness(requestMetadata);
  if (!harness) {
    return null;
  }
  for (const key of keys) {
    const value = harness[key];
    if (isPlainRecord(value)) {
      return value;
    }
  }
  return null;
}

function readRecordString(
  record: Record<string, unknown>,
  keys: readonly string[],
): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function hasImageGenerationContractMarker(
  record: Record<string, unknown> | null | undefined,
): boolean {
  if (!record) {
    return false;
  }
  const contractKey = normalizeRuntimeIdentifier(
    readRecordString(record, [
      "contract_key",
      "contractKey",
      "modality_contract_key",
      "modalityContractKey",
    ]),
  );
  if (contractKey === IMAGE_GENERATION_CONTRACT_KEY) {
    return true;
  }
  const routingSlot = normalizeRuntimeIdentifier(
    readRecordString(record, ["routing_slot", "routingSlot"]),
  );
  if (routingSlot === IMAGE_GENERATION_ROUTING_SLOT) {
    return true;
  }
  const runtimeContract = isPlainRecord(record.runtime_contract)
    ? record.runtime_contract
    : isPlainRecord(record.runtimeContract)
      ? record.runtimeContract
      : null;
  return hasImageGenerationContractMarker(runtimeContract);
}

function hasImageGenerationLaunchRouting(
  requestMetadata: Record<string, unknown> | undefined,
): boolean {
  const launch = readHarnessObjectFromRequestMetadata(
    requestMetadata,
    HARNESS_IMAGE_COMMAND_INTENT_KEYS,
  );
  if (!launch) {
    return false;
  }
  const requestContext = isPlainRecord(launch.request_context)
    ? launch.request_context
    : isPlainRecord(launch.requestContext)
      ? launch.requestContext
      : null;
  const imageTask = isPlainRecord(launch.image_task)
    ? launch.image_task
    : isPlainRecord(launch.imageTask)
      ? launch.imageTask
      : isPlainRecord(requestContext?.image_task)
        ? requestContext.image_task
        : isPlainRecord(requestContext?.imageTask)
          ? requestContext.imageTask
          : null;
  return (
    hasImageGenerationContractMarker(launch) ||
    hasImageGenerationContractMarker(imageTask)
  );
}

function omitHarnessFieldsFromRequestMetadata(
  requestMetadata: Record<string, unknown> | undefined,
  keys: readonly string[],
): Record<string, unknown> | undefined {
  if (!requestMetadata) {
    return requestMetadata;
  }
  const nestedHarness = requestMetadata.harness;
  const usesNestedHarness = isPlainRecord(nestedHarness);
  const harness = usesNestedHarness
    ? { ...(nestedHarness as Record<string, unknown>) }
    : { ...requestMetadata };
  let changed = false;
  for (const key of keys) {
    if (key in harness) {
      delete harness[key];
      changed = true;
    }
  }
  if (!changed) {
    return requestMetadata;
  }
  if (!usesNestedHarness) {
    return Object.keys(harness).length > 0 ? harness : undefined;
  }
  if (Object.keys(harness).length === 0) {
    const { harness: _removedHarness, ...rest } = requestMetadata;
    return Object.keys(rest).length > 0 ? rest : undefined;
  }
  return { ...requestMetadata, harness };
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
  const harness: Record<string, unknown> = usesNestedHarness
    ? (nestedHarness as Record<string, unknown>)
    : requestMetadata;
  if (!isPlainRecord(harness.preferences)) {
    return requestMetadata;
  }
  const preferences = { ...harness.preferences };
  let changed = false;
  for (const key of keys) {
    if (key in preferences) {
      delete preferences[key];
      changed = true;
    }
  }
  if (!changed) {
    return requestMetadata;
  }
  const nextHarness = { ...harness };
  if (Object.keys(preferences).length > 0) {
    nextHarness.preferences = preferences;
  } else {
    delete nextHarness.preferences;
  }
  if (!usesNestedHarness) {
    return Object.keys(nextHarness).length > 0 ? nextHarness : undefined;
  }
  if (Object.keys(nextHarness).length === 0) {
    const { harness: _removedHarness, ...rest } = requestMetadata;
    return Object.keys(rest).length > 0 ? rest : undefined;
  }
  return { ...requestMetadata, harness: nextHarness };
}

function readHarnessPreferenceFromRequestMetadata(
  requestMetadata: Record<string, unknown> | undefined,
  keys: readonly string[],
): boolean | null {
  const preferences = requestHarness(requestMetadata)?.preferences;
  if (!isPlainRecord(preferences)) {
    return null;
  }
  for (const key of keys) {
    if (typeof preferences[key] === "boolean") {
      return preferences[key];
    }
  }
  return null;
}

function knownPreference(
  executionRuntime: AgentSessionExecutionRuntime | null | undefined,
  syncedRecentPreferences: ChatToolPreferences | null | undefined,
  key: "task" | "subagent",
): boolean | null {
  if (typeof syncedRecentPreferences?.[key] === "boolean") {
    return syncedRecentPreferences[key];
  }
  const runtimeValue = executionRuntime?.recent_preferences?.[key];
  return typeof runtimeValue === "boolean" ? runtimeValue : null;
}

function sanitizeSubmitMetadata(options: {
  requestMetadata?: Record<string, unknown>;
  executionRuntime?: AgentSessionExecutionRuntime | null;
  syncedRecentPreferences?: ChatToolPreferences | null;
}): Record<string, unknown> | undefined {
  let metadata = omitHarnessFieldsFromRequestMetadata(options.requestMetadata, [
    ...RETIRED_HARNESS_IMAGE_SKILL_LAUNCH_KEYS,
    ...RETIRED_HARNESS_TEAM_SELECTION_KEYS,
  ]);
  metadata = omitHarnessPreferenceFromRequestMetadata(
    metadata,
    HARNESS_THINKING_PREFERENCE_KEYS,
  );
  metadata = omitHarnessPreferenceFromRequestMetadata(
    metadata,
    HARNESS_WEB_SEARCH_PREFERENCE_KEYS,
  );
  for (const [key, keys] of [
    ["task", HARNESS_TASK_PREFERENCE_KEYS],
    ["subagent", HARNESS_SUBAGENT_PREFERENCE_KEYS],
  ] as const) {
    const requested = readHarnessPreferenceFromRequestMetadata(metadata, keys);
    const known = knownPreference(
      options.executionRuntime,
      options.syncedRecentPreferences,
      key,
    );
    if (requested !== null && known !== null && requested === known) {
      metadata = omitHarnessPreferenceFromRequestMetadata(metadata, keys);
    }
  }
  return metadata;
}

function normalizeComparableText(value?: string | null): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function omitSyncedHarnessValue(
  metadata: Record<string, unknown> | undefined,
  keys: readonly string[],
  knownValue: string | null | undefined,
  normalize: (value?: string | null) => string | null = normalizeComparableText,
): Record<string, unknown> | undefined {
  const requestValue = normalize(
    readHarnessStringFromRequestMetadata(metadata, keys),
  );
  const known = normalize(knownValue);
  return requestValue !== null && known !== null && requestValue === known
    ? omitHarnessFieldsFromRequestMetadata(metadata, keys)
    : metadata;
}

export interface BuildSubmitOpRuntimeCompactionOptions {
  requestMetadata?: Record<string, unknown>;
  executionRuntime?: AgentSessionExecutionRuntime | null;
  syncedRecentPreferences?: ChatToolPreferences | null;
  syncedSessionModelPreference?: SessionModelPreference | null;
  effectiveProviderType: string;
  effectiveModel: string;
}

export interface SubmitOpRuntimeCompactionResult {
  metadata?: Record<string, unknown>;
  shouldSubmitModel: boolean;
}

function shouldSubmitTurnModel(
  options: BuildSubmitOpRuntimeCompactionOptions,
  metadata: Record<string, unknown> | undefined,
): boolean {
  const effectiveModel = normalizeRuntimeIdentifier(options.effectiveModel);
  if (!effectiveModel) {
    return false;
  }
  if (
    hasImageGenerationLaunchRouting(metadata) &&
    selectionLooksImageGenerationOnly({
      provider: options.effectiveProviderType,
      model: options.effectiveModel,
    })
  ) {
    return false;
  }
  const syncedModel = normalizeRuntimeIdentifier(
    options.syncedSessionModelPreference?.model,
  );
  return !syncedModel || syncedModel !== effectiveModel;
}

export function buildSubmitOpRuntimeCompaction(
  options: BuildSubmitOpRuntimeCompactionOptions,
): SubmitOpRuntimeCompactionResult {
  let metadata = sanitizeSubmitMetadata(options);
  metadata = omitSyncedHarnessValue(
    metadata,
    HARNESS_CONTENT_ID_KEYS,
    options.executionRuntime?.recent_content_id,
  );
  metadata = omitSyncedHarnessValue(
    metadata,
    HARNESS_ACCESS_MODE_KEYS,
    options.executionRuntime?.recent_access_mode,
  );
  metadata = omitSyncedHarnessValue(
    metadata,
    HARNESS_THEME_KEYS,
    options.executionRuntime?.recent_theme,
  );
  metadata = omitSyncedHarnessValue(
    metadata,
    HARNESS_SESSION_MODE_KEYS,
    options.executionRuntime?.recent_session_mode,
    normalizeHarnessSessionMode,
  );
  metadata = omitSyncedHarnessValue(
    metadata,
    HARNESS_GATE_KEY_KEYS,
    options.executionRuntime?.recent_gate_key,
  );
  metadata = omitSyncedHarnessValue(
    metadata,
    HARNESS_RUN_TITLE_KEYS,
    options.executionRuntime?.recent_run_title,
  );
  return {
    metadata,
    shouldSubmitModel: shouldSubmitTurnModel(options, metadata),
  };
}
