import { describe, expect, it } from "vitest";
import {
  findReadModelToolCallWithStructuredContent,
  readToolCallStructuredContent,
} from "./claw-chat-current-fixture-read-model-waits.mjs";

describe("readToolCallStructuredContent", () => {
  it("reads the current v2 standalone JSON structured block", () => {
    const structuredContent = readToolCallStructuredContent({
      contentItems: [
        {
          inputText: {
            text: JSON.stringify({
              request_metadata: { projection: "mcp_tool_result_projection" },
              diagnostics: { elapsed_ms: 12 },
            }),
          },
        },
        {
          inputText: {
            text: JSON.stringify({
              answer: "MCP 结构化答案已进入 Agent Chat GUI",
              ids: ["doc-structured-1"],
            }),
          },
        },
      ],
    });

    expect(structuredContent).toEqual({
      answer: "MCP 结构化答案已进入 Agent Chat GUI",
      ids: ["doc-structured-1"],
    });
  });

  it("keeps accepting the nested structuredContent shape", () => {
    expect(
      readToolCallStructuredContent({
        contentItems: [
          {
            inputText: {
              text: JSON.stringify({ structuredContent: { matches: 3 } }),
            },
          },
        ],
      }),
    ).toEqual({ matches: 3 });
  });

  it("prefers the complete canonical tool projection for the same v2 identity", () => {
    const toolCall = findReadModelToolCallWithStructuredContent(
      {
        thread: {
          turns: [
            {
              id: "turn-1",
              items: [
                {
                  id: "tool-1",
                  type: "dynamicToolCall",
                  tool: "mcp__docs__diagnostic_probe",
                  contentItems: [
                    {
                      inputText: {
                        text: JSON.stringify({ diagnostics: { elapsed_ms: 12 } }),
                      },
                    },
                  ],
                },
              ],
            },
          ],
        },
        detail: {
          thread_read: {
            tool_calls: [
              {
                id: "tool-1",
                tool_name: "mcp__docs__diagnostic_probe",
                structured_content: { answer: "canonical result" },
              },
            ],
          },
        },
      },
      "tool-1",
      "mcp__docs__diagnostic_probe",
    );

    expect(toolCall?.structured_content).toEqual({ answer: "canonical result" });
  });
});
