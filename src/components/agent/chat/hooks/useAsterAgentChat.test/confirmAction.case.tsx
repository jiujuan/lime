import { act } from "react";
import {
  describe,
  expect,
  it
} from "vitest";
import {
  flushEffects,
  mockGetAgentRuntimeSession,
  mockGetAgentRuntimeThreadRead,
  mockRespondAgentRuntimeAction,
  mountHook,
  seedSession
} from "../useAsterAgentChat.testUtils";

describe("useAsterAgentChat.confirmAction", () => {
  it("tool_confirmation 应调用统一 runtime action 响应", async () => {
    const workspaceId = "ws-tool";
    seedSession(workspaceId, "session-tool");
    const harness = mountHook(workspaceId);

    try {
      await flushEffects();
      await act(async () => {
        await harness.getValue().confirmAction({
          requestId: "req-tool-1",
          confirmed: true,
          response: "允许",
          actionType: "tool_confirmation",
        });
      });

      expect(mockRespondAgentRuntimeAction).toHaveBeenCalledTimes(1);
      expect(mockRespondAgentRuntimeAction).toHaveBeenCalledWith({
        session_id: "session-tool",
        request_id: "req-tool-1",
        action_type: "tool_confirmation",
        confirmed: true,
        response: "允许",
        user_data: undefined,
        metadata: undefined,
      });
    } finally {
      harness.unmount();
    }
  });

  it("elicitation 应调用统一 runtime action 响应并透传 userData", async () => {
    const workspaceId = "ws-elicitation";
    seedSession(workspaceId, "session-elicitation");
    const harness = mountHook(workspaceId);

    try {
      await flushEffects();
      await act(async () => {
        await harness.getValue().confirmAction({
          requestId: "req-elicitation-1",
          confirmed: true,
          actionType: "elicitation",
          userData: { answer: "A" },
        });
      });

      expect(mockRespondAgentRuntimeAction).toHaveBeenCalledTimes(1);
      expect(mockRespondAgentRuntimeAction).toHaveBeenCalledWith({
        session_id: "session-elicitation",
        request_id: "req-elicitation-1",
        action_type: "elicitation",
        confirmed: true,
        response: undefined,
        user_data: { answer: "A" },
        metadata: undefined,
      });
    } finally {
      harness.unmount();
    }
  });

  it("ask_user 应解析 response JSON 后提交", async () => {
    const workspaceId = "ws-ask-user";
    seedSession(workspaceId, "session-ask-user");
    const harness = mountHook(workspaceId);

    try {
      await flushEffects();
      await act(async () => {
        await harness.getValue().confirmAction({
          requestId: "req-ask-user-1",
          confirmed: true,
          actionType: "ask_user",
          response: '{"answer":"选项A"}',
        });
      });

      expect(mockRespondAgentRuntimeAction).toHaveBeenCalledTimes(1);
      expect(mockRespondAgentRuntimeAction).toHaveBeenCalledWith({
        session_id: "session-ask-user",
        request_id: "req-ask-user-1",
        action_type: "ask_user",
        confirmed: true,
        response: '{"answer":"选项A"}',
        user_data: { answer: "选项A" },
        metadata: undefined,
      });
    } finally {
      harness.unmount();
    }
  });

  it("confirmAction 成功后应刷新当前会话详情以同步 terminal approval item", async () => {
    const workspaceId = "ws-action-detail-refresh";
    seedSession(workspaceId, "session-action-detail-refresh");
    const harness = mountHook(workspaceId);

    try {
      await flushEffects();
      mockGetAgentRuntimeSession.mockClear();
      mockGetAgentRuntimeThreadRead.mockClear();
      mockGetAgentRuntimeSession.mockResolvedValueOnce({
        id: "session-action-detail-refresh",
        thread_id: "thread-action-detail-refresh",
        created_at: 1_782_777_600,
        updated_at: 1_782_777_601,
        messages: [],
        turns: [
          {
            id: "turn-action-detail-refresh",
            thread_id: "thread-action-detail-refresh",
            prompt_text: "",
            status: "canceled",
            started_at: "2026-07-10T00:00:00.000Z",
            completed_at: "2026-07-10T00:00:01.000Z",
            created_at: "2026-07-10T00:00:00.000Z",
            updated_at: "2026-07-10T00:00:01.000Z",
          },
        ],
        items: [
          {
            id: "approval-action-detail-refresh",
            thread_id: "thread-action-detail-refresh",
            turn_id: "turn-action-detail-refresh",
            sequence: 1,
            type: "approval_request",
            request_id: "req-action-detail-refresh-1",
            action_type: "tool_confirmation",
            tool_name: "Bash",
            arguments: { command: "echo approval-refresh" },
            prompt: "允许执行命令？",
            status: "completed",
            response: { decision: "cancel" },
            started_at: "2026-07-10T00:00:00.100Z",
            completed_at: "2026-07-10T00:00:00.200Z",
            updated_at: "2026-07-10T00:00:00.200Z",
          },
        ],
        thread_read: {
          thread_id: "thread-action-detail-refresh",
          status: "canceled",
          latest_turn_status: "canceled",
          pending_requests: [],
          incidents: [],
          queued_turns: [],
        },
      });

      await act(async () => {
        await harness.getValue().confirmAction({
          requestId: "req-action-detail-refresh-1",
          confirmed: false,
          decision: "cancel",
          actionType: "tool_confirmation",
          response: "取消",
        });
      });

      expect(mockGetAgentRuntimeSession).toHaveBeenCalledTimes(1);
      expect(mockGetAgentRuntimeSession).toHaveBeenCalledWith(
        "session-action-detail-refresh",
        { historyLimit: 40, source: "actionRespond" },
      );
      expect(mockGetAgentRuntimeThreadRead).not.toHaveBeenCalled();
      expect(harness.getValue().threadRead).toMatchObject({
        thread_id: "thread-action-detail-refresh",
        status: "canceled",
      });
      expect(harness.getValue().threadItems).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: "approval-action-detail-refresh",
            type: "approval_request",
            status: "completed",
          }),
        ]),
      );
    } finally {
      harness.unmount();
    }
  });

  it("confirmAction 等待会话详情回填时，应暴露 submittedActionsInFlight", async () => {
    const workspaceId = "ws-ask-user-submitting";
    seedSession(workspaceId, "session-ask-user-submitting");
    let resolveRefresh: (() => void) | null = null;
    mockGetAgentRuntimeSession.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRefresh = () =>
            resolve({
              id: "session-ask-user-submitting",
              thread_id: "thread-ask-user-submitting",
              created_at: 1_782_777_600,
              updated_at: 1_782_777_601,
              messages: [],
              turns: [],
              items: [],
              thread_read: {
                thread_id: "thread-ask-user-submitting",
                status: "running",
                pending_requests: [],
                incidents: [],
                queued_turns: [],
              },
            });
        }),
    );
    const harness = mountHook(workspaceId);

    try {
      await flushEffects();

      let submissionPromise: Promise<void>;
      act(() => {
        submissionPromise = harness.getValue().confirmAction({
          requestId: "req-ask-user-submitting-1",
          confirmed: true,
          actionType: "ask_user",
          response: '{"answer":"已确认"}',
        });
      });

      await flushEffects();
      expect(harness.getValue().submittedActionsInFlight).toMatchObject([
        {
          requestId: "req-ask-user-submitting-1",
          actionType: "ask_user",
          status: "submitted",
        },
      ]);

      await act(async () => {
        resolveRefresh?.();
        await submissionPromise!;
      });

      expect(harness.getValue().submittedActionsInFlight).toEqual([]);
    } finally {
      harness.unmount();
    }
  });
});
