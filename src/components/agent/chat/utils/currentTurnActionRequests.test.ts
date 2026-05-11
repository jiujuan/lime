import { describe, expect, it } from "vitest";

import type { ActionRequired, Message } from "../types";
import {
  collectCurrentAssistantTail,
  filterActionsForCurrentAssistantTail,
  findActionRequestSourceMessageId,
  isActionRequestInCurrentAssistantTail,
} from "./currentTurnActionRequests";

function userMessage(id: string): Message {
  return {
    id,
    role: "user",
    content: id,
    timestamp: new Date("2026-05-11T00:00:00Z"),
  };
}

function assistantMessage(
  id: string,
  actionRequests: ActionRequired[] = [],
  runtimeTurnId?: string,
): Message {
  return {
    id,
    role: "assistant",
    content: id,
    timestamp: new Date("2026-05-11T00:00:01Z"),
    actionRequests,
    runtimeTurnId,
  };
}

function action(
  requestId: string,
  overrides: Partial<ActionRequired> = {},
): ActionRequired {
  return {
    requestId,
    actionType: "ask_user",
    prompt: requestId,
    status: "pending",
    ...overrides,
  };
}

describe("currentTurnActionRequests", () => {
  it("只收集最后一个 user 之后的 assistant tail", () => {
    const messages = [
      userMessage("user-1"),
      assistantMessage("assistant-old"),
      userMessage("user-2"),
      assistantMessage("assistant-current-1"),
      assistantMessage("assistant-current-2"),
    ];

    expect(
      collectCurrentAssistantTail(messages).map((message) => message.id),
    ).toEqual(["assistant-current-1", "assistant-current-2"]);
  });

  it("sourceMessageId 指向当前 tail 时保留，指向旧 assistant 时过滤", () => {
    const currentAction = action("req-current", {
      sourceMessageId: "assistant-current",
    });
    const staleAction = action("req-stale", {
      sourceMessageId: "assistant-old",
    });
    const messages = [
      userMessage("user-1"),
      assistantMessage("assistant-old", [staleAction]),
      userMessage("user-2"),
      assistantMessage("assistant-current", [currentAction]),
    ];

    expect(
      filterActionsForCurrentAssistantTail(
        [staleAction, currentAction],
        messages,
      ),
    ).toEqual([currentAction]);
    expect(isActionRequestInCurrentAssistantTail(currentAction, messages)).toBe(
      true,
    );
    expect(isActionRequestInCurrentAssistantTail(staleAction, messages)).toBe(
      false,
    );
  });

  it("无 sourceMessageId 时可按当前 tail 内的 requestId 或 turn scope 归属", () => {
    const byRequestId = action("req-current");
    const byTurnScope = action("req-by-turn", {
      scope: { turnId: "turn-current" },
    });
    const staleByTurnScope = action("req-stale-turn", {
      scope: { turnId: "turn-old" },
    });
    const messages = [
      userMessage("user-1"),
      assistantMessage("assistant-old", [staleByTurnScope], "turn-old"),
      userMessage("user-2"),
      assistantMessage("assistant-current", [byRequestId], "turn-current"),
    ];

    expect(
      filterActionsForCurrentAssistantTail(
        [byRequestId, byTurnScope, staleByTurnScope],
        messages,
      ),
    ).toEqual([byRequestId, byTurnScope]);
    expect(findActionRequestSourceMessageId(messages, "req-current")).toBe(
      "assistant-current",
    );
  });

  it("submitted in-flight 可临时保留无来源动作，但不保留已绑定旧 turn 的动作", () => {
    const unscoped = action("req-unscoped", { status: "submitted" });
    const scopedStale = action("req-scoped-stale", {
      status: "submitted",
      scope: { turnId: "turn-old" },
    });
    const messages = [
      userMessage("user-1"),
      assistantMessage("assistant-old", [scopedStale], "turn-old"),
      userMessage("user-2"),
      assistantMessage("assistant-current", [], "turn-current"),
    ];

    expect(
      filterActionsForCurrentAssistantTail([unscoped, scopedStale], messages, {
        keepUnscoped: true,
      }),
    ).toEqual([unscoped]);
  });
});
