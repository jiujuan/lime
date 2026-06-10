import type {
  AgentUiProjectionContext,
  AgentUiProjectionEvent,
  AgentUiProjectionSourceType,
} from "@limecloud/agent-ui-contracts";

import { buildAgentUiProjectionBase } from "./envelope.js";
import { truncateText } from "./normalization.js";

export interface AgentUiWarningProjectionInput {
  sourceType?: AgentUiProjectionSourceType | string;
  code?: string | null;
  message: string;
}

export interface AgentUiCostStateProjectionInput {
  status?: string | null;
  estimatedCostClass?: string | null;
  estimatedTotalCost?: number | null;
  currency?: string | null;
  totalTokens?: number | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  cachedInputTokens?: number | null;
  cacheCreationInputTokens?: number | null;
}

export interface AgentUiCostMetricProjectionInput {
  sourceType?: AgentUiProjectionSourceType | string;
  metricEvent: string;
  costState: AgentUiCostStateProjectionInput;
}

export function buildAgentUiWarningEvent(
  input: AgentUiWarningProjectionInput,
  context: AgentUiProjectionContext = {},
): AgentUiProjectionEvent {
  return {
    ...buildAgentUiProjectionBase(
      { sourceType: input.sourceType ?? "warning" },
      context,
    ),
    type: "diagnostic.changed",
    owner: "diagnostics",
    scope: "run",
    phase: "acting",
    surface: "diagnostics",
    persistence: "diagnostics_log",
    payload: {
      code: input.code ?? undefined,
      messagePreview: truncateText(input.message),
    },
  };
}

export function buildAgentUiCostMetricEvent(
  input: AgentUiCostMetricProjectionInput,
  context: AgentUiProjectionContext = {},
): AgentUiProjectionEvent {
  return {
    ...buildAgentUiProjectionBase(
      { sourceType: input.sourceType ?? input.metricEvent },
      context,
    ),
    type: "metric.changed",
    owner: "diagnostics",
    scope: "run",
    phase: "acting",
    surface: "diagnostics",
    persistence: "diagnostics_log",
    payload: {
      metricEvent: input.metricEvent,
      status: input.costState.status ?? undefined,
      estimatedCostClass: input.costState.estimatedCostClass ?? undefined,
      estimatedTotalCost: input.costState.estimatedTotalCost ?? undefined,
      currency: input.costState.currency ?? undefined,
      totalTokens: input.costState.totalTokens ?? undefined,
      inputTokens: input.costState.inputTokens ?? undefined,
      outputTokens: input.costState.outputTokens ?? undefined,
      cachedInputTokens: input.costState.cachedInputTokens ?? undefined,
      cacheCreationInputTokens:
        input.costState.cacheCreationInputTokens ?? undefined,
    },
  };
}
