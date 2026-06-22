import { useTranslation } from "react-i18next";
import { Activity } from "lucide-react";
import { cn } from "@/lib/utils";
import type { McpPanelStatusMeta } from "./mcpPanelModel";

interface McpPanelHeaderProps {
  serverCount: number;
  runningServerCount: number;
  capabilityCount: number;
  statusMeta: McpPanelStatusMeta;
}

export function McpPanelHeader({
  serverCount,
  runningServerCount,
  capabilityCount,
  statusMeta,
}: McpPanelHeaderProps) {
  const { t } = useTranslation("settings");
  const StatusIcon = statusMeta.icon;

  return (
    <section className="rounded-[30px] border border-slate-200/80 bg-[linear-gradient(135deg,rgba(244,251,248,0.98)_0%,rgba(248,250,252,0.98)_45%,rgba(241,246,255,0.96)_100%)] p-6 shadow-sm shadow-slate-950/5">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div className="max-w-2xl space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white px-3 py-1 text-xs font-semibold text-emerald-700 shadow-sm shadow-emerald-950/5">
            <Activity className="h-3.5 w-3.5" />
            {t("settings.mcpPage.runtime.protocolLabel")}
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-semibold tracking-[-0.02em] text-slate-950">
              {t("settings.mcpPage.title")}
            </h2>
            <p className="text-sm leading-6 text-slate-600">
              {t("settings.mcpPage.runtime.description")}
            </p>
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-3 xl:min-w-[420px]">
          <div className="rounded-[20px] border border-slate-200/80 bg-white px-4 py-3 shadow-sm shadow-slate-950/5">
            <p className="text-xs font-medium text-slate-500">
              {t("settings.mcpPage.runtime.metrics.servers")}
            </p>
            <p className="mt-1 text-2xl font-semibold text-slate-950">
              {serverCount}
            </p>
            <p className="mt-1 text-xs text-emerald-700">
              {t("settings.mcpPage.runtime.metrics.runningServers", {
                count: runningServerCount,
              })}
            </p>
          </div>
          <div className="rounded-[20px] border border-slate-200/80 bg-white px-4 py-3 shadow-sm shadow-slate-950/5">
            <p className="text-xs font-medium text-slate-500">
              {t("settings.mcpPage.runtime.metrics.capabilities")}
            </p>
            <p className="mt-1 text-2xl font-semibold text-slate-950">
              {capabilityCount}
            </p>
            <p className="mt-1 text-xs text-sky-700">
              {t("settings.mcpPage.runtime.metrics.capabilityTypes")}
            </p>
          </div>
          <div
            className={cn(
              "rounded-[20px] border px-4 py-3 shadow-sm shadow-slate-950/5",
              statusMeta.className,
            )}
          >
            <p className="text-xs font-medium opacity-80">
              {t("settings.mcpPage.runtime.metrics.status")}
            </p>
            <div className="mt-1 flex items-center gap-2">
              <StatusIcon
                className={cn("h-4 w-4", statusMeta.spinning && "animate-spin")}
              />
              <p className="text-lg font-semibold">{t(statusMeta.labelKey)}</p>
            </div>
            <p className="mt-1 text-xs opacity-80">{t(statusMeta.detailKey)}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
