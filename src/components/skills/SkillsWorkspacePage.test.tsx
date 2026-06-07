import { act } from "react";
import { describe, expect, it } from "vitest";
import {
  clickMenuItem,
  findButton,
  findButtonIn,
  findLocalSkillRow,
  findMarketplaceCard,
  getLatestNavigationPayload,
  mocks,
  openLocalSkillMenu,
  renderPage,
  useSkillsWorkspacePageTestLifecycle,
} from "./SkillsWorkspacePage.testFixtures";

describe("SkillsWorkspacePage", () => {
  useSkillsWorkspacePageTestLifecycle();

  it("应按分页隔离技能广场、内置、用户安装", () => {
    const { container } = renderPage();

    expect(
      container.querySelector('[data-testid="skills-store-view"]'),
    ).toBeTruthy();
    expect(
      container.querySelector('[data-testid="skills-builtin-view"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="skills-installed-view"]'),
    ).toBeNull();
    expect(container.textContent).toContain("技能广场");
    expect(container.textContent).toContain("官方精选");
    expect(container.textContent).toContain("数据分析");
    expect(container.textContent).not.toContain("深度研究");
    expect(container.textContent).not.toContain("写作助手");
    expect(
      findButtonIn(findMarketplaceCard(container, "数据分析")!, "卸载"),
    ).toBeUndefined();

    act(() => {
      findButton(container, "内置")?.click();
    });

    expect(
      container.querySelector('[data-testid="skills-store-view"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="skills-builtin-view"]'),
    ).toBeTruthy();
    expect(container.textContent).toContain("ASP.NET Core");
    expect(container.textContent).toContain("自动加载");
    expect(container.textContent).not.toContain("写作助手");
    expect(container.textContent).not.toContain("卸载");

    act(() => {
      findButton(container, "用户安装")?.click();
    });

    expect(
      container.querySelector('[data-testid="skills-builtin-view"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="skills-installed-view"]'),
    ).toBeTruthy();
    expect(container.textContent).toContain("写作助手");
    expect(container.textContent).toContain("自动加载");
    openLocalSkillMenu(container);
    expect(container.textContent).toContain("在聊天中试用");
    expect(container.textContent).toContain("重命名");
    expect(container.textContent).toContain("替换");
    expect(container.textContent).toContain("在文件夹中显示");
    expect(container.textContent).toContain("卸载");
    expect(container.textContent).not.toContain("ASP.NET Core");
  });

  it("页面壳、卡片和详情弹窗应接入 Lime 主题变量", async () => {
    const { container } = renderPage();
    const shell = container.querySelector(".lime-workbench-theme-scope");
    const card = findMarketplaceCard(container, "数据分析");

    expect(shell?.className).toContain("bg-[color:var(--lime-app-bg)]");
    expect(shell?.querySelector("main")?.className).toContain(
      "bg-[color:var(--lime-surface)]",
    );
    expect(card?.className).toContain("bg-[color:var(--lime-surface)]");
    expect(card?.className).toContain(
      "border-[color:var(--lime-surface-border)]",
    );

    await act(async () => {
      findButtonIn(card!, "详情")?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    const detail = container.querySelector(
      '[data-testid="skills-marketplace-detail"]',
    );
    const dialogScope = detail?.closest(".lime-workbench-theme-scope");

    expect(dialogScope?.className).toContain("lime-workbench-surface-scope");
    expect(dialogScope?.className).toContain("bg-[color:var(--lime-surface)]");
  });

  it("用户安装页点击使用应回首页输入框预选 @ 技能，不显示入口横幅", () => {
    const { container, onNavigate } = renderPage();

    act(() => {
      findButton(container, "用户安装")?.click();
    });
    openLocalSkillMenu(container);
    act(() => {
      clickMenuItem(container, "在聊天中试用");
    });

    expect(onNavigate).toHaveBeenCalledWith(
      "agent",
      expect.objectContaining({
        agentEntry: "new-task",
        theme: "general",
        preferHomeForInitialInputCapability: true,
        initialInputCapability: {
          capabilityRoute: {
            kind: "installed_skill",
            skillKey: "local:writer",
            skillName: "写作助手",
          },
          requestKey: expect.any(Number),
        },
      }),
    );
    expect(getLatestNavigationPayload(onNavigate)).not.toHaveProperty(
      "entryBannerMessage",
    );
  });

  it("用户安装页应挂载已保存技能面板并读取 workspace skill binding readiness", async () => {
    const { container } = renderPage({ initialView: "installed" });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(
      container.querySelector(
        '[data-testid="workspace-registered-skills-panel"]',
      ),
    ).toBeTruthy();
    expect(mocks.getOrCreateDefaultProject).toHaveBeenCalledTimes(1);
    expect(mocks.listRegisteredSkills).toHaveBeenCalledWith({
      workspaceRoot: "/Users/demo/Lime/default-workspace",
    });
    expect(mocks.listWorkspaceSkillBindings).toHaveBeenCalledWith({
      workspaceRoot: "/Users/demo/Lime/default-workspace",
      caller: "assistant",
      workbench: true,
    });
  });

  it("内置页点击详情应读取并展示对应 SKILL.md", async () => {
    const { container } = renderPage();

    act(() => {
      findButton(container, "内置")?.click();
    });

    const row = findLocalSkillRow(container, "aspnet-core");
    expect(row).toBeTruthy();

    await act(async () => {
      findButtonIn(row!, "详情")?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.inspectLocalSkillDetail).toHaveBeenCalledWith(
      "aspnet-core",
      "lime",
    );
    expect(
      container.querySelector('[data-testid="skills-installed-detail"]'),
    ).toBeTruthy();
    expect(document.body.textContent).toContain("Detail for aspnet-core");
    expect(container.querySelector("strong")?.textContent).toBe("aspnet-core");
    expect(container.querySelector("code")?.textContent).toBe("SKILL.md");
    expect(container.querySelector("table")?.textContent).toContain("Ready");
  });

  it("用户安装页点击详情应读取并展示对应 SKILL.md", async () => {
    const { container } = renderPage();

    act(() => {
      findButton(container, "用户安装")?.click();
    });

    const row = findLocalSkillRow(container, "writer");
    expect(row).toBeTruthy();

    await act(async () => {
      findButtonIn(row!, "详情")?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.inspectLocalSkillDetail).toHaveBeenCalledWith(
      "writer",
      "lime",
    );
    expect(
      container.querySelector('[data-testid="skills-installed-detail"]'),
    ).toBeTruthy();
    expect(document.body.textContent).toContain("Detail for writer");
    expect(container.querySelector("strong")?.textContent).toBe("writer");
    expect(container.querySelector("code")?.textContent).toBe("SKILL.md");
    expect(container.querySelector("table")?.textContent).toContain("Ready");
  });

  it("用户安装详情应展示完整文件树并支持点击文件预览", async () => {
    mocks.inspectLocalSkillDetail.mockImplementation((directory: string) =>
      Promise.resolve({
        directory,
        inspection: {
          content: "# Writer\n\nMain guide",
          metadata: {},
          allowedTools: [],
          resourceSummary: {
            hasScripts: false,
            hasReferences: true,
            hasAssets: false,
          },
          standardCompliance: {
            isStandard: true,
            validationErrors: [],
            deprecatedFields: [],
          },
        },
        files: [
          {
            path: "SKILL.md",
            isDirectory: false,
            size: 20,
            content: "# Writer\n\nMain guide",
          },
          { path: "engines", isDirectory: true, size: 0 },
          {
            path: "engines/e01-pitch-deck.md",
            isDirectory: false,
            size: 28,
            content: "# Pitch Deck\n\nSlide flow",
          },
          {
            path: "engines/e02-work-report.md",
            isDirectory: false,
            size: 30,
            content: "# Work Report\n\nStatus flow",
          },
          { path: "shared", isDirectory: true, size: 0 },
          {
            path: "shared/storytelling-framework.md",
            isDirectory: false,
            size: 42,
            content: "# Storytelling Framework\n\nNarrative hooks",
          },
        ],
      }),
    );

    const { container } = renderPage();

    act(() => {
      findButton(container, "用户安装")?.click();
    });

    const row = findLocalSkillRow(container, "writer");
    await act(async () => {
      findButtonIn(row!, "详情")?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    const detail = container.querySelector(
      '[data-testid="skills-installed-detail"]',
    ) as HTMLElement | null;
    expect(detail?.textContent).toContain("e01-pitch-deck.md");
    expect(detail?.textContent).toContain("e02-work-report.md");
    expect(detail?.textContent).toContain("storytelling-framework.md");

    await act(async () => {
      findButtonIn(detail!, "storytelling-framework.md")?.click();
      await Promise.resolve();
    });

    expect(detail?.textContent).toContain("Narrative hooks");
  });
});
