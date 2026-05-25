import React from "react";
import { ExternalLink, FolderOpen, RefreshCw } from "lucide-react";
import type { ManagedObjectiveStatus } from "@/lib/api/agentRuntime/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ManagedObjectiveAutomationProjection } from "./managedObjectiveAutomationProjection";
import { MANAGED_OBJECTIVE_AUTOMATION_STATUS_TONE } from "./managedObjectiveAutomationStatus";

export interface AutomationManagedObjectiveDetailsCopy {
  actionAudit: string;
  actionAuditing: string;
  actionOpenRef: string;
  actionRevealRef: string;
  auditArtifactOrEvidenceRequired: string;
  auditDefault: string;
  auditTitle: string;
  auditUnavailable: string;
  artifactsMore: (count: number) => string;
  artifactsTitle: (count: number) => string;
  blockerReason: (reason: string) => string;
  criteriaEmpty: string;
  criteriaTitle: string;
  description: string;
  evidencePackTitle: string;
  evidenceTitle: string;
  statusLabel: (status: ManagedObjectiveStatus) => string;
  title: string;
}

interface AutomationManagedObjectiveDetailsProps {
  jobId: string;
  projection: ManagedObjectiveAutomationProjection;
  copy: AutomationManagedObjectiveDetailsCopy;
  latestSessionId?: string | null;
  auditing?: boolean;
  onAuditEvidence?: () => void;
  onOpenReference?: (reference: string) => void;
  onRevealReference?: (reference: string) => void;
}

export const AutomationManagedObjectiveDetails: React.FC<
  AutomationManagedObjectiveDetailsProps
> = ({
  jobId,
  projection,
  copy,
  latestSessionId = null,
  auditing = false,
  onAuditEvidence,
  onOpenReference,
  onRevealReference,
}) => {
  const visibleArtifactRefs = projection.lastArtifactRefs.slice(0, 3);
  const hiddenArtifactCount =
    projection.lastArtifactRefs.length - visibleArtifactRefs.length;
  const canAudit = Boolean(latestSessionId) && Boolean(onAuditEvidence);
  const showReferenceActions = Boolean(onOpenReference || onRevealReference);

  function renderReferenceActions(
    reference: string,
    kind: "evidence" | "artifact",
    index: number = 0,
  ) {
    if (!showReferenceActions) {
      return null;
    }

    return (
      <div className="mt-2 flex flex-wrap gap-1.5">
        {onOpenReference ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 rounded-[10px] px-2 text-[11px] text-slate-600"
            data-testid={`automation-managed-objective-open-${kind}-${jobId}-${index}`}
            onClick={() => onOpenReference(reference)}
          >
            <ExternalLink className="mr-1 h-3.5 w-3.5" />
            {copy.actionOpenRef}
          </Button>
        ) : null}
        {onRevealReference ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 rounded-[10px] px-2 text-[11px] text-slate-600"
            data-testid={`automation-managed-objective-reveal-${kind}-${jobId}-${index}`}
            onClick={() => onRevealReference(reference)}
          >
            <FolderOpen className="mr-1 h-3.5 w-3.5" />
            {copy.actionRevealRef}
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div
      data-testid={`automation-job-managed-objective-details-${jobId}`}
      className="rounded-[22px] border border-emerald-200/80 bg-emerald-50/60 px-4 py-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-slate-900">{copy.title}</div>
          <div className="mt-1 text-xs leading-5 text-emerald-900/80">
            {copy.description}
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Badge
            variant="outline"
            className={
              MANAGED_OBJECTIVE_AUTOMATION_STATUS_TONE[projection.status]
            }
          >
            {copy.statusLabel(projection.status)}
          </Badge>
          {onAuditEvidence ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="rounded-[12px] border-emerald-200 bg-white text-emerald-800 hover:bg-emerald-50"
              data-testid={`automation-managed-objective-audit-${jobId}`}
              disabled={!canAudit || auditing}
              title={!canAudit ? copy.auditUnavailable : undefined}
              onClick={onAuditEvidence}
            >
              <RefreshCw
                className={`mr-1.5 h-3.5 w-3.5 ${auditing ? "animate-spin" : ""}`}
              />
              {auditing ? copy.actionAuditing : copy.actionAudit}
            </Button>
          ) : null}
        </div>
      </div>
      {onAuditEvidence && !latestSessionId ? (
        <div className="mt-2 text-xs leading-5 text-emerald-900/70">
          {copy.auditUnavailable}
        </div>
      ) : null}

      <div className="mt-3 text-sm font-medium leading-6 text-slate-900">
        {projection.objectiveText}
      </div>

      {projection.blockerReason ? (
        <div className="mt-3 rounded-[16px] border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
          {copy.blockerReason(projection.blockerReason)}
        </div>
      ) : null}

      <div className="mt-3 border-t border-emerald-200/80 pt-3">
        <div className="text-xs font-medium text-slate-700">
          {copy.criteriaTitle}
        </div>
        {projection.successCriteria.length > 0 ? (
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-5 text-slate-600">
            {projection.successCriteria.map((criterion, index) => (
              <li key={`${criterion}-${index}`}>{criterion}</li>
            ))}
          </ul>
        ) : (
          <div className="mt-2 text-xs leading-5 text-slate-500">
            {copy.criteriaEmpty}
          </div>
        )}
      </div>

      <div className="mt-3 border-t border-emerald-200/80 pt-3 text-xs leading-5 text-slate-600">
        <span className="font-medium text-slate-700">{copy.auditTitle}</span>:{" "}
        {projection.requiresArtifactOrEvidence
          ? copy.auditArtifactOrEvidenceRequired
          : copy.auditDefault}
      </div>

      {projection.lastAuditSummary ||
      projection.lastEvidencePackRef ||
      projection.lastArtifactRefs.length > 0 ? (
        <div className="mt-3 rounded-[16px] border border-sky-100 bg-white px-3 py-3">
          <div className="text-xs font-medium text-slate-900">
            {copy.evidenceTitle}
          </div>
          {projection.lastAuditSummary ? (
            <div className="mt-2 rounded-[12px] border border-slate-100 bg-slate-50 px-2.5 py-2 text-xs leading-5 text-slate-700">
              {projection.lastAuditSummary}
            </div>
          ) : null}
          <div className="mt-2 grid gap-2 md:grid-cols-2">
            {projection.lastEvidencePackRef ? (
              <div className="rounded-[12px] border border-slate-100 bg-slate-50 px-2.5 py-2">
                <div className="text-[11px] font-medium text-sky-700">
                  {copy.evidencePackTitle}
                </div>
                <div className="mt-1 break-all text-xs leading-5 text-slate-600">
                  {projection.lastEvidencePackRef}
                </div>
                {renderReferenceActions(
                  projection.lastEvidencePackRef,
                  "evidence",
                )}
              </div>
            ) : null}
            {projection.lastArtifactRefs.length > 0 ? (
              <div className="rounded-[12px] border border-slate-100 bg-slate-50 px-2.5 py-2">
                <div className="text-[11px] font-medium text-sky-700">
                  {copy.artifactsTitle(projection.lastArtifactRefs.length)}
                </div>
                <ul className="mt-1 space-y-1 break-all text-xs leading-5 text-slate-600">
                  {visibleArtifactRefs.map((artifactRef, index) => (
                    <li key={`${artifactRef}-${index}`}>
                      <div>{artifactRef}</div>
                      {renderReferenceActions(artifactRef, "artifact", index)}
                    </li>
                  ))}
                </ul>
                {hiddenArtifactCount > 0 ? (
                  <div className="mt-1 text-[11px] text-slate-500">
                    {copy.artifactsMore(hiddenArtifactCount)}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
};
