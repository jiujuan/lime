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
import { normalizeExecutionStrategy } from "./agentChatCoreUtils";

export type AgentStreamUserInputSendPreparationEnv = Pick<
  AgentStreamPreparedSendEnv,
  | "executionStrategy"
  | "providerTypeRef"
  | "modelRef"
  | "reasoningEffortRef"
  | "sessionIdRef"
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
    sendOptions?.reasoningEffort?.trim() || env.reasoningEffortRef.current.trim();
  const effectiveProviderType =
    resolvedProviderOverride || env.providerTypeRef.current;
  const effectiveModel = resolvedModelOverride || env.modelRef.current;
  const currentSessionId = env.sessionIdRef.current;
  const syncedSessionModelPreference = currentSessionId
    ? env.getSyncedSessionModelPreference(currentSessionId)
    : null;
  const observer = sendOptions?.observer;
  const requestMetadata = sendOptions?.requestMetadata;
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
  };
}
