import type { AgentExecutionStrategy } from "@/lib/api/agentExecutionRuntime";
import type { AgentSessionMetadataPatch } from "./agentRuntimeAdapter";
import type { AgentAccessMode } from "./agentChatStorage";
import type { SessionModelPreference } from "./agentChatShared";
import { normalizeExecutionStrategy } from "./agentChatCoreUtils";
import { normalizeChatSessionModelPreference } from "../utils/sessionExecutionRuntime";

export type SessionAccessModeSource =
  | "execution_runtime"
  | "session_storage"
  | "workspace_default";

export type SessionExecutionStrategySource =
  | "session_detail"
  | "topics_snapshot"
  | "shadow_cache"
  | "default";

export type SessionModelPreferenceSource =
  | "execution_runtime"
  | "session_storage";

export interface SessionMetadataSyncPlan {
  accessMode: AgentAccessMode;
  accessModeSource: SessionAccessModeSource;
  fallbackExecutionStrategy: AgentExecutionStrategy | null;
  fallbackProviderPreference: SessionModelPreference | null;
  hasPatch: boolean;
  modelPreferenceSource: SessionModelPreferenceSource | null;
  patch: AgentSessionMetadataPatch;
  providerPreferenceToApply: SessionModelPreference | null;
  shouldPersistAccessMode: boolean;
}

export interface SessionFinalizeLocalStatePlan {
  accessModeToApply: AgentAccessMode;
  accessModeToPersist: AgentAccessMode | null;
  runtimeExecutionStrategyToMarkSynced: AgentExecutionStrategy | null;
  switchSuccessMetricContext: Record<string, unknown>;
}

export interface SessionMetadataSyncSuccessApplyPlan {
  executionStrategyToApplyToTopic: AgentExecutionStrategy | null;
  executionStrategyToMarkSynced: AgentExecutionStrategy | null;
  providerPreferenceToMarkSynced: SessionModelPreference | null;
}

export interface SessionMetadataSyncInputPlan {
  runtimeAccessMode: AgentAccessMode | null;
  runtimePreference: SessionModelPreference | null;
  shadowAccessMode: AgentAccessMode | null;
  shadowExecutionStrategyFallback: AgentExecutionStrategy | null;
  topicPreference: SessionModelPreference | null;
  workspaceDefaultAccessMode: AgentAccessMode;
}

export interface SessionMetadataSyncRuntime {
  setSessionAccessMode?: (
    sessionId: string,
    accessMode: AgentAccessMode,
  ) => Promise<void>;
  setSessionExecutionStrategy: (
    sessionId: string,
    executionStrategy: AgentExecutionStrategy,
  ) => Promise<void>;
  setSessionProviderSelection: (
    sessionId: string,
    providerType: string,
    model: string,
  ) => Promise<void>;
  updateSessionMetadata?: (
    sessionId: string,
    patch: AgentSessionMetadataPatch,
  ) => Promise<void>;
}

export function resolveSessionExecutionStrategySource(params: {
  runtimeExecutionStrategy?: AgentExecutionStrategy | null;
  topicExecutionStrategy?: AgentExecutionStrategy | null;
  shadowExecutionStrategyFallback?: AgentExecutionStrategy | null;
}): SessionExecutionStrategySource {
  if (params.runtimeExecutionStrategy) {
    return "session_detail";
  }
  if (params.topicExecutionStrategy) {
    return "topics_snapshot";
  }
  if (params.shadowExecutionStrategyFallback) {
    return "shadow_cache";
  }
  return "default";
}

export function buildSessionMetadataSyncInputPlan(params: {
  runtimeAccessMode?: AgentAccessMode | null;
  runtimePreference?: SessionModelPreference | null;
  shadowAccessMode?: AgentAccessMode | null;
  shadowExecutionStrategyFallback?: AgentExecutionStrategy | null;
  storedPreference?: SessionModelPreference | null;
  workspaceDefaultAccessMode: AgentAccessMode;
}): SessionMetadataSyncInputPlan {
  const runtimePreference = normalizeChatSessionModelPreference(
    params.runtimePreference,
  );
  const storedPreference = normalizeChatSessionModelPreference(
    params.storedPreference,
  );
  return {
    runtimeAccessMode: params.runtimeAccessMode ?? null,
    runtimePreference,
    shadowAccessMode: params.shadowAccessMode ?? null,
    shadowExecutionStrategyFallback:
      params.shadowExecutionStrategyFallback ?? null,
    topicPreference: runtimePreference ?? storedPreference ?? null,
    workspaceDefaultAccessMode: params.workspaceDefaultAccessMode,
  };
}

export function buildSessionMetadataSyncPlan(params: {
  runtimeAccessMode?: AgentAccessMode | null;
  runtimePreference?: SessionModelPreference | null;
  shadowAccessMode?: AgentAccessMode | null;
  shadowExecutionStrategyFallback?: AgentExecutionStrategy | null;
  topicPreference?: SessionModelPreference | null;
  workspaceDefaultAccessMode: AgentAccessMode;
}): SessionMetadataSyncPlan {
  const runtimePreference = normalizeChatSessionModelPreference(
    params.runtimePreference,
  );
  const topicPreference = normalizeChatSessionModelPreference(
    params.topicPreference,
  );
  const patch: AgentSessionMetadataPatch = {};
  let accessMode: AgentAccessMode;
  let accessModeSource: SessionAccessModeSource;
  let shouldPersistAccessMode = false;

  if (params.runtimeAccessMode) {
    accessMode = params.runtimeAccessMode;
    accessModeSource = "execution_runtime";
    shouldPersistAccessMode = true;
  } else if (params.shadowAccessMode) {
    accessMode = params.shadowAccessMode;
    accessModeSource = "session_storage";
    patch.accessMode = params.shadowAccessMode;
  } else {
    accessMode = params.workspaceDefaultAccessMode;
    accessModeSource = "workspace_default";
    shouldPersistAccessMode = true;
    patch.accessMode = params.workspaceDefaultAccessMode;
  }

  const providerPreferenceToApply = topicPreference;
  const fallbackProviderPreference =
    providerPreferenceToApply && !runtimePreference
      ? providerPreferenceToApply
      : null;
  if (fallbackProviderPreference) {
    patch.providerType = fallbackProviderPreference.providerType;
    patch.model = fallbackProviderPreference.model;
  }

  const fallbackExecutionStrategy = params.shadowExecutionStrategyFallback
    ? normalizeExecutionStrategy(params.shadowExecutionStrategyFallback)
    : null;
  if (fallbackExecutionStrategy) {
    patch.executionStrategy = fallbackExecutionStrategy;
  }

  return {
    accessMode,
    accessModeSource,
    fallbackExecutionStrategy,
    fallbackProviderPreference,
    hasPatch: Boolean(
      patch.accessMode ||
      patch.providerType ||
      patch.model ||
      patch.executionStrategy,
    ),
    modelPreferenceSource: runtimePreference
      ? "execution_runtime"
      : providerPreferenceToApply
        ? "session_storage"
        : null,
    patch,
    providerPreferenceToApply,
    shouldPersistAccessMode,
  };
}

export function buildSessionSwitchSuccessMetricContext(params: {
  accessModeSource: SessionAccessModeSource;
  durationMs: number;
  executionStrategySource: SessionExecutionStrategySource;
  itemsCount: number;
  messagesCount: number;
  modelPreferenceSource: SessionModelPreferenceSource | null;
  topicId: string;
  turnsCount: number;
  workspaceId?: string | null;
}): Record<string, unknown> {
  return {
    accessModeSource: params.accessModeSource,
    durationMs: params.durationMs,
    executionStrategySource: params.executionStrategySource,
    itemsCount: params.itemsCount,
    messagesCount: params.messagesCount,
    modelPreferenceSource: params.modelPreferenceSource,
    sessionId: params.topicId,
    topicId: params.topicId,
    turnsCount: params.turnsCount,
    workspaceId: params.workspaceId,
  };
}

export function buildSessionFinalizeLocalStatePlan(params: {
  durationMs: number;
  itemsCount: number;
  messagesCount: number;
  metadataSyncPlan: Pick<
    SessionMetadataSyncPlan,
    | "accessMode"
    | "accessModeSource"
    | "modelPreferenceSource"
    | "shouldPersistAccessMode"
  >;
  runtimeExecutionStrategy?: AgentExecutionStrategy | null;
  shadowExecutionStrategyFallback?: AgentExecutionStrategy | null;
  topicExecutionStrategy?: AgentExecutionStrategy | null;
  topicId: string;
  turnsCount: number;
  workspaceId?: string | null;
}): SessionFinalizeLocalStatePlan {
  return {
    accessModeToApply: params.metadataSyncPlan.accessMode,
    accessModeToPersist: params.metadataSyncPlan.shouldPersistAccessMode
      ? params.metadataSyncPlan.accessMode
      : null,
    runtimeExecutionStrategyToMarkSynced:
      params.runtimeExecutionStrategy ?? null,
    switchSuccessMetricContext: buildSessionSwitchSuccessMetricContext({
      accessModeSource: params.metadataSyncPlan.accessModeSource,
      durationMs: params.durationMs,
      executionStrategySource: resolveSessionExecutionStrategySource({
        runtimeExecutionStrategy: params.runtimeExecutionStrategy,
        topicExecutionStrategy: params.topicExecutionStrategy,
        shadowExecutionStrategyFallback: params.shadowExecutionStrategyFallback,
      }),
      itemsCount: params.itemsCount,
      messagesCount: params.messagesCount,
      modelPreferenceSource: params.metadataSyncPlan.modelPreferenceSource,
      topicId: params.topicId,
      turnsCount: params.turnsCount,
      workspaceId: params.workspaceId,
    }),
  };
}

export function buildSessionMetadataSyncSuccessApplyPlan(params: {
  fallbackExecutionStrategy?: AgentExecutionStrategy | null;
  fallbackProviderPreference?: SessionModelPreference | null;
}): SessionMetadataSyncSuccessApplyPlan {
  return {
    executionStrategyToApplyToTopic: params.fallbackExecutionStrategy ?? null,
    executionStrategyToMarkSynced: params.fallbackExecutionStrategy ?? null,
    providerPreferenceToMarkSynced: params.fallbackProviderPreference ?? null,
  };
}

export function applyFallbackExecutionStrategyToTopics<
  TTopic extends { id: string },
>(
  topics: TTopic[],
  params: {
    executionStrategyToApplyToTopic?: AgentExecutionStrategy | null;
    topicId: string;
  },
): TTopic[] {
  if (!params.executionStrategyToApplyToTopic) {
    return topics;
  }

  return topics.map((topic) =>
    topic.id === params.topicId
      ? ({
          ...topic,
          executionStrategy: params.executionStrategyToApplyToTopic,
        } as TTopic)
      : topic,
  );
}

export async function executeSessionMetadataSync(params: {
  fallbackExecutionStrategy: AgentExecutionStrategy | null;
  fallbackProviderPreference: SessionModelPreference | null;
  patch: AgentSessionMetadataPatch;
  runtime: SessionMetadataSyncRuntime;
  sessionId: string;
}): Promise<void> {
  if (params.runtime.updateSessionMetadata) {
    return params.runtime.updateSessionMetadata(params.sessionId, params.patch);
  }

  const tasks: Promise<void>[] = [];
  if (params.patch.accessMode && params.runtime.setSessionAccessMode) {
    tasks.push(
      params.runtime.setSessionAccessMode(
        params.sessionId,
        params.patch.accessMode,
      ),
    );
  }
  if (params.fallbackProviderPreference) {
    tasks.push(
      params.runtime.setSessionProviderSelection(
        params.sessionId,
        params.fallbackProviderPreference.providerType,
        params.fallbackProviderPreference.model,
      ),
    );
  }
  if (params.fallbackExecutionStrategy) {
    tasks.push(
      params.runtime.setSessionExecutionStrategy(
        params.sessionId,
        params.fallbackExecutionStrategy,
      ),
    );
  }

  await Promise.all(tasks);
}
