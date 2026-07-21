import { describe, expect, it } from "vitest";

import { summarizeProductionTurnStartTrace } from "./content-factory-production-turn-start-trace.mjs";

describe("content factory production turn-start trace", () => {
  it("accepts Gate B matchingTurn evidence for the requested thread", () => {
    const result = summarizeProductionTurnStartTrace(
      {
        matchingTurn: {
          command: "app_server_handle_json_lines",
          metadata: {
            secret: "should not be copied",
          },
          status: "success",
          text: "@写文章 should not be copied",
          threadId: "thread_prod",
          transport: "electron-ipc",
        },
      },
      { expectedThreadId: "thread_prod" },
    );

    expect(result).toEqual({
      command: "app_server_handle_json_lines",
      matched: true,
      method: "turn/start",
      present: true,
      status: "success",
      threadId: "thread_prod",
      threadMatched: true,
      transport: "electron-ipc",
    });
    expect(JSON.stringify(result)).not.toContain("@写文章");
    expect(JSON.stringify(result)).not.toContain("should not be copied");
  });

  it("fails closed when the trace belongs to another thread", () => {
    const result = summarizeProductionTurnStartTrace(
      {
        matchingTurn: {
          command: "app_server_handle_json_lines",
          status: "success",
          threadId: "thread_other",
          transport: "electron-ipc",
        },
      },
      { expectedThreadId: "thread_prod" },
    );

    expect(result).toMatchObject({
      matched: false,
      present: true,
      threadId: "thread_other",
      threadMatched: false,
    });
  });

  it("accepts sanitized appServerInvokeEntries evidence", () => {
    const result = summarizeProductionTurnStartTrace(
      {
        appServerInvokeEntries: [
          {
            appServerRequests: [
              {
                method: "turn/start",
                params: {
                  threadId: "thread_prod",
                },
              },
            ],
            command: "app_server_handle_json_lines",
            status: "success",
            transport: "electron-ipc",
          },
        ],
      },
      { expectedThreadId: "thread_prod" },
    );

    expect(result).toMatchObject({
      matched: true,
      method: "turn/start",
      present: true,
      threadId: "thread_prod",
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
                  method: "turn/start",
                  params: {
                    prompt: "@写文章 should not be copied",
                    threadId: "thread_prod",
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
      { expectedThreadId: "thread_prod" },
    );

    expect(result).toMatchObject({
      matched: true,
      present: true,
      threadId: "thread_prod",
    });
    expect(JSON.stringify(result)).not.toContain("prompt");
    expect(JSON.stringify(result)).not.toContain("@写文章");
  });
});
