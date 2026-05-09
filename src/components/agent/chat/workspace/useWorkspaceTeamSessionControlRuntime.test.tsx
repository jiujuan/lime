import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearAgentUiProjectionEvents,
  conversationProjectionStore,
  selectAgentUiProjectionEventsByType,
} from "../projection/conversationProjectionStore";
import { useWorkspaceTeamSessionControlRuntime } from "./useWorkspaceTeamSessionControlRuntime";

const mockCloseAgentRuntimeSubagent = vi.fn();
const mockResumeAgentRuntimeSubagent = vi.fn();
const mockSendAgentRuntimeSubagentInput = vi.fn();
const mockWaitAgentRuntimeSubagents = vi.fn();
const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();
const mockToastInfo = vi.fn();

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
    info: (...args: unknown[]) => mockToastInfo(...args),
  },
}));

vi.mock("@/lib/api/agentRuntime", () => ({
  closeAgentRuntimeSubagent: (request: unknown) =>
    mockCloseAgentRuntimeSubagent(request),
  resumeAgentRuntimeSubagent: (request: unknown) =>
    mockResumeAgentRuntimeSubagent(request),
  sendAgentRuntimeSubagentInput: (request: unknown) =>
    mockSendAgentRuntimeSubagentInput(request),
  waitAgentRuntimeSubagents: (request: unknown) =>
    mockWaitAgentRuntimeSubagents(request),
}));

type HookValue = ReturnType<typeof useWorkspaceTeamSessionControlRuntime>;

const mountedRoots: Array<{ root: Root; container: HTMLDivElement }> = [];

function renderHook(): { getValue: () => HookValue } {
  let latestValue: HookValue | null = null;
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  function Harness() {
    latestValue = useWorkspaceTeamSessionControlRuntime({
      sessionId: "session-team-1",
      childSubagentSessions: [],
      liveRuntimeBySessionId: {},
      stopSending: vi.fn(),
    });
    return null;
  }

  act(() => {
    root.render(<Harness />);
  });
  mountedRoots.push({ root, container });

  return {
    getValue: () => {
      if (!latestValue) {
        throw new Error("hook 尚未初始化");
      }
      return latestValue;
    },
  };
}

describe("useWorkspaceTeamSessionControlRuntime AgentUI projection", () => {
  beforeEach(() => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT?: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    clearAgentUiProjectionEvents();
    vi.clearAllMocks();
    mockResumeAgentRuntimeSubagent.mockResolvedValue({
      changed_session_ids: ["child-1"],
      cascade_session_ids: [],
      status: { kind: "running" },
    });
    mockWaitAgentRuntimeSubagents.mockResolvedValue({
      timed_out: false,
      status: {
        "child-1": { kind: "completed" },
      },
    });
  });

  afterEach(() => {
    act(() => {
      clearAgentUiProjectionEvents();
    });
    while (mountedRoots.length > 0) {
      const mounted = mountedRoots.pop();
      if (!mounted) {
        break;
      }
      act(() => {
        mounted.root.unmount();
      });
      mounted.container.remove();
    }
  });

  it("resume / wait 操作应写入标准 Team control projection", async () => {
    const harness = renderHook();

    await act(async () => {
      await harness.getValue().handleResumeSubagentSession("child-1");
    });

    expect(mockResumeAgentRuntimeSubagent).toHaveBeenCalledWith({
      id: "child-1",
    });
    expect(
      selectAgentUiProjectionEventsByType(
        conversationProjectionStore.getSnapshot(),
        "task.changed",
      ),
    ).toEqual([
      expect.objectContaining({
        sourceType: "team_control_projection",
        sessionId: "session-team-1",
        taskId: "child-1",
        surface: "work_board",
        control: "continue_agent",
        runtimeEntity: "subagent_turn",
        runtimeStatus: "running",
      }),
    ]);

    await act(async () => {
      await harness.getValue().handleWaitSubagentSession("child-1", 30_000);
    });

    expect(mockWaitAgentRuntimeSubagents).toHaveBeenCalledWith({
      ids: ["child-1"],
      timeout_ms: 30_000,
    });
    expect(
      selectAgentUiProjectionEventsByType(
        conversationProjectionStore.getSnapshot(),
        "team.changed",
      ),
    ).toEqual([
      expect.objectContaining({
        sourceType: "team_control_projection",
        sessionId: "session-team-1",
        control: "continue_agent",
        surface: "team_policy",
      }),
      expect.objectContaining({
        sourceType: "team_control_projection",
        sessionId: "session-team-1",
        control: "wait",
        surface: "team_policy",
        payload: expect.objectContaining({
          resolvedSessionId: "child-1",
          resolvedStatus: "completed",
        }),
      }),
    ]);
  });
});
