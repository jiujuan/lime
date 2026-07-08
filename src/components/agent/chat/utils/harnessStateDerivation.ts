import type { AgentThreadItem } from "@/lib/api/agentProtocol";
import type { ActionRequired, Message } from "../types";
import { extractArtifactProtocolPathsFromValue } from "@/lib/artifact-protocol";
import { shouldHideTurnSummaryFromConversation } from "./turnSummaryPresentation";
import { hydrateAgentPlanState } from "./planState";
import { hydrateAgentReasoningState } from "./modelReasoningState";
import { resolveUserFacingToolDisplayLabel } from "./toolDisplayInfo";
import type {
  HarnessDelegatedTask,
  HarnessFileEvent,
  HarnessOutputSignal,
  HarnessPlanPhase,
  HarnessSessionShellState,
  HarnessSessionState,
  HarnessTodoItem,
  HarnessToolActivity,
  PersistedHarnessTodoLike,
} from "./harnessStateTypes";
import {
  asRecord,
  buildTextPreview,
  collectToolCalls,
  extractLatestRuntimeStatus,
  extractSearchQuery,
  fileNameFromPath,
  HARNESS_OUTPUT_SIGNAL_LIMIT,
  maybeKeepTextContent,
  normalizeDate,
  normalizeToolName,
  resolveTimestamp,
  TODO_SNAPSHOT_TOOL_NAMES,
  WEB_TOOL_RE,
} from "./harnessStateCore";
import {
  extractTodoSnapshot,
  normalizePersistedTodoItems,
  planStateToHarnessPhase,
  planStateToTodoItems,
  shouldUseStandardPlanState,
} from "./harnessStatePlan";
import {
  classifyToolActivity,
  extractActiveFileWrites,
  extractDelegatedTask,
  extractFileEventFromToolCall,
  extractFileEventsFromOutputSignal,
  extractOutputSignal,
  mergeFileEvent,
} from "./harnessStateSignals";
import { resolveFileKind } from "./harnessStateCore";

function itemTimestamp(item: AgentThreadItem): number {
  return resolveTimestamp(item.completed_at, item.updated_at, item.started_at);
}

function pickItemPath(item: AgentThreadItem): string | undefined {
  if (item.type === "file_artifact") {
    return item.path;
  }

  if (item.type === "tool_call") {
    return extractArtifactProtocolPathsFromValue(item.metadata)[0];
  }

  return undefined;
}

function toActionRequired(item: AgentThreadItem): ActionRequired | null {
  if (item.type === "approval_request") {
    return {
      requestId: item.request_id,
      actionType: item.action_type as ActionRequired["actionType"],
      prompt: item.prompt,
      toolName: item.tool_name,
      arguments: asRecord(item.arguments) || undefined,
      status: item.status === "completed" ? "submitted" : "pending",
      submittedUserData: item.response,
      submittedResponse:
        typeof item.response === "string" ? item.response : undefined,
    };
  }

  if (item.type === "request_user_input") {
    return {
      requestId: item.request_id,
      actionType: item.action_type as ActionRequired["actionType"],
      prompt: item.prompt,
      questions: item.questions?.map((question) => ({
        question: question.question,
        header: question.header,
        options: question.options?.map((option) => ({
          label: option.label,
          description: option.description,
        })),
        multiSelect: question.multi_select,
      })),
      status: item.status === "completed" ? "submitted" : "pending",
      submittedUserData: item.response,
      submittedResponse:
        typeof item.response === "string" ? item.response : undefined,
    };
  }

  return null;
}

function summarizePlanDecisionText(text?: string): string | undefined {
  return buildTextPreview(text, {
    maxLines: 4,
    maxChars: 240,
  });
}

export function deriveHarnessSessionShellState(
  messages: Message[],
  pendingApprovals: ActionRequired[],
  persistedTodoItems?: readonly PersistedHarnessTodoLike[],
): HarnessSessionShellState {
  const safePendingApprovals = Array.isArray(pendingApprovals)
    ? pendingApprovals
    : [];
  const latestContextTrace =
    [...messages]
      .reverse()
      .find(
        (message) =>
          Array.isArray(message.contextTrace) &&
          message.contextTrace.length > 0,
      )?.contextTrace || [];
  const runtimeStatus = extractLatestRuntimeStatus(messages);
  const planItems = normalizePersistedTodoItems(persistedTodoItems);

  const planPhase: HarnessPlanPhase =
    planItems.length > 0 ? "planning" : "idle";
  const hasSignals =
    runtimeStatus !== null ||
    safePendingApprovals.length > 0 ||
    latestContextTrace.length > 0 ||
    planItems.length > 0;

  return {
    runtimeStatus,
    pendingApprovals: safePendingApprovals,
    latestContextTrace,
    plan: {
      phase: planPhase,
      items: planItems,
    },
    hasSignals,
  };
}

export function deriveHarnessSessionStateFromItems(
  messages: Message[],
  pendingApprovals: ActionRequired[],
  items: AgentThreadItem[],
  persistedTodoItems: HarnessTodoItem[],
): HarnessSessionState {
  const safePendingApprovals = Array.isArray(pendingApprovals)
    ? pendingApprovals
    : [];
  const sortedItems = [...items].sort(
    (left, right) => itemTimestamp(left) - itemTimestamp(right),
  );
  const latestContextTrace =
    [...messages]
      .reverse()
      .find(
        (message) =>
          Array.isArray(message.contextTrace) &&
          message.contextTrace.length > 0,
      )?.contextTrace || [];
  const runtimeStatus = extractLatestRuntimeStatus(messages);
  const activeFileWrites = extractActiveFileWrites(messages);

  const activity: HarnessToolActivity = {
    planning: 0,
    filesystem: 0,
    execution: 0,
    web: 0,
    skills: 0,
    delegation: 0,
  };
  const delegatedTasks: HarnessDelegatedTask[] = [];
  const outputSignals: HarnessOutputSignal[] = [];
  const recentFileEvents: HarnessFileEvent[] = [];
  const derivedApprovalMap = new Map<string, ActionRequired>();
  let latestTurnSummaryItem: Extract<
    AgentThreadItem,
    { type: "turn_summary" }
  > | null = null;

  for (const item of sortedItems) {
    switch (item.type) {
      case "plan":
        break;
      case "file_artifact": {
        activity.filesystem += 1;
        recentFileEvents.push({
          id: item.id,
          toolCallId: item.id,
          path: item.path,
          displayName: fileNameFromPath(item.path),
          kind: resolveFileKind(item.path, "artifact"),
          action: "persist",
          sourceToolName: "Artifact",
          timestamp:
            normalizeDate(item.completed_at || item.updated_at) ?? undefined,
          preview: buildTextPreview(item.content),
          content: maybeKeepTextContent(item.content),
          clickable: true,
        });
        outputSignals.push({
          id: `${item.id}:artifact`,
          toolCallId: item.id,
          toolName: "artifact",
          title: "产物已写入",
          summary: fileNameFromPath(item.path),
          preview: buildTextPreview(item.content),
          content: maybeKeepTextContent(item.content),
          artifactPath: item.path,
        });
        break;
      }
      case "command_execution":
        activity.execution += 1;
        outputSignals.push({
          id: `${item.id}:command`,
          toolCallId: item.id,
          toolName: "command_execution",
          title: "命令执行摘要",
          summary: item.command,
          preview: buildTextPreview(item.aggregated_output),
          content: maybeKeepTextContent(item.aggregated_output),
          exitCode: item.exit_code,
        });
        break;
      case "web_search":
        activity.web += 1;
        outputSignals.push({
          id: `${item.id}:web`,
          toolCallId: item.id,
          toolName: "web_search",
          title: "联网检索摘要",
          summary: item.query || "联网检索",
          preview: buildTextPreview(item.output),
          content: maybeKeepTextContent(item.output),
        });
        break;
      case "turn_summary":
        if (shouldHideTurnSummaryFromConversation(item)) {
          break;
        }
        activity.planning += 1;
        latestTurnSummaryItem = item;
        outputSignals.push({
          id: `${item.id}:summary`,
          toolCallId: item.id,
          toolName: "turn_summary",
          title: "当前任务摘要",
          summary: item.text.split(/\r?\n/)[0] || "当前进展",
          preview: buildTextPreview(item.text),
          content: maybeKeepTextContent(item.text),
        });
        break;
      case "tool_call": {
        const normalizedName = normalizeToolName(item.tool_name);
        classifyToolActivity(activity, normalizedName);
        const artifactPath = pickItemPath(item);
        const argumentRecord = asRecord(item.arguments);
        const queryLabel = extractSearchQuery(argumentRecord);
        const searchLike = WEB_TOOL_RE.test(normalizedName);
        outputSignals.push({
          id: `${item.id}:tool`,
          toolCallId: item.id,
          toolName: item.tool_name,
          title: artifactPath
            ? "产物已写入"
            : searchLike
              ? /^https?:\/\//i.test(queryLabel || "")
                ? "网页访问摘要"
                : "联网检索摘要"
              : "处理摘要",
          summary:
            artifactPath ||
            queryLabel ||
            resolveUserFacingToolDisplayLabel(item.tool_name),
          preview: buildTextPreview(item.output),
          content: maybeKeepTextContent(item.output),
          artifactPath,
        });
        if (artifactPath) {
          recentFileEvents.push({
            id: `${item.id}:tool-file`,
            toolCallId: item.id,
            path: artifactPath,
            displayName: fileNameFromPath(artifactPath),
            kind: resolveFileKind(artifactPath, "artifact"),
            action: "persist",
            sourceToolName: item.tool_name,
            timestamp:
              normalizeDate(item.completed_at || item.updated_at) ?? undefined,
            preview: buildTextPreview(item.output),
            content: maybeKeepTextContent(item.output),
            clickable: true,
          });
        }
        break;
      }
      case "subagent_activity":
        activity.delegation += 1;
        delegatedTasks.push({
          id: item.id,
          title: item.title || "子任务",
          status:
            item.status === "failed"
              ? "failed"
              : item.status === "completed"
                ? "completed"
                : "running",
          role: item.role,
          model: item.model,
          summary: item.summary,
          startedAt: normalizeDate(item.started_at) ?? undefined,
        });
        break;
      case "approval_request":
      case "request_user_input": {
        const derived = toActionRequired(item);
        if (derived) {
          derivedApprovalMap.set(derived.requestId, derived);
        }
        break;
      }
      default:
        break;
    }
  }

  const standardPlanState = hydrateAgentPlanState({
    threadItems: sortedItems,
  });
  const reasoningState = hydrateAgentReasoningState({
    threadItems: sortedItems,
  });
  const reasoningRunStatus = reasoningState.reasoning.status;
  const hasReasoningSignal =
    reasoningState.reasoning.supported &&
    ((typeof reasoningRunStatus === "string" &&
      reasoningRunStatus !== "idle") ||
      Boolean(reasoningState.reasoning.text?.trim()));
  const useStandardPlanState = shouldUseStandardPlanState(standardPlanState);
  if (useStandardPlanState) {
    activity.planning += 1;
  }
  const planStateTodoItems = planStateToTodoItems(standardPlanState);
  const planItems =
    planStateTodoItems.length > 0 ? planStateTodoItems : persistedTodoItems;
  const planSummaryText =
    planItems.length > 0
      ? undefined
      : summarizePlanDecisionText(latestTurnSummaryItem?.text);
  const mergedApprovals = [...safePendingApprovals];
  for (const derived of derivedApprovalMap.values()) {
    if (!mergedApprovals.some((item) => item.requestId === derived.requestId)) {
      mergedApprovals.push(derived);
    }
  }

  const planPhase: HarnessPlanPhase =
    planStateTodoItems.length > 0
      ? planStateToHarnessPhase(standardPlanState)
      : planItems.length > 0
        ? "planning"
        : planSummaryText
          ? "ready"
          : "idle";
  const hasSignals =
    runtimeStatus !== null ||
    mergedApprovals.length > 0 ||
    latestContextTrace.length > 0 ||
    planItems.length > 0 ||
    hasReasoningSignal ||
    delegatedTasks.length > 0 ||
    outputSignals.length > 0 ||
    activeFileWrites.length > 0 ||
    recentFileEvents.length > 0 ||
    Object.values(activity).some((count) => count > 0);

  return {
    runtimeStatus,
    pendingApprovals: mergedApprovals,
    latestContextTrace,
    plan: {
      phase: planPhase,
      items: planItems,
      sourceToolCallId:
        (planStateTodoItems.length > 0
          ? standardPlanState.itemId || standardPlanState.revisionId
          : undefined) || latestTurnSummaryItem?.id,
      summaryText: planSummaryText,
      revisionId: useStandardPlanState
        ? standardPlanState.revisionId
        : undefined,
      turnId: useStandardPlanState ? standardPlanState.turnId : undefined,
      source: useStandardPlanState ? standardPlanState.source : undefined,
    },
    reasoning: reasoningState,
    activity,
    delegatedTasks: delegatedTasks.slice(-5).reverse(),
    outputSignals: outputSignals.slice(-HARNESS_OUTPUT_SIGNAL_LIMIT).reverse(),
    activeFileWrites,
    recentFileEvents: recentFileEvents
      .sort((left, right) => {
        const leftTime = left.timestamp?.getTime() ?? 0;
        const rightTime = right.timestamp?.getTime() ?? 0;
        return rightTime - leftTime;
      })
      .slice(0, 5),
    hasSignals,
  };
}

export function deriveHarnessSessionStateFromMessages(
  messages: Message[],
  pendingApprovals: ActionRequired[],
  persistedTodoItems: HarnessTodoItem[],
): HarnessSessionState {
  const safePendingApprovals = Array.isArray(pendingApprovals)
    ? pendingApprovals
    : [];
  const runtimeStatus = extractLatestRuntimeStatus(messages);
  const reasoningState = hydrateAgentReasoningState({});
  const activeFileWrites = extractActiveFileWrites(messages);
  const toolCalls = collectToolCalls(messages);
  const activity: HarnessToolActivity = {
    planning: 0,
    filesystem: 0,
    execution: 0,
    web: 0,
    skills: 0,
    delegation: 0,
  };

  let latestTodoItems: HarnessTodoItem[] = [];
  let latestTodoSourceToolCallId: string | undefined;
  let latestPlanningTimestamp = 0;
  let latestExitPlanTimestamp = 0;
  let latestDecisionSummaryText: string | undefined;
  const delegatedTasks: HarnessDelegatedTask[] = [];
  const outputSignals: HarnessOutputSignal[] = [];
  const recentFileEventMap = new Map<string, HarnessFileEvent>();

  for (const entry of toolCalls) {
    const normalizedName = normalizeToolName(entry.toolCall.name);
    const timestamp = resolveTimestamp(
      entry.toolCall.endTime,
      entry.toolCall.startTime,
      entry.messageTimestamp,
    );

    classifyToolActivity(activity, normalizedName);

    if (TODO_SNAPSHOT_TOOL_NAMES.has(normalizedName)) {
      latestPlanningTimestamp = Math.max(latestPlanningTimestamp, timestamp);
      const snapshot = extractTodoSnapshot(entry.toolCall);
      if (snapshot.length > 0) {
        latestTodoItems = snapshot;
        latestTodoSourceToolCallId = entry.toolCall.id;
      }
      continue;
    }

    if (normalizedName === "enterplanmode") {
      latestPlanningTimestamp = Math.max(latestPlanningTimestamp, timestamp);
      continue;
    }

    if (
      normalizedName === "exitplanmode" &&
      entry.toolCall.status === "completed"
    ) {
      latestExitPlanTimestamp = Math.max(latestExitPlanTimestamp, timestamp);
      continue;
    }

    if (normalizedName === "subagenttask") {
      delegatedTasks.push(extractDelegatedTask(entry.toolCall));
    }

    const fileEvent = extractFileEventFromToolCall(
      entry.toolCall,
      normalizedName,
    );
    if (fileEvent) {
      recentFileEventMap.set(
        fileEvent.id,
        mergeFileEvent(recentFileEventMap.get(fileEvent.id), fileEvent),
      );
    }

    const outputSignal = extractOutputSignal(entry.toolCall);
    if (outputSignal) {
      outputSignals.push(outputSignal);
      const outputFileEvents = extractFileEventsFromOutputSignal(
        outputSignal,
        entry.toolCall,
      );
      outputFileEvents.forEach((event) => {
        recentFileEventMap.set(
          event.id,
          mergeFileEvent(recentFileEventMap.get(event.id), event),
        );
      });
    }
  }

  const recentFileEvents = [...recentFileEventMap.values()]
    .sort((left, right) => {
      const leftTime = left.timestamp?.getTime() ?? 0;
      const rightTime = right.timestamp?.getTime() ?? 0;
      return rightTime - leftTime;
    })
    .slice(0, 5);

  const latestContextTrace =
    [...messages]
      .reverse()
      .find(
        (message) =>
          Array.isArray(message.contextTrace) &&
          message.contextTrace.length > 0,
      )?.contextTrace || [];

  if (latestTodoItems.length === 0) {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (message.role !== "assistant") {
        continue;
      }
      latestDecisionSummaryText = summarizePlanDecisionText(message.content);
      if (latestDecisionSummaryText) {
        break;
      }
    }
  }

  if (latestTodoItems.length === 0 && persistedTodoItems.length > 0) {
    latestTodoItems = persistedTodoItems;
  }

  const planPhase: HarnessPlanPhase =
    latestPlanningTimestamp === 0 &&
    latestExitPlanTimestamp === 0 &&
    latestTodoItems.length === 0 &&
    !latestDecisionSummaryText
      ? "idle"
      : latestTodoItems.length === 0 &&
          latestPlanningTimestamp === 0 &&
          latestExitPlanTimestamp === 0 &&
          latestDecisionSummaryText
        ? "ready"
        : latestExitPlanTimestamp > 0 &&
            latestExitPlanTimestamp >= latestPlanningTimestamp
          ? "ready"
          : "planning";

  const hasSignals =
    runtimeStatus !== null ||
    safePendingApprovals.length > 0 ||
    latestContextTrace.length > 0 ||
    latestTodoItems.length > 0 ||
    delegatedTasks.length > 0 ||
    outputSignals.length > 0 ||
    activeFileWrites.length > 0 ||
    recentFileEvents.length > 0 ||
    Object.values(activity).some((count) => count > 0);

  return {
    runtimeStatus,
    pendingApprovals: safePendingApprovals,
    latestContextTrace,
    plan: {
      phase: planPhase,
      items: latestTodoItems,
      sourceToolCallId: latestTodoSourceToolCallId,
      summaryText:
        latestTodoItems.length === 0 ? latestDecisionSummaryText : undefined,
    },
    reasoning: reasoningState,
    activity,
    delegatedTasks: delegatedTasks.slice(-5).reverse(),
    outputSignals: outputSignals.slice(-HARNESS_OUTPUT_SIGNAL_LIMIT).reverse(),
    activeFileWrites,
    recentFileEvents,
    hasSignals,
  };
}

export function deriveHarnessSessionState(
  messages: Message[],
  pendingApprovals: ActionRequired[],
  threadItems?: AgentThreadItem[],
  persistedTodoItems?: readonly PersistedHarnessTodoLike[],
): HarnessSessionState {
  const normalizedPersistedTodoItems =
    normalizePersistedTodoItems(persistedTodoItems);
  if (Array.isArray(threadItems) && threadItems.length > 0) {
    return deriveHarnessSessionStateFromItems(
      messages,
      pendingApprovals,
      threadItems,
      normalizedPersistedTodoItems,
    );
  }

  return deriveHarnessSessionStateFromMessages(
    messages,
    pendingApprovals,
    normalizedPersistedTodoItems,
  );
}
