import type { ReactNode } from "react";
import {
  CheckCircle2,
  CircleAlert,
  CircleDot,
  Clock3,
  FolderOpen,
  LoaderCircle,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TaskStatus } from "../hooks/agentChatShared";
import { cn } from "@/lib/utils";

interface ThreadWorkspaceHeaderProps {
  sessionId: string;
  title: string;
  status: TaskStatus | null;
  workingDirectory: string | null;
  actions?: ReactNode;
}

const statusMeta: Record<
  TaskStatus,
  {
    key: string;
    defaultValue: string;
    className: string;
    Icon: typeof CircleDot;
    animated?: boolean;
  }
> = {
  draft: {
    key: "agentChat.threadTimeline.status.pending",
    defaultValue: "待处理",
    className: "text-[color:var(--lime-text-muted)]",
    Icon: CircleDot,
  },
  running: {
    key: "agentChat.inputbar.runtimeStatus.status.running",
    defaultValue: "处理中",
    className: "text-[color:var(--lime-info)]",
    Icon: LoaderCircle,
    animated: true,
  },
  queued: {
    key: "agentChat.inputbar.runtimeStatus.status.queued",
    defaultValue: "排队中",
    className: "text-sky-700 dark:text-sky-300",
    Icon: Clock3,
  },
  waiting: {
    key: "agentChat.inputbar.runtimeStatus.status.waitingInput",
    defaultValue: "等待补充",
    className: "text-[color:var(--lime-warning)]",
    Icon: CircleAlert,
  },
  done: {
    key: "agentChat.inputbar.runtimeStatus.status.completed",
    defaultValue: "已完成",
    className: "text-[color:var(--lime-text-muted)]",
    Icon: CheckCircle2,
  },
  failed: {
    key: "agentChat.inputbar.runtimeStatus.status.failed",
    defaultValue: "失败",
    className: "text-[color:var(--lime-danger)]",
    Icon: CircleAlert,
  },
};

export function ThreadWorkspaceHeader({
  sessionId,
  title,
  status,
  workingDirectory,
  actions,
}: ThreadWorkspaceHeaderProps) {
  const { t } = useTranslation("agent");
  const currentStatus = status ? statusMeta[status] : null;
  const statusLabel = currentStatus
    ? String(
        t(
          currentStatus.key as never,
          {
            defaultValue: currentStatus.defaultValue,
          } as never,
        ),
      )
    : null;
  const StatusIcon = currentStatus?.Icon;

  return (
    <header
      className="flex h-[52px] min-w-0 items-center gap-3 border-b border-[color:var(--lime-surface-border)] bg-[color:var(--lime-stage-surface,var(--lime-app-bg,#f4f7f1))] px-4"
      data-testid="thread-workspace-header"
      data-session-id={sessionId}
      data-status={status ?? undefined}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        <h1
          className="min-w-0 truncate text-[14px] font-semibold leading-5 text-[color:var(--lime-text-strong)]"
          data-testid="thread-workspace-header-title"
          title={title}
        >
          {title}
        </h1>
        {currentStatus && StatusIcon && statusLabel ? (
          <span
            className={cn(
              "inline-flex shrink-0 items-center gap-1 text-[11px] font-medium",
              currentStatus.className,
            )}
            data-testid="thread-workspace-header-status"
          >
            <StatusIcon
              className={cn(
                "h-3.5 w-3.5",
                currentStatus.animated && "animate-spin",
              )}
              aria-hidden="true"
            />
            {statusLabel}
          </span>
        ) : null}
        {workingDirectory ? (
          <span
            className="hidden min-w-0 items-center gap-1 text-[11px] text-[color:var(--lime-text-muted)] min-[900px]:inline-flex"
            data-testid="thread-workspace-header-directory"
            title={workingDirectory}
          >
            <FolderOpen className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="max-w-[min(34vw,420px)] truncate">
              {workingDirectory}
            </span>
          </span>
        ) : null}
      </div>
      {actions ? (
        <div
          className="flex min-w-0 shrink-0 items-center justify-end"
          data-testid="thread-workspace-header-actions"
        >
          {actions}
        </div>
      ) : null}
    </header>
  );
}
