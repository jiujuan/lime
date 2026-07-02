import type { MessageTaskPreviewStatus } from "../types";

export interface ToolResultPreviewParams {
  toolId?: string;
  toolName: string;
  toolArguments: string | undefined;
  toolResult: Record<string, unknown> | undefined;
  fallbackPrompt: string;
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

export function parseJsonRecordString(
  value: unknown,
): Record<string, unknown> | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  if (!normalized.startsWith("{")) {
    return null;
  }

  try {
    return asRecord(JSON.parse(normalized));
  } catch {
    return null;
  }
}

export function readMetadataString(
  candidates: Array<Record<string, unknown> | null | undefined>,
  keys: string[],
): string | undefined {
  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }
    for (const key of keys) {
      const value = candidate[key];
      if (typeof value === "string" && value.trim()) {
        return value.trim();
      }
    }
  }
  return undefined;
}

export function readMetadataPositiveNumber(
  candidates: Array<Record<string, unknown> | null | undefined>,
  keys: string[],
): number | undefined {
  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }
    for (const key of keys) {
      const value = candidate[key];
      if (typeof value === "number" && Number.isFinite(value) && value > 0) {
        return value;
      }
      if (typeof value === "string" && value.trim()) {
        const parsed = Number(value);
        if (Number.isFinite(parsed) && parsed > 0) {
          return parsed;
        }
      }
    }
  }
  return undefined;
}

export function readFirstArrayRecord(
  candidates: Array<Record<string, unknown> | null | undefined>,
  keys: string[],
): Record<string, unknown> | null {
  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }
    for (const key of keys) {
      const value = candidate[key];
      if (!Array.isArray(value) || value.length === 0) {
        continue;
      }
      const firstRecord = asRecord(value[0]);
      if (firstRecord) {
        return firstRecord;
      }
    }
  }
  return null;
}

export function readArrayRecords(
  candidates: Array<Record<string, unknown> | null | undefined>,
  keys: string[],
): Record<string, unknown>[] {
  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }
    for (const key of keys) {
      const value = candidate[key];
      if (!Array.isArray(value) || value.length === 0) {
        continue;
      }
      const records = value
        .map((item) => asRecord(item))
        .filter((item): item is Record<string, unknown> => Boolean(item));
      if (records.length > 0) {
        return records;
      }
    }
  }
  return [];
}

export function readCommandArgumentValue(
  command: string,
  flag: string,
): string | undefined {
  const escapedFlag = flag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `${escapedFlag}\\s+(?:"([^"]+)"|'([^']+)'|(\\S+))`,
  );
  const match = command.match(pattern);
  return match?.[1]?.trim() || match?.[2]?.trim() || match?.[3]?.trim();
}

export function resolveTaskPreviewStatus(
  status: string | undefined,
): MessageTaskPreviewStatus {
  switch ((status || "").trim().toLowerCase()) {
    case "completed":
    case "complete":
    case "success":
    case "succeeded":
      return "complete";
    case "partial":
      return "partial";
    case "failed":
    case "error":
      return "failed";
    case "cancelled":
    case "canceled":
      return "cancelled";
    case "running":
    case "processing":
    case "in_progress":
    case "queued":
    case "pending_submit":
    case "pending":
    default:
      return "running";
  }
}

export function resolveTaskPreviewPhase(status: string | undefined): string {
  switch ((status || "").trim().toLowerCase()) {
    case "completed":
    case "complete":
    case "success":
    case "succeeded":
      return "succeeded";
    case "partial":
      return "partial";
    case "failed":
    case "error":
      return "failed";
    case "cancelled":
    case "canceled":
      return "cancelled";
    case "queued":
    case "pending_submit":
    case "pending":
      return "queued";
    case "running":
    case "processing":
    case "in_progress":
      return "running";
    default:
      return "queued";
  }
}
