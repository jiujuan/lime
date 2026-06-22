import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ContentDetail, Project } from "@/lib/api/project";
import {
  getContent,
  getGeneralWorkbenchDocumentState,
  getProject,
} from "@/lib/api/project";
import { getProjectMemory, type ProjectMemory } from "@/lib/api/projectMemory";
import { scheduleMinimumDelayIdleTask } from "@/lib/utils/scheduleMinimumDelayIdleTask";
import { useWorkspaceProjectContentRuntime } from "./useWorkspaceProjectContentRuntime";

vi.mock("@/lib/agentDebug", () => ({
  logAgentDebug: vi.fn(),
}));

vi.mock("@/lib/api/project", () => ({
  getProject: vi.fn(),
  getContent: vi.fn(),
  getGeneralWorkbenchDocumentState: vi.fn(),
}));

vi.mock("@/lib/api/projectMemory", () => ({
  getProjectMemory: vi.fn(),
}));

vi.mock("@/lib/utils/scheduleMinimumDelayIdleTask", () => ({
  scheduleMinimumDelayIdleTask: vi.fn(() => vi.fn()),
}));

type HookProps = Parameters<typeof useWorkspaceProjectContentRuntime>[0];

const mountedRoots: Array<{ container: HTMLDivElement; root: Root }> = [];

function createProject(overrides: Partial<Project> = {}): Project {
  return {
    id: "project-1",
    name: "项目一",
    workspaceType: "general",
    rootPath: "/tmp/project-1",
    isDefault: false,
    createdAt: 1,
    updatedAt: 2,
    isFavorite: false,
    isArchived: false,
    tags: [],
    ...overrides,
  };
}

function createContent(overrides: Partial<ContentDetail> = {}): ContentDetail {
  return {
    id: "content-1",
    project_id: "project-1",
    title: "主稿",
    content_type: "document",
    status: "draft",
    order: 1,
    word_count: 2,
    created_at: 1,
    updated_at: 2,
    body: "# 标题\n\n正文",
    metadata: {},
    ...overrides,
  };
}

function createProjectMemory(
  overrides: Partial<ProjectMemory> = {},
): ProjectMemory {
  return {
    outline: ["主线"],
    characters: [],
    ...overrides,
  } as ProjectMemory;
}

function renderHook(props?: Partial<HookProps>) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  let latestValue: ReturnType<typeof useWorkspaceProjectContentRuntime> | null =
    null;

  const defaultProps: HookProps = {
    projectId: "project-1",
    contentId: null,
    externalProjectId: "project-1",
    lockTheme: false,
    initialTheme: "general",
    normalizedEntryTheme: "general",
    shouldBootstrapCanvasOnEntry: false,
    shouldDeferWorkspaceAuxiliaryLoads: false,
    shouldPreserveEntryThemeOnHome: false,
    resetProjectSelection: vi.fn(),
    setActiveTheme: vi.fn(),
    setLayoutMode: vi.fn(),
  };

  function Probe(currentProps: HookProps) {
    latestValue = useWorkspaceProjectContentRuntime(currentProps);
    return null;
  }

  const render = async (nextProps?: Partial<HookProps>) => {
    await act(async () => {
      root.render(<Probe {...defaultProps} {...props} {...nextProps} />);
      await Promise.resolve();
    });
  };

  mountedRoots.push({ container, root });

  return {
    render,
    defaultProps,
    getValue: () => {
      if (!latestValue) {
        throw new Error("hook 尚未初始化");
      }
      return latestValue;
    },
  };
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;

  vi.mocked(getProject).mockResolvedValue(createProject());
  vi.mocked(getContent).mockResolvedValue(createContent());
  vi.mocked(getProjectMemory).mockResolvedValue(createProjectMemory());
  vi.mocked(getGeneralWorkbenchDocumentState).mockResolvedValue(null);
});

afterEach(() => {
  while (mountedRoots.length > 0) {
    const mounted = mountedRoots.pop();
    if (!mounted) {
      break;
    }
    act(() => {
      mounted.root.unmount();
    });
    mounted.container.remove();
  }
  vi.clearAllMocks();
});

describe("useWorkspaceProjectContentRuntime", () => {
  it("没有项目时应清空项目与 Memory 并结束初始加载", async () => {
    const { render, getValue } = renderHook({
      projectId: null,
      contentId: "content-1",
      externalProjectId: null,
    });

    await render();

    await vi.waitFor(() => {
      expect(getValue().isInitialContentLoading).toBe(false);
    });
    expect(getProject).not.toHaveBeenCalled();
    expect(getContent).not.toHaveBeenCalled();
    expect(getValue().project).toBeNull();
    expect(getValue().projectMemory).toBeNull();
  });

  it("项目缺失且不是外部指定项目时应重置选择并显示内容加载错误", async () => {
    const resetProjectSelection = vi.fn();
    vi.mocked(getProject).mockResolvedValueOnce(null);
    const { render, getValue } = renderHook({
      projectId: "missing-project",
      contentId: "content-1",
      externalProjectId: undefined,
      resetProjectSelection,
    });

    await render();

    await vi.waitFor(() => {
      expect(getValue().initialContentLoadError).toBe(
        "当前项目不存在或已被删除",
      );
    });
    expect(resetProjectSelection).toHaveBeenCalledTimes(1);
    expect(getContent).not.toHaveBeenCalled();
    expect(getValue().project).toBeNull();
    expect(getValue().projectMemory).toBeNull();
  });

  it("加载内容时应写入 canvas、同步快照和版本状态容器", async () => {
    const projectMemory = createProjectMemory({
      outline: ["第一章"],
    });
    const setLayoutMode = vi.fn();
    vi.mocked(getProjectMemory).mockResolvedValueOnce(projectMemory);
    const { render, getValue } = renderHook({
      contentId: "content-1",
      setLayoutMode,
    });

    await render();

    await vi.waitFor(() => {
      expect(getValue().canvasState).not.toBeNull();
    });
    expect(getProject).toHaveBeenCalledWith("project-1");
    expect(getProjectMemory).toHaveBeenCalledWith("project-1");
    expect(getContent).toHaveBeenCalledWith("content-1");
    expect(getValue().projectMemory).toBe(projectMemory);
    expect(getValue().lastCanvasSyncRequestRef.current).toEqual(
      expect.objectContaining({
        contentId: "content-1",
        body: expect.any(String),
      }),
    );
    expect(setLayoutMode).toHaveBeenCalledWith("canvas");
    expect(getValue().isInitialContentLoading).toBe(false);
  });

  it("延后加载开启时应调度 Memory 读取而不是阻塞项目加载", async () => {
    const projectMemory = createProjectMemory({
      outline: ["延后主线"],
    });
    vi.mocked(getProjectMemory).mockResolvedValueOnce(projectMemory);
    const { render, getValue } = renderHook({
      shouldDeferWorkspaceAuxiliaryLoads: true,
      deferredWorkspaceAuxiliaryLoadMs: 17,
    });

    await render();

    await vi.waitFor(() => {
      expect(scheduleMinimumDelayIdleTask).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({
          minimumDelayMs: 17,
        }),
      );
    });
    const scheduledTask = vi.mocked(scheduleMinimumDelayIdleTask).mock
      .calls[0]?.[0] as (() => void) | undefined;
    await act(async () => {
      scheduledTask?.();
      await Promise.resolve();
    });
    await vi.waitFor(() => {
      expect(getValue().projectMemory).toBe(projectMemory);
    });
    expect(getValue().project?.id).toBe("project-1");
  });
});
