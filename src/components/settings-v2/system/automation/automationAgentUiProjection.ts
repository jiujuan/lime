import type {
  AutomationJobRecord,
  AutomationStatus,
} from "@/lib/api/automation";
import type { AgentRun, AgentRunStatus } from "@/lib/api/executionRun";
import { recordAutomationJobAgentUiProjection } from "@/components/agent/chat/projection/automationJobAgentUiProjection";
import type {
  AgentUiAutomationJobProjectionEvent,
  AgentUiProjectionContext,
} from "@/components/agent/chat/projection/agentUiEventProjection";

const projectionSignatureByKey = new Map<string, string>();

function normalizeText(value?: string | null): string {
  return typeof value === "string" ? value.trim() : "";
}

function resolveJobProjectionEvent(
  job: Pick<
    AutomationJobRecord,
    "last_status" | "running_started_at" | "enabled"
  >,
): AgentUiAutomationJobProjectionEvent {
  if (job.running_started_at || job.last_status === "running") {
    return "started";
  }

  if (job.last_status === "success") {
    return "completed";
  }

  if (job.last_status === "error" || job.last_status === "timeout") {
    return "failed";
  }

  return job.enabled === false ? "updated" : "loaded";
}

function resolveRunProjectionEvent(
  status: AgentRunStatus,
): AgentUiAutomationJobProjectionEvent {
  switch (status) {
    case "running":
      return "started";
    case "success":
      return "completed";
    case "error":
    case "timeout":
    case "canceled":
      return "failed";
    case "queued":
    default:
      return "loaded";
  }
}

function mapRunStatusToJobLastStatus(
  status: AgentRunStatus,
): AutomationJobRecord["last_status"] {
  if (status === "success") {
    return "success";
  }
  if (status === "running") {
    return "running";
  }
  if (status === "timeout") {
    return "timeout";
  }
  if (status === "error" || status === "canceled") {
    return "error";
  }
  return "queued";
}

function buildProjectionSignature(params: {
  job: AutomationJobRecord;
  event: AgentUiAutomationJobProjectionEvent;
  run?: AgentRun | null;
}): string {
  const { job, event, run } = params;

  return [
    event,
    normalizeText(job.updated_at),
    normalizeText(job.last_status),
    normalizeText(job.running_started_at),
    normalizeText(job.last_finished_at),
    normalizeText(job.last_delivery?.run_id),
    normalizeText(run?.id),
    normalizeText(run?.status),
    normalizeText(run?.updated_at),
    normalizeText(run?.finished_at),
  ].join("|");
}

function recordIfChanged(params: {
  job: AutomationJobRecord;
  event: AgentUiAutomationJobProjectionEvent;
  run?: AgentRun | null;
  context?: AgentUiProjectionContext;
}) {
  const key = params.run
    ? `${params.job.id}:run:${params.run.id}`
    : `${params.job.id}:job`;
  const signature = buildProjectionSignature(params);
  if (projectionSignatureByKey.get(key) === signature) {
    return [];
  }

  projectionSignatureByKey.set(key, signature);
  return recordAutomationJobAgentUiProjection(params.job, params.event, {
    ...params.context,
    ...(params.run
      ? {
          runId: params.run.id,
          sessionId: params.run.session_id ?? params.context?.sessionId,
          timestamp:
            params.run.finished_at ??
            params.run.updated_at ??
            params.run.started_at ??
            params.context?.timestamp,
        }
      : {}),
  });
}

export function recordAutomationJobsRefreshAgentUiProjection(
  jobs: AutomationJobRecord[],
  context?: AgentUiProjectionContext,
) {
  return jobs.flatMap((job) =>
    recordIfChanged({
      job,
      event: resolveJobProjectionEvent(job),
      context,
    }),
  );
}

export function recordAutomationJobMutationAgentUiProjection(
  job: AutomationJobRecord,
  event: Extract<
    AgentUiAutomationJobProjectionEvent,
    "created" | "updated" | "deleted"
  >,
  context?: AgentUiProjectionContext,
) {
  if (event === "deleted") {
    projectionSignatureByKey.delete(`${job.id}:job`);
    return recordAutomationJobAgentUiProjection(job, "deleted", context);
  }

  return recordIfChanged({ job, event, context });
}

export function recordAutomationStatusRefreshAgentUiProjection(
  status: AutomationStatus,
  jobs: AutomationJobRecord[],
  context?: AgentUiProjectionContext,
) {
  const activeJobId = normalizeText(status.active_job_id);
  if (!activeJobId) {
    return [];
  }

  const activeJob = jobs.find((job) => job.id === activeJobId);
  if (!activeJob) {
    return [];
  }

  return recordIfChanged({
    job: {
      ...activeJob,
      last_status: "running",
      running_started_at:
        activeJob.running_started_at ??
        status.last_polled_at ??
        activeJob.last_run_at,
      updated_at: status.last_polled_at ?? activeJob.updated_at,
    },
    event: "started",
    context: {
      ...context,
      timestamp: status.last_polled_at ?? context?.timestamp,
    },
  });
}

export function recordAutomationRunHistoryAgentUiProjection(
  job: AutomationJobRecord,
  runs: AgentRun[],
  context?: AgentUiProjectionContext,
) {
  const jobRuns = runs.filter(
    (run) => run.source === "automation" && run.source_ref === job.id,
  );

  return jobRuns.flatMap((run) =>
    recordIfChanged({
      job: {
        ...job,
        last_status: mapRunStatusToJobLastStatus(run.status),
        last_run_at: run.started_at,
        last_finished_at: run.finished_at ?? job.last_finished_at,
        running_started_at:
          run.status === "running" ? run.started_at : job.running_started_at,
        last_error: run.error_message ?? job.last_error,
        updated_at: run.updated_at,
      },
      event: resolveRunProjectionEvent(run.status),
      run,
      context,
    }),
  );
}

export function resetAutomationAgentUiProjectionCacheForTest(): void {
  projectionSignatureByKey.clear();
}
