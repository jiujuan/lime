import type { AutomationJobRecord } from "@/lib/api/automation";
import type { AgentRun } from "@/lib/api/executionRun";
import type { AgentRuntimeObjectiveSessionRequest } from "@/lib/api/agentRuntime/sessionTypes";
import { resolveAbsoluteWorkspacePath } from "@/components/agent/chat/workspace/workspacePath";
import { resolveRunSessionId } from "./automationPresentation";

const AUTOMATION_OBJECTIVE_OWNER_KIND = "automation_job";

function runSortTime(run: AgentRun): number {
  const candidates = [
    run.started_at,
    run.finished_at,
    run.updated_at,
    run.created_at,
  ];

  for (const value of candidates) {
    if (!value) {
      continue;
    }
    const timestamp = Date.parse(value);
    if (Number.isFinite(timestamp)) {
      return timestamp;
    }
  }

  return 0;
}

export function resolveLatestAutomationObjectiveAuditSessionId(
  jobId: string,
  jobRuns: AgentRun[],
): string | null {
  const latestRunWithSession = [...jobRuns]
    .filter((run) => !run.source_ref || run.source_ref === jobId)
    .map((run) => ({
      run,
      sessionId: resolveRunSessionId(run),
      sortTime: runSortTime(run),
    }))
    .filter(
      (item): item is { run: AgentRun; sessionId: string; sortTime: number } =>
        Boolean(item.sessionId),
    )
    .sort((left, right) => right.sortTime - left.sortTime)[0];

  return latestRunWithSession?.sessionId ?? null;
}

export function buildAutomationObjectiveAuditRequest(
  job: AutomationJobRecord,
  sessionId: string,
): AgentRuntimeObjectiveSessionRequest {
  return {
    sessionId,
    ownerKind: AUTOMATION_OBJECTIVE_OWNER_KIND,
    ownerId: job.id,
  };
}

export function resolveAutomationObjectiveReferencePath(
  workspaceRoot: string | null | undefined,
  reference: string,
): string | null {
  return resolveAbsoluteWorkspacePath(workspaceRoot, reference) ?? null;
}
