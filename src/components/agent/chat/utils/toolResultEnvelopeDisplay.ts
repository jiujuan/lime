import { normalizeToolNameKey } from "./toolDisplayInfo";
import { isImageTaskToolResultLike } from "./imageTaskToolResult";
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
  "runtime_enable_source",
  "runtimeEnableSource",
  "internal_payload",
  "internalPayload",
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

const WORKSPACE_SKILL_RUNTIME_ENABLE_KEYS = [
  "workspace_skill_runtime_enable",
  "workspaceSkillRuntimeEnable",
] as const;

const WORKSPACE_SKILL_RUNTIME_ENABLE_NESTED_KEYS = [
  ...WORKSPACE_SKILL_RUNTIME_ENABLE_KEYS,
  ...ENVELOPE_NESTED_KEYS,
  "metadata",
  "request_metadata",
  "requestMetadata",
  "harness",
] as const;

export type WorkspaceSkillRuntimeEnableDisplayTranslator = (
  key: string,
  defaultValue: string,
  options?: Record<string, unknown>,
) => string;

function interpolateDefaultText(
  defaultValue: string,
  options?: Record<string, unknown>,
): string {
  if (!options) {
    return defaultValue;
  }
  return defaultValue.replace(/\{\{\s*([^}\s]+)\s*\}\}/g, (_, key) => {
    const value = options[key];
    return value === undefined || value === null ? "" : String(value);
  });
}

function translateRuntimeEnableText(
  translate: WorkspaceSkillRuntimeEnableDisplayTranslator,
  key: string,
  defaultValue: string,
  options?: Record<string, unknown>,
): string {
  const translated = translate(key, defaultValue, options);
  return translated && translated !== key
    ? translated
    : interpolateDefaultText(defaultValue, options);
}

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

function readRuntimeEnableGateReason(
  record: Record<string, unknown>,
): string | null {
  const decision = asRecord(record.decision);
  const result = asRecord(record.result);
  const reason = readString(decision, ["reason", "gate"]);
  if (reason) {
    return reason;
  }
  if (
    result?.workspaceSkillRuntimeEnableAttached === true ||
    result?.workspace_skill_runtime_enable_attached === true
  ) {
    return "workspace_skill_runtime_enable_attached";
  }
  return null;
}

function isWorkspaceSkillRuntimeEnableGateEvent(
  record: Record<string, unknown>,
): boolean {
  if (!isSkillToolGateEvent(record)) {
    return false;
  }
  const reason = readRuntimeEnableGateReason(record)?.toLowerCase();
  return Boolean(reason?.includes("workspace_skill_runtime_enable"));
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

function hasWorkspaceSkillRuntimeEnableGateEnvelope(
  value: unknown,
  visited = new Set<unknown>(),
): boolean {
  if (typeof value === "string") {
    const parsed = parseStructuredToolResult(value);
    return parsed
      ? hasWorkspaceSkillRuntimeEnableGateEnvelope(parsed, visited)
      : false;
  }

  if (Array.isArray(value)) {
    if (visited.has(value)) {
      return false;
    }
    visited.add(value);
    return value.some((item) =>
      hasWorkspaceSkillRuntimeEnableGateEnvelope(item, visited),
    );
  }

  const record = asRecord(value);
  if (!record || visited.has(record)) {
    return false;
  }
  visited.add(record);

  if (isWorkspaceSkillRuntimeEnableGateEvent(record)) {
    return true;
  }

  return ENVELOPE_NESTED_KEYS.some((key) =>
    hasWorkspaceSkillRuntimeEnableGateEnvelope(record[key], visited),
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

function hasStructuredContentDetail(value: unknown): boolean {
  return Boolean(extractStructuredToolDetailText(value));
}

function isWorkspaceSkillRuntimeEnableRecord(
  record: Record<string, unknown>,
): boolean {
  return Boolean(
    readString(record, ["source", "approval"]) ||
    Array.isArray(record.bindings),
  );
}

function findWorkspaceSkillRuntimeEnableRecord(
  value: unknown,
  visited = new Set<unknown>(),
): Record<string, unknown> | null {
  if (typeof value === "string") {
    const parsed = parseStructuredToolResult(value);
    return parsed
      ? findWorkspaceSkillRuntimeEnableRecord(parsed, visited)
      : null;
  }

  if (Array.isArray(value)) {
    if (visited.has(value)) {
      return null;
    }
    visited.add(value);
    for (const item of value) {
      const found = findWorkspaceSkillRuntimeEnableRecord(item, visited);
      if (found) {
        return found;
      }
    }
    return null;
  }

  const record = asRecord(value);
  if (!record || visited.has(record)) {
    return null;
  }
  visited.add(record);

  if (isWorkspaceSkillRuntimeEnableRecord(record)) {
    return record;
  }

  for (const key of WORKSPACE_SKILL_RUNTIME_ENABLE_NESTED_KEYS) {
    const found = findWorkspaceSkillRuntimeEnableRecord(record[key], visited);
    if (found) {
      return found;
    }
  }

  return null;
}

function formatRuntimeEnableSource(
  source: string | null,
  translate: WorkspaceSkillRuntimeEnableDisplayTranslator,
): string | null {
  if (!source) {
    return null;
  }
  if (source === "manual_session_enable") {
    return translateRuntimeEnableText(
      translate,
      "agentChat.harness.generated.9898e681b9",
      "手动会话",
    );
  }
  return null;
}

function formatRuntimeEnableApproval(
  approval: string | null,
  translate: WorkspaceSkillRuntimeEnableDisplayTranslator,
): string | null {
  if (!approval) {
    return null;
  }
  if (approval === "manual") {
    return translateRuntimeEnableText(
      translate,
      "agentChat.harness.generated.0ee2b78a17",
      "人工确认",
    );
  }
  return null;
}

function formatWorkspaceSkillRuntimeEnableRecord(
  record: Record<string, unknown> | null,
  translate: WorkspaceSkillRuntimeEnableDisplayTranslator,
): string {
  const bindings = Array.isArray(record?.bindings) ? record.bindings : [];
  const parts = [
    translateRuntimeEnableText(
      translate,
      "agentChat.harness.generated.407c71140b",
      "运行启用",
    ),
    formatRuntimeEnableSource(readString(record, ["source"]), translate),
    formatRuntimeEnableApproval(readString(record, ["approval"]), translate),
    bindings.length > 0
      ? translateRuntimeEnableText(
          translate,
          "agentChat.harness.generated.712985979a",
          "{{count}} 个绑定",
          { count: bindings.length },
        )
      : null,
  ].filter(Boolean);
  return parts.join(" · ");
}

export function formatWorkspaceSkillRuntimeEnableDisplay(
  value: unknown,
  translate: WorkspaceSkillRuntimeEnableDisplayTranslator,
): string | null {
  const record = findWorkspaceSkillRuntimeEnableRecord(value);
  if (record) {
    return formatWorkspaceSkillRuntimeEnableRecord(record, translate);
  }
  if (hasWorkspaceSkillRuntimeEnableGateEnvelope(value)) {
    return formatWorkspaceSkillRuntimeEnableRecord(null, translate);
  }
  return null;
}

export function resolveWorkspaceSkillRuntimeEnableResultDisplay(params: {
  toolName: string;
  rawResultText: string;
  metadata?: unknown;
  translate: WorkspaceSkillRuntimeEnableDisplayTranslator;
}): string | null {
  const metadataDisplay = formatWorkspaceSkillRuntimeEnableDisplay(
    params.metadata,
    params.translate,
  );
  if (metadataDisplay) {
    return metadataDisplay;
  }

  if (normalizeToolNameKey(params.toolName) !== "skill") {
    return null;
  }

  return formatWorkspaceSkillRuntimeEnableDisplay(
    params.rawResultText,
    params.translate,
  );
}

function hasUserFacingDetail(
  value: unknown,
  visited = new Set<unknown>(),
): boolean {
  if (typeof value === "string") {
    const parsed = parseStructuredToolResult(value);
    return parsed
      ? hasUserFacingDetail(parsed, visited)
      : Boolean(value.trim());
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
  structuredContent?: unknown;
}): boolean {
  const parsed = parseStructuredToolResult(params.rawResultText);
  if (isCommandLikeToolName(params.toolName)) {
    return false;
  }
  if (!parsed || !hasProtocolEnvelope(parsed)) {
    return false;
  }

  if (hasStructuredContentDetail(params.structuredContent)) {
    return true;
  }

  if (hasUserFacingDetail(parsed)) {
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

export function shouldHideImageTaskToolResultEnvelope(params: {
  toolName?: string;
  rawResultText?: string;
  metadata?: unknown;
  result?: unknown;
}): boolean {
  return isImageTaskToolResultLike({
    toolName: params.toolName,
    output: params.rawResultText,
    metadata: params.metadata,
    result: params.result,
    toolResult: params.result,
  });
}

export function shouldHideToolResultEnvelope(params: {
  toolName: string;
  rawResultText: string;
  metadata?: unknown;
  result?: unknown;
}): boolean {
  const resultRecord = asRecord(params.result);
  const structuredContent =
    resultRecord?.structuredContent ?? resultRecord?.structured_content;
  return (
    shouldHideImageTaskToolResultEnvelope(params) ||
    shouldHideServiceSkillToolResultEnvelope(params) ||
    shouldHideSkillToolGateResultEnvelope(params) ||
    shouldHideProtocolToolResultEnvelope({
      ...params,
      structuredContent,
    })
  );
}
