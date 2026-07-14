import React, { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { ShieldCheck } from "lucide-react";

import type { ManagedObjective } from "@/lib/api/agentRuntime/sessionTypes";
import { cn } from "@/lib/utils";

interface ManagedObjectiveAuditSummaryProps {
  objective: ManagedObjective;
  className?: string;
}

const COPY = {
  artifactsLabel: "agentChat.managedObjective.audit.artifactsLabel",
  artifactsMore: "agentChat.managedObjective.audit.artifactsMore",
  evidencePackLabel: "agentChat.managedObjective.audit.evidencePackLabel",
  title: "agentChat.managedObjective.audit.title",
} as const;

export const ManagedObjectiveAuditSummary: React.FC<
  ManagedObjectiveAuditSummaryProps
> = ({ objective, className }) => {
  const { t } = useTranslation("agent");
  const text = useCallback(
    (key: string, options?: Record<string, unknown>) =>
      String(t(key as never, options as never)),
    [t],
  );

  const artifactRefs = useMemo(
    () => objective.last_artifact_refs ?? [],
    [objective.last_artifact_refs],
  );
  const visibleArtifactRefs = useMemo(
    () => artifactRefs.slice(0, 3),
    [artifactRefs],
  );
  const hiddenArtifactCount = artifactRefs.length - visibleArtifactRefs.length;

  if (
    !objective.last_audit_summary &&
    !objective.last_evidence_pack_ref &&
    artifactRefs.length === 0
  ) {
    return null;
  }

  return (
    <div
      className={cn(
        "rounded-xl border border-sky-100 bg-sky-50 px-3 py-2",
        className,
      )}
      data-testid="managed-objective-audit-summary"
    >
      <div className="flex items-center gap-2 text-xs font-medium text-sky-900">
        <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
        <span>{text(COPY.title)}</span>
      </div>

      <div className="mt-2 space-y-2 text-xs leading-5 text-slate-700">
        {objective.last_audit_summary ? (
          <p className="rounded-lg border border-sky-100 bg-white px-2.5 py-2 break-words">
            {objective.last_audit_summary}
          </p>
        ) : null}

        <div className="grid gap-2 sm:grid-cols-2">
          {objective.last_evidence_pack_ref ? (
            <div className="rounded-lg border border-sky-100 bg-white px-2.5 py-2">
              <div className="text-[11px] font-medium uppercase tracking-normal text-sky-700">
                {text(COPY.evidencePackLabel)}
              </div>
              <div className="mt-1 break-all text-slate-600">
                {objective.last_evidence_pack_ref}
              </div>
            </div>
          ) : null}

          {artifactRefs.length > 0 ? (
            <div className="rounded-lg border border-sky-100 bg-white px-2.5 py-2">
              <div className="text-[11px] font-medium uppercase tracking-normal text-sky-700">
                {text(COPY.artifactsLabel, { count: artifactRefs.length })}
              </div>
              <ul className="mt-1 space-y-1 break-all text-slate-600">
                {visibleArtifactRefs.map((artifactRef, index) => (
                  <li key={`${artifactRef}-${index}`}>{artifactRef}</li>
                ))}
              </ul>
              {hiddenArtifactCount > 0 ? (
                <p className="mt-1 text-[11px] text-slate-500">
                  {text(COPY.artifactsMore, {
                    count: hiddenArtifactCount,
                  })}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};
