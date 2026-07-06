import type {
  AgentEvent,
  AgentEventToolEnd,
  AgentEventToolInputDelta,
  AgentEventToolOutputDelta,
  AgentEventToolProgress,
  AgentEventToolStart,
} from "@/lib/api/agentProtocol";
import type {
  AgentUiProjectionContext,
  AgentUiProjectionEvent,
} from "@limecloud/agent-ui-contracts";
import {
  buildAgentUiToolEndEvents,
  buildAgentUiToolInputDeltaEvent,
  buildAgentUiToolOutputDeltaEvent,
  buildAgentUiToolProgressEvent,
  buildAgentUiToolStartEvents,
} from "@limecloud/agent-runtime-projection";
import type { SoulInteractionCopy } from "@/lib/soul/interactionCopy";
import { buildSoulToolLifecycleDescriptor } from "./soulToolLifecycleDescriptor";

type ToolProjectionEvent = Extract<
  AgentEvent,
  {
    type:
      | "tool_start"
      | "tool_end"
      | "tool_progress"
      | "tool_output_delta"
      | "tool_input_delta";
  }
>;

export interface ToolProjectionOptions {
  soulCopy?: SoulInteractionCopy;
}

function withSoulToolLifecycle(
  events: AgentUiProjectionEvent[],
  options: ToolProjectionOptions | undefined,
  params: Parameters<typeof buildSoulToolLifecycleDescriptor>[0],
): AgentUiProjectionEvent[] {
  const descriptor = buildSoulToolLifecycleDescriptor({
    ...params,
    soulCopy: options?.soulCopy,
  });
  return events.map((event) => {
    if (event.owner !== "tool") {
      return event;
    }
    return {
      ...event,
      payload: {
        ...(event.payload ?? {}),
        soulLifecycle: descriptor,
        soulSurface: descriptor.surface,
        soulPhase: descriptor.phase,
        styleLevel: descriptor.styleLevel,
        riskLevel: descriptor.riskLevel,
        toneVariant: descriptor.toneVariant,
        ...(descriptor.profileId ? { profileId: descriptor.profileId } : {}),
        ...(descriptor.packId ? { packId: descriptor.packId } : {}),
      },
    };
  });
}

export function buildToolProjectionEvents(
  event: ToolProjectionEvent,
  context: AgentUiProjectionContext,
  options: ToolProjectionOptions = {},
): AgentUiProjectionEvent[] {
  const events = buildHostNeutralToolProjectionEvents(event, context);
  return withSoulToolLifecycle(
    events,
    options,
    resolveSoulToolLifecycleParams(event),
  );
}

function buildHostNeutralToolProjectionEvents(
  event: ToolProjectionEvent,
  context: AgentUiProjectionContext,
): AgentUiProjectionEvent[] {
  switch (event.type) {
    case "tool_start":
      return buildToolStartEvents(event, context);
    case "tool_end":
      return buildToolEndEvents(event, context);
    case "tool_progress":
      return [buildToolProgressEvent(event, context)];
    case "tool_output_delta":
      return [buildToolOutputDeltaEvent(event, context)];
    case "tool_input_delta":
      return [buildToolInputDeltaEvent(event, context)];
    default: {
      const exhaustive: never = event;
      return exhaustive;
    }
  }
}

function resolveSoulToolLifecycleParams(
  event: ToolProjectionEvent,
): Parameters<typeof buildSoulToolLifecycleDescriptor>[0] {
  switch (event.type) {
    case "tool_start":
      return { status: "started" };
    case "tool_end":
      return {
        status: event.result.success === false ? "failed" : "completed",
      };
    case "tool_progress":
      return { status: "progress" };
    case "tool_output_delta":
      return { status: "output_delta" };
    case "tool_input_delta":
      return { status: "input_delta" };
    default: {
      const exhaustive: never = event;
      return exhaustive;
    }
  }
}

export function buildToolStartEvents(
  event: AgentEventToolStart,
  context: AgentUiProjectionContext,
): AgentUiProjectionEvent[] {
  return buildAgentUiToolStartEvents(
    {
      sourceType: event.type,
      toolCallId: event.tool_id,
      toolName: event.tool_name,
      input: event.arguments,
    },
    context,
  );
}

export function buildToolEndEvents(
  event: AgentEventToolEnd,
  context: AgentUiProjectionContext,
): AgentUiProjectionEvent[] {
  return buildAgentUiToolEndEvents(
    {
      sourceType: event.type,
      toolCallId: event.tool_id,
      result: event.result,
    },
    context,
  );
}

export function buildToolProgressEvent(
  event: AgentEventToolProgress,
  context: AgentUiProjectionContext,
): AgentUiProjectionEvent {
  return buildAgentUiToolProgressEvent(
    {
      sourceType: event.type,
      toolCallId: event.tool_id,
      progress: event.progress,
    },
    context,
  );
}

export function buildToolOutputDeltaEvent(
  event: AgentEventToolOutputDelta,
  context: AgentUiProjectionContext,
): AgentUiProjectionEvent {
  return buildAgentUiToolOutputDeltaEvent(
    {
      sourceType: event.type,
      toolCallId: event.tool_id,
      delta: event.delta,
      outputKind: event.output_kind,
      metadata: event.metadata,
    },
    context,
  );
}

export function buildToolInputDeltaEvent(
  event: AgentEventToolInputDelta,
  context: AgentUiProjectionContext,
): AgentUiProjectionEvent {
  return buildAgentUiToolInputDeltaEvent(
    {
      sourceType: event.type,
      toolCallId: event.tool_id,
      toolName: event.tool_name,
      delta: event.delta,
      accumulatedInput: event.accumulated_arguments,
      provider: event.provider,
    },
    context,
  );
}
