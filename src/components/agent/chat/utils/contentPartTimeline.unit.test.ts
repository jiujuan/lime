import { describe, expect, it } from "vitest";
import {
  isProcessBoundaryContentPart,
  shouldAppendCompletionSuffixToTextPart,
} from "./contentPartTimeline";

describe("contentPartTimeline", () => {
  it("应把 commentary text 视为过程边界，但 final_answer text 仍是最终正文", () => {
    expect(
      isProcessBoundaryContentPart({
        type: "text",
        text: "我先联网核实目标页面来源。",
        metadata: {
          source: "agent_text_delta",
          itemId: "agent-message-commentary",
          phase: "commentary",
          sequence: 2,
          turnId: "turn-web-tools",
        },
      }),
    ).toBe(true);

    expect(
      isProcessBoundaryContentPart({
        type: "text",
        text: "网页搜索渲染结论。",
        metadata: {
          source: "agent_text_delta",
          itemId: "agent-message-final",
          phase: "final_answer",
          sequence: 10,
          turnId: "turn-web-tools",
        },
      }),
    ).toBe(false);
  });

  it("completion suffix 不应追加到早于后续过程边界的 text", () => {
    const parts = [
      {
        type: "text" as const,
        text: "我先联网核实目标页面来源。",
        metadata: {
          source: "agent_text_delta",
          itemId: "agent-message-commentary",
          phase: "commentary",
          sequence: 2,
          turnId: "turn-web-tools",
        },
      },
      {
        type: "tool_use" as const,
        toolCall: {
          id: "web-search",
          name: "WebSearch",
          arguments: '{"query":"Lime WebSearch rendering"}',
          status: "completed" as const,
        },
        metadata: {
          sequence: 3,
        },
      },
    ];

    expect(shouldAppendCompletionSuffixToTextPart(parts, 0)).toBe(false);
  });
});
