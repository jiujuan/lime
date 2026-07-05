import { describe, expect, it } from "vitest";
import { buildActionProjectionEvents } from "./actionProjection";

const baseContext = {
  sessionId: "fallback-session",
  threadId: "fallback-thread",
  turnId: "fallback-turn",
  timestamp: "2026-06-07T00:00:00.000Z",
};

describe("actionProjection", () => {
  it("应由 action owner 统一分发 action_required", () => {
    const events = buildActionProjectionEvents(
      {
        type: "action_required",
        request_id: "approval-1",
        action_type: "tool_confirmation",
        scope: {
          session_id: " session-action ",
          thread_id: " thread-action ",
          turn_id: " turn-action ",
        },
        tool_name: "shell",
        prompt: "允许执行命令？",
        questions: [{ question: "确认？" }],
        requested_schema: { type: "object" },
      },
      baseContext,
    );

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "action.required",
      sourceType: "action_required",
      timestamp: "2026-06-07T00:00:00.000Z",
      sessionId: "session-action",
      threadId: "thread-action",
      turnId: "turn-action",
      actionId: "approval-1",
      owner: "action",
      scope: "action_request",
      phase: "waiting",
      surface: "hitl",
      persistence: "snapshot",
      control: "approve",
      payload: {
        actionType: "tool_confirmation",
        toolName: "shell",
        promptPreview: "允许执行命令？",
        questionCount: 1,
        hasRequestedSchema: true,
      },
    });
  });

  it("应由 action owner 统一分发 action_resolved", () => {
    const events = buildActionProjectionEvents(
      {
        type: "action_resolved",
        request_id: "approval-1",
        action_type: "plan_approval",
        approved: false,
        feedback: "需要修改",
        permission_mode: "ask",
        data: {
          decision_kind: "plan_approval_response",
          target_session_id: "child-session-1",
          plan_file: ".lime/plans/child-session-1.md",
          plan_id: "plan-1",
          awaiting_leader_approval: true,
        },
      },
      baseContext,
    );

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "action.resolved",
      sourceType: "action_resolved",
      sessionId: "fallback-session",
      threadId: "fallback-thread",
      turnId: "fallback-turn",
      actionId: "approval-1",
      owner: "action",
      scope: "action_request",
      surface: "hitl",
      persistence: "snapshot",
      payload: {
        actionType: "plan_approval",
        approved: false,
        feedbackPreview: "需要修改",
        permissionMode: "ask",
        decisionKind: "plan_approval_response",
        targetSessionId: "child-session-1",
        planFile: ".lime/plans/child-session-1.md",
        planId: "plan-1",
        awaitingLeaderApproval: true,
      },
    });
  });
});
