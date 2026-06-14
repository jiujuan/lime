import React from "react";
import {
  Eraser,
  FileSearch,
  GitBranch,
  ListTree,
  Plus,
  SquareTerminal,
  X,
} from "lucide-react";
import { agentText } from "./harnessPanelText";
import {
  ProjectShellTerminal,
  type ProjectShellTabState,
  type ProjectShellTerminalHandle,
} from "./ProjectShellTerminal";

interface ProjectShellSurfaceProps {
  projectRootPath?: string | null;
  onRequestResize?: () => void;
  onCloseLastTab?: () => void;
  className?: string;
  bodyClassName?: string;
  toolbarClassName?: string;
  statusClassName?: string;
  testIdPrefix?: string;
  trailingToolbarContent?: React.ReactNode;
}

interface ProjectShellTab {
  id: string;
  state: ProjectShellTabState;
}

type ShellFlavor = "posix" | "windows";

function createDefaultShellTabState(index: number): ProjectShellTabState {
  return {
    errorText: null,
    ready: false,
    shell: null,
    statusText: agentText("agentChat.navbar.shell.connecting", "连接中"),
    title:
      index === 1
        ? agentText("agentChat.navbar.shell.title", "Shell")
        : agentText("agentChat.navbar.shell.untitledTab", "Shell {{index}}", {
            index,
          }),
  };
}

export function ProjectShellSurface({
  projectRootPath,
  onRequestResize,
  onCloseLastTab,
  className = "",
  bodyClassName = "",
  toolbarClassName = "",
  statusClassName = "",
  testIdPrefix = "task-center-shell",
  trailingToolbarContent = null,
}: ProjectShellSurfaceProps) {
  const normalizedProjectRootPath = projectRootPath?.trim() || null;
  const terminalRefs = React.useRef<
    Record<string, ProjectShellTerminalHandle | null>
  >({});
  const [tabs, setTabs] = React.useState<ProjectShellTab[]>(() => [
    {
      id: "shell-tab-1",
      state: createDefaultShellTabState(1),
    },
  ]);
  const [activeTabId, setActiveTabId] = React.useState("shell-tab-1");
  const tabSequenceRef = React.useRef(1);
  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0];
  const shellFlavor = React.useMemo(
    () => resolveShellFlavor(activeTab?.state.shell ?? null),
    [activeTab?.state.shell],
  );
  const activeTerminal = activeTab
    ? terminalRefs.current[activeTab.id] ?? null
    : null;

  const updateTabState = React.useCallback(
    (tabId: string, state: Partial<ProjectShellTabState>) => {
      setTabs((currentTabs) =>
        currentTabs.map((tab) =>
          tab.id === tabId
            ? {
                ...tab,
                state: {
                  ...tab.state,
                  ...state,
                },
              }
            : tab,
        ),
      );
    },
    [],
  );

  const startNewSession = React.useCallback(() => {
    const nextIndex = tabSequenceRef.current + 1;
    tabSequenceRef.current = nextIndex;
    const nextTab: ProjectShellTab = {
      id: `shell-tab-${nextIndex}`,
      state: createDefaultShellTabState(nextIndex),
    };
    setTabs((currentTabs) => [...currentTabs, nextTab]);
    setActiveTabId(nextTab.id);
  }, []);

  const closeTab = React.useCallback(
    (tabId: string) => {
      if (tabs.length <= 1) {
        onCloseLastTab?.();
        return;
      }
      setTabs((currentTabs) => currentTabs.filter((tab) => tab.id !== tabId));
      if (activeTabId === tabId) {
        const currentIndex = tabs.findIndex((tab) => tab.id === tabId);
        const nextTab =
          tabs[currentIndex + 1] ?? tabs[currentIndex - 1] ?? tabs[0];
        if (nextTab) {
          setActiveTabId(nextTab.id);
        }
      }
    },
    [activeTabId, onCloseLastTab, tabs],
  );

  const handleTerminalClick = React.useCallback(() => {
    activeTerminal?.focus();
  }, [activeTerminal]);

  const handleResize = React.useCallback(() => {
    activeTerminal?.fit();
    onRequestResize?.();
  }, [activeTerminal, onRequestResize]);

  const runQuickCommand = React.useCallback(
    (command: string) => {
      activeTerminal?.runCommand(command);
    },
    [activeTerminal],
  );

  const handleListFiles = React.useCallback(() => {
    runQuickCommand(buildListFilesCommand(shellFlavor));
  }, [runQuickCommand, shellFlavor]);

  const handleViewFile = React.useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }
    const value = window.prompt(
      agentText(
        "agentChat.navbar.shell.viewFilePrompt",
        "输入要查看的相对文件路径",
      ),
      "package.json",
    );
    const filePath = normalizeQuickFilePath(value);
    if (!filePath) {
      return;
    }
    runQuickCommand(buildViewFileCommand(filePath, shellFlavor));
  }, [runQuickCommand, shellFlavor]);

  const handleGitStatus = React.useCallback(() => {
    runQuickCommand("git -c color.status=always status --short --branch");
  }, [runQuickCommand]);

  const handleClearShell = React.useCallback(() => {
    runQuickCommand(shellFlavor === "windows" ? "cls" : "clear");
  }, [runQuickCommand, shellFlavor]);

  React.useEffect(() => {
    const animationFrame = requestAnimationFrame(handleResize);
    return () => {
      cancelAnimationFrame(animationFrame);
    };
  }, [handleResize]);

  return (
    <div className={`flex h-full min-h-0 flex-col ${className}`}>
      <div
        className={`flex h-9 shrink-0 items-center border-b border-slate-200 bg-white ${toolbarClassName}`}
      >
        <div
          className="ml-2 flex h-9 min-w-0 max-w-[45%] shrink-0 items-end gap-1 overflow-x-auto pt-1"
          data-testid={`${testIdPrefix}-tabs`}
        >
          {tabs.map((tab) => {
            const active = tab.id === activeTab?.id;
            return (
              <div
                key={tab.id}
                className={[
                  "flex h-8 min-w-[112px] max-w-[260px] items-center gap-2 rounded-t-md border px-2.5 text-xs font-semibold transition",
                  active
                    ? "border-slate-200 border-b-white bg-white text-slate-700"
                    : "border-transparent bg-slate-100 text-slate-500 hover:bg-slate-50 hover:text-slate-700",
                ].join(" ")}
                data-active={active ? "true" : "false"}
                data-testid={`${testIdPrefix}-tab`}
              >
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  aria-label={agentText(
                    "agentChat.navbar.shell.switchTab",
                    "切换到 {{title}}",
                    { title: tab.state.title },
                  )}
                  onClick={() => {
                    setActiveTabId(tab.id);
                  }}
                  data-testid={`${testIdPrefix}-tab-button-${tab.id}`}
                >
                  <SquareTerminal className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                  <span className="min-w-0 truncate">{tab.state.title}</span>
                </button>
                <button
                  type="button"
                  className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-slate-400 transition hover:bg-slate-200 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label={agentText(
                    "agentChat.navbar.shell.closeTab",
                    "关闭 {{title}}",
                    { title: tab.state.title },
                  )}
                  title={agentText(
                    "agentChat.navbar.shell.closeTab",
                    "关闭 {{title}}",
                    { title: tab.state.title },
                  )}
                  onClick={(event) => {
                    event.stopPropagation();
                    closeTab(tab.id);
                  }}
                  data-testid={`${testIdPrefix}-tab-close-${tab.id}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            );
          })}
        </div>
        <button
          type="button"
          className="ml-1 inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-45"
          disabled={!normalizedProjectRootPath}
          aria-label={
            normalizedProjectRootPath
              ? agentText("agentChat.navbar.shell.newTab", "新建 Shell 会话")
              : agentText(
                  "agentChat.navbar.shell.newTabUnavailable",
                  "新建 Shell 会话暂未开放",
                )
          }
          title={
            normalizedProjectRootPath
              ? agentText("agentChat.navbar.shell.newTab", "新建 Shell 会话")
              : agentText(
                  "agentChat.navbar.shell.newTabUnavailable",
                  "新建 Shell 会话暂未开放",
                )
          }
          onClick={startNewSession}
          data-testid={`${testIdPrefix}-new-session`}
        >
          <Plus className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1" />
        <ShellActionButton
          testId={`${testIdPrefix}-list-files`}
          label={agentText("agentChat.navbar.shell.listFiles", "列出文件")}
          disabled={!activeTab?.state.ready}
          onClick={handleListFiles}
        >
          <ListTree className="h-4 w-4" />
        </ShellActionButton>
        <ShellActionButton
          testId={`${testIdPrefix}-view-file`}
          label={agentText("agentChat.navbar.shell.viewFile", "查看文件")}
          disabled={!activeTab?.state.ready}
          onClick={handleViewFile}
        >
          <FileSearch className="h-4 w-4" />
        </ShellActionButton>
        <ShellActionButton
          testId={`${testIdPrefix}-git-status`}
          label={agentText("agentChat.navbar.shell.gitStatus", "查看 Git 状态")}
          disabled={!activeTab?.state.ready}
          onClick={handleGitStatus}
        >
          <GitBranch className="h-4 w-4" />
        </ShellActionButton>
        <ShellActionButton
          testId={`${testIdPrefix}-clear`}
          label={agentText("agentChat.navbar.shell.clear", "清屏")}
          disabled={!activeTab?.state.ready}
          onClick={handleClearShell}
        >
          <Eraser className="h-4 w-4" />
        </ShellActionButton>
        <span
          className={`mr-2 hidden max-w-[180px] truncate text-[11px] text-slate-400 sm:inline ${statusClassName}`}
          data-testid={`${testIdPrefix}-status`}
        >
          {activeTab?.state.statusText}
        </span>
        {trailingToolbarContent}
      </div>
      <div
        className={`min-h-0 flex-1 overflow-hidden bg-white px-3 py-2 ${bodyClassName}`}
        onClick={handleTerminalClick}
        onDoubleClick={handleResize}
        data-testid={`${testIdPrefix}-output`}
      >
        {activeTab?.state.errorText ? (
          <div className="mb-2 font-mono text-xs text-rose-600">
            {activeTab.state.errorText}
          </div>
        ) : null}
        {tabs.map((tab) => (
          <ProjectShellTerminal
            key={tab.id}
            ref={(terminal) => {
              terminalRefs.current[tab.id] = terminal;
            }}
            active={tab.id === activeTab?.id}
            projectRootPath={normalizedProjectRootPath}
            tabId={tab.id}
            testIdPrefix={testIdPrefix}
            onStateChange={updateTabState}
          />
        ))}
      </div>
    </div>
  );
}

function ShellActionButton({
  children,
  disabled,
  label,
  onClick,
  testId,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  label: string;
  onClick: () => void;
  testId: string;
}) {
  return (
    <button
      type="button"
      className="mr-1 inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-45"
      disabled={disabled}
      aria-label={label}
      title={label}
      onClick={onClick}
      data-testid={testId}
    >
      {children}
    </button>
  );
}

function resolveShellFlavor(shell: string | null): ShellFlavor {
  const normalizedShell = shell?.toLowerCase() ?? "";
  if (
    normalizedShell.endsWith("cmd.exe") ||
    normalizedShell.endsWith("powershell.exe") ||
    normalizedShell.endsWith("pwsh.exe")
  ) {
    return "windows";
  }
  if (
    typeof navigator !== "undefined" &&
    /windows/i.test(navigator.userAgent)
  ) {
    return "windows";
  }
  return "posix";
}

function normalizeQuickFilePath(value: string | null): string | null {
  const trimmed = value?.trim();
  if (!trimmed || /[\r\n]/.test(trimmed)) {
    return null;
  }
  return trimmed;
}

function quotePosix(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function quoteWindowsCmd(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function buildListFilesCommand(shellFlavor: ShellFlavor): string {
  if (shellFlavor === "windows") {
    return "dir /a";
  }
  return "if ls --color=always >/dev/null 2>&1; then ls -la --color=always; else ls -laG; fi";
}

function buildViewFileCommand(
  filePath: string,
  shellFlavor: ShellFlavor,
): string {
  if (shellFlavor === "windows") {
    const quoted = quoteWindowsCmd(filePath);
    return `if exist ${quoted} (findstr /n "^.*" ${quoted}) else (echo File not found: ${quoted})`;
  }
  const quoted = quotePosix(filePath);
  return [
    `if [ -f ${quoted} ]; then`,
    `if command -v bat >/dev/null 2>&1; then bat --style=numbers --color=always --paging=never --line-range :160 ${quoted};`,
    `elif command -v batcat >/dev/null 2>&1; then batcat --style=numbers --color=always --paging=never --line-range :160 ${quoted};`,
    `else nl -ba ${quoted} | sed -n '1,160p'; fi;`,
    `else printf 'File not found: %s\\n' ${quoted}; fi`,
  ].join(" ");
}
