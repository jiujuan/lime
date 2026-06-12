import type {
  AgentRuntimeExecutionEvent,
  AgentUiRuntimeStatusView,
} from "@limecloud/agent-ui-contracts";
import {
  normalizeRuntimeTurnTerminalEventClass,
  runtimeTurnTerminalProjectionFromStatus,
} from "@limecloud/agent-ui-contracts";

type RuntimeStatusCandidate = {
  candidateId: string;
  actionId?: string;
  eventId: string;
  status: AgentUiRuntimeStatusView["status"];
};

function resolvedFromEventId(
  event: AgentRuntimeExecutionEvent,
): string | undefined {
  const value = event.payload?.resolvedFromEventId;
  return typeof value === "string" && value ? value : undefined;
}

function normalizedStatus(value?: string): string {
  return (value ?? "").trim().toLowerCase();
}

function isFailedRuntimeEvent(event: AgentRuntimeExecutionEvent): boolean {
  const status = normalizedStatus(event.status);
  const eventClass = event.eventClass ?? "";
  return (
    status === "failed" ||
    runtimeTurnTerminalProjectionFromStatus(status)?.kind === "failed" ||
    normalizeRuntimeTurnTerminalEventClass(eventClass) === "turn.failed" ||
    eventClass.endsWith(".failed") ||
    eventClass === "runtime.error"
  );
}

function isCanceledRuntimeEvent(event: AgentRuntimeExecutionEvent): boolean {
  const status = normalizedStatus(event.status);
  const eventClass = event.eventClass ?? "";
  return (
    status === "canceled" ||
    runtimeTurnTerminalProjectionFromStatus(status)?.kind === "canceled" ||
    normalizeRuntimeTurnTerminalEventClass(eventClass) === "turn.canceled"
  );
}

function isCompletedRuntimeEvent(event: AgentRuntimeExecutionEvent): boolean {
  const status = normalizedStatus(event.status);
  const eventClass = event.eventClass ?? "";
  return (
    status === "completed" ||
    runtimeTurnTerminalProjectionFromStatus(status)?.kind === "completed" ||
    normalizeRuntimeTurnTerminalEventClass(eventClass) === "turn.completed" ||
    eventClass.endsWith(".completed") ||
    eventClass.endsWith(".resolved") ||
    eventClass.endsWith(".result") ||
    eventClass.endsWith(".changed") ||
    eventClass === "snapshot.updated"
  );
}

function isResolvedActionEventClass(eventClass?: string): boolean {
  return (
    eventClass === "action.resolved" ||
    eventClass === "action.cancelled" ||
    eventClass === "action.canceled" ||
    eventClass === "action.expired"
  );
}

export function runtimeStatusForEvents(
  events: AgentRuntimeExecutionEvent[],
): AgentUiRuntimeStatusView {
  const latest = events.length ? events[events.length - 1] : undefined;
  const resolvedActionIds = new Set<string>();
  let status: AgentUiRuntimeStatusView["status"] = "idle";
  // 从最新事件倒序解析运行态，避免已处理 action 继续把 runtime 锁在 waiting。
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (isResolvedActionEventClass(event.eventClass) && event.actionId) {
      resolvedActionIds.add(event.actionId);
      continue;
    }
    if (isCanceledRuntimeEvent(event)) {
      status = "canceled";
      break;
    }
    if (isFailedRuntimeEvent(event)) {
      status = "failed";
      break;
    }
    if (
      event.eventClass === "action.required" &&
      (!event.actionId || !resolvedActionIds.has(event.actionId))
    ) {
      status = "waiting";
      break;
    }
    if (
      event.status === "pending" &&
      (!event.actionId || !resolvedActionIds.has(event.actionId))
    ) {
      status = "waiting";
      break;
    }
    if (event.status === "blocked") {
      status = "blocked";
      break;
    }
    if (isCompletedRuntimeEvent(event)) {
      status = "completed";
      break;
    }
    if (
      event.status === "running" ||
      event.eventClass === "turn.started" ||
      event.eventClass === "model.delta"
    ) {
      status = "running";
      break;
    }
  }
  return {
    status,
    activeTurnId: latest?.turnId,
    activeRunId: latest?.runId,
    activeTaskId: latest?.taskId,
    latestEventId: latest?.id,
    latestSequence: latest?.sequence,
  };
}

export function createRuntimeStatusAccumulator() {
  const candidates: RuntimeStatusCandidate[] = [];
  const removedCandidateIds = new Set<string>();
  const resolvedActionIds = new Set<string>();
  const resolvedEventIds = new Set<string>();
  let latest: AgentRuntimeExecutionEvent | undefined;
  let status: AgentUiRuntimeStatusView["status"] = "idle";
  let view = buildView();

  function pushCandidate(
    event: AgentRuntimeExecutionEvent,
    nextStatus: AgentUiRuntimeStatusView["status"],
  ): void {
    candidates.push({
      candidateId: event.id,
      actionId: event.actionId,
      eventId: event.id,
      status: nextStatus,
    });
  }

  function removeResolvedCandidates(event: AgentRuntimeExecutionEvent): void {
    if (event.actionId) {
      resolvedActionIds.add(event.actionId);
    }
    const sourceEventId = resolvedFromEventId(event);
    if (sourceEventId) {
      resolvedEventIds.add(sourceEventId);
    }
    for (const candidate of candidates) {
      if (
        (event.actionId && candidate.actionId === event.actionId) ||
        (sourceEventId && candidate.eventId === sourceEventId)
      ) {
        removedCandidateIds.add(candidate.candidateId);
      }
    }
  }

  function trimInactiveCandidates(): void {
    while (
      candidates.length > 0 &&
      removedCandidateIds.has(candidates[candidates.length - 1].candidateId)
    ) {
      const removed = candidates.pop();
      if (removed) removedCandidateIds.delete(removed.candidateId);
    }
  }

  function isResolvedActionEvent(event: AgentRuntimeExecutionEvent): boolean {
    return Boolean(
      (event.actionId && resolvedActionIds.has(event.actionId)) ||
      resolvedEventIds.has(event.id),
    );
  }

  function buildView(): AgentUiRuntimeStatusView {
    return {
      status,
      activeTurnId: latest?.turnId,
      activeRunId: latest?.runId,
      activeTaskId: latest?.taskId,
      latestEventId: latest?.id,
      latestSequence: latest?.sequence,
    };
  }

  function refreshView(): AgentUiRuntimeStatusView {
    trimInactiveCandidates();
    status = candidates[candidates.length - 1]?.status ?? "idle";
    view = buildView();
    return view;
  }

  return {
    apply(event: AgentRuntimeExecutionEvent): AgentUiRuntimeStatusView {
      latest = event;
      if (isResolvedActionEventClass(event.eventClass)) {
        removeResolvedCandidates(event);
        return refreshView();
      }
      if (isCanceledRuntimeEvent(event)) {
        pushCandidate(event, "canceled");
      } else if (isFailedRuntimeEvent(event)) {
        pushCandidate(event, "failed");
      } else if (
        event.eventClass === "action.required" &&
        !isResolvedActionEvent(event)
      ) {
        pushCandidate(event, "waiting");
      } else if (event.status === "pending" && !isResolvedActionEvent(event)) {
        pushCandidate(event, "waiting");
      } else if (event.status === "blocked") {
        pushCandidate(event, "blocked");
      } else if (isCompletedRuntimeEvent(event)) {
        pushCandidate(event, "completed");
      } else if (
        event.status === "running" ||
        event.eventClass === "turn.started" ||
        event.eventClass === "model.delta"
      ) {
        pushCandidate(event, "running");
      }
      return refreshView();
    },
    getStatus(): AgentUiRuntimeStatusView {
      return view;
    },
    reset(): AgentUiRuntimeStatusView {
      candidates.length = 0;
      removedCandidateIds.clear();
      resolvedActionIds.clear();
      resolvedEventIds.clear();
      latest = undefined;
      status = "idle";
      view = buildView();
      return view;
    },
  };
}
