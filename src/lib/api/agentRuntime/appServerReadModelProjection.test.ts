import { describe, expect, it } from "vitest";
import type { AppServerAgentSessionReadResponse } from "@/lib/api/appServer";
import {
  projectAppServerSessionReadToThreadReadModel,
  type AppServerAgentSessionReadProjectionInput,
} from "./appServerReadModelProjection";

function sessionRead(
  overrides: Partial<AppServerAgentSessionReadResponse> & {
    detail?: unknown;
  } = {},
): AppServerAgentSessionReadProjectionInput {
  return {
    session: {
      sessionId: "session-1",
      threadId: "thread-1",
      appId: "agent-chat",
      workspaceId: "workspace-1",
      status: "running",
      createdAt: "2026-06-06T00:00:00.000Z",
      updatedAt: "2026-06-06T00:00:03.000Z",
    },
    turns: [
      {
        turnId: "turn-1",
        sessionId: "session-1",
        threadId: "thread-1",
        status: "completed",
        startedAt: "2026-06-06T00:00:01.000Z",
        completedAt: "2026-06-06T00:00:02.000Z",
      },
      {
        turnId: "turn-2",
        sessionId: "session-1",
        threadId: "thread-1",
        status: "running",
        startedAt: "2026-06-06T00:00:03.000Z",
      },
    ],
    ...overrides,
  };
}

describe("appServerReadModelProjection", () => {
  it("应把 App Server session + turns 投影成前端 thread read model", () => {
    const result = projectAppServerSessionReadToThreadReadModel(sessionRead());

    expect(result).toEqual({
      thread_id: "thread-1",
      status: "running",
      profile_status: "running",
      active_turn_id: "turn-2",
      updated_at: "2026-06-06T00:00:03.000Z",
      pending_requests: [],
      incidents: [],
      queued_turns: [],
      turns: [
        {
          turn_id: "turn-1",
          status: "completed",
          native_status: "completed",
        },
        {
          turn_id: "turn-2",
          status: "running",
          native_status: "running",
        },
      ],
    });
  });

  it("应保留 detail.thread_read 的富 read model 并归一 queued turns", () => {
    const result = projectAppServerSessionReadToThreadReadModel(
      sessionRead({
        detail: {
          thread_read: {
            thread_id: "thread-from-detail",
            status: "blocked",
            profile_status: "blocked",
            active_turn_id: "turn-detail",
            turns: [
              {
                turn_id: "turn-detail",
                status: "blocked",
                native_status: "waitingAction",
              },
            ],
            pending_requests: [
              {
                id: "request-1",
                thread_id: "thread-1",
                turn_id: "turn-detail",
                request_type: "ask_user",
                status: "pending",
              },
            ],
            active_command_id: "command-active",
            active_test_run_id: "test-active",
            active_action_id: "request-1",
            commands: [
              {
                command_id: "command-active",
                status: "running",
                command: "npm test",
                cwd: "app",
                output_refs: ["output://command-active"],
                output_preview: "running tests",
              },
            ],
            tests: [
              {
                test_run_id: "test-active",
                status: "running",
                command_id: "command-active",
                suite: "unit",
                passed: 3,
                failed: 0,
              },
            ],
            queued_turns: [
              {
                queuedTurnId: "queued-1",
                messageText: "继续生成",
                createdAt: 1770000000000,
                imageCount: 0,
                position: 1,
              },
            ],
          },
        },
      }),
    );

    expect(result).toMatchObject({
      thread_id: "thread-1",
      status: "blocked",
      profile_status: "blocked",
      active_turn_id: "turn-detail",
      turns: [
        {
          turn_id: "turn-detail",
          status: "blocked",
          native_status: "waitingAction",
        },
      ],
      pending_requests: [
        {
          id: "request-1",
          request_type: "ask_user",
          status: "pending",
        },
      ],
      active_command_id: "command-active",
      active_test_run_id: "test-active",
      active_action_id: "request-1",
      commands: [
        {
          command_id: "command-active",
          status: "running",
          command: "npm test",
          cwd: "app",
          output_refs: ["output://command-active"],
          output_preview: "running tests",
        },
      ],
      tests: [
        {
          test_run_id: "test-active",
          status: "running",
          command_id: "command-active",
          suite: "unit",
          passed: 3,
          failed: 0,
        },
      ],
      queued_turns: [
        {
          queued_turn_id: "queued-1",
          message_preview: "继续生成",
          message_text: "继续生成",
          created_at: 1770000000000,
          image_count: 0,
          position: 1,
        },
      ],
    });
  });

  it("应把 App Server canceled 状态归一为前端 cancelled", () => {
    const result = projectAppServerSessionReadToThreadReadModel(
      sessionRead({
        session: {
          sessionId: "session-1",
          threadId: "thread-1",
          appId: "agent-chat",
          status: "canceled",
          createdAt: "2026-06-06T00:00:00.000Z",
          updatedAt: "2026-06-06T00:00:02.000Z",
        },
        turns: [
          {
            turnId: "turn-1",
            sessionId: "session-1",
            threadId: "thread-1",
            status: "canceled",
          },
        ],
      }),
    );

    expect(result.status).toBe("cancelled");
    expect(result.profile_status).toBe("cancelled");
    expect(result.turns).toEqual([
      {
        turn_id: "turn-1",
        status: "cancelled",
        native_status: "canceled",
      },
    ]);
  });
});
