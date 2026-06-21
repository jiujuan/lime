import { normalizeToolNameKey } from "./toolDisplayInfo";
import {
  extractStructuredToolDetailText,
  parseStructuredToolResult,
} from "./toolResultDetailText";

const SERVICE_SKILL_ENVELOPE_KEYS = [
  "service_skill_id",
  "serviceSkillId",
  "skill_id",
  "skillId",
  "skill_title",
  "skillTitle",
  "slot_values",
  "slotValues",
  "runner_type",
  "runnerType",
] as const;

const ENVELOPE_NESTED_KEYS = [
  "result",
  "output",
  "data",
  "payload",
  "tool_result",
  "toolResult",
  "items",
  "runs",
  "events",
  "runtimeTranscript",
  "skillToolGateProof",
  "allow",
  "deny",
] as const;

const PROTOCOL_ENVELOPE_KEYS = [
  "jsonrpc",
  "request_metadata",
  "requestMetadata",
  "runtime_metadata",
  "runtimeMetadata",
  "diagnostics",
  "metadata",
  "debug",
  "_meta",
  "trace",
  "telemetry",
  "durationMs",
  "duration_ms",
  "elapsedMs",
  "elapsed_ms",
  "request",
  "response",
  "raw",
] as const;

const USER_DETAIL_KEYS = [
  "markdown",
  "markdownContent",
  "markdown_content",
  "contentMarkdown",
  "content_markdown",
  "bodyMarkdown",
  "body_markdown",
  "content",
  "text",
  "body",
  "summary",
  "description",
  "output",
  "message",
] as const;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function readString(
  record: Record<string, unknown> | null,
  keys: string[],
): string | null {
  if (!record) {
    return null;
  }
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function hasServiceSkillEnvelopeKey(record: Record<string, unknown>): boolean {
  return SERVICE_SKILL_ENVELOPE_KEYS.some((key) => key in record);
}

function hasServiceSkillEnvelope(
  value: unknown,
  visited = new Set<unknown>(),
): boolean {
  if (typeof value === "string") {
    const parsed = parseStructuredToolResult(value);
    return parsed ? hasServiceSkillEnvelope(parsed, visited) : false;
  }

  if (Array.isArray(value)) {
    if (visited.has(value)) {
      return false;
    }
    visited.add(value);
    return value.some((item) => hasServiceSkillEnvelope(item, visited));
  }

  const record = asRecord(value);
  if (!record || visited.has(record)) {
    return false;
  }
  visited.add(record);

  if (hasServiceSkillEnvelopeKey(record)) {
    return true;
  }

  return ENVELOPE_NESTED_KEYS.some((key) =>
    hasServiceSkillEnvelope(record[key], visited),
  );
}

function isSkillToolRequest(record: Record<string, unknown> | null): boolean {
  const toolName = readString(record, ["toolName", "tool_name", "tool"]);
  return Boolean(toolName && normalizeToolNameKey(toolName) === "skill");
}

function isSkillToolGateEvent(record: Record<string, unknown>): boolean {
  const phase = readString(record, ["phase"]);
  if (phase?.includes("skill_tool_gate")) {
    return true;
  }

  const request = asRecord(record.request);
  if (!isSkillToolRequest(request)) {
    return false;
  }

  const decision = asRecord(record.decision);
  const result = asRecord(record.result);
  return Boolean(
    readString(decision, ["action"]) &&
      readString(decision, ["gate", "reason"]) &&
      readString(result, ["status"]),
  );
}

function hasSkillToolGateEnvelope(
  value: unknown,
  visited = new Set<unknown>(),
): boolean {
  if (typeof value === "string") {
    const parsed = parseStructuredToolResult(value);
    return parsed ? hasSkillToolGateEnvelope(parsed, visited) : false;
  }

  if (Array.isArray(value)) {
    if (visited.has(value)) {
      return false;
    }
    visited.add(value);
    return value.some((item) => hasSkillToolGateEnvelope(item, visited));
  }

  const record = asRecord(value);
  if (!record || visited.has(record)) {
    return false;
  }
  visited.add(record);

  if (isSkillToolGateEvent(record)) {
    return true;
  }

  return ENVELOPE_NESTED_KEYS.some((key) =>
    hasSkillToolGateEnvelope(record[key], visited),
  );
}

function looksLikeSkillToolGateDetail(value: string): boolean {
  const parsed = parseStructuredToolResult(value);
  if (parsed && hasSkillToolGateEnvelope(parsed)) {
    return true;
  }

  const normalized = value.toLowerCase();
  return (
    (normalized.includes("skilltool") &&
      normalized.includes("request") &&
      normalized.includes("decision") &&
      normalized.includes("result")) ||
    normalized.includes("workspace skill runtime enable") ||
    normalized.includes("workspaceskillruntimeenable") ||
    normalized.includes("permissionbehavior") ||
    normalized.includes("source metadata")
  );
}

function hasUsefulSkillResultDetail(value: unknown): boolean {
  const detail = extractStructuredToolDetailText(value);
  return Boolean(detail && !looksLikeSkillToolGateDetail(detail));
}

function hasUserFacingDetail(value: unknown, visited = new Set<unknown>()): boolean {
  if (typeof value === "string") {
    const parsed = parseStructuredToolResult(value);
    return parsed ? hasUserFacingDetail(parsed, visited) : Boolean(value.trim());
  }

  if (Array.isArray(value)) {
    if (visited.has(value)) {
      return false;
    }
    visited.add(value);
    return value.some((item) => hasUserFacingDetail(item, visited));
  }

  const record = asRecord(value);
  if (!record || visited.has(record)) {
    return false;
  }
  visited.add(record);

  for (const key of USER_DETAIL_KEYS) {
    const candidate = record[key];
    if (typeof candidate === "string" && candidate.trim()) {
      return true;
    }
  }

  return ["result", "data", "payload", "document", "article", "page"].some(
    (key) => hasUserFacingDetail(record[key], visited),
  );
}

function hasProtocolEnvelopeKey(record: Record<string, unknown>): boolean {
  return PROTOCOL_ENVELOPE_KEYS.some((key) => key in record);
}

function isCommandLikeToolName(toolName: string | undefined): boolean {
  if (!toolName) {
    return false;
  }
  const normalized = normalizeToolNameKey(toolName);
  return (
    normalized.includes("bash") ||
    normalized.includes("shell") ||
    normalized.includes("exec") ||
    normalized.includes("command") ||
    normalized === "powershell" ||
    normalized === "repl"
  );
}

function hasProtocolEnvelope(
  value: unknown,
  visited = new Set<unknown>(),
): boolean {
  if (typeof value === "string") {
    const parsed = parseStructuredToolResult(value);
    return parsed ? hasProtocolEnvelope(parsed, visited) : false;
  }

  if (Array.isArray(value)) {
    if (visited.has(value)) {
      return false;
    }
    visited.add(value);
    return value.some((item) => hasProtocolEnvelope(item, visited));
  }

  const record = asRecord(value);
  if (!record || visited.has(record)) {
    return false;
  }
  visited.add(record);

  if (hasProtocolEnvelopeKey(record)) {
    return true;
  }

  return ENVELOPE_NESTED_KEYS.some((key) =>
    hasProtocolEnvelope(record[key], visited),
  );
}

export function shouldHideProtocolToolResultEnvelope(params: {
  toolName?: string;
  rawResultText: string;
}): boolean {
  const parsed = parseStructuredToolResult(params.rawResultText);
  if (isCommandLikeToolName(params.toolName)) {
    return false;
  }
  if (!parsed || !hasProtocolEnvelope(parsed) || hasUserFacingDetail(parsed)) {
    return false;
  }

  return true;
}

export function shouldHideServiceSkillToolResultEnvelope(params: {
  toolName: string;
  rawResultText: string;
}): boolean {
  if (normalizeToolNameKey(params.toolName) !== "limerunserviceskill") {
    return false;
  }

  const parsed = parseStructuredToolResult(params.rawResultText);
  return hasServiceSkillEnvelope(parsed);
}

export function shouldHideSkillToolGateResultEnvelope(params: {
  toolName: string;
  rawResultText: string;
}): boolean {
  if (normalizeToolNameKey(params.toolName) !== "skill") {
    return false;
  }

  const parsed = parseStructuredToolResult(params.rawResultText);
  if (!hasSkillToolGateEnvelope(parsed)) {
    return false;
  }

  return !hasUsefulSkillResultDetail(parsed);
}

export function shouldHideToolResultEnvelope(params: {
  toolName: string;
  rawResultText: string;
}): boolean {
  return (
    shouldHideServiceSkillToolResultEnvelope(params) ||
    shouldHideSkillToolGateResultEnvelope(params) ||
    shouldHideProtocolToolResultEnvelope(params)
  );
}
