import React from "react";
import type { ManagedObjectiveStatus } from "@/lib/api/agentRuntime/types";
import { Badge } from "@/components/ui/badge";
import type { ManagedObjectiveAutomationProjection } from "./managedObjectiveAutomationProjection";
import { MANAGED_OBJECTIVE_AUTOMATION_STATUS_TONE } from "./managedObjectiveAutomationStatus";

export interface AutomationManagedObjectiveSummaryCopy {
  badge: string;
  auditArtifactOrEvidenceRequired: string;
  criteriaCount: (count: number) => string;
  statusLabel: (status: ManagedObjectiveStatus) => string;
}

interface AutomationManagedObjectiveSummaryProps {
  jobId: string;
  projection: ManagedObjectiveAutomationProjection;
  copy: AutomationManagedObjectiveSummaryCopy;
}

export const AutomationManagedObjectiveSummary: React.FC<
  AutomationManagedObjectiveSummaryProps
> = ({ jobId, projection, copy }) => {
  const footerItems = [
    projection.successCriteria.length > 0
      ? copy.criteriaCount(projection.successCriteria.length)
      : null,
    projection.requiresArtifactOrEvidence
      ? copy.auditArtifactOrEvidenceRequired
      : null,
  ].filter((item): item is string => Boolean(item));

  return (
    <div
      data-testid={`automation-job-managed-objective-summary-${jobId}`}
      className="max-w-[360px] space-y-1.5 pt-1"
    >
      <div className="flex flex-wrap gap-2">
        <Badge
          variant="outline"
          className="border-emerald-200 bg-emerald-50 text-emerald-700"
        >
          {copy.badge}
        </Badge>
        <Badge
          variant="outline"
          className={
            MANAGED_OBJECTIVE_AUTOMATION_STATUS_TONE[projection.status]
          }
        >
          {copy.statusLabel(projection.status)}
        </Badge>
      </div>
      <div className="line-clamp-2 text-xs leading-5 text-slate-600">
        {projection.objectiveText}
      </div>
      {footerItems.length > 0 ? (
        <div className="text-[11px] leading-4 text-slate-500">
          {footerItems.join(" · ")}
        </div>
      ) : null}
    </div>
  );
};
