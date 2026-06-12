import React from "react";
import {
  ChevronDown,
  CircleDot,
  Code2,
  FolderOpen,
  GitBranch,
  GitCommitHorizontal,
  GitPullRequest,
  HardDrive,
  Laptop,
  Monitor,
  PanelRightOpen,
  SlidersHorizontal,
  SquareTerminal,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  openProjectPathWithTool,
  type ProjectPathOpenTool,
} from "@/lib/api/fileSystem";
import {
  readProjectGitStatus,
  type ProjectGitStatus,
} from "@/lib/api/projectGit";
import { cn } from "@/lib/utils";
import { agentText } from "./harnessPanelText";

interface TaskCenterUtilityToolbarProps {
  projectRootPath?: string | null;
  showCanvasToggle: boolean;
  isCanvasOpen: boolean;
  onToggleCanvas?: () => void;
  showHarnessToggle: boolean;
  harnessPanelVisible: boolean;
  onToggleHarnessPanel?: () => void;
  harnessPendingCount: number;
  harnessAttentionLevel: "idle" | "active" | "warning";
  harnessToggleLabel: string;
  shellPanelOpen: boolean;
  onToggleShellPanel?: () => void;
}

const taskCenterToolButtonClassName =
  "h-7 rounded-[12px] border border-[color:var(--lime-chrome-border)] bg-[color:var(--lime-surface)] px-2 text-[color:var(--lime-chrome-text)] shadow-none transition-[background-color,color] hover:bg-[color:var(--lime-chrome-tab-hover)] hover:text-[color:var(--lime-text-strong)]";

const taskCenterIconOnlyButtonClassName =
  "h-7 w-7 rounded-[12px] border border-transparent bg-transparent text-[color:var(--lime-chrome-muted)] shadow-none transition-[background-color,color] hover:bg-[color:var(--lime-chrome-tab-hover)] hover:text-[color:var(--lime-chrome-text)] disabled:cursor-not-allowed disabled:opacity-50";

function VisualStudioCodeIcon({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex h-4 w-4 items-center justify-center rounded-[5px] bg-[#f5fbff] text-[#0a84ff]",
        className,
      )}
    >
      <Code2 className="h-3 w-3" strokeWidth={2.3} />
    </span>
  );
}

function extractErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function useProjectGitStatus(rootPath?: string | null) {
  const normalizedRootPath = rootPath?.trim() || null;
  const [status, setStatus] = React.useState<ProjectGitStatus | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!normalizedRootPath) {
      setStatus(null);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    void readProjectGitStatus(normalizedRootPath)
      .then((nextStatus) => {
        if (cancelled) return;
        setStatus(nextStatus);
      })
      .catch((readError) => {
        if (cancelled) return;
        setStatus(null);
        setError(extractErrorMessage(readError));
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [normalizedRootPath]);

  return { status, loading, error };
}

export function TaskCenterUtilityToolbar({
  projectRootPath,
  showCanvasToggle,
  isCanvasOpen,
  onToggleCanvas,
  showHarnessToggle,
  harnessPanelVisible,
  onToggleHarnessPanel,
  harnessPendingCount,
  harnessAttentionLevel,
  harnessToggleLabel,
  shellPanelOpen,
  onToggleShellPanel,
}: TaskCenterUtilityToolbarProps) {
  useTranslation("agent");
  const normalizedProjectRootPath = projectRootPath?.trim() || null;
  const [environmentVisited, setEnvironmentVisited] = React.useState(false);
  const { status, loading, error } = useProjectGitStatus(
    environmentVisited ? normalizedProjectRootPath : null,
  );
  const shouldRenderHarnessToggle =
    showHarnessToggle || Boolean(onToggleHarnessPanel);

  const handleOpenTool = React.useCallback(
    async (tool: ProjectPathOpenTool) => {
      if (!normalizedProjectRootPath) {
        toast.error(
          agentText(
            "agentChat.navbar.appSwitcher.toast.noProjectRoot",
            "当前项目缺少本地目录",
          ),
        );
        return;
      }

      try {
        await openProjectPathWithTool(normalizedProjectRootPath, tool);
      } catch (openError) {
        toast.error(
          agentText(
            "agentChat.navbar.appSwitcher.toast.openFailed",
            "打开项目失败：{{message}}",
            { message: extractErrorMessage(openError) },
          ),
        );
      }
    },
    [normalizedProjectRootPath],
  );

  const branchLabel =
    status?.currentBranch?.trim() ||
    agentText("agentChat.navbar.environment.branchFallback", "无分支");
  const changeCount = status?.hasGitRepository
    ? status.uncommittedFileCount
    : 0;
  const environmentStatusLabel = loading
    ? agentText("agentChat.navbar.environment.loading", "读取中")
    : error
      ? agentText("agentChat.navbar.environment.failed", "读取失败")
      : !normalizedProjectRootPath
        ? agentText(
            "agentChat.navbar.environment.noProjectRoot",
            "未选择项目目录",
          )
        : status?.hasGitRepository
          ? agentText(
              "agentChat.navbar.environment.uncommittedFiles",
              "{{count}} 个文件",
              { count: changeCount },
            )
          : agentText("agentChat.navbar.environment.noGit", "非 Git 项目");

  return (
    <div className="ml-auto flex h-9 shrink-0 items-center gap-1 pb-1">
      <Popover>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn(taskCenterToolButtonClassName, "gap-1.5")}
            aria-label={agentText(
              "agentChat.navbar.appSwitcher.open",
              "打开应用切换",
            )}
            title={agentText(
              "agentChat.navbar.appSwitcher.open",
              "打开应用切换",
            )}
            data-testid="task-center-app-switcher-trigger"
          >
            <VisualStudioCodeIcon />
            <ChevronDown className="h-3 w-3" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          sideOffset={8}
          className="w-44 rounded-2xl border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] p-2 text-[color:var(--lime-text)] shadow-xl shadow-slate-950/10"
          data-testid="task-center-app-switcher-popover"
        >
          <AppSwitcherAction
            icon={<VisualStudioCodeIcon className="h-3.5 w-3.5" />}
            label={agentText("agentChat.navbar.appSwitcher.vscode", "VS Code")}
            disabled={!normalizedProjectRootPath}
            onClick={() => void handleOpenTool("vscode")}
          />
          <AppSwitcherAction
            icon={<SquareTerminal className="h-3.5 w-3.5 text-slate-500" />}
            label={agentText("agentChat.navbar.appSwitcher.cursor", "Cursor")}
            disabled={!normalizedProjectRootPath}
            onClick={() => void handleOpenTool("cursor")}
          />
          <AppSwitcherAction
            icon={<FolderOpen className="h-3.5 w-3.5 text-sky-500" />}
            label={agentText("agentChat.navbar.appSwitcher.finder", "Finder")}
            disabled={!normalizedProjectRootPath}
            onClick={() => void handleOpenTool("finder")}
          />
          <AppSwitcherAction
            icon={<SquareTerminal className="h-3.5 w-3.5 text-slate-500" />}
            label={agentText(
              "agentChat.navbar.appSwitcher.terminal",
              "Terminal",
            )}
            disabled={!normalizedProjectRootPath}
            onClick={() => void handleOpenTool("terminal")}
          />
        </PopoverContent>
      </Popover>

      <Popover>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={taskCenterIconOnlyButtonClassName}
            aria-label={agentText(
              "agentChat.navbar.environment.open",
              "打开环境信息",
            )}
            title={agentText(
              "agentChat.navbar.environment.open",
              "打开环境信息",
            )}
            data-testid="task-center-environment-trigger"
            onClick={() => {
              setEnvironmentVisited(true);
            }}
          >
            <SlidersHorizontal className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          sideOffset={8}
          className="w-[284px] rounded-3xl border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] p-4 text-[color:var(--lime-text)] shadow-xl shadow-slate-950/10"
          data-testid="task-center-environment-popover"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[color:var(--lime-text-muted)]">
              {agentText("agentChat.navbar.environment.title", "环境信息")}
            </span>
            <span className="max-w-[180px] truncate text-[11px] text-[color:var(--lime-text-muted)]">
              {environmentStatusLabel}
            </span>
          </div>
          <div className="mt-3 space-y-2 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2">
                <GitCommitHorizontal className="h-4 w-4" />
                {agentText("agentChat.navbar.environment.changes", "变更")}
              </span>
              <span className="text-xs text-[color:var(--lime-text-muted)]">
                {status?.hasGitRepository
                  ? agentText(
                      "agentChat.navbar.environment.uncommittedFiles",
                      "{{count}} 个文件",
                      { count: changeCount },
                    )
                  : environmentStatusLabel}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Monitor className="h-4 w-4" />
              <span>
                {agentText("agentChat.navbar.environment.local", "本地")}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <GitBranch className="h-4 w-4" />
              <span className="min-w-0 truncate">{branchLabel}</span>
            </div>
            <button
              type="button"
              className="flex w-full cursor-not-allowed items-center gap-2 rounded-xl py-1 text-left text-[color:var(--lime-text-muted)] opacity-70"
              disabled
              title={agentText(
                "agentChat.navbar.environment.submitUnavailable",
                "提交和推送需要后续接入 Git 写操作",
              )}
            >
              <CircleDot className="h-4 w-4" />
              <span>
                {agentText(
                  "agentChat.navbar.environment.submit",
                  "提交或推送",
                )}
              </span>
            </button>
          </div>
          <div className="mt-4 border-t border-[color:var(--lime-surface-border)] pt-3">
            <div className="text-xs font-medium text-[color:var(--lime-text-muted)]">
              {agentText("agentChat.navbar.environment.source", "来源")}
            </div>
            <div className="mt-2 flex items-center gap-2 text-[color:var(--lime-text-muted)]">
              <GitPullRequest className="h-4 w-4" />
              <HardDrive className="h-4 w-4" />
              <Laptop className="h-4 w-4" />
            </div>
          </div>
        </PopoverContent>
      </Popover>

      {shouldRenderHarnessToggle ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn(
            taskCenterIconOnlyButtonClassName,
            "relative",
            harnessPanelVisible &&
              "bg-[color:var(--lime-chrome-tab-active-surface)] text-[color:var(--lime-text)]",
            harnessAttentionLevel === "warning" &&
              !harnessPanelVisible &&
              "bg-[color:var(--lime-warning-soft)] text-[color:var(--lime-warning)] hover:bg-[color:var(--lime-warning-soft)] hover:text-[color:var(--lime-warning)]",
          )}
          onClick={onToggleHarnessPanel}
          aria-label={
            harnessPanelVisible
              ? agentText("agentChat.navbar.closeHarness", "关闭{{label}}", {
                  label: harnessToggleLabel,
                })
              : agentText("agentChat.navbar.openHarness", "打开{{label}}", {
                  label: harnessToggleLabel,
                })
          }
          aria-expanded={harnessPanelVisible}
          title={harnessToggleLabel}
          data-testid="task-center-harness-toggle"
        >
          <Code2 className="h-4 w-4" />
          {harnessPendingCount > 0 ? (
            <span className="absolute -right-1 -top-1 rounded-full border border-[color:var(--lime-surface-border-strong)] bg-[color:var(--lime-surface)] px-1 text-[9px] font-medium leading-4 text-[color:var(--lime-brand-strong)]">
              {harnessPendingCount > 99 ? "99+" : harnessPendingCount}
            </span>
          ) : null}
        </Button>
      ) : null}

      {showCanvasToggle ? (
        <>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn(
              taskCenterIconOnlyButtonClassName,
              shellPanelOpen &&
                "bg-[color:var(--lime-chrome-tab-active-surface)] text-[color:var(--lime-text)]",
            )}
            disabled={!normalizedProjectRootPath}
            aria-label={agentText("agentChat.navbar.openShell", "打开 Shell")}
            aria-expanded={shellPanelOpen}
            title={agentText("agentChat.navbar.openShell", "打开 Shell")}
            data-testid="task-center-shell-toggle"
            onClick={onToggleShellPanel}
          >
            <SquareTerminal className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn(
              taskCenterIconOnlyButtonClassName,
              isCanvasOpen &&
                "bg-[color:var(--lime-chrome-tab-active-surface)] text-[color:var(--lime-text)]",
            )}
            onClick={!isCanvasOpen ? onToggleCanvas : undefined}
            disabled={isCanvasOpen}
            aria-label={agentText(
              "agentChat.navbar.openWorkbench",
              "打开工作台",
            )}
            title={agentText("agentChat.navbar.openWorkbench", "打开工作台")}
            data-testid="task-center-workbench-toggle"
          >
            <PanelRightOpen className="h-4 w-4" />
          </Button>
        </>
      ) : null}
    </div>
  );
}

function AppSwitcherAction({
  icon,
  label,
  disabled,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-xs transition hover:bg-[color:var(--lime-surface-hover)] disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent"
      disabled={disabled}
      onClick={onClick}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
