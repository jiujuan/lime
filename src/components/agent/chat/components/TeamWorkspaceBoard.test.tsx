import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  mockGetAgentRuntimeSession,
  createSessionDetail,
  renderBoard,
  clickElement,
  expandLane,
} from "./TeamWorkspaceBoard.testFixtures";

describe("TeamWorkspaceBoard", () => {
  it("仅打开 team shell 且尚未创建子会话时，应默认渲染紧凑状态条", async () => {
    const container = await renderBoard({
      shellVisible: true,
      childSubagentSessions: [],
    });

    expect(container.textContent).toContain("生成");
    expect(container.textContent).toContain("还没有任务接手");
    expect(container.textContent).toContain("查看当前进展");
    expect(container.textContent).not.toContain("任务进行时");
    expect(container.textContent).not.toContain("spawn_agent");
    expect(container.textContent).not.toContain("Explorer 槽位");
    expect(container.textContent).not.toContain("Executor 槽位");
  });

  it("空 shell 态点击展开详情后，应展开完整 team 说明", async () => {
    const container = await renderBoard({
      shellVisible: true,
      childSubagentSessions: [],
    });

    const expandButton = container.querySelector(
      '[data-testid="team-workspace-detail-toggle"]',
    ) as HTMLButtonElement | null;
    expect(expandButton).toBeTruthy();

    act(() => {
      expandButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container.textContent).toContain("需要时会自动拆出任务");
    expect(container.textContent).toContain("拆出任务");
    expect(container.textContent).toContain("收起细节");
  });

  it("已选 Team 但尚无真实子会话时，应在主画布展示计划角色", async () => {
    const container = await renderBoard({
      shellVisible: true,
      childSubagentSessions: [],
      selectedTeamLabel: "临时修复 Team",
      selectedTeamSummary: "分析、执行、验证三段式推进。",
      selectedTeamRoles: [
        {
          id: "explorer",
          label: "分析",
          summary: "负责定位问题与影响范围。",
          profileId: "code-explorer",
          roleKey: "explorer",
          skillIds: ["repo-exploration"],
        },
        {
          id: "executor",
          label: "执行",
          summary: "负责完成改动并给出结果。",
          profileId: "code-executor",
          roleKey: "executor",
          skillIds: ["bounded-implementation"],
        },
      ],
    });

    expect(container.textContent).toContain("临时修复分工方案");
    expect(container.textContent).toContain("2 个计划分工");

    const expandButton = container.querySelector(
      '[data-testid="team-workspace-detail-toggle"]',
    ) as HTMLButtonElement | null;
    expect(expandButton).toBeTruthy();

    act(() => {
      expandButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container.textContent).toContain("计划中的任务分工");
    expect(container.textContent).toContain("分析");
    expect(container.textContent).toContain("执行");
  });

  it("主会话视角应展示团队成员、最近过程并支持打开焦点会话", async () => {
    const onOpenSubagentSession = vi.fn();
    mockGetAgentRuntimeSession.mockImplementation(async (sessionId: string) => {
      if (sessionId === "child-2") {
        return createSessionDetail(sessionId, {
          items: [
            {
              id: "child-2-item-1",
              thread_id: "child-2-thread",
              turn_id: "child-2-turn",
              sequence: 1,
              status: "completed",
              started_at: "2026-03-20T10:00:04Z",
              updated_at: "2026-03-20T10:00:06Z",
              type: "plan",
              text: "先整理落地步骤，再生成第一版实施清单。",
            },
          ],
        });
      }

      return createSessionDetail(sessionId, {
        items: [
          {
            id: `${sessionId}-item-1`,
            thread_id: `${sessionId}-thread`,
            turn_id: `${sessionId}-turn`,
            sequence: 2,
            status: "completed",
            started_at: "2026-03-20T10:00:00Z",
            updated_at: "2026-03-20T10:00:02Z",
            type: "agent_message",
            text: "已完成竞品摘要与数据来源梳理。",
          },
          {
            id: `${sessionId}-item-2`,
            thread_id: `${sessionId}-thread`,
            turn_id: `${sessionId}-turn`,
            sequence: 1,
            status: "completed",
            started_at: "2026-03-20T10:00:03Z",
            updated_at: "2026-03-20T10:00:04Z",
            type: "command_execution",
            command: "rg --files docs",
            cwd: "/workspace",
            aggregated_output: "已对 3 个来源完成去重校验。",
          },
        ],
      });
    });
    const container = await renderBoard({
      onOpenSubagentSession,
      childSubagentSessions: [
        {
          id: "child-1",
          name: "研究员",
          created_at: 1_710_000_000,
          updated_at: 1_710_000_100,
          session_type: "sub_agent",
          runtime_status: "running",
          latest_turn_status: "running",
          task_summary: "整理竞品与数据来源",
          role_hint: "explorer",
          profile_name: "代码分析员",
          team_preset_id: "code-triage-team",
          skills: [
            {
              id: "repo-exploration",
              name: "仓库探索",
              source: "builtin",
            },
            {
              id: "local:lint-fix",
              name: "lint-fix",
              source: "local",
              directory: "lint-fix",
            },
          ],
        },
        {
          id: "child-2",
          name: "执行器",
          created_at: 1_710_000_010,
          updated_at: 1_710_000_120,
          session_type: "sub_agent",
          runtime_status: "queued",
          queued_turn_count: 2,
          latest_turn_status: "completed",
          task_summary: "起草第一版落地方案",
          role_hint: "executor",
        },
      ],
    });

    expect(container.textContent).toContain("生成");
    expect(container.textContent).toContain(
      "任务进行中 · 1 项处理中 / 1 项稍后开始",
    );
    expect(container.textContent).toContain("研究员");
    expect(container.textContent).toContain("执行器");
    expect(container.textContent).toContain("代码分析员");
    expect(container.textContent).toContain("代码排障团队");
    expect(container.textContent).toContain("仓库探索");
    expect(container.textContent).toContain("最近进展 处理中");
    expect(
      container.querySelector(
        '[data-testid="team-workspace-member-detail-child-1"]',
      ),
    ).toBeFalsy();
    expect(
      container
        .querySelector('[data-testid="team-workspace-member-lane-child-1"]')
        ?.getAttribute("data-expanded"),
    ).toBe("false");
    expect(
      container.querySelector('[data-testid="team-workspace-compact-summary"]')
        ?.textContent,
    ).toContain("当前焦点");
    expect(
      container.querySelector('[data-testid="team-workspace-compact-summary"]')
        ?.textContent,
    ).toContain("当前焦点会优先落在正在处理的分工上。");
    expect(
      container.querySelector('[data-testid="team-workspace-canvas-toolbar"]')
        ?.textContent,
    ).toContain("处理中");
    expect(
      container.querySelector('[data-testid="team-workspace-canvas-toolbar"]')
        ?.textContent,
    ).not.toContain("当前焦点 研究员");
    expect(
      container.querySelector('[data-testid="team-workspace-canvas-toolbar"]')
        ?.textContent,
    ).not.toContain("缩放 100%");
    expect(container.textContent).toContain("最近进展");
    expect(container.textContent).toContain(
      "回复：已完成竞品摘要与数据来源梳理。",
    );
    expect(container.textContent).toContain(
      "计划：先整理落地步骤，再生成第一版实施清单。",
    );

    const researcherLane = container.querySelector(
      '[data-testid="team-workspace-member-lane-child-1"]',
    );
    const executorLane = container.querySelector(
      '[data-testid="team-workspace-member-lane-child-2"]',
    );
    expect(researcherLane?.textContent).toContain("任务进展");
    expect(researcherLane?.textContent).toContain(
      "回复：已完成竞品摘要与数据来源梳理。",
    );
    expect(executorLane?.textContent).toContain(
      "计划：先整理落地步骤，再生成第一版实施清单。",
    );

    await expandLane(container, "child-1");

    expect(
      container.querySelector(
        '[data-testid="team-workspace-member-detail-child-1"]',
      ),
    ).toBeTruthy();
    expect(
      container
        .querySelector('[data-testid="team-workspace-member-lane-child-1"]')
        ?.getAttribute("data-expanded"),
    ).toBe("true");
    expect(
      container.querySelector('[data-testid="team-workspace-activity-feed"]'),
    ).toBeTruthy();
    expect(container.textContent).toContain("命令输出");
    expect(container.textContent).toContain("已对 3 个来源完成去重校验。");

    const openButton = Array.from(container.querySelectorAll("button")).find(
      (element) => element.textContent?.includes("打开进展"),
    );
    await clickElement(openButton ?? null);

    expect(onOpenSubagentSession).toHaveBeenCalledWith("child-1");
  });

  it("真实任务存在时应优先把处理中任务排到前面，并在同优先级下保持蓝图顺序", async () => {
    const container = await renderBoard({
      childSubagentSessions: [
        {
          id: "child-executor",
          name: "执行成员",
          created_at: 1_710_000_010,
          updated_at: 1_710_000_120,
          session_type: "sub_agent",
          runtime_status: "queued",
          latest_turn_status: "queued",
          task_summary: "负责提交修复。",
          role_hint: "executor",
          blueprint_role_id: "runtime-executor",
          blueprint_role_label: "执行",
          profile_id: "code-executor",
          role_key: "executor",
        },
        {
          id: "child-explorer",
          name: "分析成员",
          created_at: 1_710_000_000,
          updated_at: 1_710_000_100,
          session_type: "sub_agent",
          runtime_status: "running",
          latest_turn_status: "running",
          task_summary: "负责定位问题。",
          role_hint: "explorer",
          blueprint_role_id: "runtime-explorer",
          blueprint_role_label: "分析",
          profile_id: "code-explorer",
          role_key: "explorer",
        },
      ],
      teamDispatchPreviewState: {
        requestId: "runtime-formed-ordered",
        status: "formed",
        label: "修复 Team",
        summary: "分析、执行协同推进。",
        members: [
          {
            id: "runtime-executor",
            label: "执行",
            summary: "再提交修复。",
            roleKey: "executor",
            profileId: "code-executor",
            skillIds: ["bounded-implementation"],
            status: "planned",
          },
          {
            id: "runtime-explorer",
            label: "分析",
            summary: "先定位问题。",
            roleKey: "explorer",
            profileId: "code-explorer",
            skillIds: ["repo-exploration"],
            status: "planned",
          },
        ],
        blueprint: null,
        updatedAt: Date.now(),
      },
    });

    const laneIds = Array.from(
      container.querySelectorAll(
        '[data-testid^="team-workspace-member-lane-"][data-lane-x]',
      ),
    ).map((element) => element.getAttribute("data-testid"));

    expect(laneIds).toEqual([
      "team-workspace-member-lane-child-explorer",
      "team-workspace-member-lane-child-executor",
    ]);
    expect(container.textContent).toContain("分工 · 分析");
    expect(container.textContent).toContain("分工 · 执行");
  });

  it("子线程视角应展示父会话、最近过程并支持切换 sibling", async () => {
    const onOpenSubagentSession = vi.fn();
    const onReturnToParentSession = vi.fn();
    mockGetAgentRuntimeSession.mockImplementation(async (sessionId: string) => {
      if (sessionId === "child-current") {
        return createSessionDetail(sessionId, {
          items: [
            {
              id: "child-current-item-1",
              thread_id: "child-current-thread",
              turn_id: "child-current-turn",
              sequence: 2,
              status: "completed",
              started_at: "2026-03-20T10:00:00Z",
              updated_at: "2026-03-20T10:00:01Z",
              type: "reasoning",
              text: "先检查 team runtime 的控制面状态，再决定是否等待。",
            },
            {
              id: "child-current-item-2",
              thread_id: "child-current-thread",
              turn_id: "child-current-turn",
              sequence: 1,
              status: "completed",
              started_at: "2026-03-20T10:00:02Z",
              updated_at: "2026-03-20T10:00:03Z",
              type: "web_search",
              output: "已汇总 5 条 roadmap 差异。",
            },
          ],
        });
      }

      if (sessionId === "child-sibling-1") {
        return createSessionDetail(sessionId, {
          items: [
            {
              id: "child-sibling-1-item-1",
              thread_id: "child-sibling-1-thread",
              turn_id: "child-sibling-1-turn",
              sequence: 2,
              status: "completed",
              started_at: "2026-03-20T10:01:00Z",
              updated_at: "2026-03-20T10:01:03Z",
              type: "tool_call",
              tool_name: "browser_snapshot",
              output: "页面已刷新为最新状态并生成差异截图。",
            },
            {
              id: "child-sibling-1-item-2",
              thread_id: "child-sibling-1-thread",
              turn_id: "child-sibling-1-turn",
              sequence: 1,
              status: "failed",
              started_at: "2026-03-20T10:01:04Z",
              updated_at: "2026-03-20T10:01:05Z",
              type: "warning",
              message: "等待父线程确认是否继续扩展范围。",
            },
          ],
        });
      }

      return createSessionDetail(sessionId);
    });
    const container = await renderBoard({
      currentSessionId: "child-current",
      currentSessionName: "实现代理",
      currentSessionRuntimeStatus: "running",
      currentSessionLatestTurnStatus: "running",
      currentSessionQueuedTurnCount: 1,
      onOpenSubagentSession,
      onReturnToParentSession,
      subagentParentContext: {
        parent_session_id: "parent-1",
        parent_session_name: "主线程总览",
        role_hint: "executor",
        task_summary: "完成 UI 与订阅闭环",
        sibling_subagent_sessions: [
          {
            id: "child-sibling-1",
            name: "检索代理",
            created_at: 1_710_000_000,
            updated_at: 1_710_000_200,
            session_type: "sub_agent",
            runtime_status: "completed",
            latest_turn_status: "completed",
            task_summary: "补齐路线图差异清单",
            role_hint: "explorer",
          },
        ],
      },
    });

    expect(container.textContent).toContain("主线程总览");
    expect(container.textContent).toContain("实现代理");
    expect(container.textContent).toContain("检索代理");
    expect(container.textContent).toContain("等待中 1");
    expect(
      container.querySelector(
        '[data-testid="team-workspace-member-detail-child-current"]',
      ),
    ).toBeFalsy();
    expect(
      container.querySelector('[data-testid="team-workspace-compact-summary"]')
        ?.textContent,
    ).toContain("当前焦点");
    expect(
      container.querySelector('[data-testid="team-workspace-compact-summary"]')
        ?.textContent,
    ).toContain("并行任务会在各自面板里持续更新进展和结果");
    expect(
      container.querySelector('[data-testid="team-workspace-canvas-toolbar"]')
        ?.textContent,
    ).toContain("处理中");
    expect(
      container.querySelector('[data-testid="team-workspace-canvas-toolbar"]')
        ?.textContent,
    ).toContain("当前任务");
    expect(
      container.querySelector('[data-testid="team-workspace-canvas-toolbar"]')
        ?.textContent,
    ).not.toContain("当前焦点 实现代理");
    expect(
      container.querySelector('[data-testid="team-workspace-canvas-toolbar"]')
        ?.textContent,
    ).not.toContain("缩放 100%");
    expect(container.textContent).toContain("最近进展");
    expect(container.textContent).toContain(
      "推理：先检查 team runtime 的控制面状态，再决定是否等待。",
    );

    const currentLane = container.querySelector(
      '[data-testid="team-workspace-member-lane-child-current"]',
    );
    const siblingLane = container.querySelector(
      '[data-testid="team-workspace-member-lane-child-sibling-1"]',
    );
    expect(currentLane?.textContent).toContain("任务进展");
    expect(currentLane?.textContent).toContain(
      "推理：先检查 team runtime 的控制面状态，再决定是否等待。",
    );
    expect(siblingLane?.textContent).toContain("页面截图");
    expect(siblingLane?.textContent).toContain(
      "页面已刷新为最新状态并生成差异截图。",
    );

    const returnButton = container.querySelector<HTMLButtonElement>(
      '[data-testid="team-workspace-return-parent"]',
    );
    expect(returnButton).toBeTruthy();
    expect(returnButton?.textContent).toContain("返回主助手");

    act(() => {
      returnButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onReturnToParentSession).toHaveBeenCalledTimes(1);

    await expandLane(container, "child-sibling-1");

    expect(
      container.querySelector(
        '[data-testid="team-workspace-member-detail-child-sibling-1"]',
      ),
    ).toBeTruthy();
    expect(
      container.querySelector('[data-testid="team-workspace-activity-feed"]'),
    ).toBeTruthy();
    expect(container.textContent).toContain("检索结果");
    expect(container.textContent).toContain("已汇总 5 条 roadmap 差异。");
    expect(container.textContent).toContain("页面截图");
    expect(container.textContent).toContain(
      "页面已刷新为最新状态并生成差异截图。",
    );
    expect(container.textContent).toContain("等待父线程确认是否继续扩展范围。");

    const switchButton = Array.from(container.querySelectorAll("button")).find(
      (element) => element.textContent?.includes("切换"),
    );
    await clickElement(switchButton ?? null);

    expect(onOpenSubagentSession).toHaveBeenCalledWith("child-sibling-1");
  });

  it("嵌入态 team 面板应使用实体外壳，并将轨道改为双列卡片布局", async () => {
    const container = await renderBoard({
      embedded: true,
      childSubagentSessions: [
        {
          id: "child-1",
          name: "研究员",
          created_at: 1_710_000_000,
          updated_at: 1_710_000_100,
          session_type: "sub_agent",
          runtime_status: "running",
          latest_turn_status: "running",
          task_summary: "整理竞品与数据来源，补齐关键差异点与证据链。",
          role_hint: "explorer",
        },
        {
          id: "child-2",
          name: "执行器",
          created_at: 1_710_000_010,
          updated_at: 1_710_000_120,
          session_type: "sub_agent",
          runtime_status: "queued",
          latest_turn_status: "completed",
          queued_turn_count: 1,
          task_summary: "起草第一版实施方案并给出需要确认的阻塞点。",
          role_hint: "executor",
        },
      ],
    });

    const embeddedShell = container.querySelector<HTMLElement>(
      '[data-testid="team-workspace-board-embedded-shell"]',
    );
    const railList = container.querySelector<HTMLElement>(
      '[data-testid="team-workspace-rail-list"]',
    );
    const boardBody = container.querySelector<HTMLElement>(
      '[data-testid="team-workspace-board-body"]',
    );

    expect(embeddedShell?.className).toContain("pointer-events-auto");
    expect(embeddedShell?.className).toContain("lime-workbench-theme-scope");
    expect(embeddedShell?.className).toContain("lime-workbench-surface-scope");
    expect(embeddedShell?.className).toContain("overflow-hidden");
    expect(embeddedShell?.className).toContain("flex-col");
    expect(embeddedShell?.className).toContain("rounded-[24px]");
    expect(embeddedShell?.className).toContain("border-slate-200");
    expect(embeddedShell?.className).toContain("bg-white");
    expect(embeddedShell?.className).not.toContain("backdrop-blur");
    expect(boardBody?.className).toContain("overflow-y-auto");
    expect(railList?.getAttribute("data-layout-kind")).toBe("free-canvas");
    expect(
      container.querySelector(
        '[data-testid="team-workspace-inspector-overlay"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-testid="team-workspace-member-detail-child-1"]',
      ),
    ).toBeNull();
    expect(
      container
        .querySelector('[data-testid="team-workspace-member-lane-child-1"]')
        ?.getAttribute("data-expanded"),
    ).toBe("false");
    expect(
      container
        .querySelector('[data-testid="team-workspace-member-lane-child-2"]')
        ?.getAttribute("data-expanded"),
    ).toBe("false");
  });

  it("嵌入态真实 team 应在点击成员后切换卡内详情", async () => {
    const container = await renderBoard({
      embedded: true,
      childSubagentSessions: [
        {
          id: "child-collapse-1",
          name: "研究员",
          created_at: 1_710_000_000,
          updated_at: 1_710_000_100,
          session_type: "sub_agent",
          runtime_status: "running",
          latest_turn_status: "running",
          task_summary: "整理竞品与数据来源，补齐关键差异点与证据链。",
          role_hint: "explorer",
        },
        {
          id: "child-collapse-2",
          name: "执行器",
          created_at: 1_710_000_010,
          updated_at: 1_710_000_120,
          session_type: "sub_agent",
          runtime_status: "queued",
          latest_turn_status: "queued",
          task_summary: "整理执行步骤并准备提交方案。",
          role_hint: "executor",
        },
      ],
    });

    expect(
      container.querySelector(
        '[data-testid="team-workspace-member-detail-child-collapse-1"]',
      ),
    ).toBeFalsy();
    expect(
      container.querySelector(
        '[data-testid="team-workspace-member-detail-child-collapse-2"]',
      ),
    ).toBeFalsy();
    expect(
      container
        .querySelector(
          '[data-testid="team-workspace-member-lane-child-collapse-1"]',
        )
        ?.getAttribute("data-expanded"),
    ).toBe("false");
    expect(
      container
        .querySelector(
          '[data-testid="team-workspace-member-lane-child-collapse-2"]',
        )
        ?.getAttribute("data-expanded"),
    ).toBe("false");

    await expandLane(container, "child-collapse-1");

    expect(
      container.querySelector(
        '[data-testid="team-workspace-member-detail-child-collapse-1"]',
      ),
    ).toBeTruthy();
    expect(
      container
        .querySelector(
          '[data-testid="team-workspace-member-lane-child-collapse-1"]',
        )
        ?.getAttribute("data-expanded"),
    ).toBe("true");
    expect(
      container
        .querySelector(
          '[data-testid="team-workspace-member-lane-child-collapse-2"]',
        )
        ?.getAttribute("data-expanded"),
    ).toBe("false");

    await expandLane(container, "child-collapse-2");

    expect(
      container.querySelector(
        '[data-testid="team-workspace-member-detail-child-collapse-1"]',
      ),
    ).toBeFalsy();
    expect(
      container.querySelector(
        '[data-testid="team-workspace-member-detail-child-collapse-2"]',
      ),
    ).toBeTruthy();
  });
});
