import fs from "node:fs";
import path from "node:path";

const APP_SERVER_HANDLE_JSON_LINES_COMMAND = "app_server_handle_json_lines";
const TURN_START_METHOD = "agentSession/turn/start";

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function readString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function parseJson(raw, fallback = null) {
  try {
    return JSON.parse(String(raw ?? ""));
  } catch {
    return fallback;
  }
}

function decodeJsonRpcLines(lines) {
  if (!Array.isArray(lines)) return [];
  return lines
    .map((line) => parseJson(line, null))
    .filter((message) => isRecord(message));
}

function requestFromMessage(message) {
  if (!isRecord(message) || typeof message.method !== "string") return null;
  return {
    method: message.method,
    sessionId: readString(
      message.params?.sessionId,
      message.params?.session_id,
    ),
    turnId: readString(message.params?.turnId, message.params?.turn_id),
  };
}

function requestsFromTraceEntry(entry) {
  if (!isRecord(entry)) return [];
  if (Array.isArray(entry.appServerRequests)) {
    return entry.appServerRequests
      .map((request) => ({
        method: request?.method,
        sessionId: readString(
          request?.params?.sessionId,
          request?.params?.session_id,
          request?.sessionId,
          request?.session_id,
        ),
        turnId: readString(
          request?.params?.turnId,
          request?.params?.turn_id,
          request?.turnId,
          request?.turn_id,
        ),
      }))
      .filter((request) => typeof request.method === "string");
  }
  return decodeJsonRpcLines(entry.args_preview?.request?.lines)
    .map(requestFromMessage)
    .filter(Boolean);
}

function candidateFromMatchingTurn(value) {
  if (!isRecord(value)) return null;
  const method = readString(value.method) || TURN_START_METHOD;
  return {
    command: readString(value.command),
    method,
    sessionId: readString(value.sessionId, value.session_id),
    status: readString(value.status),
    transport: readString(value.transport),
    turnId: readString(value.turnId, value.turn_id),
  };
}

function candidatesFromEntry(entry) {
  if (!isRecord(entry)) return [];
  const command = readString(entry.command);
  const status = readString(entry.status);
  const transport = readString(entry.transport);
  return requestsFromTraceEntry(entry).map((request) => ({
    command,
    method: request.method,
    sessionId: request.sessionId,
    status,
    transport,
    turnId: request.turnId,
  }));
}

function collectCandidates(trace) {
  const candidates = [];
  if (isRecord(trace)) {
    for (const value of [
      trace.matchingTurn,
      trace.matching_turn,
      trace.turnStart,
      trace.turn_start,
    ]) {
      const candidate = candidateFromMatchingTurn(value);
      if (candidate) candidates.push(candidate);
    }
    for (const key of [
      "appServerInvokeEntries",
      "app_server_invoke_entries",
      "traceEntries",
      "trace_entries",
      "entries",
    ]) {
      if (Array.isArray(trace[key])) {
        candidates.push(...trace[key].flatMap(candidatesFromEntry));
      }
    }
  }
  if (Array.isArray(trace)) {
    candidates.push(...trace.flatMap(candidatesFromEntry));
  }
  return candidates;
}

function isElectronTurnStart(candidate) {
  return (
    candidate.command === APP_SERVER_HANDLE_JSON_LINES_COMMAND &&
    candidate.transport === "electron-ipc" &&
    candidate.status === "success" &&
    candidate.method === TURN_START_METHOD &&
    Boolean(candidate.sessionId)
  );
}

export function summarizeProductionTurnStartTrace(
  trace,
  { expectedSessionId = "" } = {},
) {
  const candidates = collectCandidates(trace);
  const turnStartCandidates = candidates.filter(isElectronTurnStart);
  const matched =
    turnStartCandidates.find(
      (candidate) =>
        !expectedSessionId || candidate.sessionId === expectedSessionId,
    ) || null;
  const first = matched || turnStartCandidates[0] || null;
  return {
    command: first?.command || null,
    matched: Boolean(matched),
    method: first?.method || null,
    present: turnStartCandidates.length > 0,
    sessionId: first?.sessionId || null,
    sessionMatched: Boolean(
      matched &&
      (!expectedSessionId || matched.sessionId === expectedSessionId),
    ),
    status: first?.status || null,
    transport: first?.transport || null,
    turnId: first?.turnId || null,
  };
}

export function readProductionTurnStartTrace(
  filePath,
  { expectedSessionId = "" } = {},
) {
  if (!filePath) {
    return {
      fileConfigured: false,
      matched: false,
      present: false,
      sessionMatched: false,
    };
  }
  const resolvedPath = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(resolvedPath)) {
    return {
      file: resolvedPath,
      fileConfigured: true,
      matched: false,
      present: false,
      sessionMatched: false,
    };
  }
  const trace = JSON.parse(fs.readFileSync(resolvedPath, "utf8"));
  return {
    file: resolvedPath,
    fileConfigured: true,
    ...summarizeProductionTurnStartTrace(trace, { expectedSessionId }),
  };
}
