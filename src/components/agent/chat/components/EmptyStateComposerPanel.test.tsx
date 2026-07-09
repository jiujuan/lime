import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  createSkillSelection,
  mockEmptyStateCharacterMention,
  openPlusMenuPanel,
  renderPanel,
  TEST_EN_COMPOSER_COPY,
  TEST_EN_INPUTBAR_CORE_COPY,
  updateTextareaValue,
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

  it("首页空态输入区加号菜单应显示写文章插件入口", () => {
    const container = renderPanel({
      isGeneralTheme: true,
      pluginSuggestions: [
        {
          pluginId: "content-factory-app",
          displayName: "写文章",
          trigger: "@写文章",
          description: "生成文章草稿",
        },
      ],
    });

    openPlusMenuPanel(container, "plugins");

    const pluginsRow = document.body.querySelector(
      '[data-testid="inputbar-plus-plugins"]',
    ) as HTMLButtonElement | null;
    expect(pluginsRow).toBeTruthy();
    expect(pluginsRow?.textContent).toContain("插件");
    expect(pluginsRow?.disabled).toBe(false);
    expect(
      document.body.querySelector('[data-testid="inputbar-plus-panel-plugins"]')
        ?.textContent,
    ).toContain("写文章");
    expect(
      document.body.querySelector('[data-testid="inputbar-plus-panel-plugins"]')
        ?.textContent,
    ).not.toContain("当前没有可选插件");
  });

  it("首页空态输入区打开插件面板时应请求加载已安装插件", () => {
    const onPluginSuggestionsNeeded = vi.fn();
    const container = renderPanel({
      isGeneralTheme: true,
      onPluginSuggestionsNeeded,
    });

    openPlusMenuPanel(container, "plugins");

    expect(onPluginSuggestionsNeeded).toHaveBeenCalledTimes(1);
  });

  it("首页空态输入区插件候选加载中时不应提前显示空态", () => {
    const container = renderPanel({
      isGeneralTheme: true,
      pluginSuggestionsLoading: true,
    });

    openPlusMenuPanel(container, "plugins");

    const pluginsPanel = document.body.querySelector(
      '[data-testid="inputbar-plus-panel-plugins"]',
    );
    expect(pluginsPanel?.textContent).toContain("正在读取已安装插件");
    expect(pluginsPanel?.textContent).not.toContain("当前没有可选插件");
  });

  it("首页空态输入区选择写文章插件时应写回 @写文章 触发前缀", async () => {
    const container = renderPanel({
      input: "写一篇公众号文章",
      isGeneralTheme: true,
      pluginSuggestions: [
        {
          pluginId: "content-factory-app",
          displayName: "写文章",
          trigger: "@写文章",
          description: "生成文章草稿",
        },
      ],
    });

    openPlusMenuPanel(container, "plugins");

    const option = document.body.querySelector(
      '[data-testid="inputbar-plugin-option"]',
    ) as HTMLButtonElement | null;
    expect(option).toBeTruthy();

    await act(async () => {
      option?.click();
      await Promise.resolve();
    });

    expect(
      container.querySelector('[data-testid="inputbar-plugin-badge"]')
        ?.textContent,
    ).toContain("写文章");
    expect(
      (container.querySelector("textarea") as HTMLTextAreaElement | null)
        ?.value,
    ).toBe("@写文章 写一篇公众号文章");
  });

  it("首页空态输入区通过 mention 选择插件时不应重复写回触发词", async () => {
    const plugin = {
      pluginId: "content-factory-app",
      displayName: "写文章",
      trigger: "@写文章",
      description: "生成文章草稿",
    };
    const container = renderPanel({
      input: "@写文章",
      isGeneralTheme: true,
      pluginSuggestions: [plugin],
    });

    const mentionProps = mockEmptyStateCharacterMention.mock.calls.at(-1)?.[0];
    expect(mentionProps?.onSelectPlugin).toBeTruthy();

    await act(async () => {
      mentionProps?.onSelectPlugin?.(plugin, undefined, {
        inputOverride: "",
        preserveInputOverride: true,
      });
      await Promise.resolve();
    });

    expect(
      container.querySelector('[data-testid="inputbar-plugin-badge"]')
        ?.textContent,
    ).toContain("写文章");
    expect(
      (container.querySelector("textarea") as HTMLTextAreaElement | null)
        ?.value,
    ).toBe("");
  });

  it("首页空态输入区选择插件时应写回显式触发前缀并显示插件标记", async () => {
    const container = renderPanel({
      input: "整理今天的选题",
      isGeneralTheme: true,
      pluginSuggestions: [
        {
          pluginId: "content-workbench",
          displayName: "内容工厂",
          description: "整理内容生产资料",
        },
      ],
    });

    openPlusMenuPanel(container, "plugins");

    const option = document.body.querySelector(
      '[data-testid="inputbar-plugin-option"]',
    ) as HTMLButtonElement | null;
    expect(option).toBeTruthy();

    await act(async () => {
      option?.click();
      await Promise.resolve();
    });

    expect(
      container.querySelector('[data-testid="inputbar-plugin-badge"]')
        ?.textContent,
    ).toContain("内容工厂");
    expect(
      (container.querySelector("textarea") as HTMLTextAreaElement | null)
        ?.value,
    ).toBe("@内容工厂 整理今天的选题");
  });

  it("首页空态输入区手动删除插件前缀后不应自动恢复标记", async () => {
    const container = renderPanel({
      input: "整理今天的选题",
      isGeneralTheme: true,
      pluginSuggestions: [
        {
          pluginId: "content-workbench",
          displayName: "内容工厂",
          description: "整理内容生产资料",
        },
      ],
    });

    openPlusMenuPanel(container, "plugins");

    const option = document.body.querySelector(
      '[data-testid="inputbar-plugin-option"]',
    ) as HTMLButtonElement | null;
    expect(option).toBeTruthy();

    await act(async () => {
      option?.click();
      await Promise.resolve();
    });

    expect(
      container.querySelector('[data-testid="inputbar-plugin-badge"]'),
    ).toBeTruthy();

    const textarea = container.querySelector(
      "textarea",
    ) as HTMLTextAreaElement | null;
    updateTextareaValue(textarea, "整理今天的选题");

    await act(async () => {
      await Promise.resolve();
    });

    expect(
      container.querySelector('[data-testid="inputbar-plugin-badge"]'),
    ).toBeNull();
    expect(
      (container.querySelector("textarea") as HTMLTextAreaElement | null)
        ?.value,
    ).toBe("整理今天的选题");
  });

  it("首页空态输入区选择插件技能时应写回 @插件:技能 前缀", async () => {
    const container = renderPanel({
      input: "整理今天的选题",
      isGeneralTheme: true,
      pluginSuggestions: [
        {
          pluginId: "content-workbench",
          displayName: "内容工厂",
          description: "整理内容生产资料",
          skills: [
            {
              skillId: "article-writer",
              title: "文章写作",
              description: "生成文章草稿",
            },
          ],
        },
      ],
    });

    openPlusMenuPanel(container, "plugins");

    const option = document.body.querySelector(
      '[data-testid="inputbar-plugin-skill-option"]',
    ) as HTMLButtonElement | null;
    expect(option).toBeTruthy();

    await act(async () => {
      option?.click();
      await Promise.resolve();
    });

    expect(
      container.querySelector('[data-testid="inputbar-plugin-badge"]')
        ?.textContent,
    ).toContain("内容工厂:文章写作");
    expect(
      (container.querySelector("textarea") as HTMLTextAreaElement | null)
        ?.value,
    ).toBe("@内容工厂:文章写作 整理今天的选题");
  });

  it("首页空态输入区插件名称为空时应回退显示插件 id", async () => {
    const container = renderPanel({
      input: "整理今天的选题",
      isGeneralTheme: true,
      pluginSuggestions: [
        {
          pluginId: "content-workbench",
          displayName: " ",
          description: "整理内容生产资料",
        },
      ],
    });

    openPlusMenuPanel(container, "plugins");

    expect(
      document.body.querySelector('[data-testid="inputbar-plus-panel-plugins"]')
        ?.textContent,
    ).toContain("content-workbench");

    const option = document.body.querySelector(
      '[data-testid="inputbar-plugin-option"]',
    ) as HTMLButtonElement | null;

    await act(async () => {
      option?.click();
      await Promise.resolve();
    });

    expect(
      container.querySelector('[data-testid="inputbar-plugin-badge"]')
        ?.textContent,
    ).toContain("content-workbench");
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

  it("首页空态输入区应在右下角显示语音和发送主操作", () => {
    const container = renderPanel({
      isGeneralTheme: true,
    });

    const primaryActions = container.querySelector(
      '[data-testid="inputbar-primary-actions"]',
    );
    const dictationButton = container.querySelector(
      '[data-testid="inputbar-dictation-toggle"]',
    ) as HTMLButtonElement | null;
    const sendButton = container.querySelector(
      '[data-testid="send-btn"]',
    ) as HTMLButtonElement | null;

    expect(primaryActions).toBeTruthy();
    expect(dictationButton).toBeTruthy();
    expect(dictationButton?.textContent).toBe("");
    expect(
      dictationButton?.closest('[data-testid="inputbar-primary-actions"]'),
    ).toBe(primaryActions);
    expect(sendButton?.closest('[data-testid="inputbar-primary-actions"]')).toBe(
      primaryActions,
    );
    expect(
      container.querySelector('[data-testid="inputbar-expand-toggle"]'),
    ).toBeNull();
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
