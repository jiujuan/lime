import type { AppServerAgentEvent } from "@/lib/api/appServer";
import { isLegacyRuntimeTurnTerminalEventClass } from "@limecloud/agent-ui-contracts";

export function parseEventTimestampMs(
  timestamp: string | undefined,
): number | null {
  if (!timestamp) {
    return null;
  }
  const parsed = Date.parse(timestamp);
  return Number.isFinite(parsed) ? parsed : null;
}

export function isLegacyTurnTerminalAppServerEventType(type: string): boolean {
  return isLegacyRuntimeTurnTerminalEventClass(type);
}

export function readAppServerAgentEvent(
  params: unknown,
): AppServerAgentEvent | null {
  const record = normalizeRecord(params);
  const event = normalizeRecord(record?.event);
  if (!event) {
    return null;
  }

  const eventId = readString(event, "eventId", "event_id");
  const sessionId = readString(event, "sessionId", "session_id");
  const type = readString(event, "type");
  const timestamp = readString(event, "timestamp");
  const sequence = event.sequence;

  if (
    !eventId ||
    !sessionId ||
    !type ||
    !timestamp ||
    typeof sequence !== "number"
  ) {
    return null;
  }

  return {
    eventId,
    sequence,
    sessionId,
    threadId: readString(event, "threadId", "thread_id"),
    turnId: readString(event, "turnId", "turn_id"),
    type,
    timestamp,
    payload: event.payload,
  };
}

export function normalizeRecord(
  value: unknown,
): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export function readString(
  record: Record<string, unknown>,
  ...keys: string[]
): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string") {
      return value;
    }
  }
  return undefined;
}

export function readStringArray(
  record: Record<string, unknown>,
  ...keys: string[]
): string[] | undefined {
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) {
      return value.filter((item): item is string => typeof item === "string");
    }
  }
  return undefined;
}

export function readBoolean(
  record: Record<string, unknown>,
  ...keys: string[]
): boolean | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "boolean") {
      return value;
    }
  }
  return undefined;
}

export function readFiniteNumber(
  record: Record<string, unknown>,
  ...keys: string[]
): number | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value.trim());
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return undefined;
}

export function providerTraceStageFromEventType(
  type: string,
): string | undefined {
  switch (type) {
    case "provider.request.started":
      return "request_started";
    case "provider.first_event.received":
      return "first_event_received";
    case "provider.first_text_delta.received":
      return "first_text_delta_received";
    case "provider.failed":
      return "failed";
    case "provider.canceled":
      return "canceled";
    default:
      return undefined;
  }
}

export function readToolCallId(
  record: Record<string, unknown>,
): string | undefined {
  return readString(
    record,
    "toolCallId",
    "tool_call_id",
    "toolId",
    "tool_id",
    "commandId",
    "command_id",
    "id",
  );
}

export function readToolName(
  record: Record<string, unknown>,
): string | undefined {
  return readString(record, "toolName", "tool_name", "name");
}

export function normalizeToolArguments(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function normalizeToolResultOutput(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (value === undefined || value === null) {
    return "";
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function normalizeToolExecutionResult(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const rawResult = normalizeRecord(payload.result);
  const source = rawResult ?? payload;
  const error = readString(source, "error", "message");
  const metadata = normalizeRecord(source.metadata);
  const structuredContent =
    source.structuredContent ?? source.structured_content;
  const success =
    typeof source.success === "boolean" ? source.success : error ? false : true;

  return {
    success,
    output: normalizeToolResultOutput(
      source.output ?? source.text ?? source.content,
    ),
    ...(error ? { error } : {}),
    ...(Array.isArray(source.images) ? { images: source.images } : {}),
    ...(metadata ? { metadata } : {}),
    ...(structuredContent !== undefined
      ? {
          structuredContent,
          structured_content: structuredContent,
        }
      : {}),
  };
}
