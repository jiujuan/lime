import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { changeLimeLocale } from "@/i18n/createI18n";
import { resolveSoulInteractionCopy } from "@/lib/soul/interactionCopy";
import type { Message, MessageImage } from "../types";
import type { WorkspacePathMissingState } from "./agentChatShared";
import type {
  ActiveStreamState,
  StreamRequestState,
} from "./agentStreamSubmissionLifecycle";
import { handleAgentStreamSubmitFailure } from "./agentStreamSubmitFailure";

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    warning: vi.fn(),
  },
}));

function createStateSetter<T>(getValue: () => T, setValue: (value: T) => void) {
  return (next: T | ((prev: T) => T)) => {
    setValue(
      typeof next === "function" ? (next as (prev: T) => T)(getValue()) : next,
    );
  };
}

function noopDispatch<T>() {
  return vi.fn() as unknown as Dispatch<SetStateAction<T>>;
}

describe("handleAgentStreamSubmitFailure", () => {
  beforeEach(async () => {
    await changeLimeLocale("zh-CN");
  });

  afterEach(async () => {
    await changeLimeLocale("zh-CN");
  });

  it("提交阶段失败应保持 neutral 文案并携带 Soul metadata", () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    let messages: Message[] = [
      {
        id: "assistant-1",
        role: "assistant",
        content: "",
        timestamp: new Date("2026-07-04T01:00:00.000Z"),
        isThinking: true,
      },
    ];
    const requestState: StreamRequestState = {
      accumulatedContent: "",
      requestLogId: null,
      requestStartedAt: Date.now(),
      requestFinished: false,
      queuedTurnId: null,
    };
    const soulCopy = resolveSoulInteractionCopy({
      soul: {
        enabled: true,
        style_profile_id: "cheeky_sassy_executor",
        tone: [],
        communication_style: [],
        avoid: [],
        artifact_voice: { enabled: false, evidence_refs: [] },
        imported_from: "manual",
      },
    });

    handleAgentStreamSubmitFailure({
      error: new Error("provider failed"),
      requestState,
      content: "帮我整理资料",
      images: [] as MessageImage[],
      assistantMsgId: "assistant-1",
      expectingQueue: false,
      eventName: "turn-1",
      activeStreamRef: {
        current: null,
      } as MutableRefObject<ActiveStreamState | null>,
      setMessages: createStateSetter(
        () => messages,
        (value) => {
          messages = value;
        },
      ),
      setWorkspacePathMissing: noopDispatch<WorkspacePathMissingState | null>(),
      setIsSending: noopDispatch<boolean>(),
      clearActiveStreamIfMatch: () => true,
      disposeListener: vi.fn(),
      markOptimisticFailure: vi.fn(),
      soulCopy,
    });

    expect(messages[0]).toMatchObject({
      id: "assistant-1",
      isThinking: false,
      content: "执行失败：provider failed",
      runtimeStatus: {
        phase: "failed",
        title: "当前处理失败",
        detail: "provider failed",
        metadata: {
          soul_surface: "failure_recovery",
          soul_phase: "failed",
          style_level: "L2",
          risk_level: "normal",
          tone_variant: "cheeky_sassy",
          profile_id: "cheeky_sassy_executor",
          pack_id: "com.lime.soul.cheeky-sassy-executor",
        },
      },
    });
    consoleErrorSpy.mockRestore();
  });

  it("提交失败不应绕过 read model 本地裁决 queued turn", () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    let messages: Message[] = [
      {
        id: "assistant-queued-submit-failure",
        role: "assistant",
        content: "",
        timestamp: new Date("2026-07-04T01:00:00.000Z"),
        isThinking: true,
      },
    ];
    const requestState: StreamRequestState = {
      accumulatedContent: "",
      requestLogId: null,
      requestStartedAt: Date.now(),
      requestFinished: false,
      queuedTurnId: "queued-submit-failure",
    };
    const clearActiveStreamIfMatch = vi.fn(() => true);
    const markOptimisticFailure = vi.fn();

    handleAgentStreamSubmitFailure({
      error: new Error("provider failed"),
      requestState,
      content: "排队输入",
      images: [] as MessageImage[],
      assistantMsgId: "assistant-queued-submit-failure",
      expectingQueue: true,
      eventName: "turn-queued-submit-failure",
      activeStreamRef: {
        current: null,
      } as MutableRefObject<ActiveStreamState | null>,
      setMessages: createStateSetter(
        () => messages,
        (value) => {
          messages = value;
        },
      ),
      setWorkspacePathMissing: noopDispatch<WorkspacePathMissingState | null>(),
      setIsSending: noopDispatch<boolean>(),
      clearActiveStreamIfMatch,
      disposeListener: vi.fn(),
      markOptimisticFailure,
    });

    expect(markOptimisticFailure).toHaveBeenCalledWith("provider failed");
    expect(clearActiveStreamIfMatch).toHaveBeenCalledWith(
      "turn-queued-submit-failure",
    );
    expect(messages[0]).toMatchObject({
      id: "assistant-queued-submit-failure",
      isThinking: false,
      content: "执行失败：provider failed",
    });
    consoleErrorSpy.mockRestore();
  });
});
