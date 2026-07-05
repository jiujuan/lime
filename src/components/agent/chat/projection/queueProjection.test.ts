import { describe, expect, it } from "vitest";
import { buildQueueProjectionEvents } from "./queueProjection";

const baseContext = {
  sessionId: "session-queue",
  timestamp: "2026-06-07T00:00:00.000Z",
};

describe("queueProjection", () => {
  it("应由 queue owner 统一分发 queue_added", () => {
    const events = buildQueueProjectionEvents(
      {
        type: "queue_added",
        session_id: "session-queue",
        queued_turn: {
          queued_turn_id: "queued-1",
          message_preview: "下一轮",
          message_text: "下一轮",
          created_at: 0,
          image_count: 0,
          position: 1,
        },
      },
      baseContext,
    );

    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      type: "queue.changed",
      sourceType: "queue_added",
      sessionId: "session-queue",
      taskId: "queued-1",
      owner: "task",
      scope: "task",
      phase: "waiting",
      surface: "task_capsule",
      persistence: "snapshot",
      control: "queue",
      runtimeStatus: "queued",
      queuedTurnCount: 1,
      payload: {
        queueEvent: "queue_added",
        queuedTurnId: "queued-1",
        position: 1,
        messagePreview: "下一轮",
        imageCount: 0,
        createdAt: 0,
      },
    });
    expect(events[1]).toMatchObject({
      type: "task.changed",
      sourceType: "queue_added",
      taskId: "queued-1",
      owner: "task",
      scope: "turn",
      phase: "submitted",
      control: "steer",
      payload: {
        taskEvent: "steer_intent",
        intentKind: "queued_user_input",
        queuedTurnId: "queued-1",
        messageLength: 3,
      },
    });
  });

  it("应由 queue owner 统一分发 queue_cleared", () => {
    const events = buildQueueProjectionEvents(
      {
        type: "queue_cleared",
        session_id: "session-queue",
        queued_turn_ids: ["queued-1", "queued-2"],
      },
      baseContext,
    );

    expect(events).toHaveLength(3);
    expect(events[0]).toMatchObject({
      type: "queue.changed",
      sourceType: "queue_cleared",
      sessionId: "session-queue",
      owner: "task",
      scope: "task",
      phase: "waiting",
      queuedTurnCount: 2,
      payload: {
        queueEvent: "queue_cleared",
      },
    });
    expect(events[1]).toMatchObject({
      type: "task.changed",
      taskId: "queued-1",
      payload: {
        taskEvent: "steer_removed",
        intentKind: "queued_user_input",
        queueEvent: "queue_cleared",
        queuedTurnId: "queued-1",
      },
    });
    expect(events[2]).toMatchObject({
      type: "task.changed",
      taskId: "queued-2",
      payload: {
        queuedTurnId: "queued-2",
      },
    });
  });
});
