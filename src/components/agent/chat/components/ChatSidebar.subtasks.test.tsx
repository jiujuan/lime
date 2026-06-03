import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { defaultTopics, renderSidebar } from "./ChatSidebar.testFixtures";

describe("ChatSidebar", () => {
  it("子任务和任务列表应处于同一滚动区域", () => {
    const container = renderSidebar({
      childSubagentSessions: [
        {
          id: "child-1",
          name: "代码审查代理",
          created_at: 1_742_288_400,
          updated_at: 1_742_288_520,
          session_type: "sub_agent",
          task_summary: "检查 team runtime 侧栏遗漏的交互入口。",
          role_hint: "reviewer",
          runtime_status: "running",
        },
      ],
    });

    const scrollArea = container.querySelector(
      '[data-testid="chat-sidebar-scroll-area"]',
    ) as HTMLDivElement | null;
    const teamSection = container.querySelector(
      '[data-testid="team-runtime-section"]',
    ) as HTMLElement | null;

    expect(scrollArea).toBeTruthy();
    expect(teamSection).toBeTruthy();
    expect(scrollArea?.contains(teamSection)).toBe(true);
    expect(scrollArea?.textContent).toContain("子任务");
    expect(scrollArea?.textContent).toContain(
      "这里优先展示正在处理的子任务，再回到当前任务和后续节点。",
    );
    expect(scrollArea?.textContent).toContain("任务一");
  });
  it("父线程子任务应按状态优先级排序并前置当前焦点", () => {
    const container = renderSidebar({
      childSubagentSessions: [
        {
          id: "child-completed",
          name: "已完成代理",
          created_at: 1_742_288_400,
          updated_at: 1_742_288_560,
          session_type: "sub_agent",
          task_summary: "已经输出收尾结果。",
          role_hint: "writer",
          runtime_status: "completed",
        },
        {
          id: "child-running",
          name: "处理中代理",
          created_at: 1_742_288_390,
          updated_at: 1_742_288_500,
          session_type: "sub_agent",
          task_summary: "正在处理主线回归。",
          role_hint: "executor",
          runtime_status: "running",
        },
        {
          id: "child-queued",
          name: "待开始代理",
          created_at: 1_742_288_395,
          updated_at: 1_742_288_540,
          session_type: "sub_agent",
          task_summary: "等待前序任务完成后接手。",
          role_hint: "reviewer",
          runtime_status: "queued",
        },
      ],
    });

    const cards = Array.from(
      container.querySelectorAll('[data-testid^="sidebar-subagent-session-"]'),
    );

    expect(cards.map((card) => card.getAttribute("data-testid"))).toEqual([
      "sidebar-subagent-session-child-running",
      "sidebar-subagent-session-child-queued",
      "sidebar-subagent-session-child-completed",
    ]);
    expect(cards[0]?.textContent).toContain("当前焦点");
    expect(cards[0]?.textContent).toContain("处理中代理");
    expect(cards[2]?.textContent).not.toContain("当前焦点");
  });
  it("子线程并行子任务应按状态优先级排序并前置当前焦点", () => {
    const container = renderSidebar({
      topics: [
        {
          ...defaultTopics[0],
          id: "child-1",
          title: "当前子任务",
          sourceSessionId: "child-1",
        },
      ],
      currentTopicId: "child-1",
      subagentParentContext: {
        parent_session_id: "parent-1",
        parent_session_name: "主线程",
        role_hint: "implementer",
        task_summary: "对齐任务列表排序。",
        created_from_turn_id: "turn-42",
        sibling_subagent_sessions: [
          {
            id: "child-completed",
            name: "已完成代理",
            created_at: 1_742_288_400,
            updated_at: 1_742_288_560,
            session_type: "sub_agent",
            task_summary: "已经输出收尾结果。",
            role_hint: "writer",
            runtime_status: "completed",
          },
          {
            id: "child-running",
            name: "处理中代理",
            created_at: 1_742_288_390,
            updated_at: 1_742_288_500,
            session_type: "sub_agent",
            task_summary: "正在处理主线回归。",
            role_hint: "executor",
            runtime_status: "running",
          },
        ],
      },
    });

    const cards = Array.from(
      container.querySelectorAll('[data-testid^="sidebar-subagent-session-"]'),
    );

    expect(cards.map((card) => card.getAttribute("data-testid"))).toEqual([
      "sidebar-subagent-session-child-running",
      "sidebar-subagent-session-child-completed",
    ]);
    expect(cards[0]?.textContent).toContain("当前焦点");
    expect(container.textContent).toContain(
      "当前线程来自主助手，可直接返回主助手并切换其他子任务；正在处理的任务会排在前面。",
    );
  });
  it("点击子任务入口应收起顶部区块并滚动到任务列表", () => {
    const container = renderSidebar({
      childSubagentSessions: [
        {
          id: "child-1",
          name: "代码审查代理",
          created_at: 1_742_288_400,
          updated_at: 1_742_288_520,
          session_type: "sub_agent",
          task_summary: "检查 team runtime 侧栏遗漏的交互入口。",
          role_hint: "reviewer",
          runtime_status: "running",
        },
      ],
    });

    const taskHeading = container.querySelector(
      '[data-testid="task-section-heading"]',
    ) as
      | (HTMLDivElement & { scrollIntoView?: ReturnType<typeof vi.fn> })
      | null;
    expect(taskHeading).toBeTruthy();

    const scrollIntoView = vi.fn();
    if (taskHeading) {
      taskHeading.scrollIntoView = scrollIntoView;
    }

    const jumpButton = container.querySelector(
      'button[aria-label="跳转到任务列表"]',
    ) as HTMLButtonElement | null;
    expect(jumpButton).toBeTruthy();

    act(() => {
      jumpButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(scrollIntoView).toHaveBeenCalledWith({
      block: "start",
      behavior: "smooth",
    });
    expect(container.textContent).toContain("已收起 · 1 个子任务 · 1 个处理中");
    expect(container.textContent).not.toContain("代码审查代理");
  });
  it("父线程应在侧栏展示真实子任务并支持打开", () => {
    const onOpenSubagentSession = vi.fn();
    const container = renderSidebar({
      childSubagentSessions: [
        {
          id: "child-1",
          name: "代码审查代理",
          created_at: 1_742_288_400,
          updated_at: 1_742_288_520,
          session_type: "sub_agent",
          task_summary: "检查 team runtime 侧栏遗漏的交互入口。",
          role_hint: "reviewer",
          runtime_status: "running",
        },
        {
          id: "child-2",
          name: "文档校对代理",
          created_at: 1_742_288_410,
          updated_at: 1_742_288_480,
          session_type: "sub_agent",
          task_summary: "核对 roadmap 的阶段完成度。",
          role_hint: "writer",
          runtime_status: "completed",
        },
      ],
      onOpenSubagentSession,
    });

    expect(container.textContent).toContain("子任务");
    expect(container.textContent).toContain("代码审查代理");
    expect(container.textContent).toContain("文档校对代理");
    expect(container.textContent).toContain("子任务");
    expect(container.textContent).toContain("处理中");
    expect(container.textContent).toContain("已完成");

    const sessionButton = Array.from(container.querySelectorAll("button")).find(
      (element) => element.textContent?.includes("代码审查代理"),
    );
    expect(sessionButton).toBeTruthy();

    act(() => {
      sessionButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onOpenSubagentSession).toHaveBeenCalledWith("child-1");
  });
  it("父线程子任务区域应支持折叠和展开", () => {
    const container = renderSidebar({
      childSubagentSessions: [
        {
          id: "child-1",
          name: "代码审查代理",
          created_at: 1_742_288_400,
          updated_at: 1_742_288_520,
          session_type: "sub_agent",
          task_summary: "检查 team runtime 侧栏遗漏的交互入口。",
          role_hint: "reviewer",
          runtime_status: "running",
        },
        {
          id: "child-2",
          name: "文档校对代理",
          created_at: 1_742_288_410,
          updated_at: 1_742_288_480,
          session_type: "sub_agent",
          task_summary: "核对 roadmap 的阶段完成度。",
          role_hint: "writer",
          runtime_status: "completed",
        },
      ],
    });

    expect(container.textContent).toContain("代码审查代理");
    expect(container.textContent).toContain("文档校对代理");

    const collapseButton = container.querySelector(
      'button[aria-label="收起子任务"]',
    ) as HTMLButtonElement | null;
    expect(collapseButton).toBeTruthy();

    act(() => {
      collapseButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container.textContent).toContain(
      "已收起 · 2 个子任务 · 1 个处理中 · 1 个已完成",
    );
    expect(container.textContent).not.toContain("代码审查代理");
    expect(container.textContent).not.toContain("文档校对代理");

    const expandButton = container.querySelector(
      'button[aria-label="展开子任务"]',
    ) as HTMLButtonElement | null;
    expect(expandButton).toBeTruthy();

    act(() => {
      expandButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container.textContent).toContain("代码审查代理");
    expect(container.textContent).toContain("文档校对代理");
  });
  it("父线程子任务较多时应默认收起，并支持展开更多子任务", () => {
    const container = renderSidebar({
      childSubagentSessions: [
        {
          id: "child-1",
          name: "代码审查代理",
          created_at: 1_742_288_400,
          updated_at: 1_742_288_560,
          session_type: "sub_agent",
          task_summary: "检查 team runtime 侧栏遗漏的交互入口。",
          role_hint: "reviewer",
          runtime_status: "running",
        },
        {
          id: "child-2",
          name: "文档校对代理",
          created_at: 1_742_288_410,
          updated_at: 1_742_288_550,
          session_type: "sub_agent",
          task_summary: "核对 roadmap 的阶段完成度。",
          role_hint: "writer",
          runtime_status: "completed",
        },
        {
          id: "child-3",
          name: "数据整理代理",
          created_at: 1_742_288_420,
          updated_at: 1_742_288_540,
          session_type: "sub_agent",
          task_summary: "汇总运行日志中的关键告警。",
          role_hint: "analyst",
          runtime_status: "queued",
        },
        {
          id: "child-4",
          name: "回归验证代理",
          created_at: 1_742_288_430,
          updated_at: 1_742_288_530,
          session_type: "sub_agent",
          task_summary: "确认恢复链路和 UI 状态推进。",
          role_hint: "qa",
          runtime_status: "running",
        },
      ],
    });

    expect(container.textContent).toContain(
      "已收起 · 4 个子任务 · 2 个处理中 · 1 个稍后开始 · 1 个已完成",
    );
    expect(container.textContent).not.toContain("代码审查代理");
    expect(container.textContent).not.toContain("文档校对代理");
    expect(container.textContent).not.toContain("数据整理代理");
    expect(container.textContent).not.toContain("回归验证代理");

    const expandTeamButton = container.querySelector(
      'button[aria-label="展开子任务"]',
    ) as HTMLButtonElement | null;
    expect(expandTeamButton).toBeTruthy();

    act(() => {
      expandTeamButton?.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });

    expect(container.textContent).toContain("代码审查代理");
    expect(container.textContent).toContain("回归验证代理");
    expect(container.textContent).toContain("数据整理代理");
    expect(container.textContent).not.toContain("文档校对代理");
    expect(container.textContent).toContain("展开剩余 1 个子任务");

    const expandMoreButton = Array.from(
      container.querySelectorAll("button"),
    ).find((element) => element.textContent?.includes("展开剩余 1 个子任务"));
    expect(expandMoreButton).toBeTruthy();

    act(() => {
      expandMoreButton?.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });

    expect(container.textContent).toContain("回归验证代理");
    expect(container.textContent).toContain("文档校对代理");
    expect(container.textContent).toContain("收起子任务列表");

    const collapseListButton = Array.from(
      container.querySelectorAll("button"),
    ).find((element) => element.textContent?.includes("收起子任务列表"));
    expect(collapseListButton).toBeTruthy();

    act(() => {
      collapseListButton?.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });

    expect(container.textContent).toContain("回归验证代理");
    expect(container.textContent).not.toContain("文档校对代理");
  });
  it("子线程并行子任务较多时应默认收起子任务", () => {
    const container = renderSidebar({
      topics: [
        {
          ...defaultTopics[0],
          id: "child-1",
          title: "实现 team sidebar",
          sourceSessionId: "child-1",
        },
      ],
      currentTopicId: "child-1",
      subagentParentContext: {
        parent_session_id: "parent-1",
        parent_session_name: "主线程",
        role_hint: "implementer",
        task_summary: "把真实 child session 投影到常驻侧栏。",
        created_from_turn_id: "turn-42",
        sibling_subagent_sessions: [
          {
            id: "child-2",
            name: "研究代理",
            created_at: 1_742_288_430,
            updated_at: 1_742_288_530,
            session_type: "sub_agent",
            task_summary: "比对 roadmap 与当前实现差异。",
            role_hint: "researcher",
            runtime_status: "queued",
          },
          {
            id: "child-3",
            name: "验证代理",
            created_at: 1_742_288_431,
            updated_at: 1_742_288_531,
            session_type: "sub_agent",
            task_summary: "验证 team runtime 行为。",
            role_hint: "qa",
            runtime_status: "running",
          },
          {
            id: "child-4",
            name: "文档代理",
            created_at: 1_742_288_432,
            updated_at: 1_742_288_532,
            session_type: "sub_agent",
            task_summary: "补齐回归说明。",
            role_hint: "writer",
            runtime_status: "completed",
          },
        ],
      },
    });

    expect(container.textContent).toContain(
      "已收起 · 3 个并行子任务 · 1 个处理中 · 1 个稍后开始 · 1 个已完成",
    );
    expect(container.textContent).not.toContain("研究代理");
    expect(container.textContent).not.toContain("验证代理");
    expect(container.textContent).not.toContain("文档代理");

    const expandButton = container.querySelector(
      'button[aria-label="展开子任务"]',
    ) as HTMLButtonElement | null;
    expect(expandButton).toBeTruthy();

    act(() => {
      expandButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container.textContent).toContain("验证代理");
    expect(container.textContent).toContain("研究代理");
    expect(container.textContent).not.toContain("文档代理");
    expect(container.textContent).toContain("展开剩余 1 个并行子任务");
  });
  it("子线程应展示父会话和并行子任务入口", () => {
    const onOpenSubagentSession = vi.fn();
    const onReturnToParentSession = vi.fn();
    const container = renderSidebar({
      topics: [
        {
          ...defaultTopics[0],
          id: "child-1",
          title: "实现 team sidebar",
          sourceSessionId: "child-1",
        },
      ],
      currentTopicId: "child-1",
      subagentParentContext: {
        parent_session_id: "parent-1",
        parent_session_name: "主线程",
        role_hint: "implementer",
        task_summary: "把真实 child session 投影到常驻侧栏。",
        created_from_turn_id: "turn-42",
        sibling_subagent_sessions: [
          {
            id: "child-2",
            name: "研究代理",
            created_at: 1_742_288_430,
            updated_at: 1_742_288_530,
            session_type: "sub_agent",
            task_summary: "比对 roadmap 与当前实现差异。",
            role_hint: "researcher",
            runtime_status: "queued",
          },
        ],
      },
      onOpenSubagentSession,
      onReturnToParentSession,
    });

    expect(container.textContent).toContain("子任务");
    expect(container.textContent).toContain("主线程");
    expect(container.textContent).toContain("当前子任务");
    expect(container.textContent).toContain("实现 team sidebar");
    expect(container.textContent).toContain("研究代理");
    expect(container.textContent).toContain("稍后开始");

    const returnButton = Array.from(container.querySelectorAll("button")).find(
      (element) => element.textContent?.includes("主线程"),
    );
    expect(returnButton).toBeTruthy();

    act(() => {
      returnButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onReturnToParentSession).toHaveBeenCalledTimes(1);

    const siblingButton = Array.from(container.querySelectorAll("button")).find(
      (element) => element.textContent?.includes("研究代理"),
    );
    expect(siblingButton).toBeTruthy();

    act(() => {
      siblingButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onOpenSubagentSession).toHaveBeenCalledWith("child-2");
  });
  it("内部图片子任务标题应显示为用户文案", () => {
    const container = renderSidebar({
      topics: [
        {
          ...defaultTopics[0],
          id: "child-image",
          title: "Image #1",
          sourceSessionId: "child-image",
        },
      ],
      currentTopicId: "child-image",
      subagentParentContext: {
        parent_session_id: "parent-1",
        parent_session_name: "主线程",
        role_hint: "image_editor",
        task_summary: "处理图片细节。",
        created_from_turn_id: "turn-42",
        sibling_subagent_sessions: [
          {
            id: "child-2",
            name: "Image #2",
            created_at: 1_742_288_430,
            updated_at: 1_742_288_530,
            session_type: "sub_agent",
            task_summary: "检查图片导出尺寸。",
            role_hint: "image_reviewer",
            runtime_status: "queued",
          },
        ],
      },
    });

    expect(container.textContent).toContain("图片任务 1");
    expect(container.textContent).toContain("图片任务 2");
    expect(container.textContent).not.toContain("Image #1");
    expect(container.textContent).not.toContain("Image #2");
  });
});
