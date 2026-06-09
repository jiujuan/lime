import type {
  AgentEvent,
  AgentThreadItem,
} from "@/lib/api/agentProtocol";
import type {
  AgentUiEventClass,
  AgentUiPhase,
  AgentUiProjectionContext,
  AgentUiProjectionEvent,
} from "@limecloud/agent-ui-contracts";
import {
  extractArtifactRefs,
  metadataKeys,
  readRecord,
  readStringArrayField,
  readStringField,
  truncateText,
} from "@limecloud/agent-runtime-projection";
import {
  buildPlanApprovalRequiredEvent,
  buildPlanApprovalResolvedEvent,
  extractPlanApprovalProjection,
  extractPlanApprovalResponseProjection,
} from "./planApprovalProjection";
import { buildAgentUiProjectionBase as buildBase } from "./projectionBase";
import {
  buildAgentUiTeamControlProjectionEvents,
} from "./teamControlProjection";
import type { AgentUiTeamControlProjectionAction } from "./teamControlProjection";

function threadItemPhase(item: AgentThreadItem): AgentUiPhase {
  if (item.status === "failed") {
    return "failed";
  }
  if (item.status === "completed") {
    return "completed";
  }
  return "acting";
}

function threadItemToolResultType(item: AgentThreadItem): AgentUiEventClass {
  if (item.status === "failed") {
    return "tool.failed";
  }
  if (
    item.type === "command_execution" &&
    typeof item.exit_code === "number" &&
    item.exit_code !== 0
  ) {
    return "tool.failed";
  }
  if (item.status === "completed") {
    return "tool.result";
  }
  return "tool.progress";
}

function threadItemToolPhase(item: AgentThreadItem): AgentUiPhase {
  if (threadItemToolResultType(item) === "tool.failed") {
    return "failed";
  }
  return threadItemPhase(item);
}

function buildThreadItemBase(
  sourceType: AgentEvent["type"],
  item: AgentThreadItem,
  context: AgentUiProjectionContext,
): Pick<
  AgentUiProjectionEvent,
  | "sourceType"
  | "timestamp"
  | "sessionId"
  | "threadId"
  | "runId"
  | "turnId"
  | "messageId"
  | "taskId"
  | "partId"
  | "runtimeEntity"
> {
  return {
    ...buildBase({ type: sourceType } as AgentEvent, context),
    threadId: item.thread_id,
    turnId: item.turn_id,
    partId: item.id,
  };
}

function buildThreadItemEvent(
  sourceType: AgentEvent["type"],
  item: AgentThreadItem,
  context: AgentUiProjectionContext,
): AgentUiProjectionEvent | null {
  const base = buildThreadItemBase(sourceType, item, context);

  switch (item.type) {
    case "plan":
      return {
        ...base,
        type: item.status === "completed" ? "plan.final" : "plan.delta",
        owner: "model",
        scope: "part",
        phase: item.status === "completed" ? "completed" : "planning",
        surface: "inline_process",
        persistence: "archive",
        payload: {
          textLength: item.text.length,
          preview: truncateText(item.text),
        },
      };
    case "reasoning":
      return {
        ...base,
        type:
          item.status === "completed" ? "reasoning.summary" : "reasoning.delta",
        owner: "model",
        scope: "part",
        phase: item.status === "completed" ? "completed" : "reasoning",
        surface: "inline_process",
        persistence: "archive",
        payload: {
          textLength: item.text.length,
          summaryCount: item.summary?.length ?? 0,
          preview: truncateText(item.summary?.[0] ?? item.text),
        },
      };
    case "tool_call":
      return {
        ...base,
        type:
          item.status === "failed" || item.success === false
            ? "tool.failed"
            : item.status === "completed"
              ? "tool.result"
              : "tool.progress",
        toolCallId: item.id,
        owner: "tool",
        scope: "tool_call",
        phase: threadItemPhase(item),
        surface: "tool_ui",
        persistence: "archive",
        payload: {
          toolName: item.tool_name,
          success: item.success,
          outputPreview: truncateText(item.output),
          errorPreview: truncateText(item.error),
          metadataKeys: metadataKeys(item.metadata),
        },
        refs: extractArtifactRefs(item.metadata),
      };
    case "command_execution":
      return {
        ...base,
        type: threadItemToolResultType(item),
        toolCallId: item.id,
        owner: "tool",
        scope: "tool_call",
        phase: threadItemToolPhase(item),
        surface: "tool_ui",
        persistence: "archive",
        payload: {
          toolName: "command_execution",
          commandPreview: truncateText(item.command),
          cwd: item.cwd,
          exitCode: item.exit_code,
          outputPreview: truncateText(item.aggregated_output),
          errorPreview: truncateText(item.error),
        },
      };
    case "web_search":
      return {
        ...base,
        type: threadItemToolResultType(item),
        toolCallId: item.id,
        owner: "tool",
        scope: "tool_call",
        phase: threadItemToolPhase(item),
        surface: "tool_ui",
        persistence: "archive",
        payload: {
          toolName: "web_search",
          queryPreview: truncateText(item.query),
          action: item.action,
          outputPreview: truncateText(item.output),
        },
      };
    case "approval_request":
    case "request_user_input":
      return {
        ...base,
        type: item.response ? "action.resolved" : "action.required",
        actionId: item.request_id,
        owner: "action",
        scope: "action_request",
        phase: item.response ? "completed" : "waiting",
        surface: "hitl",
        persistence: "archive",
        control: item.type === "request_user_input" ? "answer" : "approve",
        payload: {
          actionType: item.action_type,
          promptPreview: truncateText(item.prompt),
          questionCount:
            item.type === "request_user_input"
              ? (item.questions?.length ?? 0)
              : 0,
          hasResponse: Boolean(item.response),
        },
      };
    case "file_artifact":
      return {
        ...base,
        type:
          item.status === "completed"
            ? "artifact.preview.ready"
            : "artifact.updated",
        artifactId: item.id,
        owner: "artifact",
        scope: "artifact",
        phase: item.status === "completed" ? "completed" : "producing",
        surface: "artifact_workspace",
        persistence: "artifact_store",
        payload: {
          filePath: item.path,
          source: item.source,
          contentLength: item.content?.length ?? 0,
          metadataKeys: metadataKeys(item.metadata),
        },
        refs: {
          artifactIds: [item.id],
          artifactPaths: [item.path],
        },
      };
    case "subagent_activity":
      return {
        ...base,
        type: "agent.changed",
        taskId: item.session_id,
        agentId: item.session_id,
        owner: "task",
        scope: "agent",
        phase: threadItemPhase(item),
        surface: "task_capsule",
        persistence: "archive",
        runtimeEntity: "subagent_turn",
        runtimeStatus:
          item.status === "failed"
            ? "failed"
            : item.status === "completed"
              ? "completed"
              : "running",
        latestTurnStatus:
          item.status === "failed"
            ? "failed"
            : item.status === "completed"
              ? "completed"
              : "running",
        topology: "coordinator_team",
        payload: {
          runtimeEntity: "subagent_turn",
          statusLabel: item.status_label,
          title: item.title,
          role: item.role,
          model: item.model,
          childSessionId: item.session_id,
        },
      };
    case "context_compaction":
      return {
        ...base,
        type:
          item.stage === "completed"
            ? "context.compaction.completed"
            : "context.compaction.started",
        owner: "context",
        scope: "turn",
        phase: item.stage === "completed" ? "completed" : "preparing",
        surface: "timeline_evidence",
        persistence: "archive",
        payload: {
          stage: item.stage,
          trigger: item.trigger,
          detailPreview: truncateText(item.detail),
        },
      };
    case "turn_summary":
      return {
        ...base,
        type: "state.snapshot",
        owner: "session",
        scope: "turn",
        phase: "archived",
        surface: "timeline_evidence",
        persistence: "archive",
        payload: {
          textLength: item.text.length,
          preview: truncateText(item.text),
        },
      };
    case "warning":
    case "error":
      return {
        ...base,
        type: "diagnostic.changed",
        owner: "diagnostics",
        scope: "turn",
        phase: item.type === "error" ? "failed" : threadItemPhase(item),
        surface: "diagnostics",
        persistence: "diagnostics_log",
        payload: {
          code: item.type === "warning" ? item.code : undefined,
          messagePreview:
            item.type === "warning"
              ? truncateText(item.message)
              : truncateText(item.message),
        },
      };
    default:
      return null;
  }
}

function buildSubagentActivityWorkerNotificationEvent(
  sourceType: AgentEvent["type"],
  item: Extract<AgentThreadItem, { type: "subagent_activity" }>,
  context: AgentUiProjectionContext,
): AgentUiProjectionEvent | null {
  const phase = threadItemPhase(item);
  if (phase !== "completed" && phase !== "failed") {
    return null;
  }

  return {
    ...buildThreadItemBase(sourceType, item, context),
    type: "worker.notification",
    taskId: item.session_id,
    agentId: item.session_id,
    workerNotificationId: item.id,
    transcriptRef: `${item.thread_id}:${item.turn_id}:${item.id}`,
    owner: "agent",
    scope: "agent",
    phase,
    surface: "worker_notifications",
    persistence: "archive",
    runtimeEntity: "subagent_turn",
    runtimeStatus: phase === "failed" ? "failed" : "completed",
    latestTurnStatus: phase === "failed" ? "failed" : "completed",
    topology: "coordinator_team",
    payload: {
      runtimeEntity: "subagent_turn",
      notificationKind: "worker_result",
      statusLabel: item.status_label,
      title: item.title,
      summaryPreview: truncateText(item.summary),
      role: item.role,
      model: item.model,
      childSessionId: item.session_id,
    },
  };
}

function normalizeProjectionToolName(toolName: string): string {
  return toolName.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function isTaskUpdateToolName(toolName: string): boolean {
  const normalized = normalizeProjectionToolName(toolName);
  return normalized === "taskupdate" || normalized === "taskupdatetool";
}

function buildTaskOwnerChangeProjectionEvents(
  sourceType: AgentEvent["type"],
  item: Extract<AgentThreadItem, { type: "tool_call" }>,
  context: AgentUiProjectionContext,
): AgentUiProjectionEvent[] {
  if (
    sourceType !== "item_completed" ||
    item.status !== "completed" ||
    item.success === false ||
    !isTaskUpdateToolName(item.tool_name)
  ) {
    return [];
  }

  const metadata = readRecord(item.metadata);
  const updatedFields = readStringArrayField(metadata, [
    "updated_fields",
    "updatedFields",
  ]).map((field) => field.toLowerCase());
  if (!updatedFields.includes("owner")) {
    return [];
  }

  const task = readRecord(metadata?.task);
  const ownerChange = readRecord(
    metadata?.owner_change ?? metadata?.ownerChange,
  );
  const taskId =
    readStringField(metadata, ["task_id", "taskId"]) ??
    readStringField(task, ["id", "taskId"]);
  const nextAssigneeId =
    readStringField(ownerChange, ["to", "next", "nextOwner"]) ??
    readStringField(task, ["owner", "ownerName"]);
  if (!taskId || !nextAssigneeId) {
    return [];
  }

  const previousAssigneeId = readStringField(ownerChange, [
    "from",
    "previous",
    "previousOwner",
  ]);
  const sourceTaskListId = readStringField(metadata, [
    "task_list_id",
    "taskListId",
  ]);
  const action: AgentUiTeamControlProjectionAction = previousAssigneeId
    ? "reassign"
    : "assign";
  const timestamp = item.completed_at ?? item.updated_at ?? context.timestamp;

  return buildAgentUiTeamControlProjectionEvents(
    {
      action,
      requestedSessionIds: [taskId],
      workItemId: taskId,
      previousAssigneeId,
      nextAssigneeId,
      reassignmentReason: `${item.tool_name} owner change`,
      resolvedStatus: "assigned",
      runtimeEntity: "work_item",
      timestamp,
    },
    context,
  ).map((event) => ({
    ...event,
    sourceType,
    timestamp: event.timestamp ?? timestamp,
    threadId: item.thread_id,
    turnId: item.turn_id,
    partId: item.id,
    toolCallId: item.id,
    payload: {
      ...event.payload,
      sourceToolName: item.tool_name,
      sourceToolCallId: item.id,
      ...(sourceTaskListId ? { sourceTaskListId } : {}),
    },
  }));
}

export function buildThreadItemEvents(
  sourceType: AgentEvent["type"],
  item: AgentThreadItem,
  context: AgentUiProjectionContext,
): AgentUiProjectionEvent[] {
  const primary = buildThreadItemEvent(sourceType, item, context);
  const events = primary ? [primary] : [];

  if (item.type === "subagent_activity") {
    const workerNotification = buildSubagentActivityWorkerNotificationEvent(
      sourceType,
      item,
      context,
    );
    if (workerNotification) {
      events.push(workerNotification);
    }
    return events;
  }

  if (item.type !== "tool_call") {
    return events;
  }

  const planApproval = extractPlanApprovalProjection(item.metadata);
  const planApprovalResponse = extractPlanApprovalResponseProjection(
    item.metadata,
  );
  if (planApproval) {
    events.push(
      buildPlanApprovalRequiredEvent({
        base: buildThreadItemBase(sourceType, item, context),
        projection: planApproval,
        persistence: "archive",
        toolCallId: item.id,
      }),
    );
  }
  if (planApprovalResponse) {
    events.push(
      buildPlanApprovalResolvedEvent({
        base: buildThreadItemBase(sourceType, item, context),
        projection: planApprovalResponse,
        persistence: "archive",
        toolCallId: item.id,
      }),
    );
  }
  events.push(
    ...buildTaskOwnerChangeProjectionEvents(sourceType, item, context),
  );
  return events;
}
