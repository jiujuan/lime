import type {
  AgentUiProjectionContext,
  AgentUiProjectionEvent,
  AgentUiProjectionSourceType,
} from "@limecloud/agent-ui-contracts";

import { buildAgentUiProjectionBase } from "./envelope.js";
import {
  buildAgentUiPlanApprovalRequiredEvent,
  buildAgentUiPlanApprovalResolvedEvent,
  extractAgentUiPlanApprovalProjection,
  extractAgentUiPlanApprovalResponseProjection,
} from "./planApproval.js";
import { metadataKeys, truncateText } from "./normalization.js";
import { extractArtifactRefs } from "./refs.js";

export interface AgentUiToolStartProjectionInput {
  sourceType?: AgentUiProjectionSourceType | string;
  toolCallId: string;
  toolName: string;
  input?: string | null;
}

export interface AgentUiToolExecutionResultProjectionInput {
  success?: boolean;
  output?: string | null;
  error?: string | null;
  images?: readonly unknown[] | null;
  metadata?: unknown;
}

export interface AgentUiToolEndProjectionInput {
  sourceType?: AgentUiProjectionSourceType | string;
  toolCallId: string;
  result: AgentUiToolExecutionResultProjectionInput;
}

export interface AgentUiToolProgressProjectionPayload {
  message?: string | null;
  progress?: number;
  total?: number;
  metadata?: unknown;
}

export interface AgentUiToolProgressProjectionInput {
  sourceType?: AgentUiProjectionSourceType | string;
  toolCallId: string;
  progress: AgentUiToolProgressProjectionPayload;
}

export interface AgentUiToolOutputDeltaProjectionInput {
  sourceType?: AgentUiProjectionSourceType | string;
  toolCallId: string;
  delta: string;
  outputKind?: string | null;
  metadata?: unknown;
}

export interface AgentUiToolInputDeltaProjectionInput {
  sourceType?: AgentUiProjectionSourceType | string;
  toolCallId: string;
  toolName?: string | null;
  delta: string;
  accumulatedInput?: string | null;
  provider?: string | null;
}

export function buildAgentUiToolStartEvents(
  input: AgentUiToolStartProjectionInput,
  context: AgentUiProjectionContext = {},
): AgentUiProjectionEvent[] {
  const base = buildAgentUiProjectionBase(
    { sourceType: input.sourceType ?? "tool_start" },
    context,
  );
  const inputSummary = truncateText(input.input);
  const inputAvailable = Boolean(inputSummary);
  const shared = {
    ...base,
    toolCallId: input.toolCallId,
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
        toolName: input.toolName,
      },
    },
    {
      ...shared,
      type: "tool.args",
      payload: {
        toolName: input.toolName,
        inputAvailable,
        inputSummary,
        inputLength: input.input?.length ?? 0,
      },
    },
  ];
}

export function buildAgentUiToolEndEvent(
  input: AgentUiToolEndProjectionInput,
  context: AgentUiProjectionContext = {},
): AgentUiProjectionEvent {
  const success = input.result.success !== false;
  const metadataKeyList = metadataKeys(input.result.metadata);
  const refs = extractArtifactRefs(input.result.metadata);
  return {
    ...buildAgentUiProjectionBase(
      { sourceType: input.sourceType ?? "tool_end" },
      context,
    ),
    type: success ? "tool.result" : "tool.failed",
    toolCallId: input.toolCallId,
    owner: "tool",
    scope: "tool_call",
    phase: success ? "completed" : "failed",
    surface: "tool_ui",
    persistence: "archive",
    payload: {
      success,
      outputPreview: truncateText(input.result.output),
      errorPreview: truncateText(input.result.error),
      outputLength: input.result.output?.length ?? 0,
      hasImages: Boolean(input.result.images?.length),
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

export function buildAgentUiToolEndEvents(
  input: AgentUiToolEndProjectionInput,
  context: AgentUiProjectionContext = {},
): AgentUiProjectionEvent[] {
  const base = buildAgentUiProjectionBase(
    { sourceType: input.sourceType ?? "tool_end" },
    context,
  );
  const events = [buildAgentUiToolEndEvent(input, context)];
  const planApproval = extractAgentUiPlanApprovalProjection(
    input.result.metadata,
  );
  const planApprovalResponse = extractAgentUiPlanApprovalResponseProjection(
    input.result.metadata,
  );

  if (planApproval) {
    events.push(
      buildAgentUiPlanApprovalRequiredEvent({
        base,
        projection: planApproval,
        persistence: "snapshot",
        toolCallId: input.toolCallId,
      }),
    );
  }

  if (planApprovalResponse) {
    events.push(
      buildAgentUiPlanApprovalResolvedEvent({
        base,
        projection: planApprovalResponse,
        persistence: "snapshot",
        toolCallId: input.toolCallId,
      }),
    );
  }

  return events;
}

export function buildAgentUiToolProgressEvent(
  input: AgentUiToolProgressProjectionInput,
  context: AgentUiProjectionContext = {},
): AgentUiProjectionEvent {
  const metadataKeyList = metadataKeys(input.progress.metadata);
  return {
    ...buildAgentUiProjectionBase(
      { sourceType: input.sourceType ?? "tool_progress" },
      context,
    ),
    type: "tool.progress",
    toolCallId: input.toolCallId,
    owner: "tool",
    scope: "tool_call",
    phase: "acting",
    surface: "tool_ui",
    persistence: "ephemeral_live",
    payload: {
      messagePreview: truncateText(input.progress.message),
      progress: input.progress.progress,
      total: input.progress.total,
      metadataKeys: metadataKeyList,
    },
    refs:
      metadataKeyList.length > 0
        ? { diagnosticKeys: metadataKeyList }
        : undefined,
  };
}

export function buildAgentUiToolOutputDeltaEvent(
  input: AgentUiToolOutputDeltaProjectionInput,
  context: AgentUiProjectionContext = {},
): AgentUiProjectionEvent {
  const metadataKeyList = metadataKeys(input.metadata);
  return {
    ...buildAgentUiProjectionBase(
      { sourceType: input.sourceType ?? "tool_output_delta" },
      context,
    ),
    type: "tool.output.delta",
    toolCallId: input.toolCallId,
    owner: "tool",
    scope: "tool_call",
    phase: "acting",
    surface: "tool_ui",
    persistence: "ephemeral_live",
    payload: {
      outputKind: input.outputKind,
      deltaPreview: truncateText(input.delta),
      deltaLength: input.delta.length,
      metadataKeys: metadataKeyList,
    },
    refs:
      metadataKeyList.length > 0
        ? { diagnosticKeys: metadataKeyList }
        : undefined,
  };
}

export function buildAgentUiToolInputDeltaEvent(
  input: AgentUiToolInputDeltaProjectionInput,
  context: AgentUiProjectionContext = {},
): AgentUiProjectionEvent {
  return {
    ...buildAgentUiProjectionBase(
      { sourceType: input.sourceType ?? "tool_input_delta" },
      context,
    ),
    type: "tool.args.delta",
    toolCallId: input.toolCallId,
    owner: "tool",
    scope: "tool_call",
    phase: "acting",
    surface: "tool_ui",
    persistence: "ephemeral_live",
    payload: {
      toolName: input.toolName,
      provider: input.provider,
      inputStreaming: true,
      deltaPreview: truncateText(input.delta),
      deltaLength: input.delta.length,
      accumulatedInputLength: input.accumulatedInput?.length ?? 0,
      accumulatedInputPreview: truncateText(input.accumulatedInput),
    },
  };
}
