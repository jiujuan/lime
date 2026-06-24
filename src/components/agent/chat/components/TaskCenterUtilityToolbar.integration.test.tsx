import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentRuntimeThreadReadModel } from "@/lib/api/agentRuntime";
import { TaskCenterUtilityToolbar } from "./TaskCenterUtilityToolbar";
import { TaskCenterShellPanel } from "./TaskCenterShellPanel";

const {
  mockOpenProjectPathWithTool,
  mockReadProjectGitStatus,
  mockKillProjectShellSession,
  mockListenProjectShellSessionEvents,
  mockResizeProjectShellSession,
  mockStartProjectShellSession,
  mockWriteProjectShellSession,
  mockFitAddonFit,
  mockXtermDisposeInput,
  mockXtermOnDataHandlers,
  mockXtermLoadAddon,
  mockXtermTerminalOptions,
  mockXtermWrite,
  mockXtermWriteln,
  mockReadConversationImportRuntimeEvents,
} = vi.hoisted(() => ({
  mockOpenProjectPathWithTool: vi.fn(),
  mockReadProjectGitStatus: vi.fn(),
  mockKillProjectShellSession: vi.fn(),
  mockListenProjectShellSessionEvents: vi.fn(),
  mockResizeProjectShellSession: vi.fn(),
  mockStartProjectShellSession: vi.fn(),
  mockWriteProjectShellSession: vi.fn(),
  mockFitAddonFit: vi.fn(),
  mockXtermDisposeInput: vi.fn(),
  mockXtermOnDataHandlers: [] as Array<(data: string) => void>,
  mockXtermLoadAddon: vi.fn(),
  mockXtermTerminalOptions: [] as Array<Record<string, unknown>>,
  mockXtermWrite: vi.fn(),
  mockXtermWriteln: vi.fn(),
  mockReadConversationImportRuntimeEvents: vi.fn(),
}));

vi.mock("@/lib/api/fileSystem", () => ({
  openProjectPathWithTool: mockOpenProjectPathWithTool,
}));

vi.mock("@/lib/api/projectGit", () => ({
  readProjectGitStatus: mockReadProjectGitStatus,
}));

vi.mock("@/lib/api/projectShell", () => ({
  killProjectShellSession: mockKillProjectShellSession,
  listenProjectShellSessionEvents: mockListenProjectShellSessionEvents,
  resizeProjectShellSession: mockResizeProjectShellSession,
  startProjectShellSession: mockStartProjectShellSession,
  writeProjectShellSession: mockWriteProjectShellSession,
}));

vi.mock("@/lib/api/conversationImport", () => ({
  readConversationImportRuntimeEvents: mockReadConversationImportRuntimeEvents,
}));

vi.mock("@xterm/xterm/css/xterm.css", () => ({}));

vi.mock("@xterm/xterm", () => ({
  Terminal: vi.fn().mockImplementation((options: Record<string, unknown>) => {
    mockXtermTerminalOptions.push(options);
    return {
      cols: 120,
      rows: 14,
      dispose: vi.fn(),
      focus: vi.fn(),
      loadAddon: mockXtermLoadAddon,
      onData: vi.fn((handler: (data: string) => void) => {
        mockXtermOnDataHandlers.push(handler);
        return { dispose: mockXtermDisposeInput };
      }),
      open: vi.fn(),
      write: mockXtermWrite,
      writeln: mockXtermWriteln,
    };
  }),
}));

vi.mock("@xterm/addon-fit", () => ({
  FitAddon: vi.fn().mockImplementation(() => ({
    fit: mockFitAddonFit,
  })),
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
  },
}));

vi.mock("react-i18next", () => {
  const t = (key: string, options?: Record<string, unknown>) => {
    const template =
      typeof options?.defaultValue === "string" ? options.defaultValue : key;

    return template.replace(/{{\s*([^}]+?)\s*}}/g, (_, name: string) =>
      String(options?.[name.trim()] ?? ""),
    );
  };
  return {
    useTranslation: () => ({ t }),
  };
});

vi.mock("@/components/ui/button", () => ({
  Button: React.forwardRef<
    HTMLButtonElement,
    React.ButtonHTMLAttributes<HTMLButtonElement> & {
      variant?: string;
      size?: string;
    }
  >(
    (
      {
        children,
        onClick,
        disabled,
        type,
        variant: _variant,
        size: _size,
        ...rest
      },
      ref,
    ) => (
      <button
        ref={ref}
        type={type ?? "button"}
        onClick={onClick}
        disabled={disabled}
        {...rest}
      >
        {children}
      </button>
    ),
  ),
}));

vi.mock("@/components/ui/popover", () => ({
  Popover: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PopoverContent: ({
    children,
    align: _align,
    sideOffset: _sideOffset,
    ...props
  }: React.HTMLAttributes<HTMLDivElement> & {
    align?: string;
    sideOffset?: number;
  }) => <div {...props}>{children}</div>,
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

interface MountedHarness {
  container: HTMLDivElement;
  root: Root;
}

const mountedRoots: MountedHarness[] = [];

beforeEach(() => {
  vi.useRealTimers();
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  if (!globalThis.PointerEvent) {
    Object.defineProperty(globalThis, "PointerEvent", {
      configurable: true,
      value: MouseEvent,
    });
  }
  HTMLElement.prototype.setPointerCapture ??= vi.fn();
  HTMLElement.prototype.releasePointerCapture ??= vi.fn();
  mockOpenProjectPathWithTool.mockResolvedValue(undefined);
  mockReadProjectGitStatus.mockResolvedValue({
    rootPath: "/tmp/project",
    hasGitRepository: true,
    currentBranch: "feature/task-center",
    branches: ["feature/task-center"],
    uncommittedFileCount: 3,
  });
  mockKillProjectShellSession.mockResolvedValue(undefined);
  mockListenProjectShellSessionEvents.mockResolvedValue(vi.fn());
  mockResizeProjectShellSession.mockResolvedValue(undefined);
  mockStartProjectShellSession.mockResolvedValue({
    sessionId: "project-shell-1",
    cwd: "/tmp/project",
    shell: "/bin/zsh",
    title: "coso@host: project",
    localEcho: true,
    tty: false,
    pid: 123,
  });
  mockWriteProjectShellSession.mockResolvedValue(undefined);
  mockReadConversationImportRuntimeEvents.mockResolvedValue({
    sessionId: "session-imported",
    offset: 0,
    limit: 10,
    totalEvents: 2,
    nextOffset: undefined,
    sourceRuntimeEvents: 120,
    materializedRuntimeEvents: 80,
    sidecarRuntimeEvents: 40,
    projection: {},
    events: [
      {
        sourceEventIndex: 80,
        turnIndex: 1,
        eventIndex: 2,
        eventType: "command_execution",
        payload: {
          command: "npm test",
          status: "completed",
        },
      },
      {
        sourceEventIndex: 81,
        turnIndex: 1,
        eventIndex: 3,
        eventType: "reasoning",
        payload: {
          summary: "checked previous output",
        },
      },
    ],
  });
  mockXtermOnDataHandlers.length = 0;
  mockXtermTerminalOptions.length = 0;
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

function mount(node: React.ReactNode) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(node);
  });

  mountedRoots.push({ container, root });
  return container;
}

function renderToolbar(
  props?: Partial<React.ComponentProps<typeof TaskCenterUtilityToolbar>>,
) {
  return mount(
    <TaskCenterUtilityToolbar
      projectRootPath="/tmp/project"
      showCanvasToggle
      isCanvasOpen={false}
      onToggleCanvas={vi.fn()}
      showHarnessToggle
      harnessPanelVisible={false}
      onToggleHarnessPanel={vi.fn()}
      harnessPendingCount={0}
      harnessAttentionLevel="idle"
      harnessToggleLabel="Harness"
      shellPanelOpen={false}
      onToggleShellPanel={vi.fn()}
      {...props}
    />,
  );
}

describe("TaskCenterUtilityToolbar", () => {
  it("顶部工具栏按钮应保持单行图标布局，避免窄宽度下文字掉行", () => {
    const container = renderToolbar({
      isCanvasOpen: true,
      harnessPendingCount: 3,
    });

    const toolbar = container.querySelector(
      '[data-testid="task-center-utility-toolbar"]',
    );
    const panelGroup = container.querySelector(
      '[data-testid="task-center-tool-group-panels"]',
    );
    const workbenchToggle = container.querySelector(
      '[data-testid="task-center-workbench-toggle"]',
    );

    expect(toolbar?.className).toContain("flex-nowrap");
    expect(toolbar?.className).toContain("whitespace-nowrap");
    expect(panelGroup?.className).toContain("flex-nowrap");
    expect(workbenchToggle?.className).toContain("shrink-0");
    expect(workbenchToggle?.textContent?.trim()).toBe("");
  });

  it("专家信息按钮应在顶部工具列中以图标态展开和收起右栏", () => {
    const onToggleExpertInfoPanel = vi.fn();
    const container = renderToolbar({
      showExpertInfoToggle: true,
      expertInfoPanelVisible: false,
      onToggleExpertInfoPanel,
    });

    const toggle = container.querySelector<HTMLButtonElement>(
      '[data-testid="task-center-expert-info-toggle"]',
    );
    expect(toggle).not.toBeNull();
    expect(toggle?.textContent?.trim()).toBe("");
    expect(toggle?.getAttribute("aria-expanded")).toBe("false");
    expect(toggle?.getAttribute("aria-label")).toBe("打开专家信息");
    expect(toggle?.className).not.toContain(
      "lime-chrome-tab-active-surface",
    );

    act(() => {
      toggle?.click();
    });

    expect(onToggleExpertInfoPanel).toHaveBeenCalledTimes(1);

    const visibleContainer = renderToolbar({
      showExpertInfoToggle: true,
      expertInfoPanelVisible: true,
      onToggleExpertInfoPanel,
    });
    const visibleToggle = visibleContainer.querySelector<HTMLButtonElement>(
      '[data-testid="task-center-expert-info-toggle"]',
    );

    expect(visibleToggle?.getAttribute("aria-expanded")).toBe("true");
    expect(visibleToggle?.getAttribute("aria-label")).toBe("关闭专家信息");
    expect(visibleToggle?.className).toContain(
      "lime-chrome-tab-active-surface",
    );
  });

  it("右侧 surface projection 应优先驱动专家和工作台按钮状态", () => {
    const container = renderToolbar({
      showExpertInfoToggle: true,
      expertInfoPanelVisible: false,
      isCanvasOpen: false,
      rightSurfaceLaunchers: [
        {
          kind: "workbench",
          active: false,
          disabled: true,
          pendingCount: 2,
          collapseTarget: "topToolbar",
        },
        {
          kind: "expertInfo",
          active: true,
          disabled: false,
          pendingCount: 3,
          collapseTarget: "topToolbar",
        },
      ],
    });

    const expertToggle = container.querySelector<HTMLButtonElement>(
      '[data-testid="task-center-expert-info-toggle"]',
    );
    const workbenchToggle = container.querySelector<HTMLButtonElement>(
      '[data-testid="task-center-workbench-toggle"]',
    );

    expect(expertToggle?.getAttribute("aria-expanded")).toBe("true");
    expect(expertToggle?.getAttribute("aria-label")).toBe("关闭专家信息");
    expect(expertToggle?.className).toContain(
      "lime-chrome-tab-active-surface",
    );
    expect(expertToggle?.textContent).toContain("3");

    expect(workbenchToggle?.disabled).toBe(true);
    expect(workbenchToggle?.textContent).toContain("2");
  });

  it("右侧 surface projection 应能驱动 Harness pending badge", () => {
    const container = renderToolbar({
      harnessPendingCount: 0,
      rightSurfaceLaunchers: [
        {
          kind: "harness",
          active: false,
          disabled: false,
          pendingCount: 2,
          collapseTarget: "topToolbar",
        },
      ],
    });

    const harnessToggle = container.querySelector<HTMLButtonElement>(
      '[data-testid="task-center-harness-toggle"]',
    );

    expect(harnessToggle?.textContent).toContain("2");
  });

  it("右侧 surface projection 应能驱动 Harness 展开态和禁用态", () => {
    const activeContainer = renderToolbar({
      harnessPanelVisible: false,
      rightSurfaceLaunchers: [
        {
          kind: "harness",
          active: true,
          disabled: false,
          pendingCount: 0,
          collapseTarget: "topToolbar",
        },
      ],
    });

    const activeToggle = activeContainer.querySelector<HTMLButtonElement>(
      '[data-testid="task-center-harness-toggle"]',
    );

    expect(activeToggle?.getAttribute("aria-expanded")).toBe("true");
    expect(activeToggle?.getAttribute("aria-label")).toBe("关闭Harness");
    expect(activeToggle?.className).toContain("lime-chrome-tab-active-surface");

    const disabledContainer = renderToolbar({
      harnessPanelVisible: false,
      rightSurfaceLaunchers: [
        {
          kind: "harness",
          active: false,
          disabled: true,
          pendingCount: 4,
          collapseTarget: "topToolbar",
        },
      ],
    });

    const disabledToggle = disabledContainer.querySelector<HTMLButtonElement>(
      '[data-testid="task-center-harness-toggle"]',
    );

    expect(disabledToggle?.disabled).toBe(true);
    expect(disabledToggle?.getAttribute("aria-expanded")).toBe("false");
    expect(disabledToggle?.textContent).toContain("4");
  });

  it("右侧 surface projection 应能驱动文件入口展开态、badge 和点击回调", () => {
    const onToggleFilesPanel = vi.fn();
    const container = renderToolbar({
      onToggleFilesPanel,
      rightSurfaceLaunchers: [
        {
          kind: "files",
          active: true,
          disabled: false,
          pendingCount: 1,
          collapseTarget: "topToolbar",
        },
      ],
    });

    const filesToggle = container.querySelector<HTMLButtonElement>(
      '[data-testid="task-center-files-toggle"]',
    );

    expect(filesToggle).not.toBeNull();
    expect(filesToggle?.getAttribute("aria-expanded")).toBe("true");
    expect(filesToggle?.getAttribute("aria-label")).toBe("打开文件");
    expect(filesToggle?.className).toContain("lime-chrome-tab-active-surface");
    expect(filesToggle?.textContent).toContain("1");

    act(() => {
      filesToggle?.click();
    });

    expect(onToggleFilesPanel).toHaveBeenCalledTimes(1);
  });

  it("右侧 surface projection 应能驱动浏览器入口展开态、badge 和点击回调", () => {
    const onToggleBrowserPanel = vi.fn();
    const container = renderToolbar({
      onToggleBrowserPanel,
      rightSurfaceLaunchers: [
        {
          kind: "browser",
          active: true,
          disabled: false,
          pendingCount: 1,
          collapseTarget: "topToolbar",
        },
      ],
    });

    const browserToggle = container.querySelector<HTMLButtonElement>(
      '[data-testid="task-center-browser-toggle"]',
    );

    expect(browserToggle).not.toBeNull();
    expect(browserToggle?.getAttribute("aria-expanded")).toBe("true");
    expect(browserToggle?.getAttribute("aria-label")).toBe("关闭浏览器");
    expect(browserToggle?.getAttribute("title")).toBe("浏览器");
    expect(browserToggle?.className).toContain(
      "lime-chrome-tab-active-surface",
    );
    expect(browserToggle?.textContent).toContain("1");

    act(() => {
      browserToggle?.click();
    });

    expect(onToggleBrowserPanel).toHaveBeenCalledTimes(1);
  });

  it("右侧 surface projection 应能驱动对象画布入口展开态、badge 和点击回调", () => {
    const onToggleObjectCanvasPanel = vi.fn();
    const container = renderToolbar({
      onToggleObjectCanvasPanel,
      rightSurfaceLaunchers: [
        {
          kind: "objectCanvas",
          active: true,
          disabled: false,
          pendingCount: 2,
          collapseTarget: "topToolbar",
        },
      ],
    });

    const objectCanvasToggle = container.querySelector<HTMLButtonElement>(
      '[data-testid="task-center-object-canvas-toggle"]',
    );

    expect(objectCanvasToggle).not.toBeNull();
    expect(objectCanvasToggle?.getAttribute("aria-expanded")).toBe("true");
    expect(objectCanvasToggle?.getAttribute("aria-label")).toBe("关闭对象画布");
    expect(objectCanvasToggle?.getAttribute("title")).toBe("对象画布");
    expect(objectCanvasToggle?.className).toContain(
      "lime-chrome-tab-active-surface",
    );
    expect(objectCanvasToggle?.textContent).toContain("2");

    act(() => {
      objectCanvasToggle?.click();
    });

    expect(onToggleObjectCanvasPanel).toHaveBeenCalledTimes(1);
  });

  it("右侧 productProfile projection 应复用对象入口并显示产物 Profile 语义", () => {
    const onToggleObjectCanvasPanel = vi.fn();
    const container = renderToolbar({
      onToggleObjectCanvasPanel,
      rightSurfaceLaunchers: [
        {
          kind: "productProfile",
          active: true,
          disabled: false,
          pendingCount: 1,
          collapseTarget: "topToolbar",
        },
        {
          kind: "objectCanvas",
          active: false,
          disabled: false,
          pendingCount: 2,
          collapseTarget: "topToolbar",
        },
      ],
    });

    const productProfileToggle = container.querySelector<HTMLButtonElement>(
      '[data-testid="task-center-object-canvas-toggle"]',
    );

    expect(productProfileToggle).not.toBeNull();
    expect(productProfileToggle?.getAttribute("aria-expanded")).toBe("true");
    expect(productProfileToggle?.getAttribute("aria-label")).toBe(
      "关闭产物 Profile",
    );
    expect(productProfileToggle?.getAttribute("title")).toBe("产物 Profile");
    expect(productProfileToggle?.textContent).toContain("3");

    act(() => {
      productProfileToggle?.click();
    });

    expect(onToggleObjectCanvasPanel).toHaveBeenCalledTimes(1);
  });

  it("对象画布只有 pending 但不可用时应保留禁用入口与 badge", () => {
    const onToggleObjectCanvasPanel = vi.fn();
    const container = renderToolbar({
      onToggleObjectCanvasPanel,
      rightSurfaceLaunchers: [
        {
          kind: "objectCanvas",
          active: false,
          disabled: true,
          pendingCount: 1,
          collapseTarget: "topToolbar",
        },
      ],
    });

    const objectCanvasToggle = container.querySelector<HTMLButtonElement>(
      '[data-testid="task-center-object-canvas-toggle"]',
    );

    expect(objectCanvasToggle).not.toBeNull();
    expect(objectCanvasToggle?.disabled).toBe(true);
    expect(objectCanvasToggle?.getAttribute("aria-expanded")).toBe("false");
    expect(objectCanvasToggle?.getAttribute("aria-label")).toBe("打开对象画布");
    expect(objectCanvasToggle?.textContent).toContain("1");
  });

  it("应用切换应通过文件壳网关打开指定工具", async () => {
    const container = renderToolbar();
    const trigger = container.querySelector(
      '[data-testid="task-center-app-switcher-trigger"]',
    ) as HTMLButtonElement | null;

    await act(async () => {
      trigger?.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const popover = document.body.querySelector(
      '[data-testid="task-center-app-switcher-popover"]',
    );
    const terminalButton = Array.from(
      popover?.querySelectorAll("button") ?? [],
    ).find((button) => button.textContent?.includes("Terminal"));

    await act(async () => {
      terminalButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(mockOpenProjectPathWithTool).toHaveBeenCalledWith(
      "/tmp/project",
      "terminal",
    );
  });

  it("环境信息应读取真实 Git 状态并展示分支与未提交文件数", async () => {
    const container = renderToolbar();
    const trigger = container.querySelector(
      '[data-testid="task-center-environment-trigger"]',
    ) as HTMLButtonElement | null;

    await act(async () => {
      trigger?.click();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    const popover = document.body.querySelector(
      '[data-testid="task-center-environment-popover"]',
    );
    expect(mockReadProjectGitStatus).toHaveBeenCalledWith("/tmp/project");
    expect(popover?.textContent).toContain("feature/task-center");
    expect(popover?.textContent).toContain("3 个文件");
    expect(popover?.textContent).toContain("提交或推送");
  });

  it("环境信息区域应轻量展示当前任务进度，并允许打开输出文件", async () => {
    const onOpenOutput = vi.fn();
    const container = renderToolbar({
      taskRail: {
        workflowSteps: [
          { id: "read", title: "读取任务区结构", status: "completed" },
          { id: "build", title: "接入顶部任务轨道", status: "active" },
          { id: "verify", title: "验证顶部浮层", status: "pending" },
          { id: "ship", title: "整理交付结果", status: "pending" },
        ],
        messages: [
          {
            id: "assistant-task",
            role: "assistant",
            content: "",
            timestamp: new Date("2026-06-16T10:00:00.000Z"),
            toolCalls: [
              {
                id: "tool-rg",
                name: "rg",
                arguments: JSON.stringify({
                  query: "TaskCenterUtilityToolbar",
                }),
                status: "completed",
                result: {
                  success: true,
                  output: "找到顶部工具栏",
                },
                startTime: new Date("2026-06-16T10:00:01.000Z"),
              },
            ],
            artifacts: [
              {
                id: "artifact-plan",
                type: "document",
                title: "agent-workspace-task-rail.md",
                content: "task rail",
                status: "complete",
                createdAt: new Date("2026-06-16T10:00:02.000Z").getTime(),
                updatedAt: new Date("2026-06-16T10:00:02.000Z").getTime(),
                position: { start: 0, end: 9 },
                meta: {
                  filePath: "internal/roadmap/agent-workspace/task-rail.md",
                },
              },
            ],
          },
        ],
        context: {
          providerType: "cloud",
          model: "reasoner-pro",
          accessMode: "current",
          reasoningEffort: "medium",
          workspacePath: "/tmp/project",
          objectiveText: "完成任务轨道",
          changedFileCount: 2,
          changedFiles: ["src/App.tsx", "src/index.ts"],
          patchCount: 2,
          runningPatchCount: 1,
          sourceCount: 4,
          sourceEvidenceCount: 1,
          sourceLabels: [
            "AG-UI spec",
            "https://example.com/report",
            "docs/context.md",
          ],
          subtaskTotalCount: 3,
          subtaskActiveCount: 1,
          subtaskCompletedCount: 2,
        },
        threadRead: {
          thread_id: "thread-1",
          active_turn_id: "turn-1",
          profile_status: "running",
          managed_objective: {
            objective_id: "objective-1",
            owner_kind: "agent_session",
            owner_id: "session-1",
            objective_text: "完成任务轨道",
            success_criteria: [],
            status: "active",
            last_artifact_refs: [],
            created_at: "2026-06-16T10:00:00.000Z",
            updated_at: "2026-06-16T10:00:00.000Z",
          },
          context_summary: {
            sources: ["https://docs.example.com/task-rail"],
          },
          evidence_summary: {
            evidence_refs: ["evidence/task-rail.json"],
          },
        } as any,
        childSubagentSessions: [
          {
            id: "subagent-1",
            name: "实现",
            created_at: 1,
            updated_at: 2,
            session_type: "subagent",
            runtime_status: "running",
          },
        ],
        onOpenOutput,
      },
    });
    const trigger = container.querySelector(
      '[data-testid="task-center-environment-trigger"]',
    ) as HTMLButtonElement | null;

    await act(async () => {
      trigger?.click();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    const popover = document.body.querySelector(
      '[data-testid="task-center-environment-popover"]',
    );
    const taskRail = document.body.querySelector(
      '[data-testid="task-center-task-rail"]',
    );
    const items = Array.from(
      document.body.querySelectorAll(
        '[data-testid="task-center-task-rail-item"]',
      ),
    );

    expect(popover?.textContent).toContain("环境信息");
    expect(taskRail?.textContent).toContain("当前任务");
    expect(taskRail?.textContent).toContain("环境");
    expect(taskRail?.textContent).toContain("运行");
    expect(taskRail?.textContent).toContain("计划");
    expect(taskRail?.textContent).toContain("目标");
    expect(taskRail?.textContent).toContain("来源");
    expect(taskRail?.textContent).toContain("参与");
    expect(taskRail?.textContent).toContain("结果");
    expect(taskRail?.textContent).toContain("接入顶部任务轨道");
    expect(taskRail?.textContent).toContain("步骤 1读取任务区结构已完成");
    expect(taskRail?.textContent).toContain("步骤 2接入顶部任务轨道进行中");
    expect(taskRail?.textContent).toContain("步骤 3验证顶部浮层待处理");
    expect(taskRail?.textContent).toContain("另有 1 步");
    expect(taskRail?.textContent).not.toContain("整理交付结果");
    expect(taskRail?.textContent).toContain("模型cloud / reasoner-pro");
    expect(taskRail?.textContent).toContain("权限按需确认");
    expect(taskRail?.textContent).toContain("思考中");
    expect(taskRail?.textContent).toContain("工作区project");
    expect(taskRail?.textContent).toContain("本地");
    expect(taskRail?.textContent).toContain("feature");
    expect(taskRail?.textContent).toContain("3 个文件");
    expect(taskRail?.textContent).toContain("状态running");
    expect(taskRail?.textContent).toContain("线程thread-1");
    expect(taskRail?.textContent).toContain("轮次turn-1");
    expect(taskRail?.textContent).toContain("目标完成任务轨道");
    expect(taskRail?.textContent).toContain("变更2 文件");
    expect(taskRail?.textContent).toContain("来源4 项");
    expect(taskRail?.textContent).toContain("AG-UI spec");
    expect(taskRail?.textContent).toContain("example.com");
    expect(taskRail?.textContent).toContain("context.md");
    expect(taskRail?.textContent).toContain("另有 1 项");
    expect(taskRail?.textContent).toContain("已关联");
    expect(taskRail?.textContent).toContain("子任务2/3");
    expect(taskRail?.textContent).toContain("参与");
    expect(taskRail?.textContent).toContain("执行");
    expect(taskRail?.textContent).toContain("rg");
    expect(taskRail?.textContent).toContain("已完成");
    expect(taskRail?.textContent).toContain("输出");
    expect(taskRail?.textContent).toContain("task-rail.md");
    expect(taskRail?.textContent).toContain("分屏");
    expect(taskRail?.textContent).toContain("可打开");
    expect(taskRail?.textContent).not.toContain("找到顶部工具栏");
    expect(taskRail?.textContent).not.toContain(
      "internal/roadmap/agent-workspace/task-rail.md",
    );
    expect(taskRail?.textContent).not.toContain("/tmp/project");
    expect(
      popover?.textContent?.replace(taskRail?.textContent ?? "", ""),
    ).not.toContain("来源");
    expect(
      document.body.querySelector(
        '[data-testid="task-center-task-rail-context"]',
      ),
    ).toBeNull();
    expect(
      Array.from(
        document.body.querySelectorAll(
          '[data-testid="task-center-run-control-surface"]',
        ),
      ),
    ).toHaveLength(1);
    expect(
      document.body.querySelector(
        '[data-testid="task-center-run-control-environment"]',
      ),
    ).not.toBeNull();
    expect(
      document.body.querySelector(
        '[data-testid="task-center-run-control-controls"]',
      ),
    ).not.toBeNull();
    expect(
      document.body.querySelector(
        '[data-testid="task-center-run-control-plan"]',
      ),
    ).not.toBeNull();
    expect(
      document.body.querySelector('[data-testid="task-center-task-rail-plan"]'),
    ).toBeNull();
    expect(
      document.body.querySelector(
        '[data-testid="task-center-run-control-goal"]',
      ),
    ).not.toBeNull();
    expect(
      document.body.querySelector(
        '[data-testid="task-center-run-control-sources"]',
      ),
    ).not.toBeNull();
    expect(
      document.body.querySelector(
        '[data-testid="task-center-run-control-subagents"]',
      ),
    ).not.toBeNull();
    expect(
      document.body.querySelector(
        '[data-testid="task-center-run-control-outputs"]',
      ),
    ).not.toBeNull();
    expect(
      document.body.querySelector(
        '[data-testid="task-center-task-rail-activity"]',
      ),
    ).toBeNull();
    expect(
      document.body.querySelector(
        '[data-testid="task-center-task-rail-outputs"]',
      ),
    ).toBeNull();
    expect(
      Array.from(
        document.body.querySelectorAll(
          '[data-testid="task-center-run-control-sources"] [data-testid="task-center-run-control-source-row"]',
        ),
      )
        .map((item) => item.textContent)
        .join(" "),
    ).toContain("AG-UI specexample.comcontext.md另有 1 项已关联");
    expect(items.map((item) => item.getAttribute("data-kind"))).not.toContain(
      "tool",
    );
    expect(items.map((item) => item.getAttribute("data-kind"))).toContain(
      "artifact",
    );

    const outputButton = document.body.querySelector<HTMLButtonElement>(
      'button[data-testid="task-center-task-rail-item"][data-kind="artifact"]',
    );
    expect(outputButton?.getAttribute("aria-label")).toBe(
      "打开输出文件：task-rail.md",
    );

    await act(async () => {
      outputButton?.click();
      await Promise.resolve();
    });

    expect(onOpenOutput).toHaveBeenCalledWith(
      "internal/roadmap/agent-workspace/task-rail.md",
    );
  });

  it("环境信息来源区应按需读取导入会话的完整运行记录", async () => {
    const container = renderToolbar({
      taskRail: {
        sessionId: "session-imported",
        workflowSteps: [],
        messages: [],
        context: {
          sourceCount: 1,
          sourceLabels: ["restored-history"],
        },
        threadItems: [
          {
            id: "imported-command",
            type: "command_execution",
            thread_id: "thread-1",
            turn_id: "turn-1",
            sequence: 1,
            status: "completed",
            command: "npm test",
            cwd: "/workspace/imported-history",
            started_at: "2026-06-16T10:00:00.000Z",
            completed_at: "2026-06-16T10:00:01.000Z",
            updated_at: "2026-06-16T10:00:01.000Z",
            metadata: {
              imported: true,
              source_client: "codex",
              sourcePath: "/Users/example/.codex/sessions/thread.jsonl",
            },
          },
        ],
      },
    });
    const trigger = container.querySelector(
      '[data-testid="task-center-environment-trigger"]',
    ) as HTMLButtonElement | null;

    await act(async () => {
      trigger?.click();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(mockReadConversationImportRuntimeEvents).not.toHaveBeenCalled();
    const toggle = document.body.querySelector<HTMLButtonElement>(
      '[data-testid="imported-runtime-detail-toggle"]',
    );
    expect(toggle?.textContent).toContain("查看完整记录");

    await act(async () => {
      toggle?.click();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(mockReadConversationImportRuntimeEvents).toHaveBeenCalledWith({
      sessionId: "session-imported",
      offset: 0,
      limit: 10,
    });
    const panel = document.body.querySelector(
      '[data-testid="imported-runtime-detail-panel"]',
    );
    expect(panel?.textContent).toContain("已默认展示 80 / 120 条");
    expect(panel?.textContent).toContain("完整记录保留 40 条");
    expect(panel?.textContent).toContain("command execution");
    expect(panel?.textContent).toContain("轮次 2 · 事件 3");
    expect(panel?.textContent).toContain("npm test");
    expect(panel?.textContent).not.toContain(
      "/Users/example/.codex/sessions/thread.jsonl",
    );
  });

  it("导入会话即使当前时间线窗口没有导入标记也应显示完整运行记录入口", async () => {
    const container = renderToolbar({
      taskRail: {
        sessionId: "session-imported",
        workflowSteps: [],
        messages: [],
        context: {
          sourceCount: 1,
          sourceLabels: ["docs.example.com"],
        },
        executionRuntime: {
          session_id: "session-imported",
          source_client: "codex",
          imported_thread_settings: {
            cwd: "/tmp/project",
          },
          source: "session",
        },
        threadItems: [
          {
            id: "web-source",
            type: "web_search",
            thread_id: "thread-1",
            turn_id: "turn-1",
            sequence: 1,
            status: "completed",
            query: "workspace docs",
            started_at: "2026-06-16T10:00:00.000Z",
            completed_at: "2026-06-16T10:00:01.000Z",
            updated_at: "2026-06-16T10:00:01.000Z",
          },
        ],
      },
    });
    const trigger = container.querySelector(
      '[data-testid="task-center-environment-trigger"]',
    ) as HTMLButtonElement | null;

    await act(async () => {
      trigger?.click();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    const toggle = document.body.querySelector<HTMLButtonElement>(
      '[data-testid="imported-runtime-detail-toggle"]',
    );
    expect(toggle?.textContent).toContain("查看完整记录");

    await act(async () => {
      toggle?.click();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(mockReadConversationImportRuntimeEvents).toHaveBeenCalledWith({
      sessionId: "session-imported",
      offset: 0,
      limit: 10,
    });
  });

  it("导入会话在当前窗口未物化条目且缺少运行时摘要时仍应从 threadRead 显示完整记录入口", async () => {
    const container = renderToolbar({
      taskRail: {
        sessionId: "session-imported-thread-read",
        workflowSteps: [],
        messages: [],
        threadItems: [],
        threadRead: {
          thread_id: "thread-imported",
          status: "completed",
          diagnostics: {
            warning_count: 0,
            context_compaction_count: 0,
            failed_tool_call_count: 0,
            failed_command_count: 0,
            pending_request_count: 0,
          },
          runtime_summary: {
            sourceClient: "codex",
          } as unknown as AgentRuntimeThreadReadModel["runtime_summary"],
        },
      },
    });
    const trigger = container.querySelector(
      '[data-testid="task-center-environment-trigger"]',
    ) as HTMLButtonElement | null;

    await act(async () => {
      trigger?.click();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    const sourceSection = document.body.querySelector(
      '[data-testid="task-center-run-control-sources"]',
    );
    const toggle = document.body.querySelector<HTMLButtonElement>(
      '[data-testid="imported-runtime-detail-toggle"]',
    );
    expect(sourceSection).not.toBeNull();
    expect(toggle?.textContent).toContain("查看完整记录");

    await act(async () => {
      toggle?.click();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(mockReadConversationImportRuntimeEvents).toHaveBeenCalledWith({
      sessionId: "session-imported-thread-read",
      offset: 0,
      limit: 10,
    });
  });

  it("普通来源会话不应显示完整运行记录入口", async () => {
    const container = renderToolbar({
      taskRail: {
        sessionId: "session-normal",
        workflowSteps: [],
        messages: [],
        context: {
          sourceCount: 1,
          sourceLabels: ["docs.example.com"],
        },
        threadItems: [
          {
            id: "web-source",
            type: "web_search",
            thread_id: "thread-1",
            turn_id: "turn-1",
            sequence: 1,
            status: "completed",
            query: "workspace docs",
            started_at: "2026-06-16T10:00:00.000Z",
            completed_at: "2026-06-16T10:00:01.000Z",
            updated_at: "2026-06-16T10:00:01.000Z",
          },
        ],
      },
    });
    const trigger = container.querySelector(
      '[data-testid="task-center-environment-trigger"]',
    ) as HTMLButtonElement | null;

    await act(async () => {
      trigger?.click();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(
      document.body.querySelector(
        '[data-testid="imported-runtime-detail-panel"]',
      ),
    ).toBeNull();
    expect(mockReadConversationImportRuntimeEvents).not.toHaveBeenCalled();
  });

  it("纯导入会话即使没有普通来源摘要也应显示完整运行记录入口", async () => {
    const container = renderToolbar({
      taskRail: {
        sessionId: "session-imported-only",
        workflowSteps: [],
        messages: [],
        threadItems: [
          {
            id: "imported-reasoning",
            type: "reasoning",
            thread_id: "thread-1",
            turn_id: "turn-1",
            sequence: 1,
            status: "completed",
            text: "keep going",
            summary: ["keep going"],
            started_at: "2026-06-16T10:00:00.000Z",
            completed_at: "2026-06-16T10:00:01.000Z",
            updated_at: "2026-06-16T10:00:01.000Z",
            metadata: {
              imported: true,
              source_client: "claude_code",
            },
          },
        ],
      },
    });
    const trigger = container.querySelector(
      '[data-testid="task-center-environment-trigger"]',
    ) as HTMLButtonElement | null;

    await act(async () => {
      trigger?.click();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    const sourceSection = document.body.querySelector(
      '[data-testid="task-center-run-control-sources"]',
    );
    expect(sourceSection).not.toBeNull();
    expect(sourceSection?.textContent).toContain("查看完整记录");
  });

  it("环境信息区域应消费运行日志与任务文件输出，并隐藏超出项", async () => {
    const onOpenOutput = vi.fn();
    const container = renderToolbar({
      taskRail: {
        workflowSteps: [],
        messages: [
          {
            id: "assistant-output",
            role: "assistant",
            content: "",
            timestamp: new Date("2026-06-16T10:00:00.000Z"),
            artifacts: [
              {
                id: "artifact-one",
                type: "document",
                title: "one.md",
                content: "one",
                status: "complete",
                createdAt: Date.parse("2026-06-16T10:00:01.000Z"),
                updatedAt: Date.parse("2026-06-16T10:00:01.000Z"),
                position: { start: 0, end: 3 },
                meta: { filePath: "docs/one.md" },
              },
              {
                id: "artifact-two",
                type: "document",
                title: "two.md",
                content: "two",
                status: "complete",
                createdAt: Date.parse("2026-06-16T10:00:02.000Z"),
                updatedAt: Date.parse("2026-06-16T10:00:02.000Z"),
                position: { start: 0, end: 3 },
                meta: { filePath: "docs/two.md" },
              },
              {
                id: "artifact-three",
                type: "document",
                title: "three.md",
                content: "three",
                status: "complete",
                createdAt: Date.parse("2026-06-16T10:00:03.000Z"),
                updatedAt: Date.parse("2026-06-16T10:00:03.000Z"),
                position: { start: 0, end: 5 },
                meta: { filePath: "docs/three.md" },
              },
            ],
          },
        ],
        activityLogs: [
          {
            id: "log-write",
            name: "write_file",
            status: "running",
            timeLabel: "10:05",
            artifactPaths: ["drafts/result.md"],
            runId: "run-1",
            source: "write_file",
          },
        ],
        creationTaskEvents: [
          {
            taskId: "image-task-1",
            taskType: "image_generate",
            path: "images/result.png",
            createdAt: Date.parse("2026-06-16T10:06:00.000Z"),
            timeLabel: "10:06",
          },
        ],
        onOpenOutput,
      },
    });
    const trigger = container.querySelector(
      '[data-testid="task-center-environment-trigger"]',
    ) as HTMLButtonElement | null;

    await act(async () => {
      trigger?.click();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    const taskRail = document.body.querySelector(
      '[data-testid="task-center-task-rail"]',
    );
    const outputItems = Array.from(
      document.body.querySelectorAll(
        '[data-testid="task-center-task-rail-item"]',
      ),
    );

    expect(taskRail?.textContent).toContain("输出");
    expect(taskRail?.textContent).toContain("执行 write_file");
    expect(taskRail?.textContent).toContain("result.png");
    expect(taskRail?.textContent).toContain("另有 1 个输出");
    expect(taskRail?.textContent).not.toContain("docs/one.md");
    expect(outputItems).toHaveLength(4);

    const runningOutput = document.body.querySelector<HTMLButtonElement>(
      'button[data-testid="task-center-task-rail-item"][data-status="running"]',
    );
    await act(async () => {
      runningOutput?.click();
      await Promise.resolve();
    });

    expect(onOpenOutput).toHaveBeenCalledWith("drafts/result.md");
  });

  it("环境信息区域应展示待确认摘要，并通过既有响应入口处理工具确认", async () => {
    const onRespondToAction = vi.fn();
    const container = renderToolbar({
      taskRail: {
        workflowSteps: [],
        messages: [],
        pendingActions: [
          {
            requestId: "approval-write",
            actionType: "tool_confirmation",
            toolName: "write_file",
            prompt: "允许保存 result.md？",
          },
          {
            requestId: "question-topic",
            actionType: "ask_user",
            questions: [{ question: "继续写哪一节？" }],
          },
          {
            requestId: "approval-shell",
            actionType: "tool_confirmation",
            toolName: "shell",
            prompt: "允许运行 npm test？",
            status: "queued",
          },
        ],
        submittedActionsInFlight: [
          {
            requestId: "approval-other",
            actionType: "tool_confirmation",
            toolName: "shell",
            status: "submitted",
            prompt: "允许运行 npm run build？",
          },
        ],
        onRespondToAction,
      },
    });
    const trigger = container.querySelector(
      '[data-testid="task-center-environment-trigger"]',
    ) as HTMLButtonElement | null;

    await act(async () => {
      trigger?.click();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    const approvals = Array.from(
      document.body.querySelectorAll(
        '[data-testid="task-center-task-rail-approval-item"]',
      ),
    );
    const taskRail = document.body.querySelector(
      '[data-testid="task-center-task-rail"]',
    );

    expect(taskRail?.textContent).toContain("确认");
    expect(taskRail?.textContent).toContain("允许保存 result.md？");
    expect(taskRail?.textContent).toContain("等待回答");
    expect(taskRail?.textContent).toContain("另有 2 条确认");
    expect(taskRail?.textContent).not.toContain("允许运行 npm test？");
    expect(taskRail?.textContent).not.toContain("npm run build");
    expect(approvals).toHaveLength(2);
    expect(approvals[0]?.getAttribute("data-status")).toBe("pending");
    expect(approvals[1]?.getAttribute("data-status")).toBe("pending");

    const approveButton = Array.from(
      approvals[0]?.querySelectorAll("button") ?? [],
    ).find((button) => button.textContent?.includes("允许"));
    const rejectButton = Array.from(
      approvals[0]?.querySelectorAll("button") ?? [],
    ).find((button) => button.textContent?.includes("拒绝"));
    expect(approvals[1]?.querySelector("button")).toBeNull();

    await act(async () => {
      approveButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });
    expect(onRespondToAction).toHaveBeenCalledWith({
      requestId: "approval-write",
      actionType: "tool_confirmation",
      confirmed: true,
      response: "approved",
    });

    await act(async () => {
      rejectButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });
    expect(onRespondToAction).toHaveBeenLastCalledWith({
      requestId: "approval-write",
      actionType: "tool_confirmation",
      confirmed: false,
      response: "rejected",
    });
  });

  it("环境信息区域应展示已处理确认结果且不再提供响应按钮", async () => {
    const onRespondToAction = vi.fn();
    const container = renderToolbar({
      taskRail: {
        workflowSteps: [],
        messages: [],
        threadItems: [
          {
            id: "approval-write-item",
            type: "approval_request",
            thread_id: "thread-1",
            turn_id: "turn-1",
            sequence: 1,
            status: "completed",
            request_id: "approval-write",
            action_type: "tool_confirmation",
            prompt: "允许保存 result.md？",
            tool_name: "write_file",
            response: "approved",
            started_at: "2026-06-16T10:00:00.000Z",
            completed_at: "2026-06-16T10:00:03.000Z",
            updated_at: "2026-06-16T10:00:03.000Z",
          },
          {
            id: "question-topic-item",
            type: "request_user_input",
            thread_id: "thread-1",
            turn_id: "turn-1",
            sequence: 2,
            status: "completed",
            request_id: "question-topic",
            action_type: "ask_user",
            questions: [{ question: "继续写哪一节？" }],
            response: { answer: "先写评测标准" },
            started_at: "2026-06-16T10:00:01.000Z",
            completed_at: "2026-06-16T10:00:04.000Z",
            updated_at: "2026-06-16T10:00:04.000Z",
          },
        ],
        onRespondToAction,
      },
    });
    const trigger = container.querySelector(
      '[data-testid="task-center-environment-trigger"]',
    ) as HTMLButtonElement | null;

    await act(async () => {
      trigger?.click();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    const approvals = Array.from(
      document.body.querySelectorAll(
        '[data-testid="task-center-task-rail-approval-item"]',
      ),
    );
    const taskRail = document.body.querySelector(
      '[data-testid="task-center-task-rail"]',
    );

    expect(taskRail?.textContent).toContain("确认");
    expect(taskRail?.textContent).toContain("已回答");
    expect(taskRail?.textContent).toContain("继续写哪一节？");
    expect(taskRail?.textContent).toContain("已允许");
    expect(taskRail?.textContent).toContain("允许保存 result.md？");
    expect(approvals.map((item) => item.getAttribute("data-status"))).toEqual([
      "answered",
      "approved",
    ]);
    expect(approvals[0]?.querySelector("button")).toBeNull();
    expect(approvals[1]?.querySelector("button")).toBeNull();
    expect(onRespondToAction).not.toHaveBeenCalled();
  });

  it("环境信息区域应展示恢复后的执行轨迹和文件产物", async () => {
    const onOpenOutput = vi.fn();
    const container = renderToolbar({
      taskRail: {
        workflowSteps: [],
        messages: [],
        threadItems: [
          {
            id: "command-test",
            type: "command_execution",
            thread_id: "thread-1",
            turn_id: "turn-1",
            sequence: 1,
            status: "completed",
            command: "npm test",
            cwd: "/tmp/project",
            aggregated_output: "1 failed",
            exit_code: 1,
            started_at: "2026-06-16T10:00:00.000Z",
            completed_at: "2026-06-16T10:00:02.000Z",
            updated_at: "2026-06-16T10:00:02.000Z",
          },
          {
            id: "web-search",
            type: "web_search",
            thread_id: "thread-1",
            turn_id: "turn-1",
            sequence: 2,
            status: "completed",
            query: "agent workspace evaluation",
            output: "找到 3 个来源",
            started_at: "2026-06-16T10:00:03.000Z",
            completed_at: "2026-06-16T10:00:04.000Z",
            updated_at: "2026-06-16T10:00:04.000Z",
          },
          {
            id: "file-result",
            type: "file_artifact",
            thread_id: "thread-1",
            turn_id: "turn-1",
            sequence: 3,
            status: "completed",
            path: "docs/result.md",
            source: "write_file",
            started_at: "2026-06-16T10:00:05.000Z",
            completed_at: "2026-06-16T10:00:06.000Z",
            updated_at: "2026-06-16T10:00:06.000Z",
          },
        ],
        onOpenOutput,
      },
    });
    const trigger = container.querySelector(
      '[data-testid="task-center-environment-trigger"]',
    ) as HTMLButtonElement | null;

    await act(async () => {
      trigger?.click();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    const taskRail = document.body.querySelector(
      '[data-testid="task-center-task-rail"]',
    );
    const activityItems = Array.from(
      document.body.querySelectorAll(
        '[data-testid="task-center-task-rail-activity-item"]',
      ),
    );

    expect(taskRail?.textContent).toContain("执行");
    expect(taskRail?.textContent).toContain("执行 npm test");
    expect(taskRail?.textContent).toContain("需处理");
    expect(taskRail?.textContent).toContain("执行 agent workspace evaluation");
    expect(taskRail?.textContent).toContain("已完成");
    expect(taskRail?.textContent).toContain("输出");
    expect(taskRail?.textContent).toContain("result.md");
    expect(
      activityItems.map((item) => item.getAttribute("data-status")),
    ).toEqual(["failed", "completed"]);

    const outputButton = document.body.querySelector<HTMLButtonElement>(
      'button[data-testid="task-center-task-rail-item"][data-kind="artifact"]',
    );

    await act(async () => {
      outputButton?.click();
      await Promise.resolve();
    });

    expect(onOpenOutput).toHaveBeenCalledWith("docs/result.md");
  });

  it("环境信息区域应从历史计划事实恢复计划清单", async () => {
    const container = renderToolbar({
      taskRail: {
        workflowSteps: [],
        messages: [],
        threadItems: [
          {
            id: "plan-read",
            type: "plan",
            thread_id: "thread-1",
            turn_id: "turn-1",
            sequence: 1,
            status: "completed",
            text: "读取任务区域",
            started_at: "2026-06-16T10:00:00.000Z",
            completed_at: "2026-06-16T10:00:01.000Z",
            updated_at: "2026-06-16T10:00:01.000Z",
          },
          {
            id: "plan-restore",
            type: "plan",
            thread_id: "thread-1",
            turn_id: "turn-1",
            sequence: 2,
            status: "in_progress",
            text: "- [x] 读取任务区域\n- [ ] 恢复运行计划",
            metadata: {
              revisionId: "proposed_plan:task-rail-2",
            },
            started_at: "2026-06-16T10:00:02.000Z",
            updated_at: "2026-06-16T10:00:03.000Z",
          },
        ],
      },
    });
    const trigger = container.querySelector(
      '[data-testid="task-center-environment-trigger"]',
    ) as HTMLButtonElement | null;

    await act(async () => {
      trigger?.click();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    const planSection = document.body.querySelector(
      '[data-testid="task-center-run-control-plan"]',
    );
    const planRevision = document.body.querySelector(
      '[data-testid="task-center-run-control-plan-revision"]',
    );
    const planItems = Array.from(
      document.body.querySelectorAll(
        '[data-testid="task-center-run-control-plan-item"]',
      ),
    );

    expect(planSection?.textContent).toContain("计划");
    expect(planRevision?.textContent).toContain("计划");
    expect(planRevision?.getAttribute("title")).toBe(
      "当前计划版本：proposed_plan:task-rail-2",
    );
    expect(planRevision?.getAttribute("data-plan-revision-id")).toBe(
      "proposed_plan:task-rail-2",
    );
    expect(planRevision?.getAttribute("data-plan-source")).toBe(
      "thread_item",
    );
    expect(planRevision?.getAttribute("data-plan-turn-id")).toBe("turn-1");
    expect(planSection?.textContent).toContain("读取任务区域");
    expect(planSection?.textContent).toContain("恢复运行计划");
    expect(planItems.map((item) => item.getAttribute("data-status"))).toEqual([
      "completed",
      "running",
    ]);
  });

  it("环境信息区域应从 todo items 恢复计划清单", async () => {
    const container = renderToolbar({
      taskRail: {
        workflowSteps: [],
        messages: [],
        todoItems: [
          {
            content: "补齐恢复逻辑",
            status: "completed",
          },
          {
            content: "验证同一区域展示",
            status: "in_progress",
          },
          {
            content: "整理 evidence",
            status: "pending",
          },
        ],
      },
    });
    const trigger = container.querySelector(
      '[data-testid="task-center-environment-trigger"]',
    ) as HTMLButtonElement | null;

    await act(async () => {
      trigger?.click();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    const planSection = document.body.querySelector(
      '[data-testid="task-center-run-control-plan"]',
    );
    const planItems = Array.from(
      document.body.querySelectorAll(
        '[data-testid="task-center-run-control-plan-item"]',
      ),
    );

    expect(planSection?.textContent).toContain("补齐恢复逻辑");
    expect(planSection?.textContent).toContain("验证同一区域展示");
    expect(planSection?.textContent).toContain("整理 evidence");
    expect(planItems.map((item) => item.getAttribute("data-status"))).toEqual([
      "completed",
      "running",
      "pending",
    ]);
  });

  it("历史恢复态应在同一运行控制区域恢复环境、计划、来源、审批、子任务和产物", async () => {
    const onOpenOutput = vi.fn();
    const container = renderToolbar({
      taskRail: {
        workflowSteps: [],
        messages: [],
        todoItems: [
          {
            content: "恢复运行环境",
            status: "completed",
          },
          {
            content: "恢复计划与来源",
            status: "in_progress",
          },
          {
            content: "恢复产物入口",
            status: "pending",
          },
          {
            content: "写入正式 evidence",
            status: "pending",
          },
        ],
        threadItems: [
          {
            id: "restore-command",
            type: "command_execution",
            thread_id: "restore-thread",
            turn_id: "restore-turn",
            sequence: 1,
            status: "completed",
            command: "npm run restore:check",
            cwd: "/tmp/project",
            aggregated_output: "restore smoke passed",
            exit_code: 0,
            started_at: "2026-06-16T10:00:00.000Z",
            completed_at: "2026-06-16T10:00:01.000Z",
            updated_at: "2026-06-16T10:00:01.000Z",
          },
          {
            id: "restore-search",
            type: "web_search",
            thread_id: "restore-thread",
            turn_id: "restore-turn",
            sequence: 2,
            status: "completed",
            query: "run control restore sources",
            output: "source linked",
            started_at: "2026-06-16T10:00:02.000Z",
            completed_at: "2026-06-16T10:00:03.000Z",
            updated_at: "2026-06-16T10:00:03.000Z",
          },
          {
            id: "restore-file",
            type: "file_artifact",
            thread_id: "restore-thread",
            turn_id: "restore-turn",
            sequence: 3,
            status: "completed",
            path: "internal/roadmap/agent-workspace/run-control-restore.md",
            source: "write_file",
            started_at: "2026-06-16T10:00:04.000Z",
            completed_at: "2026-06-16T10:00:05.000Z",
            updated_at: "2026-06-16T10:00:05.000Z",
          },
          {
            id: "restore-approval-resolved",
            type: "approval_request",
            thread_id: "restore-thread",
            turn_id: "restore-turn",
            sequence: 4,
            status: "completed",
            request_id: "approval-restore-write",
            action_type: "tool_confirmation",
            prompt: "允许写入 restore.md？",
            tool_name: "write_file",
            response: "approved",
            started_at: "2026-06-16T10:00:06.000Z",
            completed_at: "2026-06-16T10:00:07.000Z",
            updated_at: "2026-06-16T10:00:07.000Z",
          },
        ],
        pendingActions: [
          {
            requestId: "approval-restore-evidence",
            actionType: "tool_confirmation",
            toolName: "write_file",
            prompt: "允许保存 evidence？",
          },
        ],
        threadRead: {
          thread_id: "restore-thread",
          active_turn_id: "restore-turn",
          profile_status: "completed",
          managed_objective: {
            objective_id: "restore-objective",
            owner_kind: "agent_session",
            owner_id: "restore-session",
            objective_text: "恢复运行控制区",
            success_criteria: [],
            status: "active",
            last_artifact_refs: [],
            created_at: "2026-06-16T10:00:00.000Z",
            updated_at: "2026-06-16T10:00:08.000Z",
          },
          context_summary: {
            sources: ["https://docs.example.com/run-control"],
            retrieval_refs: [
              {
                title: "Restore spec",
                path: "docs/restore.md",
              },
            ],
            team_memory_refs: [
              {
                key: "workspace-restore",
              },
            ],
          },
          evidence_summary: {
            evidence_refs: ["evidence/restore-evidence.json"],
          },
          artifacts: [
            {
              title: "restore.md",
              path: "internal/roadmap/agent-workspace/run-control-restore.md",
            },
          ],
          change_summary: {
            changed_file_count: 2,
            changed_files: [
              "src/components/agent/chat/components/TaskCenterUtilityToolbar.integration.test.tsx",
              "internal/roadmap/agent-workspace/evidence/agent-workspace-run-control-restore.20260616-0000.json",
            ],
            patch_count: 1,
          },
        } as any,
        childSubagentSessions: [
          {
            id: "subagent-running",
            name: "恢复检查",
            created_at: 1,
            updated_at: 2,
            session_type: "subagent",
            runtime_status: "running",
          },
          {
            id: "subagent-done",
            name: "证据整理",
            created_at: 1,
            updated_at: 3,
            session_type: "subagent",
            runtime_status: "completed",
          },
        ],
        context: {
          providerType: "cloud",
          model: "gpt-5-pro",
          accessMode: "current",
          reasoningEffort: "high",
          workspacePath: "/tmp/project",
        },
        onOpenOutput,
      },
    });
    const trigger = container.querySelector(
      '[data-testid="task-center-environment-trigger"]',
    ) as HTMLButtonElement | null;

    await act(async () => {
      trigger?.click();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    const taskRail = document.body.querySelector(
      '[data-testid="task-center-task-rail"]',
    );
    const runControl = document.body.querySelector(
      '[data-testid="task-center-run-control-surface"]',
    );
    const planItems = Array.from(
      document.body.querySelectorAll(
        '[data-testid="task-center-run-control-plan-item"]',
      ),
    );
    const approvalItems = Array.from(
      document.body.querySelectorAll(
        '[data-testid="task-center-task-rail-approval-item"]',
      ),
    );

    expect(taskRail?.contains(runControl)).toBe(true);
    expect(taskRail?.textContent).toContain("环境");
    expect(taskRail?.textContent).toContain("本地");
    expect(taskRail?.textContent).toContain("工作区project");
    expect(taskRail?.textContent).toContain("分支feature/task-center");
    expect(taskRail?.textContent).toContain("Git3 个文件");
    expect(taskRail?.textContent).toContain("变更2 文件");
    expect(taskRail?.textContent).toContain("运行");
    expect(taskRail?.textContent).toContain("状态completed");
    expect(taskRail?.textContent).toContain("线程restore-thread");
    expect(taskRail?.textContent).toContain("轮次restore-turn");
    expect(taskRail?.textContent).toContain("模型cloud / gpt-5-pro");
    expect(taskRail?.textContent).toContain("权限按需确认");
    expect(taskRail?.textContent).toContain("思考高");
    expect(taskRail?.textContent).toContain("计划");
    expect(taskRail?.textContent).toContain("恢复运行环境");
    expect(taskRail?.textContent).toContain("恢复计划与来源");
    expect(taskRail?.textContent).toContain("恢复产物入口");
    expect(taskRail?.textContent).toContain("另有 1 步");
    expect(planItems.map((item) => item.getAttribute("data-status"))).toEqual([
      "completed",
      "running",
      "pending",
    ]);
    expect(taskRail?.textContent).toContain("目标恢复运行控制区");
    expect(taskRail?.textContent).toContain("来源");
    expect(taskRail?.textContent).toContain("docs.example.com");
    expect(taskRail?.textContent).toContain("Restore spec");
    expect(taskRail?.textContent).toContain("workspace-restore");
    expect(taskRail?.textContent).toContain("已关联");
    expect(taskRail?.textContent).toContain("子任务1/2");
    expect(taskRail?.textContent).toContain("执行");
    expect(taskRail?.textContent).toContain("执行 npm run restore:check");
    expect(taskRail?.textContent).toContain("执行 run control restore sources");
    expect(taskRail?.textContent).toContain("确认1 条待确认");
    expect(taskRail?.textContent).toContain("允许保存 evidence？");
    expect(taskRail?.textContent).toContain("已允许");
    expect(taskRail?.textContent).toContain("允许写入 restore.md？");
    expect(taskRail?.textContent).toContain("输出1 项");
    expect(taskRail?.textContent).toContain("restore.md");
    expect(
      approvalItems.map((item) => item.getAttribute("data-status")),
    ).toEqual(["pending", "approved"]);
    expect(
      document.body.querySelector('[data-testid="task-center-task-rail-plan"]'),
    ).toBeNull();
    expect(
      document.body.querySelector(
        '[data-testid="task-center-task-rail-context"]',
      ),
    ).toBeNull();
    expect(
      document.body.querySelector(
        '[data-testid="task-center-task-rail-outputs"]',
      ),
    ).toBeNull();

    const outputButton = document.body.querySelector<HTMLButtonElement>(
      'button[data-testid="task-center-task-rail-item"][data-kind="artifact"]',
    );

    await act(async () => {
      outputButton?.click();
      await Promise.resolve();
    });

    expect(onOpenOutput).toHaveBeenCalledWith(
      "internal/roadmap/agent-workspace/run-control-restore.md",
    );
  });

  it("Shell、工作台与聊天按钮应分别接入真实能力并保持当前态", async () => {
    const onToggleCanvas = vi.fn();
    const onToggleShellPanel = vi.fn();
    const container = renderToolbar({
      isCanvasOpen: false,
      onToggleCanvas,
      onToggleShellPanel,
    });
    const shellButton = container.querySelector(
      '[data-testid="task-center-shell-toggle"]',
    ) as HTMLButtonElement | null;
    const workbenchButton = container.querySelector(
      '[data-testid="task-center-workbench-toggle"]',
    ) as HTMLButtonElement | null;
    const chatButton = container.querySelector(
      '[data-testid="task-center-chat-toggle"]',
    ) as HTMLButtonElement | null;
    const toolGroups = container.querySelectorAll(
      '[data-testid^="task-center-tool-group-"]',
    );

    expect(shellButton?.disabled).toBe(false);
    expect(workbenchButton?.disabled).toBe(false);
    expect(chatButton).toBeNull();
    expect(toolGroups).toHaveLength(3);
    expect(
      container.querySelector('[data-testid="task-center-tool-group-app"]'),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-testid="task-center-tool-group-environment"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="task-center-tool-group-panels"]'),
    ).not.toBeNull();

    await act(async () => {
      shellButton?.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(onToggleShellPanel).toHaveBeenCalledTimes(1);

    act(() => {
      workbenchButton?.click();
    });

    expect(onToggleCanvas).toHaveBeenCalledTimes(1);
  });

  it("Task Center 应在可切换 Harness 时保留 5 个工具按钮", () => {
    const onToggleHarnessPanel = vi.fn();
    const container = renderToolbar({
      showHarnessToggle: false,
      onToggleHarnessPanel,
    });
    const harnessButton = container.querySelector(
      '[data-testid="task-center-harness-toggle"]',
    ) as HTMLButtonElement | null;
    const panelGroup = container.querySelector(
      '[data-testid="task-center-tool-group-panels"]',
    );

    expect(harnessButton).not.toBeNull();
    expect(panelGroup?.querySelectorAll("button")).toHaveLength(3);

    act(() => {
      harnessButton?.click();
    });

    expect(onToggleHarnessPanel).toHaveBeenCalledTimes(1);
  });

  it("没有项目目录时 Shell 入口应 fail-closed", () => {
    const container = renderToolbar({ projectRootPath: null });
    const shellButton = container.querySelector(
      '[data-testid="task-center-shell-toggle"]',
    ) as HTMLButtonElement | null;

    expect(shellButton?.disabled).toBe(true);
  });
});

describe("TaskCenterShellPanel", () => {
  it("应固定渲染底部 xterm Shell 面板并启动项目 Shell 会话", async () => {
    const onClose = vi.fn();
    const onHeightChange = vi.fn();
    const onToggleMaximize = vi.fn();
    const container = mount(
      <TaskCenterShellPanel
        heightPx={236}
        maximized={false}
        projectRootPath="/tmp/project"
        onClose={onClose}
        onHeightChange={onHeightChange}
        onToggleMaximize={onToggleMaximize}
      />,
    );
    const panel = container.querySelector(
      '[data-testid="task-center-bottom-shell-panel"]',
    );

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(panel).not.toBeNull();
    expect((panel as HTMLElement | null)?.style.height).toBe("236px");
    expect(
      container.querySelector('[data-testid="task-center-shell-run"]'),
    ).toBeNull();
    expect(mockStartProjectShellSession).toHaveBeenCalledWith({
      rootPath: "/tmp/project",
      cols: 120,
      rows: 14,
    });
    expect(mockListenProjectShellSessionEvents).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("coso@host: project");
    expect(mockXtermLoadAddon).toHaveBeenCalledTimes(1);
    expect(mockFitAddonFit).toHaveBeenCalledTimes(1);
    expect(mockXtermTerminalOptions[0]).toMatchObject({
      theme: expect.objectContaining({
        background: "#ffffff",
        foreground: "#1f2937",
        blue: "#0969da",
        brightBlue: "#1d4ed8",
        green: "#16a34a",
        brightGreen: "#22c55e",
        yellow: "#ca8a04",
        magenta: "#c026d3",
        scrollbarSliderBackground: "#cbd5e1",
      }),
    });
    expect(mockXtermWriteln).not.toHaveBeenCalledWith(
      "Shell 已就绪，可以输入命令",
    );
    expect(
      container.querySelector('[data-testid="task-center-shell-terminal"]')
        ?.className,
    ).toContain("[&_.xterm]:!bg-white");

    act(() => {
      (
        container.querySelector(
          '[data-testid="task-center-shell-maximize"]',
        ) as HTMLButtonElement | null
      )?.click();
    });

    expect(onToggleMaximize).toHaveBeenCalledTimes(1);

    act(() => {
      (
        container.querySelector(
          '[data-testid="task-center-shell-close"]',
        ) as HTMLButtonElement | null
      )?.click();
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("快捷动作应写入真实 Shell 会话而不是前端伪造输出", async () => {
    vi.stubGlobal(
      "prompt",
      vi.fn(
        () => "src/components/agent/chat/components/TaskCenterShellPanel.tsx",
      ),
    );
    mount(
      <TaskCenterShellPanel
        heightPx={236}
        maximized={false}
        projectRootPath="/tmp/project"
        onClose={vi.fn()}
        onHeightChange={vi.fn()}
        onToggleMaximize={vi.fn()}
      />,
    );

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const listFilesButton = document.body.querySelector<HTMLButtonElement>(
      '[data-testid="task-center-shell-list-files"]',
    );
    const viewFileButton = document.body.querySelector<HTMLButtonElement>(
      '[data-testid="task-center-shell-view-file"]',
    );
    const gitStatusButton = document.body.querySelector<HTMLButtonElement>(
      '[data-testid="task-center-shell-git-status"]',
    );
    const clearButton = document.body.querySelector<HTMLButtonElement>(
      '[data-testid="task-center-shell-clear"]',
    );

    await act(async () => {
      listFilesButton?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockWriteProjectShellSession).toHaveBeenLastCalledWith({
      sessionId: "project-shell-1",
      data: expect.stringContaining("ls -la"),
    });

    await act(async () => {
      viewFileButton?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(globalThis.prompt).toHaveBeenCalled();
    expect(mockWriteProjectShellSession).toHaveBeenLastCalledWith({
      sessionId: "project-shell-1",
      data: expect.stringContaining("TaskCenterShellPanel.tsx"),
    });

    await act(async () => {
      gitStatusButton?.click();
      clearButton?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockWriteProjectShellSession).toHaveBeenCalledWith({
      sessionId: "project-shell-1",
      data: "git -c color.status=always status --short --branch\r",
    });
    expect(mockWriteProjectShellSession).toHaveBeenCalledWith({
      sessionId: "project-shell-1",
      data: "clear\r",
    });
    expect(mockXtermWriteln).not.toHaveBeenCalledWith(
      expect.stringContaining("TaskCenterShellPanel.tsx"),
    );
    vi.unstubAllGlobals();
  });

  it("点击新增 Shell 会话应创建新 tab 并保留原会话可切换", async () => {
    mockStartProjectShellSession
      .mockResolvedValueOnce({
        sessionId: "project-shell-1",
        cwd: "/tmp/project",
        shell: "/bin/zsh",
        title: "coso@host: project",
        localEcho: true,
        tty: false,
        pid: 123,
      })
      .mockResolvedValueOnce({
        sessionId: "project-shell-2",
        cwd: "/tmp/project",
        shell: "/bin/zsh",
        title: "coso@host: project 2",
        localEcho: true,
        tty: false,
        pid: 124,
      });
    const container = mount(
      <TaskCenterShellPanel
        heightPx={236}
        maximized={false}
        projectRootPath="/tmp/project"
        onClose={vi.fn()}
        onHeightChange={vi.fn()}
        onToggleMaximize={vi.fn()}
      />,
    );

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(mockStartProjectShellSession).toHaveBeenCalledTimes(1);
    expect(
      container.querySelectorAll('[data-testid="task-center-shell-tab"]'),
    ).toHaveLength(1);

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="task-center-shell-new-session"]',
        )
        ?.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(mockStartProjectShellSession).toHaveBeenCalledTimes(2);
    expect(
      container.querySelectorAll('[data-testid="task-center-shell-tab"]'),
    ).toHaveLength(2);
    expect(container.textContent).toContain("coso@host: project");
    expect(container.textContent).toContain("coso@host: project 2");

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="task-center-shell-tab-button-shell-tab-1"]',
        )
        ?.click();
      await Promise.resolve();
    });

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="task-center-shell-clear"]',
        )
        ?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockWriteProjectShellSession).toHaveBeenLastCalledWith({
      sessionId: "project-shell-1",
      data: "clear\r",
    });
    expect(mockKillProjectShellSession).not.toHaveBeenCalledWith({
      sessionId: "project-shell-1",
    });
  });

  it("Shell 会话丢失时应重连当前 tab 并重放本次输入", async () => {
    mockStartProjectShellSession
      .mockResolvedValueOnce({
        sessionId: "project-shell-stale",
        cwd: "/tmp/project",
        shell: "/bin/zsh",
        title: "coso@host: project",
        localEcho: true,
        tty: false,
        pid: 123,
      })
      .mockResolvedValueOnce({
        sessionId: "project-shell-fresh",
        cwd: "/tmp/project",
        shell: "/bin/zsh",
        title: "coso@host: project",
        localEcho: true,
        tty: false,
        pid: 124,
      });
    mockWriteProjectShellSession
      .mockRejectedValueOnce(
        new Error("项目 Shell 会话不存在: project-shell-stale"),
      )
      .mockResolvedValueOnce(undefined);
    mount(
      <TaskCenterShellPanel
        heightPx={236}
        maximized={false}
        projectRootPath="/tmp/project"
        onClose={vi.fn()}
        onHeightChange={vi.fn()}
        onToggleMaximize={vi.fn()}
      />,
    );

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const inputHandler = mockXtermOnDataHandlers.at(-1);
    expect(inputHandler).toBeDefined();

    await act(async () => {
      inputHandler?.("printf 'LIME_TAB_OK\\n'");
      inputHandler?.("\r");
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(mockWriteProjectShellSession).toHaveBeenNthCalledWith(1, {
      sessionId: "project-shell-stale",
      data: "printf 'LIME_TAB_OK\\n'\r",
    });
    expect(mockStartProjectShellSession).toHaveBeenCalledTimes(2);

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(mockWriteProjectShellSession).toHaveBeenNthCalledWith(2, {
      sessionId: "project-shell-fresh",
      data: "printf 'LIME_TAB_OK\\n'\r",
    });
    expect(mockXtermWriteln).toHaveBeenCalledWith(
      expect.stringContaining("Shell 会话已失效，正在重连"),
    );
  });

  it("应回放 session 建立前到达的 Shell 输出并在卸载时清理输入监听", async () => {
    let sessionEventHandler:
      | ((event: {
          type: "data";
          sessionId: string;
          stream: "stdout";
          data: string;
        }) => void)
      | null = null;
    const unlisten = vi.fn();
    mockListenProjectShellSessionEvents.mockImplementationOnce(
      async (handler) => {
        sessionEventHandler = handler;
        handler({
          type: "data",
          sessionId: "project-shell-1",
          stream: "stdout",
          data: "early prompt",
        });
        return unlisten;
      },
    );
    mockStartProjectShellSession.mockResolvedValueOnce({
      sessionId: "project-shell-1",
      cwd: "/tmp/project",
      shell: "/bin/zsh",
      title: "coso@host: project",
      localEcho: true,
      tty: false,
      pid: 123,
    });

    const container = mount(
      <TaskCenterShellPanel
        heightPx={236}
        maximized={false}
        projectRootPath="/tmp/project"
        onClose={vi.fn()}
        onHeightChange={vi.fn()}
        onToggleMaximize={vi.fn()}
      />,
    );

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(sessionEventHandler).not.toBeNull();
    expect(mockXtermWrite).toHaveBeenCalledWith("early prompt");

    act(() => {
      mountedRoots.pop()?.root.unmount();
    });
    container.remove();

    expect(unlisten).toHaveBeenCalledTimes(1);
    expect(mockXtermDisposeInput).toHaveBeenCalledTimes(1);
    expect(mockKillProjectShellSession).toHaveBeenCalledWith({
      sessionId: "project-shell-1",
    });
  });

  it("应支持拖拽调整 Shell 高度并重新适配终端", async () => {
    const onHeightChange = vi.fn();
    const container = mount(
      <TaskCenterShellPanel
        heightPx={236}
        maximized={false}
        projectRootPath="/tmp/project"
        onClose={vi.fn()}
        onHeightChange={onHeightChange}
        onToggleMaximize={vi.fn()}
      />,
    );

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const resizeHandle = container.querySelector(
      '[data-testid="task-center-shell-resize-handle"]',
    ) as HTMLButtonElement | null;

    act(() => {
      resizeHandle?.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          clientY: 500,
          pointerId: 1,
        }),
      );
      resizeHandle?.dispatchEvent(
        new PointerEvent("pointermove", {
          bubbles: true,
          clientY: 420,
          pointerId: 1,
        }),
      );
      resizeHandle?.dispatchEvent(
        new PointerEvent("pointerup", {
          bubbles: true,
          clientY: 420,
          pointerId: 1,
        }),
      );
    });

    expect(onHeightChange).toHaveBeenCalledWith(316);
    expect(mockFitAddonFit).toHaveBeenCalled();
  });

  it("应串行写入快速输入片段，避免 PTY 收到乱序字符", async () => {
    let resolveFirstWrite: () => void = () => {
      throw new Error("first write promise was not created");
    };
    mockWriteProjectShellSession
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            resolveFirstWrite = resolve;
          }),
      )
      .mockResolvedValueOnce(undefined);

    mount(
      <TaskCenterShellPanel
        heightPx={236}
        maximized={false}
        projectRootPath="/tmp/project"
        onClose={vi.fn()}
        onHeightChange={vi.fn()}
        onToggleMaximize={vi.fn()}
      />,
    );

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const onData = mockXtermOnDataHandlers.at(-1);
    expect(onData).toBeTypeOf("function");
    if (!onData) {
      throw new Error("xterm onData handler was not registered");
    }

    act(() => {
      onData("first\r");
      onData("second\r");
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockWriteProjectShellSession).toHaveBeenCalledTimes(1);
    expect(mockWriteProjectShellSession).toHaveBeenNthCalledWith(1, {
      sessionId: "project-shell-1",
      data: "first\r",
    });

    resolveFirstWrite();

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockWriteProjectShellSession).toHaveBeenCalledTimes(2);
    expect(mockWriteProjectShellSession).toHaveBeenNthCalledWith(2, {
      sessionId: "project-shell-1",
      data: "second\r",
    });
  });

  it("应合并快速输入片段并在 Enter 时立即写入", async () => {
    vi.useFakeTimers();
    mount(
      <TaskCenterShellPanel
        heightPx={236}
        maximized={false}
        projectRootPath="/tmp/project"
        onClose={vi.fn()}
        onHeightChange={vi.fn()}
        onToggleMaximize={vi.fn()}
      />,
    );

    await act(async () => {
      await vi.runAllTimersAsync();
      await Promise.resolve();
    });

    const onData = mockXtermOnDataHandlers.at(-1);
    expect(onData).toBeTypeOf("function");

    act(() => {
      onData?.("pri");
      onData?.("ntf");
    });

    expect(mockWriteProjectShellSession).not.toHaveBeenCalled();

    act(() => {
      onData?.("\r");
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockWriteProjectShellSession).toHaveBeenCalledTimes(1);
    expect(mockWriteProjectShellSession).toHaveBeenCalledWith({
      sessionId: "project-shell-1",
      data: "printf\r",
    });
    vi.useRealTimers();
  });
});
