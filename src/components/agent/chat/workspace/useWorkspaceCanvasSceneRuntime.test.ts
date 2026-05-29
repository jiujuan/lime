import { describe, expect, it, vi } from "vitest";
import type { TeamWorkbenchSurfaceProps } from "./chatSurfaceProps";
import type { AgentUiTeamWorkbenchViewItem } from "../projection/agentUiTeamWorkbenchViewModel";
import {
  buildCanvasTeamWorkbenchView,
  resolveAgentUiTeamWorkbenchLocalSessionTarget,
  routeAgentUiTeamWorkbenchAction,
} from "./useWorkspaceCanvasSceneRuntime";

function createSurfaceProps(
  overrides: Partial<TeamWorkbenchSurfaceProps> = {},
): TeamWorkbenchSurfaceProps {
  return {
    currentSessionQueuedTurnCount: 0,
    childSubagentSessions: [],
    selectedTeamRoles: [],
    liveRuntimeBySessionId: {},
    ...overrides,
  };
}

function buildView(
  overrides: Partial<Parameters<typeof buildCanvasTeamWorkbenchView>[0]> = {},
) {
  return buildCanvasTeamWorkbenchView({
    enabled: true,
    surfaceProps: createSurfaceProps(),
    liveActivityBySessionId: {},
    teamWaitSummary: null,
    teamControlSummary: null,
    renderTeamWorkbenchPreview: () => null,
    renderTeamWorkbenchPanel: () => null,
    ...overrides,
  });
}

function buildWorkbenchItem(
  overrides: Partial<AgentUiTeamWorkbenchViewItem>,
): AgentUiTeamWorkbenchViewItem {
  return {
    id: "workbench-item",
    event: {
      type: "task.changed",
      sourceType: "subagent_status_changed",
      sequence: 1,
      sessionId: "parent-session",
      owner: "task",
      scope: "task",
      phase: "acting",
      surface: "work_board",
      persistence: "snapshot",
    },
    title: "工作项",
    subtitle: "工作台目标",
    auxiliaryDetail: null,
    phaseLabel: "执行中",
    chips: [],
    attention: false,
    action: null,
    target: {},
    ...overrides,
  };
}

describe("buildCanvasTeamWorkbenchView", () => {
  it("应为 workbench 摘要统计产出任务叙事", () => {
    const view = buildView({
      surfaceProps: createSurfaceProps({
        childSubagentSessions: [
          {
            id: "task-1",
            name: "分析",
            created_at: 1_710_000_000,
            updated_at: 1_710_000_100,
            session_type: "sub_agent",
            runtime_status: "running",
            latest_turn_status: "running",
            task_summary: "收敛问题边界",
            role_hint: "explorer",
          },
          {
            id: "task-2",
            name: "执行",
            created_at: 1_710_000_010,
            updated_at: 1_710_000_120,
            session_type: "sub_agent",
            runtime_status: "running",
            latest_turn_status: "running",
            task_summary: "落地修复",
            role_hint: "executor",
          },
          {
            id: "task-3",
            name: "复核",
            created_at: 1_710_000_020,
            updated_at: 1_710_000_140,
            session_type: "sub_agent",
            runtime_status: "queued",
            latest_turn_status: "queued",
            task_summary: "等待接手",
            role_hint: "reviewer",
          },
        ],
      }),
    });

    expect(view).not.toBeNull();
    if (!view) {
      throw new Error("teamWorkbenchView 不应为空");
    }

    expect(view.subtitle).toBe(
      "主对话保留调度记录，画布按任务分别展示执行过程与结果。",
    );
    expect(view.summaryStats?.[0]).toMatchObject({
      key: "team-status",
      label: "任务状态",
      detail: "任务进行中 · 2 项处理中 / 1 项稍后开始",
    });
    expect(view.summaryStats?.[1]).toMatchObject({
      key: "team-members",
      label: "活跃任务",
      value: "3/3",
      detail: "2 项处理中，1 项排队中。",
    });
    expect(view.preferActiveOnMount).toBe(true);
  });

  it("没有任务活动时不应展示任务工作台", () => {
    const view = buildView();

    expect(view).toBeNull();
  });

  it("等待摘要应提示检查任务状态", () => {
    const view = buildView({
      teamWaitSummary: {
        awaitedSessionIds: ["task-1", "task-2"],
        timedOut: true,
        updatedAt: 1_710_000_100_000,
      },
    });

    expect(view).not.toBeNull();
    if (!view) {
      throw new Error("teamWorkbenchView 不应为空");
    }

    expect(view.summaryStats?.[0]).toMatchObject({
      label: "任务状态",
      detail: "当前没有活跃的任务执行。",
    });
    expect(view.summaryStats?.[1]).toMatchObject({
      label: "活跃任务",
      detail: "当前还没有可展示的任务。",
    });
    expect(view.summaryStats?.[2]).toMatchObject({
      label: "等待确认",
      value: "2 项",
      detail: "等待结果超时，建议重新检查任务状态。",
    });
    expect(view.panelCopy?.emptyText).toBe("当前没有可展示的生成结果。");
    expect(view.preferActiveOnMount).toBe(true);
  });
});

describe("Agent UI Team Workbench action routing", () => {
  it("应把 Agent UI 工作台目标解析到真实子会话，而不是使用父会话 scope", () => {
    const item = buildWorkbenchItem({
      event: {
        type: "agent.changed",
        sourceType: "subagent_status_changed",
        sequence: 2,
        sessionId: "parent-session",
        agentId: "child-1",
        owner: "agent",
        scope: "agent",
        phase: "acting",
        surface: "teammate_transcript",
        persistence: "snapshot",
      },
      target: {
        sessionId: "parent-session",
        transcriptRef: "parent-session/child-1",
      },
    });

    expect(
      resolveAgentUiTeamWorkbenchLocalSessionTarget(
        item,
        createSurfaceProps({
          currentSessionId: "parent-session",
          childSubagentSessions: [
            {
              id: "child-1",
              name: "分析",
              created_at: 1,
              updated_at: 2,
              session_type: "sub_agent",
              runtime_status: "running",
              latest_turn_status: "running",
            },
          ],
        }),
      ),
    ).toBe("child-1");
  });

  it("应从 teammate transcript ref 解析子会话焦点", () => {
    const item = buildWorkbenchItem({
      event: {
        type: "agent.changed",
        sourceType: "subagent_status_changed",
        sequence: 2,
        sessionId: "parent-session",
        owner: "agent",
        scope: "agent",
        phase: "acting",
        surface: "teammate_transcript",
        persistence: "snapshot",
        transcriptRef: "child-1:turn-child-1",
      },
      target: {
        sessionId: "parent-session",
        transcriptRef: "child-1:turn-child-1",
      },
    });

    expect(
      resolveAgentUiTeamWorkbenchLocalSessionTarget(
        item,
        createSurfaceProps({
          currentSessionId: "parent-session",
          childSubagentSessions: [
            {
              id: "child-1",
              name: "分析",
              created_at: 1,
              updated_at: 2,
              session_type: "sub_agent",
              runtime_status: "running",
              latest_turn_status: "running",
            },
          ],
        }),
      ),
    ).toBe("child-1");
  });

  it("应把 continue/wait/close 控制路由到已有 Team session handler", async () => {
    const onResumeSubagentSession = vi.fn().mockResolvedValue(undefined);
    const onWaitSubagentSession = vi.fn().mockResolvedValue(undefined);
    const onCloseSubagentSession = vi.fn().mockResolvedValue(undefined);
    const surfaceProps = createSurfaceProps({
      childSubagentSessions: [
        {
          id: "child-1",
          name: "执行",
          created_at: 1,
          updated_at: 2,
          session_type: "sub_agent",
          runtime_status: "idle",
          latest_turn_status: "idle",
        },
      ],
      onResumeSubagentSession,
      onWaitSubagentSession,
      onCloseSubagentSession,
    });

    await expect(
      routeAgentUiTeamWorkbenchAction(
        buildWorkbenchItem({
          action: {
            control: "continue_agent",
            label: "继续",
            targetId: "child-1",
          },
          target: { taskId: "child-1" },
        }),
        surfaceProps,
      ),
    ).resolves.toBe("continued");
    await expect(
      routeAgentUiTeamWorkbenchAction(
        buildWorkbenchItem({
          action: { control: "wait", label: "等待", targetId: "child-1" },
          target: { taskId: "child-1" },
        }),
        surfaceProps,
      ),
    ).resolves.toBe("waited");
    await expect(
      routeAgentUiTeamWorkbenchAction(
        buildWorkbenchItem({
          action: { control: "close", label: "关闭", targetId: "child-1" },
          target: { taskId: "child-1" },
        }),
        surfaceProps,
      ),
    ).resolves.toBe("closed");

    expect(onResumeSubagentSession).toHaveBeenCalledWith("child-1");
    expect(onWaitSubagentSession).toHaveBeenCalledWith("child-1");
    expect(onCloseSubagentSession).toHaveBeenCalledWith("child-1");
  });

  it("review 目标没有本地子会话时应返回专门的 unsupported_review，不伪造运行时调用", async () => {
    const onOpenSubagentSession = vi.fn().mockResolvedValue(undefined);
    const result = await routeAgentUiTeamWorkbenchAction(
      buildWorkbenchItem({
        action: {
          control: "request_review",
          label: "请求审核",
          targetId: "review-1",
        },
        target: { reviewId: "review-1" },
      }),
      createSurfaceProps({
        childSubagentSessions: [],
        onOpenSubagentSession,
      }),
    );

    expect(result).toBe("unsupported_review");
    expect(onOpenSubagentSession).not.toHaveBeenCalled();
  });

  it("远端 source fact 与 handoff 目标没有本地子会话时应保留明确分类", async () => {
    const onOpenSubagentSession = vi.fn().mockResolvedValue(undefined);
    const surfaceProps = createSurfaceProps({
      childSubagentSessions: [],
      onOpenSubagentSession,
    });

    await expect(
      routeAgentUiTeamWorkbenchAction(
        buildWorkbenchItem({
          event: {
            type: "agent.changed",
            sourceType: "remote_task_projection",
            sequence: 3,
            sessionId: "parent-session",
            owner: "agent",
            scope: "agent",
            phase: "acting",
            surface: "remote_teammate",
            persistence: "snapshot",
            runtimeEntity: "external_task",
            remoteTaskId: "remote-task-1",
          },
          action: {
            control: "open_detail",
            label: "查看远端",
            targetId: "remote-task-1",
          },
          target: { remoteTaskId: "remote-task-1" },
        }),
        surfaceProps,
      ),
    ).resolves.toBe("remote_task_source_located");

    await expect(
      routeAgentUiTeamWorkbenchAction(
        buildWorkbenchItem({
          event: {
            type: "agent.handoff",
            sourceType: "evidence_projection",
            sequence: 4,
            sessionId: "parent-session",
            owner: "agent",
            scope: "agent",
            phase: "reconciling",
            surface: "handoff_lane",
            persistence: "evidence_pack",
            handoffId: "handoff-1",
          },
          action: {
            control: "open_detail",
            label: "查看交接",
            targetId: "handoff-1",
          },
          target: { handoffId: "handoff-1" },
        }),
        surfaceProps,
      ),
    ).resolves.toBe("handoff_source_located");

    expect(onOpenSubagentSession).not.toHaveBeenCalled();
  });

  it("artifact / evidence / result ref 目标应只做 locate-only，不误路由到子会话", async () => {
    const onOpenSubagentSession = vi.fn().mockResolvedValue(undefined);
    const result = await routeAgentUiTeamWorkbenchAction(
      buildWorkbenchItem({
        event: {
          type: "worker.notification",
          sourceType: "subagent_status_changed",
          sequence: 5,
          sessionId: "parent-session",
          owner: "agent",
          scope: "agent",
          phase: "completed",
          surface: "worker_notifications",
          persistence: "archive",
          workerNotificationId: "worker-1:completed",
        },
        action: {
          control: "open_detail",
          label: "查看产物",
          targetId: "artifact-1",
        },
        target: {
          artifactId: "artifact-1",
          evidenceId: "evidence-1",
          resultRef: "result://turn-1",
          rawEventRef: "raw://event-1",
          artifactPaths: ["/tmp/report.md"],
        },
      }),
      createSurfaceProps({
        childSubagentSessions: [],
        onOpenSubagentSession,
      }),
    );

    expect(result).toBe("located_only");
    expect(onOpenSubagentSession).not.toHaveBeenCalled();
  });

  it("work_board work item 没有真实 board/team API 时应返回 unsupported_work_item", async () => {
    const onOpenSubagentSession = vi.fn().mockResolvedValue(undefined);
    const result = await routeAgentUiTeamWorkbenchAction(
      buildWorkbenchItem({
        action: {
          control: "assign",
          label: "指派修复",
          targetId: "review-1:requested-fix:1",
        },
        target: {
          workItemId: "review-1:requested-fix:1",
          taskId: "review-1:requested-fix:1",
        },
      }),
      createSurfaceProps({
        childSubagentSessions: [],
        onOpenSubagentSession,
      }),
    );

    expect(result).toBe("unsupported_work_item");
    expect(onOpenSubagentSession).not.toHaveBeenCalled();
  });

  it("work_board reassignment source fact 应只定位而不误报工作项未接入", async () => {
    const onOpenSubagentSession = vi.fn().mockResolvedValue(undefined);
    const result = await routeAgentUiTeamWorkbenchAction(
      buildWorkbenchItem({
        action: {
          control: "assign",
          label: "重新指派",
          targetId: "work-item-2",
        },
        target: {
          workItemId: "work-item-2",
          taskId: "work-item-2",
        },
        event: {
          type: "task.changed",
          sourceType: "item_completed",
          sequence: 7,
          sessionId: "parent-session",
          taskId: "work-item-2",
          workItemId: "work-item-2",
          owner: "task",
          scope: "task",
          phase: "accepted",
          surface: "work_board",
          persistence: "snapshot",
          control: "assign",
          runtimeEntity: "work_item",
          payload: {
            taskEvent: "team_reassignment",
            action: "reassign",
            previousAssigneeId: "researcher",
            nextAssigneeId: "implementer",
          },
        },
      }),
      createSurfaceProps({
        childSubagentSessions: [],
        onOpenSubagentSession,
      }),
    );

    expect(result).toBe("work_item_source_located");
    expect(onOpenSubagentSession).not.toHaveBeenCalled();
  });

  it("work_board reassignment selector 应只回填 TaskUpdate 指令，等待 owner_change source 确认", async () => {
    const onOpenSubagentSession = vi.fn().mockResolvedValue(undefined);
    const onSeedWorkbenchPrompt = vi.fn();
    const result = await routeAgentUiTeamWorkbenchAction(
      buildWorkbenchItem({
        action: {
          control: "assign",
          label: "重新指派",
          targetId: "work-item-2",
        },
        target: {
          workItemId: "work-item-2",
          taskId: "work-item-2",
        },
        event: {
          type: "task.changed",
          sourceType: "item_completed",
          sequence: 7,
          sessionId: "parent-session",
          taskId: "work-item-2",
          workItemId: "work-item-2",
          owner: "task",
          scope: "task",
          phase: "accepted",
          surface: "work_board",
          persistence: "snapshot",
          control: "assign",
          runtimeEntity: "work_item",
          payload: {
            taskEvent: "team_reassignment",
            action: "reassign",
            previousAssigneeId: "研究员",
            nextAssigneeId: "实现者",
            sourceTaskListId: "task-list-1",
          },
        },
      }),
      createSurfaceProps({
        childSubagentSessions: [
          {
            id: "work-item-2",
            name: "误匹配子会话",
            created_at: 1,
            updated_at: 2,
            session_type: "sub_agent",
            runtime_status: "running",
            latest_turn_status: "running",
          },
        ],
        onOpenSubagentSession,
      }),
      {
        onSeedWorkbenchPrompt,
        reassignmentAssignee: "复核员",
      },
    );

    expect(result).toBe("seeded_reassignment");
    expect(onOpenSubagentSession).not.toHaveBeenCalled();
    expect(onSeedWorkbenchPrompt).toHaveBeenCalledTimes(1);
    expect(onSeedWorkbenchPrompt.mock.calls[0]?.[0]).toContain(
      "请使用 TaskUpdate 将工作项「work-item-2」重新指派给「复核员」",
    );
    expect(onSeedWorkbenchPrompt.mock.calls[0]?.[0]).toContain(
      "Task list：task-list-1",
    );
    expect(onSeedWorkbenchPrompt.mock.calls[0]?.[0]).toContain(
      "当前负责人：实现者",
    );
    expect(onSeedWorkbenchPrompt.mock.calls[0]?.[0]).toContain(
      "ownerChange / owner_change metadata",
    );
  });

  it("pending requested fix work item 应可回填输入框作为真实执行发起入口", async () => {
    const onSeedWorkbenchPrompt = vi.fn();
    const result = await routeAgentUiTeamWorkbenchAction(
      buildWorkbenchItem({
        action: {
          control: "assign",
          label: "指派修复",
          targetId: "review-1:requested-fix:1",
        },
        target: {
          reviewId: "review-1",
          workItemId: "review-1:requested-fix:1",
          taskId: "review-1:requested-fix:1",
        },
        event: {
          type: "task.changed",
          sourceType: "evidence_projection",
          sequence: 6,
          sessionId: "parent-session",
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
            regressionRequirements: ["npm run test:contracts"],
          },
        },
      }),
      createSurfaceProps({
        childSubagentSessions: [],
      }),
      { onSeedWorkbenchPrompt },
    );

    expect(result).toBe("seeded_work_item");
    expect(onSeedWorkbenchPrompt).toHaveBeenCalledTimes(1);
    expect(onSeedWorkbenchPrompt.mock.calls[0]?.[0]).toContain(
      "请执行 Review requested fix：补齐 evidence pack 导出记录",
    );
    expect(onSeedWorkbenchPrompt.mock.calls[0]?.[0]).toContain(
      "Review：review-1",
    );
    expect(onSeedWorkbenchPrompt.mock.calls[0]?.[0]).toContain(
      "工作项：review-1:requested-fix:1",
    );
    expect(onSeedWorkbenchPrompt.mock.calls[0]?.[0]).toContain(
      "回归要求：npm run test:contracts",
    );
    expect(onSeedWorkbenchPrompt.mock.calls[0]?.[0]).toContain(
      "metadata.requestedFixExecutionResults",
    );
    expect(onSeedWorkbenchPrompt.mock.calls[0]?.[0]).toContain(
      "executionStatus、regressionOutcome、resultRef",
    );
  });

  it("pending requested fix work item 在显式点击后应可直接提交 runtime turn", async () => {
    const onSeedWorkbenchPrompt = vi.fn();
    const onSubmitWorkbenchPrompt = vi.fn().mockResolvedValue(true);
    const result = await routeAgentUiTeamWorkbenchAction(
      buildWorkbenchItem({
        title: "补齐 evidence pack 导出记录",
        action: {
          control: "assign",
          label: "指派修复",
          targetId: "review-1:requested-fix:1",
        },
        target: {
          reviewId: "review-1",
          workItemId: "review-1:requested-fix:1",
          taskId: "review-1:requested-fix:1",
        },
        event: {
          type: "task.changed",
          sourceType: "evidence_projection",
          sequence: 6,
          sessionId: "parent-session",
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
            requestedFixIndex: 1,
            regressionRequirements: ["npm run test:contracts"],
          },
        },
      }),
      createSurfaceProps({
        childSubagentSessions: [],
      }),
      { onSeedWorkbenchPrompt, onSubmitWorkbenchPrompt },
    );

    expect(result).toBe("submitted_work_item");
    expect(onSeedWorkbenchPrompt).not.toHaveBeenCalled();
    expect(onSubmitWorkbenchPrompt).toHaveBeenCalledTimes(1);
    expect(onSubmitWorkbenchPrompt.mock.calls[0]?.[0]).toContain(
      "请执行 Review requested fix：补齐 evidence pack 导出记录",
    );
    expect(onSubmitWorkbenchPrompt.mock.calls[0]?.[1]).toMatchObject({
      kind: "review_requested_fix",
      source: "agent_ui_team_workbench",
      reviewId: "review-1",
      workItemId: "review-1:requested-fix:1",
      requestedFix: "补齐 evidence pack 导出记录",
      requestedFixIndex: "1",
      regressionRequirements: ["npm run test:contracts"],
    });
  });

  it("pending requested fix runtime turn 提交失败时应回退为输入框回填", async () => {
    const onSeedWorkbenchPrompt = vi.fn();
    const onSubmitWorkbenchPrompt = vi.fn().mockResolvedValue(false);
    const result = await routeAgentUiTeamWorkbenchAction(
      buildWorkbenchItem({
        action: {
          control: "assign",
          label: "指派修复",
          targetId: "review-1:requested-fix:1",
        },
        target: {
          reviewId: "review-1",
          workItemId: "review-1:requested-fix:1",
          taskId: "review-1:requested-fix:1",
        },
        event: {
          type: "task.changed",
          sourceType: "evidence_projection",
          sequence: 6,
          sessionId: "parent-session",
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
          },
        },
      }),
      createSurfaceProps({
        childSubagentSessions: [],
      }),
      { onSeedWorkbenchPrompt, onSubmitWorkbenchPrompt },
    );

    expect(result).toBe("seeded_work_item");
    expect(onSubmitWorkbenchPrompt).toHaveBeenCalledTimes(1);
    expect(onSeedWorkbenchPrompt).toHaveBeenCalledTimes(1);
    expect(onSeedWorkbenchPrompt.mock.calls[0]?.[0]).toContain(
      "metadata.requestedFixExecutionResults",
    );
  });
});
