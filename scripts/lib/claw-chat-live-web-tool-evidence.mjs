export const REQUIRED_LIVE_WEB_TOOL_NAMES = ["WebSearch", "WebFetch"];

function objectRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : null;
}

function firstNonEmptyStringField(value, fieldNames) {
  const record = objectRecord(value);
  if (!record) {
    return "";
  }
  for (const fieldName of fieldNames) {
    const candidate = record[fieldName];
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

function appServerEventFromRecord(record) {
  const params = objectRecord(record?.params) || objectRecord(record) || {};
  return (
    objectRecord(params.event) ||
    objectRecord(params.payload) ||
    objectRecord(record?.event) ||
    objectRecord(record?.payload) ||
    {}
  );
}

function eventSessionId(record) {
  const params = objectRecord(record?.params) || {};
  const event = appServerEventFromRecord(record);
  return (
    firstNonEmptyStringField(event, ["sessionId", "session_id"]) ||
    firstNonEmptyStringField(params, ["sessionId", "session_id"])
  );
}

function eventTurnId(record) {
  const params = objectRecord(record?.params) || {};
  const event = appServerEventFromRecord(record);
  return (
    firstNonEmptyStringField(event, ["turnId", "turn_id", "turnID"]) ||
    firstNonEmptyStringField(params, ["turnId", "turn_id", "turnID"])
  );
}

function eventType(record) {
  return firstNonEmptyStringField(appServerEventFromRecord(record), [
    "type",
    "event_type",
    "eventType",
  ]);
}

function eventSequence(record) {
  const event = appServerEventFromRecord(record);
  return Number.isFinite(event.sequence) ? event.sequence : null;
}

function eventPayload(record) {
  return objectRecord(appServerEventFromRecord(record).payload) || {};
}

function strictlyMatchesTurn(record, { sessionId, turnId }) {
  const expectedSessionId = String(sessionId || "").trim();
  const expectedTurnId = String(turnId || "").trim();
  return (
    (!expectedSessionId || eventSessionId(record) === expectedSessionId) &&
    (!expectedTurnId || eventTurnId(record) === expectedTurnId)
  );
}

function firstNestedFieldString(value, fieldNames, depth = 0) {
  if (depth > 6) {
    return "";
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const nested = firstNestedFieldString(item, fieldNames, depth + 1);
      if (nested) {
        return nested;
      }
    }
    return "";
  }
  const record = objectRecord(value);
  if (!record) {
    return "";
  }
  const direct = firstNonEmptyStringField(record, fieldNames);
  if (direct) {
    return direct;
  }
  for (const key of [
    "runtimeEvent",
    "runtime_event",
    "toolCall",
    "tool_call",
    "call",
    "result",
    "output",
    "content",
    "structuredContent",
    "metadata",
    "_meta",
  ]) {
    const nested = firstNestedFieldString(record[key], fieldNames, depth + 1);
    if (nested) {
      return nested;
    }
  }
  return "";
}

function firstNestedValueString(value, fieldNames, depth = 0) {
  if (depth > 6) {
    return "";
  }
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const nested = firstNestedValueString(item, fieldNames, depth + 1);
      if (nested) {
        return nested;
      }
    }
    return "";
  }
  const record = objectRecord(value);
  if (!record) {
    return "";
  }
  const direct = firstNonEmptyStringField(record, fieldNames);
  if (direct) {
    return direct;
  }
  for (const key of [
    "runtimeEvent",
    "runtime_event",
    "toolCall",
    "tool_call",
    "call",
    "result",
    "output",
    "content",
    "structuredContent",
    "metadata",
    "_meta",
  ]) {
    const nested = firstNestedValueString(record[key], fieldNames, depth + 1);
    if (nested) {
      return nested;
    }
  }
  return "";
}

function toolNameFromEventPayload(payload) {
  return firstNestedFieldString(payload, [
    "tool_name",
    "toolName",
    "name",
    "tool",
    "call_name",
    "callName",
  ]);
}

function toolCallIdFromEventPayload(payload) {
  return firstNestedFieldString(payload, [
    "id",
    "tool_call_id",
    "toolCallId",
    "tool_id",
    "toolId",
    "call_id",
    "callId",
  ]);
}

function toolOutputFromEventPayload(payload) {
  return firstNestedValueString(payload, [
    "output",
    "output_preview",
    "outputPreview",
    "text",
    "content",
    "result",
  ]);
}

export function liveWebToolStreamEvidenceFromEvents(
  eventRecords,
  options = {},
) {
  const turnRef = {
    sessionId: String(options.sessionId || "").trim(),
    turnId: String(options.turnId || "").trim(),
  };
  const scopedRecords = Array.isArray(eventRecords)
    ? eventRecords.filter((record) => strictlyMatchesTurn(record, turnRef))
    : [];
  const terminalEventTypes = new Set(["turn.completed"]);
  const toolEvents = scopedRecords
    .map((record, eventIndex) => {
      const type = eventType(record);
      if (!["tool.started", "tool.result", "tool.failed"].includes(type)) {
        return null;
      }
      const event = appServerEventFromRecord(record);
      const payload = eventPayload(record);
      const toolName = toolNameFromEventPayload(payload);
      const toolCallId =
        toolCallIdFromEventPayload(payload) ||
        firstNonEmptyStringField(event, ["eventId", "event_id"]);
      const outputPreview = toolOutputFromEventPayload(payload);
      return {
        source:
          record?.direction === "drain"
            ? "app-server-drain-events"
            : "app-server-json-lines-response",
        invokeIndex: record?.invokeIndex ?? null,
        messageIndex: record?.messageIndex ?? null,
        eventIndex,
        sequence: eventSequence(record),
        type,
        toolName,
        normalizedToolName: normalizeToolName(toolName),
        toolCallId: toolCallId || null,
        outputPreview: outputPreview ? outputPreview.slice(0, 400) : "",
        turnId: eventTurnId(record) || turnRef.turnId || null,
      };
    })
    .filter(Boolean);

  const toolCallsByKey = new Map();
  for (const event of toolEvents) {
    const key =
      event.toolCallId ||
      `${event.turnId || ""}:${event.normalizedToolName || ""}`;
    const previous = toolCallsByKey.get(key) || {
      toolCallId: event.toolCallId,
      toolName: event.toolName,
      normalizedToolName: event.normalizedToolName,
      turnId: event.turnId,
      started: false,
      result: false,
      failed: false,
      outputPresent: false,
      startedEventIndex: null,
      resultEventIndex: null,
      eventTypes: [],
    };
    previous.toolName = previous.toolName || event.toolName;
    previous.normalizedToolName =
      previous.normalizedToolName || event.normalizedToolName;
    previous.started = previous.started || event.type === "tool.started";
    previous.result = previous.result || event.type === "tool.result";
    previous.failed = previous.failed || event.type === "tool.failed";
    previous.outputPresent =
      previous.outputPresent ||
      (event.type === "tool.result" &&
        Boolean(String(event.outputPreview || "").trim()));
    if (event.type === "tool.started" && previous.startedEventIndex === null) {
      previous.startedEventIndex = event.eventIndex;
    }
    if (event.type === "tool.result" && previous.resultEventIndex === null) {
      previous.resultEventIndex = event.eventIndex;
    }
    previous.eventTypes.push(event.type);
    toolCallsByKey.set(key, previous);
  }

  const toolCalls = [...toolCallsByKey.values()].map((call) => ({
    ...call,
    resultAfterStart:
      call.startedEventIndex !== null &&
      call.resultEventIndex !== null &&
      call.resultEventIndex > call.startedEventIndex,
  }));
  const required = REQUIRED_LIVE_WEB_TOOL_NAMES.map((name) => {
    const normalizedRequiredName = normalizeToolName(name);
    const calls = toolCalls.filter(
      (call) => call.normalizedToolName === normalizedRequiredName,
    );
    return {
      name,
      seen: calls.length > 0,
      started: calls.some((call) => call.started),
      result: calls.some((call) => call.result),
      outputPresent: calls.some((call) => call.outputPresent),
      resultAfterStart: calls.some((call) => call.resultAfterStart),
      calls,
    };
  });

  return {
    requiredToolNames: [...REQUIRED_LIVE_WEB_TOOL_NAMES],
    sessionId: turnRef.sessionId || null,
    turnId: turnRef.turnId || null,
    eventCount: scopedRecords.length,
    toolEventCount: toolEvents.length,
    eventTypes: scopedRecords.map(eventType).filter(Boolean),
    terminalEventSeen: scopedRecords.some((record) =>
      terminalEventTypes.has(eventType(record)),
    ),
    toolEvents,
    toolCalls,
    required,
    allRequiredStartedForTurn: required.every((item) => item.started),
    allRequiredResultForTurn: required.every((item) => item.result),
    allRequiredOutputPresentForTurn: required.every(
      (item) => item.outputPresent,
    ),
    allRequiredResultAfterStartForTurn: required.every(
      (item) => item.resultAfterStart,
    ),
    allRequiredToolEventsForTurn: required.every(
      (item) =>
        item.started &&
        item.result &&
        item.outputPresent &&
        item.resultAfterStart,
    ),
  };
}
