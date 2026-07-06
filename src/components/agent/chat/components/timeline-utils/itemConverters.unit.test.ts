import { describe, expect, it } from "vitest";
import type { AgentThreadItem } from "@/lib/api/agentProtocol";
import { toToolCallState } from "./itemConverters";

describe("timeline item converters", () => {
  it("应把 thread item structuredContent 传入 toolCall result", () => {
    const item: AgentThreadItem = {
      id: "tool-mcp-structured",
      thread_id: "thread-1",
      turn_id: "turn-1",
      sequence: 2,
      type: "tool_call",
      status: "completed",
      tool_name: "mcp__docs__diagnostic_probe",
      arguments: { query: "structured content" },
      output: JSON.stringify({
        request_metadata: { projection: "mcp_tool_result_projection" },
        diagnostics: { elapsed_ms: 12 },
      }),
      structured_content: {
        answer: "MCP 结构化答案已进入 Agent Chat GUI",
        ids: ["doc-structured-1"],
      },
      started_at: "2026-06-21T13:10:00.000Z",
      completed_at: "2026-06-21T13:10:01.000Z",
      updated_at: "2026-06-21T13:10:01.000Z",
    };

    expect(toToolCallState(item)?.result).toMatchObject({
      structuredContent: {
        answer: "MCP 结构化答案已进入 Agent Chat GUI",
        ids: ["doc-structured-1"],
      },
      structured_content: {
        answer: "MCP 结构化答案已进入 Agent Chat GUI",
        ids: ["doc-structured-1"],
      },
    });
  });
});
