import { describe, expect, it } from "vitest";

import type { AgentThreadItem } from "../../types";
import { resolveThinkingDisplayText } from "./displayTextResolvers";

function reasoningItem(
  overrides: Partial<Extract<AgentThreadItem, { type: "reasoning" }>>,
): Extract<AgentThreadItem, { type: "reasoning" }> {
  return {
    id: "reasoning-1",
    thread_id: "thread-1",
    turn_id: "turn-1",
    sequence: 1,
    status: "completed",
    started_at: "2026-05-30T00:00:00.000Z",
    updated_at: "2026-05-30T00:00:00.000Z",
    type: "reasoning",
    text: "",
    ...overrides,
  };
}

describe("resolveReasoningDisplayText", () => {
  it("timeline reasoning 应保留来源文本，不再按内部短语猜测过滤", () => {
    const text = resolveThinkingDisplayText(
      reasoningItem({
        summary: ["Finding latest news.", "正在核对来源可信度。"],
        text: "Investigating tool calls for WebSearch.\n已整理可用来源。",
      }),
    );

    expect(text).toContain("Finding latest news");
    expect(text).toContain("正在核对来源可信度。");
    expect(text).toContain("Investigating tool calls");
    expect(text).toContain("已整理可用来源。");
  });

  it("英文诊断也应作为 reasoning 来源文本保留", () => {
    const text = resolveThinkingDisplayText(
      reasoningItem({
        summary: ["Finding latest news."],
        text: "I'm thinking about available tools.",
      }),
    );

    expect(text).toContain("Finding latest news.");
    expect(text).toContain("I'm thinking about available tools.");
  });
});
