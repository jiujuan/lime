import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import {
  buildWorkspaceRepairBatchSummary,
  buildWorkspaceRepairSummary,
  clearWorkspaceRepairHistory,
  getWorkspaceRepairHistory,
  type WorkspaceRepairRecord,
} from "@/lib/workspaceHealthTelemetry";

interface WorkspaceRepairHistoryCardProps {
  className?: string;
  title?: string;
  description?: string;
  maxRecords?: number;
}

export function WorkspaceRepairHistoryCard({
  className,
  title,
  description,
  maxRecords = 10,
}: WorkspaceRepairHistoryCardProps) {
  const { t, i18n } = useTranslation("settings");
  const actionButtonClass =
    "h-7 whitespace-nowrap rounded-md px-2.5 text-xs text-muted-foreground transition-colors hover:bg-background hover:text-foreground";
  const [records, setRecords] = useState<WorkspaceRepairRecord[]>(() =>
    getWorkspaceRepairHistory(maxRecords),
  );
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const reloadRecords = useCallback(() => {
    setRecords(getWorkspaceRepairHistory(maxRecords));
  }, [maxRecords]);

  const clearRecords = useCallback(() => {
    clearWorkspaceRepairHistory();
    setRecords([]);
    setActionMessage(
      t(
        "settings.system.workspaceRepair.message.cleared",
        "已清空本地 Workspace 自愈记录",
      ),
    );
    setTimeout(() => setActionMessage(null), 1800);
  }, [t]);

  const copyLatestRecord = useCallback(async () => {
    const latest = records[0];
    if (!latest) {
      setActionMessage(
        t(
          "settings.system.workspaceRepair.message.noCopyableRecord",
          "暂无可复制的修复记录",
        ),
      );
      setTimeout(() => setActionMessage(null), 1800);
      return;
    }

    try {
      await copyTextToClipboard(
        buildWorkspaceRepairSummary(latest),
        t(
          "settings.system.workspaceRepair.message.copyPermissionFailed",
          "复制失败，请检查窗口焦点或系统剪贴板权限",
        ),
      );
      setActionMessage(
        t(
          "settings.system.workspaceRepair.message.copiedLatest",
          "已复制最近一条自愈记录摘要",
        ),
      );
      setTimeout(() => setActionMessage(null), 1800);
    } catch (error) {
      setActionMessage(
        error instanceof Error
          ? error.message
          : t(
              "settings.system.workspaceRepair.message.copyFailed",
              "复制失败，请重试",
            ),
      );
      setTimeout(() => setActionMessage(null), 2200);
    }
  }, [records, t]);

  const copyAllRecords = useCallback(async () => {
    if (records.length === 0) {
      setActionMessage(
        t(
          "settings.system.workspaceRepair.message.noCopyableRecord",
          "暂无可复制的修复记录",
        ),
      );
      setTimeout(() => setActionMessage(null), 1800);
      return;
    }

    try {
      await copyTextToClipboard(
        buildWorkspaceRepairBatchSummary(records),
        t(
          "settings.system.workspaceRepair.message.copyPermissionFailed",
          "复制失败，请检查窗口焦点或系统剪贴板权限",
        ),
      );
      setActionMessage(
        t("settings.system.workspaceRepair.message.copiedAll", {
          count: records.length,
          defaultValue: "已复制最近 {{count}} 条自愈记录",
        }),
      );
      setTimeout(() => setActionMessage(null), 1800);
    } catch (error) {
      setActionMessage(
        error instanceof Error
          ? error.message
          : t(
              "settings.system.workspaceRepair.message.copyFailed",
              "复制失败，请重试",
            ),
      );
      setTimeout(() => setActionMessage(null), 2200);
    }
  }, [records, t]);

  const displayTitle =
    title ??
    t(
      "settings.system.workspaceRepair.title",
      "Workspace 自动修复记录",
    );
  const displayDescription =
    description ??
    t(
      "settings.system.workspaceRepair.description",
      "记录最近自动修复/迁移（不打断用户操作）",
    );
  const getSourceLabel = (source: WorkspaceRepairRecord["source"]): string => {
    const sourceLabelMap: Record<WorkspaceRepairRecord["source"], string> = {
      app_startup: t(
        "settings.system.workspaceRepair.source.appStartup",
        "应用启动",
      ),
      workspace_refresh: t(
        "settings.system.workspaceRepair.source.workspaceRefresh",
        "工作区刷新",
      ),
      workspace_set_default: t(
        "settings.system.workspaceRepair.source.workspaceSetDefault",
        "设置默认工作区",
      ),
      projects_refresh: t(
        "settings.system.workspaceRepair.source.projectsRefresh",
        "项目列表刷新",
      ),
      agent_chat_page: t(
        "settings.system.workspaceRepair.source.agentChatPage",
        "创作会话页",
      ),
    };

    return sourceLabelMap[source];
  };

  return (
    <div
      className={cn(
        "rounded-xl border border-border/80 bg-background/80 p-4 shadow-sm space-y-4",
        className,
      )}
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-1">
          <h4 className="text-sm font-semibold tracking-tight">
            {displayTitle}
          </h4>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {displayDescription}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {t("settings.system.workspaceRepair.recentCount", {
              count: records.length,
              defaultValue: "最近记录：{{count}} 条",
            })}
          </p>
        </div>
        <div className="inline-flex flex-wrap items-center gap-1 rounded-lg border border-border/70 bg-muted/20 p-1">
          <button
            type="button"
            onClick={reloadRecords}
            className={actionButtonClass}
          >
            {t("settings.system.workspaceRepair.action.refresh", "刷新")}
          </button>
          <button
            type="button"
            onClick={clearRecords}
            className={actionButtonClass}
          >
            {t("settings.system.workspaceRepair.action.clear", "清空")}
          </button>
          <button
            type="button"
            onClick={() => void copyLatestRecord()}
            className={actionButtonClass}
          >
            {t(
              "settings.system.workspaceRepair.action.copyLatest",
              "复制最新",
            )}
          </button>
          <button
            type="button"
            onClick={() => void copyAllRecords()}
            className={actionButtonClass}
          >
            {t("settings.system.workspaceRepair.action.copyAll", "复制全部")}
          </button>
        </div>
      </div>

      {actionMessage && (
        <div className="rounded-md bg-green-100 px-3 py-2 text-xs text-green-700 dark:bg-green-900/30 dark:text-green-400">
          {actionMessage}
        </div>
      )}

      {records.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-muted/20 px-3 py-4 text-center text-xs text-muted-foreground">
          {t(
            "settings.system.workspaceRepair.empty",
            "暂无自动修复记录",
          )}
        </div>
      ) : (
        <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
          {records.map((record) => (
            <div
              key={`${record.workspace_id}-${record.timestamp}-${record.source}`}
              className="rounded-lg border border-border/70 bg-muted/10 px-3 py-3 text-xs"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium text-foreground break-all">
                  {record.workspace_id}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {formatWorkspaceRepairTime(record.timestamp, i18n.language)}
                </span>
              </div>
              <div className="mt-2 rounded-md border border-border/60 bg-background/60 px-2 py-1.5">
                <p className="break-all font-mono text-[11px] text-muted-foreground">
                  {record.root_path}
                </p>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <span className="inline-flex items-center rounded-full border border-border/70 bg-background px-2 py-0.5 text-[10px] text-muted-foreground">
                  {t("settings.system.workspaceRepair.sourceLabel", {
                    source: getSourceLabel(record.source),
                    defaultValue: "来源：{{source}}",
                  })}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function formatWorkspaceRepairTime(value: string, locale: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString(locale || "zh-CN", { hour12: false });
}

async function copyTextToClipboard(
  text: string,
  failureMessage: string,
): Promise<void> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  if (
    typeof document !== "undefined" &&
    typeof document.execCommand === "function"
  ) {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, text.length);
    const copied = document.execCommand("copy");
    document.body.removeChild(textarea);
    if (copied) return;
  }

  throw new Error(failureMessage);
}
