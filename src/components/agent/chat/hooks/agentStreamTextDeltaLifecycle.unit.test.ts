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
  shouldRouteLegacyTextDeltaAfterProcessBoundaryToFinalOverlay,
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
  it("process boundary 后仅允许显式 final_answer 进入 final overlay", () => {
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

  it("process boundary 后仅 suppress 不晚于 boundary 的 legacy delta", () => {
    const requestState = createRequestState({
      hasFinalAnswerRequiredProcessBoundary: true,
      maxFinalAnswerRequiredProcessEventSequence: 3,
    });

    expect(
      shouldSuppressLegacyTextDeltaAfterProcessBoundary({
        event: textDelta({ itemId: "legacy-preface", sequence: 2 }),
        requestState,
      }),
    ).toBe(true);
    expect(
      shouldSuppressLegacyTextDeltaAfterProcessBoundary({
        event: textDelta({ sequence: 3 }),
        requestState,
      }),
    ).toBe(true);
    expect(
      shouldSuppressLegacyTextDeltaAfterProcessBoundary({
        event: textDelta({ sequence: 4 }),
        requestState,
      }),
    ).toBe(false);
    expect(
      shouldSuppressLegacyTextDeltaAfterProcessBoundary({
        event: textDelta({ itemId: "legacy-item-without-sequence" }),
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

  it("process boundary 后晚到 legacy assistant text 应进入 final overlay", () => {
    const requestState = createRequestState({
      hasFinalAnswerRequiredProcessBoundary: true,
      maxFinalAnswerRequiredProcessEventSequence: 3,
    });

    expect(
      shouldRouteLegacyTextDeltaAfterProcessBoundaryToFinalOverlay({
        event: textDelta({ sequence: 4 }),
        requestState,
      }),
    ).toBe(true);
    expect(
      shouldRouteLegacyTextDeltaAfterProcessBoundaryToFinalOverlay({
        event: textDelta({ sequence: 3 }),
        requestState,
      }),
    ).toBe(false);
    expect(
      shouldRouteLegacyTextDeltaAfterProcessBoundaryToFinalOverlay({
        event: textDelta({ phase: "commentary", sequence: 4 }),
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

    requestState.activeTextSegmentSequence = 4;
    requestState.maxFinalAnswerRequiredProcessEventSequence = 3;
    expect(shouldCommitActiveTextSegmentAsFinal(requestState)).toBe(true);

    clearActiveTextSegmentState(requestState);
    noteActiveFinalTextSegment({
      event: textDelta(),
      requestState,
    });
    expect(shouldCommitActiveTextSegmentAsFinal(requestState)).toBe(false);

    clearActiveTextSegmentState(requestState);
    noteActiveFinalTextSegment({
      event: textDelta({ phase: "final_answer" }),
      requestState,
    });
    expect(shouldCommitActiveTextSegmentAsFinal(requestState)).toBe(true);
  });

  it("完成态只从显式 final_answer active segment 截取最终正文", () => {
    const requestState = createRequestState({
      accumulatedContent: "工具前导语。最终正文。",
      activeTextSegmentStartOffset: "工具前导语。".length,
      activeTextSegmentFinalEligibility: "explicit_final",
      hasFinalAnswerRequiredProcessBoundary: true,
      hasAssistantTextAfterLatestFinalAnswerRequiredProcessBoundary: true,
    });

    expect(resolveAccumulatedFinalContentForCompletion(requestState)).toBe(
      "最终正文。",
    );
  });

  it("完成态不得从 legacy_unphased active segment 猜测最终正文", () => {
    const requestState = createRequestState({
      accumulatedContent: "工具前导语。旧格式晚到文本。",
      activeTextSegmentStartOffset: "工具前导语。".length,
      activeTextSegmentFinalEligibility: "legacy_unphased",
      hasFinalAnswerRequiredProcessBoundary: true,
      hasAssistantTextAfterLatestFinalAnswerRequiredProcessBoundary: true,
    });

    expect(resolveAccumulatedFinalContentForCompletion(requestState)).toBe(
      "工具前导语。旧格式晚到文本。",
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
