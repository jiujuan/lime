import type { AutomationJobRecord } from "@/lib/api/automation";
import type {
  AgentUiPhase,
  AgentUiProjectionContext,
  AgentUiProjectionEvent,
  AgentUiRuntimeStatus,
} from "@limecloud/agent-ui-contracts";
import {
  compactProjectionFields,
  definedString,
  truncateText,
} from "@limecloud/agent-runtime-projection";
import { sequenceProjectionEvents } from "./projectionBase";

export type AgentUiAutomationJobProjectionEvent =
  | "loaded"
  | "created"
  | "updated"
  | "started"
  | "completed"
  | "failed"
  | "deleted";

type AutomationJobProjectionRecord = Partial<AutomationJobRecord> &
  Pick<AutomationJobRecord, "id" | "name">;

export interface AgentUiAutomationJobProjectionInput {
  event: AgentUiAutomationJobProjectionEvent;
  job: AutomationJobProjectionRecord;
  sessionId?: string | null;
  threadId?: string | null;
  runId?: string | null;
  timestamp?: string | null;
}

function normalizeAutomationJobRuntimeStatus(
  job: AutomationJobProjectionRecord,
  event: AgentUiAutomationJobProjectionEvent,
): AgentUiRuntimeStatus {
  if (event === "deleted") {
    return "closed";
  }

  if (job.running_started_at) {
    return "running";
  }

  switch (job.last_status) {
    case "queued":
      return "queued";
    case "running":
    case "agent_resuming":
      return "running";
    case "waiting_for_human":
      return "needs_input";
    case "human_controlling":
      return "waiting";
    case "success":
      return "completed";
    case "error":
    case "timeout":
      return "failed";
    default:
      return job.enabled === false ? "idle" : "queued";
  }
}

function automationJobPhase(status: AgentUiRuntimeStatus): AgentUiPhase {
  switch (status) {
    case "running":
      return "acting";
    case "queued":
    case "needs_input":
    case "waiting":
      return "waiting";
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    case "closed":
    case "cancelled":
      return "cancelled";
    case "idle":
    default:
      return "waiting";
  }
}

function automationJobProjectionPayload(input: {
  job: AutomationJobProjectionRecord;
  event: AgentUiAutomationJobProjectionEvent;
  runtimeStatus: AgentUiRuntimeStatus;
}): Record<string, unknown> {
  const { job, event, runtimeStatus } = input;
  return compactProjectionFields({
    taskEvent: `automation_job_${event}`,
    agentEvent: `automation_job_${event}`,
    runtimeEntity: "automation_job",
    runtimeStatus,
    jobId: job.id,
    jobName: job.name,
    descriptionPreview: truncateText(job.description),
    enabled: job.enabled,
    workspaceId: job.workspace_id,
    executionMode: job.execution_mode,
    scheduleKind: job.schedule?.kind,
    payloadKind: job.payload?.kind,
    deliveryMode: job.delivery?.mode,
    deliveryChannel: job.delivery?.channel,
    nextRunAt: job.next_run_at,
    lastStatus: job.last_status,
    lastErrorPreview: truncateText(job.last_error),
    lastRunAt: job.last_run_at,
    lastFinishedAt: job.last_finished_at,
    runningStartedAt: job.running_started_at,
    consecutiveFailures: job.consecutive_failures,
    lastRetryCount: job.last_retry_count,
    autoDisabledUntil: job.auto_disabled_until,
    lastDeliverySuccess: job.last_delivery?.success,
    lastDeliveryRunId: job.last_delivery?.run_id,
    lastDeliveryPreview: truncateText(job.last_delivery?.output_preview),
  });
}

function isAutomationJobTerminalStatus(status: AgentUiRuntimeStatus): boolean {
  return status === "completed" || status === "failed" || status === "closed";
}

export function buildAgentUiAutomationJobProjectionEvents(
  input: AgentUiAutomationJobProjectionInput,
  context: AgentUiProjectionContext = {},
): AgentUiProjectionEvent[] {
  const runtimeStatus = normalizeAutomationJobRuntimeStatus(
    input.job,
    input.event,
  );
  const phase = automationJobPhase(runtimeStatus);
  const timestamp =
    definedString(input.timestamp) ??
    context.timestamp ??
    input.job.updated_at ??
    input.job.created_at;
  const sessionId = definedString(input.sessionId ?? context.sessionId);
  const threadId = definedString(input.threadId ?? context.threadId);
  const runId =
    definedString(input.runId) ??
    definedString(input.job.last_delivery?.run_id) ??
    definedString(context.runId);
  const payload = automationJobProjectionPayload({
    job: input.job,
    event: input.event,
    runtimeStatus,
  });
  const shared = {
    sourceType: "automation_job_projection" as const,
    timestamp,
    sessionId,
    threadId,
    runId,
    taskId: input.job.id,
    agentId: input.job.id,
    workItemId: input.job.id,
    agentName: input.job.name,
    agentRole: "background_teammate",
    agentSource: "automation_job",
    topology: "background_teammate" as const,
    runtimeEntity: "automation_job" as const,
    runtimeStatus,
    latestTurnStatus: runtimeStatus,
  };
  const events: AgentUiProjectionEvent[] = [
    {
      ...shared,
      type: "task.changed",
      owner: "task",
      scope: "task",
      phase,
      surface: "task_capsule",
      persistence: "snapshot",
      control: runtimeStatus === "running" ? "stop" : "open_detail",
      payload,
      rawEventRef: input.job.id,
    },
    {
      ...shared,
      type: "agent.changed",
      owner: "agent",
      scope: "agent",
      phase,
      surface: "background_teammate",
      persistence: "snapshot",
      control: "open_detail",
      payload,
      rawEventRef: input.job.id,
    },
  ];

  if (isAutomationJobTerminalStatus(runtimeStatus)) {
    events.push({
      ...shared,
      type: "worker.notification",
      workerNotificationId: `${input.job.id}:${runtimeStatus}`,
      owner: "agent",
      scope: "agent",
      phase,
      surface: "worker_notifications",
      persistence: "archive",
      payload: {
        ...payload,
        notificationKind:
          runtimeStatus === "completed"
            ? "automation_completed"
            : "automation_stopped",
      },
      rawEventRef: input.job.id,
    });
  }

  return sequenceProjectionEvents(events, context.sequence);
}
