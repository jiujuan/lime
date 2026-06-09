import type {
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
  extractArtifactRefs,
  metadataKeys,
  truncateText,
} from "@limecloud/agent-runtime-projection";
import {
  buildPlanApprovalRequiredEvent,
  buildPlanApprovalResolvedEvent,
  extractPlanApprovalProjection,
  extractPlanApprovalResponseProjection,
} from "./planApprovalProjection";
import { buildAgentUiProjectionBase as buildBase } from "./projectionBase";

export function buildToolStartEvents(
  event: AgentEventToolStart,
  context: AgentUiProjectionContext,
): AgentUiProjectionEvent[] {
  const base = buildBase(event, context);
  const inputSummary = truncateText(event.arguments);
  const inputAvailable = Boolean(inputSummary);
  const shared = {
    ...base,
    toolCallId: event.tool_id,
    owner: "tool" as const,
    scope: "tool_call" as const,
    phase: "acting" as const,
    surface: "tool_ui" as const,
    persistence: "ephemeral_live" as const,
  };

  return [
    {
      ...shared,
      type: "tool.started",
      payload: {
        toolName: event.tool_name,
      },
    },
    {
      ...shared,
      type: "tool.args",
      payload: {
        toolName: event.tool_name,
        inputAvailable,
        inputSummary,
        inputLength: event.arguments?.length ?? 0,
      },
    },
  ];
}

function buildToolEndEvent(
  event: AgentEventToolEnd,
  context: AgentUiProjectionContext,
): AgentUiProjectionEvent {
  const success = event.result.success !== false;
  const metadataKeyList = metadataKeys(event.result.metadata);
  const refs = extractArtifactRefs(event.result.metadata);
  return {
    ...buildBase(event, context),
    type: success ? "tool.result" : "tool.failed",
    toolCallId: event.tool_id,
    owner: "tool",
    scope: "tool_call",
    phase: success ? "completed" : "failed",
    surface: "tool_ui",
    persistence: "archive",
    payload: {
      success,
      outputPreview: truncateText(event.result.output),
      errorPreview: truncateText(event.result.error),
      outputLength: event.result.output?.length ?? 0,
      hasImages: Boolean(event.result.images?.length),
      metadataKeys: metadataKeyList,
    },
    refs: {
      ...refs,
      ...(metadataKeyList.length > 0
        ? { diagnosticKeys: metadataKeyList }
        : {}),
    },
  };
}

export function buildToolEndEvents(
  event: AgentEventToolEnd,
  context: AgentUiProjectionContext,
): AgentUiProjectionEvent[] {
  const resultEvent = buildToolEndEvent(event, context);
  const planApproval = extractPlanApprovalProjection(event.result.metadata);
  const planApprovalResponse = extractPlanApprovalResponseProjection(
    event.result.metadata,
  );
  const events = [resultEvent];

  if (planApproval) {
    events.push(
      buildPlanApprovalRequiredEvent({
        base: buildBase(event, context),
        projection: planApproval,
        persistence: "snapshot",
        toolCallId: event.tool_id,
      }),
    );
  }

  if (planApprovalResponse) {
    events.push(
      buildPlanApprovalResolvedEvent({
        base: buildBase(event, context),
        projection: planApprovalResponse,
        persistence: "snapshot",
        toolCallId: event.tool_id,
      }),
    );
  }

  return events;
}

export function buildToolProgressEvent(
  event: AgentEventToolProgress,
  context: AgentUiProjectionContext,
): AgentUiProjectionEvent {
  const metadataKeyList = metadataKeys(event.progress.metadata);
  return {
    ...buildBase(event, context),
    type: "tool.progress",
    toolCallId: event.tool_id,
    owner: "tool",
    scope: "tool_call",
    phase: "acting",
    surface: "tool_ui",
    persistence: "ephemeral_live",
    payload: {
      messagePreview: truncateText(event.progress.message),
      progress: event.progress.progress,
      total: event.progress.total,
      metadataKeys: metadataKeyList,
    },
    refs:
      metadataKeyList.length > 0
        ? { diagnosticKeys: metadataKeyList }
        : undefined,
  };
}

export function buildToolOutputDeltaEvent(
  event: AgentEventToolOutputDelta,
  context: AgentUiProjectionContext,
): AgentUiProjectionEvent {
  const metadataKeyList = metadataKeys(event.metadata);
  return {
    ...buildBase(event, context),
    type: "tool.output.delta",
    toolCallId: event.tool_id,
    owner: "tool",
    scope: "tool_call",
    phase: "acting",
    surface: "tool_ui",
    persistence: "ephemeral_live",
    payload: {
      outputKind: event.output_kind,
      deltaPreview: truncateText(event.delta),
      deltaLength: event.delta.length,
      metadataKeys: metadataKeyList,
    },
    refs:
      metadataKeyList.length > 0
        ? { diagnosticKeys: metadataKeyList }
        : undefined,
  };
}

export function buildToolInputDeltaEvent(
  event: AgentEventToolInputDelta,
  context: AgentUiProjectionContext,
): AgentUiProjectionEvent {
  return {
    ...buildBase(event, context),
    type: "tool.args.delta",
    toolCallId: event.tool_id,
    owner: "tool",
    scope: "tool_call",
    phase: "acting",
    surface: "tool_ui",
    persistence: "ephemeral_live",
    payload: {
      toolName: event.tool_name,
      provider: event.provider,
      inputStreaming: true,
      deltaPreview: truncateText(event.delta),
      deltaLength: event.delta.length,
      accumulatedInputLength: event.accumulated_arguments?.length ?? 0,
      accumulatedInputPreview: truncateText(event.accumulated_arguments),
    },
  };
}
