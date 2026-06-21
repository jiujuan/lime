import type { ContentPart } from "../types";

export const normalizeHistoryPartType = (value: unknown): string => {
  if (typeof value !== "string") return "";
  return value
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase();
};

export const appendTextWithOverlapDetection = (
  base: string,
  chunk: string,
): string => {
  if (!base) return chunk;
  if (!chunk) return base;
  if (chunk.startsWith(base)) return chunk;
  if (base.endsWith(chunk)) return base;
  if (base.includes(chunk)) return base;

  const maxOverlap = Math.min(base.length, chunk.length);
  for (let overlap = maxOverlap; overlap > 0; overlap -= 1) {
    if (base.slice(-overlap) === chunk.slice(0, overlap)) {
      return base + chunk.slice(overlap);
    }
  }

  return base + chunk;
};

export const appendTextToParts = (
  parts: ContentPart[],
  text: string,
): ContentPart[] => {
  const newParts = [...parts];
  const lastPart = newParts[newParts.length - 1];

  if (lastPart && lastPart.type === "text") {
    newParts[newParts.length - 1] = {
      type: "text",
      text: appendTextWithOverlapDetection(lastPart.text, text),
    };
  } else {
    newParts.push({ type: "text", text });
  }
  return newParts;
};

export const appendThinkingToHistoryParts = (
  parts: ContentPart[],
  text: string,
  metadata?: Record<string, unknown>,
): ContentPart[] => {
  if (!text) {
    return parts;
  }

  const nextParts = [...parts];
  const lastPart = nextParts[nextParts.length - 1];

  if (lastPart?.type === "thinking") {
    nextParts[nextParts.length - 1] = {
      type: "thinking",
      text: lastPart.text + text,
      metadata: lastPart.metadata ?? metadata,
    };
    return nextParts;
  }

  nextParts.push({
    type: "thinking",
    text,
    ...(metadata ? { metadata } : {}),
  });
  return nextParts;
};

export const extractThinkingContentFromParts = (
  parts?: ContentPart[],
): string | undefined => {
  if (!parts || parts.length === 0) {
    return undefined;
  }

  const thinkingText = parts
    .filter(
      (part): part is Extract<ContentPart, { type: "thinking" }> =>
        part.type === "thinking",
    )
    .map((part) => part.text)
    .join("");

  return thinkingText || undefined;
};

export const normalizeSignatureText = (text: string): string =>
  text.replace(/\s+/g, " ").trim();

export function mergeByKey<T>(
  localItems: T[] | undefined,
  remoteItems: T[] | undefined,
  getKey: (item: T) => string,
): T[] | undefined {
  const local = Array.isArray(localItems) ? localItems : [];
  const remote = Array.isArray(remoteItems) ? remoteItems : [];

  if (local.length === 0) {
    return remote.length > 0 ? remote : undefined;
  }
  if (remote.length === 0) {
    return local;
  }

  const merged = new Map<string, T>();
  for (const item of local) {
    merged.set(getKey(item), item);
  }
  for (const item of remote) {
    merged.set(getKey(item), item);
  }
  return Array.from(merged.values());
}

export function normalizeHistoryString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function parseHistoryTimestamp(value?: string | null): Date {
  if (typeof value === "string" && value.trim()) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return date;
    }
  }
  return new Date(0);
}

export function parseHistoryTimestampValue(value: unknown): Date {
  if (typeof value === "string") {
    return parseHistoryTimestamp(value);
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const timestampMs = value > 10_000_000_000 ? value : value * 1000;
    const date = new Date(timestampMs);
    if (!Number.isNaN(date.getTime())) {
      return date;
    }
  }
  return new Date(0);
}

export function normalizeHistoryStatus(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function isFailedHistoryStatus(value: unknown): boolean {
  const status = normalizeHistoryStatus(value);
  return status === "failed" || status === "error";
}

export function asHistoryRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function readHistoryString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function readHistoryNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

export function readHistoryMetadataString(
  metadata: Record<string, unknown> | null,
  keys: string[],
): string {
  for (const key of keys) {
    const value = readHistoryString(metadata?.[key]);
    if (value) {
      return value;
    }
  }
  return "";
}

export function fileNameFromHistoryPath(path: string): string {
  const normalized = path.replace(/\\/g, "/").trim();
  const segments = normalized.split("/").filter(Boolean);
  return segments.at(-1) || normalized;
}
