import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getDefaultAgentApprovalServerRequestController,
  resetDefaultAgentApprovalServerRequestControllerForTests,
} from "../agentApprovalServerRequest";
import {
  getDefaultAgentUserInputServerRequestController,
  resetDefaultAgentUserInputServerRequestControllerForTests,
} from "../agentUserInputServerRequest";
import {
  findPendingTypedAction,
  findPendingTypedServerRequestAction,
  respondPendingTypedServerRequest,
  replayedActionViewFromPendingAction,
} from "./serverRequestReplay";

describe("typed server-request replay", () => {
  beforeEach(() => {
    resetDefaultAgentApprovalServerRequestControllerForTests();
    resetDefaultAgentUserInputServerRequestControllerForTests();
  });

  afterEach(() => vi.restoreAllMocks());

  it("仅从同一 session/thread 的 typed pending snapshot 重建 action", () => {
    const action = {
      requestId: "item-1",
      actionType: "ask_user" as const,
      prompt: "请选择执行模式",
      scope: { threadId: "thread-1", turnId: "turn-1" },
      status: "pending" as const,
    };
    expect(replayedActionViewFromPendingAction(action)).toMatchObject({
      type: "action_required",
      request_id: "item-1",
      action_type: "ask_user",
      prompt: "请选择执行模式",
      scope: { thread_id: "thread-1", turn_id: "turn-1" },
    });
    expect(findPendingTypedAction([action], "thread-1", "item-1")).toEqual(
      action,
    );
    expect(
      findPendingTypedAction([action], "other-thread", "item-1"),
    ).toBeNull();
    expect(
      findPendingTypedServerRequestAction("thread-1", "item-1"),
    ).toBeNull();
  });

  it("空 scope 不可被 replay", () => {
    expect(
      findPendingTypedServerRequestAction("session-1", "request-1"),
    ).toBeNull();
    expect(
      getDefaultAgentApprovalServerRequestController().getSnapshot(),
    ).toEqual([]);
    expect(
      getDefaultAgentUserInputServerRequestController().getSnapshot(),
    ).toEqual([]);
  });

  it("同作用域 AskUser typed pending 应由 controller settle", () => {
    const controller = getDefaultAgentUserInputServerRequestController();
    vi.spyOn(controller, "getSnapshot").mockReturnValue([
      {
        requestId: "item-ask-1",
        actionType: "ask_user",
        scope: { threadId: "thread-1", turnId: "turn-1" },
        status: "pending",
      },
    ]);
    const respond = vi.spyOn(controller, "respond").mockReturnValue(true);

    expect(
      respondPendingTypedServerRequest({
        session_id: "thread-1",
        request_id: "item-ask-1",
        action_type: "ask_user",
        confirmed: true,
        user_data: { mode: "auto" },
        action_scope: { thread_id: "thread-1", turn_id: "turn-1" },
      }),
    ).toBe(true);
    expect(respond).toHaveBeenCalledWith({
      requestId: "item-ask-1",
      actionType: "ask_user",
      confirmed: true,
      decision: undefined,
      response: undefined,
      userData: { mode: "auto" },
    });
  });

  it("typed pending scope 不匹配时 fail closed", () => {
    const controller = getDefaultAgentApprovalServerRequestController();
    vi.spyOn(controller, "getSnapshot").mockReturnValue([
      {
        requestId: "approval-1",
        actionType: "tool_confirmation",
        scope: { threadId: "thread-1", turnId: "turn-1" },
        status: "pending",
      },
    ]);
    const respond = vi.spyOn(controller, "respond");

    expect(
      respondPendingTypedServerRequest({
        session_id: "thread-1",
        request_id: "approval-1",
        action_type: "tool_confirmation",
        decision: "allow_once",
        action_scope: { thread_id: "thread-1", turn_id: "turn-other" },
      }),
    ).toBe(false);
    expect(respond).not.toHaveBeenCalled();
  });
});
