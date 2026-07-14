import { beforeEach, describe, expect, it, vi } from "vitest";

import { safeInvoke } from "@/lib/dev-bridge";
import {
  PLUGIN_RUNTIME_COMMANDS,
  cancelPluginRuntimeTask,
  getPluginRuntimeTask,
  startPluginRuntimeTask,
  submitPluginRuntimeHostResponse,
} from "./pluginRuntime";

vi.mock("@/lib/dev-bridge", () => ({
  safeInvoke: vi.fn(),
}));

describe("pluginRuntime api", () => {
  beforeEach(() => {
    vi.mocked(safeInvoke).mockReset();
  });

  it("通过 current Plugin runtime command 启动 task", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce({
      appId: "content-factory-app",
      taskId: "task-1",
      traceId: "trace-1",
      taskKind: "content_factory.copy.generate",
      sessionId: "session-1",
      threadId: "thread-1",
      turnId: "turn-1",
      eventName: "plugin_runtime:content-factory-app:task-1",
      status: "accepted",
      submittedAt: "2026-05-16T00:00:00.000Z",
    });

    await startPluginRuntimeTask({
      appId: "content-factory-app",
      workspaceId: "workspace-1",
      taskKind: "content_factory.copy.generate",
      input: { platform: "douyin" },
    });

    expect(safeInvoke).toHaveBeenCalledWith(PLUGIN_RUNTIME_COMMANDS.startTask, {
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
        threadId: "thread-1",
        cancelled: true,
        status: "cancelled",
      })
      .mockResolvedValueOnce({
        appId: "content-factory-app",
        taskId: "task-1",
        sessionId: "session-1",
        threadId: "thread-1",
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

    await cancelPluginRuntimeTask({
      appId: "content-factory-app",
      taskId: "task-1",
      threadId: "thread-1",
    });
    await getPluginRuntimeTask({
      appId: "content-factory-app",
      taskId: "task-1",
      threadId: "thread-1",
    });
    await submitPluginRuntimeHostResponse({
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
      PLUGIN_RUNTIME_COMMANDS.cancelTask,
      PLUGIN_RUNTIME_COMMANDS.getTask,
      PLUGIN_RUNTIME_COMMANDS.submitHostResponse,
    ]);
  });

  it("读取 task snapshot 时透传 App 可消费 task events", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce({
      appId: "content-factory-app",
      taskId: "task-1",
      sessionId: "session-1",
      threadId: "thread-1",
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

    const snapshot = await getPluginRuntimeTask({
      appId: "content-factory-app",
      taskId: "task-1",
      threadId: "thread-1",
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
      startPluginRuntimeTask({
        appId: "content-factory-app",
        workspaceId: "workspace-1",
        taskKind: "content_factory.copy.generate",
      }),
    ).rejects.toThrow(
      "plugin_runtime_start_task 尚未接入真实 Plugin runtime current 通道",
    );

    await expect(
      cancelPluginRuntimeTask({
        appId: "content-factory-app",
        taskId: "task-1",
        threadId: "thread-1",
      }),
    ).rejects.toThrow(
      "plugin_runtime_cancel_task 尚未接入真实 Plugin runtime current 通道",
    );

    await expect(
      getPluginRuntimeTask({
        appId: "content-factory-app",
        taskId: "task-1",
        threadId: "thread-1",
      }),
    ).rejects.toThrow(
      "plugin_runtime_get_task 尚未接入真实 Plugin runtime current 通道",
    );

    await expect(
      submitPluginRuntimeHostResponse({
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
      "plugin_runtime_submit_host_response 尚未接入真实 Plugin runtime current 通道",
    );

    expect(vi.mocked(safeInvoke).mock.calls.map(([cmd]) => cmd)).toEqual([
      PLUGIN_RUNTIME_COMMANDS.startTask,
      PLUGIN_RUNTIME_COMMANDS.cancelTask,
      PLUGIN_RUNTIME_COMMANDS.getTask,
      PLUGIN_RUNTIME_COMMANDS.submitHostResponse,
    ]);
  });

  it("runtime task facade 遇到非 runtime 响应形状时应 fail closed", async () => {
    vi.mocked(safeInvoke)
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({
        appId: "content-factory-app",
        taskId: "task-1",
        sessionId: "session-1",
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
            id: "event-1",
            status: "running",
            message: "任务正在执行",
          },
        ],
        threadRead: {},
      })
      .mockResolvedValueOnce({
        error: {
          code: "COMMAND_UNSUPPORTED",
          message: "not available",
        },
      });

    await expect(
      startPluginRuntimeTask({
        appId: "content-factory-app",
        workspaceId: "workspace-1",
        taskKind: "content_factory.copy.generate",
      }),
    ).rejects.toThrow(
      "plugin_runtime_start_task did not return accepted task result",
    );

    await expect(
      cancelPluginRuntimeTask({
        appId: "content-factory-app",
        taskId: "task-1",
        threadId: "thread-1",
      }),
    ).rejects.toThrow(
      "plugin_runtime_cancel_task did not return cancel task result",
    );

    await expect(
      getPluginRuntimeTask({
        appId: "content-factory-app",
        taskId: "task-1",
        threadId: "thread-1",
      }),
    ).rejects.toThrow("plugin_runtime_get_task did not return task snapshot");

    await expect(
      submitPluginRuntimeHostResponse({
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
      "plugin_runtime_submit_host_response returned an error envelope",
    );
  });

  it("runtime task facade 遇到 error envelope 时应 fail closed", async () => {
    vi.mocked(safeInvoke)
      .mockResolvedValueOnce({
        appId: "content-factory-app",
        taskId: "task-1",
        traceId: "trace-1",
        taskKind: "content_factory.copy.generate",
        sessionId: "session-1",
        turnId: "turn-1",
        eventName: "plugin_runtime:content-factory-app:task-1",
        status: "accepted",
        submittedAt: "2026-05-16T00:00:00.000Z",
        error: "Electron host command is not supported",
      })
      .mockResolvedValueOnce({
        appId: "content-factory-app",
        taskId: "task-1",
        sessionId: "session-1",
        cancelled: true,
        status: "cancelled",
        error: "cancel failed",
      })
      .mockResolvedValueOnce({
        appId: "content-factory-app",
        taskId: "task-1",
        sessionId: "session-1",
        status: "thread_read_available",
        taskStatus: "running",
        taskEvents: [
          {
            id: "event-1",
            eventType: "task:progress",
            status: "running",
            message: "任务正在执行",
            error: "event fallback",
          },
        ],
        threadRead: {},
      })
      .mockResolvedValueOnce({
        appId: "content-factory-app",
        taskId: "task-1",
        status: "submitted",
        error: "submit failed",
      });

    await expect(
      startPluginRuntimeTask({
        appId: "content-factory-app",
        workspaceId: "workspace-1",
        taskKind: "content_factory.copy.generate",
      }),
    ).rejects.toThrow(
      "plugin_runtime_start_task returned an error envelope",
    );

    await expect(
      cancelPluginRuntimeTask({
        appId: "content-factory-app",
        taskId: "task-1",
        threadId: "thread-1",
      }),
    ).rejects.toThrow(
      "plugin_runtime_cancel_task returned an error envelope",
    );

    await expect(
      getPluginRuntimeTask({
        appId: "content-factory-app",
        taskId: "task-1",
        threadId: "thread-1",
      }),
    ).rejects.toThrow("plugin_runtime_get_task returned an error envelope");

    await expect(
      submitPluginRuntimeHostResponse({
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
      "plugin_runtime_submit_host_response returned an error envelope",
    );
  });
});
