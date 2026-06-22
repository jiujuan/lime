import { describe, expect, it } from "vitest";
import type { AgentThreadItem } from "@/lib/api/agentProtocol";
import {
  appendTextWithOverlapFallback,
  buildStreamedReasoningItem,
  isStreamedReasoningTimelineItem,
  removeStreamedReasoningTimelineItems,
  resetStreamedReasoningSegment,
  type AgentStreamReasoningTimelineState,
} from "./agentStreamReasoningTimeline";

describe("agentStreamReasoningTimeline", () => {
  it("应按 overlap 追加 thinking delta，避免重复尾段", () => {
    expect(appendTextWithOverlapFallback("", "先分析。")).toBe("先分析。");
    expect(appendTextWithOverlapFallback("先分析。", "")).toBe("先分析。");
    expect(appendTextWithOverlapFallback("先分析。", "先分析。再查证。")).toBe(
      "先分析。再查证。",
    );
    expect(appendTextWithOverlapFallback("先分析。再", "再查证。")).toBe(
      "先分析。再查证。",
    );
    expect(appendTextWithOverlapFallback("先分析。", "先分析。")).toBe(
      "先分析。",
    );
  });

  it("应用 queued turn 构造本地临时 reasoning item 并复用稳定 id", () => {
    const requestState: AgentStreamReasoningTimelineState = {
      queuedTurnId: " turn-1 ",
      streamedReasoningText: " 先分析。 ",
    };

    const firstItem = buildStreamedReasoningItem({
      activeSessionId: "session-1",
      now: "2026-06-22T10:00:00.000Z",
      requestState,
    });

    expect(firstItem).toEqual({
      id: "streamed-reasoning:turn-1:local-1",
      thread_id: "session-1",
      turn_id: "turn-1",
      sequence: 0,
      status: "in_progress",
      started_at: "2026-06-22T10:00:00.000Z",
      updated_at: "2026-06-22T10:00:00.000Z",
      type: "reasoning",
      text: "先分析。",
    });
    expect(requestState.streamedReasoningItemId).toBe(
      "streamed-reasoning:turn-1:local-1",
    );
    expect(requestState.streamedReasoningSegmentCounter).toBe(1);

    requestState.streamedReasoningText = "先分析。再查证。";
    const updatedItem = buildStreamedReasoningItem({
      activeSessionId: "session-1",
      now: "2026-06-22T10:00:01.000Z",
      requestState,
    });

    expect(updatedItem).toEqual({
      ...firstItem,
      updated_at: "2026-06-22T10:00:01.000Z",
      text: "先分析。再查证。",
    });
  });

  it("有事件 sequence 时应生成 Codex 顺序稳定的 streamed reasoning id", () => {
    const requestState: AgentStreamReasoningTimelineState = {
      queuedTurnId: "queued-turn",
      currentTurnId: "current-turn",
      streamedReasoningText: "先确认目标。",
    };

    const item = buildStreamedReasoningItem({
      activeSessionId: "session-1",
      now: "2026-06-22T10:00:02.000Z",
      requestState,
      sequence: 3,
    });

    expect(item).toMatchObject({
      id: "streamed-reasoning:current-turn:3",
      turn_id: "current-turn",
      sequence: 3,
      type: "reasoning",
      text: "先确认目标。",
    });
    expect(requestState.streamedReasoningSequence).toBe(3);
    expect(requestState.streamedReasoningSegmentCounter).toBeUndefined();
  });

  it("应只移除指定 turn 的本地 streamed reasoning item", () => {
    const streamedA: AgentThreadItem = {
      id: "streamed-reasoning:turn-a:local-1",
      thread_id: "session-1",
      turn_id: "turn-a",
      sequence: 0,
      status: "in_progress",
      started_at: "2026-06-22T10:00:00.000Z",
      updated_at: "2026-06-22T10:00:00.000Z",
      type: "reasoning",
      text: "本地思考 A",
    };
    const streamedB: AgentThreadItem = {
      ...streamedA,
      id: "streamed-reasoning:turn-b:local-1",
      turn_id: "turn-b",
      text: "本地思考 B",
    };
    const actualReasoning: AgentThreadItem = {
      ...streamedA,
      id: "reasoning-actual",
      type: "reasoning",
      text: "后端正式思考",
    };
    const items = [streamedA, streamedB, actualReasoning];

    expect(isStreamedReasoningTimelineItem(streamedA, "turn-a")).toBe(true);
    expect(isStreamedReasoningTimelineItem(actualReasoning, "turn-a")).toBe(
      false,
    );
    expect(removeStreamedReasoningTimelineItems(items, "turn-a")).toEqual([
      streamedB,
      actualReasoning,
    ]);
    expect(removeStreamedReasoningTimelineItems(items, "missing-turn")).toBe(
      items,
    );
  });

  it("reset 应只清空当前片段，不重置本地计数器", () => {
    const requestState: AgentStreamReasoningTimelineState = {
      queuedTurnId: "turn-1",
      streamedReasoningItemId: "streamed-reasoning:turn-1:local-1",
      streamedReasoningText: "片段一",
      streamedReasoningStartedAt: "2026-06-22T10:00:00.000Z",
      streamedReasoningSequence: null,
      streamedReasoningSegmentCounter: 1,
    };

    resetStreamedReasoningSegment(requestState);

    expect(requestState).toEqual({
      queuedTurnId: "turn-1",
      streamedReasoningItemId: null,
      streamedReasoningText: "",
      streamedReasoningStartedAt: null,
      streamedReasoningSequence: null,
      streamedReasoningSegmentCounter: 1,
    });
  });
});
