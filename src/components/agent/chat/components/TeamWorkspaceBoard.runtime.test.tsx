import { describe, expect, it } from "vitest";
import {
  mockGetAgentRuntimeSession,
  createSessionDetail,
  renderBoard,
  expandLane,
} from "./TeamWorkspaceBoard.testFixtures";

describe("TeamWorkspaceBoard runtime projection", () => {
  it("注入 live runtime props 后应立即投影状态与最近轨迹", async () => {
    mockGetAgentRuntimeSession.mockImplementation(async (sessionId: string) =>
      createSessionDetail(sessionId),
    );

    const container = await renderBoard({
      currentSessionId: "parent-1",
      currentSessionName: "主线程",
      childSubagentSessions: [
        {
          id: "child-live-1",
          name: "实时代理",
          created_at: 1_710_000_000,
          updated_at: 1_710_000_100,
          session_type: "sub_agent",
          runtime_status: "queued",
          latest_turn_status: "queued",
          task_summary: "等待执行实时检查",
          role_hint: "explorer",
        },
      ],
      liveRuntimeBySessionId: {
        "child-live-1": {
          runtimeStatus: "running",
          latestTurnStatus: "running",
          baseFingerprint: "child-live-1:1710000100:queued:queued:0",
        },
      },
      liveActivityBySessionId: {
        "child-live-1": [
          {
            id: "status-child-live-1-running",
            title: "状态切换",
            detail: "收到任务状态事件，已切换为运行中。",
            statusLabel: "运行中",
            badgeClassName: "border border-sky-200 bg-sky-50 text-sky-700",
          },
        ],
      },
      activityRefreshVersionBySessionId: {
        "child-live-1": 1,
      },
    });

    const liveSessionCard = container.querySelector<HTMLElement>(
      '[data-testid="team-workspace-member-lane-child-live-1"]',
    );

    expect(liveSessionCard?.textContent).toContain("运行中");
    expect(
      container.querySelector('[data-testid="team-workspace-canvas-toolbar"]')
        ?.textContent,
    ).toContain("处理中");
    expect(container.textContent).toContain("最近进展 处理中");
    expect(
      container.querySelector(
        '[data-testid="team-workspace-member-detail-child-live-1"]',
      ),
    ).toBeFalsy();

    await expandLane(container, "child-live-1");

    expect(container.textContent).toContain("状态切换");
    expect(container.textContent).toContain("已切换为运行中。");
    expect(
      container.querySelector('[data-testid="team-workspace-activity-feed"]'),
    ).toBeTruthy();
    expect(mockGetAgentRuntimeSession).toHaveBeenCalledWith("child-live-1");
  });

  it("注入 runtime stream live activity 后，应优先展示实时过程片段", async () => {
    mockGetAgentRuntimeSession.mockImplementation(async (sessionId: string) =>
      createSessionDetail(sessionId, {
        items: [
          {
            id: `${sessionId}-item-1`,
            thread_id: `${sessionId}-thread`,
            turn_id: `${sessionId}-turn`,
            sequence: 1,
            status: "completed",
            started_at: "2026-03-20T10:00:00Z",
            updated_at: "2026-03-20T10:00:03Z",
            type: "agent_message",
            text: "历史快照里的旧内容。",
          },
        ],
      }),
    );

    const container = await renderBoard({
      currentSessionId: "parent-1",
      currentSessionName: "主线程",
      childSubagentSessions: [
        {
          id: "child-live-stream-1",
          name: "实时片段代理",
          created_at: 1_710_000_000,
          updated_at: 1_710_000_100,
          session_type: "sub_agent",
          runtime_status: "running",
          latest_turn_status: "running",
          task_summary: "持续回传最新执行过程",
          role_hint: "executor",
        },
      ],
      liveActivityBySessionId: {
        "child-live-stream-1": [
          {
            id: "tool:child-live-stream-1:tool-1",
            title: "工具 页面截图",
            detail: "页面结构差异已提取完成。",
            statusLabel: "完成",
            badgeClassName:
              "border border-emerald-200 bg-emerald-50 text-emerald-700",
          },
        ],
      },
      activityRefreshVersionBySessionId: {
        "child-live-stream-1": 1,
      },
    });

    expect(container.textContent).toContain("实时片段代理");
    expect(container.textContent).toContain(
      "工具 页面截图：页面结构差异已提取完成。",
    );
    expect(container.textContent).toContain("工具 页面截图");
    expect(container.textContent).toContain("页面结构差异已提取完成。");
  });

  it("嵌入态头部应保持 sticky，避免滚动时顶部信息被卷走", async () => {
    const container = await renderBoard({
      embedded: true,
      childSubagentSessions: [
        {
          id: "child-sticky-1",
          name: "研究员",
          created_at: 1_710_000_000,
          updated_at: 1_710_000_100,
          session_type: "sub_agent",
          runtime_status: "running",
          latest_turn_status: "running",
          task_summary: "整理竞品与数据来源",
          role_hint: "explorer",
        },
      ],
    });

    const header = container.querySelector<HTMLElement>(
      '[data-testid="team-workspace-board-header"]',
    );

    expect(header).toBeTruthy();
    expect(header?.className).toContain("sticky");
    expect(header?.className).toContain("top-0");
    expect(header?.textContent).toContain("生成");
    expect(header?.textContent).toContain("任务进行中");
    expect(header?.textContent).not.toContain("任务进行时");
  });

  it("本轮 Team 准备中时，应在空 shell 展示组建状态", async () => {
    const container = await renderBoard({
      shellVisible: true,
      teamDispatchPreviewState: {
        requestId: "runtime-forming-1",
        status: "forming",
        label: "排障 Team",
        summary: "围绕当前任务组织最轻量可用的运行时团队。",
        members: [],
        blueprint: {
          label: "代码排障团队",
          summary: "分析、执行、验证三段式推进。",
          roles: [],
        },
        updatedAt: Date.now(),
      },
    });

    expect(container.textContent).toContain("正在准备任务分工");
    expect(container.textContent).toContain("准备中");
    expect(container.textContent).toContain("分工方案 · 排障分工方案");
    expect(container.textContent).toContain("参考方案 · 代码排障团队");
  });

  it("本轮任务方案已就绪时，应在无真实子会话下展示当前成员", async () => {
    const container = await renderBoard({
      shellVisible: true,
      defaultShellExpanded: true,
      teamDispatchPreviewState: {
        requestId: "runtime-formed-1",
        status: "formed",
        label: "修复 Team",
        summary: "分析、执行、验证协作闭环。",
        members: [
          {
            id: "runtime-explorer",
            label: "分析",
            summary: "收敛问题边界并整理影响范围。",
            roleKey: "explorer",
            profileId: "code-explorer",
            skillIds: ["repo-exploration"],
            status: "planned",
          },
          {
            id: "runtime-executor",
            label: "执行",
            summary: "在边界内落地修复并汇报结果。",
            roleKey: "executor",
            profileId: "code-executor",
            skillIds: ["bounded-implementation"],
            status: "planned",
          },
        ],
        blueprint: {
          label: "代码排障团队",
          summary: "分析、执行、验证三段式推进。",
          roles: [
            {
              id: "explorer",
              label: "分析",
              summary: "先定位问题与影响面。",
            },
          ],
        },
        updatedAt: Date.now(),
      },
    });

    expect(
      container.querySelector(
        '[data-testid="team-workspace-runtime-formation"]',
      ),
    ).toBeTruthy();
    expect(
      container.querySelector('[data-testid="team-workspace-runtime-members"]'),
    ).toBeTruthy();
    expect(container.textContent).toContain("任务分工已准备好");
    expect(container.textContent).toContain("分析");
    expect(container.textContent).toContain("执行");
    expect(container.textContent).toContain("参考分工");
  });

  it("本轮 Team 准备失败时，应展示失败原因", async () => {
    const container = await renderBoard({
      shellVisible: true,
      defaultShellExpanded: true,
      teamDispatchPreviewState: {
        requestId: "runtime-failed-1",
        status: "failed",
        label: "失败的 Team",
        summary: null,
        members: [],
        blueprint: null,
        errorMessage: "Provider 认证失败，无法生成 Team。",
        updatedAt: Date.now(),
      },
    });

    expect(container.textContent).toContain("任务分工准备失败");
    expect(container.textContent).toContain(
      "Provider 认证失败，无法生成分工方案。",
    );
  });
});
