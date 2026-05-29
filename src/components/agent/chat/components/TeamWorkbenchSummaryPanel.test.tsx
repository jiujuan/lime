import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearAgentUiProjectionEvents,
  recordAgentUiProjectionEvents,
} from "../projection/conversationProjectionStore";
import { TeamWorkbenchSummaryPanel } from "./TeamWorkbenchSummaryPanel";
import { changeLimeLocale } from "@/i18n/createI18n";

const { mockExecutionRunList, mockGetAgentRuntimeSession } = vi.hoisted(() => ({
  mockExecutionRunList: vi.fn(),
  mockGetAgentRuntimeSession: vi.fn(),
}));

vi.mock("@/lib/api/agentRuntime", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/agentRuntime")>(
    "@/lib/api/agentRuntime",
  );
  return {
    ...actual,
    getAgentRuntimeSession: mockGetAgentRuntimeSession,
  };
});

vi.mock("@/lib/api/executionRun", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/executionRun")>(
    "@/lib/api/executionRun",
  );
  return {
    ...actual,
    executionRunList: mockExecutionRunList,
  };
});

interface MountedHarness {
  container: HTMLDivElement;
  root: Root;
}

const mountedRoots: MountedHarness[] = [];

beforeEach(async () => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  await changeLimeLocale("zh-CN");
  mockExecutionRunList.mockResolvedValue([]);
});

afterEach(() => {
  mockExecutionRunList.mockReset();
  mockGetAgentRuntimeSession.mockReset();
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

function renderPanel(
  props: Partial<Parameters<typeof TeamWorkbenchSummaryPanel>[0]> = {},
) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <TeamWorkbenchSummaryPanel
        currentSessionQueuedTurnCount={0}
        childSubagentSessions={[]}
        selectedTeamRoles={[]}
        liveRuntimeBySessionId={{}}
        liveActivityBySessionId={{}}
        {...props}
      />,
    );
  });

  mountedRoots.push({ container, root });
  return container;
}

function openTechnicalDetails(container: HTMLElement) {
  const toggle = container.querySelector<HTMLButtonElement>(
    '[data-testid="team-workbench-technical-details-toggle"]',
  );
  expect(toggle).not.toBeNull();
  act(() => {
    toggle?.click();
  });
}

describe("TeamWorkbenchSummaryPanel", () => {
  it("应在主视图中展示 Team 记忆影子卡片", () => {
    const container = renderPanel({
      selectedTeamLabel: "研究双人组",
      selectedTeamSummary: "分析、实现、验证三段式推进。",
      teamMemorySnapshot: {
        repoScope: "/workspace/lime",
        entries: {
          "team.selection": {
            key: "team.selection",
            content: "Team：研究双人组\n角色：\n- 研究员：梳理上下文",
            updatedAt: 100,
          },
        },
      },
    });

    expect(container.textContent).toContain("生成");
    expect(container.textContent).toContain("任务记忆影子");
    expect(container.textContent).toContain("/workspace/lime");
    expect(container.textContent).toContain("当前分工方案");
    expect(container.textContent).toContain("研究双人组");
  });

  it("任务分工已就绪时应展示当前任务视角", () => {
    const container = renderPanel({
      teamDispatchPreviewState: {
        requestId: "runtime-formed-1",
        status: "formed",
        label: "修复 Team",
        summary: "分析、执行、验证三段式推进。",
        members: [
          {
            id: "task-1",
            label: "分析",
            summary: "收敛问题边界。",
            roleKey: "explorer",
            profileId: "code-explorer",
            skillIds: ["repo-exploration"],
            status: "planned",
          },
          {
            id: "task-2",
            label: "执行",
            summary: "落地修复并回传结果。",
            roleKey: "executor",
            profileId: "code-executor",
            skillIds: ["bounded-implementation"],
            status: "planned",
          },
        ],
        blueprint: {
          label: "代码排障团队",
          summary: "分析、执行、验证三段式推进。",
          roles: [],
        },
        updatedAt: Date.now(),
      },
    });

    expect(container.textContent).toContain("任务分工已准备好");
    expect(container.textContent).toContain("当前任务分工");
    expect(container.textContent).toContain(
      "当前分工方案已就绪。任务拆出后，这里会从方案视图过渡到当前进展。",
    );
    expect(container.textContent).toContain("参考方案：代码排障团队");
  });

  it("最近动态应使用任务叙事", () => {
    const container = renderPanel({
      childSubagentSessions: [
        {
          id: "child-1",
          name: "分析",
          created_at: 1_710_000_000,
          updated_at: 1_710_000_100,
          session_type: "sub_agent",
          runtime_status: "completed",
          latest_turn_status: "completed",
          task_summary: "已整理问题边界",
        },
        {
          id: "child-2",
          name: "执行",
          created_at: 1_710_000_010,
          updated_at: 1_710_000_120,
          session_type: "sub_agent",
          runtime_status: "completed",
          latest_turn_status: "completed",
          task_summary: "已完成修复",
        },
      ],
      teamControlSummary: {
        action: "close_completed",
        requestedSessionIds: ["child-1", "child-2"],
        cascadeSessionIds: [],
        affectedSessionIds: ["child-1", "child-2"],
        updatedAt: Date.now(),
      },
    });

    expect(container.textContent).toContain("最近动态");
    expect(container.textContent).toContain(
      "最近一次收尾操作收起了 2 项已完成任务。",
    );
    expect(container.textContent).not.toContain("总会话");
    expect(container.textContent).not.toContain("交互说明");
  });

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

  it("应展示 requested fix 回填输入框后的发起状态", () => {
    recordAgentUiProjectionEvents([
      {
        type: "task.changed",
        sourceType: "evidence_projection",
        sequence: 1,
        sessionId: "session-team-1",
        reviewId: "review-1",
        workItemId: "review-1:requested-fix:1",
        taskId: "review-1:requested-fix:1",
        owner: "task",
        scope: "task",
        phase: "waiting",
        surface: "work_board",
        persistence: "snapshot",
        control: "assign",
        runtimeEntity: "work_item",
        payload: {
          taskEvent: "review_requested_fix",
          requestedFix: "补齐 evidence pack 导出记录",
          executionStatus: "pending",
        },
      },
    ]);

    const onWorkbenchAction = vi.fn().mockReturnValue("seeded_work_item");
    const container = renderPanel({
      currentSessionId: "session-team-1",
      onWorkbenchAction,
    });
    openTechnicalDetails(container);

    const requestedFixAction = container.querySelector<HTMLButtonElement>(
      '[data-agentui-action-target="review-1:requested-fix:1"]',
    );
    expect(requestedFixAction).not.toBeNull();

    act(() => {
      requestedFixAction?.click();
    });

    expect(onWorkbenchAction).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain(
      "指派修复 · review-1:requested-fix:1",
    );
    expect(container.textContent).toContain("已回填输入");
    expect(container.textContent).toContain(
      "修复请求已回填到输入框；发送后才会进入执行，这里不会直接标记完成。",
    );
  });

  it("应展示 requested fix 已提交到 runtime turn 的执行状态", async () => {
    recordAgentUiProjectionEvents([
      {
        type: "task.changed",
        sourceType: "evidence_projection",
        sequence: 1,
        sessionId: "session-team-1",
        reviewId: "review-1",
        workItemId: "review-1:requested-fix:1",
        taskId: "review-1:requested-fix:1",
        owner: "task",
        scope: "task",
        phase: "waiting",
        surface: "work_board",
        persistence: "snapshot",
        control: "assign",
        runtimeEntity: "work_item",
        payload: {
          taskEvent: "review_requested_fix",
          requestedFix: "补齐 evidence pack 导出记录",
          executionStatus: "pending",
        },
      },
    ]);

    const onWorkbenchAction = vi.fn().mockResolvedValue("submitted_work_item");
    const container = renderPanel({
      currentSessionId: "session-team-1",
      onWorkbenchAction,
    });
    openTechnicalDetails(container);

    const requestedFixAction = container.querySelector<HTMLButtonElement>(
      '[data-agentui-action-target="review-1:requested-fix:1"]',
    );
    expect(requestedFixAction).not.toBeNull();

    await act(async () => {
      requestedFixAction?.click();
    });

    expect(onWorkbenchAction).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("已提交执行");
    expect(container.textContent).toContain(
      "修复请求已提交为执行请求；结果会等后台记录回写后再更新。",
    );
  });

  it("没有实时活动时应从队友任务历史正文读取记录预览", async () => {
    mockGetAgentRuntimeSession.mockResolvedValue({
      id: "child-1",
      name: "分析助手",
      created_at: 1_710_000_000,
      updated_at: 1_710_000_100,
      messages: [
        {
          id: "message-1",
          role: "assistant",
          timestamp: 1_710_000_090,
          content: [
            {
              type: "text",
              text: "历史正文：已完成差异梳理，并整理出两个未对齐项。",
            },
          ],
        },
      ],
      items: [
        {
          id: "item-input-1",
          thread_id: "thread-child-1",
          turn_id: "turn-child-1",
          sequence: 4,
          status: "in_progress",
          started_at: "2026-05-09T10:00:00Z",
          updated_at: "2026-05-09T10:00:02Z",
          type: "request_user_input",
          request_id: "input-1",
          action_type: "clarify_fix_scope",
          prompt: "请选择修复策略",
          questions: [{ question: "先修 UI 还是协议？", header: "修复范围" }],
        },
        {
          id: "item-tool-1",
          thread_id: "thread-child-1",
          turn_id: "turn-child-1",
          sequence: 3,
          status: "in_progress",
          started_at: "2026-05-09T10:00:00Z",
          updated_at: "2026-05-09T10:00:01Z",
          type: "tool_call",
          tool_name: "browser_snapshot",
          output: "正在读取页面结构。",
        },
        {
          id: "item-message-1",
          thread_id: "thread-child-1",
          turn_id: "turn-child-1",
          sequence: 2,
          status: "completed",
          started_at: "2026-05-09T09:59:00Z",
          completed_at: "2026-05-09T09:59:10Z",
          updated_at: "2026-05-09T09:59:10Z",
          type: "agent_message",
          text: "历史正文：已完成差异梳理，并整理出两个未对齐项。",
        },
      ],
      queued_turns: [
        {
          queued_turn_id: "queued-turn-1",
          message_preview: "继续处理 Agent UI transcript drilldown",
          message_text: "继续处理 Agent UI transcript drilldown",
          created_at: 1_710_000_095,
          image_count: 1,
          position: 0,
        },
      ],
    });
    recordAgentUiProjectionEvents([
      {
        type: "agent.changed",
        sourceType: "subagent_status_changed",
        sequence: 1,
        sessionId: "session-team-1",
        taskId: "child-1",
        agentId: "child-1",
        owner: "agent",
        scope: "agent",
        phase: "completed",
        surface: "teammate_transcript",
        persistence: "snapshot",
        control: "open_detail",
        runtimeEntity: "subagent_turn",
        transcriptRef: "child-1:turn-child-1",
        payload: {
          agentEvent: "teammate_transcript_ref",
        },
      },
    ]);

    const container = renderPanel({
      currentSessionId: "session-team-1",
      childSubagentSessions: [
        {
          id: "child-1",
          name: "分析助手",
          created_at: 1_710_000_000,
          updated_at: 1_710_000_100,
          session_type: "sub_agent",
          runtime_status: "completed",
          latest_turn_status: "completed",
          task_summary: "梳理标准差异",
          role_hint: "explorer",
        },
      ],
    });
    openTechnicalDetails(container);

    const transcriptAction = container.querySelector<HTMLButtonElement>(
      '[data-agentui-action-target="child-1:turn-child-1"]',
    );
    expect(transcriptAction).not.toBeNull();

    await act(async () => {
      transcriptAction?.click();
      await Promise.resolve();
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockGetAgentRuntimeSession).toHaveBeenCalledWith("child-1", {
      historyLimit: 20,
    });
    expect(container.textContent).toContain("记录明细");
    expect(container.textContent).toContain("输入队列 1 条");
    expect(container.textContent).toContain("待处理输入 1 条");
    expect(container.textContent).toContain("工具活动 1 条");
    expect(container.textContent).toContain("近期消息 1 条");
    expect(container.textContent).toContain("这里只展示已有输入队列与历史正文");
    expect(container.textContent).toContain("继续处理工作台记录明细");
    expect(container.textContent).not.toContain("Agent UI transcript");
    expect(container.textContent).toContain("图片 1");
    expect(container.textContent).toContain("请选择修复策略");
    expect(container.textContent).toContain("等待补充");
    expect(container.textContent).toContain("工具活动");
    expect(container.textContent).toContain("工具调用");
    expect(container.textContent).toContain("队友任务进展");
    expect(container.textContent).toContain("历史正文 3 条");
    expect(container.textContent).toContain("回复");
    expect(container.textContent).toContain(
      "历史正文：已完成差异梳理，并整理出两个未对齐项。",
    );
    expect(container.textContent).toContain("不把队友输出混进主回复");
  });

  it("应在 Team Workbench 中展示 reassignment live board update", () => {
    recordAgentUiProjectionEvents([
      {
        type: "task.changed",
        sourceType: "team_control_projection",
        sequence: 1,
        sessionId: "session-team-1",
        threadId: "thread-1",
        taskId: "work-item-2",
        workItemId: "work-item-2",
        owner: "task",
        scope: "task",
        phase: "routing",
        surface: "work_board",
        persistence: "snapshot",
        control: "assign",
        runtimeEntity: "work_item",
        runtimeStatus: "queued",
        payload: {
          taskEvent: "team_reassignment",
          action: "reassign",
          previousAssigneeId: "researcher",
          nextAssigneeId: "implementer",
          reassignmentReason: "实现阶段需要切换负责人",
        },
      },
    ]);

    const onWorkbenchAction = vi
      .fn()
      .mockReturnValue("work_item_source_located");
    const container = renderPanel({
      currentSessionId: "session-team-1",
      onWorkbenchAction,
    });
    openTechnicalDetails(container);

    expect(container.textContent).toContain("重新指派给 implementer");
    expect(container.textContent).toContain(
      "工作项：work-item-2 / 负责人：researcher → implementer / 原因：实现阶段需要切换负责人",
    );
    expect(container.textContent).toContain("Reassign");
    expect(container.textContent).toContain("researcher → implementer");

    const reassignAction = container.querySelector<HTMLButtonElement>(
      '[data-agentui-action-target="work-item-2"]',
    );
    expect(reassignAction).not.toBeNull();

    act(() => {
      reassignAction?.click();
    });

    expect(onWorkbenchAction).toHaveBeenCalledTimes(1);
    expect(onWorkbenchAction.mock.calls[0]?.[0]).toMatchObject({
      title: "重新指派给 implementer",
      action: {
        control: "assign",
        label: "重新指派",
        targetId: "work-item-2",
      },
      target: {
        workItemId: "work-item-2",
        taskId: "work-item-2",
        threadId: "thread-1",
      },
    });
    expect(container.textContent).toContain("已定位工作台目标");
    expect(container.textContent).toContain("工作项已定位");
    expect(container.textContent).toContain(
      "已定位任务记录；可通过负责人选择器回填更新指令，等待后台确认负责人变化。",
    );
    expect(container.textContent).toContain("重新指派 · work-item-2");
    expect(container.textContent).toContain("任务板");
  });

  it("应为 work_board source fact 提供重指派 selector 并回填 TaskUpdate 指令", async () => {
    recordAgentUiProjectionEvents([
      {
        type: "task.changed",
        sourceType: "item_completed",
        sequence: 1,
        sessionId: "session-team-1",
        threadId: "thread-1",
        taskId: "work-item-2",
        workItemId: "work-item-2",
        owner: "task",
        scope: "task",
        phase: "accepted",
        surface: "work_board",
        persistence: "snapshot",
        control: "assign",
        runtimeEntity: "work_item",
        runtimeStatus: "accepted",
        payload: {
          taskEvent: "team_reassignment",
          action: "reassign",
          previousAssigneeId: "研究员",
          nextAssigneeId: "实现者",
          reassignmentReason: "实现阶段需要切换负责人",
          sourceTaskListId: "task-list-1",
        },
      },
    ]);

    const onWorkbenchReassign = vi
      .fn()
      .mockResolvedValue("seeded_reassignment");
    const container = renderPanel({
      currentSessionId: "session-team-1",
      childSubagentSessions: [
        {
          id: "child-implementer",
          name: "实现者",
          created_at: 1,
          updated_at: 2,
          session_type: "sub_agent",
          runtime_status: "running",
          latest_turn_status: "running",
          role_hint: "executor",
        },
        {
          id: "child-reviewer",
          name: "复核员",
          created_at: 1,
          updated_at: 2,
          session_type: "sub_agent",
          runtime_status: "idle",
          latest_turn_status: "idle",
          role_hint: "reviewer",
        },
      ],
      onWorkbenchAction: vi.fn().mockReturnValue("work_item_source_located"),
      onWorkbenchReassign,
    });
    openTechnicalDetails(container);

    const reassignAction = container.querySelector<HTMLButtonElement>(
      '[data-agentui-action-target="work-item-2"]',
    );
    expect(reassignAction).not.toBeNull();

    act(() => {
      reassignAction?.click();
    });

    const selector = container.querySelector<HTMLSelectElement>(
      "[data-agentui-reassignment-select]",
    );
    expect(selector).not.toBeNull();
    expect(container.textContent).toContain("负责人重指派");
    expect(container.textContent).toContain("负责人更新");
    expect(container.textContent).toContain("以后台返回的负责人变化为准");

    await act(async () => {
      if (!selector) {
        throw new Error("selector 不应为空");
      }
      selector.value = "复核员";
      selector.dispatchEvent(new Event("change", { bubbles: true }));
    });

    const submit = container.querySelector<HTMLButtonElement>(
      "[data-agentui-reassignment-submit]",
    );
    expect(submit).not.toBeNull();

    await act(async () => {
      submit?.click();
      await Promise.resolve();
    });

    expect(onWorkbenchReassign).toHaveBeenCalledTimes(1);
    expect(onWorkbenchReassign.mock.calls[0]?.[0]).toMatchObject({
      title: "重新指派给 实现者",
      target: {
        workItemId: "work-item-2",
        taskId: "work-item-2",
      },
    });
    expect(onWorkbenchReassign.mock.calls[0]?.[1]).toBe("复核员");
    expect(container.textContent).toContain("重指派已回填");
    expect(container.textContent).toContain(
      "负责人更新指令已回填；发送并执行后，以后台返回的负责人变化为准。",
    );
  });

  it("应把 requested fix 的执行结果引用串到 artifact / evidence 追溯链路", () => {
    const resultRef =
      "agent-runtime://session/session-team-1/thread/thread-1/turn/turn-review/item/item-fix-1";
    const artifactPath =
      ".lime/harness/sessions/session-team-1/evidence/runtime.json";

    recordAgentUiProjectionEvents([
      {
        type: "task.changed",
        sourceType: "evidence_projection",
        sequence: 1,
        sessionId: "session-team-1",
        threadId: "thread-1",
        taskId: "review-1:requested-fix:1",
        workItemId: "review-1:requested-fix:1",
        reviewId: "review-1",
        owner: "task",
        scope: "task",
        phase: "completed",
        surface: "work_board",
        persistence: "snapshot",
        control: "open_detail",
        runtimeEntity: "work_item",
        runtimeStatus: "completed",
        payload: {
          taskEvent: "review_requested_fix",
          requestedFix: "补齐 evidence pack 导出记录",
          requestedFixIndex: 1,
          requestedFixCount: 1,
          executionStatus: "completed",
          regressionOutcome: "recovered",
          executionResultRef: resultRef,
          executionArtifactPaths: [artifactPath],
        },
        refs: {
          artifactPaths: [artifactPath],
        },
      },
      {
        type: "artifact.changed",
        sourceType: "artifact_snapshot",
        sequence: 2,
        sessionId: "session-team-1",
        threadId: "thread-1",
        artifactId: "runtime-json",
        owner: "artifact",
        scope: "artifact",
        phase: "completed",
        surface: "artifact_workspace",
        persistence: "artifact_store",
        rawEventRef: resultRef,
        refs: {
          artifactIds: ["runtime-json"],
          artifactPaths: [artifactPath],
          rawEventRef: resultRef,
        },
      },
    ]);

    const onWorkbenchAction = vi.fn().mockReturnValue("unsupported_work_item");
    const container = renderPanel({
      currentSessionId: "session-team-1",
      onWorkbenchAction,
    });
    openTechnicalDetails(container);

    const requestedFixAction = container.querySelector<HTMLButtonElement>(
      '[data-agentui-action-target="review-1:requested-fix:1"]',
    );
    expect(requestedFixAction).not.toBeNull();

    act(() => {
      requestedFixAction?.click();
    });

    expect(onWorkbenchAction).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("已定位工作台目标");
    expect(container.textContent).toContain("工作项未连接");
    expect(container.textContent).toContain(
      "任务记录已定位；后台写回接入前，这里只提供查看。",
    );
    expect(container.textContent).toContain(`结果引用：${resultRef}`);
    expect(container.textContent).toContain(`交付物路径：${artifactPath}`);
    expect(container.textContent).toContain("相关队友链路");
    expect(container.textContent).toContain("交付物引用");
    expect(container.textContent).toContain("交付物工作区");
    expect(container.textContent).toContain("runtime-json");
  });
});
