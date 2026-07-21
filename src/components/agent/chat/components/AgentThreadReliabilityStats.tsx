import type { ReactNode } from "react";
import { AlertTriangle, ListTodo } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ThreadReliabilityTone } from "../utils/threadReliabilityView";
import { resolveStatShellClassName } from "./AgentThreadReliabilityPanelViewModel";

interface AgentThreadReliabilityStatsProps {
  activeIncidentCount: number;
  activeIncidentsLabel: string;
  pendingRequestCount: number;
  pendingRequestsLabel: string;
}

function StatCard({
  icon,
  label,
  tone,
  value,
}: {
  icon: ReactNode;
  label: string;
  tone: ThreadReliabilityTone;
  value: number;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border px-3 py-3",
        resolveStatShellClassName(tone),
      )}
    >
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <div className="mt-2 text-2xl font-semibold text-foreground">{value}</div>
    </div>
  );
}

export function AgentThreadReliabilityStats({
  activeIncidentCount,
  activeIncidentsLabel,
  pendingRequestCount,
  pendingRequestsLabel,
}: AgentThreadReliabilityStatsProps) {
  return (
    <div className="mt-4 grid gap-2 md:grid-cols-2">
      <StatCard
        icon={<ListTodo className="h-4 w-4" />}
        label={pendingRequestsLabel}
        tone={pendingRequestCount > 0 ? "waiting" : "neutral"}
        value={pendingRequestCount}
      />
      <StatCard
        icon={<AlertTriangle className="h-4 w-4" />}
        label={activeIncidentsLabel}
        tone={activeIncidentCount > 0 ? "failed" : "neutral"}
        value={activeIncidentCount}
      />
    </div>
  );
}
