import { describe, expect, it } from "vitest";

import { parseAgentEvent } from "./agentProtocol";

describe("agentProtocol structuredContent tool events", () => {
  it("应保留 App Server tool.result 的 structuredContent 供 GUI 工具过程展示", () => {
    expect(
      parseAgentEvent({
        type: "tool.result",
        toolCallId: "tool-mcp-structured",
        toolName: "mcp__docs__diagnostic_probe",
        output: JSON.stringify({
          request_metadata: { projection: "mcp_tool_result_projection" },
          diagnostics: { elapsed_ms: 12 },
        }),
        result: {
          success: true,
          output: JSON.stringify({
            request_metadata: { projection: "mcp_tool_result_projection" },
            diagnostics: { elapsed_ms: 12 },
          }),
          structuredContent: {
            answer: "MCP 结构化答案已进入 Agent Chat GUI",
            ids: ["doc-structured-1"],
          },
        },
      }),
    ).toEqual({
      type: "tool_end",
      tool_id: "tool-mcp-structured",
      result: {
        success: true,
        output:
          '{"request_metadata":{"projection":"mcp_tool_result_projection"},"diagnostics":{"elapsed_ms":12}}',
        error: undefined,
        images: undefined,
        metadata: undefined,
        structuredContent: {
          answer: "MCP 结构化答案已进入 Agent Chat GUI",
          ids: ["doc-structured-1"],
        },
        structured_content: {
          answer: "MCP 结构化答案已进入 Agent Chat GUI",
          ids: ["doc-structured-1"],
        },
      },
    });
  });
});
