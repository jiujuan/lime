import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Project } from "@/types/project";
import { ProjectSelector } from "./ProjectSelector";

const {
  mockUseProjects,
  mockToastError,
  mockToastSuccess,
  mockGetProject,
  mockGetDefaultProject,
  mockGetProjectByRootPath,
  mockRevealPathInFinder,
  mockOpenDialog,
} = vi.hoisted(() => ({
  mockUseProjects: vi.fn(),
  mockToastError: vi.fn(),
  mockToastSuccess: vi.fn(),
  mockGetProject: vi.fn(),
  mockGetDefaultProject: vi.fn(),
  mockGetProjectByRootPath: vi.fn(),
  mockRevealPathInFinder: vi.fn(),
  mockOpenDialog: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: mockToastSuccess,
    error: mockToastError,
  },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (
      key: string,
      options?: {
        count?: number;
        defaultValue?: string;
        [key: string]: unknown;
      },
    ) => {
      const translations: Record<string, string> = {
        "common.cancel": "取消",
        "common.delete": "删除",
        "common.loading": "加载中...",
        "common.save": "保存",
        "common.projectSelector.action.createProject": "新建项目",
        "common.projectSelector.action.createWorkspace": "新建工作区",
        "common.projectSelector.action.deleting": "移除中...",
        "common.projectSelector.action.openExistingFolder": "打开现有文件夹",
        "common.projectSelector.action.remove": "移除",
        "common.projectSelector.action.removeEntity": "移除{{entity}}",
        "common.projectSelector.action.revealPath.default": "显示位置",
        "common.projectSelector.action.revealPath.linux": "在文件管理器中显示",
        "common.projectSelector.action.revealPath.macos": "在 Finder 中显示",
        "common.projectSelector.action.revealPath.unknown": "显示位置",
        "common.projectSelector.action.revealPath.windows":
          "在文件资源管理器中显示",
        "common.projectSelector.action.rename": "重命名",
        "common.projectSelector.action.saving": "保存中...",
        "common.projectSelector.action.viewContents": "查看内容",
        "common.projectSelector.badge.default": "默认",
        "common.projectSelector.current.label": "当前{{entity}}：",
        "common.projectSelector.empty": "未找到匹配项目",
        "common.projectSelector.entity.project": "项目",
        "common.projectSelector.entity.workspace": "工作区",
        "common.projectSelector.header.count": "{{count}} 个{{entity}}",
        "common.projectSelector.header.description":
          "在这里切换、搜索和管理可见{{entity}}列表。",
        "common.projectSelector.header.title": "选择{{entity}}",
        "common.projectSelector.management.defaultLocked":
          "默认{{entity}}不可重命名或移除",
        "common.projectSelector.management.description.project":
          "当前只管理可见项目，不影响本地目录与已有文件。",
        "common.projectSelector.management.description.workspace":
          "当前只管理可见工作区，不影响本地目录与已有文件。",
        "common.projectSelector.management.title.project": "项目管理",
        "common.projectSelector.management.title.workspace": "工作区管理",
        "common.projectSelector.meta.default": "默认项目",
        "common.projectSelector.meta.pending": "待选择项目",
        "common.projectSelector.path.notSet": "未设置目录",
        "common.projectSelector.placeholder.project": "选择项目",
        "common.projectSelector.placeholder.workspace": "选择工作区",
        "common.projectSelector.remove.dangerDescription":
          "只移除 Lime 中的记录，不删除本地目录和已有文件。",
        "common.projectSelector.remove.dangerTitle": "本地文件会保留",
        "common.projectSelector.remove.description":
          "确定要移除{{entity}}{{name}}吗？",
        "common.projectSelector.remove.title": "移除{{entity}}",
        "common.projectSelector.rename.description":
          "更新{{entity}}名称，不会修改本地目录路径。",
        "common.projectSelector.rename.placeholder": "输入新的项目名称",
        "common.projectSelector.rename.title": "重命名{{entity}}",
        "common.projectSelector.search.placeholder": "搜索{{entity}}",
        "common.projectSelector.toast.created": "{{entity}}已创建",
        "common.projectSelector.toast.nameRequired": "{{entity}}名称不能为空",
        "common.projectSelector.toast.openExistingFolderFailed":
          "打开现有文件夹失败：{{message}}",
        "common.projectSelector.toast.pathMissing": "当前没有可打开的本地目录",
        "common.projectSelector.toast.removeFailed": "移除失败：{{message}}",
        "common.projectSelector.toast.removed":
          "{{entity}}已移除，本地目录未删除",
        "common.projectSelector.toast.revealPathFailed":
          "打开位置失败：{{message}}",
        "common.projectSelector.toast.renamed": "{{entity}}名称已更新",
        "common.projectSelector.toast.renameFailed": "重命名失败：{{message}}",
        "common.projectSelector.workspaceType.blog": "博客",
        "common.projectSelector.workspaceType.general": "通用",
        "common.projectSelector.workspaceType.persistent": "持久化",
        "common.projectSelector.workspaceType.temporary": "临时",
      };
      const template = options?.defaultValue ?? translations[key] ?? key;
      return template.replace(/{{(\w+)}}/g, (_, name: string) =>
        String(options?.[name] ?? ""),
      );
    },
  }),
}));

vi.mock("@/hooks/useProjects", () => ({
  useProjects: mockUseProjects,
}));

vi.mock("@/lib/api/fileSystem", () => ({
  revealPathInFinder: mockRevealPathInFinder,
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: mockOpenDialog,
}));

vi.mock("@/lib/api/project", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/api/project")>(
      "@/lib/api/project",
    );

  return {
    ...actual,
    getProject: mockGetProject,
    getDefaultProject: mockGetDefaultProject,
    getProjectByRootPath: mockGetProjectByRootPath,
  };
});

vi.mock("@/components/projects/CreateProjectDialog", () => ({
  CreateProjectDialog: ({
    open,
    defaultType,
    allowedTypes,
  }: {
    open: boolean;
    defaultType?: string;
    allowedTypes?: string[];
  }) =>
    open ? (
      <div
        data-testid="create-project-dialog"
        data-default-type={defaultType}
        data-allowed-types={(allowedTypes || []).join(",")}
      />
    ) : null,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    onClick,
    disabled,
    type = "button",
    ...rest
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    type?: "button" | "submit" | "reset";
    [key: string]: unknown;
  }) => (
    <button type={type} onClick={onClick} disabled={disabled} {...rest}>
      {children}
    </button>
  ),
}));

vi.mock("@/components/ui/input", () => ({
  Input: ({
    value,
    onChange,
    placeholder,
    ...rest
  }: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      {...rest}
    />
  ),
}));

vi.mock("@/components/ui/popover", () => ({
  Popover: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  PopoverContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock("@/components/ui/scroll-area", () => ({
  ScrollArea: ({
    children,
    ...props
  }: React.HTMLAttributes<HTMLDivElement> & {
    children: React.ReactNode;
  }) => <div {...props}>{children}</div>,
}));

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div>{children}</div> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogDescription: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogFooter: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogHeader: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogTitle: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

function createProject(overrides: Partial<Project>): Project {
  return {
    id: "project-id",
    name: "项目",
    workspaceType: "general",
    rootPath: "/tmp/project",
    isDefault: false,
    icon: undefined,
    color: undefined,
    isFavorite: false,
    isArchived: false,
    tags: [],
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

interface MountedHarness {
  container: HTMLDivElement;
  root: Root;
}

const mountedRoots: MountedHarness[] = [];

function createUseProjectsResult(overrides?: Record<string, unknown>) {
  return {
    projects: [],
    generalProjects: [],
    filteredProjects: [],
    defaultProject: null,
    loading: false,
    error: null,
    filter: {},
    setFilter: vi.fn(),
    refresh: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    rename: vi.fn(),
    remove: vi.fn(async () => true),
    getOrCreateDefault: vi.fn(async () =>
      createProject({
        id: "default",
        name: "默认项目",
        isDefault: true,
        workspaceType: "general",
      }),
    ),
    ...overrides,
  };
}

function renderProjectSelector(
  props?: Partial<React.ComponentProps<typeof ProjectSelector>>,
) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  const defaultProps: React.ComponentProps<typeof ProjectSelector> = {
    value: "default",
    onChange: vi.fn(),
    workspaceType: "general",
    enableManagement: true,
  };

  act(() => {
    root.render(<ProjectSelector {...defaultProps} {...props} />);
  });

  mountedRoots.push({ container, root });
  return container;
}

function findButton(
  container: HTMLElement,
  text: string,
): HTMLButtonElement | null {
  return (Array.from(container.querySelectorAll("button")).find((button) =>
    button.textContent?.includes(text),
  ) || null) as HTMLButtonElement | null;
}

async function flushAsync() {
  await act(async () => {
    await Promise.resolve();
  });
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  mockGetProject.mockResolvedValue(null);
  mockGetDefaultProject.mockResolvedValue(null);
  mockGetProjectByRootPath.mockResolvedValue(null);
  mockOpenDialog.mockResolvedValue(null);
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
  vi.clearAllMocks();
});

describe("ProjectSelector 组件", () => {
  it("默认项目在管理模式下不可重命名或移除", () => {
    const defaultProject = createProject({
      id: "default",
      name: "默认项目",
      isDefault: true,
      workspaceType: "general",
    });
    const generalProject = createProject({
      id: "general-1",
      name: "通用项目",
      workspaceType: "general",
    });

    mockUseProjects.mockReturnValue(
      createUseProjectsResult({
        projects: [defaultProject, generalProject],
        generalProjects: [defaultProject, generalProject],
        defaultProject,
      }),
    );

    const container = renderProjectSelector({
      value: defaultProject.id,
      workspaceType: "general",
      enableManagement: true,
    });

    expect(findButton(container, "重命名")?.disabled).toBe(true);
    expect(findButton(container, "移除")?.disabled).toBe(true);
    expect(container.textContent).toContain("默认项目不可重命名或移除");
  });

  it("移除当前项目后应回退到默认项目", async () => {
    const onChange = vi.fn();
    const remove = vi.fn(async () => true);
    const defaultProject = createProject({
      id: "default",
      name: "默认项目",
      isDefault: true,
      workspaceType: "general",
    });
    const generalProject = createProject({
      id: "general-1",
      name: "通用项目",
      workspaceType: "general",
    });

    mockUseProjects.mockReturnValue(
      createUseProjectsResult({
        projects: [defaultProject, generalProject],
        generalProjects: [defaultProject, generalProject],
        defaultProject,
        remove,
      }),
    );

    const container = renderProjectSelector({
      value: generalProject.id,
      workspaceType: "general",
      enableManagement: true,
      onChange,
    });

    act(() => {
      findButton(container, "移除")?.click();
    });
    await flushAsync();

    await act(async () => {
      findButton(container, "移除项目")?.click();
      await Promise.resolve();
    });
    await flushAsync();

    expect(remove).toHaveBeenCalledWith(generalProject.id);
    expect(onChange).toHaveBeenCalledWith(defaultProject.id);
    expect(mockToastSuccess).toHaveBeenCalledWith("项目已移除，本地目录未删除");
  });

  it("未启用管理模式时不显示管理操作区", () => {
    const defaultProject = createProject({
      id: "default",
      name: "默认项目",
      isDefault: true,
      workspaceType: "general",
    });

    mockUseProjects.mockReturnValue(
      createUseProjectsResult({
        projects: [defaultProject],
        generalProjects: [defaultProject],
        defaultProject,
      }),
    );

    const container = renderProjectSelector({
      value: defaultProject.id,
      workspaceType: "general",
      enableManagement: false,
    });

    expect(findButton(container, "新建项目")).toBeNull();
    expect(findButton(container, "重命名")).toBeNull();
    expect(findButton(container, "移除")).toBeNull();
  });

  it("workspace-tab 模式应复刻轻量工作区列表", () => {
    const defaultProject = createProject({
      id: "default",
      name: "默认工作区",
      isDefault: true,
      workspaceType: "general",
    });

    mockUseProjects.mockReturnValue(
      createUseProjectsResult({
        projects: [defaultProject],
        generalProjects: [defaultProject],
        defaultProject,
      }),
    );

    const container = renderProjectSelector({
      value: defaultProject.id,
      workspaceType: "general",
      enableManagement: true,
      chrome: "workspace-tab",
      placeholder: "选择工作区",
    });

    expect(container.textContent).toContain("默认工作区");
    expect(
      container.querySelector(".lucide-folder")?.getAttribute("class"),
    ).toContain("h-4");
    expect(container.textContent).not.toContain("工作区管理");
    expect(container.textContent).not.toContain("搜索工作区");
    expect(
      container.querySelector('[data-testid="workspace-selector-scroll"]')
        ?.className,
    ).toContain("max-h-[308px]");
    expect(findButton(container, "打开现有文件夹")).not.toBeNull();
    expect(findButton(container, "新建工作区")).not.toBeNull();
    expect(findButton(container, "新建项目")).toBeNull();
  });

  it("workspace-tab 列表非默认工作区行尾应提供移除入口", async () => {
    const remove = vi.fn(async () => true);
    const defaultProject = createProject({
      id: "default",
      name: "默认工作区",
      isDefault: true,
      workspaceType: "general",
    });
    const normalProject = createProject({
      id: "normal",
      name: "普通工作区",
      workspaceType: "general",
    });

    mockUseProjects.mockReturnValue(
      createUseProjectsResult({
        projects: [defaultProject, normalProject],
        generalProjects: [defaultProject, normalProject],
        defaultProject,
        remove,
      }),
    );

    const container = renderProjectSelector({
      value: defaultProject.id,
      workspaceType: "general",
      enableManagement: true,
      chrome: "workspace-tab",
    });

    const removeButtons = Array.from(
      container.querySelectorAll('button[aria-label="移除工作区"]'),
    ) as HTMLButtonElement[];
    expect(removeButtons).toHaveLength(1);
    expect(removeButtons[0]?.className).toContain("opacity-0");
    expect(removeButtons[0]?.className).toContain("group-hover:opacity-100");

    act(() => {
      removeButtons[0]?.click();
    });
    await flushAsync();

    expect(container.textContent).toContain("移除工作区");
    expect(container.textContent).toContain("普通工作区");
  });

  it("workspace-tab 当前工作区行尾应显示对勾", () => {
    const defaultProject = createProject({
      id: "default",
      name: "默认工作区",
      isDefault: true,
      workspaceType: "general",
    });
    const normalProject = createProject({
      id: "normal",
      name: "普通工作区",
      workspaceType: "general",
    });

    mockUseProjects.mockReturnValue(
      createUseProjectsResult({
        projects: [defaultProject, normalProject],
        generalProjects: [defaultProject, normalProject],
        defaultProject,
      }),
    );

    const container = renderProjectSelector({
      value: normalProject.id,
      workspaceType: "general",
      enableManagement: true,
      chrome: "workspace-tab",
    });

    const defaultRow = container.querySelector(
      '[data-testid="workspace-selector-row-default"]',
    );
    const normalRow = container.querySelector(
      '[data-testid="workspace-selector-row-normal"]',
    );
    const rows = Array.from(
      container.querySelectorAll('[data-testid^="workspace-selector-row-"]'),
    );

    expect(rows[0]).toBe(normalRow);
    expect(defaultRow?.getAttribute("data-selected")).toBe("false");
    expect(defaultRow?.querySelector(".lucide-check")).toBeNull();
    expect(normalRow?.getAttribute("data-selected")).toBe("true");
    expect(normalRow?.querySelector(".lucide-check")).not.toBeNull();
  });

  it("workspace-tab 未显式选择时应把默认工作区显示为当前选中行", () => {
    const defaultProject = createProject({
      id: "default",
      name: "默认工作区",
      isDefault: true,
      workspaceType: "general",
    });
    const normalProject = createProject({
      id: "normal",
      name: "普通工作区",
      workspaceType: "general",
    });

    mockUseProjects.mockReturnValue(
      createUseProjectsResult({
        projects: [normalProject, defaultProject],
        generalProjects: [normalProject, defaultProject],
        defaultProject,
      }),
    );

    const container = renderProjectSelector({
      value: null,
      workspaceType: "general",
      enableManagement: true,
      chrome: "workspace-tab",
    });

    const rows = Array.from(
      container.querySelectorAll('[data-testid^="workspace-selector-row-"]'),
    );
    const defaultRow = container.querySelector(
      '[data-testid="workspace-selector-row-default"]',
    );
    const normalRow = container.querySelector(
      '[data-testid="workspace-selector-row-normal"]',
    );

    expect(rows[0]).toBe(defaultRow);
    expect(defaultRow?.getAttribute("data-selected")).toBe("true");
    expect(defaultRow?.querySelector(".lucide-check")).not.toBeNull();
    expect(defaultRow?.className).toContain("bg-slate-100");
    expect(normalRow?.getAttribute("data-selected")).toBe("false");
  });

  it("workspace-tab 当前工作区不在已加载列表时仍应置顶并显示选中态", () => {
    const defaultProject = createProject({
      id: "default",
      name: "默认工作区",
      rootPath: "/Users/coso/.newmax/workspace",
      isDefault: true,
      workspaceType: "general",
    });
    const normalProject = createProject({
      id: "normal",
      name: "普通工作区",
      workspaceType: "general",
    });

    mockUseProjects.mockReturnValue(
      createUseProjectsResult({
        projects: [normalProject],
        generalProjects: [normalProject],
        defaultProject,
      }),
    );

    const container = renderProjectSelector({
      value: defaultProject.id,
      workspaceType: "general",
      enableManagement: true,
      chrome: "workspace-tab",
    });

    const rows = Array.from(
      container.querySelectorAll('[data-testid^="workspace-selector-row-"]'),
    );
    const defaultRow = container.querySelector(
      '[data-testid="workspace-selector-row-default"]',
    );
    const normalRow = container.querySelector(
      '[data-testid="workspace-selector-row-normal"]',
    );

    expect(rows[0]).toBe(defaultRow);
    expect(defaultRow?.textContent).toContain("默认工作区");
    expect(defaultRow?.getAttribute("data-selected")).toBe("true");
    expect(defaultRow?.querySelector(".lucide-check")).not.toBeNull();
    expect(normalRow?.getAttribute("data-selected")).toBe("false");
  });

  it("workspace-tab 打开现有文件夹时应复用已存在工作区", async () => {
    const onChange = vi.fn();
    const defaultProject = createProject({
      id: "default",
      name: "默认工作区",
      isDefault: true,
      workspaceType: "general",
    });
    const existingProject = createProject({
      id: "existing",
      name: "已有工作区",
      rootPath: "/tmp/existing",
      workspaceType: "general",
    });

    mockOpenDialog.mockResolvedValue("/tmp/existing");
    mockGetProjectByRootPath.mockResolvedValue(existingProject);
    mockUseProjects.mockReturnValue(
      createUseProjectsResult({
        projects: [defaultProject],
        generalProjects: [defaultProject],
        defaultProject,
      }),
    );

    const container = renderProjectSelector({
      value: defaultProject.id,
      onChange,
      workspaceType: "general",
      enableManagement: true,
      chrome: "workspace-tab",
    });

    await act(async () => {
      findButton(container, "打开现有文件夹")?.click();
      await Promise.resolve();
    });
    await flushAsync();

    expect(mockOpenDialog).toHaveBeenCalledWith({
      directory: true,
      multiple: false,
    });
    expect(mockGetProjectByRootPath).toHaveBeenCalledWith("/tmp/existing");
    expect(onChange).toHaveBeenCalledWith("existing");
    expect(mockToastSuccess).not.toHaveBeenCalled();
  });

  it("workspace-tab 打开新目录时应创建工作区记录", async () => {
    const onChange = vi.fn();
    const create = vi.fn(async () =>
      createProject({
        id: "new-workspace",
        name: "new-workspace",
        rootPath: "/tmp/new-workspace",
        workspaceType: "general",
      }),
    );
    const defaultProject = createProject({
      id: "default",
      name: "默认工作区",
      isDefault: true,
      workspaceType: "general",
    });

    mockOpenDialog.mockResolvedValue("/tmp/new-workspace");
    mockGetProjectByRootPath.mockResolvedValue(null);
    mockUseProjects.mockReturnValue(
      createUseProjectsResult({
        projects: [defaultProject],
        generalProjects: [defaultProject],
        defaultProject,
        create,
      }),
    );

    const container = renderProjectSelector({
      value: defaultProject.id,
      onChange,
      workspaceType: "general",
      enableManagement: true,
      chrome: "workspace-tab",
    });

    await act(async () => {
      findButton(container, "打开现有文件夹")?.click();
      await Promise.resolve();
    });
    await flushAsync();

    expect(create).toHaveBeenCalledWith({
      name: "new-workspace",
      rootPath: "/tmp/new-workspace",
      workspaceType: "general",
    });
    expect(onChange).toHaveBeenCalledWith("new-workspace");
    expect(mockToastSuccess).not.toHaveBeenCalled();
  });

  it("受控打开且延后加载时应刷新完整工作区列表", async () => {
    const refresh = vi.fn(async () => undefined);
    const defaultProject = createProject({
      id: "default",
      name: "默认工作区",
      isDefault: true,
      workspaceType: "general",
    });

    mockUseProjects.mockReturnValue(
      createUseProjectsResult({
        projects: [],
        generalProjects: [],
        defaultProject,
        refresh,
      }),
    );

    renderProjectSelector({
      value: defaultProject.id,
      workspaceType: "general",
      enableManagement: true,
      chrome: "workspace-tab",
      open: true,
      onOpenChange: vi.fn(),
      deferProjectListLoad: true,
    });

    await flushAsync();

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("显示本地位置时只调用系统文件管理器，不额外弹成功提示", async () => {
    const defaultProject = createProject({
      id: "default",
      name: "默认项目",
      isDefault: true,
      workspaceType: "general",
      rootPath: "/tmp/default-project",
    });

    mockRevealPathInFinder.mockResolvedValue(undefined);
    mockUseProjects.mockReturnValue(
      createUseProjectsResult({
        projects: [defaultProject],
        generalProjects: [defaultProject],
        defaultProject,
      }),
    );

    const container = renderProjectSelector({
      value: defaultProject.id,
      workspaceType: "general",
      enableManagement: true,
    });

    await act(async () => {
      findButton(container, "显示")?.click();
      await Promise.resolve();
    });
    await flushAsync();

    expect(mockRevealPathInFinder).toHaveBeenCalledWith("/tmp/default-project");
    expect(mockToastSuccess).not.toHaveBeenCalled();
  });

  it("查看内容应进入当前工作区内容视图", () => {
    const onOpenProjectContents = vi.fn();
    const generalProject = createProject({
      id: "general-1",
      name: "通用项目",
      workspaceType: "general",
    });

    mockUseProjects.mockReturnValue(
      createUseProjectsResult({
        projects: [generalProject],
        generalProjects: [generalProject],
        defaultProject: null,
      }),
    );

    const container = renderProjectSelector({
      value: generalProject.id,
      workspaceType: "general",
      enableManagement: true,
      onOpenProjectContents,
    });

    act(() => {
      findButton(container, "查看内容")?.click();
    });

    expect(onOpenProjectContents).toHaveBeenCalledWith(generalProject.id);
  });

  it("延后列表加载时应先用项目摘要渲染当前项目", async () => {
    const selectedProject = createProject({
      id: "general-1",
      name: "当前项目",
      workspaceType: "general",
    });

    mockUseProjects.mockReturnValue(
      createUseProjectsResult({
        projects: [],
        generalProjects: [],
        defaultProject: null,
      }),
    );
    mockGetProject.mockResolvedValue(selectedProject);

    const container = renderProjectSelector({
      value: selectedProject.id,
      workspaceType: "general",
      deferProjectListLoad: true,
    });

    await flushAsync();
    await flushAsync();

    expect(mockUseProjects).toHaveBeenCalledWith(
      expect.objectContaining({
        autoLoad: false,
      }),
    );
    expect(mockGetProject).toHaveBeenCalledWith(selectedProject.id);
    expect(container.textContent).toContain(selectedProject.name);
  });

  it("被动展示模式延后列表加载时应推迟项目摘要请求", async () => {
    vi.useFakeTimers();
    try {
      const selectedProject = createProject({
        id: "general-1",
        name: "当前项目",
        workspaceType: "general",
      });

      mockUseProjects.mockReturnValue(
        createUseProjectsResult({
          projects: [],
          generalProjects: [],
          defaultProject: null,
        }),
      );
      mockGetProject.mockResolvedValue(selectedProject);

      renderProjectSelector({
        value: selectedProject.id,
        workspaceType: "general",
        deferProjectListLoad: true,
        passiveTrigger: true,
      });

      await flushAsync();
      expect(mockGetProject).not.toHaveBeenCalled();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(12_000);
      });
      await flushAsync();

      expect(mockGetProject).toHaveBeenCalledWith(selectedProject.id);
    } finally {
      vi.useRealTimers();
    }
  });

  it("延后列表加载且未指定项目时应回填默认项目", async () => {
    const onChange = vi.fn();
    const defaultProject = createProject({
      id: "default",
      name: "默认项目",
      isDefault: true,
      workspaceType: "general",
    });

    mockUseProjects.mockReturnValue(
      createUseProjectsResult({
        projects: [],
        generalProjects: [],
        defaultProject: null,
      }),
    );
    mockGetDefaultProject.mockResolvedValue(defaultProject);

    renderProjectSelector({
      value: null,
      workspaceType: "general",
      deferProjectListLoad: true,
      onChange,
    });

    await flushAsync();
    await flushAsync();

    expect(mockGetDefaultProject).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(defaultProject.id);
  });
});
