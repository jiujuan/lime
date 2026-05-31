import { describe, expect, it } from "vitest";
import type { ActionRequired, Message } from "../types";
import {
  applyAcknowledgedActionRequests,
  mapReplayedActionRequiredToAction,
  markQueuedFallbackActionInMessages,
  markQueuedFallbackActionInPendingActions,
  removeActionsByRequestIds,
  resolveFallbackActionResponsePlan,
  shouldPersistSubmittedActionForType,
  upsertSubmittedAction,
} from "./agentChatActionState";

function createAction(
  overrides: Partial<ActionRequired> = {},
): ActionRequired {
  return {
    requestId: overrides.requestId ?? "req-1",
    actionType: overrides.actionType ?? "ask_user",
    prompt: overrides.prompt ?? "请选择下一步",
    status: overrides.status ?? "pending",
    ...overrides,
  };
}

function createMessage(
  overrides: Partial<Message> = {},
  action = createAction(),
): Message {
  return {
    id: overrides.id ?? "assistant-1",
    role: "assistant",
    content: overrides.content ?? "",
    timestamp: overrides.timestamp ?? new Date("2026-05-31T00:00:00.000Z"),
    actionRequests: overrides.actionRequests ?? [action],
    contentParts: overrides.contentParts ?? [
      { type: "text", text: "需要确认" },
      { type: "action_required", actionRequired: action },
    ],
    runtimeStatus: overrides.runtimeStatus,
    ...overrides,
  };
}

describe("agentChatActionState", () => {
  it("ask/elicitation 提交后应保留面板并标记 submitted", () => {
    const action = createAction({
      requestId: "req-ask-1",
      actionType: "ask_user",
    });
    const result = applyAcknowledgedActionRequests({
      messages: [createMessage({}, action)],
      requestIds: new Set(["req-ask-1"]),
      shouldPersistSubmittedAction: true,
      submittedResponse: "继续",
      submittedUserData: { answer: "继续" },
    });

    const updated = result[0];
    expect(updated?.actionRequests?.[0]).toMatchObject({
      requestId: "req-ask-1",
      status: "submitted",
      submittedResponse: "继续",
      submittedUserData: { answer: "继续" },
    });
    const actionPart = updated?.contentParts?.find(
      (part) => part.type === "action_required",
    );
    expect(actionPart).toMatchObject({
      type: "action_required",
      actionRequired: {
        requestId: "req-ask-1",
        status: "submitted",
        submittedResponse: "继续",
        submittedUserData: { answer: "继续" },
      },
    });
    expect(updated?.runtimeStatus).toMatchObject({
      phase: "routing",
      title: "已收到补充信息，继续处理中",
    });
  });

  it("tool confirmation 确认后应从消息和 contentParts 中移除请求", () => {
    const acknowledged = createAction({
      requestId: "req-tool-1",
      actionType: "tool_confirmation",
    });
    const retained = createAction({
      requestId: "req-tool-2",
      actionType: "tool_confirmation",
    });
    const result = applyAcknowledgedActionRequests({
      messages: [
        createMessage({
          actionRequests: [acknowledged, retained],
          contentParts: [
            { type: "action_required", actionRequired: acknowledged },
            { type: "text", text: "中间文本" },
            { type: "action_required", actionRequired: retained },
          ],
        }),
      ],
      requestIds: new Set(["req-tool-1"]),
      shouldPersistSubmittedAction: false,
    });

    expect(result[0]?.actionRequests?.map((item) => item.requestId)).toEqual([
      "req-tool-2",
    ]);
    expect(
      result[0]?.contentParts
        ?.filter((part) => part.type === "action_required")
        .map((part) => part.actionRequired.requestId),
    ).toEqual(["req-tool-2"]);
    expect(result[0]?.runtimeStatus).toBeUndefined();
  });

  it("没有命中的 requestId 时应保持消息内容不变", () => {
    const message = createMessage();
    const result = applyAcknowledgedActionRequests({
      messages: [message],
      requestIds: new Set(["req-missing"]),
      shouldPersistSubmittedAction: true,
    });

    expect(result[0]?.actionRequests).toEqual(message.actionRequests);
    expect(result[0]?.contentParts).toEqual(message.contentParts);
    expect(result[0]?.runtimeStatus).toBeUndefined();
  });

  it("应按 action type 判断 submitted 面板是否需要保留", () => {
    expect(shouldPersistSubmittedActionForType("ask_user")).toBe(true);
    expect(shouldPersistSubmittedActionForType("elicitation")).toBe(true);
    expect(shouldPersistSubmittedActionForType("tool_confirmation")).toBe(
      false,
    );
  });

  it("submitted action in-flight upsert 应替换同 requestId 并保持新项在尾部", () => {
    const first = createAction({
      requestId: "req-1",
      status: "pending",
    });
    const retained = createAction({
      requestId: "req-2",
      status: "pending",
    });
    const submitted = createAction({
      requestId: "req-1",
      status: "submitted",
      submittedResponse: "继续",
    });

    expect(upsertSubmittedAction([first, retained], submitted)).toEqual([
      retained,
      submitted,
    ]);
  });

  it("应按 acknowledged requestIds 清理 action 集合", () => {
    const retained = createAction({ requestId: "req-retained" });
    expect(
      removeActionsByRequestIds(
        [
          createAction({ requestId: "req-ack-1" }),
          retained,
          createAction({ requestId: "req-ack-2" }),
        ],
        new Set(["req-ack-1", "req-ack-2"]),
      ),
    ).toEqual([retained]);
  });

  it("fallback ask 未找到真实请求时应生成排队计划", () => {
    const fallback = createAction({
      requestId: "fallback:tool-1",
      actionType: "ask_user",
      prompt: "请选择风格",
      isFallback: true,
      sourceMessageId: "assistant-1",
    });
    const plan = resolveFallbackActionResponsePlan({
      actionType: "ask_user",
      pendingActions: [fallback],
      persistedAction: fallback,
      response: {
        requestId: "fallback:tool-1",
        actionType: "ask_user",
        confirmed: true,
        response: '{"answer":"极简未来"}',
      },
      userData: { answer: "极简未来" },
    });

    expect(plan).toEqual({
      kind: "queue",
      promptKey: "请选择风格",
      queuedResponse: {
        requestId: "fallback:tool-1",
        actionType: "ask_user",
        confirmed: true,
        response: '{"answer":"极简未来"}',
        userData: { answer: "极简未来" },
        sourceMessageId: "assistant-1",
      },
    });
  });

  it("fallback ask 只应匹配同 assistant 消息下的真实请求", () => {
    const fallback = createAction({
      requestId: "fallback:tool-1",
      actionType: "ask_user",
      prompt: "请选择风格",
      isFallback: true,
      sourceMessageId: "assistant-old",
    });
    const otherTurnRealAction = createAction({
      requestId: "req-real-other",
      actionType: "ask_user",
      prompt: "请选择风格",
      sourceMessageId: "assistant-new",
    });
    const sameTurnRealAction = createAction({
      requestId: "req-real-same",
      actionType: "ask_user",
      prompt: "请选择风格",
      sourceMessageId: "assistant-old",
    });

    expect(
      resolveFallbackActionResponsePlan({
        actionType: "ask_user",
        pendingActions: [fallback, otherTurnRealAction],
        persistedAction: fallback,
        response: {
          requestId: "fallback:tool-1",
          actionType: "ask_user",
          confirmed: true,
        },
        userData: "极简未来",
      }).kind,
    ).toBe("queue");

    const plan = resolveFallbackActionResponsePlan({
      actionType: "ask_user",
      pendingActions: [fallback, otherTurnRealAction, sameTurnRealAction],
      persistedAction: fallback,
      response: {
        requestId: "fallback:tool-1",
        actionType: "ask_user",
        confirmed: true,
      },
      userData: "极简未来",
    });

    expect(plan).toEqual({
      kind: "submit_resolved",
      resolvedAction: sameTurnRealAction,
    });
  });

  it("fallback 回答排队时应同步 pending action 和消息面板状态", () => {
    const fallback = createAction({
      requestId: "fallback:tool-1",
      actionType: "ask_user",
      prompt: "请选择风格",
      isFallback: true,
    });

    expect(
      markQueuedFallbackActionInPendingActions(
        [fallback],
        "fallback:tool-1",
        "极简未来",
        { answer: "极简未来" },
      ),
    ).toEqual([
      {
        ...fallback,
        status: "queued",
        submittedResponse: "极简未来",
        submittedUserData: { answer: "极简未来" },
      },
    ]);

    const result = markQueuedFallbackActionInMessages({
      messages: [createMessage({}, fallback)],
      requestId: "fallback:tool-1",
      submittedResponse: "极简未来",
      submittedUserData: { answer: "极简未来" },
    });

    expect(result[0]?.actionRequests?.[0]).toMatchObject({
      requestId: "fallback:tool-1",
      status: "queued",
      submittedResponse: "极简未来",
      submittedUserData: { answer: "极简未来" },
    });
    expect(
      result[0]?.contentParts?.find(
        (part) => part.type === "action_required",
      ),
    ).toMatchObject({
      type: "action_required",
      actionRequired: {
        requestId: "fallback:tool-1",
        status: "queued",
        submittedResponse: "极简未来",
        submittedUserData: { answer: "极简未来" },
      },
    });
  });

  it("应将 replay request 结果映射为可重新写入消息的 action request", () => {
    expect(
      mapReplayedActionRequiredToAction({
        type: "action_required",
        request_id: "req-replay-1",
        action_type: "ask_user",
        prompt: "请选择执行模式",
        questions: [
          {
            question: "请选择执行模式",
            options: ["自动执行", { label: "确认后执行", description: "稳妥" }],
          },
        ],
        scope: {
          session_id: "session-1",
          thread_id: "thread-1",
          turn_id: "turn-1",
        },
      }),
    ).toMatchObject({
      requestId: "req-replay-1",
      actionType: "ask_user",
      prompt: "请选择执行模式",
      questions: [
        {
          question: "请选择执行模式",
          options: [
            { label: "自动执行" },
            { label: "确认后执行", description: "稳妥" },
          ],
          multiSelect: false,
        },
      ],
      scope: {
        sessionId: "session-1",
        threadId: "thread-1",
        turnId: "turn-1",
      },
      status: "pending",
      isFallback: false,
    });
  });

  it("replay request 映射时应忽略非对象 arguments 并用 prompt 兜底 question", () => {
    const action = mapReplayedActionRequiredToAction({
      type: "action_required",
      request_id: "req-replay-tool",
      action_type: "tool_confirmation",
      tool_name: "bash",
      arguments: "invalid" as never,
      prompt: "是否执行命令？",
      questions: null,
    });

    expect(action).toMatchObject({
      requestId: "req-replay-tool",
      actionType: "tool_confirmation",
      toolName: "bash",
      arguments: undefined,
      questions: [
        {
          question: "是否执行命令？",
          multiSelect: false,
        },
      ],
      status: "pending",
      isFallback: false,
    });
  });
});
