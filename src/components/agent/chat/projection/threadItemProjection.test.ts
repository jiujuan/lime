import { describe, expect, it } from "vitest";
import { buildThreadItemProjectionEvents } from "./threadItemProjection";

const baseContext = {
  sessionId: "session-thread-item",
  threadId: "thread-thread-item",
  runId: "run-thread-item",
  turnId: "turn-thread-item",
  timestamp: "2026-06-10T00:00:00.000Z",
};

const baseItem = {
  thread_id: "thread-1",
  turn_id: "turn-1",
  sequence: 1,
  started_at: "2026-06-10T00:00:00.000Z",
  updated_at: "2026-06-10T00:00:01.000Z",
};

describe("threadItemProjection", () => {
  it("应由 thread item owner 统一分发普通 item_completed", () => {
    const events = buildThreadItemProjectionEvents(
      {
        type: "item_completed",
        item: {
          ...baseItem,
          id: "reasoning-1",
          type: "reasoning",
          status: "completed",
          text: "完整推理",
          summary: ["完成推理"],
        },
      },
      baseContext,
    );

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "reasoning.summary",
      sourceType: "item_completed",
      sessionId: "session-thread-item",
      threadId: "thread-1",
      runId: "run-thread-item",
      turnId: "turn-1",
      partId: "reasoning-1",
      owner: "model",
      scope: "part",
      phase: "completed",
      surface: "inline_process",
      persistence: "archive",
      payload: {
        textLength: 4,
        summaryCount: 1,
        preview: "完成推理",
      },
    });
  });

  it("应由 thread item owner 从 tool_call metadata 分发 plan approval", () => {
    const events = buildThreadItemProjectionEvents(
      {
        type: "item_completed",
        item: {
          ...baseItem,
          id: "tool-plan",
          type: "tool_call",
          status: "completed",
          tool_name: "request_user_input",
          success: true,
          output: "已提交计划审批",
          metadata: {
            plan_approval_request: {
              type: "plan_approval_request",
              from: "researcher",
              request_id: "plan-req-1",
              plan_file_path: "plans/alpha.md",
              plan_content: "# Alpha",
            },
          },
        },
      },
      baseContext,
    );

    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      type: "tool.result",
      sourceType: "item_completed",
      toolCallId: "tool-plan",
      owner: "tool",
      scope: "tool_call",
      phase: "completed",
      surface: "tool_ui",
      persistence: "archive",
      payload: {
        toolName: "request_user_input",
        outputPreview: "已提交计划审批",
      },
    });
    expect(events[1]).toMatchObject({
      type: "action.required",
      sourceType: "item_completed",
      actionId: "plan-req-1",
      partId: "tool-plan",
      toolCallId: "tool-plan",
      owner: "action",
      scope: "action_request",
      phase: "waiting",
      surface: "hitl",
      persistence: "archive",
      control: "approve",
      payload: {
        actionType: "plan_approval",
        from: "researcher",
        planFilePath: "plans/alpha.md",
      },
    });
  });

  it("应由 thread item owner 从 tool_call metadata 分发 task owner change", () => {
    const events = buildThreadItemProjectionEvents(
      {
        type: "item_completed",
        item: {
          ...baseItem,
          id: "tool-task-update",
          type: "tool_call",
          status: "completed",
          tool_name: "TaskUpdate",
          success: true,
          output: '{"success":true,"taskId":"task-1"}',
          metadata: {
            task_id: "task-1",
            task_list_id: "board-main",
            updated_fields: ["owner"],
            owner_change: {
              from: "researcher",
              to: "implementer",
            },
            task: {
              id: "task-1",
              owner: "implementer",
            },
          },
        },
      },
      baseContext,
    );

    expect(events).toHaveLength(3);
    expect(events[2]).toMatchObject({
      type: "task.changed",
      sourceType: "item_completed",
      taskId: "task-1",
      workItemId: "task-1",
      threadId: "thread-1",
      turnId: "turn-1",
      partId: "tool-task-update",
      toolCallId: "tool-task-update",
      owner: "task",
      scope: "task",
      phase: "accepted",
      surface: "work_board",
      persistence: "snapshot",
      control: "assign",
      runtimeEntity: "work_item",
      runtimeStatus: "accepted",
      payload: {
        taskEvent: "team_reassignment",
        action: "reassign",
        previousAssigneeId: "researcher",
        nextAssigneeId: "implementer",
        sourceToolName: "TaskUpdate",
        sourceTaskListId: "board-main",
        sourceToolCallId: "tool-task-update",
      },
    });
  });

  it("应由 thread item owner 分发 subagent activity 的 worker notification", () => {
    const events = buildThreadItemProjectionEvents(
      {
        type: "item_completed",
        item: {
          ...baseItem,
          id: "subagent-activity-1",
          type: "subagent_activity",
          status: "completed",
          status_label: "completed",
          title: "实现子任务",
          summary: "子任务已完成",
          role: "implementer",
          model: "gpt-5.2",
          session_id: "child-session-1",
        },
      },
      baseContext,
    );

    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      type: "agent.changed",
      sourceType: "item_completed",
      partId: "subagent-activity-1",
      taskId: "child-session-1",
      agentId: "child-session-1",
      owner: "task",
      scope: "agent",
      phase: "completed",
      surface: "task_capsule",
      topology: "coordinator_team",
      runtimeEntity: "subagent_turn",
      runtimeStatus: "completed",
      payload: {
        statusLabel: "completed",
        title: "实现子任务",
        role: "implementer",
        model: "gpt-5.2",
        childSessionId: "child-session-1",
      },
    });
    expect(events[1]).toMatchObject({
      type: "worker.notification",
      sourceType: "item_completed",
      workerNotificationId: "subagent-activity-1",
      transcriptRef: "thread-1:turn-1:subagent-activity-1",
      taskId: "child-session-1",
      agentId: "child-session-1",
      owner: "agent",
      scope: "agent",
      phase: "completed",
      surface: "worker_notifications",
      persistence: "archive",
      runtimeStatus: "completed",
      payload: {
        runtimeEntity: "subagent_turn",
        notificationKind: "worker_result",
        statusLabel: "completed",
        childSessionId: "child-session-1",
        title: "实现子任务",
        summaryPreview: "子任务已完成",
      },
    });
  });
});
