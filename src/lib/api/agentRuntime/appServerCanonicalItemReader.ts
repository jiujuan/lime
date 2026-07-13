import type { AppServerAgentEvent } from "@/lib/api/appServer";
import {
  normalizeRecord,
  readBoolean,
  readFiniteNumber,
  readString,
} from "./appServerEventPayloadUtils";
import { projectCanonicalApprovalItem } from "./canonicalApprovalItemProjection";

type ItemStatus = "in_progress" | "completed" | "failed";

export function readCanonicalThreadItem(
  item: Record<string, unknown>,
  event: AppServerAgentEvent,
): Record<string, unknown> | null {
  const sessionId = readString(item, "sessionId", "session_id");
  const threadId = readString(item, "threadId", "thread_id");
  const turnId = readString(item, "turnId", "turn_id");
  const itemId = readString(item, "itemId", "item_id");
  const canonicalStatus = readString(item, "status");
  const canonicalKind = readString(item, "kind");
  const canonicalSequence = readFiniteNumber(item, "sequence");
  const ordinal = readFiniteNumber(item, "ordinal");
  const createdAt = readRequiredItemTimestamp(item, "createdAt", "createdAtMs");
  const updatedAt = readRequiredItemTimestamp(item, "updatedAt", "updatedAtMs");
  const status = normalizeItemStatus(canonicalStatus, "in_progress");
  const payload = normalizeRecord(item.payload);
  if (
    !sessionId ||
    !threadId ||
    !turnId ||
    !itemId ||
    !canonicalStatus ||
    !canonicalKind ||
    canonicalSequence === undefined ||
    canonicalSequence !== event.sequence ||
    ordinal === undefined ||
    !createdAt ||
    !updatedAt ||
    !payload ||
    sessionId !== event.sessionId ||
    (event.threadId !== undefined && threadId !== event.threadId) ||
    (event.turnId !== undefined && turnId !== event.turnId)
  ) {
    return null;
  }

  const base = {
    id: itemId,
    thread_id: threadId,
    turn_id: turnId,
    sequence: canonicalSequence,
    status,
    started_at: createdAt,
    updated_at: updatedAt,
    completed_at: readItemTimestamp(item, "completedAt", "completedAtMs"),
    metadata: {
      ...(normalizeRecord(item.metadata) ?? {}),
      canonicalKind,
      canonicalStatus,
      ordinal,
    },
  };

  switch (readString(payload, "type")) {
    case "userMessage":
      return {
        ...base,
        type: "user_message",
        content: readString(payload, "content") ?? "",
      };
    case "agentMessage":
      return {
        ...base,
        type: "agent_message",
        text: readString(payload, "text") ?? "",
        phase: readString(payload, "phase"),
      };
    case "reasoning": {
      const summary = readStringList(payload.summary);
      const content = readStringList(payload.content);
      return {
        ...base,
        type: "reasoning",
        text: (content.length > 0 ? content : summary).join(""),
        summary,
      };
    }
    case "tool":
      return readCanonicalToolThreadItem(item, event, "in_progress");
    case "mcpToolCall":
      return toolCallItem(
        base,
        payload,
        readString(payload, "toolName", "tool_name") ?? "",
        {
          toolFamily: "mcp",
          mcpServer: readString(payload, "server_name", "serverName"),
        },
      );
    case "collabAgentToolCall": {
      const output = normalizeRecord(payload.output);
      return {
        ...base,
        type: "subagent_activity",
        status_label: readString(payload, "operation") ?? status,
        session_id: readString(payload, "target_thread_id", "targetThreadId"),
        summary:
          readString(payload, "message") ?? readString(output ?? {}, "text"),
        metadata: {
          ...(normalizeRecord(base.metadata) ?? {}),
          callId: readString(payload, "call_id", "callId"),
          output,
        },
      };
    }
    case "approval": {
      const approval = projectCanonicalApprovalItem(item);
      if (!approval) {
        return null;
      }
      const requestUserInput = ["ask_user", "elicitation"].includes(
        approval.action_type,
      );
      return requestUserInput
        ? { ...approval, type: "request_user_input" }
        : { ...approval };
    }
    case "command":
      return {
        ...base,
        type: "command_execution",
        command: readString(payload, "command") ?? "",
        cwd: readString(payload, "cwd") ?? "",
        aggregated_output: readString(payload, "output"),
        exit_code: readFiniteNumber(payload, "exitCode", "exit_code"),
      };
    case "file": {
      const path = readString(payload, "path") ?? "";
      return {
        ...base,
        type: "file_artifact",
        path,
        source: "canonical_thread_item",
        content: readString(payload, "diff"),
        metadata: {
          ...(normalizeRecord(base.metadata) ?? {}),
          fileStatus: readString(payload, "status"),
        },
      };
    }
    case "media":
      return {
        ...base,
        type: "media",
        uri: readString(payload, "uri") ?? "",
        mime_type: readString(payload, "mime_type", "mimeType") ?? "",
        preview: readString(payload, "preview"),
      };
    case "subAgent":
      return {
        ...base,
        type: "subagent_activity",
        status_label: readString(payload, "activity") ?? status,
        summary: readString(payload, "detail"),
        session_id: readString(payload, "child_thread_id", "childThreadId"),
      };
    case "contextCompaction":
      return {
        ...base,
        type: "context_compaction",
        stage: isTerminalItemStatus(status) ? "completed" : "started",
        detail: readString(payload, "summary"),
        metadata: {
          ...(normalizeRecord(base.metadata) ?? {}),
          windowId: readString(payload, "window_id", "windowId"),
        },
      };
    case "extension": {
      const data = normalizeRecord(payload.data) ?? {};
      return {
        ...base,
        type: "extension",
        name: readString(payload, "name") ?? "",
        data,
      };
    }
    default:
      return null;
  }
}

export function readCanonicalToolThreadItem(
  item: Record<string, unknown>,
  event: AppServerAgentEvent,
  fallbackStatus: ItemStatus,
): Record<string, unknown> | null {
  const payload = normalizeRecord(item.payload);
  if (readString(payload ?? {}, "type") !== "tool") {
    return null;
  }

  const output = normalizeRecord(payload?.output);
  const status = normalizeItemStatus(
    readString(item, "status"),
    fallbackStatus,
  );
  const callId = readString(payload ?? {}, "call_id");
  const error = readString(output ?? {}, "error");
  const completedAt = readItemTimestamp(item, "completedAt", "completedAtMs");
  const itemId = readString(item, "itemId", "item_id") ?? event.eventId;
  const metadata = normalizeRecord(item.metadata) ?? {};

  return {
    id: itemId,
    thread_id:
      readString(item, "threadId", "thread_id") ??
      event.threadId ??
      event.sessionId,
    turn_id:
      readString(item, "turnId", "turn_id") ?? event.turnId ?? event.sessionId,
    sequence: readFiniteNumber(item, "sequence") ?? event.sequence,
    status,
    started_at:
      readItemTimestamp(item, "createdAt", "createdAtMs") ?? event.timestamp,
    updated_at:
      readItemTimestamp(item, "updatedAt", "updatedAtMs") ?? event.timestamp,
    completed_at:
      completedAt ?? (status === "in_progress" ? undefined : event.timestamp),
    type: "tool_call",
    tool_name: readString(payload ?? {}, "name") ?? "",
    arguments: payload?.arguments,
    output: readString(output ?? {}, "text"),
    structured_content: output?.structuredContent,
    output_ref: readString(output ?? {}, "outputRef"),
    output_truncated: readBoolean(output ?? {}, "truncated"),
    duration_ms: readFiniteNumber(output ?? {}, "durationMs"),
    success: resolveSuccess(status, error),
    error,
    metadata: {
      ...metadata,
      callId,
      canonicalKind: readString(item, "kind"),
      canonicalStatus: readString(item, "status"),
      ordinal: readFiniteNumber(item, "ordinal"),
      durationMs: readFiniteNumber(output ?? {}, "durationMs"),
      truncated: readBoolean(output ?? {}, "truncated"),
      outputRef: readString(output ?? {}, "outputRef"),
    },
  };
}

function normalizeItemStatus(
  status: string | undefined,
  fallbackStatus: ItemStatus,
): string {
  switch (status) {
    case "pending":
    case "inProgress":
      return "in_progress";
    case "interrupted":
    case "cancelled":
      return "failed";
    default:
      return status ?? fallbackStatus;
  }
}

function readItemTimestamp(
  item: Record<string, unknown>,
  stringKey: string,
  millisKey: string,
): string | undefined {
  const timestamp = readString(item, stringKey);
  if (timestamp) {
    return timestamp;
  }
  const millis = readFiniteNumber(item, millisKey);
  if (millis === undefined) {
    return undefined;
  }
  const value = new Date(millis);
  return Number.isNaN(value.getTime()) ? undefined : value.toISOString();
}

function readRequiredItemTimestamp(
  item: Record<string, unknown>,
  stringKey: string,
  millisKey: string,
): string | null {
  return readItemTimestamp(item, stringKey, millisKey) ?? null;
}

function resolveSuccess(
  status: string,
  error: string | undefined,
): boolean | undefined {
  if (error || ["failed", "interrupted", "cancelled"].includes(status)) {
    return false;
  }
  return status === "completed" ? true : undefined;
}

function toolCallItem(
  base: Record<string, unknown>,
  payload: Record<string, unknown>,
  toolName: string,
  metadata: Record<string, unknown>,
): Record<string, unknown> {
  const output = normalizeRecord(payload.output);
  const status = String(base.status ?? "in_progress");
  const error = readString(output ?? {}, "error");
  return {
    ...base,
    type: "tool_call",
    tool_name: toolName,
    arguments: payload.arguments,
    output: readString(output ?? {}, "text"),
    structured_content: output?.structuredContent,
    output_ref: readString(output ?? {}, "outputRef"),
    output_truncated: readBoolean(output ?? {}, "truncated"),
    duration_ms: readFiniteNumber(output ?? {}, "durationMs"),
    success: resolveSuccess(status, error),
    error,
    metadata: {
      ...(normalizeRecord(base.metadata) ?? {}),
      callId: readString(payload, "call_id", "callId"),
      ...metadata,
    },
  };
}

function readStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is string => typeof entry === "string");
}

function isTerminalItemStatus(status: string): boolean {
  return ["completed", "failed", "interrupted", "cancelled"].includes(status);
}
