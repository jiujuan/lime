import { describe, expect, it, vi } from "vitest";
import {
  createAgentRuntimeBridgeInvoke,
  createAgentRuntimeCommandInvoke,
} from "./transport";

function withArrayDiagnostic<T extends unknown[]>(value: T): T {
  Object.defineProperty(value, "__diagnostic", {
    value: {
      source: "electron-host-diagnostic",
      status: "degraded",
    },
  });
  return value;
}

describe("agentRuntime transport", () => {
  it("无 payload 时应直接透传命令名", async () => {
    const invoke = vi.fn().mockResolvedValueOnce({ ok: true });
    const bridgeInvoke = createAgentRuntimeBridgeInvoke({ invoke });

    await expect(bridgeInvoke("app_server_drain_events")).resolves.toEqual({
      ok: true,
    });

    expect(invoke).toHaveBeenCalledWith("app_server_drain_events");
  });

  it("有 payload 时应透传命令名与请求体", async () => {
    const invoke = vi.fn().mockResolvedValueOnce({
      success: true,
      task_id: "task-1",
    });
    const bridgeInvoke = createAgentRuntimeBridgeInvoke({ invoke });

    await expect(
      bridgeInvoke("site_run_adapter", {
        request: { adapter: "x/article-export" },
      }),
    ).resolves.toEqual({ success: true, task_id: "task-1" });

    expect(invoke).toHaveBeenCalledWith("site_run_adapter", {
      request: { adapter: "x/article-export" },
    });
  });

  it("默认注入缺失时也应返回可调用函数", () => {
    const bridgeInvoke = createAgentRuntimeBridgeInvoke();
    expect(bridgeInvoke).toBeTypeOf("function");
  });

  it("command invoker 应复用自定义 bridgeInvoke", async () => {
    const bridgeInvoke = vi.fn().mockResolvedValueOnce({ ok: true });
    const invokeCommand = createAgentRuntimeCommandInvoke({ bridgeInvoke });

    await expect(invokeCommand("app_server_drain_events")).resolves.toEqual(
      {
        ok: true,
      },
    );

    expect(bridgeInvoke).toHaveBeenCalledWith("app_server_drain_events");
  });

  it("command invoker 遇到自定义 bridge diagnostic facade 时应 fail closed", async () => {
    const bridgeInvoke = vi.fn().mockResolvedValueOnce({
      diagnostic: {
        source: "electron-host-diagnostic",
        status: "degraded",
      },
    });
    const invokeCommand = createAgentRuntimeCommandInvoke({ bridgeInvoke });

    await expect(
      invokeCommand("retired_agent_runtime_command", {
        request: { workspaceId: "workspace-1" },
      }),
    ).rejects.toThrow(
      "retired_agent_runtime_command 尚未接入真实 Agent Runtime current 通道，收到 electron-host-diagnostic 诊断返回。",
    );
  });

  it("bridge invoker 遇到 degraded diagnostic facade 时应 fail closed", async () => {
    const invoke = vi.fn().mockResolvedValueOnce({
      diagnostic: {
        source: "electron-host-diagnostic",
        status: "degraded",
      },
    });
    const bridgeInvoke = createAgentRuntimeBridgeInvoke({ invoke });

    await expect(
      bridgeInvoke("agent_runtime_export_handoff_bundle", {
        request: { session_id: "session-1" },
      }),
    ).rejects.toThrow(
      "agent_runtime_export_handoff_bundle 尚未接入真实 Agent Runtime current 通道，收到 electron-host-diagnostic 诊断返回。",
    );
  });

  it("bridge invoker 遇到数组 diagnostic facade 时应 fail closed", async () => {
    const invoke = vi.fn().mockResolvedValueOnce(withArrayDiagnostic([]));
    const bridgeInvoke = createAgentRuntimeBridgeInvoke({ invoke });

    await expect(bridgeInvoke("retired_agent_runtime_command")).rejects.toThrow(
      "retired_agent_runtime_command 尚未接入真实 Agent Runtime current 通道，收到 electron-host-diagnostic 诊断返回。",
    );
  });

  it("bridge invoker 遇到 mock-like success envelope 时应 fail closed", async () => {
    const invoke = vi.fn().mockResolvedValueOnce({ success: true });
    const bridgeInvoke = createAgentRuntimeBridgeInvoke({ invoke });

    await expect(
      bridgeInvoke("agent_runtime_export_handoff_bundle", {
        request: { session_id: "session-1" },
      }),
    ).rejects.toThrow(
      "agent_runtime_export_handoff_bundle returned a mock-like success envelope",
    );
  });

  it("command invoker 遇到 error envelope 时应 fail closed", async () => {
    const bridgeInvoke = vi.fn().mockResolvedValueOnce({
      error: {
        code: "COMMAND_UNSUPPORTED",
        message: "not available",
      },
    });
    const invokeCommand = createAgentRuntimeCommandInvoke({ bridgeInvoke });

    await expect(
      invokeCommand("retired_agent_runtime_command", {
        request: { workspaceId: "workspace-1" },
      }),
    ).rejects.toThrow("retired_agent_runtime_command returned an error envelope");
  });
});
