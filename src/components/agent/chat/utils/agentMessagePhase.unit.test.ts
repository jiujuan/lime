import { describe, expect, it } from "vitest";

import {
  isAgentMessageCommentaryPhase,
  isAgentMessageFinalAnswerPhase,
  resolveFinalAgentMessageItemIds,
  shouldUseAgentMessageAsFinalText,
} from "./agentMessagePhase";

describe("agentMessagePhase", () => {
  it("只允许 final_answer 与 legacy 空 phase 进入最终正文", () => {
    expect(shouldUseAgentMessageAsFinalText(undefined)).toBe(true);
    expect(shouldUseAgentMessageAsFinalText(null)).toBe(true);
    expect(shouldUseAgentMessageAsFinalText("")).toBe(true);
    expect(shouldUseAgentMessageAsFinalText(" final_answer ")).toBe(true);
    expect(shouldUseAgentMessageAsFinalText("commentary")).toBe(false);
    expect(shouldUseAgentMessageAsFinalText("analysis")).toBe(false);
  });

  it("应识别 commentary 阶段", () => {
    expect(isAgentMessageCommentaryPhase("commentary")).toBe(true);
    expect(isAgentMessageCommentaryPhase(" Commentary ")).toBe(true);
    expect(isAgentMessageCommentaryPhase("final_answer")).toBe(false);
    expect(isAgentMessageCommentaryPhase(undefined)).toBe(false);
  });

  it("应识别 final_answer 阶段", () => {
    expect(isAgentMessageFinalAnswerPhase("final_answer")).toBe(true);
    expect(isAgentMessageFinalAnswerPhase(" Final_Answer ")).toBe(true);
    expect(isAgentMessageFinalAnswerPhase("commentary")).toBe(false);
    expect(isAgentMessageFinalAnswerPhase(undefined)).toBe(false);
  });

  it("显式 final_answer 应优先作为最终正文", () => {
    const selected = resolveFinalAgentMessageItemIds([
      {
        id: "assistant-commentary",
        type: "agent_message",
        turn_id: "turn-1",
        sequence: 2,
        phase: "commentary",
        text: "先检索多组来源。",
      },
      {
        id: "assistant-final",
        type: "agent_message",
        turn_id: "turn-1",
        sequence: 6,
        phase: "final_answer",
        text: "## 最终简报",
      },
    ]);

    expect([...selected]).toEqual(["assistant-final"]);
  });

  it("旧数据缺少 phase 时每个 turn 只选最后一条 agent_message", () => {
    const selected = resolveFinalAgentMessageItemIds([
      {
        id: "assistant-turn-1-process",
        type: "agent_message",
        turn_id: "turn-1",
        sequence: 2,
        text: "我会先检索来源。",
      },
      {
        id: "tool-turn-1",
        type: "tool_call",
        turn_id: "turn-1",
        sequence: 3,
      },
      {
        id: "assistant-turn-1-final",
        type: "agent_message",
        turn_id: "turn-1",
        sequence: 4,
        text: "## 第一轮结果",
      },
      {
        id: "assistant-turn-2-final",
        type: "agent_message",
        turn_id: "turn-2",
        sequence: 1,
        text: "## 第二轮结果",
      },
    ]);

    expect([...selected].sort()).toEqual([
      "assistant-turn-1-final",
      "assistant-turn-2-final",
    ]);
  });
});
