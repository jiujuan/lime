import { SKILLS_RUNTIME_SKILL_NAME } from "./claw-chat-current-fixture-constants.mjs";
import {
  readArray,
  readRecord,
  readString,
  sanitizeJson,
} from "./claw-chat-current-fixture-utils.mjs";

export function readModelLatestTurnStatus(readModel) {
  return (
    readModel?.detail?.thread_read?.runtime_summary?.latestTurnStatus ??
    readModel?.detail?.threadRead?.runtimeSummary?.latestTurnStatus ??
    readModel?.detail?.thread_read?.status ??
    readModel?.detail?.threadRead?.status ??
    readModel?.detail?.status ??
    null
  );
}

export function collectReadModelTurns(readModel) {
  const detail = readRecord(readModel?.detail) ?? readRecord(readModel) ?? {};
  const threadRead =
    readRecord(detail.thread_read) ?? readRecord(detail.threadRead) ?? {};
  return [
    ...readArray(readModel, "turns"),
    ...readArray(detail, "turns"),
    ...readArray(threadRead, "turns"),
  ]
    .map((turn) => readRecord(turn))
    .filter(Boolean);
}

export function collectReadModelItems(readModel) {
  const detail = readRecord(readModel?.detail) ?? readRecord(readModel) ?? {};
  const threadRead =
    readRecord(detail.thread_read) ?? readRecord(detail.threadRead) ?? {};
  return [
    ...readArray(readModel, "items"),
    ...readArray(readModel, "thread_items", "threadItems"),
    ...readArray(detail, "items"),
    ...readArray(detail, "thread_items", "threadItems"),
    ...readArray(threadRead, "items"),
    ...readArray(threadRead, "thread_items", "threadItems"),
  ]
    .map((item) => readRecord(item))
    .filter(Boolean);
}

export function readModelQueuedTurns(readModel) {
  const detail = readRecord(readModel?.detail) ?? readRecord(readModel) ?? {};
  const threadRead =
    readRecord(detail.thread_read) ?? readRecord(detail.threadRead) ?? {};
  return [
    ...readArray(readModel, "queued_turns", "queuedTurns"),
    ...readArray(detail, "queued_turns", "queuedTurns"),
    ...readArray(threadRead, "queued_turns", "queuedTurns"),
  ]
    .map((turn) => readRecord(turn))
    .filter(Boolean);
}

export function readModelQueuedTurnId(value) {
  return readString(value, "queued_turn_id", "queuedTurnId", "turn_id", "turnId");
}

export function readModelQueuedTurnText(value) {
  return readString(
    value,
    "message_text",
    "messageText",
    "message_preview",
    "messagePreview",
    "text",
  );
}

export function findReadModelQueuedTurnForPrompt(readModel, prompt) {
  return (
    readModelQueuedTurns(readModel).find((queuedTurn) =>
      readModelQueuedTurnText(queuedTurn)?.includes(prompt),
    ) ??
    collectReadModelTurns(readModel).find((turn) => {
      const status = String(readModelTurnStatus(turn) ?? "").toLowerCase();
      return status === "queued" && JSON.stringify(turn).includes(prompt);
    }) ??
    null
  );
}

export function summarizeReadModelQueueState(readModel) {
  const detail = readRecord(readModel?.detail) ?? readRecord(readModel) ?? {};
  const threadRead =
    readRecord(detail.thread_read) ?? readRecord(detail.threadRead) ?? {};
  return sanitizeJson({
    sessionId: readString(readModel?.session, "session_id", "sessionId"),
    threadId:
      readString(threadRead, "thread_id", "threadId") ??
      readString(detail, "thread_id", "threadId"),
    detailStatus: readString(detail, "status"),
    threadStatus: readString(threadRead, "status"),
    activeTurnId: readString(threadRead, "active_turn_id", "activeTurnId"),
    latestTurnStatus:
      readString(threadRead?.diagnostics, "latest_turn_status") ??
      readString(threadRead?.runtime_summary, "latestTurnStatus"),
    queuedTurns: readModelQueuedTurns(readModel).map((queuedTurn) => ({
      turnId: readModelQueuedTurnId(queuedTurn),
      status: readModelTurnStatus(queuedTurn),
      text: readModelQueuedTurnText(queuedTurn),
    })),
    turns: collectReadModelTurns(readModel).map((turn) => ({
      turnId: readModelTurnId(turn),
      status: readModelTurnStatus(turn),
    })),
    items: collectReadModelItems(readModel).map((item) => ({
      itemId: readString(item, "item_id", "itemId", "id"),
      turnId: readModelScopedTurnId(item),
      type: readString(item, "type", "item_type", "itemType"),
    })),
  });
}

export function readModelTurnId(value) {
  return readString(value, "turn_id", "turnId", "runtimeTurnId", "id");
}

export function readModelScopedTurnId(value) {
  return readString(value, "turn_id", "turnId", "runtimeTurnId");
}

export function readModelTurnStatus(value) {
  return readString(value, "status", "native_status", "nativeStatus");
}

export function isReadModelTerminalTurnStatus(status) {
  return ["completed", "failed", "canceled", "cancelled"].includes(
    String(status ?? "").trim().toLowerCase(),
  );
}

export function collectScenarioReadModelTurnIds(readModel, scenario) {
  const turnIds = new Set();
  for (const item of collectReadModelItems(readModel)) {
    const serialized = JSON.stringify(item || {});
    if (
      serialized.includes(scenario.prompt) ||
      serialized.includes(scenario.doneText) ||
      serialized.includes(scenario.summaryText)
    ) {
      const turnId = readModelScopedTurnId(item);
      if (turnId) {
        turnIds.add(turnId);
      }
    }
  }

  for (const toolCall of collectReadModelToolCalls(readModel)) {
    const toolCallId = String(
      toolCall.id ??
        toolCall.tool_call_id ??
        toolCall.toolCallId ??
        toolCall.toolId ??
        "",
    );
    const toolName = String(
      toolCall.tool_name ?? toolCall.toolName ?? toolCall.name ?? "",
    );
    if (
      (toolCallId === scenario.searchToolCallId &&
        toolName === "skill_search") ||
      (toolCallId === scenario.skillToolCallId && toolName === "Skill")
    ) {
      const turnId = readModelScopedTurnId(toolCall);
      if (turnId) {
        turnIds.add(turnId);
      }
    }
  }

  return [...turnIds];
}

export function summarizeSkillsRuntimeReadModel(readModel, scenario) {
  const serialized = JSON.stringify(readModel || {});
  const skillSearchToolCall = findReadModelToolCall(
    readModel,
    scenario.searchToolCallId,
    "skill_search",
  );
  const skillToolCall = findReadModelToolCall(
    readModel,
    scenario.skillToolCallId,
    "Skill",
  );
  const scenarioTurnIds = collectScenarioReadModelTurnIds(readModel, scenario);
  const turns = collectReadModelTurns(readModel);
  const matchedScenarioTurns = scenarioTurnIds
    .map((turnId) => turns.find((turn) => readModelTurnId(turn) === turnId))
    .filter(Boolean);
  const matchedTerminalTurn = matchedScenarioTurns.find((turn) =>
    isReadModelTerminalTurnStatus(readModelTurnStatus(turn)),
  );
  const latestTurnStatus = readModelLatestTurnStatus(readModel);
  const readModelTurnTerminal =
    Boolean(matchedTerminalTurn) ||
    (scenarioTurnIds.length === 0 &&
      isReadModelTerminalTurnStatus(latestTurnStatus));

  return sanitizeJson({
    detailItemCount: Array.isArray(readModel?.detail?.items)
      ? readModel.detail.items.length
      : null,
    toolCallCount: collectReadModelToolCalls(readModel).length,
    latestTurnStatus,
    scenarioTurnIds,
    matchedScenarioTurnStatuses: matchedScenarioTurns.map((turn) => ({
      turnId: readModelTurnId(turn),
      status: readModelTurnStatus(turn),
    })),
    matchedTerminalTurnStatus: matchedTerminalTurn
      ? readModelTurnStatus(matchedTerminalTurn)
      : null,
    readModelTurnTerminal,
    includesPrompt: serialized.includes(scenario.prompt),
    includesAssistantDone: serialized.includes(scenario.doneText),
    includesAssistantSummary: serialized.includes(scenario.summaryText),
    includesSkillSearchTool: Boolean(skillSearchToolCall),
    includesSkillTool: Boolean(skillToolCall),
    includesSkillName: serialized.includes(SKILLS_RUNTIME_SKILL_NAME),
    skillSearchToolStatus: skillSearchToolCall?.status ?? null,
    skillToolStatus: skillToolCall?.status ?? null,
  });
}

export function collectReadModelToolCalls(readResult) {
  const detail = readRecord(readResult?.detail) ?? readRecord(readResult) ?? {};
  const threadRead =
    readRecord(detail.thread_read) ?? readRecord(detail.threadRead) ?? {};
  return [
    ...(Array.isArray(detail.tool_calls) ? detail.tool_calls : []),
    ...(Array.isArray(detail.toolCalls) ? detail.toolCalls : []),
    ...(Array.isArray(threadRead.tool_calls) ? threadRead.tool_calls : []),
    ...(Array.isArray(threadRead.toolCalls) ? threadRead.toolCalls : []),
  ].filter((toolCall) => toolCall && typeof toolCall === "object");
}

export function findReadModelToolCall(readResult, toolCallId, toolName) {
  return collectReadModelToolCalls(readResult).find((toolCall) => {
    const id = String(
      toolCall.id ??
        toolCall.tool_call_id ??
        toolCall.toolCallId ??
        toolCall.toolId ??
        "",
    );
    const name = String(
      toolCall.tool_name ?? toolCall.toolName ?? toolCall.name ?? "",
    );
    return id === toolCallId && name === toolName;
  });
}
