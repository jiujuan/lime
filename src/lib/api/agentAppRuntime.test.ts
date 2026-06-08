import { beforeEach, describe, expect, it, vi } from "vitest";

import { safeInvoke } from "@/lib/dev-bridge";
import {
  AGENT_APP_RUNTIME_COMMANDS,
  cancelAgentAppRuntimeTask,
  getAgentAppRuntimeTask,
  startAgentAppRuntimeTask,
  submitAgentAppRuntimeHostResponse,
} from "./agentAppRuntime";

vi.mock("@/lib/dev-bridge", () => ({
  safeInvoke: vi.fn(),
}));

describe("agentAppRuntime api", () => {
  beforeEach(() => {
    vi.mocked(safeInvoke).mockReset();
  });

  it("通过 current Agent App runtime command 启动 task", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce({
      appId: "content-factory-app",
      taskId: "task-1",
      traceId: "trace-1",
      taskKind: "content_factory.copy.generate",
      sessionId: "session-1",
      turnId: "turn-1",
      eventName: "agent_app_runtime:content-factory-app:task-1",
      status: "accepted",
      submittedAt: "2026-05-16T00:00:00.000Z",
    });

    await startAgentAppRuntimeTask({
      appId: "content-factory-app",
      workspaceId: "workspace-1",
      taskKind: "content_factory.copy.generate",
      input: { platform: "douyin" },
    });

    expect(safeInvoke).toHaveBeenCalledWith(AGENT_APP_RUNTIME_COMMANDS.startTask, {
      request: {
        appId: "content-factory-app",
        workspaceId: "workspace-1",
        taskKind: "content_factory.copy.generate",
        input: { platform: "douyin" },
      },
    });
  });

  it("取消、读取和 host response 都走统一 runtime facade", async () => {
    vi.mocked(safeInvoke)
      .mockResolvedValueOnce({
        appId: "content-factory-app",
        taskId: "task-1",
        sessionId: "session-1",
        cancelled: true,
        status: "cancelled",
      })
      .mockResolvedValueOnce({
        appId: "content-factory-app",
        taskId: "task-1",
        sessionId: "session-1",
        status: "thread_read_available",
        taskStatus: "running",
        taskEvents: [
          {
            id: "task:progress:1",
            eventType: "task:progress",
            status: "running",
            message: "任务正在执行",
          },
        ],
        threadRead: {},
      })
      .mockResolvedValueOnce({
        appId: "content-factory-app",
        taskId: "task-1",
        status: "submitted",
      });

    await cancelAgentAppRuntimeTask({
      appId: "content-factory-app",
      taskId: "task-1",
      sessionId: "session-1",
    });
    await getAgentAppRuntimeTask({
      appId: "content-factory-app",
      taskId: "task-1",
      sessionId: "session-1",
    });
    await submitAgentAppRuntimeHostResponse({
      appId: "content-factory-app",
      taskId: "task-1",
      runtimeRequest: {
        session_id: "session-1",
        request_id: "request-1",
        action_type: "tool_confirmation",
        confirmed: true,
      },
    });

    expect(vi.mocked(safeInvoke).mock.calls.map(([cmd]) => cmd)).toEqual([
      AGENT_APP_RUNTIME_COMMANDS.cancelTask,
      AGENT_APP_RUNTIME_COMMANDS.getTask,
      AGENT_APP_RUNTIME_COMMANDS.submitHostResponse,
    ]);
  });

  it("读取 task snapshot 时透传 App 可消费 task events", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce({
      appId: "content-factory-app",
      taskId: "task-1",
      sessionId: "session-1",
      status: "thread_read_available",
      taskStatus: "blocked",
      taskEvents: [
        {
          id: "task:missingContextRequested:request-1",
          eventType: "task:missingContextRequested",
          status: "pending",
          message: "需要确认素材方向",
          requestId: "request-1",
        },
      ],
      threadRead: {},
    });

    const snapshot = await getAgentAppRuntimeTask({
      appId: "content-factory-app",
      taskId: "task-1",
      sessionId: "session-1",
    });

    expect(snapshot.taskStatus).toBe("blocked");
    expect(snapshot.taskEvents).toEqual([
      expect.objectContaining({
        eventType: "task:missingContextRequested",
        requestId: "request-1",
      }),
    ]);
  });

  it("runtime task facade 遇到 diagnostic facade 时应 fail closed", async () => {
    vi.mocked(safeInvoke).mockResolvedValue({
      diagnostic: {
        source: "electron-host-diagnostic",
        status: "degraded",
      },
    });

    await expect(
      startAgentAppRuntimeTask({
        appId: "content-factory-app",
        workspaceId: "workspace-1",
        taskKind: "content_factory.copy.generate",
      }),
    ).rejects.toThrow(
      "agent_app_runtime_start_task 尚未接入真实 Agent App runtime current 通道",
    );

    await expect(
      cancelAgentAppRuntimeTask({
        appId: "content-factory-app",
        taskId: "task-1",
        sessionId: "session-1",
      }),
    ).rejects.toThrow(
      "agent_app_runtime_cancel_task 尚未接入真实 Agent App runtime current 通道",
    );

    await expect(
      getAgentAppRuntimeTask({
        appId: "content-factory-app",
        taskId: "task-1",
        sessionId: "session-1",
      }),
    ).rejects.toThrow(
      "agent_app_runtime_get_task 尚未接入真实 Agent App runtime current 通道",
    );

    await expect(
      submitAgentAppRuntimeHostResponse({
        appId: "content-factory-app",
        taskId: "task-1",
        runtimeRequest: {
          session_id: "session-1",
          request_id: "request-1",
          action_type: "tool_confirmation",
          confirmed: true,
        },
      }),
    ).rejects.toThrow(
      "agent_app_runtime_submit_host_response 尚未接入真实 Agent App runtime current 通道",
    );

    expect(vi.mocked(safeInvoke).mock.calls.map(([cmd]) => cmd)).toEqual([
      AGENT_APP_RUNTIME_COMMANDS.startTask,
      AGENT_APP_RUNTIME_COMMANDS.cancelTask,
      AGENT_APP_RUNTIME_COMMANDS.getTask,
      AGENT_APP_RUNTIME_COMMANDS.submitHostResponse,
    ]);
  });
});
