import { normalizeLegacyThreadItem } from "./agentTextNormalization";
import type { AgentEvent } from "./agentProtocolEventTypes";
import type {
  AgentThreadItem,
  AgentThreadTurn,
  AgentTokenUsage,
} from "./agentProtocolCoreTypes";
import {
  normalizeProviderTraceEvent,
  normalizeRecord,
  pickStringField,
} from "./agentProtocolParserUtils";

export function parseAgentContentEvent(
  type: string,
  event: Record<string, unknown>,
): AgentEvent | null {
  switch (type) {
    case "thread_started":
      return {
        type: "thread_started",
        thread_id: (event.thread_id as string) || "",
      };
    case "turn_started":
      return {
        type: "turn_started",
        turn: event.turn as AgentThreadTurn,
      };
    case "item_started":
      return {
        type: "item_started",
        item: normalizeLegacyThreadItem(event.item as AgentThreadItem),
      };
    case "item_updated":
      return {
        type: "item_updated",
        item: normalizeLegacyThreadItem(event.item as AgentThreadItem),
      };
    case "item_completed":
      return {
        type: "item_completed",
        item: normalizeLegacyThreadItem(event.item as AgentThreadItem),
      };
    case "turn_completed":
    case "turn.completed":
      return {
        type: "turn_completed",
        turn: event.turn as AgentThreadTurn,
        text: pickStringField(event, "text", "delta", "message", "content"),
        usage: event.usage as AgentTokenUsage | undefined,
      };
    case "turn_failed":
    case "turn.failed":
      return {
        type: "turn_failed",
        turn: event.turn as AgentThreadTurn,
      };
    case "turn_canceled":
    case "turn.canceled":
      return {
        type: "turn_canceled",
        turn: event.turn as AgentThreadTurn,
      };
    case "text_delta":
    case "message.delta": {
      const payload = normalizeRecord(event.payload);
      const source = payload ?? event;
      return {
        type: "text_delta",
        text:
          pickStringField(source, "text", "delta", "message", "content") || "",
        itemId: pickStringField(
          source,
          "itemId",
          "item_id",
          "id",
          "messageId",
          "message_id",
        ),
        phase: pickStringField(
          source,
          "phase",
          "messagePhase",
          "message_phase",
        ),
      };
    }
    case "text_delta_batch":
    case "message.delta_batch":
    case "message.batch": {
      const payload = normalizeRecord(event.payload);
      const source = payload ?? event;
      const text =
        pickStringField(source, "text", "delta", "message", "content") || "";
      const chunks = Array.isArray(event.chunks)
        ? event.chunks.filter(
            (chunk): chunk is string => typeof chunk === "string",
          )
        : payload && Array.isArray(payload.chunks)
          ? payload.chunks.filter(
              (chunk): chunk is string => typeof chunk === "string",
            )
          : text
            ? [text]
            : [];
      return {
        type: "text_delta_batch",
        text,
        chunks,
        itemId: pickStringField(
          source,
          "itemId",
          "item_id",
          "id",
          "messageId",
          "message_id",
        ),
        phase: pickStringField(
          source,
          "phase",
          "messagePhase",
          "message_phase",
        ),
        boundary:
          typeof event.boundary === "string"
            ? event.boundary
            : payload && typeof payload.boundary === "string"
              ? payload.boundary
              : "provider",
      };
    }
    case "thinking_delta":
      return {
        type: "thinking_delta",
        text: (event.text as string) || "",
      };
    case "provider_trace":
    case "provider.request.started":
    case "provider.first_event.received":
    case "provider.first_text_delta.received":
    case "provider.failed":
    case "provider.canceled":
      return normalizeProviderTraceEvent(type, event);
    case "reasoning_started":
    case "reasoning.started":
    case "reasoning.start": {
      const payload = normalizeRecord(event.payload);
      const source = payload ?? event;
      return {
        type: "reasoning_started",
        reasoningId: pickStringField(
          source,
          "reasoningId",
          "reasoning_id",
          "id",
        ),
        model: source.model,
        providerMetadata:
          normalizeRecord(source.providerMetadata) ??
          normalizeRecord(source.provider_metadata) ??
          normalizeRecord(source.metadata),
      };
    }
    case "reasoning_delta":
    case "reasoning.delta": {
      const payload = normalizeRecord(event.payload);
      const source = payload ?? event;
      return {
        type: "reasoning_delta",
        reasoningId: pickStringField(
          source,
          "reasoningId",
          "reasoning_id",
          "id",
        ),
        text:
          pickStringField(source, "text", "delta", "message", "content") || "",
        delta: pickStringField(source, "delta", "text", "message", "content"),
        model: source.model,
        providerMetadata:
          normalizeRecord(source.providerMetadata) ??
          normalizeRecord(source.provider_metadata) ??
          normalizeRecord(source.metadata),
      };
    }
    case "reasoning_final":
    case "reasoning.final": {
      const payload = normalizeRecord(event.payload);
      const source = payload ?? event;
      return {
        type: "reasoning_final",
        reasoningId: pickStringField(
          source,
          "reasoningId",
          "reasoning_id",
          "id",
        ),
        text:
          pickStringField(source, "text", "delta", "message", "content") || "",
        model: source.model,
        providerMetadata:
          normalizeRecord(source.providerMetadata) ??
          normalizeRecord(source.provider_metadata) ??
          normalizeRecord(source.metadata),
      };
    }
    case "reasoning_ended":
    case "reasoning.ended":
    case "reasoning.end": {
      const payload = normalizeRecord(event.payload);
      const source = payload ?? event;
      return {
        type: "reasoning_ended",
        reasoningId: pickStringField(
          source,
          "reasoningId",
          "reasoning_id",
          "id",
        ),
        status: pickStringField(source, "status"),
        model: source.model,
        providerMetadata:
          normalizeRecord(source.providerMetadata) ??
          normalizeRecord(source.provider_metadata) ??
          normalizeRecord(source.metadata),
      };
    }
    case "plan_delta":
    case "plan.delta":
    case "plan_final":
    case "plan.final": {
      const payload = normalizeRecord(event.payload);
      const source = payload ?? event;
      const isFinal = type === "plan_final" || type === "plan.final";
      const planEvent = {
        text:
          pickStringField(source, "text", "delta", "message", "content") || "",
        delta: pickStringField(source, "delta", "text", "message", "content"),
        plan: source.plan,
        explanation: pickStringField(source, "explanation"),
        sourceItemId: pickStringField(source, "sourceItemId", "source_item_id"),
        toolCallId: pickStringField(source, "toolCallId", "tool_call_id"),
        revisionId: pickStringField(source, "revisionId", "revision_id"),
        source: pickStringField(source, "source"),
      };
      return isFinal
        ? {
            type: "plan_final",
            ...planEvent,
          }
        : {
            type: "plan_delta",
            ...planEvent,
          };
    }
    default:
      return null;
  }
}
