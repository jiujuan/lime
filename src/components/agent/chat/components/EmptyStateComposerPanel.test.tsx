import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  createSkillSelection,
  expandAdvancedControls,
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
      "任务拆分偏好本轮可能不会完全生效",
    );
  });

  it("首页空态输入区默认隐藏技能入口，展开高级设置后与 @ 面板共用同一技能入口", () => {
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

    expandAdvancedControls(container);

    expect(
      container.querySelector('[data-testid="empty-state-skill-selector"]'),
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

    const advancedToggle = container.querySelector(
      '[data-testid="empty-state-advanced-toggle"]',
    ) as HTMLButtonElement | null;
    expect(advancedToggle?.getAttribute("aria-label")).toBe(
      "Expand advanced settings",
    );
    expect(advancedToggle?.getAttribute("title")).toBe(
      "Expand advanced settings",
    );
    expect(advancedToggle?.textContent).toContain("Advanced settings");
    expect(container.textContent).toContain("Current model");

    const fileManagerToggle = container.querySelector(
      '[data-testid="inputbar-file-manager-toggle"]',
    ) as HTMLButtonElement | null;
    expect(fileManagerToggle?.getAttribute("aria-label")).toBe(
      "Open file manager sidebar",
    );

    expandAdvancedControls(container);

    expect(
      container
        .querySelector('[data-testid="empty-state-advanced-toggle"]')
        ?.getAttribute("aria-label"),
    ).toBe("Collapse advanced settings");
    expect(container.textContent).not.toContain("General task context");
  });

});
