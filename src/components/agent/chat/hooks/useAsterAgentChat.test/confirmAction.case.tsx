import { act } from "react";
import {
  describe,
  expect,
  it
} from "vitest";
import {
  flushEffects,
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

  it("confirmAction 成功后应刷新当前会话详情以同步 thread_read", async () => {
    const workspaceId = "ws-ask-user-refresh";
    seedSession(workspaceId, "session-ask-user-refresh");
    mockGetAgentRuntimeThreadRead.mockResolvedValueOnce({
      thread_id: "thread-ask-user-refresh",
      status: "running",
      pending_requests: [],
      incidents: [],
      queued_turns: [],
    });
    const harness = mountHook(workspaceId);

    try {
      await flushEffects();
      await act(async () => {
        await harness.getValue().confirmAction({
          requestId: "req-ask-user-refresh-1",
          confirmed: true,
          actionType: "ask_user",
          response: '{"answer":"已确认"}',
        });
      });

      expect(mockGetAgentRuntimeThreadRead).toHaveBeenCalledTimes(1);
      expect(mockGetAgentRuntimeThreadRead).toHaveBeenCalledWith(
        "session-ask-user-refresh",
      );
      expect(harness.getValue().threadRead).toMatchObject({
        thread_id: "thread-ask-user-refresh",
        status: "running",
      });
    } finally {
      harness.unmount();
    }
  });

  it("confirmAction 等待 read-model 回填时，应暴露 submittedActionsInFlight", async () => {
    const workspaceId = "ws-ask-user-submitting";
    seedSession(workspaceId, "session-ask-user-submitting");
    let resolveRefresh: (() => void) | null = null;
    mockGetAgentRuntimeThreadRead.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRefresh = () =>
            resolve({
              thread_id: "thread-ask-user-submitting",
              status: "running",
              pending_requests: [],
              incidents: [],
              queued_turns: [],
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
