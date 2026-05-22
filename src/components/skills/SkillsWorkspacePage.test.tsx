import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Skill } from "@/lib/api/skills";
import type {
  SkillMarketplaceBundle,
  SkillMarketplaceItem,
} from "@/lib/api/officialSkillMarketplace";
import type {
  ServiceSkillGroup,
  ServiceSkillHomeItem,
} from "@/components/agent/chat/service-skills/types";
import { changeLimeLocale } from "@/i18n/createI18n";
import type { SkillsPageParams } from "@/types/page";
import { SkillsWorkspacePage } from "./SkillsWorkspacePage";

const mocks = vi.hoisted(() => ({
  refreshServiceSkills: vi.fn(),
  refreshOfficialMarketplace: vi.fn(),
  recordServiceSkillUsage: vi.fn(),
  refreshLocalSkills: vi.fn(),
  uninstallLocalSkill: vi.fn(),
  installOfficialMarketplaceSkill: vi.fn(),
  getOfficialSkillMarketplaceBundle: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  openDialog: vi.fn(),
  saveDialog: vi.fn(),
  createSkillScaffold: vi.fn(),
  importLocalSkill: vi.fn(),
  inspectLocalSkill: vi.fn(),
  inspectLocalSkillDetail: vi.fn(),
  revealLocalSkill: vi.fn(),
  renameLocalSkill: vi.fn(),
  replaceLocalSkillPackage: vi.fn(),
  exportLocalSkillPackage: vi.fn(),
  inspectLocalSkillPackage: vi.fn(),
  installLocalSkillPackage: vi.fn(),
  serviceSkills: [] as ServiceSkillHomeItem[],
  officialMarketplaceSkills: [] as SkillMarketplaceItem[],
  officialMarketplaceError: null as string | null,
  officialMarketplaceLoading: false,
  skillGroups: [] as ServiceSkillGroup[],
  localSkills: [] as Skill[],
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: (...args: unknown[]) => mocks.openDialog(...args),
  save: (...args: unknown[]) => mocks.saveDialog(...args),
}));

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => mocks.toastSuccess(...args),
    error: (...args: unknown[]) => mocks.toastError(...args),
    info: vi.fn(),
    loading: vi.fn(() => "toast-id"),
  },
}));

vi.mock("@/components/agent/chat/service-skills/useServiceSkills", () => ({
  useServiceSkills: () => ({
    skills: mocks.serviceSkills,
    groups: mocks.skillGroups,
    catalogMeta: {
      tenantId: "tenant-demo",
      version: "catalog-v2",
      syncedAt: "2026-03-29T08:00:00Z",
      itemCount: mocks.serviceSkills.length,
      groupCount: mocks.skillGroups.length,
      sourceLabel: "租户技能目录",
      isSeeded: false,
    },
    isLoading: false,
    error: null,
    refresh: mocks.refreshServiceSkills,
    recordUsage: mocks.recordServiceSkillUsage,
  }),
}));

vi.mock("@/hooks/useOfficialSkillMarketplace", () => ({
  useOfficialSkillMarketplace: () => ({
    skills: mocks.officialMarketplaceSkills,
    isLoading: mocks.officialMarketplaceLoading,
    error: mocks.officialMarketplaceError,
    refresh: mocks.refreshOfficialMarketplace,
  }),
}));

vi.mock("@/hooks/useSkills", () => ({
  useSkills: () => ({
    skills: mocks.localSkills,
    repos: [],
    loading: false,
    remoteLoading: false,
    error: null,
    refresh: mocks.refreshLocalSkills,
    install: vi.fn(),
    uninstall: mocks.uninstallLocalSkill,
    addRepo: vi.fn(),
    removeRepo: vi.fn(),
  }),
}));

vi.mock("@/lib/api/skills", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/skills")>();
  return {
    ...actual,
    skillsApi: {
      ...actual.skillsApi,
      createSkillScaffold: (...args: unknown[]) =>
        mocks.createSkillScaffold(...args),
      importLocalSkill: (...args: unknown[]) => mocks.importLocalSkill(...args),
      inspectLocalSkill: (...args: unknown[]) =>
        mocks.inspectLocalSkill(...args),
      inspectLocalSkillDetail: (...args: unknown[]) =>
        mocks.inspectLocalSkillDetail(...args),
      revealLocalSkill: (...args: unknown[]) =>
        mocks.revealLocalSkill(...args),
      renameLocalSkill: (...args: unknown[]) =>
        mocks.renameLocalSkill(...args),
      replaceLocalSkillPackage: (...args: unknown[]) =>
        mocks.replaceLocalSkillPackage(...args),
      exportLocalSkillPackage: (...args: unknown[]) =>
        mocks.exportLocalSkillPackage(...args),
      inspectLocalSkillPackage: (...args: unknown[]) =>
        mocks.inspectLocalSkillPackage(...args),
      installLocalSkillPackage: (...args: unknown[]) =>
        mocks.installLocalSkillPackage(...args),
    },
  };
});

vi.mock("@/lib/api/officialSkillMarketplace", () => ({
  installOfficialMarketplaceSkill: (...args: unknown[]) =>
    mocks.installOfficialMarketplaceSkill(...args),
  getOfficialSkillMarketplaceBundle: (...args: unknown[]) =>
    mocks.getOfficialSkillMarketplaceBundle(...args),
}));

vi.mock("./SkillScaffoldDialog", () => ({
  SkillScaffoldDialog: () => null,
}));

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ open, children }: { open: boolean; children: ReactNode }) =>
    open ? <div>{children}</div> : null,
  DialogContent: ({
    children,
    className,
  }: {
    children: ReactNode;
    className?: string;
  }) => <div className={className}>{children}</div>,
  DialogHeader: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DialogFooter: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DialogTitle: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
}));

function createDefaultLocalSkills(): Skill[] {
  return [
    {
      key: "builtin:aspnet-core",
      name: "ASP.NET Core",
      description: "构建 ASP.NET Core Web 应用。",
      directory: "aspnet-core",
      installed: true,
      sourceKind: "builtin",
      catalogSource: "builtin",
    },
    {
      key: "local:writer",
      name: "写作助手",
      description: "本地补充技能",
      directory: "writer",
      installed: true,
      sourceKind: "other",
      catalogSource: "user",
      metadata: {
        lime_when_to_use: "当你需要复用本地写作 Skill 时使用。",
        lime_argument_hint: "主题、受众与语气要求",
      },
    },
  ] as Skill[];
}

function createDefaultServiceSkills(): ServiceSkillHomeItem[] {
  return [
    {
      id: "service-skill-research",
      title: "深度研究",
      summary: "综合多来源信息并给出归纳后的结论。",
      category: "调研",
      outputHint: "研究摘要",
      source: "cloud_catalog",
      runnerType: "instant",
      defaultExecutorBinding: "agent_turn",
      executionLocation: "client_default",
      slotSchema: [],
      version: "2026-03-29",
      badge: "官方",
      recentUsedAt: null,
      isRecent: false,
      runnerLabel: "立即开始",
      runnerTone: "sky",
      runnerDescription: "会先给出这一轮结果，接着就能继续改。",
      actionLabel: "开始这一步",
      automationStatus: null,
      groupKey: "general",
    },
    {
      id: "site-skill:github/search",
      title: "GitHub 仓库检索",
      summary: "围绕关键词采集 GitHub 仓库搜索结果。",
      category: "GitHub",
      outputHint: "仓库列表",
      source: "cloud_catalog",
      runnerType: "instant",
      defaultExecutorBinding: "browser_assist",
      executionLocation: "client_default",
      slotSchema: [],
      version: "2026-03-29",
      badge: "官方",
      recentUsedAt: null,
      isRecent: false,
      runnerLabel: "接着浏览器继续",
      runnerTone: "emerald",
      runnerDescription: "复用浏览器登录态执行。",
      actionLabel: "补齐这一步",
      automationStatus: null,
      groupKey: "github",
    },
  ];
}

function createDefaultMarketplaceSkills(): SkillMarketplaceItem[] {
  return [
    {
      id: "official:analysis",
      name: "analysis",
      aliases: ["data-analysis"],
      title: "数据分析",
      summary: "整理数据、提炼结论，并输出可继续追问的分析摘要。",
      category: "数据",
      outputHint: "分析摘要",
      version: "2026.05",
      sort: 10,
      icon: {
        kind: "svg",
        svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect width="48" height="48" rx="12" fill="#e0f2fe"/></svg>',
      },
      cover: {
        kind: "svg",
        svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180"><rect width="320" height="180" rx="20" fill="#f0f9ff"/></svg>',
      },
      bundle: {
        name: "analysis",
        description: "标准 AgentSkills 数据分析包。",
        resourceSummary: {
          hasReferences: true,
          hasScripts: false,
          hasAssets: false,
        },
        standardCompliance: {
          isStandard: true,
          validationErrors: [],
          deprecatedFields: [],
        },
      },
    },
  ];
}

function createDefaultMarketplaceBundle(): SkillMarketplaceBundle {
  return {
    manifestVersion: "agentskills.v1",
    name: "analysis",
    aliases: ["data-analysis"],
    version: "2026.05",
    contentHash: "sha256:bundle",
    fileCount: 1,
    files: [
      {
        path: "SKILL.md",
        content:
          "---\nname: Analysis\n---\n# Deep Research\n\n## Core Purpose\n\nDeliver **citation-backed** reports with `SKILL.md` guidance.\n\n> CRITICAL - Phase 0 is mandatory.\n\n## Decision Tree\n\n| Step | Output |\n| --- | --- |\n| Phase 0 | Scope |\n\n```\nRequest received\n```",
      },
    ],
  };
}

function createDefaultSkillGroups(): ServiceSkillGroup[] {
  return [
    {
      key: "github",
      title: "GitHub",
      summary: "围绕仓库与 Issue 的只读研究技能。",
      sort: 10,
      itemCount: 1,
    },
    {
      key: "general",
      title: "通用技能",
      summary: "不依赖站点登录态的创作技能。",
      sort: 90,
      itemCount: 1,
    },
  ];
}

interface RenderResult {
  container: HTMLDivElement;
  root: Root;
}

const mountedRoots: RenderResult[] = [];

function renderPage(pageParams?: SkillsPageParams) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const onNavigate = vi.fn<(page: string, params?: unknown) => void>();

  act(() => {
    root.render(
      <SkillsWorkspacePage onNavigate={onNavigate} pageParams={pageParams} />,
    );
  });

  mountedRoots.push({ container, root });
  return { container, onNavigate };
}

function findButton(container: HTMLElement, label: string) {
  return Array.from(container.querySelectorAll("button")).find((button) =>
    button.textContent?.trim().includes(label),
  ) as HTMLButtonElement | undefined;
}

function findMarketplaceCard(container: HTMLElement, title: string) {
  return Array.from(
    container.querySelectorAll('[data-testid="skills-marketplace-card"]'),
  ).find((card) => card.textContent?.includes(title)) as
    | HTMLElement
    | undefined;
}

function findButtonIn(container: HTMLElement, label: string) {
  return Array.from(container.querySelectorAll("button")).find((button) =>
    button.textContent?.trim().includes(label),
  ) as HTMLButtonElement | undefined;
}

function findMenuItem(container: HTMLElement, label: string) {
  return Array.from(container.querySelectorAll('[role="menuitem"]')).find(
    (item) => item.textContent?.trim().includes(label),
  ) as HTMLElement | undefined;
}

function findLocalSkillRow(container: HTMLElement, directory: string) {
  return Array.from(
    container.querySelectorAll('[data-testid="skills-local-skill-row"]'),
  ).find((row) => row.getAttribute("data-skill-directory") === directory) as
    | HTMLElement
    | undefined;
}

function openLocalSkillMenu(container: HTMLElement, directory = "writer") {
  const row = findLocalSkillRow(container, directory);
  expect(row).toBeTruthy();
  const skillName = directory === "writer" ? "写作助手" : directory;
  const button = Array.from(row?.querySelectorAll("button") ?? []).find(
    (candidate) =>
      candidate.getAttribute("aria-label") === `更多操作：${skillName}`,
  ) as HTMLButtonElement | undefined;
  expect(button).toBeTruthy();
  act(() => {
    button?.click();
  });
  return row!;
}

function getLatestNavigationPayload(onNavigate: ReturnType<typeof vi.fn>) {
  return onNavigate.mock.calls.at(-1)?.[1] as
    | Record<string, unknown>
    | undefined;
}

describe("SkillsWorkspacePage", () => {
  beforeEach(async () => {
    await changeLimeLocale("zh-CN");
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT?: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;

    mocks.serviceSkills = createDefaultServiceSkills();
    mocks.officialMarketplaceSkills = createDefaultMarketplaceSkills();
    mocks.officialMarketplaceError = null;
    mocks.officialMarketplaceLoading = false;
    mocks.skillGroups = createDefaultSkillGroups();
    mocks.localSkills = createDefaultLocalSkills();
    mocks.refreshServiceSkills.mockReset();
    mocks.refreshServiceSkills.mockResolvedValue(undefined);
    mocks.refreshOfficialMarketplace.mockReset();
    mocks.refreshOfficialMarketplace.mockResolvedValue(undefined);
    mocks.recordServiceSkillUsage.mockReset();
    mocks.refreshLocalSkills.mockReset();
    mocks.refreshLocalSkills.mockResolvedValue(undefined);
    mocks.uninstallLocalSkill.mockReset();
    mocks.uninstallLocalSkill.mockResolvedValue(undefined);
    mocks.installOfficialMarketplaceSkill.mockReset();
    mocks.installOfficialMarketplaceSkill.mockResolvedValue({
      directory: "analysis",
      inspection: {
        content: "# Analysis",
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
    });
    mocks.getOfficialSkillMarketplaceBundle.mockReset();
    mocks.getOfficialSkillMarketplaceBundle.mockResolvedValue(
      createDefaultMarketplaceBundle(),
    );
    mocks.toastSuccess.mockReset();
    mocks.toastError.mockReset();
    mocks.openDialog.mockReset();
    mocks.openDialog.mockResolvedValue(null);
    mocks.saveDialog.mockReset();
    mocks.saveDialog.mockResolvedValue(null);
    mocks.createSkillScaffold.mockReset();
    mocks.importLocalSkill.mockReset();
    mocks.inspectLocalSkill.mockReset();
    mocks.inspectLocalSkill.mockImplementation((directory: string) =>
      Promise.resolve({
        content: `---\nname: ${directory}\n---\n\n# ${directory}\n\nDetail for **${directory}** with \`SKILL.md\`.\n\n| Section | Status |\n| --- | --- |\n| Preview | Ready |`,
        metadata: {},
        allowedTools: [],
        resourceSummary: {
          hasScripts: false,
          hasReferences: false,
          hasAssets: false,
        },
        standardCompliance: {
          isStandard: true,
          validationErrors: [],
          deprecatedFields: [],
        },
      }),
    );
    mocks.inspectLocalSkillDetail.mockReset();
    mocks.inspectLocalSkillDetail.mockImplementation((directory: string) =>
      Promise.resolve({
        directory,
        inspection: {
          content: `---\nname: ${directory}\n---\n\n# ${directory}\n\nDetail for **${directory}** with \`SKILL.md\`.\n\n| Section | Status |\n| --- | --- |\n| Preview | Ready |`,
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
            size: 128,
            content: `# ${directory}\n\nDetail for **${directory}** with \`SKILL.md\`.\n\n| Section | Status |\n| --- | --- |\n| Preview | Ready |`,
          },
          { path: "references", isDirectory: true, size: 0 },
          {
            path: "references/guide.md",
            isDirectory: false,
            size: 48,
            content: "# Reference Guide\n\nFile tree detail.",
          },
        ],
      }),
    );
    mocks.revealLocalSkill.mockReset();
    mocks.revealLocalSkill.mockResolvedValue(true);
    mocks.renameLocalSkill.mockReset();
    mocks.renameLocalSkill.mockImplementation(
      (_directory: string, newDirectory: string) =>
        Promise.resolve({ directory: newDirectory }),
    );
    mocks.replaceLocalSkillPackage.mockReset();
    mocks.replaceLocalSkillPackage.mockResolvedValue({
      directory: "writer",
      inspection: {
        content: "# Replaced Writer",
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
    });
    mocks.exportLocalSkillPackage.mockReset();
    mocks.exportLocalSkillPackage.mockResolvedValue({
      directory: "writer",
      outputPath: "/Users/demo/writer.skills",
      fileCount: 2,
      bytesWritten: 512,
    });
    mocks.inspectLocalSkillPackage.mockReset();
    mocks.inspectLocalSkillPackage.mockResolvedValue({
      directory: "article-typesetting-master",
      inspection: {
        content: "---\nname: Article Typesetting\n---\n\n# Article Typesetting",
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
        { path: "SKILL.md", isDirectory: false, size: 128 },
        { path: "references", isDirectory: true, size: 0 },
      ],
    });
    mocks.installLocalSkillPackage.mockReset();
    mocks.installLocalSkillPackage.mockResolvedValue({
      directory: "article-typesetting-master",
      inspection: {
        content: "# Article Typesetting",
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
    });
    window.localStorage.clear();
  });

  afterEach(() => {
    while (mountedRoots.length > 0) {
      const mounted = mountedRoots.pop();
      if (!mounted) break;
      act(() => {
        mounted.root.unmount();
      });
      mounted.container.remove();
    }
    window.localStorage.clear();
    vi.clearAllMocks();
  });

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
    act(() => {
      openLocalSkillMenu(container);
      findButton(container, "在聊天中试用")?.click();
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
    expect(container.querySelector("strong")?.textContent).toBe(
      "aspnet-core",
    );
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

  it("用户安装页点击卸载只卸载技能，不跳转会话", async () => {
    const { container, onNavigate } = renderPage();

    act(() => {
      findButton(container, "用户安装")?.click();
    });
    await act(async () => {
      openLocalSkillMenu(container);
      findButton(container, "卸载")?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.uninstallLocalSkill).toHaveBeenCalledWith("writer");
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("用户安装页点击导出应打包为 .skills 安装包", async () => {
    mocks.saveDialog.mockResolvedValue("/Users/demo/writer");
    const { container } = renderPage();

    act(() => {
      findButton(container, "用户安装")?.click();
    });
    await act(async () => {
      openLocalSkillMenu(container);
      findButton(container, "导出")?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.saveDialog).toHaveBeenCalledWith({
      title: "导出 Skill 安装包",
      defaultPath: "writer.skills",
      filters: [
        {
          name: "Skill 安装包",
          extensions: ["skills", "skill"],
        },
      ],
    });
    expect(mocks.exportLocalSkillPackage).toHaveBeenCalledWith(
      "writer",
      "/Users/demo/writer.skills",
      "lime",
    );
    expect(mocks.toastSuccess).toHaveBeenCalledWith("已导出「写作助手」安装包");
  });

  it("用户安装页三点菜单应支持重命名、替换和显示文件夹", async () => {
    const promptSpy = vi
      .spyOn(window, "prompt")
      .mockReturnValue("writer-renamed");
    mocks.openDialog.mockResolvedValue("/Users/demo/writer.skills");
    const { container, onNavigate } = renderPage();

    act(() => {
      findButton(container, "用户安装")?.click();
    });

    await act(async () => {
      openLocalSkillMenu(container);
      findButton(container, "重命名")?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(promptSpy).toHaveBeenCalledWith(
      "输入「写作助手」的新目录名",
      "writer",
    );
    expect(mocks.renameLocalSkill).toHaveBeenCalledWith(
      "writer",
      "writer-renamed",
      "lime",
    );
    expect(mocks.refreshLocalSkills).toHaveBeenCalled();

    await act(async () => {
      openLocalSkillMenu(container);
      findButton(container, "替换")?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.openDialog).toHaveBeenLastCalledWith({
      directory: false,
      multiple: false,
      title: "选择用于替换「写作助手」的 .skill 或 .skills 安装包",
      filters: [
        {
          name: "Skill 安装包",
          extensions: ["skills", "skill"],
        },
      ],
    });
    expect(mocks.replaceLocalSkillPackage).toHaveBeenCalledWith(
      "writer",
      "/Users/demo/writer.skills",
      "lime",
    );

    await act(async () => {
      openLocalSkillMenu(container);
      findButton(container, "在文件夹中显示")?.click();
      await Promise.resolve();
    });

    expect(mocks.revealLocalSkill).toHaveBeenCalledWith("writer", "lime");
    expect(onNavigate).not.toHaveBeenCalled();
    promptSpy.mockRestore();
  });

  it("顶部安装技能应选择 .skill/.skills 安装包并打开预览", async () => {
    mocks.openDialog.mockResolvedValue(
      "/Users/demo/article-typesetting-master.skills",
    );
    const { container } = renderPage();

    await act(async () => {
      findButton(container, "安装技能")?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.openDialog).toHaveBeenCalledWith({
      directory: false,
      multiple: false,
      title: "选择 .skill 或 .skills 安装包",
      filters: [
        {
          name: "Skill 安装包",
          extensions: ["skills", "skill"],
        },
      ],
    });
    expect(mocks.importLocalSkill).not.toHaveBeenCalled();
    expect(mocks.inspectLocalSkillPackage).toHaveBeenCalledWith(
      "/Users/demo/article-typesetting-master.skills",
      "lime",
    );
    expect(container.textContent).toContain(
      "把「article-typesetting-master」添加到你的技能库？",
    );
    expect(container.textContent).toContain("article-typesetting-master.skills");
  });

  it("顶部管理菜单应支持浏览、创建和上传技能", async () => {
    mocks.openDialog.mockResolvedValue(
      "/Users/demo/article-typesetting-master.skill",
    );
    const { container } = renderPage({ initialView: "installed" });

    expect(
      container.querySelector('[data-testid="skills-installed-view"]'),
    ).toBeTruthy();

    act(() => {
      findButton(container, "管理")?.click();
    });
    expect(container.textContent).toContain("浏览技能");
    expect(container.textContent).toContain("创建技能");
    expect(container.textContent).toContain("通过 Lime 创建");
    expect(container.textContent).toContain("编写技能说明");
    expect(container.textContent).toContain("上传技能");

    act(() => {
      findButton(container, "浏览技能")?.click();
    });
    expect(
      container.querySelector('[data-testid="skills-store-view"]'),
    ).toBeTruthy();

    act(() => {
      findButton(container, "管理")?.click();
    });
    await act(async () => {
      findButton(container, "上传技能")?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.openDialog).toHaveBeenCalledWith({
      directory: false,
      multiple: false,
      title: "选择 .skill 或 .skills 安装包",
      filters: [
        {
          name: "Skill 安装包",
          extensions: ["skills", "skill"],
        },
      ],
    });
    expect(mocks.inspectLocalSkillPackage).toHaveBeenCalledWith(
      "/Users/demo/article-typesetting-master.skill",
      "lime",
    );
  });

  it("技能广场点击未安装官方技能应安装标准包并刷新本地列表", async () => {
    const { container } = renderPage();
    const card = findMarketplaceCard(container, "数据分析");

    await act(async () => {
      findButtonIn(card!, "安装")?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.installOfficialMarketplaceSkill).toHaveBeenCalledWith(
      "analysis",
      "lime",
    );
    expect(mocks.refreshLocalSkills).toHaveBeenCalled();
    expect(mocks.toastSuccess).toHaveBeenCalledWith("已安装「数据分析」");
  });

  it("技能广场点击详情应打开当前技能的 SKILL.md 内容", async () => {
    const { container } = renderPage();
    const card = findMarketplaceCard(container, "数据分析");

    expect(
      container.querySelector('[data-testid="skills-marketplace-detail"]'),
    ).toBeNull();

    await act(async () => {
      findButtonIn(card!, "详情")?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    const detail = container.querySelector(
      '[data-testid="skills-marketplace-detail"]',
    );
    expect(detail).toBeTruthy();
    expect(mocks.getOfficialSkillMarketplaceBundle).toHaveBeenCalledWith(
      "analysis",
    );
    expect(detail?.textContent).toContain("数据分析");
    expect(detail?.textContent).toContain("以下内容来自该技能的 SKILL.md 原文");
    expect(detail?.textContent).toContain("Deep Research");
    expect(detail?.textContent).toContain("Core Purpose");
    expect(detail?.textContent).toContain("Decision Tree");
    expect(detail?.querySelector("strong")?.textContent).toBe(
      "citation-backed",
    );
    expect(detail?.querySelector("code")?.textContent).toBe("SKILL.md");
    expect(detail?.querySelector("blockquote")?.textContent).toContain(
      "CRITICAL - Phase 0 is mandatory.",
    );
    expect(detail?.querySelector("table")?.textContent).toContain("Scope");
    expect(detail?.querySelector("pre")?.textContent).toContain(
      "Request received",
    );
  });

  it("已安装的官方技能点击使用应回首页输入框预选本地 Skill", () => {
    mocks.localSkills = [
      ...createDefaultLocalSkills(),
      {
        key: "local:analysis",
        name: "数据分析",
        description: "已安装的数据分析技能",
        directory: "analysis",
        installed: true,
        sourceKind: "other",
        catalogSource: "user",
      },
    ] as Skill[];
    const { container, onNavigate } = renderPage();
    const card = findMarketplaceCard(container, "数据分析");

    act(() => {
      findButtonIn(card!, "使用")?.click();
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
            skillKey: "local:analysis",
            skillName: "数据分析",
          },
          requestKey: expect.any(Number),
        },
      }),
    );
  });

  it("已安装的官方技能点击卸载应走结构化卸载", async () => {
    mocks.localSkills = [
      ...createDefaultLocalSkills(),
      {
        key: "local:analysis",
        name: "数据分析",
        description: "已安装的数据分析技能",
        directory: "analysis",
        installed: true,
        sourceKind: "other",
        catalogSource: "user",
      },
    ] as Skill[];
    const { container, onNavigate } = renderPage();
    const card = findMarketplaceCard(container, "数据分析");

    await act(async () => {
      findButtonIn(card!, "卸载")?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.uninstallLocalSkill).toHaveBeenCalledWith("analysis");
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("官方技能市场不可用时应回退显示本地可用技能", () => {
    mocks.officialMarketplaceSkills = [];
    mocks.officialMarketplaceError = "network unavailable";
    const { container, onNavigate } = renderPage();
    const card = findMarketplaceCard(container, "深度研究");

    expect(container.textContent).toContain(
      "官方技能市场暂时不可用，已先显示本地可用技能。",
    );
    expect(card).toBeTruthy();

    act(() => {
      findButtonIn(card!, "打开")?.click();
    });

    expect(onNavigate).toHaveBeenCalledWith(
      "agent",
      expect.objectContaining({
        agentEntry: "new-task",
        theme: "general",
        initialPendingServiceSkillLaunch: expect.objectContaining({
          skillId: "service-skill-research",
          requestKey: expect.any(Number),
        }),
      }),
    );
  });

  it("收到 .skill 安装包页面参数时应打开安装预览并在安装后刷新本地 Skills", async () => {
    const { container } = renderPage({
      initialView: "installed",
      initialSkillPackagePath: "/Users/demo/article-typesetting-master.skill",
      initialSkillPackageName: "article-typesetting-master.skill",
      initialSkillPackageRequestKey: 42,
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.inspectLocalSkillPackage).toHaveBeenCalledWith(
      "/Users/demo/article-typesetting-master.skill",
      "lime",
    );
    expect(container.textContent).toContain(
      "把「article-typesetting-master」添加到你的技能库？",
    );
    expect(container.textContent).toContain("安装包内容");
    expect(container.textContent).toContain("SKILL.md");
    expect(container.textContent).toContain("Article Typesetting");
    expect(
      container.querySelector('[data-testid="skills-markdown-preview"]'),
    ).toBeTruthy();
    expect(
      container.querySelector('[data-testid="skills-installed-view"]'),
    ).toBeTruthy();

    await act(async () => {
      findButton(container, "添加到技能库")?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.installLocalSkillPackage).toHaveBeenCalledWith(
      "/Users/demo/article-typesetting-master.skill",
      "lime",
    );
    expect(mocks.refreshLocalSkills).toHaveBeenCalled();
    expect(mocks.toastSuccess).toHaveBeenCalledWith(
      "已安装 Skill：article-typesetting-master",
    );
  });
});
