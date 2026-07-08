import type {
  AgentRuntimeThreadReadModel,
  QueuedTurnSnapshot,
} from "@/lib/api/agentRuntime";
import { normalizeQueuedTurnSnapshots } from "@/lib/api/queuedTurn";

export function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function readStringField(
  value: Record<string, unknown> | null | undefined,
  ...keys: string[]
): string | null {
  if (!value) {
    return null;
  }
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate;
    }
  }
  return null;
}

export function readBooleanField(
  value: Record<string, unknown> | null | undefined,
  ...keys: string[]
): boolean | null {
  if (!value) {
    return null;
  }
  for (const key of keys) {
    if (typeof value[key] === "boolean") {
      return value[key];
    }
  }
  return null;
}

export function readNumberField(
  value: Record<string, unknown> | null | undefined,
  ...keys: string[]
): number | null {
  if (!value) {
    return null;
  }
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      return candidate;
    }
  }
  return null;
}

export function readArrayField(
  value: Record<string, unknown> | null | undefined,
  ...keys: string[]
): unknown[] {
  if (!value) {
    return [];
  }
  for (const key of keys) {
    const candidate = value[key];
    if (Array.isArray(candidate)) {
      return [...candidate];
    }
  }
  return [];
}

export function normalizeQueuedTurnsFromReadModel(
  value: AgentRuntimeThreadReadModel | unknown,
): QueuedTurnSnapshot[] {
  const root = readRecord(value);
  const detail = readRecord(root?.detail);
  const detailThreadRead =
    readRecord(detail?.thread_read) ?? readRecord(detail?.threadRead);
  const candidates = [
    readArrayField(root, "queued_turns", "queuedTurns"),
    readArrayField(detailThreadRead, "queued_turns", "queuedTurns"),
    readArrayField(detail, "queued_turns", "queuedTurns"),
  ];

  for (const candidate of candidates) {
    const normalized = normalizeQueuedTurnSnapshots(candidate);
    if (normalized.length > 0) {
      return normalized;
    }
  }

  return [];
}
