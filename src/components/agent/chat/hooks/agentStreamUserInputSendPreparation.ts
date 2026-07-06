import type {
  AgentRuntimeWebSearchMode,
  AsterExecutionStrategy,
} from "@/lib/api/agentRuntime";
import type {
  AssistantDraftState,
  SendMessageObserver,
  SendMessageOptions,
  SessionModelPreference,
} from "./agentChatShared";
import type { Message, MessageImage } from "../types";
import { prepareAgentStreamSubmitDraft } from "./agentStreamSubmitDraft";
import type { AgentStreamPreparedSendEnv } from "./agentStreamPreparedSendEnv";
import {
  resolveAgentRuntimeStatusPresentation,
  type AgentRuntimeStatusPresentation,
} from "../utils/fastResponseRouting";
import type { InterruptedInputDraftSnapshot } from "./agentStreamInputRestoreTypes";
import { normalizeExecutionStrategy } from "./agentChatCoreUtils";
import { ensureAgentUiPerformanceTraceMetadata } from "./agentStreamPerformanceMetrics";
import {
  buildModelCapabilitySendGateInput,
  evaluateModelInputCapability,
  mergeModelInputCapabilityGateMetadata,
  type ModelCapabilitySendGateResult,
} from "@/lib/model/modelCapabilitySendGate";

export type AgentStreamUserInputSendPreparationEnv = Pick<
  AgentStreamPreparedSendEnv,
  | "executionStrategy"
  | "providerTypeRef"
  | "modelRef"
  | "reasoningEffortRef"
  | "sessionIdRef"
  | "executionRuntime"
  | "clawTraceEnabled"
  | "soulCopy"
  | "getWorkspaceIdForSubmit"
  | "activeStreamRef"
  | "getQueuedTurnsCount"
  | "isThreadBusy"
  | "hasPendingPreparedSubmit"
  | "getSyncedSessionModelPreference"
  | "setMessages"
  | "setIsSending"
>;

interface PrepareAgentStreamUserInputSendOptions {
  content: string;
  images: MessageImage[];
  webSearch?: boolean;
  searchMode?: AgentRuntimeWebSearchMode;
  thinking?: boolean;
  skipUserMessage: boolean;
  executionStrategyOverride?: AsterExecutionStrategy;
  modelOverride?: string;
  autoContinue?: import("@/lib/api/agentRuntime").AutoContinueRequestPayload;
  systemPrompt?: string;
  options?: SendMessageOptions;
  env: AgentStreamUserInputSendPreparationEnv;
}

export interface PreparedAgentStreamUserInputSend {
  content: string;
  images: MessageImage[];
  webSearch?: boolean;
  searchMode?: AgentRuntimeWebSearchMode;
  thinking?: boolean;
  skipUserMessage: boolean;
  effectiveExecutionStrategy: AsterExecutionStrategy;
  effectiveProviderType: string;
  effectiveModel: string;
  modelOverride?: string;
  reasoningEffort?: string;
  autoContinue?: import("@/lib/api/agentRuntime").AutoContinueRequestPayload;
  systemPrompt?: string;
  syncedSessionModelPreference: SessionModelPreference | null;
  observer?: SendMessageObserver;
  requestMetadata?: Record<string, unknown>;
  modelInputCapabilityGate?: ModelCapabilitySendGateResult;
  assistantDraft?: AssistantDraftState;
  skillRequest?: SendMessageOptions["skillRequest"];
  explicitToolPreferences?: boolean;
  skipSessionRestore?: boolean;
  skipSessionStartHooks?: boolean;
  skipPreSubmitResume?: boolean;
  expectingQueue: boolean;
  assistantMsgId: string;
  userMsgId: string | null;
  userMsg: Message | null;
  assistantMsg: Message;
  runtimeStatusPresentation?: AgentRuntimeStatusPresentation;
  submittedDraft?: InterruptedInputDraftSnapshot | null;
}

export function resolvePreparedSendExpectingQueue(options: {
  activeStreamSessionId?: string | null;
  currentSessionId?: string | null;
  queuedTurnsCount: number;
  threadBusy: boolean;
  pendingPreparedSubmit: boolean;
}): boolean {
  if (options.queuedTurnsCount > 0) {
    return true;
  }

  if (options.threadBusy || options.pendingPreparedSubmit) {
    return true;
  }

  const activeStreamSessionId = options.activeStreamSessionId?.trim();
  if (!activeStreamSessionId) {
    return false;
  }

  const currentSessionId = options.currentSessionId?.trim();
  return !currentSessionId || activeStreamSessionId !== currentSessionId;
}

function shouldProjectModelInputCapabilityGate(
  gate: ModelCapabilitySendGateResult,
  summary: SendMessageOptions["modelCapabilitySummary"],
): boolean {
  if (gate.requiredInputModalities.length === 0) {
    return false;
  }

  return Boolean(summary) || gate.requiresMediaInput;
}

interface SendModelPreferenceCandidate {
  providerType?: string | null;
  model?: string | null;
}

function normalizeSendModelPreferenceValue(value?: string | null): string {
  return (value || "").trim();
}

function normalizeProviderIdentity(value?: string | null): string {
  return normalizeSendModelPreferenceValue(value).toLowerCase();
}

function toCompleteSendModelPreference(
  candidate: SendModelPreferenceCandidate,
): SessionModelPreference | null {
  const providerType = normalizeSendModelPreferenceValue(
    candidate.providerType,
  );
  const model = normalizeSendModelPreferenceValue(candidate.model);
  return providerType && model ? { providerType, model } : null;
}

function resolveModelForProvider(
  providerType: string,
  candidates: SendModelPreferenceCandidate[],
): string {
  const normalizedProvider = normalizeProviderIdentity(providerType);
  if (!normalizedProvider) {
    return "";
  }

  for (const candidate of candidates) {
    if (
      normalizeProviderIdentity(candidate.providerType) !== normalizedProvider
    ) {
      continue;
    }
    const model = normalizeSendModelPreferenceValue(candidate.model);
    if (model) {
      return model;
    }
  }

  return "";
}

function resolvePreparedSendModelPreference(options: {
  providerOverride?: string | null;
  modelOverride?: string | null;
  currentProviderType?: string | null;
  currentModel?: string | null;
  runtimeProviderType?: string | null;
  runtimeModel?: string | null;
  syncedSessionModelPreference?: SessionModelPreference | null;
}): SessionModelPreference | null {
  const providerOverride = normalizeSendModelPreferenceValue(
    options.providerOverride,
  );
  const modelOverride = normalizeSendModelPreferenceValue(
    options.modelOverride,
  );
  const currentCandidate: SendModelPreferenceCandidate = {
    providerType: options.currentProviderType,
    model: options.currentModel,
  };
  const runtimeCandidate: SendModelPreferenceCandidate = {
    providerType: options.runtimeProviderType,
    model: options.runtimeModel,
  };
  const syncedCandidate: SendModelPreferenceCandidate | null =
    options.syncedSessionModelPreference
      ? {
          providerType: options.syncedSessionModelPreference.providerType,
          model: options.syncedSessionModelPreference.model,
        }
      : null;
  const fallbackCandidates = [
    currentCandidate,
    runtimeCandidate,
    syncedCandidate,
  ].filter(
    (candidate): candidate is SendModelPreferenceCandidate =>
      candidate !== null,
  );

  if (providerOverride && modelOverride) {
    return { providerType: providerOverride, model: modelOverride };
  }

  if (providerOverride) {
    const matchedModel = resolveModelForProvider(
      providerOverride,
      fallbackCandidates,
    );
    return matchedModel
      ? { providerType: providerOverride, model: matchedModel }
      : null;
  }

  if (modelOverride) {
    const providerType = normalizeSendModelPreferenceValue(
      options.currentProviderType ||
        options.runtimeProviderType ||
        syncedCandidate?.providerType,
    );
    return providerType ? { providerType, model: modelOverride } : null;
  }

  for (const candidate of fallbackCandidates) {
    const completePreference = toCompleteSendModelPreference(candidate);
    if (completePreference) {
      return completePreference;
    }
  }

  return null;
}

export function prepareAgentStreamUserInputSend(
  options: PrepareAgentStreamUserInputSendOptions,
): PreparedAgentStreamUserInputSend {
  const {
    content,
    images,
    webSearch,
    thinking,
    skipUserMessage,
    executionStrategyOverride,
    modelOverride,
    autoContinue,
    systemPrompt,
    options: sendOptions,
    env,
  } = options;

  const effectiveExecutionStrategy = normalizeExecutionStrategy(
    executionStrategyOverride || env.executionStrategy,
  );
  const resolvedProviderOverride = sendOptions?.providerOverride?.trim();
  const resolvedModelOverride =
    sendOptions?.modelOverride?.trim() || modelOverride?.trim();
  const resolvedReasoningEffort =
    sendOptions?.reasoningEffort?.trim() ||
    env.reasoningEffortRef.current.trim();
  const currentSessionId = env.sessionIdRef.current;
  const syncedSessionModelPreference = currentSessionId
    ? env.getSyncedSessionModelPreference(currentSessionId)
    : null;
  const currentProviderType = env.providerTypeRef.current.trim();
  const currentModel = env.modelRef.current.trim();
  const runtimeProviderType =
    env.executionRuntime?.provider_selector?.trim() ||
    env.executionRuntime?.provider_name?.trim() ||
    "";
  const runtimeModel = env.executionRuntime?.model_name?.trim() || "";
  const resolvedModelPreference = resolvePreparedSendModelPreference({
    providerOverride: resolvedProviderOverride,
    modelOverride: resolvedModelOverride,
    currentProviderType,
    currentModel,
    runtimeProviderType,
    runtimeModel,
    syncedSessionModelPreference,
  });
  const effectiveProviderType = resolvedModelPreference?.providerType ?? "";
  const effectiveModel = resolvedModelPreference?.model ?? "";
  const observer = sendOptions?.observer;
  const baseRequestMetadata = ensureAgentUiPerformanceTraceMetadata(
    sendOptions?.requestMetadata,
    {
      enabled: env.clawTraceEnabled,
      sessionId: currentSessionId,
      source: "agent-chat",
      submittedAt: Date.now(),
      workspaceId: env.getWorkspaceIdForSubmit(),
    },
  );
  const modelCapabilityGateInput = buildModelCapabilitySendGateInput({
    text: content,
    imageCount: images.length,
  });
  const modelInputCapabilityGate = evaluateModelInputCapability(
    sendOptions?.modelCapabilitySummary,
    modelCapabilityGateInput,
  );
  const projectedModelInputCapabilityGate =
    shouldProjectModelInputCapabilityGate(
      modelInputCapabilityGate,
      sendOptions?.modelCapabilitySummary,
    )
      ? modelInputCapabilityGate
      : undefined;
  const requestMetadata = mergeModelInputCapabilityGateMetadata(
    baseRequestMetadata,
    projectedModelInputCapabilityGate,
  );
  const runtimeStatusPresentation =
    resolveAgentRuntimeStatusPresentation(requestMetadata);
  const messagePurpose = sendOptions?.purpose;
  const assistantDraft = sendOptions?.assistantDraft;
  const capabilityRoute = sendOptions?.capabilityRoute;
  const searchMode = sendOptions?.searchMode;
  const explicitToolPreferences = sendOptions?.explicitToolPreferences === true;
  const skipSessionRestore = sendOptions?.skipSessionRestore === true;
  const skipSessionStartHooks = sendOptions?.skipSessionStartHooks === true;
  const skipPreSubmitResume = sendOptions?.skipPreSubmitResume === true;
  const resolvedSystemPrompt =
    sendOptions?.systemPromptOverride?.trim() || systemPrompt;
  const displayContent = sendOptions?.displayContent;
  const submittedDraft: InterruptedInputDraftSnapshot =
    sendOptions?.inputRestoreDraft ?? {
      text: displayContent ?? content,
      images,
      inputCapabilityRoute: capabilityRoute,
    };
  const skillRequest = sendOptions?.skillRequest;
  const expectingQueue = resolvePreparedSendExpectingQueue({
    activeStreamSessionId: env.activeStreamRef.current?.sessionId,
    currentSessionId,
    queuedTurnsCount: env.getQueuedTurnsCount(),
    threadBusy: env.isThreadBusy(),
    pendingPreparedSubmit: env.hasPendingPreparedSubmit(),
  });
  const assistantMsgId = crypto.randomUUID();
  const userMsgId = skipUserMessage ? null : crypto.randomUUID();
  const { assistantMsg, userMsg } = prepareAgentStreamSubmitDraft({
    content,
    displayContent,
    images,
    skipUserMessage,
    expectingQueue,
    assistantMsgId,
    userMsgId,
    assistantDraft,
    requestMetadata,
    messagePurpose,
    capabilityRoute,
    effectiveExecutionStrategy,
    soulCopy: env.soulCopy,
    setMessages: env.setMessages,
    setIsSending: env.setIsSending,
  });

  return {
    content,
    images,
    webSearch,
    searchMode,
    thinking,
    skipUserMessage,
    effectiveExecutionStrategy,
    effectiveProviderType,
    effectiveModel,
    modelOverride: resolvedModelOverride,
    reasoningEffort: resolvedReasoningEffort || undefined,
    autoContinue,
    systemPrompt: resolvedSystemPrompt,
    syncedSessionModelPreference,
    observer,
    requestMetadata,
    modelInputCapabilityGate: projectedModelInputCapabilityGate,
    assistantDraft,
    skillRequest,
    explicitToolPreferences,
    skipSessionRestore,
    skipSessionStartHooks,
    skipPreSubmitResume,
    expectingQueue,
    assistantMsgId,
    userMsgId,
    userMsg,
    assistantMsg,
    runtimeStatusPresentation,
    submittedDraft,
  };
}
