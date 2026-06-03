import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  flushBoardEffects,
  renderBoard,
  expandLane,
} from "./TeamWorkspaceBoard.testFixtures";

describe("TeamWorkspaceBoard controls", () => {
  it("选中运行中的子代理时应展示停止操作，停止后触发回调", async () => {
    const onCloseSubagentSession = vi.fn();
    const container = await renderBoard({
      childSubagentSessions: [
        {
          id: "child-close-1",
          name: "可关闭代理",
          created_at: 1_710_000_000,
          updated_at: 1_710_000_100,
          session_type: "sub_agent",
          runtime_status: "running",
          latest_turn_status: "running",
          task_summary: "准备关闭测试",
          role_hint: "executor",
        },
      ],
      onCloseSubagentSession,
    });

    await expandLane(container, "child-close-1");

    expect(
      container.querySelector(
        '[data-testid="team-workspace-member-detail-child-close-1"]',
      ),
    ).toBeTruthy();

    const closeButton = Array.from(container.querySelectorAll("button")).find(
      (element) => element.textContent?.includes("暂停处理"),
    );
    expect(closeButton).toBeTruthy();

    await act(async () => {
      closeButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(onCloseSubagentSession).toHaveBeenCalledWith("child-close-1");
  });

  it("选中已关闭的子代理时应展示恢复操作，恢复后触发回调", async () => {
    const onResumeSubagentSession = vi.fn();
    const container = await renderBoard({
      childSubagentSessions: [
        {
          id: "child-resume-1",
          name: "可恢复代理",
          created_at: 1_710_000_000,
          updated_at: 1_710_000_100,
          session_type: "sub_agent",
          runtime_status: "closed",
          latest_turn_status: "closed",
          task_summary: "准备恢复测试",
          role_hint: "explorer",
        },
      ],
      onResumeSubagentSession,
    });

    await expandLane(container, "child-resume-1");

    const resumeButton = Array.from(container.querySelectorAll("button")).find(
      (element) => element.textContent?.includes("继续处理"),
    );
    expect(resumeButton).toBeTruthy();
    expect(
      container.querySelector(
        '[data-testid="team-workspace-member-detail-child-resume-1"]',
      ),
    ).toBeTruthy();

    await act(async () => {
      resumeButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(onResumeSubagentSession).toHaveBeenCalledWith("child-resume-1");
  });

  it("选中可管理子代理时应支持等待结果", async () => {
    const onWaitSubagentSession = vi.fn();
    const container = await renderBoard({
      childSubagentSessions: [
        {
          id: "child-wait-1",
          name: "可等待代理",
          created_at: 1_710_000_000,
          updated_at: 1_710_000_100,
          session_type: "sub_agent",
          runtime_status: "running",
          latest_turn_status: "running",
          task_summary: "等待结果测试",
          role_hint: "executor",
        },
      ],
      onWaitSubagentSession,
    });

    await expandLane(container, "child-wait-1");

    const waitButton = Array.from(container.querySelectorAll("button")).find(
      (element) => element.textContent?.includes("等待结果 30 秒"),
    );
    expect(waitButton).toBeTruthy();

    await act(async () => {
      waitButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(onWaitSubagentSession).toHaveBeenCalledWith("child-wait-1", 30000);
  });

  it("存在多个活跃子代理时应支持等待任一活跃 agent", async () => {
    const onWaitActiveTeamSessions = vi.fn();
    const container = await renderBoard({
      childSubagentSessions: [
        {
          id: "child-wait-team-1",
          name: "研究员",
          created_at: 1_710_000_000,
          updated_at: 1_710_000_100,
          session_type: "sub_agent",
          runtime_status: "running",
          latest_turn_status: "running",
          task_summary: "并行检索差异",
          role_hint: "explorer",
        },
        {
          id: "child-wait-team-2",
          name: "执行器",
          created_at: 1_710_000_010,
          updated_at: 1_710_000_120,
          session_type: "sub_agent",
          runtime_status: "queued",
          latest_turn_status: "queued",
          task_summary: "整理落地清单",
          role_hint: "executor",
        },
        {
          id: "child-wait-team-3",
          name: "归档员",
          created_at: 1_710_000_020,
          updated_at: 1_710_000_130,
          session_type: "sub_agent",
          runtime_status: "completed",
          latest_turn_status: "completed",
          task_summary: "汇总已有结果",
          role_hint: "reviewer",
        },
      ],
      onWaitActiveTeamSessions,
    });

    expect(container.textContent).toContain("等待任一任务结果");
    expect(container.textContent).toContain("2 项处理中");

    const waitAnyButton = Array.from(container.querySelectorAll("button")).find(
      (element) => element.textContent?.includes("等待任一任务结果"),
    );
    expect(waitAnyButton).toBeTruthy();

    await act(async () => {
      waitAnyButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(onWaitActiveTeamSessions).toHaveBeenCalledWith(
      ["child-wait-team-1", "child-wait-team-2"],
      30000,
    );
  });

  it("存在 team wait 摘要时应在 Team 轨迹中展示聚合等待结果", async () => {
    const container = await renderBoard({
      childSubagentSessions: [
        {
          id: "child-summary-1",
          name: "研究员",
          created_at: 1_710_000_000,
          updated_at: 1_710_000_100,
          session_type: "sub_agent",
          runtime_status: "running",
          latest_turn_status: "running",
          task_summary: "继续检索差异",
          role_hint: "explorer",
        },
        {
          id: "child-summary-2",
          name: "执行器",
          created_at: 1_710_000_010,
          updated_at: 1_710_000_120,
          session_type: "sub_agent",
          runtime_status: "completed",
          latest_turn_status: "completed",
          task_summary: "输出落地方案",
          role_hint: "executor",
        },
      ],
      teamWaitSummary: {
        awaitedSessionIds: ["child-summary-1", "child-summary-2"],
        timedOut: false,
        resolvedSessionId: "child-summary-2",
        resolvedStatus: "completed",
        updatedAt: Date.now(),
      },
    });

    const operations = container.querySelector(
      '[data-testid="team-workspace-team-operations"]',
    );
    const operationList = container.querySelector(
      '[data-testid="team-workspace-team-operations-list"]',
    );

    expect(operations).toBeTruthy();
    expect(operations?.textContent).toContain("任务进展");
    expect(operations?.textContent).toContain("最近 1 条");
    expect(operationList).toBeTruthy();
    expect(operations?.textContent).toContain("收到结果");
    expect(operations?.textContent).toContain("刚才等到 执行器 返回了新结果");
    expect(operations?.textContent).toContain("当前状态为已完成");
    expect(container.textContent).toContain("输出落地方案");
  });

  it("存在 team wait 命中结果时应自动聚焦到对应 agent", async () => {
    const container = await renderBoard({
      childSubagentSessions: [
        {
          id: "child-focus-1",
          name: "研究员",
          created_at: 1_710_000_000,
          updated_at: 1_710_000_100,
          session_type: "sub_agent",
          runtime_status: "running",
          latest_turn_status: "running",
          task_summary: "继续检索差异",
          role_hint: "explorer",
        },
        {
          id: "child-focus-2",
          name: "执行器",
          created_at: 1_710_000_010,
          updated_at: 1_710_000_120,
          session_type: "sub_agent",
          runtime_status: "completed",
          latest_turn_status: "completed",
          task_summary: "输出落地方案",
          role_hint: "executor",
        },
      ],
      teamWaitSummary: {
        awaitedSessionIds: ["child-focus-1", "child-focus-2"],
        timedOut: false,
        resolvedSessionId: "child-focus-2",
        resolvedStatus: "completed",
        updatedAt: Date.now(),
      },
    });

    const summary = container.querySelector(
      '[data-testid="team-workspace-session-summary"]',
    );

    expect(summary?.textContent).toContain("输出落地方案");
    expect(container.textContent).toContain("执行器");
  });

  it("存在级联 close/resume 摘要时应在 Team 轨迹中展示 team 控制结果", async () => {
    const container = await renderBoard({
      childSubagentSessions: [
        {
          id: "child-control-1",
          name: "父执行器",
          created_at: 1_710_000_000,
          updated_at: 1_710_000_100,
          session_type: "sub_agent",
          runtime_status: "closed",
          latest_turn_status: "closed",
          task_summary: "已关闭父执行器",
          role_hint: "executor",
        },
        {
          id: "child-control-2",
          name: "子执行器",
          created_at: 1_710_000_010,
          updated_at: 1_710_000_120,
          session_type: "sub_agent",
          runtime_status: "closed",
          latest_turn_status: "closed",
          task_summary: "已关闭子执行器",
          role_hint: "executor",
        },
      ],
      teamControlSummary: {
        action: "close",
        requestedSessionIds: ["child-control-1"],
        cascadeSessionIds: ["child-control-1", "child-control-2"],
        affectedSessionIds: ["child-control-1", "child-control-2"],
        updatedAt: Date.now(),
      },
    });

    const operations = container.querySelector(
      '[data-testid="team-workspace-team-operations"]',
    );

    expect(operations).toBeTruthy();
    expect(operations?.textContent).toContain("任务进展");
    expect(operations?.textContent).toContain("最近 1 条");
    expect(operations?.textContent).toContain("暂停处理");
    expect(operations?.textContent).toContain("刚才已暂停 2 项任务的处理");
  });

  it("点击 Team 轨迹项时应切换焦点到对应 agent", async () => {
    const now = Date.now();
    const container = await renderBoard({
      childSubagentSessions: [
        {
          id: "child-op-1",
          name: "研究员",
          created_at: 1_710_000_000,
          updated_at: 1_710_000_100,
          session_type: "sub_agent",
          runtime_status: "closed",
          latest_turn_status: "closed",
          task_summary: "已关闭研究员",
          role_hint: "explorer",
        },
        {
          id: "child-op-2",
          name: "执行器",
          created_at: 1_710_000_010,
          updated_at: 1_710_000_120,
          session_type: "sub_agent",
          runtime_status: "completed",
          latest_turn_status: "completed",
          task_summary: "输出落地方案",
          role_hint: "executor",
        },
      ],
      teamControlSummary: {
        action: "close",
        requestedSessionIds: ["child-op-1"],
        cascadeSessionIds: ["child-op-1"],
        affectedSessionIds: ["child-op-1"],
        updatedAt: now - 1_000,
      },
      teamWaitSummary: {
        awaitedSessionIds: ["child-op-1", "child-op-2"],
        timedOut: false,
        resolvedSessionId: "child-op-2",
        resolvedStatus: "completed",
        updatedAt: now,
      },
    });

    const summary = container.querySelector(
      '[data-testid="team-workspace-session-summary"]',
    );
    expect(summary?.textContent).toContain("输出落地方案");

    const controlEntry = Array.from(container.querySelectorAll("button")).find(
      (element) => element.textContent?.includes("暂停处理"),
    );
    expect(controlEntry).toBeTruthy();

    await act(async () => {
      controlEntry?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });
    await flushBoardEffects();

    const nextSummary = container.querySelector(
      '[data-testid="team-workspace-session-summary"]',
    );
    expect(nextSummary?.textContent).toContain("已关闭研究员");
  });

  it("存在已完成 agent 时应支持批量关闭以释放 slot", async () => {
    const onCloseCompletedTeamSessions = vi.fn();
    const container = await renderBoard({
      childSubagentSessions: [
        {
          id: "child-close-team-1",
          name: "执行器",
          created_at: 1_710_000_000,
          updated_at: 1_710_000_100,
          session_type: "sub_agent",
          runtime_status: "completed",
          latest_turn_status: "completed",
          task_summary: "输出落地方案",
          role_hint: "executor",
        },
        {
          id: "child-close-team-2",
          name: "复核员",
          created_at: 1_710_000_010,
          updated_at: 1_710_000_120,
          session_type: "sub_agent",
          runtime_status: "failed",
          latest_turn_status: "failed",
          task_summary: "复核失败案例",
          role_hint: "reviewer",
        },
        {
          id: "child-close-team-3",
          name: "研究员",
          created_at: 1_710_000_020,
          updated_at: 1_710_000_130,
          session_type: "sub_agent",
          runtime_status: "running",
          latest_turn_status: "running",
          task_summary: "继续检索差异",
          role_hint: "explorer",
        },
      ],
      onCloseCompletedTeamSessions,
    });

    expect(container.textContent).toContain("收起已完成任务");
    expect(container.textContent).toContain("2 项已完成");

    const closeCompletedButton = Array.from(
      container.querySelectorAll("button"),
    ).find((element) => element.textContent?.includes("收起已完成任务"));
    expect(closeCompletedButton).toBeTruthy();

    await act(async () => {
      closeCompletedButton?.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
      await Promise.resolve();
    });

    expect(onCloseCompletedTeamSessions).toHaveBeenCalledWith([
      "child-close-team-1",
      "child-close-team-2",
    ]);
  });

  it("选中其他子代理时应支持 SendMessage 与 interrupt SendMessage", async () => {
    const onSendSubagentInput = vi.fn();
    const container = await renderBoard({
      currentSessionId: "parent-1",
      childSubagentSessions: [
        {
          id: "child-send-1",
          name: "可发送代理",
          created_at: 1_710_000_000,
          updated_at: 1_710_000_100,
          session_type: "sub_agent",
          runtime_status: "running",
          latest_turn_status: "running",
          task_summary: "发送输入测试",
          role_hint: "explorer",
        },
      ],
      onSendSubagentInput,
    });

    await expandLane(container, "child-send-1");

    const textarea = container.querySelector<HTMLTextAreaElement>(
      '[data-testid="team-workspace-send-input-textarea"]',
    );
    expect(textarea).toBeTruthy();

    if (!textarea) {
      throw new Error("textarea 未渲染");
    }

    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      )?.set;
      setter?.call(textarea, "请继续验证剩余差异，并回传结论。");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
      await Promise.resolve();
    });

    const sendButton = Array.from(container.querySelectorAll("button")).find(
      (element) => element.textContent?.includes("发送说明"),
    );
    const interruptButton = Array.from(
      container.querySelectorAll("button"),
    ).find((element) => element.textContent?.includes("立即插入说明"));
    expect(sendButton).toBeTruthy();
    expect(interruptButton).toBeTruthy();

    await act(async () => {
      sendButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(onSendSubagentInput).toHaveBeenNthCalledWith(
      1,
      "child-send-1",
      "请继续验证剩余差异，并回传结论。",
      { interrupt: false },
    );

    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      )?.set;
      setter?.call(textarea, "请中断当前步骤，改为先输出阻塞列表。");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
      await Promise.resolve();
    });

    await act(async () => {
      interruptButton?.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
      await Promise.resolve();
    });

    expect(onSendSubagentInput).toHaveBeenNthCalledWith(
      2,
      "child-send-1",
      "请中断当前步骤，改为先输出阻塞列表。",
      { interrupt: true },
    );
  });
});
