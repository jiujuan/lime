import { describe, expect, it } from "vitest";
import {
  buildHistoricalHydrationProjectionEvents,
  buildHistoricalMarkdownHydrationIndexByMessageId,
  buildHistoricalMarkdownHydrationTargets,
  countDeferredHistoricalContentParts,
  countDeferredHistoricalMarkdown,
  hasStructuredHistoricalContentHint,
  isHistoricalAssistantMessageHydrationCandidate,
  shouldDeferHistoricalAssistantMessageDetails,
} from "./historicalMessageHydrationProjection";

function message(
  id: string,
  overrides: Partial<{
    role: "user" | "assistant";
    content: string;
    isThinking: boolean;
    thinkingContent: string;
    toolCalls: unknown[];
    actionRequests: unknown[];
    contentParts: unknown[];
  }> = {},
) {
  return {
    id,
    role: overrides.role ?? "assistant",
    content: overrides.content ?? "plain markdown",
    isThinking: overrides.isThinking,
    thinkingContent: overrides.thinkingContent,
    toolCalls: overrides.toolCalls,
    actionRequests: overrides.actionRequests,
    contentParts: overrides.contentParts,
  };
}

const restoredState = {
  isRestoredHistoryWindow: true,
  focusedTimelineItemId: null,
  isSending: false,
  activeCurrentTurnId: null,
};

describe("historicalMessageHydrationProjection", () => {
  it("应识别需要保留完整结构渲染的历史内容", () => {
    expect(hasStructuredHistoricalContentHint("<a2ui-form />")).toBe(true);
    expect(hasStructuredHistoricalContentHint("```a2ui\n{}\n```")).toBe(true);
    expect(
      hasStructuredHistoricalContentHint("<document>body</document>"),
    ).toBe(true);
    expect(hasStructuredHistoricalContentHint("普通 markdown")).toBe(false);
  });

  it("仅旧会话中的普通 assistant 历史消息可进入延迟 hydration", () => {
    expect(
      isHistoricalAssistantMessageHydrationCandidate(
        message("assistant-a"),
        restoredState,
      ),
    ).toBe(true);
    expect(
      isHistoricalAssistantMessageHydrationCandidate(
        message("user-a", { role: "user" }),
        restoredState,
      ),
    ).toBe(false);
    expect(
      isHistoricalAssistantMessageHydrationCandidate(
        message("thinking-a", { isThinking: true }),
        restoredState,
      ),
    ).toBe(false);
    expect(
      isHistoricalAssistantMessageHydrationCandidate(message("sending-a"), {
        ...restoredState,
        isSending: true,
      }),
    ).toBe(false);
  });

  it("应只为普通 markdown 历史 assistant 生成 hydration 目标", () => {
    const targets = buildHistoricalMarkdownHydrationTargets({
      messages: [
        message("assistant-a"),
        message("assistant-structured", { content: "<write_file />" }),
        message("user-a", { role: "user" }),
        message("assistant-empty", { content: "   " }),
      ],
      state: restoredState,
    });

    expect(targets).toEqual(["assistant-a"]);
  });

  it("hydration 计数未覆盖目标前应延迟消息细节", () => {
    const hydrationIndex = buildHistoricalMarkdownHydrationIndexByMessageId([
      "assistant-a",
    ]);

    expect(
      shouldDeferHistoricalAssistantMessageDetails({
        message: message("assistant-a"),
        state: restoredState,
        isHistoricalTimelineReady: true,
        hydrationIndexByMessageId: hydrationIndex,
        hydratedHistoricalMarkdownCount: 0,
      }),
    ).toBe(true);
    expect(
      shouldDeferHistoricalAssistantMessageDetails({
        message: message("assistant-a"),
        state: restoredState,
        isHistoricalTimelineReady: true,
        hydrationIndexByMessageId: hydrationIndex,
        hydratedHistoricalMarkdownCount: 1,
      }),
    ).toBe(false);
  });

  it("应统计仍被延迟的历史 contentParts 与 markdown 数量", () => {
    const hydrationIndex = buildHistoricalMarkdownHydrationIndexByMessageId([
      "assistant-a",
      "assistant-b",
    ]);

    expect(
      countDeferredHistoricalContentParts({
        messages: [
          message("assistant-a", { contentParts: [{ type: "text" }] }),
          message("assistant-b"),
        ],
        state: restoredState,
        isHistoricalTimelineReady: true,
        hydrationIndexByMessageId: hydrationIndex,
        hydratedHistoricalMarkdownCount: 0,
      }),
    ).toBe(1);
    expect(
      countDeferredHistoricalMarkdown({
        isRestoredHistoryWindow: true,
        targetCount: 2,
        hydratedHistoricalMarkdownCount: 1,
      }),
    ).toBe(1);
  });

  it("应为旧会话 hydration 输出 stale-safe AgentUI envelope", () => {
    const events = buildHistoricalHydrationProjectionEvents(
      {
        sessionId: "session-history-1",
        threadId: "thread-history-1",
        recordReason: "restored-window",
        isRestoringSession: true,
        isRestoredHistoryWindow: true,
        isHistoricalTimelineReady: false,
        canBuildHistoricalTimeline: false,
        shouldDeferHistoricalTimeline: true,
        shouldDeferThreadItemsScan: true,
        shouldDeferTailRuntimeStatusLine: true,
        hiddenHistoryCount: 20,
        persistedHiddenHistoryCount: 40,
        targetCount: 3,
        hydratedHistoricalMarkdownCount: 1,
        historicalMarkdownDeferredCount: 2,
        historicalContentPartsDeferredCount: 1,
        messagesCount: 50,
        visibleMessagesCount: 10,
        renderedMessagesCount: 5,
        renderedTurnsCount: 2,
        threadItemsCount: 120,
        messageListComputeMs: 9.5,
      },
      {
        sequence: 30,
        timestamp: "2026-05-09T00:00:00.000Z",
      },
    );

    expect(events).toHaveLength(3);
    expect(events[0]).toMatchObject({
      type: "session.hydrated",
      sourceType: "hydration_projection",
      sequence: 30,
      sessionId: "session-history-1",
      threadId: "thread-history-1",
      owner: "session",
      scope: "session",
      phase: "hydrating",
      surface: "session_tabs",
      persistence: "snapshot",
      payload: {
        recordReason: "restored-window",
        historicalMarkdownDeferredCount: 2,
        historicalContentPartsDeferredCount: 1,
      },
    });
    expect(events[1]).toMatchObject({
      type: "messages.snapshot",
      sequence: 31,
      owner: "session",
      scope: "thread",
      phase: "hydrating",
    });
    expect(events[2]).toMatchObject({
      type: "diagnostic.changed",
      sequence: 32,
      owner: "diagnostics",
      scope: "session",
      phase: "hydrating",
      refs: {
        diagnosticKeys: ["historical_hydration_stale_window"],
      },
      payload: {
        diagnosticKey: "historical_hydration_stale_window",
        stale: true,
      },
    });
  });
});
