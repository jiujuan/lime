import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { changeLimeLocale } from "@/i18n/createI18n";
import type { AsterSubagentSessionInfo } from "@/lib/api/agentRuntime";

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
const mockToastError = vi.fn();
const mockToastInfo = vi.fn();
const mockStopSending = vi.fn();

vi.mock("sonner", () => ({
  toast: {
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
const TEAM_CONTROL_UNAVAILABLE_MESSAGE =
  "团队任务控制正在迁移到新的运行链路，暂时不能直接操作子任务";

function createSubagentSession(
  overrides: Partial<AsterSubagentSessionInfo> &
    Pick<AsterSubagentSessionInfo, "id" | "name">,
): AsterSubagentSessionInfo {
  return {
    created_at: 1_710_000_000,
    updated_at: 1_710_000_100,
    session_type: "subagent",
    ...overrides,
  };
}

function renderHook({
  childSubagentSessions = [],
  liveRuntimeBySessionId = {},
  stopSending = mockStopSending,
}: Partial<
  Pick<
    Parameters<typeof useWorkspaceTeamSessionControlRuntime>[0],
    "childSubagentSessions" | "liveRuntimeBySessionId" | "stopSending"
  >
> = {}): { getValue: () => HookValue } {
  let latestValue: HookValue | null = null;
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  function Harness() {
    latestValue = useWorkspaceTeamSessionControlRuntime({
      sessionId: "session-team-1",
      childSubagentSessions,
      liveRuntimeBySessionId,
      stopSending,
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

function expectNoLegacySubagentCommandCalls() {
  expect(mockCloseAgentRuntimeSubagent).not.toHaveBeenCalled();
  expect(mockResumeAgentRuntimeSubagent).not.toHaveBeenCalled();
  expect(mockSendAgentRuntimeSubagentInput).not.toHaveBeenCalled();
  expect(mockWaitAgentRuntimeSubagents).not.toHaveBeenCalled();
}

function expectNoTeamControlProjectionEvents() {
  const snapshot = conversationProjectionStore.getSnapshot();
  expect(selectAgentUiProjectionEventsByType(snapshot, "task.changed")).toEqual(
    [],
  );
  expect(selectAgentUiProjectionEventsByType(snapshot, "team.changed")).toEqual(
    [],
  );
}

async function expectRejectsWithMessage(
  action: () => Promise<unknown>,
  message: string,
) {
  await expect(action()).rejects.toThrow(message);
}

describe("useWorkspaceTeamSessionControlRuntime P9 legacy control shutdown", () => {
  beforeEach(async () => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT?: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    await changeLimeLocale("zh-CN");
    clearAgentUiProjectionEvents();
    vi.clearAllMocks();
    mockStopSending.mockResolvedValue(undefined);
  });

  afterEach(async () => {
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
    await changeLimeLocale("zh-CN");
  });

  it("resume / wait / close / send 操作应本地 fail-closed 且不再调用旧子代理命令", async () => {
    const harness = renderHook();
    const controls = harness.getValue();

    await expectRejectsWithMessage(
      () => controls.handleResumeSubagentSession("child-1"),
      TEAM_CONTROL_UNAVAILABLE_MESSAGE,
    );
    await expectRejectsWithMessage(
      () => controls.handleWaitSubagentSession("child-1", 30_000),
      TEAM_CONTROL_UNAVAILABLE_MESSAGE,
    );
    await expectRejectsWithMessage(
      () => controls.handleCloseSubagentSession("child-1"),
      TEAM_CONTROL_UNAVAILABLE_MESSAGE,
    );
    await expectRejectsWithMessage(
      () => controls.handleWaitActiveTeamSessions(["child-1", "child-1"]),
      TEAM_CONTROL_UNAVAILABLE_MESSAGE,
    );
    await expectRejectsWithMessage(
      () => controls.handleCloseCompletedTeamSessions(["child-2"]),
      TEAM_CONTROL_UNAVAILABLE_MESSAGE,
    );
    await expectRejectsWithMessage(
      () => controls.handleSendSubagentInput("child-1", "继续推进"),
      TEAM_CONTROL_UNAVAILABLE_MESSAGE,
    );

    expect(mockToastError).toHaveBeenCalledTimes(6);
    expect(mockToastError).toHaveBeenCalledWith(
      TEAM_CONTROL_UNAVAILABLE_MESSAGE,
    );
    expectNoLegacySubagentCommandCalls();
    expectNoTeamControlProjectionEvents();
  });

  it("保留前置输入校验错误，但不继续进入旧控制命令", async () => {
    const harness = renderHook();
    const controls = harness.getValue();

    await expectRejectsWithMessage(
      () => controls.handleWaitActiveTeamSessions([]),
      "没有可等待的活跃任务",
    );
    await expectRejectsWithMessage(
      () => controls.handleCloseCompletedTeamSessions([]),
      "没有可关闭的已完成任务",
    );
    await expectRejectsWithMessage(
      () => controls.handleSendSubagentInput("child-1", "   "),
      "请输入要发送给这项任务的内容",
    );

    expect(mockToastError).toHaveBeenCalledWith("没有可等待的活跃任务");
    expect(mockToastError).toHaveBeenCalledWith("没有可关闭的已完成任务");
    expect(mockToastError).toHaveBeenCalledWith(
      "请输入要发送给这项任务的内容",
    );
    expect(mockToastError).not.toHaveBeenCalledWith(
      TEAM_CONTROL_UNAVAILABLE_MESSAGE,
    );
    expectNoLegacySubagentCommandCalls();
    expectNoTeamControlProjectionEvents();
  });

  it("停止主输出时只停止当前发送，活跃子任务只提示迁移不可用", async () => {
    const harness = renderHook({
      childSubagentSessions: [
        createSubagentSession({
          id: "child-running",
          name: "活跃任务",
          runtime_status: "running",
        }),
        createSubagentSession({
          id: "child-completed",
          name: "已完成任务",
          runtime_status: "completed",
        }),
      ],
    });

    await harness.getValue().handleStopSending();

    expect(mockStopSending).toHaveBeenCalledTimes(1);
    expect(mockToastInfo).toHaveBeenCalledWith(
      TEAM_CONTROL_UNAVAILABLE_MESSAGE,
    );
    expectNoLegacySubagentCommandCalls();
    expectNoTeamControlProjectionEvents();
  });

  it("没有活跃子任务时停止主输出不展示迁移不可用提示", async () => {
    const harness = renderHook({
      childSubagentSessions: [
        createSubagentSession({
          id: "child-completed",
          name: "已完成任务",
          runtime_status: "completed",
        }),
      ],
    });

    await harness.getValue().handleStopSending();

    expect(mockStopSending).toHaveBeenCalledTimes(1);
    expect(mockToastInfo).not.toHaveBeenCalled();
    expectNoLegacySubagentCommandCalls();
    expectNoTeamControlProjectionEvents();
  });
});
