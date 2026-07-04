import { describe, expect, it, vi } from "vitest";
import type { MutableRefObject } from "react";
import { resolveSoulInteractionCopy } from "@/lib/soul/interactionCopy";
import { buildWaitingAgentRuntimeStatus } from "../utils/agentRuntimeStatus";
import { resolveAgentStreamSubmitContext } from "./agentStreamSubmitContext";

describe("agentStreamSubmitContext", () => {
  it("应解析 session/workspace/runtime context，并激活非队列流", async () => {
    const activateStream = vi.fn();
    const result = await resolveAgentStreamSubmitContext({
      ensureSession: async () => "session-1",
      sessionIdRef: { current: null } as MutableRefObject<string | null>,
      getWorkspaceIdForSubmit: () => "workspace-1",
      getSyncedSessionRecentPreferences: () => ({
        webSearch: false,
        thinking: false,
        task: false,
        subagent: true,
      }),
      getSyncedSessionExecutionStrategy: () => "react",
      effectiveExecutionStrategy: "react",
      expectingQueue: false,
      activateStream,
    });

    expect(result.activeSessionId).toBe("session-1");
    expect(result.resolvedWorkspaceId).toBe("workspace-1");
    expect(result.submitWorkspaceId).toBe("workspace-1");
    expect(result.syncedRecentPreferences).toMatchObject({
      task: false,
      subagent: true,
    });
    expect(result.syncedExecutionStrategy).toBe("react");
    expect(activateStream).toHaveBeenCalledWith(
      "session-1",
      result.effectiveWaitingRuntimeStatus,
    );
  });

  it("已存在 session 且队列态时不应重复激活流，并保留 assistant waiting status", async () => {
    const activateStream = vi.fn();
    const waitingRuntimeStatus = buildWaitingAgentRuntimeStatus({
      executionStrategy: "react",
    });

    const result = await resolveAgentStreamSubmitContext({
      ensureSession: async () => "session-2",
      sessionIdRef: { current: "session-2" } as MutableRefObject<string | null>,
      getWorkspaceIdForSubmit: () => "workspace-2",
      getSyncedSessionExecutionStrategy: () => "react",
      effectiveExecutionStrategy: "react",
      assistantDraft: {
        waitingRuntimeStatus,
      },
      expectingQueue: true,
      activateStream,
    });

    expect(result.submitWorkspaceId).toBeUndefined();
    expect(result.effectiveWaitingRuntimeStatus).toEqual(waitingRuntimeStatus);
    expect(activateStream).not.toHaveBeenCalled();
  });

  it("detached 普通会话不应提交 workspace_id", async () => {
    const result = await resolveAgentStreamSubmitContext({
      ensureSession: async () => "session-detached",
      sessionIdRef: { current: null } as MutableRefObject<string | null>,
      getWorkspaceIdForSubmit: () => undefined,
      getSyncedSessionExecutionStrategy: () => "react",
      effectiveExecutionStrategy: "react",
      expectingQueue: false,
      activateStream: vi.fn(),
    });

    expect(result.resolvedWorkspaceId).toBeUndefined();
    expect(result.submitWorkspaceId).toBeUndefined();
  });

  it("非队列流激活等待态应支持 Soul 交互口吻", async () => {
    const activateStream = vi.fn();
    const soulCopy = resolveSoulInteractionCopy({
      soul: {
        enabled: true,
        style_profile_id: "cheeky_sassy_executor",
        style_intensity: "low",
      },
    });
    const result = await resolveAgentStreamSubmitContext({
      ensureSession: async () => "session-soul",
      sessionIdRef: { current: null } as MutableRefObject<string | null>,
      getWorkspaceIdForSubmit: () => "workspace-1",
      getSyncedSessionExecutionStrategy: () => "react",
      effectiveExecutionStrategy: "react",
      expectingQueue: false,
      soulCopy,
      activateStream,
    });

    expect(result.effectiveWaitingRuntimeStatus).toMatchObject({
      title: "正在启动处理",
      detail: expect.stringContaining("进展"),
    });
    expect(activateStream).toHaveBeenCalledWith(
      "session-soul",
      result.effectiveWaitingRuntimeStatus,
    );
  });
});
