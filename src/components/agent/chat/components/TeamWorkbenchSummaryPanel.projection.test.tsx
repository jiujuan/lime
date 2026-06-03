import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { changeLimeLocale } from "@/i18n/createI18n";
import { recordAgentUiProjectionEvents } from "../projection/conversationProjectionStore";
import {
  openTechnicalDetails,
  renderPanel,
} from "./TeamWorkbenchSummaryPanel.testFixtures";

describe("TeamWorkbenchSummaryPanel", () => {
  it("应从 Agent UI projection store 展示 v0.6 Team Workbench surfaces", () => {
    recordAgentUiProjectionEvents([
      {
        type: "team.changed",
        sourceType: "runtime_status",
        sequence: 1,
        sessionId: "session-team-1",
        owner: "team",
        scope: "team",
        phase: "acting",
        surface: "team_roster",
        persistence: "snapshot",
        payload: {
          teamEvent: "runtime_status_changed",
        },
      },
      {
        type: "agent.spawned",
        sourceType: "subagent_status_changed",
        sequence: 2,
        sessionId: "session-team-1",
        agentId: "child-1",
        taskId: "child-1",
        owner: "agent",
        scope: "agent",
        phase: "acting",
        surface: "delegation_graph",
        persistence: "snapshot",
        payload: {
          agentEvent: "subagent_active",
        },
      },
      {
        type: "task.changed",
        sourceType: "subagent_status_changed",
        sequence: 3,
        sessionId: "session-team-1",
        agentId: "child-1",
        taskId: "child-1",
        owner: "task",
        scope: "task",
        phase: "acting",
        surface: "work_board",
        persistence: "snapshot",
        payload: {
          taskEvent: "assignment_changed",
        },
      },
      {
        type: "worker.notification",
        sourceType: "subagent_status_changed",
        sequence: 4,
        sessionId: "session-team-1",
        agentId: "child-1",
        taskId: "child-1",
        owner: "agent",
        scope: "agent",
        phase: "completed",
        surface: "worker_notifications",
        persistence: "archive",
        workerNotificationId: "child-1:completed",
        payload: {
          notificationKind: "worker_completed",
          status: "completed",
        },
      },
      {
        type: "agent.changed",
        sourceType: "subagent_status_changed",
        sequence: 5,
        sessionId: "session-team-1",
        agentId: "child-1",
        taskId: "child-1",
        owner: "agent",
        scope: "agent",
        phase: "acting",
        surface: "teammate_transcript",
        persistence: "snapshot",
        control: "open_detail",
        transcriptRef: "child-1:turn-child-1",
        payload: {
          transcriptRef: "child-1:turn-child-1",
        },
      },
      {
        type: "agent.changed",
        sourceType: "automation_job_projection",
        sequence: 6,
        sessionId: "session-team-1",
        agentId: "automation-1",
        taskId: "automation-1",
        owner: "agent",
        scope: "agent",
        phase: "acting",
        surface: "background_teammate",
        persistence: "snapshot",
        runtimeEntity: "automation_job",
        payload: {
          agentEvent: "automation_job_started",
        },
      },
      {
        type: "agent.changed",
        sourceType: "evidence_projection",
        sequence: 7,
        sessionId: "session-team-1",
        agentId: "remote-1",
        taskId: "remote-1",
        owner: "agent",
        scope: "agent",
        phase: "acting",
        surface: "remote_teammate",
        persistence: "snapshot",
        runtimeEntity: "external_task",
        payload: {
          agentEvent: "remote_task_changed",
        },
      },
      {
        type: "agent.handoff",
        sourceType: "evidence_projection",
        sequence: 8,
        sessionId: "session-team-1",
        handoffId: "handoff-1",
        owner: "agent",
        scope: "agent",
        phase: "completed",
        surface: "handoff_lane",
        persistence: "evidence_pack",
        payload: {
          handoffEvent: "analysis_handoff",
          reason: "analysis_handoff_exported",
        },
      },
      {
        type: "review.requested",
        sourceType: "evidence_projection",
        sequence: 9,
        sessionId: "session-team-1",
        reviewId: "review-1",
        owner: "evidence",
        scope: "evidence",
        phase: "reviewing",
        surface: "review_lane",
        persistence: "evidence_pack",
        control: "request_review",
        payload: {
          reviewEvent: "requested",
          decisionStatus: "pending_review",
          riskLevel: "high",
          checklistCount: 2,
          requestedFixes: ["复核权限确认"],
          regressionRequirements: ["npm run test:contracts"],
        },
      },
      {
        type: "team.changed",
        sourceType: "runtime_status",
        sequence: 10,
        sessionId: "session-team-1",
        owner: "team",
        scope: "team",
        phase: "acting",
        surface: "team_policy",
        persistence: "snapshot",
        payload: {
          teamEvent: "policy_changed",
        },
      },
    ]);

    const onWorkbenchAction = vi.fn();
    const container = renderPanel({
      currentSessionId: "session-team-1",
      childSubagentSessions: [
        {
          id: "child-1",
          name: "分析助手",
          created_at: 1_710_000_000,
          updated_at: 1_710_000_100,
          session_type: "sub_agent",
          runtime_status: "running",
          latest_turn_status: "running",
          task_summary: "梳理标准差异",
          role_hint: "explorer",
        },
      ],
      liveActivityBySessionId: {
        "child-1": [
          {
            id: "activity-child-1",
            title: "读取文件",
            detail: "已读取 Agent UI 标准文档",
            statusLabel: "进行中",
            badgeClassName: "border border-sky-200 bg-sky-50 text-sky-700",
            sourceType: "tool_call",
            sourceLabel: "tool_start",
          },
        ],
      },
      onWorkbenchAction,
    });

    expect(container.textContent).toContain("工作台细节");
    expect(container.textContent).toContain("10 条记录");
    expect(container.textContent).not.toContain("Agent UI v0.6");
    expect(container.textContent).not.toContain("Roster");
    openTechnicalDetails(container);
    expect(container.textContent).toContain("Team 拓扑");
    expect(container.textContent).toContain("Worker 流");
    expect(container.textContent).toContain("Review / Handoff");
    expect(container.textContent).toContain("工作台操作视图");
    expect(container.textContent).toContain("10 项");
    expect(container.textContent).toContain("注意 1");
    expect(container.textContent).toContain("工作区专门视图");
    expect(container.textContent).toContain("成员");
    expect(container.textContent).toContain("成员、角色、来源与当前状态");
    expect(container.textContent).toContain("分派关系");
    expect(container.textContent).toContain("任务板");
    expect(container.textContent).toContain("执行通知");
    expect(container.textContent).toContain("记录");
    expect(container.textContent).toContain("后台");
    expect(container.textContent).toContain("外部");
    expect(container.textContent).toContain("交接");
    expect(container.textContent).toContain("评审");
    expect(container.textContent).toContain("决策：pending_review");
    expect(container.textContent).toContain("风险：high");
    expect(container.textContent).toContain("清单 2");
    expect(container.textContent).toContain("修复：复核权限确认");
    expect(container.textContent).toContain("回归项：npm run test:contracts");
    expect(container.textContent).toContain("策略");
    expect(container.textContent).toContain("Review 请求");
    expect(container.textContent).toContain("Agent 交接");

    const reviewAction = container.querySelector<HTMLButtonElement>(
      '[data-agentui-action-target="review-1"]',
    );
    expect(reviewAction).not.toBeNull();

    act(() => {
      reviewAction?.click();
    });

    expect(onWorkbenchAction).toHaveBeenCalledTimes(1);
    expect(onWorkbenchAction.mock.calls[0]?.[0]).toMatchObject({
      title: "review-1",
      action: { control: "request_review", targetId: "review-1" },
      target: { reviewId: "review-1" },
    });
    expect(container.textContent).toContain("已定位工作台目标");
    expect(container.textContent).toContain("请求审核 · review-1");
    expect(container.textContent).toContain("评审");
    expect(container.textContent).toContain("审核：review-1");
    expect(container.textContent).toContain(
      "不根据普通文本猜测状态，也不直接代替外部任务、审核或交接操作",
    );

    const transcriptAction = container.querySelector<HTMLButtonElement>(
      '[data-agentui-action-target="child-1:turn-child-1"]',
    );
    expect(transcriptAction).not.toBeNull();

    act(() => {
      transcriptAction?.click();
    });

    expect(onWorkbenchAction).toHaveBeenCalledTimes(2);
    expect(onWorkbenchAction.mock.calls[1]?.[0]).toMatchObject({
      title: "child-1:turn-child-1",
      action: {
        control: "open_detail",
        targetId: "child-1:turn-child-1",
      },
      target: {
        agentId: "child-1",
        taskId: "child-1",
        transcriptRef: "child-1:turn-child-1",
      },
    });
    expect(container.textContent).toContain("打开详情 · child-1:turn-child-1");
    expect(container.textContent).toContain("队友记录详情");
    expect(container.textContent).toContain("记录引用：child-1:turn-child-1");
    expect(container.textContent).toContain("队友任务：child-1");
    expect(container.textContent).toContain("最新步骤：turn-child-1");
    expect(container.textContent).toContain("队友任务概览");
    expect(container.textContent).toContain("分析助手");
    expect(container.textContent).toContain("状态：处理中");
    expect(container.textContent).toContain("步骤状态：处理中");
    expect(container.textContent).toContain("角色：explorer");
    expect(container.textContent).toContain("任务摘要：梳理标准差异");
    expect(container.textContent).toContain("队友任务进展");
    expect(container.textContent).toContain("1 条");
    expect(container.textContent).toContain("记录明细");
    expect(container.textContent).toContain("工具活动 1 条");
    expect(container.textContent).toContain("工具调用");
    expect(container.textContent).toContain("读取文件");
    expect(container.textContent).toContain("已读取工作台标准文档");
    expect(container.textContent).not.toContain("Agent UI 标准文档");
    expect(container.textContent).toContain("相关队友链路");
    expect(container.textContent).toContain("不生成新状态");
    expect(container.textContent).toContain("执行通知");
    expect(container.textContent).toContain("child-1:completed");
    expect(container.textContent).toContain("不把队友输出混进主");
    expect(container.textContent).toContain("主回复");
  });
  it("AgentUI Team Workbench projection surface 应按 locale 渲染", async () => {
    await changeLimeLocale("en-US");
    recordAgentUiProjectionEvents([
      {
        type: "task.changed",
        sourceType: "team_control_projection",
        sequence: 1,
        sessionId: "session-team-locale",
        taskId: "work-1",
        workItemId: "work-1",
        owner: "task",
        scope: "task",
        phase: "acting",
        surface: "work_board",
        persistence: "snapshot",
        control: "assign",
        runtimeEntity: "work_item",
        payload: {
          taskEvent: "assignment_changed",
        },
      },
    ]);

    const container = renderPanel({
      currentSessionId: "session-team-locale",
      childSubagentSessions: [],
    });

    expect(container.textContent).toContain("Workbench details");
    openTechnicalDetails(container);
    expect(container.textContent).toContain("Team topology");
    expect(container.textContent).toContain(
      "Members, delegation, work board, and policy facts",
    );
    expect(container.textContent).toContain(
      "Tasks, assignments, and work items",
    );
    expect(container.textContent).toContain("Acting");
    expect(container.textContent).not.toContain("Team 拓扑");
    expect(container.textContent).not.toContain(
      "任务项、assignment 与 work item",
    );
  });
  it("应把工作台 action route 结果显示为可见状态", () => {
    recordAgentUiProjectionEvents([
      {
        type: "review.requested",
        sourceType: "evidence_projection",
        sequence: 1,
        sessionId: "session-team-1",
        reviewId: "review-route-1",
        owner: "agent",
        scope: "task",
        phase: "reviewing",
        surface: "review_lane",
        persistence: "evidence_pack",
        control: "request_review",
        payload: {
          reviewEvent: "requested",
          decisionStatus: "pending_review",
        },
      },
    ]);

    const onWorkbenchAction = vi.fn().mockReturnValue("unsupported_review");
    const container = renderPanel({
      currentSessionId: "session-team-1",
      onWorkbenchAction,
    });
    openTechnicalDetails(container);

    const reviewAction = container.querySelector<HTMLButtonElement>(
      '[data-agentui-action-target="review-route-1"]',
    );
    expect(reviewAction).not.toBeNull();

    act(() => {
      reviewAction?.click();
    });

    expect(onWorkbenchAction).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("已定位工作台目标");
    expect(container.textContent).toContain("请求审核 · review-route-1");
    expect(container.textContent).toContain("审核未连接");
    expect(container.textContent).toContain(
      "审核记录已定位；审核回写接入前，这里只提供查看。",
    );
  });
  it("应把 remote task source fact 显示为已定位而不是未接入", () => {
    recordAgentUiProjectionEvents([
      {
        type: "agent.changed",
        sourceType: "remote_task_projection",
        sequence: 1,
        sessionId: "session-team-1",
        taskId: "gateway:telegram:default:message-1",
        agentId: "telegram:default",
        remoteTaskId: "gateway:telegram:default:message-1",
        owner: "agent",
        scope: "agent",
        phase: "acting",
        surface: "remote_teammate",
        persistence: "snapshot",
        control: "open_detail",
        runtimeEntity: "external_task",
        runtimeStatus: "running",
        payload: {
          remoteEvent: "updated",
          channel: "telegram",
          accountId: "default",
          remoteTaskId: "gateway:telegram:default:message-1",
          agentCardName: "Telegram Remote",
        },
      },
    ]);

    const onWorkbenchAction = vi
      .fn()
      .mockReturnValue("remote_task_source_located");
    const container = renderPanel({
      currentSessionId: "session-team-1",
      onWorkbenchAction,
    });
    openTechnicalDetails(container);

    const remoteAction = container.querySelector<HTMLButtonElement>(
      '[data-agentui-action-target="gateway:telegram:default:message-1"]',
    );
    expect(remoteAction).not.toBeNull();

    act(() => {
      remoteAction?.click();
    });

    expect(onWorkbenchAction).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("远端任务已定位");
    expect(container.textContent).toContain(
      "已定位外部任务记录；当前只展示来源、状态与结果引用，不直接代替外部系统操作。",
    );
    expect(container.textContent).not.toContain("外部任务未连接");
  });
  it("应把 handoff source fact 显示为已定位而不是未接入", () => {
    recordAgentUiProjectionEvents([
      {
        type: "agent.handoff",
        sourceType: "subagent_status_changed",
        sequence: 1,
        sessionId: "session-team-1",
        taskId: "child-1",
        agentId: "child-1",
        handoffId: "session-team-1:handoff:child-1",
        parentSessionId: "session-team-1",
        owner: "agent",
        scope: "agent",
        phase: "reconciling",
        surface: "handoff_lane",
        persistence: "archive",
        control: "open_detail",
        topology: "specialist_handoff",
        runtimeEntity: "subagent_turn",
        runtimeStatus: "completed",
        payload: {
          handoffEvent: "specialist_handoff",
          status: "returned",
          sourceStatus: "completed",
          from: "session-team-1",
          to: "child-1",
          resumeTarget: "agent-runtime://session/child-1",
        },
      },
    ]);

    const onWorkbenchAction = vi.fn().mockReturnValue("handoff_source_located");
    const container = renderPanel({
      currentSessionId: "session-team-1",
      onWorkbenchAction,
    });
    openTechnicalDetails(container);

    const handoffAction = container.querySelector<HTMLButtonElement>(
      '[data-agentui-action-target="session-team-1:handoff:child-1"]',
    );
    expect(handoffAction).not.toBeNull();

    act(() => {
      handoffAction?.click();
    });

    expect(onWorkbenchAction).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("交接已定位");
    expect(container.textContent).toContain(
      "已定位交接记录；当前只展示交接过程，不直接代替其他任务操作。",
    );
    expect(container.textContent).not.toContain("交接未连接");
  });
});
