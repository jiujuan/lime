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
  it("timeline reasoning 应过滤内部英文工具调查句", () => {
    const text = resolveThinkingDisplayText(
      reasoningItem({
        summary: ["Finding latest news.", "正在核对来源可信度。"],
        text: "Investigating tool calls for WebSearch.\n已整理可用来源。",
      }),
    );

    expect(text).toContain("正在核对来源可信度。");
    expect(text).toContain("已整理可用来源。");
    expect(text).not.toContain("Finding latest news");
    expect(text).not.toContain("Investigating tool calls");
  });

  it("内部诊断全部被过滤时应返回空文本", () => {
    const text = resolveThinkingDisplayText(
      reasoningItem({
        summary: ["Finding latest news."],
        text: "I'm thinking about available tools.",
      }),
    );

    expect(text).toBe("");
  });
});
