import { describe, expect, it } from "vitest";

import { summarizeImageCommandCreateFailure } from "./claw-chat-current-fixture-image-command.mjs";
import { assertFixtureTextProviderAuthorization } from "./claw-chat-current-fixture-rpc.mjs";

describe("Claw image command Gate B guards", () => {
  it("requires Authorization on text model discovery and chat requests", () => {
    expect(
      assertFixtureTextProviderAuthorization([
        { method: "GET", url: "/v1/models", authorization: "present" },
        {
          method: "POST",
          url: "/v1/chat/completions",
          authorization: "present",
        },
      ]),
    ).toEqual({
      modelDiscoveryRequestCount: 1,
      chatRequestCount: 1,
      allObservedRequestsAuthorized: true,
    });

    expect(() =>
      assertFixtureTextProviderAuthorization([
        { method: "GET", url: "/v1/models", authorization: "missing" },
        {
          method: "POST",
          url: "/v1/chat/completions",
          authorization: "present",
        },
      ]),
    ).toThrow("GET");

    expect(() =>
      assertFixtureTextProviderAuthorization([
        { method: "GET", url: "/v1/models", authorization: "present" },
        {
          method: "POST",
          url: "/v1/chat/completions",
          authorization: "missing",
        },
      ]),
    ).toThrow("POST");
  });

  it("allows setup to assert model discovery before chat starts", () => {
    expect(
      assertFixtureTextProviderAuthorization(
        [{ method: "GET", url: "/v1/models", authorization: "present" }],
        { requireChatRequest: false },
      ),
    ).toMatchObject({
      modelDiscoveryRequestCount: 1,
      chatRequestCount: 0,
      allObservedRequestsAuthorized: true,
    });
  });

  it("reports the image task create failure reason from session/read", () => {
    expect(
      summarizeImageCommandCreateFailure({
        thread: {
          turns: [
            {
              id: "turn-image-1",
              items: [
                {
                  id: "image-command-create-task-turn-image-1",
                  type: "dynamicToolCall",
                  tool: "lime_create_image_generation_task",
                  status: "failed",
                  error:
                    "presentation_text_route_unavailable: model_registry_metadata_missing",
                  metadata: {
                    reason_code: "image_task_presentation_text_route_unavailable",
                  },
                },
              ],
            },
          ],
        },
      }),
    ).toEqual({
      reasonCode: "image_task_presentation_text_route_unavailable",
      message:
        "presentation_text_route_unavailable: model_registry_metadata_missing",
      itemId: "image-command-create-task-[redacted]",
      turnId: "turn-image-1",
      toolName: "lime_create_image_generation_task",
    });

    expect(
      summarizeImageCommandCreateFailure({
        detail: {
          runtimeEvents: [
            {
              type: "image_task.create_failed",
              payload: {
                reasonCode: "image_task_create_failed",
                message: "provider route unavailable",
                turnId: "turn-image-2",
              },
            },
          ],
        },
      }),
    ).toEqual({
      reasonCode: "image_task_create_failed",
      message: "provider route unavailable",
      itemId: null,
      turnId: "turn-image-2",
      toolName: "lime_create_image_generation_task",
    });

    expect(
      summarizeImageCommandCreateFailure({
        thread: {
          turns: [
            {
              items: [
                {
                  type: "dynamicToolCall",
                  toolName: "lime_create_image_generation_task",
                  status: "failed",
                  metadata: { reasonCode: "generic_tool_failure" },
                },
              ],
            },
          ],
        },
        runtimeEvents: [
          {
            eventType: "image_task.create_failed",
            payload: {
              reason_code: "image_task_provider_route_unavailable",
            },
          },
        ],
      }),
    ).toMatchObject({
      reasonCode: "image_task_provider_route_unavailable",
      toolName: "lime_create_image_generation_task",
    });
  });

  it("ignores unrelated or non-failed tool calls", () => {
    expect(
      summarizeImageCommandCreateFailure({
        thread: {
          turns: [
            {
              items: [
                {
                  type: "dynamicToolCall",
                  tool: "unrelated_tool",
                  status: "failed",
                },
                {
                  type: "dynamicToolCall",
                  tool: "lime_create_image_generation_task",
                  status: "completed",
                },
              ],
            },
          ],
        },
      }),
    ).toBeNull();
  });
});
