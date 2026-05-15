import {
  hasOemCloudSession,
  resolveOemCloudRuntimeContext,
} from "@/lib/api/oemCloudRuntime";
import type { ExpertCatalogEvent } from "./types";

const EXPERT_ANALYTICS_QUEUE_STORAGE_KEY = "lime:expert-analytics-queue:v1";
const MAX_EXPERT_ANALYTICS_QUEUE_SIZE = 100;
const MAX_EXPERT_ANALYTICS_BATCH_SIZE = 50;

const SENSITIVE_EVENT_KEYS = new Set([
  "prompt",
  "prompts",
  "message",
  "messages",
  "response",
  "assistantresponse",
  "assistantcontent",
  "usercontent",
  "filecontent",
  "memory",
  "privatememory",
  "conversation",
  "conversations",
]);

interface ExpertEventResponseEnvelope {
  code?: number;
  message?: string;
  data?: unknown;
}

function normalizeKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[_\-. ]/g, "");
}

function sanitizeMetadata(
  metadata: ExpertCatalogEvent["metadata"],
): Record<string, string> | undefined {
  if (!metadata) {
    return undefined;
  }
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(metadata)) {
    const trimmedKey = key.trim();
    if (!trimmedKey || SENSITIVE_EVENT_KEYS.has(normalizeKey(trimmedKey))) {
      continue;
    }
    const trimmedValue = String(value ?? "").trim();
    if (!trimmedValue) {
      continue;
    }
    result[trimmedKey.slice(0, 64)] = trimmedValue.slice(0, 256);
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function normalizeExpertCatalogEvent(
  event: ExpertCatalogEvent,
): ExpertCatalogEvent | null {
  const expertId = event.expertId.trim();
  const releaseId = event.releaseId.trim();
  const sourceSurface = event.sourceSurface.trim();
  if (!expertId || !releaseId || !event.eventName || !sourceSurface) {
    return null;
  }
  return {
    expertId,
    releaseId,
    eventName: event.eventName,
    sourceSurface,
    catalogVersion: event.catalogVersion?.trim() || undefined,
    clientVersion: event.clientVersion?.trim() || undefined,
    locale: event.locale?.trim() || undefined,
    sessionId: event.sessionId?.trim() || undefined,
    occurredAt: event.occurredAt?.trim() || new Date().toISOString(),
    metadata: sanitizeMetadata(event.metadata),
  };
}

function readQueuedExpertCatalogEvents(): ExpertCatalogEvent[] {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(EXPERT_ANALYTICS_QUEUE_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .map((item) => normalizeExpertCatalogEvent(item as ExpertCatalogEvent))
      .filter((item): item is ExpertCatalogEvent => Boolean(item));
  } catch {
    return [];
  }
}

function saveQueuedExpertCatalogEvents(events: ExpertCatalogEvent[]) {
  if (typeof window === "undefined") {
    return;
  }
  const normalized = events
    .map((item) => normalizeExpertCatalogEvent(item))
    .filter((item): item is ExpertCatalogEvent => Boolean(item))
    .slice(-MAX_EXPERT_ANALYTICS_QUEUE_SIZE);
  if (normalized.length === 0) {
    window.localStorage.removeItem(EXPERT_ANALYTICS_QUEUE_STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(
    EXPERT_ANALYTICS_QUEUE_STORAGE_KEY,
    JSON.stringify(normalized),
  );
}

export function queueExpertCatalogEvent(event: ExpertCatalogEvent) {
  const normalized = normalizeExpertCatalogEvent(event);
  if (!normalized) {
    return;
  }
  saveQueuedExpertCatalogEvents([
    ...readQueuedExpertCatalogEvents(),
    normalized,
  ]);
}

async function submitExpertCatalogEvents(events: ExpertCatalogEvent[]) {
  const runtime = resolveOemCloudRuntimeContext();
  if (!hasOemCloudSession(runtime)) {
    throw new Error("缺少品牌云端 Session Token，专家运营事件已进入本地队列。");
  }

  const normalized = events
    .map((item) => normalizeExpertCatalogEvent(item))
    .filter((item): item is ExpertCatalogEvent => Boolean(item))
    .slice(0, MAX_EXPERT_ANALYTICS_BATCH_SIZE);
  if (normalized.length === 0) {
    return;
  }

  const response = await fetch(
    `${runtime.controlPlaneBaseUrl}/v1/public/tenants/${encodeURIComponent(runtime.tenantId)}/client/experts/events`,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${runtime.sessionToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ events: normalized }),
    },
  );

  let payload: ExpertEventResponseEnvelope | null = null;
  try {
    payload = (await response.json()) as ExpertEventResponseEnvelope;
  } catch {
    payload = null;
  }
  if (!response.ok) {
    throw new Error(
      payload?.message?.trim() || `专家运营事件上报失败 (${response.status})`,
    );
  }
}

export async function flushExpertCatalogEvents() {
  const runtime = resolveOemCloudRuntimeContext();
  if (!runtime) {
    return;
  }
  const queued = readQueuedExpertCatalogEvents();
  if (queued.length === 0) {
    return;
  }
  await submitExpertCatalogEvents(queued);
  saveQueuedExpertCatalogEvents([]);
}

export async function recordExpertCatalogEvent(event: ExpertCatalogEvent) {
  const normalized = normalizeExpertCatalogEvent(event);
  if (!normalized) {
    return;
  }

  const runtime = resolveOemCloudRuntimeContext();
  if (!runtime) {
    return;
  }
  const queued = readQueuedExpertCatalogEvents();
  if (!hasOemCloudSession(runtime)) {
    saveQueuedExpertCatalogEvents([...queued, normalized]);
    return;
  }
  const nextBatch = [...queued, normalized].slice(
    -MAX_EXPERT_ANALYTICS_BATCH_SIZE,
  );
  try {
    await submitExpertCatalogEvents(nextBatch);
    saveQueuedExpertCatalogEvents([]);
  } catch {
    saveQueuedExpertCatalogEvents([...queued, normalized]);
  }
}

export const expertAnalyticsStorageKeys = {
  queue: EXPERT_ANALYTICS_QUEUE_STORAGE_KEY,
} as const;
