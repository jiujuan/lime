import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  createSkillSelection,
  openPlusMenuPanel,
  renderPanel,
  TEST_EN_COMPOSER_COPY,
  TEST_EN_INPUTBAR_CORE_COPY,
} from "./EmptyStateComposerPanel.testFixtures";

describe("EmptyStateComposerPanel", () => {
  it("已开启的偏好若缺少 runtime current tools，也不应再显示页级告警", () => {
    const container = renderPanel({
      isGeneralTheme: true,
      subagentEnabled: true,
    });

    expect(
      container.querySelector(
        '[data-testid="empty-state-runtime-tool-warning"]',
      ),
    ).toBeNull();
    expect(container.textContent).not.toContain("当前 runtime tool surface");
    expect(container.textContent).not.toContain("联网搜索偏好本轮可能不会生效");
    expect(container.textContent).not.toContain(
      "Subagents 本轮可能不会完全生效",
    );
  });

  it("首页空态输入区默认隐藏技能入口，通过加号菜单打开独立技能浮层", () => {
    const container = renderPanel({
      isGeneralTheme: true,
      skillSelection: createSkillSelection({
        skills: [
          {
            key: "writer",
            name: "写作助手",
            description: "用于写作",
            directory: "writer",
            installed: true,
            sourceKind: "builtin",
          },
        ],
      }),
    });

    expect(
      container.querySelector('[data-testid="empty-state-character-mention"]'),
    ).toBeTruthy();
    expect(
      container.querySelector('[data-testid="empty-state-skill-selector"]'),
    ).toBeNull();

    openPlusMenuPanel(container, "skills");

    expect(
      document.body.querySelector('[data-testid="empty-state-skill-selector"]'),
    ).toBeTruthy();
  });

  it("首页空态输入区应使用新的浮层输入壳，而不是旧默认输入壳", () => {
    const container = renderPanel({
      isGeneralTheme: true,
    });

    const composer = container.querySelector(
      '[data-testid="inputbar-core-container"]',
    ) as HTMLDivElement | null;

    expect(composer).toBeTruthy();
    expect(composer?.className).toContain("floating-composer");
  });

  it("首页项目栏应连接在同一个输入壳内以继承聚焦态", () => {
    const container = renderPanel({
      isGeneralTheme: true,
      projectId: "default",
      openedProjects: [
        {
          id: "default",
          name: "默认项目",
          rootPath: "/workspace/default",
        },
      ],
      projectContextModeLabel: "本地模式",
    });

    const connectedComposer = container.querySelector(
      '[data-testid="inputbar-connected-composer"]',
    );
    const composer = container.querySelector(
      '[data-testid="inputbar-core-container"]',
    );
    const projectContextSlot = container.querySelector(
      '[data-testid="inputbar-context-bar-slot"]',
    );

    expect(connectedComposer).toBeTruthy();
    expect(composer).toBeTruthy();
    expect(projectContextSlot).toBeTruthy();
    expect(connectedComposer?.contains(composer ?? null)).toBe(true);
    expect(connectedComposer?.contains(projectContextSlot ?? null)).toBe(true);
  });

  it("没有真实项目时不应把 UUID 会话号显示成项目", () => {
    const staleProjectId = "240ed157-3e7a-456c-a2c2-a05d499f5991";
    const container = renderPanel({
      isGeneralTheme: true,
      projectId: staleProjectId,
      openedProjects: [
        {
          id: staleProjectId,
          name: staleProjectId,
          rootPath: null,
        },
      ],
    });

    const trigger = container.querySelector(
      '[data-testid="inputbar-project-context-project-trigger"]',
    ) as HTMLButtonElement | null;

    expect(trigger?.textContent).toContain("进入项目工作");
    expect(trigger?.textContent).not.toContain(staleProjectId);
    expect(container.textContent).not.toContain(staleProjectId);

    act(() => {
      trigger?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const menu = document.body.querySelector(
      '[data-testid="inputbar-project-context-menu"]',
    );
    expect(menu?.textContent).toContain("添加新项目");
    expect(menu?.textContent).toContain("继续普通对话");
    expect(menu?.textContent).not.toContain(staleProjectId);
  });

  it("首页空态输入区应显示文件管理器按钮并触发开关", () => {
    const onToggleFileManager = vi.fn();
    const container = renderPanel({
      onToggleFileManager,
      fileManagerOpen: false,
    });

    const toggleButton = container.querySelector(
      '[data-testid="inputbar-file-manager-toggle"]',
    ) as HTMLButtonElement | null;

    expect(toggleButton).toBeTruthy();
    expect(toggleButton?.getAttribute("aria-label")).toBe("打开左侧文件管理器");

    act(() => {
      toggleButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onToggleFileManager).toHaveBeenCalledTimes(1);
  });

  it("首页空态输入区 chrome 文案应支持 en-US copy", () => {
    const container = renderPanel({
      copy: TEST_EN_COMPOSER_COPY,
      inputbarCopy: TEST_EN_INPUTBAR_CORE_COPY,
      isGeneralTheme: true,
      guideHelpActive: true,
      onClearGuideHelp: vi.fn(),
      onToggleFileManager: vi.fn(),
      showCreationModeSelector: true,
    });

    const guideBadge = container.querySelector(
      '[data-testid="home-guide-help-active-badge"]',
    );
    expect(guideBadge?.textContent).toContain("Lime guide help");

    const guideCloseButton = guideBadge?.querySelector("button");
    expect(guideCloseButton?.getAttribute("aria-label")).toBe(
      "Close Lime guide help",
    );
    expect(guideCloseButton?.getAttribute("title")).toBe("Close guide help");
    expect(
      container
        .querySelector('[data-testid="home-guide-help-toolbar-badge"]')
        ?.getAttribute("title"),
    ).toBe("Close guide help");

    const plusTrigger = container.querySelector(
      '[data-testid="inputbar-plus-trigger"]',
    ) as HTMLButtonElement | null;
    expect(plusTrigger?.getAttribute("aria-label")).toBe("Open input settings");
    expect(plusTrigger?.getAttribute("title")).toBe("Open input settings");
    expect(container.textContent).not.toContain("Current model");
    expect(
      container.querySelector('[data-testid="empty-state-model-selector"]'),
    ).toBeTruthy();

    const fileManagerToggle = container.querySelector(
      '[data-testid="inputbar-file-manager-toggle"]',
    ) as HTMLButtonElement | null;
    expect(fileManagerToggle?.getAttribute("aria-label")).toBe(
      "Open file manager sidebar",
    );

    expect(container.textContent).not.toContain("General task context");
  });

  it("首页 Plan 和 Goal 状态标签应在权限后显示，并可单独关闭", () => {
    const onTaskEnabledChange = vi.fn();
    const onObjectiveEnabledChange = vi.fn();
    const container = renderPanel({
      taskEnabled: true,
      onTaskEnabledChange,
      objectiveEnabled: true,
      onObjectiveEnabledChange,
      accessMode: "full-access",
      setAccessMode: vi.fn(),
    });

    const leftMeta = container.querySelector(
      '[data-testid="inputbar-meta-left"]',
    );
    const rightMeta = container.querySelector(
      '[data-testid="inputbar-meta-trailing"]',
    );
    const planChip = leftMeta?.querySelector(
      '[data-testid="empty-state-task-mode-status"]',
    ) as HTMLButtonElement | null;
    const objectiveChip = leftMeta?.querySelector(
      '[data-testid="empty-state-objective-status"]',
    ) as HTMLButtonElement | null;

    expect(
      leftMeta?.querySelector('[data-testid="inputbar-access-mode-select"]'),
    ).toBeTruthy();
    expect(planChip?.textContent).toContain("计划");
    expect(objectiveChip?.textContent).toContain("追求目标");
    expect(
      getComputedStyle(
        planChip?.querySelector(
          '[data-testid="empty-state-task-mode-status-remove-mark"]',
        ) as HTMLElement,
      ).opacity,
    ).toBe("0");
    expect(
      getComputedStyle(
        objectiveChip?.querySelector(
          '[data-testid="empty-state-objective-status-remove-mark"]',
        ) as HTMLElement,
      ).opacity,
    ).toBe("0");
    expect(
      leftMeta?.querySelector('[data-testid="empty-state-model-selector"]'),
    ).toBeNull();
    expect(
      rightMeta?.querySelector('[data-testid="empty-state-model-selector"]'),
    ).toBeTruthy();

    act(() => {
      planChip?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onTaskEnabledChange).toHaveBeenCalledWith(false);
    expect(onObjectiveEnabledChange).not.toHaveBeenCalled();

    act(() => {
      objectiveChip?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onObjectiveEnabledChange).toHaveBeenCalledWith(false);
  });

  it("首页开启 Goal 且已有会话时应显示追求目标编辑面板", () => {
    const container = renderPanel({
      objectiveEnabled: true,
      projectId: "home-project",
      sessionId: "home-session-goal",
      isLoading: true,
    });

    const objectivePanel = container.querySelector(
      '[data-testid="empty-state-objective-inline-panel"]',
    );
    expect(objectivePanel).toBeTruthy();
    expect(objectivePanel?.getAttribute("data-session-id")).toBe(
      "home-session-goal",
    );
    expect(objectivePanel?.getAttribute("data-workspace-id")).toBe(
      "home-project",
    );
    expect(objectivePanel?.getAttribute("data-runtime-busy")).toBe("true");
  });
});
