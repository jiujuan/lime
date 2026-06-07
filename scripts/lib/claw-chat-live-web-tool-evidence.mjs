export const REQUIRED_LIVE_WEB_TOOL_NAMES = ["WebSearch", "WebFetch"];

function firstNonEmptyStringField(value, fieldNames) {
  for (const fieldName of fieldNames) {
    const candidate = value?.[fieldName];
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }
  return "";
}

function valueTurnId(value) {
  return firstNonEmptyStringField(value, ["turn_id", "turnId", "turnID"]);
}

export function toolCallTurnId(toolCall) {
  return firstNonEmptyStringField(toolCall, [
    "turn_id",
    "turnId",
    "turnID",
    "__inheritedTurnId",
  ]);
}

export function toolCallMatchesTurn(toolCall, turnId) {
  const expectedTurnId = String(turnId || "").trim();
  return Boolean(expectedTurnId && toolCallTurnId(toolCall) === expectedTurnId);
}

function withInheritedTurnId(toolCall, turnId) {
  if (
    !toolCall ||
    typeof toolCall !== "object" ||
    !turnId ||
    toolCallTurnId(toolCall)
  ) {
    return toolCall;
  }
  return {
    ...toolCall,
    __inheritedTurnId: turnId,
  };
}

export function collectToolCallsFromValue(value, inheritedTurnId = "") {
  if (!value || typeof value !== "object") {
    return [];
  }
  const ownTurnId = valueTurnId(value) || inheritedTurnId;
  const direct = [
    ...(Array.isArray(value.tool_calls) ? value.tool_calls : []),
    ...(Array.isArray(value.toolCalls) ? value.toolCalls : []),
  ].map((toolCall) => withInheritedTurnId(toolCall, ownTurnId));
  const nested = [
    ...collectToolCallsFromValue(value.result, ownTurnId),
    ...collectToolCallsFromValue(value.detail, ownTurnId),
    ...collectToolCallsFromValue(value.session, ownTurnId),
    ...collectToolCallsFromValue(value.session_detail, ownTurnId),
    ...collectToolCallsFromValue(value.sessionDetail, ownTurnId),
    ...collectToolCallsFromValue(value.thread_read, ownTurnId),
    ...collectToolCallsFromValue(value.threadRead, ownTurnId),
    ...collectToolCallsFromValue(value.runtime_summary, ownTurnId),
    ...collectToolCallsFromValue(value.runtimeSummary, ownTurnId),
  ];
  const messages = [
    ...(Array.isArray(value.messages) ? value.messages : []),
    ...(Array.isArray(value.items) ? value.items : []),
    ...(Array.isArray(value.turns) ? value.turns : []),
  ].flatMap((item) => collectToolCallsFromValue(item, ownTurnId));

  return [...direct, ...nested, ...messages].filter(
    (toolCall) => toolCall && typeof toolCall === "object",
  );
}

function toolCallName(toolCall) {
  return String(
    toolCall?.tool_name ||
      toolCall?.toolName ||
      toolCall?.name ||
      toolCall?.call_name ||
      toolCall?.callName ||
      "",
  ).trim();
}

function normalizeToolName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function toolCallStatus(toolCall) {
  return String(
    toolCall?.status ||
      toolCall?.state ||
      toolCall?.result_status ||
      toolCall?.resultStatus ||
      "",
  )
    .trim()
    .toLowerCase();
}

function toolCallOutputPreview(toolCall) {
  return String(
    toolCall?.output_preview ||
      toolCall?.outputPreview ||
      toolCall?.output ||
      toolCall?.result ||
      toolCall?.content ||
      "",
  );
}

function isCompletedToolCall(toolCall) {
  const status = toolCallStatus(toolCall);
  if (!status) {
    return Boolean(toolCallOutputPreview(toolCall));
  }
  return ["completed", "success", "succeeded", "done", "ok"].includes(status);
}

export function summarizeToolCall(toolCall) {
  const name = toolCallName(toolCall);
  const outputPreview = toolCallOutputPreview(toolCall);
  return {
    id:
      toolCall?.id ||
      toolCall?.tool_call_id ||
      toolCall?.toolCallId ||
      toolCall?.tool_id ||
      toolCall?.toolId ||
      null,
    name,
    turnId: toolCallTurnId(toolCall) || null,
    status: toolCallStatus(toolCall) || null,
    completed: isCompletedToolCall(toolCall),
    outputPreview: outputPreview ? outputPreview.slice(0, 400) : "",
  };
}

function requiredLiveWebToolEvidence(toolCalls) {
  return REQUIRED_LIVE_WEB_TOOL_NAMES.map((requiredName) => {
    const normalizedRequiredName = normalizeToolName(requiredName);
    const calls = toolCalls.filter(
      (toolCall) => normalizeToolName(toolCall.name) === normalizedRequiredName,
    );
    return {
      name: requiredName,
      seen: calls.length > 0,
      completed: calls.some((toolCall) => toolCall.completed),
      outputPresent: calls.some(
        (toolCall) =>
          toolCall.completed && String(toolCall.outputPreview || "").trim(),
      ),
      calls,
    };
  });
}

export function liveWebToolEvidenceFromSession(session, options = {}) {
  const expectedTurnId = String(options.turnId || "").trim();
  const toolCalls = collectToolCallsFromValue(session).map(summarizeToolCall);
  const turnScopedToolCalls = expectedTurnId
    ? toolCalls.filter((toolCall) =>
        toolCallMatchesTurn(toolCall, expectedTurnId),
      )
    : toolCalls;
  const required = requiredLiveWebToolEvidence(toolCalls);
  const requiredForTurn = expectedTurnId
    ? requiredLiveWebToolEvidence(turnScopedToolCalls)
    : required;

  return {
    requiredToolNames: [...REQUIRED_LIVE_WEB_TOOL_NAMES],
    turnId: expectedTurnId || null,
    turnScoped: Boolean(expectedTurnId),
    toolCallCount: toolCalls.length,
    turnScopedToolCallCount: turnScopedToolCalls.length,
    toolCalls,
    turnScopedToolCalls,
    required,
    requiredForTurn,
    allRequiredSeen: required.every((item) => item.seen),
    allRequiredCompleted: required.every((item) => item.completed),
    allRequiredOutputPresent: required.every((item) => item.outputPresent),
    allRequiredSeenForTurn: requiredForTurn.every((item) => item.seen),
    allRequiredCompletedForTurn: requiredForTurn.every(
      (item) => item.completed,
    ),
    allRequiredOutputPresentForTurn: requiredForTurn.every(
      (item) => item.outputPresent,
    ),
  };
}
