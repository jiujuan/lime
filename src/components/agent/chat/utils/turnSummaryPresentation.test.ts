import { describe, expect, it } from "vitest";
import type { AgentThreadItem } from "../types";
import {
  isRuntimeStatusDiagnosticsOnly,
  isRuntimeStatusTurnSummaryItem,
  shouldHideTurnSummaryFromConversation,
} from "./turnSummaryPresentation";

function turnSummary(
  overrides: Partial<Extract<AgentThreadItem, { type: "turn_summary" }>>,
): Extract<AgentThreadItem, { type: "turn_summary" }> {
  return {
    id: "summary-1",
    thread_id: "thread-1",
    turn_id: "turn-1",
    sequence: 1,
    status: "completed",
    started_at: "2026-05-12T00:00:00.000Z",
    completed_at: "2026-05-12T00:00:01.000Z",
    updated_at: "2026-05-12T00:00:01.000Z",
    type: "turn_summary",
    text: "直接回答优先\n当前请求无需默认升级为搜索或任务。",
    ...overrides,
  };
}

describe("turnSummaryPresentation", () => {
  it("通过结构化 metadata 隐藏 diagnostics-only runtime status", () => {
    const item = turnSummary({
      metadata: {
        sourceType: "runtime_status",
        surface: "runtime_status",
        visibility: "diagnostics",
        persistence: "transient",
        agentui: {
          eventClass: "run.status",
          surface: "runtime_status",
          visibility: "diagnostics",
        },
      },
    });

    expect(isRuntimeStatusTurnSummaryItem(item)).toBe(true);
    expect(shouldHideTurnSummaryFromConversation(item)).toBe(true);
  });

  it("不再通过中英文文案猜测内部过程", () => {
    const item = turnSummary({
      id: "summary-plain-text",
      metadata: undefined,
    });

    expect(isRuntimeStatusTurnSummaryItem(item)).toBe(false);
    expect(shouldHideTurnSummaryFromConversation(item)).toBe(false);
  });

  it("显式用户可见 metadata 优先于 runtime surface", () => {
    const item = turnSummary({
      metadata: {
        sourceType: "runtime_status",
        surface: "runtime_status",
        visibility: "conversation",
      },
    });

    expect(isRuntimeStatusTurnSummaryItem(item)).toBe(true);
    expect(shouldHideTurnSummaryFromConversation(item)).toBe(false);
  });

  it("runtime status diagnostics 判断只读取 metadata，不读取展示文案", () => {
    expect(
      isRuntimeStatusDiagnosticsOnly({
        phase: "routing",
        title: "直接回答优先",
        detail: "当前请求无需默认升级为搜索或任务。",
      }),
    ).toBe(false);

    expect(
      isRuntimeStatusDiagnosticsOnly({
        phase: "routing",
        title: "Any status",
        detail: "Any detail",
        metadata: {
          sourceType: "runtime_status",
          visibility: "diagnostics",
          persistence: "transient",
        },
      }),
    ).toBe(true);
  });
});
