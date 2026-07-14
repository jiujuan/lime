import type { Message } from "../types";
import type { AgentExecutionStrategy } from "@/lib/api/agentExecutionRuntime";
import type {
  AgentPreferenceKeys,
  AgentPreferences,
  SessionModelPreference,
} from "./agentChatShared";
import { normalizeChatSessionModelPreference } from "../utils/sessionExecutionRuntime";
import {
  hasLegacyFallbackToolNames,
  normalizeHistoryMessages,
} from "./agentChatHistory";
import { normalizeExecutionStrategy } from "./agentChatCoreUtils";

export const DEFAULT_AGENT_PROVIDER = "";
export const DEFAULT_AGENT_MODEL = "";
export type AgentAccessMode = "read-only" | "current" | "full-access";
export const DEFAULT_AGENT_ACCESS_MODE: AgentAccessMode = "full-access";
export const DEFAULT_WORKSPACE_AGENT_EXECUTION_STRATEGY: AgentExecutionStrategy =
  "react";
export const DEFAULT_GLOBAL_AGENT_EXECUTION_STRATEGY: AgentExecutionStrategy =
  "react";
export const GLOBAL_PROVIDER_PREF_KEY = "agent_pref_provider_global";
export const GLOBAL_MODEL_PREF_KEY = "agent_pref_model_global";
export const GLOBAL_MIGRATED_PREF_KEY = "agent_pref_migrated_global";

const MAX_AGENT_STATE_RESTORE_BYTES = 1_500_000;

export const loadPersisted = <T>(key: string, defaultValue: T): T => {
  try {
    const stored = localStorage.getItem(key);
    if (stored) {
      if (
        isOversizedAgentRestoreState(key, stored) &&
        typeof localStorage.removeItem === "function"
      ) {
        localStorage.removeItem(key);
        return defaultValue;
      }

      return JSON.parse(stored);
    }
  } catch (e) {
    console.error(e);
  }
  return defaultValue;
};

function isStorageQuotaError(error: unknown): boolean {
  if (!(error instanceof DOMException)) {
    return false;
  }
  return (
    error.name === "QuotaExceededError" ||
    error.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
    error.code === 22 ||
    error.code === 1014
  );
}

export const savePersisted = (key: string, value: unknown) => {
  const serialized = JSON.stringify(value);
  try {
    localStorage.setItem(key, serialized);
  } catch (e) {
    if (isStorageQuotaError(e)) {
      try {
        localStorage.removeItem(key);
        localStorage.setItem(key, serialized);
      } catch {
        // 存储配额不足不应在用户主路径暴露为控制台错误。
      }
      return;
    }
    console.error(e);
  }
};

export const loadTransient = <T>(key: string, defaultValue: T): T => {
  try {
    const stored = sessionStorage.getItem(key);
    if (stored) {
      if (
        isOversizedAgentRestoreState(key, stored) &&
        typeof sessionStorage.removeItem === "function"
      ) {
        sessionStorage.removeItem(key);
        return defaultValue;
      }

      const parsed = JSON.parse(stored);
      if (key.startsWith("agent_messages") && Array.isArray(parsed)) {
        const normalizedMessages = parsed.map((msg: any) => ({
          ...msg,
          timestamp: new Date(msg.timestamp),
        })) as Message[];
        const normalized = normalizeHistoryMessages(normalizedMessages);
        if (hasLegacyFallbackToolNames(normalized)) {
          return [] as unknown as T;
        }
        return normalized as unknown as T;
      }
      return parsed;
    }
  } catch (e) {
    console.error(e);
  }
  return defaultValue;
};

function isOversizedAgentRestoreState(key: string, stored: string): boolean {
  if (stored.length <= MAX_AGENT_STATE_RESTORE_BYTES) {
    return false;
  }

  return (
    key.startsWith("agent_messages_") ||
    key.startsWith("agent_thread_turns_") ||
    key.startsWith("agent_thread_items_") ||
    key.startsWith("agent_session_snapshots_") ||
    key.startsWith("agent_session_snapshots_persisted_")
  );
}

export const saveTransient = (key: string, value: unknown) => {
  const serialized = JSON.stringify(value);
  try {
    sessionStorage.setItem(key, serialized);
  } catch (e) {
    if (isStorageQuotaError(e)) {
      try {
        sessionStorage.removeItem(key);
        sessionStorage.setItem(key, serialized);
      } catch {
        // 存储配额不足不应在用户主路径暴露为控制台错误。
      }
      return;
    }
    console.error(e);
  }
};

export const loadPersistedString = (key: string): string | null => {
  try {
    const stored = localStorage.getItem(key);
    if (stored === null) {
      return null;
    }

    try {
      const parsed = JSON.parse(stored);
      return typeof parsed === "string" ? parsed : stored;
    } catch {
      return stored;
    }
  } catch (e) {
    console.error(e);
    return null;
  }
};

export const getAgentPreferenceKeys = (
  workspaceId?: string | null,
): AgentPreferenceKeys => {
  const resolvedWorkspaceId = workspaceId?.trim();
  if (!resolvedWorkspaceId) {
    return {
      providerKey: GLOBAL_PROVIDER_PREF_KEY,
      modelKey: GLOBAL_MODEL_PREF_KEY,
      migratedKey: GLOBAL_MIGRATED_PREF_KEY,
    };
  }

  return {
    providerKey: `agent_pref_provider_${resolvedWorkspaceId}`,
    modelKey: `agent_pref_model_${resolvedWorkspaceId}`,
    migratedKey: `agent_pref_migrated_${resolvedWorkspaceId}`,
  };
};

export const getSessionModelPreferenceKey = (
  workspaceId: string | null | undefined,
  sessionId: string,
): string => {
  const resolvedWorkspaceId = workspaceId?.trim();
  if (!resolvedWorkspaceId) {
    return `agent_topic_model_pref_global_${sessionId}`;
  }
  return `agent_topic_model_pref_${resolvedWorkspaceId}_${sessionId}`;
};

export const getExecutionStrategyStorageKey = (
  workspaceId?: string | null,
): string | null => {
  const resolvedWorkspaceId = workspaceId?.trim();
  if (!resolvedWorkspaceId) {
    return null;
  }

  return `agent_execution_strategy_${resolvedWorkspaceId}`;
};

export const getSessionAccessModeKey = (
  workspaceId: string | null | undefined,
  sessionId: string,
): string => {
  const resolvedWorkspaceId = workspaceId?.trim();
  if (!resolvedWorkspaceId) {
    return `agent_session_access_mode_global_${sessionId}`;
  }
  return `agent_session_access_mode_${resolvedWorkspaceId}_${sessionId}`;
};

export const getAccessModeStorageKey = (
  workspaceId?: string | null,
): string | null => {
  const resolvedWorkspaceId = workspaceId?.trim();
  if (!resolvedWorkspaceId) {
    return null;
  }

  return `agent_access_mode_${resolvedWorkspaceId}`;
};

export const normalizeAccessMode = (value: unknown): AgentAccessMode => {
  if (value === "read-only" || value === "current" || value === "full-access") {
    return value;
  }
  return DEFAULT_AGENT_ACCESS_MODE;
};

export const resolvePersistedAccessMode = (
  workspaceId?: string | null,
): AgentAccessMode => {
  const storageKey = getAccessModeStorageKey(workspaceId);
  if (!storageKey) {
    return DEFAULT_AGENT_ACCESS_MODE;
  }

  return normalizeAccessMode(
    loadPersisted<string | null>(storageKey, DEFAULT_AGENT_ACCESS_MODE),
  );
};

export const loadSessionAccessMode = (
  workspaceId: string | null | undefined,
  sessionId: string,
): AgentAccessMode | null => {
  const key = getSessionAccessModeKey(workspaceId, sessionId);
  const parsed = loadPersisted<string | null>(key, null);
  if (parsed === null) {
    return null;
  }
  return normalizeAccessMode(parsed);
};

export const resolvePersistedExecutionStrategy = (
  workspaceId?: string | null,
): AgentExecutionStrategy => {
  const storageKey = getExecutionStrategyStorageKey(workspaceId);
  if (!storageKey) {
    return DEFAULT_GLOBAL_AGENT_EXECUTION_STRATEGY;
  }

  return normalizeExecutionStrategy(
    loadPersisted<string | null>(
      storageKey,
      DEFAULT_WORKSPACE_AGENT_EXECUTION_STRATEGY,
    ),
  );
};

export const loadSessionModelPreference = (
  workspaceId: string | null | undefined,
  sessionId: string,
): SessionModelPreference | null => {
  const key = getSessionModelPreferenceKey(workspaceId, sessionId);
  const parsed = loadPersisted<SessionModelPreference | null>(key, null);
  if (!parsed) {
    return null;
  }
  if (
    typeof parsed.providerType !== "string" ||
    typeof parsed.model !== "string"
  ) {
    return null;
  }
  const normalized = normalizeChatSessionModelPreference(parsed);
  if (!normalized) {
    savePersisted(key, null);
    return null;
  }
  return normalized;
};

export const resolveWorkspaceAgentPreferences = (
  workspaceId?: string | null,
): AgentPreferences => {
  const { providerKey, modelKey, migratedKey } =
    getAgentPreferenceKeys(workspaceId);

  const scopedProvider = loadPersistedString(providerKey)?.trim() || null;
  const scopedModel = loadPersistedString(modelKey)?.trim() || null;
  const hasScopedPreference = Boolean(scopedProvider || scopedModel);
  if (hasScopedPreference) {
    const scopedPreference = normalizeChatSessionModelPreference({
      providerType: scopedProvider ?? DEFAULT_AGENT_PROVIDER,
      model: scopedModel ?? DEFAULT_AGENT_MODEL,
    });
    if (scopedPreference) {
      return scopedPreference;
    }

    savePersisted(providerKey, DEFAULT_AGENT_PROVIDER);
    savePersisted(modelKey, DEFAULT_AGENT_MODEL);
    return {
      providerType: DEFAULT_AGENT_PROVIDER,
      model: DEFAULT_AGENT_MODEL,
    };
  }

  const migrated = loadPersisted<boolean>(migratedKey, false);
  if (!migrated) {
    const legacyProvider =
      loadPersistedString("agent_pref_provider")?.trim() ||
      loadPersistedString(GLOBAL_PROVIDER_PREF_KEY)?.trim();
    const legacyModel =
      loadPersistedString("agent_pref_model")?.trim() ||
      loadPersistedString(GLOBAL_MODEL_PREF_KEY)?.trim();
    const legacyPreference = normalizeChatSessionModelPreference({
      providerType: legacyProvider || DEFAULT_AGENT_PROVIDER,
      model: legacyModel || DEFAULT_AGENT_MODEL,
    });

    if (legacyPreference) {
      savePersisted(providerKey, legacyPreference.providerType);
      savePersisted(modelKey, legacyPreference.model);
      savePersisted(migratedKey, true);

      return legacyPreference;
    }

    savePersisted(providerKey, DEFAULT_AGENT_PROVIDER);
    savePersisted(modelKey, DEFAULT_AGENT_MODEL);
    savePersisted(migratedKey, true);
    return {
      providerType: DEFAULT_AGENT_PROVIDER,
      model: DEFAULT_AGENT_MODEL,
    };
  }

  return {
    providerType: DEFAULT_AGENT_PROVIDER,
    model: DEFAULT_AGENT_MODEL,
  };
};
