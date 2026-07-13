import { beforeEach, describe, expect, it } from "vitest";
import {
  APP_SERVER_METHOD_AGENT_SESSION_EVENT,
  type AppServerJsonRpcNotification,
} from "@/lib/api/appServer";
import {
  projectAgentRuntimeSequenceGateNotifications,
  resetAgentRuntimeEventSequenceGatesForTests,
} from "./eventSequenceGate";
import { projectAppServerAgentEventPayload } from "./appServerEventStream";

function rawNotification(
  type: string,
  payload: Record<string, unknown> = {
    provider: "fixture-provider",
    model: "fixture-model",
    elapsed_ms: 90,
  },
): AppServerJsonRpcNotification {
  return {
    method: APP_SERVER_METHOD_AGENT_SESSION_EVENT,
    params: {
      event: {
        eventId: `evt-${type}`,
        sequence: 1,
        sessionId: "session-provider-trace",
        threadId: "thread-provider-trace",
        turnId: "turn-provider-trace",
        type,
        timestamp: "2026-07-12T00:00:00.000Z",
        payload,
      },
    },
  };
}

function canonicalNotification(params: {
  canonicalEvent: Record<string, unknown>;
  sequence: number;
  type: string;
}): AppServerJsonRpcNotification {
  return {
    method: APP_SERVER_METHOD_AGENT_SESSION_EVENT,
    params: {
      event: {
        eventId: `evt-${params.sequence}`,
        sequence: params.sequence,
        sessionId: "session-image",
        threadId: "thread-image",
        turnId: "turn-image",
        type: params.type,
        timestamp: `2026-07-12T00:00:0${params.sequence}.000Z`,
        payload: {
          [params.canonicalEvent.method === "turn/updated" ? "turn" : "item"]:
            params.canonicalEvent.params,
        },
      },
      canonicalEvent: params.canonicalEvent,
    },
  } as AppServerJsonRpcNotification;
}

function canonicalTurnNotification(
  sequence: number,
  type: "turn.accepted" | "turn.completed",
  status: "inProgress" | "completed",
): AppServerJsonRpcNotification {
  return canonicalNotification({
    sequence,
    type,
    canonicalEvent: {
      method: "turn/updated",
      params: {
        sessionId: "session-image",
        threadId: "thread-image",
        turnId: "turn-image",
        status,
        createdAtMs: 1_783_814_400_000,
        updatedAtMs: 1_783_814_400_000 + sequence,
        completedAtMs:
          status === "completed" ? 1_783_814_400_000 + sequence : null,
      },
    },
  });
}

function canonicalToolNotification(
  sequence: number,
  type: "item.started" | "item.completed",
  status: "inProgress" | "completed",
): AppServerJsonRpcNotification {
  return canonicalNotification({
    sequence,
    type,
    canonicalEvent: {
      method: "item/updated",
      params: {
        sessionId: "session-image",
        threadId: "thread-image",
        turnId: "turn-image",
        itemId: "item-image-task",
        sequence,
        ordinal: 2,
        createdAtMs: 1_783_814_400_002,
        updatedAtMs: 1_783_814_400_000 + sequence,
        completedAtMs:
          status === "completed" ? 1_783_814_400_000 + sequence : null,
        kind: "tool",
        status,
        payload: {
          type: "tool",
          call_id: "item-image-task",
          name: "lime_create_image_generation_task",
          arguments: [{ name: "prompt", value: "青柠插画" }],
          output:
            status === "completed"
              ? {
                  text: "task created",
                  structuredContent: { task_id: "task-image" },
                }
              : null,
        },
        metadata: { source: "image_command_workflow" },
      },
    },
  });
}

function canonicalAgentMessageNotification(
  sequence: number,
  text: string,
): AppServerJsonRpcNotification {
  return canonicalNotification({
    sequence,
    type: "message.delta",
    canonicalEvent: {
      method: "item/updated",
      params: {
        sessionId: "session-image",
        threadId: "thread-image",
        turnId: "turn-image",
        itemId: "item-agent-message",
        sequence,
        ordinal: 2,
        createdAtMs: 1_783_814_400_002,
        updatedAtMs: 1_783_814_400_000 + sequence,
        completedAtMs: null,
        kind: "agentMessage",
        status: "inProgress",
        payload: {
          type: "agentMessage",
          text,
          phase: "final_answer",
        },
      },
    },
  });
}

describe("agent runtime event sequence gate", () => {
  beforeEach(() => {
    resetAgentRuntimeEventSequenceGatesForTests();
  });

  it("放行已知 provider raw diagnostic side-channel", () => {
    const notification = rawNotification("provider.first_text_delta.received");
    const accepted = projectAgentRuntimeSequenceGateNotifications(
      "agent_stream_provider_trace",
      notification,
    );

    expect(accepted).toEqual([notification]);
    expect(projectAppServerAgentEventPayload(accepted[0])).toMatchObject({
      type: "provider_trace",
      stage: "first_text_delta_received",
      elapsed_ms: 90,
    });
  });

  it("放行 current 图片任务非 Thread side-channel 并进入既有 GUI 投影", () => {
    const notification = rawNotification("image_task.created", {
      task_id: "task-image",
      artifact_path: ".lime/tasks/image_generate/task-image.json",
    });
    const accepted = projectAgentRuntimeSequenceGateNotifications(
      "agent_stream_image_task",
      notification,
    );

    expect(accepted).toEqual([notification]);
    expect(projectAppServerAgentEventPayload(accepted[0])).toMatchObject({
      type: "image_task_created",
      task_id: "task-image",
      artifact_path: ".lime/tasks/image_generate/task-image.json",
    });
  });

  it.each(["media.read.chunk", "media.read.completed"])(
    "放行 current media read side-channel: %s",
    (type) => {
      const notification = rawNotification(type, {
        streamId: "media-stream-1",
        done: type.endsWith("completed"),
      });

      expect(
        projectAgentRuntimeSequenceGateNotifications(
          "agent_stream_media_read",
          notification,
        ),
      ).toEqual([notification]);
    },
  );

  it("接受 canonical 图片 Tool Item 的 started/completed 完整序列", () => {
    const notifications = [
      canonicalTurnNotification(2, "turn.accepted", "inProgress"),
      canonicalToolNotification(6, "item.started", "inProgress"),
      canonicalToolNotification(8, "item.completed", "completed"),
      canonicalTurnNotification(9, "turn.completed", "completed"),
    ];
    const projected = notifications.flatMap((notification) =>
      projectAgentRuntimeSequenceGateNotifications(
        "agent_stream_image_canonical",
        notification,
      ).map(projectAppServerAgentEventPayload),
    );

    expect(projected).toHaveLength(4);
    expect(projected[1]).toMatchObject({
      type: "item_started",
      item: {
        id: "item-image-task",
        type: "tool_call",
        status: "in_progress",
        tool_name: "lime_create_image_generation_task",
      },
    });
    expect(projected[2]).toMatchObject({
      type: "item_completed",
      item: {
        id: "item-image-task",
        type: "tool_call",
        status: "completed",
        output: "task created",
      },
    });
    expect(projected[3]).toMatchObject({ type: "turn_completed" });
  });

  it("接受同一 canonical AgentMessage Item 的连续快照", () => {
    const notifications = [
      canonicalTurnNotification(2, "turn.accepted", "inProgress"),
      canonicalAgentMessageNotification(6, "第一段"),
      canonicalAgentMessageNotification(7, "第一段第二段"),
      canonicalTurnNotification(8, "turn.completed", "completed"),
    ];
    const projected = notifications.flatMap((notification) =>
      projectAgentRuntimeSequenceGateNotifications(
        "agent_stream_message_canonical",
        notification,
      ).map(projectAppServerAgentEventPayload),
    );

    expect(projected).toHaveLength(4);
    expect(projected[1]).toMatchObject({
      type: "text_delta",
      itemId: "item-agent-message",
      text: "第一段",
      phase: "final_answer",
    });
    expect(projected[2]).toMatchObject({
      type: "text_delta",
      itemId: "item-agent-message",
      text: "第一段第二段",
      phase: "final_answer",
    });
    expect(projected[3]).toMatchObject({ type: "turn_completed" });
  });

  it("允许已存在 Approval 在 action/respond 路由内直接返回 canonical terminal", () => {
    const notification = canonicalNotification({
      sequence: 7,
      type: "action.resolved",
      canonicalEvent: {
        method: "item/updated",
        params: {
          sessionId: "session-image",
          threadId: "thread-image",
          turnId: "turn-image",
          itemId: "item-approval",
          sequence: 7,
          ordinal: 3,
          createdAtMs: 1_783_814_400_002,
          updatedAtMs: 1_783_814_400_007,
          completedAtMs: 1_783_814_400_007,
          kind: "approval",
          status: "completed",
          payload: {
            type: "approval",
            request_id: "approval-1",
            action: {
              kind: "tool_confirmation",
              description: "允许执行工具？",
            },
            scope: "once",
            decision: "approved",
          },
        },
      },
    });

    expect(
      projectAgentRuntimeSequenceGateNotifications(
        "agent_stream_resolved_approval",
        notification,
      ),
    ).toEqual([notification]);
  });

  it("不放行缺少 canonicalEvent 的未知 raw event", () => {
    expect(
      projectAgentRuntimeSequenceGateNotifications(
        "agent_stream_unknown",
        rawNotification("runtime.unknown"),
      ),
    ).toEqual([]);
  });

  it("不让 raw Thread lifecycle 绕过 canonical sequence gate", () => {
    expect(
      projectAgentRuntimeSequenceGateNotifications(
        "agent_stream_thread",
        rawNotification("turn.completed"),
      ),
    ).toEqual([]);
  });
});
