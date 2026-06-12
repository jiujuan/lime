import test from "node:test";
import assert from "node:assert/strict";

import {
  buildAgentUiSubagentsModel,
  projectAgentUiState,
  projectAppServerEventsToExecutionEvents,
  runtimeStatusForEvents,
} from "../dist/index.js";

function event(overrides) {
  return {
    id: overrides.id,
    kind: overrides.kind ?? "handoff",
    status: overrides.status ?? "running",
    eventClass: overrides.eventClass,
    title: overrides.title ?? overrides.eventClass,
    threadId: "thread-parent",
    subagentId: overrides.subagentId ?? "subagent-1",
    sequence: overrides.sequence ?? 1,
    createdAt: overrides.createdAt ?? "2026-06-12T00:00:00.000Z",
    ...overrides,
  };
}

test("subagents model treats failed and closed workers as inactive terminal threads", () => {
  const model = buildAgentUiSubagentsModel([
    event({
      id: "evt-spawned",
      eventClass: "agent.spawned",
      status: "running",
      sequence: 1,
    }),
    event({
      id: "evt-failed",
      eventClass: "subagent.failed",
      status: "failed",
      sequence: 2,
      completedAt: "2026-06-12T00:00:02.000Z",
      payload: {
        summary: "检索失败",
      },
    }),
    event({
      id: "evt-closed",
      eventClass: "subagent.closed",
      status: "closed",
      sequence: 3,
      subagentId: "subagent-2",
      completedAt: "2026-06-12T00:00:03.000Z",
    }),
  ]);

  assert.deepEqual(model.activeThreadIds, []);
  assert.deepEqual(model.completedThreadIds, []);
  assert.deepEqual(model.failedThreadIds, ["subagent-1", "subagent-2"]);
  assert.equal(model.threads[0].completedAt, "2026-06-12T00:00:02.000Z");
  assert.equal(model.threads[1].completedAt, "2026-06-12T00:00:03.000Z");
  assert.equal(model.activities.at(-1).kind, "updated");
});

test("runtime status resolves action cancellation before blocked status", () => {
  const executionEvents = [
    event({
      id: "evt-action-required",
      kind: "action",
      eventClass: "action.required",
      status: "blocked",
      actionId: "action-1",
      subagentId: undefined,
      sequence: 1,
    }),
    event({
      id: "evt-action-cancelled",
      kind: "action",
      eventClass: "action.cancelled",
      status: "failed",
      actionId: "action-1",
      subagentId: undefined,
      sequence: 2,
    }),
    event({
      id: "evt-turn-completed",
      kind: "state",
      eventClass: "turn.completed",
      status: "completed",
      subagentId: undefined,
      sequence: 3,
    }),
  ];
  const state = projectAgentUiState({
    executionEvents,
  });

  assert.equal(state.runtime.status, "completed");
  assert.equal(runtimeStatusForEvents(executionEvents).status, "completed");
});

test("App Server facts normalize cancelled and closed event statuses as terminal", () => {
  const executionEvents = projectAppServerEventsToExecutionEvents([
    {
      eventId: "evt-subagent-closed",
      sequence: 1,
      sessionId: "session-1",
      threadId: "thread-parent",
      type: "subagent.status",
      timestamp: "2026-06-12T00:00:00.000Z",
      payload: {
        subagentId: "subagent-closed",
        status: "closed",
        title: "Worker closed",
      },
    },
    {
      eventId: "evt-task-cancelled",
      sequence: 2,
      sessionId: "session-1",
      threadId: "thread-parent",
      type: "task.updated",
      timestamp: "2026-06-12T00:00:01.000Z",
      payload: {
        taskId: "task-1",
        status: "cancelled",
        title: "Task cancelled",
      },
    },
    {
      eventId: "evt-action-expired",
      sequence: 3,
      sessionId: "session-1",
      threadId: "thread-parent",
      type: "action.expired",
      timestamp: "2026-06-12T00:00:02.000Z",
      payload: {
        requestId: "action-1",
        status: "expired",
        title: "Action expired",
      },
    },
  ]);

  assert.deepEqual(
    executionEvents.map((item) => [item.eventClass, item.status]),
    [
      ["subagent.status", "failed"],
      ["task.updated", "failed"],
      ["action.expired", "failed"],
    ],
  );
});
