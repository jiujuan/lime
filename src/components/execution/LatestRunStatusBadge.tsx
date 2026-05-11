import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/i18n/format";
import { executionRunList } from "@/lib/api/executionRun";
import type {
  AgentRun,
  AgentRunSource,
  AgentRunStatus,
} from "@/lib/api/executionRun";

interface LatestRunStatusBadgeProps {
  source: AgentRunSource;
  label?: string;
  className?: string;
  pollMs?: number;
}

function statusVariant(status: AgentRunStatus) {
  if (status === "success") return "default" as const;
  if (status === "running" || status === "queued") return "secondary" as const;
  if (status === "error" || status === "timeout") return "destructive" as const;
  return "outline" as const;
}

function formatTime(value: string | null | undefined): string {
  if (!value) return "-";
  return (
    formatDate(value, {
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }) || value
  );
}

export function LatestRunStatusBadge({
  source,
  label,
  className,
  pollMs = 15_000,
}: LatestRunStatusBadgeProps) {
  const { t } = useTranslation("common");
  const [latestRun, setLatestRun] = useState<AgentRun | null>(null);
  const resolvedLabel =
    label ??
    t("common.execution.latestRunStatus.defaultLabel", {
      defaultValue: "最近执行",
    });
  const noRecordLabel = t("common.execution.latestRunStatus.noRecord", {
    defaultValue: "暂无记录",
  });
  const statusLabels: Record<AgentRunStatus, string> = useMemo(
    () => ({
      queued: t("common.execution.latestRunStatus.status.queued", {
        defaultValue: "排队中",
      }),
      running: t("common.execution.latestRunStatus.status.running", {
        defaultValue: "运行中",
      }),
      success: t("common.execution.latestRunStatus.status.success", {
        defaultValue: "成功",
      }),
      error: t("common.execution.latestRunStatus.status.error", {
        defaultValue: "失败",
      }),
      canceled: t("common.execution.latestRunStatus.status.canceled", {
        defaultValue: "已取消",
      }),
      timeout: t("common.execution.latestRunStatus.status.timeout", {
        defaultValue: "超时",
      }),
    }),
    [t],
  );

  const refresh = useCallback(async () => {
    try {
      const list = await executionRunList(30, 0);
      const run = list.find((item) => item.source === source) || null;
      setLatestRun(run);
    } catch {
      // 查询失败时保持静默，避免干扰主流程
    }
  }, [source]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => {
      void refresh();
    }, pollMs);
    return () => {
      window.clearInterval(timer);
    };
  }, [pollMs, refresh]);

  const statusText = useMemo(() => {
    if (!latestRun) return noRecordLabel;
    return statusLabels[latestRun.status] ?? latestRun.status;
  }, [latestRun, noRecordLabel, statusLabels]);

  if (!latestRun) {
    return (
      <div className={className}>
        <span className="text-xs text-muted-foreground">
          {resolvedLabel}: {noRecordLabel}
        </span>
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>{resolvedLabel}</span>
        <Badge variant={statusVariant(latestRun.status)}>{statusText}</Badge>
        <span className="truncate">
          {t("common.execution.latestRunStatus.timeLabel", {
            defaultValue: "时间",
          })}
          :{" "}
          {formatTime(latestRun.started_at)}
        </span>
      </div>
    </div>
  );
}
