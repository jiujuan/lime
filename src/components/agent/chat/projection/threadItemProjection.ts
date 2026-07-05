import type {
  AgentEvent,
  AgentThreadItem,
} from "@/lib/api/agentProtocol";
import type {
  AgentUiProjectionContext,
  AgentUiProjectionEvent,
} from "@limecloud/agent-ui-contracts";
import {
  buildAgentUiThreadItemBase as buildStandardThreadItemBase,
  buildAgentUiThreadItemEvent,
  buildAgentUiThreadItemSubagentWorkerNotificationEvent,
  extractAgentUiTaskOwnerChangeProjection,
} from "@limecloud/agent-runtime-projection";
import {
  buildPlanApprovalRequiredEvent,
  buildPlanApprovalResolvedEvent,
  extractPlanApprovalProjection,
  extractPlanApprovalResponseProjection,
} from "./planApprovalProjection";
import {
  buildAgentUiTeamControlProjectionEvents,
} from "./teamControlProjection";

type ThreadItemProjectionEvent = Extract<
  AgentEvent,
  { type: "item_started" | "item_updated" | "item_completed" }
>;

function buildThreadItemBase(
  sourceType: AgentEvent["type"],
  item: AgentThreadItem,
  context: AgentUiProjectionContext,
): ReturnType<typeof buildStandardThreadItemBase> {
  return buildStandardThreadItemBase(sourceType, item, context);
}

function buildThreadItemEvent(
  sourceType: AgentEvent["type"],
  item: AgentThreadItem,
  context: AgentUiProjectionContext,
): AgentUiProjectionEvent | null {
  return buildAgentUiThreadItemEvent(sourceType, item, context);
}

function buildTaskOwnerChangeProjectionEvents(
  sourceType: AgentEvent["type"],
  item: Extract<AgentThreadItem, { type: "tool_call" }>,
  context: AgentUiProjectionContext,
): AgentUiProjectionEvent[] {
  if (sourceType !== "item_completed") {
    return [];
  }

  const taskOwnerProjection = extractAgentUiTaskOwnerChangeProjection({
    toolName: item.tool_name,
    status: item.status,
    success: item.success,
    metadata: item.metadata,
  });
  if (!taskOwnerProjection) {
    return [];
  }

  const timestamp = item.completed_at ?? item.updated_at ?? context.timestamp;

  return buildAgentUiTeamControlProjectionEvents(
    {
      action: taskOwnerProjection.action,
      requestedSessionIds: [taskOwnerProjection.taskId],
      workItemId: taskOwnerProjection.taskId,
      previousAssigneeId: taskOwnerProjection.previousAssigneeId,
      nextAssigneeId: taskOwnerProjection.nextAssigneeId,
      reassignmentReason: taskOwnerProjection.reassignmentReason,
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
      sourceToolName: taskOwnerProjection.sourceToolName,
      sourceToolCallId: item.id,
      ...(taskOwnerProjection.sourceTaskListId
        ? { sourceTaskListId: taskOwnerProjection.sourceTaskListId }
        : {}),
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
    const workerNotification =
      buildAgentUiThreadItemSubagentWorkerNotificationEvent(
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

export function buildThreadItemProjectionEvents(
  event: ThreadItemProjectionEvent,
  context: AgentUiProjectionContext,
): AgentUiProjectionEvent[] {
  return buildThreadItemEvents(event.type, event.item, context);
}
