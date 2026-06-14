import type { AgentUserInputOp } from "@/lib/api/agentProtocol";
import type {
  AsterExecutionStrategy,
  AsterSessionExecutionRuntime,
  AutoContinueRequestPayload,
  AgentRuntimeWebSearchMode,
  ImageInput,
} from "@/lib/api/agentRuntime";
import type { AgentAccessMode } from "../hooks/agentChatStorage";
import type { SessionModelPreference } from "../hooks/agentChatShared";
import type { MessageImage } from "../types";
import type { ChatToolPreferences } from "./chatToolPreferences";
import { createRuntimePoliciesFromAccessMode } from "./accessModeRuntime";
import { buildSubmitOpRuntimeCompaction } from "./submitOpRuntimeCompaction";
import { normalizeExecutionStrategy } from "../hooks/agentChatCoreUtils";

function buildSubmitImages(images: MessageImage[]): ImageInput[] | undefined {
  if (images.length === 0) {
    return undefined;
  }

  return images.map((image) => ({
    data: image.data,
    media_type: image.mediaType,
  }));
}

export interface BuildUserInputSubmitOpOptions {
  content: string;
  images: MessageImage[];
  sessionId: string;
  eventName: string;
  workspaceId?: string;
  turnId?: string;
  systemPrompt?: string;
  queueIfBusy?: boolean;
  skipPreSubmitResume?: boolean;
  requestMetadata?: Record<string, unknown>;
  executionRuntime?: AsterSessionExecutionRuntime | null;
  syncedRecentPreferences?: ChatToolPreferences | null;
  syncedSessionModelPreference?: SessionModelPreference | null;
  syncedExecutionStrategy?: AsterExecutionStrategy | null;
  effectiveExecutionStrategy: AsterExecutionStrategy;
  effectiveAccessMode: AgentAccessMode;
  effectiveProviderType: string;
  effectiveModel: string;
  modelOverride?: string;
  reasoningEffort?: string;
  webSearch?: boolean;
  searchMode?: AgentRuntimeWebSearchMode;
  thinking?: boolean;
  explicitToolPreferences?: boolean;
  autoContinue?: AutoContinueRequestPayload;
}

export function buildUserInputSubmitOp(
  options: BuildUserInputSubmitOpOptions,
): AgentUserInputOp {
  const {
    content,
    images,
    sessionId,
    eventName,
    workspaceId,
    turnId,
    systemPrompt,
    queueIfBusy,
    skipPreSubmitResume,
    requestMetadata,
    executionRuntime,
    syncedRecentPreferences,
    syncedSessionModelPreference,
    syncedExecutionStrategy,
    effectiveExecutionStrategy,
    effectiveAccessMode,
    effectiveProviderType,
    effectiveModel,
    modelOverride,
    reasoningEffort,
    webSearch,
    searchMode,
    thinking,
    explicitToolPreferences,
    autoContinue,
  } = options;
  const normalizedEffectiveExecutionStrategy = normalizeExecutionStrategy(
    effectiveExecutionStrategy,
  );

  const compaction = buildSubmitOpRuntimeCompaction({
    requestMetadata,
    executionRuntime,
    syncedRecentPreferences,
    syncedSessionModelPreference,
    syncedExecutionStrategy,
    effectiveExecutionStrategy: normalizedEffectiveExecutionStrategy,
    effectiveProviderType,
    effectiveModel,
    modelOverride,
    requestedWebSearch: explicitToolPreferences ? webSearch : undefined,
    requestedThinking: explicitToolPreferences ? thinking : undefined,
  });
  const runtimePolicies =
    createRuntimePoliciesFromAccessMode(effectiveAccessMode);

  return {
    type: "user_input",
    text: content,
    sessionId,
    eventName,
    workspaceId,
    turnId,
    images: buildSubmitImages(images),
    preferences: {
      ...(compaction.providerConfig
        ? { providerConfig: compaction.providerConfig }
        : {}),
      providerPreference: compaction.shouldSubmitProviderPreference
        ? effectiveProviderType
        : undefined,
      modelPreference: compaction.shouldSubmitModelPreference
        ? effectiveModel
        : undefined,
      reasoningEffort: reasoningEffort?.trim() || undefined,
      thinking: compaction.shouldSubmitThinking
        ? compaction.thinkingPreference
        : undefined,
      approvalPolicy: runtimePolicies.approvalPolicy,
      sandboxPolicy: runtimePolicies.sandboxPolicy,
      executionStrategy: compaction.shouldSubmitExecutionStrategy
        ? normalizedEffectiveExecutionStrategy
        : undefined,
      webSearch: compaction.shouldSubmitWebSearch
        ? compaction.webSearchPreference
        : undefined,
      ...(searchMode ? { searchMode } : {}),
      autoContinue,
    },
    systemPrompt,
    metadata: compaction.metadata,
    queueIfBusy,
    skipPreSubmitResume,
  };
}
