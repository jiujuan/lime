import { Activity, AlertTriangle, Clock3, PauseCircle } from "lucide-react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AutomationHealthResult, AutomationStatus } from "@/lib/api/automation";
import { formatDate } from "@/i18n/format";

function formatTime(value?: string | null, locale?: string): string {
  if (!value) {
    return "-";
  }
  return (
    formatDate(value, {
      locale,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }) || value
  );
}

function statusLabel(t: TFunction<"settings">, status?: string | null): string {
  switch (status) {
    case "queued":
      return t("settings.automation.health.status.queued");
    case "success":
      return t("settings.automation.health.status.success");
    case "running":
      return t("settings.automation.health.status.running");
    case "waiting_for_human":
      return t("settings.automation.health.status.waitingForHuman");
    case "human_controlling":
      return t("settings.automation.health.status.humanControlling");
    case "agent_resuming":
      return t("settings.automation.health.status.agentResuming");
    case "error":
      return t("settings.automation.health.status.error");
    case "timeout":
      return t("settings.automation.health.status.timeout");
    default:
      return status || t("settings.automation.health.status.pending");
  }
}

function statusVariant(status?: string | null) {
  if (status === "success") {
    return "default" as const;
  }
  if (
    status === "queued" ||
    status === "running" ||
    status === "agent_resuming"
  ) {
    return "secondary" as const;
  }
  if (status === "waiting_for_human" || status === "human_controlling") {
    return "outline" as const;
  }
  if (status === "error" || status === "timeout") {
    return "destructive" as const;
  }
  return "outline" as const;
}

function SummaryPill({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Activity;
  label: string;
  value: number;
}) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-slate-200/80 bg-slate-50/80 px-3 py-2 text-sm text-slate-600">
      <Icon className="h-4 w-4 text-slate-500" />
      <span>{label}</span>
      <span className="font-semibold text-slate-900">{value}</span>
    </div>
  );
}

export function AutomationHealthPanel({
  health,
  status,
}: {
  health: AutomationHealthResult | null;
  status: AutomationStatus | null;
}) {
  const { t, i18n } = useTranslation("settings");
  const locale = i18n.resolvedLanguage || i18n.language;
  const riskyJobs = health?.risky_jobs.slice(0, 6) ?? [];

  return (
    <Card className="rounded-[28px] border-slate-200/80 bg-white shadow-sm shadow-slate-950/5">
      <CardHeader className="pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-xl text-slate-900">
              {t("settings.automation.health.title")}
            </CardTitle>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              {t("settings.automation.health.description")}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant={status?.running ? "default" : "outline"}>
              {status?.running
                ? t("settings.automation.health.polling.running")
                : t("settings.automation.health.polling.stopped")}
            </Badge>
            <Badge variant="outline">
              {t("settings.automation.health.totalExecutions", {
                count: status?.total_executions ?? 0,
              })}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <SummaryPill
            icon={Activity}
            label={t("settings.automation.health.summary.enabled")}
            value={health?.enabled_jobs ?? 0}
          />
          <SummaryPill
            icon={Clock3}
            label={t("settings.automation.health.summary.pending")}
            value={health?.pending_jobs ?? 0}
          />
          <SummaryPill
            icon={AlertTriangle}
            label={t("settings.automation.health.summary.failed24h")}
            value={health?.failed_last_24h ?? 0}
          />
          <SummaryPill
            icon={PauseCircle}
            label={t("settings.automation.health.summary.cooldown")}
            value={health?.cooldown_jobs ?? 0}
          />
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-2 rounded-[20px] border border-slate-200/80 bg-slate-50/70 px-4 py-3 text-sm text-slate-500">
          <span>
            {t("settings.automation.health.lastPolled", {
              time: formatTime(status?.last_polled_at, locale),
            })}
          </span>
          <span>
            {t("settings.automation.health.nextPoll", {
              time: formatTime(status?.next_poll_at, locale),
            })}
          </span>
          <span>
            {t("settings.automation.health.lastPollHits", {
              count: status?.last_job_count ?? 0,
            })}
          </span>
        </div>

        {riskyJobs.length ? (
          <div className="space-y-3">
            {riskyJobs.map((job) => (
              <div
                key={job.job_id}
                className="rounded-[22px] border border-slate-200/80 bg-slate-50/70 p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">
                      {job.name}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {t("settings.automation.health.risk.failureRetry", {
                        failures: job.consecutive_failures,
                        retries: job.retry_count,
                      })}
                    </div>
                  </div>
                  <Badge variant={statusVariant(job.status)}>
                    {statusLabel(t, job.status)}
                  </Badge>
                </div>
                <div className="mt-3 text-xs text-slate-500">
                  {t("settings.automation.health.risk.cooldownUpdated", {
                    cooldown: formatTime(job.auto_disabled_until, locale),
                    updated: formatTime(job.updated_at, locale),
                  })}
                </div>
                {job.detail_message ? (
                  <div className="mt-3 rounded-[16px] border border-slate-200/80 bg-white px-3 py-2 text-xs leading-5 text-slate-600">
                    {job.detail_message}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50/60 p-6 text-sm text-slate-500">
            {t("settings.automation.health.empty")}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
