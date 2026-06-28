import { normalizeLegacyThreadItems } from "@/lib/api/agentTextNormalization";
import type { AgentThreadItem, AgentThreadTurn, Message } from "../types";
import { filterConversationThreadItems } from "../utils/threadTimelineView";
import {
  compactHistoricalRestoreMessages,
  mergeHydratedMessagesWithLocalState,
  normalizeHistoryMessages,
} from "./agentChatHistory";
import {
  isRetainedSkillProcessMessage,
  SKILL_INLINE_PROCESS_RETENTION,
} from "../utils/skillInlineProcessRetention";
import {
  loadPersisted,
  loadTransient,
  savePersisted,
  saveTransient,
} from "./agentChatStorage";
import { getScopedStorageKey } from "./agentChatShared";

export interface AgentSessionScopedKeys {
  currentSessionKey: string;
  messagesKey: string;
  persistedSessionKey: string;
  sessionSnapshotsKey: string;
  turnsKey: string;
  itemsKey: string;
  currentTurnKey: string;
}

export interface AgentSessionCachedSnapshot {
  messages: Message[];
  threadTurns: AgentThreadTurn[];
  threadItems: AgentThreadItem[];
  currentTurnId: string | null;
  cacheMetadata?: AgentSessionCachedSnapshotMetadata;
}

export interface AgentSessionCachedSnapshotMetadata {
  storageKind: "transient" | "persisted";
  freshness: "fresh" | "stale";
  updatedAt: number;
  lastAccessedAt: number;
  expiresAt: number;
  staleUntil: number;
  sessionUpdatedAt: number | null;
  messagesCount: number | null;
  historyTruncated: boolean;
}

export interface AgentSessionCachedSnapshotMetadataSummary {
  updatedAt: number;
  expiresAt: number;
  staleUntil: number;
  sessionUpdatedAt: number | null;
  messagesCount: number | null;
  historyTruncated: boolean;
}

export interface AgentSessionCachedSnapshotAvailability {
  hasSnapshot: boolean;
  hasIndex: boolean;
  transient?: AgentSessionCachedSnapshotMetadataSummary;
  persisted?: AgentSessionCachedSnapshotMetadataSummary;
}

interface AgentSessionCachedSnapshotRecord extends Omit<
  AgentSessionCachedSnapshot,
  "cacheMetadata"
> {
  updatedAt: number;
  lastAccessedAt: number;
  expiresAt: number;
  staleUntil: number;
  sessionUpdatedAt: number | null;
  messagesCount: number | null;
  historyTruncated: boolean;
}

const MAX_CACHED_SESSION_SNAPSHOTS = 12;
const MAX_PERSISTED_CACHED_SESSION_SNAPSHOTS = 8;
const MAX_CACHED_SESSION_MESSAGES = 32;
const MAX_CACHED_SESSION_TURNS = 24;
const MAX_CACHED_SESSION_ITEMS = 96;
const MAX_PERSISTED_CACHED_SESSION_MESSAGES = 12;
const MAX_PERSISTED_CACHED_SESSION_TURNS = 8;
const MAX_PERSISTED_CACHED_SESSION_ITEMS = 32;
const TRANSIENT_SNAPSHOT_TTL_MS = 10 * 60 * 1000;
const PERSISTED_SNAPSHOT_TTL_MS = 12 * 60 * 60 * 1000;
const SNAPSHOT_STALE_GRACE_MS = 2 * 60 * 1000;
const PERSISTED_SNAPSHOT_STALE_GRACE_MS = 7 * 24 * 60 * 60 * 1000;
const SNAPSHOT_INDEX_STORAGE_SUFFIX = "aster_session_snapshots_index";

interface AgentSessionCachedSnapshotTrimLimits {
  maxMessages: number;
  maxTurns: number;
  maxItems: number;
}

interface AgentSessionCachedSnapshotPolicy {
  limits: AgentSessionCachedSnapshotTrimLimits;
  maxEntries: number;
  ttlMs: number;
  staleGraceMs: number;
}

interface LoadAgentSessionCachedSnapshotOptions {
  nowMs?: number;
  topicUpdatedAt?: number | Date | string | null;
  messagesCount?: number | null;
}

interface SaveAgentSessionCachedSnapshotOptions {
  nowMs?: number;
  sessionUpdatedAt?: number | Date | string | null;
  messagesCount?: number | null;
  historyTruncated?: boolean | null;
}

const TRANSIENT_SNAPSHOT_LIMITS: AgentSessionCachedSnapshotTrimLimits = {
  maxMessages: MAX_CACHED_SESSION_MESSAGES,
  maxTurns: MAX_CACHED_SESSION_TURNS,
  maxItems: MAX_CACHED_SESSION_ITEMS,
};

const PERSISTED_SNAPSHOT_LIMITS: AgentSessionCachedSnapshotTrimLimits = {
  maxMessages: MAX_PERSISTED_CACHED_SESSION_MESSAGES,
  maxTurns: MAX_PERSISTED_CACHED_SESSION_TURNS,
  maxItems: MAX_PERSISTED_CACHED_SESSION_ITEMS,
};

const TRANSIENT_SNAPSHOT_POLICY: AgentSessionCachedSnapshotPolicy = {
  limits: TRANSIENT_SNAPSHOT_LIMITS,
  maxEntries: MAX_CACHED_SESSION_SNAPSHOTS,
  ttlMs: TRANSIENT_SNAPSHOT_TTL_MS,
  staleGraceMs: SNAPSHOT_STALE_GRACE_MS,
};

const PERSISTED_SNAPSHOT_POLICY: AgentSessionCachedSnapshotPolicy = {
  limits: PERSISTED_SNAPSHOT_LIMITS,
  maxEntries: MAX_PERSISTED_CACHED_SESSION_SNAPSHOTS,
  ttlMs: PERSISTED_SNAPSHOT_TTL_MS,
  staleGraceMs: PERSISTED_SNAPSHOT_STALE_GRACE_MS,
};

function trimCachedSnapshot(
  snapshot: AgentSessionCachedSnapshot,
  limits: AgentSessionCachedSnapshotTrimLimits = TRANSIENT_SNAPSHOT_LIMITS,
): AgentSessionCachedSnapshot {
  const shouldCompactMessages =
    !(snapshot.threadTurns || []).some((turn) => turn.status === "running") &&
    !(snapshot.threadItems || []).some((item) => item.status === "in_progress");
  const rawMessages = markLegacyCommandSkillProcessMessages(
    snapshot.messages.slice(-limits.maxMessages),
  );
  const messages = shouldCompactMessages
    ? compactHistoricalRestoreMessages(rawMessages)
    : normalizeHistoryMessages(rawMessages);
  const threadTurns = snapshot.threadTurns.slice(-limits.maxTurns);
  const retainedTurnIds = new Set(
    threadTurns
      .map((turn) => (typeof turn.id === "string" ? turn.id.trim() : ""))
      .filter(Boolean),
  );
  const scopedThreadItems: AgentThreadItem[] = [];
  for (
    let index = snapshot.threadItems.length - 1;
    index >= 0 && scopedThreadItems.length < limits.maxItems;
    index -= 1
  ) {
    const item = snapshot.threadItems[index];
    if (!item) {
      continue;
    }

    const turnId = typeof item.turn_id === "string" ? item.turn_id.trim() : "";
    if (!turnId || retainedTurnIds.has(turnId)) {
      scopedThreadItems.push(item);
    }
  }
  scopedThreadItems.reverse();
  const threadItems = filterConversationThreadItems(
    normalizeLegacyThreadItems(scopedThreadItems),
  );
  const currentTurnId =
    typeof snapshot.currentTurnId === "string" &&
    retainedTurnIds.has(snapshot.currentTurnId)
      ? snapshot.currentTurnId
      : null;

  return {
    messages,
    threadTurns,
    threadItems,
    currentTurnId,
  };
}

function normalizeCachedMessages(value: unknown, limit: number): Message[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const normalized = value
    .slice(-limit)
    .map((message) => {
      if (!message || typeof message !== "object") {
        return null;
      }

      const record = message as Record<string, unknown>;
      const timestamp = record.timestamp;
      const normalizedTimestamp =
        typeof timestamp === "string" || typeof timestamp === "number"
          ? new Date(timestamp)
          : timestamp instanceof Date
            ? timestamp
            : null;

      if (!normalizedTimestamp) {
        return null;
      }

      return {
        ...record,
        timestamp: normalizedTimestamp,
      } as Message;
    })
    .filter((message): message is Message => message !== null);

  return normalizeHistoryMessages(
    markLegacyCommandSkillProcessMessages(normalized),
  );
}

function isCommandStyleUserMessage(message: Message): boolean {
  if (message.role !== "user") {
    return false;
  }

  const route = message.inputCapabilityRoute;
  if (
    route?.kind === "installed_skill" ||
    route?.kind === "builtin_command" ||
    route?.kind === "runtime_scene"
  ) {
    return true;
  }

  const trimmed = message.content.trim();
  return /^[@/][^\s/]/u.test(trimmed);
}

function hasLocalThinkingSnapshot(message: Message): boolean {
  return Boolean(
    message.thinkingContent?.trim() ||
      message.contentParts?.some(
        (part) => part.type === "thinking" && part.text.trim().length > 0,
      ),
  );
}

function markLegacyCommandSkillProcessMessages(messages: Message[]): Message[] {
  let pendingCommandUser = false;

  return messages.map((message) => {
    if (message.role === "user") {
      pendingCommandUser = isCommandStyleUserMessage(message);
      return message;
    }

    if (message.role !== "assistant") {
      return message;
    }

    const shouldMarkAsSkillProcess =
      pendingCommandUser &&
      hasLocalThinkingSnapshot(message) &&
      !isRetainedSkillProcessMessage(message);

    pendingCommandUser = false;
    return shouldMarkAsSkillProcess
      ? {
          ...message,
          inlineProcessRetention: SKILL_INLINE_PROCESS_RETENTION,
        }
      : message;
  });
}

function normalizeCachedThreadTurns(
  value: unknown,
  limit: number,
): AgentThreadTurn[] {
  return Array.isArray(value)
    ? (value.slice(-limit).filter(Boolean) as AgentThreadTurn[])
    : [];
}

function normalizeCachedThreadItems(value: unknown): AgentThreadItem[] {
  return Array.isArray(value) ? (value as AgentThreadItem[]) : [];
}

function readFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeOptionalTimeMs(
  value: number | Date | string | null | undefined,
): number | null {
  if (value instanceof Date) {
    const timestamp = value.getTime();
    return Number.isFinite(timestamp) ? timestamp : null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 0 && value < 10_000_000_000 ? value * 1000 : value;
  }

  if (typeof value === "string" && value.trim()) {
    const numericValue = Number(value);
    if (Number.isFinite(numericValue)) {
      return numericValue > 0 && numericValue < 10_000_000_000
        ? numericValue * 1000
        : numericValue;
    }

    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) ? timestamp : null;
  }

  return null;
}

function normalizeOptionalCount(value: unknown): number | null {
  const count = readFiniteNumber(value);
  return count !== null && count >= 0 ? Math.trunc(count) : null;
}

function getSnapshotIndexKey(workspaceId: string): string {
  return getScopedStorageKey(workspaceId, SNAPSHOT_INDEX_STORAGE_SUFFIX);
}

function loadSnapshotIndex(workspaceId: string): {
  hasIndex: boolean;
  index: Record<string, {
    transient?: AgentSessionCachedSnapshotMetadataSummary;
    persisted?: AgentSessionCachedSnapshotMetadataSummary;
  }>;
} {
  const indexKey = getSnapshotIndexKey(workspaceId);

  try {
    const stored = localStorage.getItem(indexKey);
    if (stored === null) {
      return {
        hasIndex: false,
        index: {},
      };
    }

    return {
      hasIndex: true,
      index: normalizeSnapshotIndex(JSON.parse(stored)),
    };
  } catch (error) {
    console.error(error);
    return {
      hasIndex: false,
      index: {},
    };
  }
}

function normalizeSnapshotMetadataSummary(
  value: unknown,
): AgentSessionCachedSnapshotMetadataSummary | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const updatedAt = readFiniteNumber(record.updatedAt);
  const expiresAt = readFiniteNumber(record.expiresAt);
  const staleUntil = readFiniteNumber(record.staleUntil);
  if (updatedAt === null || expiresAt === null || staleUntil === null) {
    return null;
  }

  return {
    updatedAt,
    expiresAt,
    staleUntil,
    sessionUpdatedAt: normalizeOptionalTimeMs(
      record.sessionUpdatedAt as number | string | null,
    ),
    messagesCount: normalizeOptionalCount(record.messagesCount),
    historyTruncated: record.historyTruncated === true,
  };
}

function normalizeSnapshotIndex(
  value: unknown,
): Record<string, {
  transient?: AgentSessionCachedSnapshotMetadataSummary;
  persisted?: AgentSessionCachedSnapshotMetadataSummary;
}> {
  if (!value || typeof value !== "object") {
    return {};
  }

  const index: Record<string, {
    transient?: AgentSessionCachedSnapshotMetadataSummary;
    persisted?: AgentSessionCachedSnapshotMetadataSummary;
  }> = {};

  Object.entries(value as Record<string, unknown>).forEach(
    ([sessionId, rawEntry]) => {
      if (!rawEntry || typeof rawEntry !== "object") {
        return;
      }

      const entry = rawEntry as Record<string, unknown>;
      const transient = normalizeSnapshotMetadataSummary(entry.transient);
      const persisted = normalizeSnapshotMetadataSummary(entry.persisted);
      if (!transient && !persisted) {
        return;
      }

      index[sessionId] = {
        ...(transient ? { transient } : {}),
        ...(persisted ? { persisted } : {}),
      };
    },
  );

  return index;
}

function buildSnapshotMetadataSummary(
  record: AgentSessionCachedSnapshotRecord,
): AgentSessionCachedSnapshotMetadataSummary {
  return {
    updatedAt: record.updatedAt,
    expiresAt: record.expiresAt,
    staleUntil: record.staleUntil,
    sessionUpdatedAt: record.sessionUpdatedAt,
    messagesCount: record.messagesCount,
    historyTruncated: record.historyTruncated,
  };
}

function saveSnapshotIndex(
  workspaceId: string,
  index: Record<string, {
    transient?: AgentSessionCachedSnapshotMetadataSummary;
    persisted?: AgentSessionCachedSnapshotMetadataSummary;
  }>,
): void {
  savePersisted(getSnapshotIndexKey(workspaceId), index);
}

function updateSnapshotIndex(params: {
  workspaceId: string;
  transientEntries: [string, AgentSessionCachedSnapshotRecord][];
  persistedEntries: [string, AgentSessionCachedSnapshotRecord][];
}): void {
  const nextIndex: Record<string, {
    transient?: AgentSessionCachedSnapshotMetadataSummary;
    persisted?: AgentSessionCachedSnapshotMetadataSummary;
  }> = {};

  params.transientEntries.forEach(([sessionId, record]) => {
    nextIndex[sessionId] = {
      ...(nextIndex[sessionId] ?? {}),
      transient: buildSnapshotMetadataSummary(record),
    };
  });
  params.persistedEntries.forEach(([sessionId, record]) => {
    nextIndex[sessionId] = {
      ...(nextIndex[sessionId] ?? {}),
      persisted: buildSnapshotMetadataSummary(record),
    };
  });

  saveSnapshotIndex(params.workspaceId, nextIndex);
}

function removeSnapshotIndexEntry(
  workspaceId: string,
  sessionId: string,
  storageKind?: AgentSessionCachedSnapshotMetadata["storageKind"],
): void {
  const { index } = loadSnapshotIndex(workspaceId);
  const currentEntry = index[sessionId];
  if (!currentEntry) {
    return;
  }

  if (!storageKind) {
    delete index[sessionId];
  } else {
    const nextEntry = { ...currentEntry };
    delete nextEntry[storageKind];
    if (nextEntry.transient || nextEntry.persisted) {
      index[sessionId] = nextEntry;
    } else {
      delete index[sessionId];
    }
  }

  saveSnapshotIndex(workspaceId, index);
}

function normalizeCachedSnapshotRecord(
  value: unknown,
  policy: AgentSessionCachedSnapshotPolicy,
  nowMs: number,
  options?: LoadAgentSessionCachedSnapshotOptions,
): AgentSessionCachedSnapshotRecord | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const updatedAt = readFiniteNumber(record.updatedAt) ?? nowMs;
  const lastAccessedAt = readFiniteNumber(record.lastAccessedAt) ?? updatedAt;
  const expiresAt =
    readFiniteNumber(record.expiresAt) ?? updatedAt + policy.ttlMs;
  const staleUntil =
    readFiniteNumber(record.staleUntil) ?? expiresAt + policy.staleGraceMs;
  const sessionUpdatedAt = normalizeOptionalTimeMs(
    record.sessionUpdatedAt as number | string | null,
  );
  const messagesCount = normalizeOptionalCount(record.messagesCount);
  const snapshot = trimCachedSnapshot(
    {
      messages: normalizeCachedMessages(
        record.messages,
        policy.limits.maxMessages,
      ),
      threadTurns: normalizeCachedThreadTurns(
        record.threadTurns,
        policy.limits.maxTurns,
      ),
      threadItems: normalizeCachedThreadItems(record.threadItems),
      currentTurnId:
        typeof record.currentTurnId === "string" ? record.currentTurnId : null,
    },
    policy.limits,
  );
  const topicUpdatedAt = normalizeOptionalTimeMs(options?.topicUpdatedAt);
  const topicMessagesCount = normalizeOptionalCount(options?.messagesCount);
  const isBehindTopic =
    (topicUpdatedAt !== null &&
      (sessionUpdatedAt === null || topicUpdatedAt > sessionUpdatedAt)) ||
    (topicMessagesCount !== null &&
      messagesCount !== null &&
      topicMessagesCount > messagesCount);
  const staleExpiresAt = isBehindTopic ? Math.min(expiresAt, nowMs) : expiresAt;
  const staleGraceUntil = isBehindTopic
    ? Math.max(staleUntil, nowMs + policy.staleGraceMs)
    : staleUntil;

  if (nowMs > staleGraceUntil) {
    return null;
  }

  return {
    ...snapshot,
    updatedAt,
    lastAccessedAt,
    expiresAt: staleExpiresAt,
    staleUntil: staleGraceUntil,
    sessionUpdatedAt,
    messagesCount,
    historyTruncated: record.historyTruncated === true,
  };
}

function hasRetainedSkillProcessMessage(messages: Message[]): boolean {
  return messages.some(
    (message) =>
      isRetainedSkillProcessMessage(message) &&
      (Boolean(message.thinkingContent?.trim()) ||
        Boolean(
          message.contentParts?.some(
            (part) =>
              part.type === "thinking" && part.text.trim().length > 0,
          ),
        )),
  );
}

function mergeIncomingSnapshotWithCachedSkillProcess(params: {
  incoming: AgentSessionCachedSnapshot;
  cachedRecord: AgentSessionCachedSnapshotRecord | null;
}): AgentSessionCachedSnapshot {
  if (!hasRetainedSkillProcessMessage(params.cachedRecord?.messages || [])) {
    return params.incoming;
  }

  return {
    ...params.incoming,
    messages: mergeHydratedMessagesWithLocalState(
      params.cachedRecord?.messages || [],
      params.incoming.messages,
    ),
  };
}

function toCachedSnapshot(
  record: AgentSessionCachedSnapshotRecord,
  storageKind: AgentSessionCachedSnapshotMetadata["storageKind"],
  nowMs: number,
): AgentSessionCachedSnapshot {
  return {
    messages: record.messages,
    threadTurns: record.threadTurns,
    threadItems: record.threadItems,
    currentTurnId: record.currentTurnId,
    cacheMetadata: {
      storageKind,
      freshness: nowMs < record.expiresAt ? "fresh" : "stale",
      updatedAt: record.updatedAt,
      lastAccessedAt: record.lastAccessedAt,
      expiresAt: record.expiresAt,
      staleUntil: record.staleUntil,
      sessionUpdatedAt: record.sessionUpdatedAt,
      messagesCount: record.messagesCount,
      historyTruncated: record.historyTruncated,
    },
  };
}

function pruneSnapshotEntries(
  snapshotMap: Record<string, unknown>,
  policy: AgentSessionCachedSnapshotPolicy,
  nowMs: number,
  options?: LoadAgentSessionCachedSnapshotOptions,
) {
  return Object.entries(snapshotMap)
    .map(
      ([id, value]) =>
        [
          id,
          normalizeCachedSnapshotRecord(value, policy, nowMs, options),
        ] as const,
    )
    .filter(
      (entry): entry is [string, AgentSessionCachedSnapshotRecord] =>
        entry[1] !== null,
    )
    .sort((left, right) => right[1].lastAccessedAt - left[1].lastAccessedAt)
    .slice(0, policy.maxEntries);
}

function hasSnapshotRecord(
  snapshotMap: Record<string, unknown>,
  sessionId: string,
): boolean {
  return Object.prototype.hasOwnProperty.call(snapshotMap, sessionId);
}

function removeCachedSnapshotRecord(
  workspaceId: string,
  cacheKey: string,
  snapshotMap: Record<string, unknown>,
  sessionId: string,
  storageKind: AgentSessionCachedSnapshotMetadata["storageKind"],
) {
  if (!hasSnapshotRecord(snapshotMap, sessionId)) {
    return;
  }

  const nextMap = { ...snapshotMap };
  delete nextMap[sessionId];

  if (storageKind === "transient") {
    saveTransient(cacheKey, nextMap);
  } else {
    savePersisted(cacheKey, nextMap);
  }

  removeSnapshotIndexEntry(workspaceId, sessionId, storageKind);
}

export function getAgentSessionCachedSnapshotAvailability(
  workspaceId: string,
  sessionId: string,
): AgentSessionCachedSnapshotAvailability {
  const { hasIndex, index } = loadSnapshotIndex(workspaceId);
  const indexedEntry = index[sessionId];
  if (indexedEntry) {
    return {
      hasSnapshot: Boolean(indexedEntry.transient || indexedEntry.persisted),
      hasIndex: true,
      ...indexedEntry,
    };
  }

  return {
    hasSnapshot: !hasIndex,
    hasIndex,
  };
}

export function loadAgentSessionCachedSnapshot(
  workspaceId: string,
  sessionId: string,
  options: LoadAgentSessionCachedSnapshotOptions = {},
): AgentSessionCachedSnapshot | null {
  const nowMs = options.nowMs ?? Date.now();
  const cacheKey = getScopedStorageKey(workspaceId, "aster_session_snapshots");
  const snapshotMap = loadTransient<Record<string, unknown>>(cacheKey, {});
  const transientSnapshot = normalizeCachedSnapshotRecord(
    snapshotMap[sessionId],
    TRANSIENT_SNAPSHOT_POLICY,
    nowMs,
    options,
  );

  if (transientSnapshot) {
    return toCachedSnapshot(transientSnapshot, "transient", nowMs);
  }

  removeCachedSnapshotRecord(
    workspaceId,
    cacheKey,
    snapshotMap,
    sessionId,
    "transient",
  );

  const persistedCacheKey = getScopedStorageKey(
    workspaceId,
    "aster_session_snapshots_persisted",
  );
  const persistedSnapshotMap = loadPersisted<Record<string, unknown>>(
    persistedCacheKey,
    {},
  );
  const persistedSnapshot = normalizeCachedSnapshotRecord(
    persistedSnapshotMap[sessionId],
    PERSISTED_SNAPSHOT_POLICY,
    nowMs,
    options,
  );

  if (persistedSnapshot) {
    return toCachedSnapshot(persistedSnapshot, "persisted", nowMs);
  }

  removeCachedSnapshotRecord(
    workspaceId,
    persistedCacheKey,
    persistedSnapshotMap,
    sessionId,
    "persisted",
  );
  removeSnapshotIndexEntry(workspaceId, sessionId);

  return null;
}

export function clearAgentSessionCachedSnapshot(
  workspaceId: string,
  sessionId: string,
): void {
  const cacheKey = getScopedStorageKey(workspaceId, "aster_session_snapshots");
  removeCachedSnapshotRecord(
    workspaceId,
    cacheKey,
    loadTransient<Record<string, unknown>>(cacheKey, {}),
    sessionId,
    "transient",
  );

  const persistedCacheKey = getScopedStorageKey(
    workspaceId,
    "aster_session_snapshots_persisted",
  );
  removeCachedSnapshotRecord(
    workspaceId,
    persistedCacheKey,
    loadPersisted<Record<string, unknown>>(persistedCacheKey, {}),
    sessionId,
    "persisted",
  );
  removeSnapshotIndexEntry(workspaceId, sessionId);
}

export function saveAgentSessionCachedSnapshot(
  workspaceId: string,
  sessionId: string,
  snapshot: AgentSessionCachedSnapshot,
  options: SaveAgentSessionCachedSnapshotOptions = {},
): void {
  const nowMs = options.nowMs ?? Date.now();
  const cacheKey = getScopedStorageKey(workspaceId, "aster_session_snapshots");
  const persistedCacheKey = getScopedStorageKey(
    workspaceId,
    "aster_session_snapshots_persisted",
  );
  const currentMap = loadTransient<Record<string, unknown>>(cacheKey, {});
  const persistedMap = loadPersisted<Record<string, unknown>>(
    persistedCacheKey,
    {},
  );
  const cachedRecord =
    normalizeCachedSnapshotRecord(
      currentMap[sessionId],
      TRANSIENT_SNAPSHOT_POLICY,
      nowMs,
    ) ??
    normalizeCachedSnapshotRecord(
      persistedMap[sessionId],
      PERSISTED_SNAPSHOT_POLICY,
      nowMs,
    );
  const snapshotWithRetainedSkillProcess =
    mergeIncomingSnapshotWithCachedSkillProcess({
      incoming: snapshot,
      cachedRecord,
    });
  const trimmedSnapshot = trimCachedSnapshot(
    snapshotWithRetainedSkillProcess,
    TRANSIENT_SNAPSHOT_LIMITS,
  );
  const persistedSnapshot = trimCachedSnapshot(
    snapshotWithRetainedSkillProcess,
    PERSISTED_SNAPSHOT_LIMITS,
  );
  const sessionUpdatedAt =
    normalizeOptionalTimeMs(options.sessionUpdatedAt) ??
    snapshot.cacheMetadata?.sessionUpdatedAt ??
    nowMs;
  const messagesCount =
    normalizeOptionalCount(options.messagesCount) ??
    snapshot.cacheMetadata?.messagesCount ??
    snapshot.messages.length;
  const historyTruncated =
    options.historyTruncated ??
    snapshot.cacheMetadata?.historyTruncated ??
    messagesCount > snapshot.messages.length;
  const nextTransientMap = {
    ...currentMap,
    [sessionId]: {
      ...trimmedSnapshot,
      updatedAt: nowMs,
      lastAccessedAt: nowMs,
      expiresAt: nowMs + TRANSIENT_SNAPSHOT_POLICY.ttlMs,
      staleUntil:
        nowMs +
        TRANSIENT_SNAPSHOT_POLICY.ttlMs +
        TRANSIENT_SNAPSHOT_POLICY.staleGraceMs,
      sessionUpdatedAt,
      messagesCount,
      historyTruncated,
    } satisfies AgentSessionCachedSnapshotRecord,
  };
  const nextPersistedMap = {
    ...persistedMap,
    [sessionId]: {
      ...persistedSnapshot,
      updatedAt: nowMs,
      lastAccessedAt: nowMs,
      expiresAt: nowMs + PERSISTED_SNAPSHOT_POLICY.ttlMs,
      staleUntil:
        nowMs +
        PERSISTED_SNAPSHOT_POLICY.ttlMs +
        PERSISTED_SNAPSHOT_POLICY.staleGraceMs,
      sessionUpdatedAt,
      messagesCount,
      historyTruncated,
    } satisfies AgentSessionCachedSnapshotRecord,
  };

  const prunedTransientEntries = pruneSnapshotEntries(
    nextTransientMap,
    TRANSIENT_SNAPSHOT_POLICY,
    nowMs,
  );
  const prunedPersistedEntries = pruneSnapshotEntries(
    nextPersistedMap,
    PERSISTED_SNAPSHOT_POLICY,
    nowMs,
  );

  saveTransient(cacheKey, Object.fromEntries(prunedTransientEntries));
  savePersisted(persistedCacheKey, Object.fromEntries(prunedPersistedEntries));
  updateSnapshotIndex({
    workspaceId,
    transientEntries: prunedTransientEntries,
    persistedEntries: prunedPersistedEntries,
  });
}

export function saveAgentSessionCachedMessagesSnapshot(
  workspaceId: string,
  sessionId: string,
  messages: Message[],
  options: SaveAgentSessionCachedSnapshotOptions = {},
): void {
  const cachedSnapshot = loadAgentSessionCachedSnapshot(workspaceId, sessionId, {
    nowMs: options.nowMs,
  });

  saveAgentSessionCachedSnapshot(
    workspaceId,
    sessionId,
    {
      messages,
      threadTurns: cachedSnapshot?.threadTurns || [],
      threadItems: cachedSnapshot?.threadItems || [],
      currentTurnId: cachedSnapshot?.currentTurnId || null,
      cacheMetadata: cachedSnapshot?.cacheMetadata,
    },
    options,
  );
}

export function getAgentSessionScopedKeys(
  workspaceId: string,
): AgentSessionScopedKeys {
  return {
    currentSessionKey: getScopedStorageKey(workspaceId, "aster_curr_sessionId"),
    messagesKey: getScopedStorageKey(workspaceId, "aster_messages"),
    persistedSessionKey: getScopedStorageKey(
      workspaceId,
      "aster_last_sessionId",
    ),
    sessionSnapshotsKey: getScopedStorageKey(
      workspaceId,
      "aster_session_snapshots",
    ),
    turnsKey: getScopedStorageKey(workspaceId, "aster_thread_turns"),
    itemsKey: getScopedStorageKey(workspaceId, "aster_thread_items"),
    currentTurnKey: getScopedStorageKey(workspaceId, "aster_curr_turnId"),
  };
}
