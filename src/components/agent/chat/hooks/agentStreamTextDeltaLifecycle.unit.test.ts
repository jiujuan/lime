import { describe, expect, it } from "vitest";
import type { AgentEvent } from "@/lib/api/agentProtocol";
import type { StreamRequestState } from "./agentStreamRuntimeHandlerTypes";
import {
  clearActiveTextSegmentState,
  hasActiveTextSegmentProvenance,
  noteActiveFinalTextSegment,
  resolveAccumulatedFinalContentForCompletion,
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
  it("process boundary 后仅允许显式 final_answer 和无 scope legacy delta 进入 final overlay", () => {
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
    ).toBe(true);
  });

  it("process boundary 后带 itemId 的 legacy delta 必须被 suppress", () => {
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
    ).toBe(false);
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

    requestState.hasAssistantTextAfterLatestFinalAnswerRequiredProcessBoundary =
      true;
    expect(shouldCommitActiveTextSegmentAsFinal(requestState)).toBe(false);

    clearActiveTextSegmentState(requestState);
    noteActiveFinalTextSegment({
      event: textDelta({ phase: "final_answer" }),
      requestState,
    });
    expect(shouldCommitActiveTextSegmentAsFinal(requestState)).toBe(true);
  });

  it("完成态应只取 process boundary 后的 legacy final 正文", () => {
    const requestState = createRequestState({
      accumulatedContent: "工具前导语。最终正文。",
      activeTextSegmentStartOffset: "工具前导语。".length,
      hasFinalAnswerRequiredProcessBoundary: true,
      hasAssistantTextAfterLatestFinalAnswerRequiredProcessBoundary: true,
    });

    expect(resolveAccumulatedFinalContentForCompletion(requestState)).toBe(
      "最终正文。",
    );
  });

  it("只有带 provenance 的 active text segment 才能提交为过程文本", () => {
    expect(hasActiveTextSegmentProvenance(createRequestState())).toBe(false);
    expect(
      hasActiveTextSegmentProvenance(
        createRequestState({ activeTextSegmentSequence: 1 }),
      ),
    ).toBe(true);
  });
});
