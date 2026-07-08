import type {
  AgentRuntimeEventClass,
  AgentRuntimeExecutionEventStatus,
  AgentRuntimePhase,
} from "./runtime";

export type AgentRuntimeTurnTerminalKind = "completed" | "failed" | "canceled";

export interface AgentRuntimeTurnTerminalProjection {
  kind: AgentRuntimeTurnTerminalKind;
  eventClass: "turn.completed" | "turn.failed" | "turn.canceled";
  status: AgentRuntimeExecutionEventStatus;
  phase: AgentRuntimePhase;
}

const COMPLETED_STATUS_VALUES = new Set(["completed"]);
const FAILED_STATUS_VALUES = new Set(["failed"]);
const CANCELED_STATUS_VALUES = new Set(["canceled"]);
const SETTLED_STATUS_VALUES = new Set(["idle"]);

export const LEGACY_RUNTIME_TURN_TERMINAL_EVENT_CLASSES = [
  "done",
  "final_done",
  "cancelled",
  "turn.done",
  "turn.final_done",
  "turn.cancelled",
] as const;

const TERMINAL_EVENT_CLASS_TO_KIND = new Map<
  string,
  AgentRuntimeTurnTerminalKind
>([
  ["turn.completed", "completed"],
  ["turn.failed", "failed"],
  ["turn.canceled", "canceled"],
]);

const LEGACY_TURN_TERMINAL_EVENT_CLASSES = new Set<string>(
  LEGACY_RUNTIME_TURN_TERMINAL_EVENT_CLASSES,
);

export function normalizeRuntimeStatusValue(
  value: string | null | undefined,
): string | undefined {
  const normalized = value?.trim().toLowerCase();
  return normalized || undefined;
}

export function runtimeTurnTerminalKindFromStatus(
  value: string | null | undefined,
): AgentRuntimeTurnTerminalKind | undefined {
  const normalized = normalizeRuntimeStatusValue(value);
  if (!normalized) return undefined;
  if (COMPLETED_STATUS_VALUES.has(normalized)) return "completed";
  if (FAILED_STATUS_VALUES.has(normalized)) return "failed";
  if (CANCELED_STATUS_VALUES.has(normalized)) return "canceled";
  return undefined;
}

export function runtimeTurnTerminalProjectionFromKind(
  kind: AgentRuntimeTurnTerminalKind,
): AgentRuntimeTurnTerminalProjection {
  if (kind === "completed") {
    return {
      kind,
      eventClass: "turn.completed",
      status: "completed",
      phase: "completed",
    };
  }
  if (kind === "failed") {
    return {
      kind,
      eventClass: "turn.failed",
      status: "failed",
      phase: "failed",
    };
  }
  return {
    kind,
    eventClass: "turn.canceled",
    status: "canceled",
    phase: "canceled",
  };
}

export function runtimeTurnTerminalProjectionFromStatus(
  value: string | null | undefined,
): AgentRuntimeTurnTerminalProjection | undefined {
  const kind = runtimeTurnTerminalKindFromStatus(value);
  return kind ? runtimeTurnTerminalProjectionFromKind(kind) : undefined;
}

export function normalizeRuntimeTurnTerminalEventClass(
  eventClass: string | null | undefined,
): AgentRuntimeEventClass | undefined {
  const normalized = eventClass?.trim().toLowerCase();
  if (!normalized) return undefined;

  const kind = TERMINAL_EVENT_CLASS_TO_KIND.get(normalized);
  return kind
    ? runtimeTurnTerminalProjectionFromKind(kind).eventClass
    : undefined;
}

export function isRuntimeTurnTerminalEventClass(
  eventClass: string | null | undefined,
): boolean {
  return Boolean(normalizeRuntimeTurnTerminalEventClass(eventClass));
}

export function isLegacyRuntimeTurnTerminalEventClass(
  eventClass: string | null | undefined,
): boolean {
  const normalized = eventClass?.trim().toLowerCase();
  return Boolean(
    normalized && LEGACY_TURN_TERMINAL_EVENT_CLASSES.has(normalized),
  );
}

export function isRuntimeTerminalStatusValue(
  value: string | null | undefined,
): boolean {
  return Boolean(runtimeTurnTerminalProjectionFromStatus(value));
}

export function isRuntimeSettledStatusValue(
  value: string | null | undefined,
): boolean {
  const normalized = normalizeRuntimeStatusValue(value);
  return (
    Boolean(runtimeTurnTerminalProjectionFromStatus(normalized)) ||
    Boolean(normalized && SETTLED_STATUS_VALUES.has(normalized))
  );
}

export function runtimeStatusForTerminalEventClass(
  eventClass: string | null | undefined,
): AgentRuntimeExecutionEventStatus | undefined {
  const normalizedEventClass =
    normalizeRuntimeTurnTerminalEventClass(eventClass);
  if (!normalizedEventClass) return undefined;
  if (normalizedEventClass === "turn.completed") return "completed";
  if (normalizedEventClass === "turn.canceled") return "canceled";
  return "failed";
}
