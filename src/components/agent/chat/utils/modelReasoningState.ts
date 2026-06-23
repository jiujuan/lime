import type { AgentEvent, AgentThreadItem } from "@/lib/api/agentProtocol";

export type ReasoningLevel =
  | "none"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "max"
  | "xhigh";

export interface AgentModelRef {
  providerId: string;
  modelId: string;
  variant?: string;
}

export interface AgentReasoningRunSummary {
  supported: boolean;
  requestedLevel?: ReasoningLevel;
  effectiveLevel?: ReasoningLevel;
  downgradeReason?: string;
  status?: "idle" | "running" | "completed" | "canceled" | "failed";
  reasoningId?: string;
  text?: string;
}

export interface AgentModelReasoningState {
  model?: AgentModelRef;
  reasoning: AgentReasoningRunSummary;
}

type ReasoningEvent = Extract<
  AgentEvent,
  {
    type:
      | "reasoning_started"
      | "reasoning_delta"
      | "reasoning_final"
      | "reasoning_ended";
  }
>;

const EMPTY_MODEL_REASONING_STATE: AgentModelReasoningState = {
  reasoning: {
    supported: false,
    status: "idle",
  },
};

function isMeaningfulModelRef(
  model: AgentModelRef | undefined,
): model is AgentModelRef {
  return Boolean(model?.providerId || model?.modelId);
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readString(record: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function appendTextWithOverlap(base: string, delta: string): string {
  if (!base) {
    return delta;
  }
  if (!delta || base.endsWith(delta)) {
    return base;
  }
  if (delta.startsWith(base)) {
    return delta;
  }

  const maxOverlap = Math.min(base.length, delta.length);
  for (let overlap = maxOverlap; overlap > 0; overlap -= 1) {
    if (base.endsWith(delta.slice(0, overlap))) {
      return `${base}${delta.slice(overlap)}`;
    }
  }
  return `${base}${delta}`;
}

function normalizeReasoningLevel(value: unknown): ReasoningLevel | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim().toLowerCase().replace(/[-\s]+/g, "_");
  if (
    normalized === "none" ||
    normalized === "minimal" ||
    normalized === "low" ||
    normalized === "medium" ||
    normalized === "high" ||
    normalized === "max" ||
    normalized === "xhigh"
  ) {
    return normalized;
  }
  if (normalized === "x_high") {
    return "xhigh";
  }
  return undefined;
}

export function buildModelReasoningState(
  payload: unknown,
): AgentModelReasoningState {
  const record = readRecord(payload) ?? {};
  const modelRecord =
    readRecord(record.modelRef) ?? readRecord(record.model) ?? record;
  const providerId = readString(
    modelRecord,
    "providerId",
    "provider_id",
    "provider",
  );
  const modelId = readString(
    modelRecord,
    "modelId",
    "model_id",
    "modelName",
    "model_name",
    "model",
  );
  const variant = readString(
    modelRecord,
    "variant",
    "modelVariant",
    "model_variant",
  );
  const reasoningRecord = readRecord(record.reasoning) ?? record;
  const supported =
    typeof reasoningRecord.supported === "boolean"
      ? reasoningRecord.supported
      : Boolean(
          normalizeReasoningLevel(
            reasoningRecord.effectiveLevel ?? reasoningRecord.effective_level,
          ),
        );

  return {
    model:
      providerId || modelId
        ? {
            providerId,
            modelId,
            ...(variant ? { variant } : {}),
          }
        : undefined,
    reasoning: {
      supported,
      requestedLevel: normalizeReasoningLevel(
        reasoningRecord.requestedLevel ??
          reasoningRecord.requested_level ??
          record.requestedReasoningEffort ??
          record.requested_reasoning_effort,
      ),
      effectiveLevel: normalizeReasoningLevel(
        reasoningRecord.effectiveLevel ?? reasoningRecord.effective_level,
      ),
      downgradeReason: readString(
        reasoningRecord,
        "downgradeReason",
        "downgrade_reason",
      ) || undefined,
    },
  };
}

export function hydrateAgentReasoningStateFromThreadItems(
  threadItems: readonly AgentThreadItem[] | undefined,
): AgentModelReasoningState {
  const latestReasoning = [...(threadItems ?? [])]
    .reverse()
    .find(
      (item): item is Extract<AgentThreadItem, { type: "reasoning" }> =>
        item.type === "reasoning",
    );
  if (!latestReasoning) {
    return {
      ...EMPTY_MODEL_REASONING_STATE,
      reasoning: { ...EMPTY_MODEL_REASONING_STATE.reasoning },
    };
  }
  return {
    reasoning: {
      supported: true,
      status:
        latestReasoning.status === "in_progress"
          ? "running"
          : latestReasoning.status === "failed"
            ? "failed"
            : "completed",
      reasoningId: latestReasoning.id,
      text: latestReasoning.text.trim(),
    },
  };
}

function applyReasoningEvent(
  state: AgentModelReasoningState,
  event: ReasoningEvent,
): AgentModelReasoningState {
  switch (event.type) {
    case "reasoning_started":
      return {
        ...state,
        reasoning: {
          ...state.reasoning,
          supported: true,
          status: "running",
          reasoningId: event.reasoningId || state.reasoning.reasoningId,
        },
      };
    case "reasoning_delta": {
      const delta = event.text || event.delta || "";
      return {
        ...state,
        reasoning: {
          ...state.reasoning,
          supported: true,
          status: "running",
          reasoningId: event.reasoningId || state.reasoning.reasoningId,
          text: appendTextWithOverlap(state.reasoning.text || "", delta),
        },
      };
    }
    case "reasoning_final":
      return {
        ...state,
        reasoning: {
          ...state.reasoning,
          supported: true,
          status: "completed",
          reasoningId: event.reasoningId || state.reasoning.reasoningId,
          text: event.text || state.reasoning.text,
        },
      };
    case "reasoning_ended":
      return {
        ...state,
        reasoning: {
          ...state.reasoning,
          supported: true,
          status:
            event.status === "canceled" || event.status === "cancelled"
              ? "canceled"
              : event.status === "failed"
                ? "failed"
                : "completed",
          reasoningId: event.reasoningId || state.reasoning.reasoningId,
        },
      };
  }
}

export function hydrateAgentReasoningState(params: {
  threadItems?: readonly AgentThreadItem[];
  events?: readonly AgentEvent[];
}): AgentModelReasoningState {
  let state = hydrateAgentReasoningStateFromThreadItems(params.threadItems);
  for (const event of params.events ?? []) {
    if (event.type === "model_effective") {
      const next = buildModelReasoningState({
        model: event.model,
        modelRef: event.modelRef,
        provider: event.provider,
        modelName: event.modelName,
        reasoning: event.reasoning,
        requestedReasoningEffort: event.requestedReasoningEffort,
      });
      state = {
        model: isMeaningfulModelRef(next.model) ? next.model : state.model,
        reasoning: {
          ...state.reasoning,
          ...next.reasoning,
          status:
            state.reasoning.status && state.reasoning.status !== "idle"
              ? state.reasoning.status
              : (next.reasoning.status ?? state.reasoning.status),
          reasoningId: state.reasoning.reasoningId,
          text: state.reasoning.text,
        },
      };
      continue;
    }
    if (
      event.type === "reasoning_started" ||
      event.type === "reasoning_delta" ||
      event.type === "reasoning_final" ||
      event.type === "reasoning_ended"
    ) {
      state = applyReasoningEvent(state, event);
    }
  }
  return state;
}
