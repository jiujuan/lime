import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Skill } from "@/lib/api/skills";
import type {
  ServiceSkillGroup,
  ServiceSkillHomeItem,
} from "@/components/agent/chat/service-skills/types";
import { changeLimeLocale } from "@/i18n/createI18n";
import type { SkillsPageParams } from "@/types/page";
import { SkillsWorkspacePage } from "./SkillsWorkspacePage";

const mocks = vi.hoisted(() => ({
  refreshServiceSkills: vi.fn(),
  recordServiceSkillUsage: vi.fn(),
  refreshLocalSkills: vi.fn(),
  uninstallLocalSkill: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  openDialog: vi.fn(),
  createSkillScaffold: vi.fn(),
  importLocalSkill: vi.fn(),
  serviceSkills: [] as ServiceSkillHomeItem[],
  skillGroups: [] as ServiceSkillGroup[],
  localSkills: [] as Skill[],
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: (...args: unknown[]) => mocks.openDialog(...args),
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
    },
  };
});

vi.mock("./SkillScaffoldDialog", () => ({
  SkillScaffoldDialog: () => null,
}));

vi.mock("@/components/agent/chat/components/CuratedTaskLauncherDialog", () => ({
  CuratedTaskLauncherDialog: () => null,
}));

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ open, children }: { open: boolean; children: ReactNode }) =>
    open ? <div>{children}</div> : null,
  DialogContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
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
    mocks.skillGroups = createDefaultSkillGroups();
    mocks.localSkills = createDefaultLocalSkills();
    mocks.refreshServiceSkills.mockReset();
    mocks.refreshServiceSkills.mockResolvedValue(undefined);
    mocks.recordServiceSkillUsage.mockReset();
    mocks.refreshLocalSkills.mockReset();
    mocks.refreshLocalSkills.mockResolvedValue(undefined);
    mocks.uninstallLocalSkill.mockReset();
    mocks.uninstallLocalSkill.mockResolvedValue(undefined);
    mocks.toastSuccess.mockReset();
    mocks.toastError.mockReset();
    mocks.openDialog.mockReset();
    mocks.openDialog.mockResolvedValue(null);
    mocks.createSkillScaffold.mockReset();
    mocks.importLocalSkill.mockReset();
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
    expect(container.textContent).toContain("深度研究");
    expect(container.textContent).not.toContain("写作助手");
    expect(container.textContent).not.toContain("卸载");

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
    expect(container.textContent).toContain("使用");
    expect(container.textContent).toContain("卸载");
    expect(container.textContent).not.toContain("ASP.NET Core");
  });

  it("用户安装页点击使用应回首页输入框预选 @ 技能，不显示入口横幅", () => {
    const { container, onNavigate } = renderPage();

    act(() => {
      findButton(container, "用户安装")?.click();
    });
    act(() => {
      findButton(container, "使用")?.click();
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

  it("用户安装页点击卸载只卸载技能，不跳转会话", async () => {
    const { container, onNavigate } = renderPage();

    act(() => {
      findButton(container, "用户安装")?.click();
    });
    await act(async () => {
      findButton(container, "卸载")?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.uninstallLocalSkill).toHaveBeenCalledWith("writer");
    expect(onNavigate).not.toHaveBeenCalled();
  });
});
