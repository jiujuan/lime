import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
    const toolbarButtons = Array.from(
      container.firstElementChild?.children ?? [],
    ).filter((element) => element.tagName === "BUTTON");

    expect(shellButton?.disabled).toBe(false);
    expect(workbenchButton?.disabled).toBe(false);
    expect(chatButton).toBeNull();
    expect(toolbarButtons).toHaveLength(5);

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
    const toolbarButtons = Array.from(
      container.firstElementChild?.children ?? [],
    ).filter((element) => element.tagName === "BUTTON");

    expect(harnessButton).not.toBeNull();
    expect(toolbarButtons).toHaveLength(5);

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
