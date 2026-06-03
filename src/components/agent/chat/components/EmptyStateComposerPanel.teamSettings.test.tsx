import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  expandAdvancedControls,
  mockSelectedTeam,
  renderPanel,
  renderStatefulPanel,
} from "./EmptyStateComposerPanel.testFixtures";

describe("EmptyStateComposerPanel", () => {
  it("复杂任务应显示任务分工建议并支持开启多代理", () => {
    const onSubagentEnabledChange = vi.fn();
    const container = renderPanel({
      isGeneralTheme: true,
      input:
        "请帮我分析这个 Rust GUI 多代理实现差异，拆分任务并行推进，再补回归测试和最终汇总结论。",
      onSubagentEnabledChange,
    });

    const suggestionBar = container.querySelector(
      '[data-testid="team-suggestion-bar"]',
    );
    expect(suggestionBar).toBeTruthy();
    expect(suggestionBar?.textContent).toContain("分工建议");

    const enableTeamButton = Array.from(
      container.querySelectorAll("button"),
    ).find((button) => button.textContent?.includes("启用任务分工"));

    expect(enableTeamButton).toBeTruthy();

    act(() => {
      enableTeamButton?.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });

    expect(onSubagentEnabledChange).toHaveBeenCalledWith(true);
  });

  it("继续单代理后应隐藏当前输入对应的任务分工建议", () => {
    const container = renderPanel({
      isGeneralTheme: true,
      input:
        "请把任务拆成多个子任务分别分析、实现、验证，并在最后统一汇总输出。",
      onSubagentEnabledChange: vi.fn(),
    });

    const continueButton = Array.from(
      container.querySelectorAll("button"),
    ).find((button) => button.textContent?.includes("继续单代理"));

    expect(continueButton).toBeTruthy();

    act(() => {
      continueButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(
      container.querySelector('[data-testid="team-suggestion-bar"]'),
    ).toBeNull();
  });

  it("开启 Team mode 后应显示 TeamSelector", () => {
    const container = renderPanel({
      isGeneralTheme: true,
      subagentEnabled: true,
    });

    expect(
      container.querySelector('[data-testid="empty-state-team-selector"]'),
    ).toBeTruthy();
  });

  it("未开启 Team mode 时默认不显示 TeamSelector，通过加号菜单暴露多代理开关", () => {
    const container = renderPanel({
      isGeneralTheme: true,
      subagentEnabled: false,
    });

    expect(
      container.querySelector('[data-testid="empty-state-team-selector"]'),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-testid="empty-state-team-mode-enable-button"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector('button[title="任务拆分偏好已关闭"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="inputbar-plus-trigger"]'),
    ).toBeTruthy();

    expandAdvancedControls(container);

    expect(
      document.body.querySelector('[data-testid="inputbar-plus-subagent-mode"]'),
    ).toBeTruthy();
  });

  it("高级设置不再渲染编程执行前置开关", () => {
    const container = renderPanel();

    expect(
      container.querySelector('[data-testid="inputbar-plan-toggle"]'),
    ).toBeNull();

    expandAdvancedControls(container);

    expect(
      container.querySelector('[data-testid="inputbar-plan-toggle"]'),
    ).toBeNull();
    expect(container.textContent).not.toContain("编程执行");
    expect(container.textContent).not.toContain("ReAct");
    expect(container.textContent).not.toContain("Auto");
  });

  it("即使已经保留 Team 方案，关闭 Team mode 后也不应显示 TeamSelector", () => {
    const container = renderPanel({
      isGeneralTheme: true,
      subagentEnabled: false,
      selectedTeam: mockSelectedTeam,
    });

    expect(
      container.querySelector('[data-testid="empty-state-team-selector"]'),
    ).toBeNull();

    const enableButton = container.querySelector(
      '[data-testid="empty-state-team-mode-enable-button"]',
    ) as HTMLButtonElement | null;

    expect(enableButton).toBeNull();
    expect(
      container.querySelector('button[title="任务拆分偏好已关闭"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="inputbar-plus-trigger"]'),
    ).toBeTruthy();
  });

  it("命中稳妥模式模型时不应再展示额外横幅", () => {
    const container = renderPanel({
      providerType: "openai",
      model: "glm-4.7",
    });

    expect(
      container.querySelector(
        '[data-testid="empty-state-stable-processing-notice"]',
      ),
    ).toBeNull();
    expect(container.textContent).not.toContain("稳妥模式");
  });

  it("点击多代理图标后应自动透传 Team 配置面板打开令牌", async () => {
    const container = renderStatefulPanel();

    expandAdvancedControls(container);

    const enableButton = document.body.querySelector(
      '[data-testid="inputbar-plus-subagent-mode"]',
    ) as HTMLButtonElement | null;

    expect(enableButton).toBeTruthy();

    act(() => {
      enableButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const teamSelector = container.querySelector(
      '[data-testid="empty-state-team-selector"]',
    ) as HTMLDivElement | null;

    expect(teamSelector).toBeTruthy();
    expect(teamSelector?.getAttribute("data-auto-open-token")).toBe("1");
  });

  it("关闭多代理偏好后应立即隐藏 TeamSelector 并回到显式开启入口", async () => {
    const container = renderStatefulPanel(
      {
        selectedTeam: mockSelectedTeam,
      },
      true,
    );

    expandAdvancedControls(container);

    expect(
      container.querySelector('[data-testid="empty-state-team-selector"]'),
    ).toBeTruthy();

    const toggleButton = document.body.querySelector(
      '[data-testid="inputbar-plus-subagent-mode"]',
    ) as HTMLButtonElement | null;

    expect(toggleButton).toBeTruthy();

    act(() => {
      toggleButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(
      container.querySelector('[data-testid="empty-state-team-selector"]'),
    ).toBeNull();
    expect(
      document.body.querySelector('[data-testid="inputbar-plus-subagent-mode"]'),
    ).toBeTruthy();
  });

  it("复杂任务但未开启 Team 时，首页保留推荐提示但不再渲染重复入口", () => {
    const container = renderPanel({
      isGeneralTheme: true,
      subagentEnabled: false,
      input: "请拆成多个子任务分别分析、实现、验证，并最终统一回归验收",
    });

    const enableButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("启用任务分工"),
    ) as HTMLButtonElement | undefined;

    expect(
      container.querySelector(
        '[data-testid="empty-state-team-mode-enable-button"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector('button[title="任务拆分偏好已关闭"]'),
    ).toBeNull();
    expect(enableButton).toBeTruthy();
    expect(enableButton?.textContent).toContain("启用任务分工");
    const suggestionBar = container.querySelector(
      '[data-testid="team-suggestion-bar"]',
    );
    expect(suggestionBar).toBeTruthy();
    expect(suggestionBar?.textContent).toContain("分工建议");
  });

  it("底栏应直接显示模型切换器，不再使用只读当前模型信息", () => {
    const container = renderPanel({
      providerType: "claude",
      model: "claude-sonnet-4-5",
    });

    expect(container.textContent).not.toContain("当前模型");
    expect(
      container.querySelector('[data-testid="empty-state-model-selector"]'),
    ).toBeTruthy();
  });

  it("底栏应直接渲染权限模式选择并透传切换", () => {
    const setAccessMode = vi.fn();
    const container = renderPanel({
      accessMode: "current",
      setAccessMode,
    });

    const select = container.querySelector(
      '[data-testid="inputbar-access-mode-select"]',
    ) as HTMLSelectElement | null;

    expect(select).toBeTruthy();
    expect(select?.value).toBe("current");

    act(() => {
      if (select) {
        select.value = "full-access";
        select.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });

    expect(setAccessMode).toHaveBeenCalledWith("full-access");
  });
});
