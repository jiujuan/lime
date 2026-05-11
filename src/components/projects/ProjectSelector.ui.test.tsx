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
} = vi.hoisted(() => ({
  mockUseProjects: vi.fn(),
  mockToastError: vi.fn(),
  mockToastSuccess: vi.fn(),
  mockGetProject: vi.fn(),
  mockGetDefaultProject: vi.fn(),
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
        "common.projectSelector.action.deleteEntity": "删除{{entity}}",
        "common.projectSelector.action.deleting": "删除中...",
        "common.projectSelector.action.rename": "重命名",
        "common.projectSelector.action.saving": "保存中...",
        "common.projectSelector.badge.default": "默认",
        "common.projectSelector.current.label": "当前{{entity}}：",
        "common.projectSelector.delete.dangerDescription":
          "仅删除项目记录，不删除本地目录和已有文件。",
        "common.projectSelector.delete.dangerTitle": "此操作不可恢复",
        "common.projectSelector.delete.description":
          "确定要删除{{entity}}{{name}}吗？",
        "common.projectSelector.delete.title": "删除{{entity}}",
        "common.projectSelector.empty": "未找到匹配项目",
        "common.projectSelector.entity.project": "项目",
        "common.projectSelector.entity.workspace": "工作区",
        "common.projectSelector.header.count": "{{count}} 个{{entity}}",
        "common.projectSelector.header.description":
          "在这里切换、搜索和管理可见{{entity}}列表。",
        "common.projectSelector.header.title": "选择{{entity}}",
        "common.projectSelector.management.defaultLocked":
          "默认{{entity}}不可重命名或删除",
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
        "common.projectSelector.rename.description":
          "更新{{entity}}名称，不会修改本地目录路径。",
        "common.projectSelector.rename.placeholder": "输入新的项目名称",
        "common.projectSelector.rename.title": "重命名{{entity}}",
        "common.projectSelector.search.placeholder": "搜索{{entity}}",
        "common.projectSelector.toast.created": "{{entity}}已创建",
        "common.projectSelector.toast.deleted":
          "{{entity}}已删除，本地目录未删除",
        "common.projectSelector.toast.deleteFailed": "删除失败：{{message}}",
        "common.projectSelector.toast.nameRequired": "{{entity}}名称不能为空",
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

vi.mock("@/lib/api/project", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/api/project")>(
      "@/lib/api/project",
    );

  return {
    ...actual,
    getProject: mockGetProject,
    getDefaultProject: mockGetDefaultProject,
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
  ScrollArea: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
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
  it("默认项目在管理模式下不可重命名或删除", () => {
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
    expect(findButton(container, "删除")?.disabled).toBe(true);
    expect(container.textContent).toContain("默认项目不可重命名或删除");
  });

  it("删除当前项目后应回退到默认项目", async () => {
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
      findButton(container, "删除")?.click();
    });
    await flushAsync();

    await act(async () => {
      findButton(container, "删除项目")?.click();
      await Promise.resolve();
    });
    await flushAsync();

    expect(remove).toHaveBeenCalledWith(generalProject.id);
    expect(onChange).toHaveBeenCalledWith(defaultProject.id);
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
    expect(findButton(container, "删除")).toBeNull();
  });

  it("workspace-tab 模式应使用工作区文案", () => {
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

    expect(container.textContent).toContain("选择工作区");
    expect(
      container.querySelector(".lucide-folder")?.getAttribute("class"),
    ).toContain("h-4");
    expect(container.textContent).toContain("工作区管理");
    expect(findButton(container, "新建工作区")).not.toBeNull();
    expect(findButton(container, "新建项目")).toBeNull();
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
