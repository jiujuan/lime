import { describe, expect, it } from "vitest";

import { summarizeProductionTurnStartTrace } from "./content-factory-production-turn-start-trace.mjs";

describe("content factory production turn-start trace", () => {
  it("accepts Gate B matchingTurn evidence for the requested session", () => {
    const result = summarizeProductionTurnStartTrace(
      {
        matchingTurn: {
          command: "app_server_handle_json_lines",
          metadata: {
            secret: "should not be copied",
          },
          sessionId: "sess_prod",
          status: "success",
          text: "@写文章 should not be copied",
          transport: "electron-ipc",
          turnId: "turn_prod",
        },
      },
      { expectedSessionId: "sess_prod" },
    );

    expect(result).toEqual({
      command: "app_server_handle_json_lines",
      matched: true,
      method: "agentSession/turn/start",
      present: true,
      sessionId: "sess_prod",
      sessionMatched: true,
      status: "success",
      transport: "electron-ipc",
      turnId: "turn_prod",
    });
    expect(JSON.stringify(result)).not.toContain("@写文章");
    expect(JSON.stringify(result)).not.toContain("should not be copied");
  });

  it("fails closed when the trace belongs to another session", () => {
    const result = summarizeProductionTurnStartTrace(
      {
        matchingTurn: {
          command: "app_server_handle_json_lines",
          sessionId: "sess_other",
          status: "success",
          transport: "electron-ipc",
          turnId: "turn_other",
        },
      },
      { expectedSessionId: "sess_prod" },
    );

    expect(result).toMatchObject({
      matched: false,
      present: true,
      sessionId: "sess_other",
      sessionMatched: false,
    });
  });

  it("accepts sanitized appServerInvokeEntries evidence", () => {
    const result = summarizeProductionTurnStartTrace(
      {
        appServerInvokeEntries: [
          {
            appServerRequests: [
              {
                method: "agentSession/turn/start",
                params: {
                  sessionId: "sess_prod",
                  turnId: "turn_prod",
                },
              },
            ],
            command: "app_server_handle_json_lines",
            status: "success",
            transport: "electron-ipc",
          },
        ],
      },
      { expectedSessionId: "sess_prod" },
    );

    expect(result).toMatchObject({
      matched: true,
      method: "agentSession/turn/start",
      present: true,
      sessionId: "sess_prod",
      turnId: "turn_prod",
    });
  });

  it("accepts raw invoke trace entries without copying request params", () => {
    const result = summarizeProductionTurnStartTrace(
      [
        {
          args_preview: {
            request: {
              lines: [
                JSON.stringify({
                  id: "turn",
                  jsonrpc: "2.0",
                  method: "agentSession/turn/start",
                  params: {
                    prompt: "@写文章 should not be copied",
                    sessionId: "sess_prod",
                    turnId: "turn_prod",
                  },
                }),
              ],
            },
          },
          command: "app_server_handle_json_lines",
          status: "success",
          transport: "electron-ipc",
        },
      ],
      { expectedSessionId: "sess_prod" },
    );

    expect(result).toMatchObject({
      matched: true,
      present: true,
      sessionId: "sess_prod",
      turnId: "turn_prod",
    });
    expect(JSON.stringify(result)).not.toContain("prompt");
    expect(JSON.stringify(result)).not.toContain("@写文章");
  });
});
