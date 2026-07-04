import type { AgentRun, AgentRunStatus } from "@/lib/api/executionRun";
import type {
  WorkspaceArticleWorkflowAction,
  WorkspaceArticleWorkflowRun,
  WorkspaceArticleWorkflowStep,
} from "./workspaceArticleWorkspaceWorkflowFacts";
import {
  readWorkspaceArticleWorkflowRunsFromThreadRead,
  readWorkspaceArticleWorkflowRunsFromUnknown,
} from "./workspaceArticleWorkspaceWorkflowFacts";

export type WorkspaceWorkflowRun = WorkspaceArticleWorkflowRun;
export type WorkspaceWorkflowStep = WorkspaceArticleWorkflowStep;
export type WorkspaceWorkflowAction = WorkspaceArticleWorkflowAction;

export const readWorkspaceWorkflowRunsFromThreadRead =
  readWorkspaceArticleWorkflowRunsFromThreadRead;

export const readWorkspaceWorkflowRunsFromUnknown =
  readWorkspaceArticleWorkflowRunsFromUnknown;

export function selectWorkspaceWorkflowRunById(
  workflowRuns: readonly WorkspaceWorkflowRun[],
  workflowRunId?: string | null,
): WorkspaceWorkflowRun | null {
  const normalizedRunId = workflowRunId?.trim();
  if (!normalizedRunId) {
    return null;
  }
  return (
    workflowRuns.find((run) => run.workflowRunId === normalizedRunId) ?? null
  );
}

export function mapWorkspaceWorkflowStatusToAgentRunStatus(
  status?: string | null,
): AgentRunStatus {
  const normalized = status?.trim().toLowerCase();
  if (
    normalized === "completed" ||
    normalized === "complete" ||
    normalized === "success" ||
    normalized === "succeeded"
  ) {
    return "success";
  }
  if (
    normalized === "failed" ||
    normalized === "failure" ||
    normalized === "error"
  ) {
    return "error";
  }
  if (normalized === "canceled" || normalized === "cancelled") {
    return "canceled";
  }
  if (normalized === "queued" || normalized === "pending") {
    return "queued";
  }
  return "running";
}

export function workflowRunToAgentRun(
  run: WorkspaceWorkflowRun,
  fallbackSessionId?: string | null,
): AgentRun {
  const status = mapWorkspaceWorkflowStatusToAgentRunStatus(run.status);
  const startedAt = run.startedAt ?? run.updatedAt ?? new Date(0).toISOString();
  const finishedAt =
    run.finishedAt ??
    run.completedAt ??
    run.failedAt ??
    (status === "success" || status === "error" || status === "canceled"
      ? run.updatedAt
      : null);
  const updatedAt = run.updatedAt ?? finishedAt ?? startedAt;
  return {
    id: run.workflowRunId,
    source: "automation",
    source_ref: run.workflowTitle ?? run.workflowKey,
    session_id: run.sessionId ?? fallbackSessionId ?? null,
    status,
    started_at: startedAt,
    finished_at: finishedAt,
    duration_ms: durationMs(startedAt, finishedAt),
    error_code: status === "error" ? "workflow_failed" : null,
    error_message: status === "error" ? readWorkflowFailureMessage(run) : null,
    metadata: metadataFromWorkflowRun(run),
    created_at: startedAt,
    updated_at: updatedAt,
  };
}

function metadataFromWorkflowRun(run: WorkspaceWorkflowRun): string {
  return JSON.stringify({
    source: "workflow/read",
    workflow: run.workflowTitle ?? run.workflowKey,
    workflow_read_model: {
      workflowRunId: run.workflowRunId,
      workflowKey: run.workflowKey,
      workflowTitle: run.workflowTitle,
      status: run.status,
      sessionId: run.sessionId,
      workspaceId: run.workspaceId,
      sourceTurnId: run.turnId,
      taskId: run.taskId,
      taskKind: run.taskKind,
      eventCount: run.eventCount,
      stepCounts: run.stepCounts,
      artifactPaths: run.artifactRefs,
      evidenceRefs: run.evidenceRefs,
      failure: run.failure,
      retry: run.retry,
      actions: run.actions,
      steps: run.steps,
    },
    artifactPaths: run.artifactRefs,
  });
}

function durationMs(
  startedAt?: string | null,
  finishedAt?: string | null,
): number | null {
  if (!startedAt || !finishedAt) {
    return null;
  }
  const started = Date.parse(startedAt);
  const finished = Date.parse(finishedAt);
  if (!Number.isFinite(started) || !Number.isFinite(finished)) {
    return null;
  }
  return Math.max(0, finished - started);
}

function readWorkflowFailureMessage(run: WorkspaceWorkflowRun): string | null {
  return (
    readStringField(run.failure, [
      "message",
      "errorMessage",
      "reason",
      "reasonCode",
      "code",
      "category",
      "failureCategory",
    ]) ??
    run.steps
      .map((step) =>
        readStringField(step.failure, [
          "message",
          "errorMessage",
          "reason",
          "reasonCode",
          "code",
          "category",
          "failureCategory",
        ]),
      )
      .find((item): item is string => Boolean(item)) ??
    null
  );
}

function readStringField(
  record: Record<string, unknown> | null | undefined,
  keys: string[],
): string | null {
  if (!record) {
    return null;
  }
  for (const key of keys) {
    const value = record[key];
    if (typeof value !== "string") {
      continue;
    }
    const normalized = value.trim();
    if (normalized) {
      return normalized;
    }
  }
  return null;
}
