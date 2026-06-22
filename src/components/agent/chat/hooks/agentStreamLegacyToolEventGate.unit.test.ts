import { describe, expect, it } from "vitest";
import type { AgentThreadItem } from "@/lib/api/agentProtocol";
import {
  shouldLetLegacyToolEventUpdateMessageLayer,
  type AgentStreamLegacyToolEvent,
} from "./agentStreamLegacyToolEventGate";

function buildToolItem(
  metadata?: Record<string, unknown>,
): AgentThreadItem {
  return {
    id: "tool-1",
    thread_id: "session-1",
    turn_id: "turn-1",
    sequence: 2,
    status: "in_progress",
    started_at: "2026-06-22T10:00:00.000Z",
    updated_at: "2026-06-22T10:00:00.000Z",
    type: "tool_call",
    tool_name: "web_search",
    metadata,
  };
}

describe("agentStreamLegacyToolEventGate", () => {
  it("已有 item lifecycle 工具项时应阻止 legacy 事件重复更新 message 层", () => {
    expect(
      shouldLetLegacyToolEventUpdateMessageLayer({
        event: {
          type: "tool_end",
          tool_id: "tool-1",
          turn_id: " turn-1 ",
        } as AgentStreamLegacyToolEvent,
        fallbackTurnId: null,
        items: [buildToolItem({ source: "item_lifecycle" })],
      }),
    ).toBe(false);
  });

  it("legacy 投影出的工具项仍允许 legacy 事件补齐 message 层", () => {
    expect(
      shouldLetLegacyToolEventUpdateMessageLayer({
        event: {
          type: "tool_end",
          tool_id: "tool-1",
        } as AgentStreamLegacyToolEvent,
        fallbackTurnId: "turn-1",
        items: [
          buildToolItem({
            runtime_event_source: "legacy_tool_event",
          }),
        ],
      }),
    ).toBe(true);
  });

  it("turn 不匹配时不应把其他 turn 的 item lifecycle 当作拦截依据", () => {
    expect(
      shouldLetLegacyToolEventUpdateMessageLayer({
        event: {
          type: "tool_progress",
          tool_id: "tool-1",
          turn_id: "turn-2",
        } as AgentStreamLegacyToolEvent,
        fallbackTurnId: "turn-1",
        items: [buildToolItem({ source: "item_lifecycle" })],
      }),
    ).toBe(true);
  });
});
