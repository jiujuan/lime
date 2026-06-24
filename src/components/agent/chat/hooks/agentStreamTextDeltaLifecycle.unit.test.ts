import { describe, expect, it } from "vitest";
import type { AgentEvent } from "@/lib/api/agentProtocol";
import type { StreamRequestState } from "./agentStreamRuntimeHandlerTypes";
import {
  clearActiveTextSegmentState,
  noteActiveFinalTextSegment,
  resolveTextSegmentFinalEligibility,
  shouldCommitActiveTextSegmentAsFinal,
  shouldRouteTextDeltaToFinalOverlay,
  shouldSuppressLegacyTextDeltaAfterProcessBoundary,
  type TextDeltaAgentEvent,
} from "./agentStreamTextDeltaLifecycle";

function createRequestState(
  overrides: Partial<StreamRequestState> = {},
): StreamRequestState {
  return {
    accumulatedContent: "",
    queuedTurnId: null,
    requestLogId: null,
    requestStartedAt: 0,
    requestFinished: false,
    ...overrides,
  };
}

function textDelta(
  overrides: Partial<Extract<AgentEvent, { type: "text_delta" }>> = {},
): TextDeltaAgentEvent {
  return {
    type: "text_delta",
    text: "delta",
    ...overrides,
  } as TextDeltaAgentEvent;
}

describe("agentStreamTextDeltaLifecycle", () => {
  it("只允许显式 final_answer 在 process boundary 后继续进入 final overlay", () => {
    const requestState = createRequestState({
      hasFinalAnswerRequiredProcessBoundary: true,
    });

    expect(
      shouldRouteTextDeltaToFinalOverlay({
        event: textDelta({ phase: "final_answer" }),
        requestState,
      }),
    ).toBe(true);
    expect(
      shouldRouteTextDeltaToFinalOverlay({
        event: textDelta({ itemId: "legacy-item-without-sequence" }),
        requestState,
      }),
    ).toBe(false);
    expect(
      shouldRouteTextDeltaToFinalOverlay({
        event: textDelta(),
        requestState,
      }),
    ).toBe(false);
  });

  it("process boundary 后无 sequence 的 legacy delta 也必须被 suppress", () => {
    const requestState = createRequestState({
      hasFinalAnswerRequiredProcessBoundary: true,
    });

    expect(
      shouldSuppressLegacyTextDeltaAfterProcessBoundary({
        event: textDelta({ itemId: "legacy-item-without-sequence" }),
        requestState,
      }),
    ).toBe(true);
    expect(
      shouldSuppressLegacyTextDeltaAfterProcessBoundary({
        event: textDelta(),
        requestState,
      }),
    ).toBe(true);
    expect(
      shouldSuppressLegacyTextDeltaAfterProcessBoundary({
        event: textDelta({ phase: "final_answer" }),
        requestState,
      }),
    ).toBe(false);
  });

  it("纯 legacy provider 在整轮没有 process boundary 时仍可作为兼容 final fallback", () => {
    const requestState = createRequestState();

    expect(
      shouldRouteTextDeltaToFinalOverlay({
        event: textDelta({ itemId: "legacy-item" }),
        requestState,
      }),
    ).toBe(true);
    expect(
      shouldRouteTextDeltaToFinalOverlay({
        event: textDelta(),
        requestState,
      }),
    ).toBe(true);
    expect(
      shouldSuppressLegacyTextDeltaAfterProcessBoundary({
        event: textDelta({ itemId: "legacy-item" }),
        requestState,
      }),
    ).toBe(false);
  });

  it("active legacy segment 遇到 process boundary 后不能被提交为最终正文", () => {
    const requestState = createRequestState({
      accumulatedContent: "工具前说明",
    });

    noteActiveFinalTextSegment({
      event: textDelta({ itemId: "legacy-preface" }),
      requestState,
    });
    expect(resolveTextSegmentFinalEligibility(textDelta())).toBe(
      "legacy_unphased",
    );
    expect(shouldCommitActiveTextSegmentAsFinal(requestState)).toBe(true);

    requestState.hasFinalAnswerRequiredProcessBoundary = true;
    expect(shouldCommitActiveTextSegmentAsFinal(requestState)).toBe(false);

    clearActiveTextSegmentState(requestState);
    noteActiveFinalTextSegment({
      event: textDelta({ phase: "final_answer" }),
      requestState,
    });
    expect(shouldCommitActiveTextSegmentAsFinal(requestState)).toBe(true);
  });
});
