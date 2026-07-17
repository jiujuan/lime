import { describe, expect, it } from "vitest";

import type { ContentPart } from "../types";
import { resolveProcessSeparatedContentParts } from "./messageListProjectionContentParts";

function toolPart(id: string): ContentPart {
  const timestamp = new Date("2026-07-16T10:00:00.000Z");
  return {
    type: "tool_use",
    toolCall: {
      id,
      name: "exec_command",
      status: "completed",
      startTime: timestamp,
      endTime: timestamp,
      result: { success: true, output: "ok" },
    },
  };
}

describe("messageListProjectionContentParts", () => {
  it("过程边界之间的多段 explicit final 应保留各自 canonical identity", () => {
    const parts: ContentPart[] = [
      toolPart("tool-before-first-final"),
      {
        type: "text",
        text: "第一段最终答复",
        metadata: {
          phase: "final_answer",
          threadItemId: "first-explicit-final",
        },
      },
      toolPart("tool-before-second-final"),
      {
        type: "text",
        text: "第二段最终答复",
        metadata: {
          phase: "final_answer",
          threadItemId: "second-explicit-final",
        },
      },
    ];

    expect(
      resolveProcessSeparatedContentParts(parts)
        ?.filter((part) => part.type === "text")
        .map((part) => ({
          text: part.text,
          threadItemId: part.metadata?.threadItemId,
        })),
    ).toEqual([
      {
        text: "第一段最终答复",
        threadItemId: "first-explicit-final",
      },
      {
        text: "第二段最终答复",
        threadItemId: "second-explicit-final",
      },
    ]);
  });
});
