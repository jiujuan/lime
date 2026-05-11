import React from "react";
import { AlertTriangle, ShieldAlert } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ThreadReliabilityIncidentDisplay } from "../utils/threadReliabilityView";

interface AgentIncidentPanelProps {
  incidents: ThreadReliabilityIncidentDisplay[];
}

function resolveIncidentBadgeClassName(
  tone: ThreadReliabilityIncidentDisplay["tone"],
) {
  switch (tone) {
    case "failed":
      return "border-rose-200 bg-rose-50 text-rose-700";
    case "waiting":
      return "border-amber-200 bg-amber-50 text-amber-700";
    default:
      return "border-slate-200 bg-slate-50 text-slate-700";
  }
}

function resolveIncidentShellClassName(
  tone: ThreadReliabilityIncidentDisplay["tone"],
) {
  switch (tone) {
    case "failed":
      return "border-rose-200/80 bg-rose-50";
    case "waiting":
      return "border-amber-200/80 bg-amber-50";
    default:
      return "border-slate-200/80 bg-slate-50";
  }
}

export const AgentIncidentPanel: React.FC<AgentIncidentPanelProps> = ({
  incidents,
}) => {
  const { t } = useTranslation("agent");

  if (incidents.length === 0) {
    return (
      <div
        className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
        data-testid="agent-incident-panel-empty"
      >
        <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
          <ShieldAlert className="h-4 w-4" />
          <span>{t("agentChat.incidentPanel.empty")}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2" data-testid="agent-incident-panel">
      {incidents.map((incident) => (
        <div
          key={incident.id}
          className={cn(
            "rounded-2xl border px-4 py-3",
            resolveIncidentShellClassName(incident.tone),
          )}
        >
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-2 text-sm font-medium text-foreground">
              <AlertTriangle className="h-4 w-4" />
              <span>{incident.title}</span>
            </div>
            <Badge
              variant="outline"
              className={resolveIncidentBadgeClassName(incident.tone)}
            >
              {t("agentChat.incidentPanel.priorityBadge", {
                severity: incident.severityLabel,
              })}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {incident.statusLabel}
            </span>
          </div>
          {incident.detail ? (
            <div className="mt-2 text-sm leading-6 text-muted-foreground">
              {incident.detail}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
};
