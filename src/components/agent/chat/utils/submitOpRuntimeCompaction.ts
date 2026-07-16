import type {
  AgentExecutionStrategy,
  AgentSessionExecutionRuntime,
} from "@/lib/api/agentExecutionRuntime";
import type { RuntimeProviderConfig } from "@/lib/api/agentRuntime/sessionTypes";
import { isLikelyImageGenerationModelId } from "@/lib/imageGen/providerMatchers";
import type { SessionModelPreference } from "../hooks/agentChatShared";
import type { ChatToolPreferences } from "./chatToolPreferences";
import { normalizeHarnessSessionMode } from "./harnessSessionMode";
import { normalizeExecutionStrategy } from "../hooks/agentChatCoreUtils";
import { compactSubmitOpToolPreferences } from "./submitOpToolPreferenceCompaction";

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

function readHarnessStringFromRequestMetadata(
  requestMetadata: Record<string, unknown> | undefined,
  keys: readonly string[],
): string | null {
  if (!requestMetadata) {
    return null;
  }

  const nestedHarness = requestMetadata.harness;
  const harness = isPlainRecord(nestedHarness)
    ? (nestedHarness as Record<string, unknown>)
    : requestMetadata;

  for (const key of keys) {
    if (typeof harness[key] === "string" && harness[key].trim()) {
      return harness[key] as string;
    }
  }

  return null;
}

function readHarnessObjectFromRequestMetadata(
  requestMetadata: Record<string, unknown> | undefined,
  keys: readonly string[],
): Record<string, unknown> | null {
  if (!requestMetadata) {
    return null;
  }

  const nestedHarness = requestMetadata.harness;
  const harness = isPlainRecord(nestedHarness)
    ? (nestedHarness as Record<string, unknown>)
    : requestMetadata;

  for (const key of keys) {
    const value = harness[key];
    if (isPlainRecord(value)) {
      return value as Record<string, unknown>;
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
    ? (record.runtime_contract as Record<string, unknown>)
    : isPlainRecord(record.runtimeContract)
      ? (record.runtimeContract as Record<string, unknown>)
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
    ? (launch.request_context as Record<string, unknown>)
    : isPlainRecord(launch.requestContext)
      ? (launch.requestContext as Record<string, unknown>)
      : null;
  const imageTask = isPlainRecord(launch.image_task)
    ? (launch.image_task as Record<string, unknown>)
    : isPlainRecord(launch.imageTask)
      ? (launch.imageTask as Record<string, unknown>)
      : isPlainRecord(requestContext?.image_task)
        ? (requestContext?.image_task as Record<string, unknown>)
        : isPlainRecord(requestContext?.imageTask)
          ? (requestContext?.imageTask as Record<string, unknown>)
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
    if (!(key in harness)) {
      continue;
    }
    delete harness[key];
    changed = true;
  }

  if (!changed) {
    return requestMetadata;
  }

  if (usesNestedHarness) {
    if (Object.keys(harness).length === 0) {
      const { harness: _removedHarness, ...rest } = requestMetadata;
      return Object.keys(rest).length > 0 ? rest : undefined;
    }
    return {
      ...requestMetadata,
      harness,
    };
  }

  return Object.keys(harness).length > 0 ? harness : undefined;
}

function omitRetiredHarnessMetadata(
  requestMetadata: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  return omitHarnessFieldsFromRequestMetadata(requestMetadata, [
    ...RETIRED_HARNESS_IMAGE_SKILL_LAUNCH_KEYS,
    ...RETIRED_HARNESS_TEAM_SELECTION_KEYS,
  ]);
}

function normalizeComparableText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized ? normalized : null;
}

export interface BuildSubmitOpRuntimeCompactionOptions {
  requestMetadata?: Record<string, unknown>;
  executionRuntime?: AgentSessionExecutionRuntime | null;
  syncedRecentPreferences?: ChatToolPreferences | null;
  syncedSessionModelPreference?: SessionModelPreference | null;
  syncedExecutionStrategy?: AgentExecutionStrategy | null;
  effectiveExecutionStrategy: AgentExecutionStrategy;
  effectiveProviderType: string;
  effectiveModel: string;
  modelOverride?: string;
  requestedWebSearch?: boolean;
  requestedThinking?: boolean;
}

export interface SubmitOpRuntimeCompactionResult {
  metadata?: Record<string, unknown>;
  providerConfig?: RuntimeProviderConfig;
  shouldSubmitProviderPreference: boolean;
  shouldSubmitModelPreference: boolean;
  shouldSubmitExecutionStrategy: boolean;
  shouldSubmitWebSearch: boolean;
  shouldSubmitThinking: boolean;
  webSearchPreference?: boolean;
  thinkingPreference?: boolean;
}

function resolveImageOrchestrationProviderConfig(params: {
  effectiveProviderType: string;
  effectiveModel: string;
  syncedSessionModelPreference?: SessionModelPreference | null;
  executionRuntime?: AgentSessionExecutionRuntime | null;
}): RuntimeProviderConfig | undefined {
  const candidates = [
    {
      provider: params.effectiveProviderType.trim(),
      model: params.effectiveModel.trim(),
    },
    {
      provider: params.syncedSessionModelPreference?.providerType?.trim() || "",
      model: params.syncedSessionModelPreference?.model?.trim() || "",
    },
    {
      provider: params.executionRuntime?.provider_selector?.trim() || "",
      model: params.executionRuntime?.model_name?.trim() || "",
    },
  ];

  const selection = candidates.find(
    (candidate) =>
      candidate.provider &&
      candidate.model &&
      !selectionLooksImageGenerationOnly(candidate),
  );
  if (!selection) {
    return undefined;
  }

  return {
    provider_id: selection.provider,
    provider_name: selection.provider,
    model_name: selection.model,
  };
}

export function buildSubmitOpRuntimeCompaction(
  options: BuildSubmitOpRuntimeCompactionOptions,
): SubmitOpRuntimeCompactionResult {
  const {
    executionRuntime,
    syncedRecentPreferences,
    syncedSessionModelPreference,
    syncedExecutionStrategy,
    effectiveExecutionStrategy,
    effectiveProviderType,
    effectiveModel,
    modelOverride,
    requestedWebSearch,
    requestedThinking,
  } = options;
  const requestMetadata = omitRetiredHarnessMetadata(options.requestMetadata);

  const syncedProviderSelector =
    syncedSessionModelPreference?.providerType?.trim() || null;
  const syncedModelName = syncedSessionModelPreference?.model?.trim() || null;
  const hasImageGenerationRouting =
    hasImageGenerationLaunchRouting(requestMetadata);
  const hasExplicitModelOverride = Boolean(modelOverride?.trim());
  const normalizedEffectiveProviderType = normalizeRuntimeIdentifier(
    effectiveProviderType,
  );
  const normalizedEffectiveModel = normalizeRuntimeIdentifier(effectiveModel);
  const hasEffectiveProviderType = Boolean(normalizedEffectiveProviderType);
  const hasEffectiveModel = Boolean(normalizedEffectiveModel);
  const effectiveSelectionLooksImageOnly = selectionLooksImageGenerationOnly({
    provider: effectiveProviderType,
    model: effectiveModel,
  });
  const imageOrchestrationProviderConfig = hasImageGenerationRouting
    ? resolveImageOrchestrationProviderConfig({
        effectiveProviderType,
        effectiveModel,
        syncedSessionModelPreference,
        executionRuntime,
      })
    : undefined;
  const shouldSuppressImageOnlyEffectivePreferences = Boolean(
    hasImageGenerationRouting && effectiveSelectionLooksImageOnly,
  );
  const shouldSubmitProviderPreference =
    hasEffectiveProviderType &&
    hasEffectiveModel &&
    !shouldSuppressImageOnlyEffectivePreferences &&
    (!syncedProviderSelector ||
      !syncedModelName ||
      normalizeRuntimeIdentifier(syncedProviderSelector) !==
        normalizedEffectiveProviderType);
  // executionRuntime 只说明上一轮使用过什么模型，不能证明后端已持久化 session model fallback。
  const shouldSubmitModelPreference =
    hasEffectiveProviderType &&
    hasEffectiveModel &&
    !shouldSuppressImageOnlyEffectivePreferences &&
    (hasExplicitModelOverride ||
      shouldSubmitProviderPreference ||
      !syncedProviderSelector ||
      !syncedModelName ||
      normalizeRuntimeIdentifier(syncedModelName) !== normalizedEffectiveModel);
  const normalizedEffectiveExecutionStrategy = normalizeExecutionStrategy(
    effectiveExecutionStrategy,
  );

  const knownExecutionStrategy = syncedExecutionStrategy
    ? normalizeExecutionStrategy(syncedExecutionStrategy)
    : executionRuntime?.execution_strategy
      ? normalizeExecutionStrategy(executionRuntime.execution_strategy)
      : null;
  const shouldSubmitExecutionStrategy =
    normalizedEffectiveExecutionStrategy !== "react" &&
    (!knownExecutionStrategy ||
      normalizeRuntimeIdentifier(knownExecutionStrategy) !==
        normalizeRuntimeIdentifier(normalizedEffectiveExecutionStrategy));

  const preferenceCompaction = compactSubmitOpToolPreferences({
    requestMetadata,
    executionRuntime,
    syncedRecentPreferences,
    requestedWebSearch,
    requestedThinking,
  });
  let metadata = preferenceCompaction.metadata;

  const requestContentId = normalizeComparableText(
    readHarnessStringFromRequestMetadata(metadata, HARNESS_CONTENT_ID_KEYS),
  );
  const knownRecentContentId = normalizeComparableText(
    executionRuntime?.recent_content_id,
  );
  if (
    requestContentId !== null &&
    knownRecentContentId !== null &&
    requestContentId === knownRecentContentId
  ) {
    metadata = omitHarnessFieldsFromRequestMetadata(
      metadata,
      HARNESS_CONTENT_ID_KEYS,
    );
  }

  const requestAccessMode = normalizeComparableText(
    readHarnessStringFromRequestMetadata(metadata, HARNESS_ACCESS_MODE_KEYS),
  );
  const knownRecentAccessMode = normalizeComparableText(
    executionRuntime?.recent_access_mode,
  );
  if (
    requestAccessMode !== null &&
    knownRecentAccessMode !== null &&
    requestAccessMode === knownRecentAccessMode
  ) {
    metadata = omitHarnessFieldsFromRequestMetadata(
      metadata,
      HARNESS_ACCESS_MODE_KEYS,
    );
  }

  const requestTheme = normalizeComparableText(
    readHarnessStringFromRequestMetadata(metadata, HARNESS_THEME_KEYS),
  );
  const knownRecentTheme = normalizeComparableText(
    executionRuntime?.recent_theme,
  );
  if (
    requestTheme !== null &&
    knownRecentTheme !== null &&
    requestTheme === knownRecentTheme
  ) {
    metadata = omitHarnessFieldsFromRequestMetadata(
      metadata,
      HARNESS_THEME_KEYS,
    );
  }

  const requestSessionMode = normalizeHarnessSessionMode(
    readHarnessStringFromRequestMetadata(metadata, HARNESS_SESSION_MODE_KEYS),
  );
  const knownRecentSessionMode = normalizeHarnessSessionMode(
    executionRuntime?.recent_session_mode,
  );
  if (
    requestSessionMode !== null &&
    knownRecentSessionMode !== null &&
    requestSessionMode === knownRecentSessionMode
  ) {
    metadata = omitHarnessFieldsFromRequestMetadata(
      metadata,
      HARNESS_SESSION_MODE_KEYS,
    );
  }

  const requestGateKey = normalizeComparableText(
    readHarnessStringFromRequestMetadata(metadata, HARNESS_GATE_KEY_KEYS),
  );
  const knownRecentGateKey = normalizeComparableText(
    executionRuntime?.recent_gate_key,
  );
  if (
    requestGateKey !== null &&
    knownRecentGateKey !== null &&
    requestGateKey === knownRecentGateKey
  ) {
    metadata = omitHarnessFieldsFromRequestMetadata(
      metadata,
      HARNESS_GATE_KEY_KEYS,
    );
  }

  const requestRunTitle = normalizeComparableText(
    readHarnessStringFromRequestMetadata(metadata, HARNESS_RUN_TITLE_KEYS),
  );
  const knownRecentRunTitle = normalizeComparableText(
    executionRuntime?.recent_run_title,
  );
  if (
    requestRunTitle !== null &&
    knownRecentRunTitle !== null &&
    requestRunTitle === knownRecentRunTitle
  ) {
    metadata = omitHarnessFieldsFromRequestMetadata(
      metadata,
      HARNESS_RUN_TITLE_KEYS,
    );
  }

  return {
    metadata,
    providerConfig: imageOrchestrationProviderConfig,
    shouldSubmitProviderPreference,
    shouldSubmitModelPreference,
    shouldSubmitExecutionStrategy,
    shouldSubmitWebSearch: preferenceCompaction.shouldSubmitWebSearch,
    shouldSubmitThinking: preferenceCompaction.shouldSubmitThinking,
    webSearchPreference: preferenceCompaction.webSearchPreference,
    thinkingPreference: preferenceCompaction.thinkingPreference,
  };
}
