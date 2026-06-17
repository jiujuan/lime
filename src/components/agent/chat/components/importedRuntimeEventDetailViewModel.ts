import type { ConversationImportRuntimeEventDetail } from "@/lib/api/conversationImport";

export type ImportedRuntimeEventPayloadSummary =
  | { kind: "empty" }
  | { kind: "record"; fieldCount: number }
  | { kind: "array"; itemCount: number }
  | { kind: "scalar"; valueType: string; length?: number };

export interface ImportedRuntimeEventDisplay {
  id: string;
  eventType: string;
  eventTypeLabel: string;
  turnNumber: number;
  eventNumber: number;
  sourceEventNumber: number;
  payloadSummary: ImportedRuntimeEventPayloadSummary;
  payloadPreview: string;
  payloadPreviewTruncated: boolean;
}

const DEFAULT_PAYLOAD_PREVIEW_LIMIT = 2_000;
const PAYLOAD_PREVIEW_KEYS = [
  "type",
  "role",
  "status",
  "name",
  "toolName",
  "tool_name",
  "command",
  "query",
  "summary",
  "text",
  "message",
  "detail",
  "exitCode",
  "exit_code",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeEventTypeLabel(eventType: string): string {
  const normalized = eventType.trim().replace(/[_.-]+/g, " ");
  return normalized || "event";
}

function summarizePayload(payload: unknown): ImportedRuntimeEventPayloadSummary {
  if (payload === null || payload === undefined) {
    return { kind: "empty" };
  }
  if (Array.isArray(payload)) {
    return { kind: "array", itemCount: payload.length };
  }
  if (isRecord(payload)) {
    return { kind: "record", fieldCount: Object.keys(payload).length };
  }
  if (typeof payload === "string") {
    return { kind: "scalar", valueType: "string", length: payload.length };
  }
  return { kind: "scalar", valueType: typeof payload };
}

function safePayloadPreviewValue(value: unknown): unknown {
  if (typeof value === "string") {
    return value.length > 500 ? `${value.slice(0, 499)}…` : value;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 8).map(safePayloadPreviewValue);
  }
  if (isRecord(value)) {
    return sanitizePayloadRecord(value);
  }
  return value;
}

function sanitizePayloadRecord(
  record: Record<string, unknown>,
): Record<string, unknown> {
  const preview: Record<string, unknown> = {};
  for (const key of PAYLOAD_PREVIEW_KEYS) {
    if (record[key] !== undefined) {
      preview[key] = safePayloadPreviewValue(record[key]);
    }
  }
  if (Object.keys(preview).length > 0) {
    return preview;
  }
  return {
    fields: Object.keys(record).length,
  };
}

export function formatImportedRuntimePayloadPreview(
  payload: unknown,
  maxLength = DEFAULT_PAYLOAD_PREVIEW_LIMIT,
): { text: string; truncated: boolean } {
  const safePayload = isRecord(payload)
    ? sanitizePayloadRecord(payload)
    : safePayloadPreviewValue(payload);
  const serialized =
    typeof safePayload === "string"
      ? safePayload
      : JSON.stringify(safePayload, null, 2) ?? String(safePayload);
  if (serialized.length <= maxLength) {
    return { text: serialized, truncated: false };
  }
  return {
    text: `${serialized.slice(0, Math.max(0, maxLength - 1))}…`,
    truncated: true,
  };
}

export function buildImportedRuntimeEventDisplay(
  event: ConversationImportRuntimeEventDetail,
  options: { payloadPreviewLimit?: number } = {},
): ImportedRuntimeEventDisplay {
  const payloadPreview = formatImportedRuntimePayloadPreview(
    event.payload,
    options.payloadPreviewLimit,
  );

  return {
    id: [
      event.sourceEventIndex,
      event.turnIndex,
      event.eventIndex,
      event.eventType,
    ].join(":"),
    eventType: event.eventType,
    eventTypeLabel: normalizeEventTypeLabel(event.eventType),
    turnNumber: event.turnIndex + 1,
    eventNumber: event.eventIndex + 1,
    sourceEventNumber: event.sourceEventIndex + 1,
    payloadSummary: summarizePayload(event.payload),
    payloadPreview: payloadPreview.text,
    payloadPreviewTruncated: payloadPreview.truncated,
  };
}
