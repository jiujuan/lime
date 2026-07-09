import type {
  AgentUiControl,
  AgentUiProjectionContext,
  AgentUiProjectionEvent,
  AgentUiRuntimeStatus,
} from "@limecloud/agent-ui-contracts";

import {
  compactProjectionFields,
  definedString,
  metadataKeys,
  readBooleanField,
  readRecord,
  readStringArrayField,
  readStringField,
  truncateText,
} from "./normalization.js";

export type AgentUiMcpElicitationMode = "form" | "openai/form" | "url";
export type AgentUiMcpElicitationAction = "accept" | "decline" | "cancel";

export type AgentUiMcpElicitationIssueCode =
  | "missing_request_id"
  | "missing_thread_scope"
  | "missing_turn_scope"
  | "missing_server_name"
  | "missing_request_mode"
  | "missing_requested_schema"
  | "missing_client_capability"
  | "invalid_response_action"
  | "missing_accept_content";

export interface AgentUiMcpElicitationIssue {
  code: AgentUiMcpElicitationIssueCode;
  path: string;
  message: string;
}

export interface AgentUiMcpElicitationProjectionInput {
  requestId?: string | null;
  params?: unknown;
  response?: unknown;
  clientCapabilities?: unknown;
  toolCallId?: string | null;
  timestamp?: string | null;
}

export interface AgentUiMcpElicitationRequestSnapshot {
  requestId: string;
  serverName: string;
  threadId: string;
  turnId?: string;
  toolCallId?: string;
  mode: AgentUiMcpElicitationMode;
  messagePreview?: string;
  schemaPropertyNames: string[];
  requiredFields: string[];
  requestedSchemaKeys: string[];
  capabilityRequired: boolean;
  capabilitySatisfied: boolean;
  correlatedToTurn: boolean;
}

export interface AgentUiMcpElicitationResponseSnapshot {
  action: AgentUiMcpElicitationAction;
  accepted: boolean;
  contentKeys: string[];
  metaKeys: string[];
}

export interface AgentUiMcpElicitationSnapshot {
  request: AgentUiMcpElicitationRequestSnapshot;
  response?: AgentUiMcpElicitationResponseSnapshot;
  validationIssues: AgentUiMcpElicitationIssue[];
}

function issue(
  code: AgentUiMcpElicitationIssueCode,
  path: string,
  message: string,
): AgentUiMcpElicitationIssue {
  return { code, path, message };
}

function paramsRecord(input: AgentUiMcpElicitationProjectionInput): Record<string, unknown> {
  return readRecord(input.params) ?? {};
}

function requestRecord(params: Record<string, unknown>): Record<string, unknown> {
  return (
    readRecord(params.request) ??
    readRecord(params.Form) ??
    readRecord(params.OpenAiForm) ??
    readRecord(params.OpenAIForm) ??
    params
  );
}

function normalizeMode(
  params: Record<string, unknown>,
  request: Record<string, unknown>,
): AgentUiMcpElicitationMode | undefined {
  const raw = readStringField(request, ["mode", "requestMode", "request_mode"]);
  if (raw === "form" || raw === "openai/form" || raw === "url") return raw;
  if (readRecord(params.Form)) return "form";
  if (readRecord(params.OpenAiForm) || readRecord(params.OpenAIForm)) {
    return "openai/form";
  }
  return undefined;
}

function readRequestedSchema(
  request: Record<string, unknown>,
): Record<string, unknown> | undefined {
  return readRecord(request.requestedSchema) ?? readRecord(request.requested_schema);
}

function readSchemaProperties(schema: Record<string, unknown> | undefined): string[] {
  return Object.keys(readRecord(schema?.properties) ?? {}).sort();
}

function readRequiredFields(schema: Record<string, unknown> | undefined): string[] {
  return readStringArrayField(schema, ["required"]).sort();
}

function readCapabilities(input: AgentUiMcpElicitationProjectionInput): Record<string, unknown> {
  const params = paramsRecord(input);
  return (
    readRecord(input.clientCapabilities) ??
    readRecord(params.clientCapabilities) ??
    readRecord(params.client_capabilities) ??
    {}
  );
}

function supportsOpenAiForm(input: AgentUiMcpElicitationProjectionInput): boolean {
  const capabilities = readCapabilities(input);
  return (
    readBooleanField(capabilities, [
      "mcp_server_openai_form_elicitation",
      "mcpServerOpenaiFormElicitation",
    ]) === true
  );
}

function responseRecord(input: AgentUiMcpElicitationProjectionInput): Record<string, unknown> {
  return readRecord(input.response) ?? {};
}

function readResponseAction(
  input: AgentUiMcpElicitationProjectionInput,
): AgentUiMcpElicitationAction | undefined {
  const action = readStringField(responseRecord(input), ["action"]);
  if (action === "accept" || action === "decline" || action === "cancel") {
    return action;
  }
  return undefined;
}

function requestIdForInput(input: AgentUiMcpElicitationProjectionInput): string | undefined {
  return (
    definedString(input.requestId ?? undefined) ??
    readStringField(paramsRecord(input), ["requestId", "request_id", "id"])
  );
}

function buildRequestSnapshot(
  input: AgentUiMcpElicitationProjectionInput,
): AgentUiMcpElicitationRequestSnapshot | undefined {
  const params = paramsRecord(input);
  const request = requestRecord(params);
  const requestId = requestIdForInput(input);
  const serverName = readStringField(params, ["serverName", "server_name"]);
  const threadId = readStringField(params, ["threadId", "thread_id"]);
  const turnId = readStringField(params, ["turnId", "turn_id"]);
  const mode = normalizeMode(params, request);
  if (!requestId || !serverName || !threadId || !mode) return undefined;
  const requestedSchema = readRequestedSchema(request);
  const capabilityRequired = mode === "openai/form";
  const capabilitySatisfied = !capabilityRequired || supportsOpenAiForm(input);

  return compactProjectionFields({
    requestId,
    serverName,
    threadId,
    turnId,
    toolCallId: definedString(input.toolCallId ?? undefined),
    mode,
    messagePreview: truncateText(readStringField(request, ["message"])),
    schemaPropertyNames: readSchemaProperties(requestedSchema),
    requiredFields: readRequiredFields(requestedSchema),
    requestedSchemaKeys: Object.keys(requestedSchema ?? {}).sort(),
    capabilityRequired,
    capabilitySatisfied,
    correlatedToTurn: Boolean(turnId),
  } satisfies AgentUiMcpElicitationRequestSnapshot);
}

function validateRequestSnapshot(
  snapshot: AgentUiMcpElicitationRequestSnapshot | undefined,
): AgentUiMcpElicitationIssue[] {
  if (!snapshot) {
    return [
      issue(
        "missing_request_id",
        "$.requestId",
        "MCP elicitation request id is required.",
      ),
    ];
  }
  const issues: AgentUiMcpElicitationIssue[] = [];
  if (!snapshot.threadId) {
    issues.push(
      issue("missing_thread_scope", "$.params.threadId", "MCP elicitation requires thread scope."),
    );
  }
  if (!snapshot.turnId) {
    issues.push(
      issue("missing_turn_scope", "$.params.turnId", "MCP elicitation resume requires turn scope."),
    );
  }
  if (!snapshot.serverName) {
    issues.push(
      issue("missing_server_name", "$.params.serverName", "MCP server name is required."),
    );
  }
  if (!snapshot.mode) {
    issues.push(
      issue("missing_request_mode", "$.params.mode", "MCP elicitation mode is required."),
    );
  }
  if (snapshot.mode !== "url" && snapshot.requestedSchemaKeys.length === 0) {
    issues.push(
      issue(
        "missing_requested_schema",
        "$.params.requestedSchema",
        "MCP form elicitation requires a requested schema.",
      ),
    );
  }
  if (snapshot.capabilityRequired && !snapshot.capabilitySatisfied) {
    issues.push(
      issue(
        "missing_client_capability",
        "$.clientCapabilities.mcp_server_openai_form_elicitation",
        "OpenAI form elicitation requires the initiating client capability.",
      ),
    );
  }
  return issues;
}

function buildResponseSnapshot(
  input: AgentUiMcpElicitationProjectionInput,
): AgentUiMcpElicitationResponseSnapshot | undefined {
  const action = readResponseAction(input);
  if (!action) return undefined;
  const response = responseRecord(input);
  const content = readRecord(response.content);
  const meta = readRecord(response._meta) ?? readRecord(response.meta);
  return {
    action,
    accepted: action === "accept",
    contentKeys: Object.keys(content ?? {}).sort(),
    metaKeys: metadataKeys(meta),
  };
}

function validateResponseSnapshot(
  response: AgentUiMcpElicitationResponseSnapshot | undefined,
): AgentUiMcpElicitationIssue[] {
  if (!response) {
    return [
      issue(
        "invalid_response_action",
        "$.response.action",
        "MCP elicitation response action must be accept, decline or cancel.",
      ),
    ];
  }
  if (response.action === "accept" && response.contentKeys.length === 0) {
    return [
      issue(
        "missing_accept_content",
        "$.response.content",
        "Accepted MCP elicitation responses require structured content.",
      ),
    ];
  }
  return [];
}

function runtimeStatus(
  issues: readonly AgentUiMcpElicitationIssue[],
  resolved: boolean,
): AgentUiRuntimeStatus {
  if (issues.length > 0) return "failed";
  return resolved ? "completed" : "needs_input";
}

function actionControl(
  issues: readonly AgentUiMcpElicitationIssue[],
): AgentUiControl {
  return issues.length > 0 ? "none" : "answer";
}

export function extractCodexMcpElicitationSnapshot(
  input: AgentUiMcpElicitationProjectionInput,
): AgentUiMcpElicitationSnapshot | undefined {
  const request = buildRequestSnapshot(input);
  if (!request) return undefined;
  const response = buildResponseSnapshot(input);
  const validationIssues = [
    ...validateRequestSnapshot(request),
    ...(input.response === undefined ? [] : validateResponseSnapshot(response)),
  ];
  return compactProjectionFields({
    request,
    response,
    validationIssues,
  } satisfies AgentUiMcpElicitationSnapshot);
}

export function buildCodexMcpElicitationRequiredEvent(
  input: AgentUiMcpElicitationProjectionInput,
  context: AgentUiProjectionContext = {},
): AgentUiProjectionEvent | undefined {
  const snapshot = extractCodexMcpElicitationSnapshot(input);
  if (!snapshot) return undefined;
  const status = runtimeStatus(snapshot.validationIssues, false);
  return compactProjectionFields({
    type: "action.required",
    sourceType: "mcp_elicitation_required_projection",
    sequence: context.sequence,
    timestamp: definedString(input.timestamp ?? undefined) ?? context.timestamp,
    sessionId: definedString(context.sessionId ?? undefined),
    threadId: snapshot.request.threadId,
    runId: definedString(context.runId ?? undefined),
    turnId: snapshot.request.turnId,
    toolCallId: snapshot.request.toolCallId,
    actionId: snapshot.request.requestId,
    owner: "action",
    scope: "action_request",
    phase: snapshot.validationIssues.length > 0 ? "failed" : "waiting",
    surface: "hitl",
    persistence: "snapshot",
    control: actionControl(snapshot.validationIssues),
    runtimeEntity: "agent_turn",
    runtimeStatus: status,
    latestTurnStatus: status,
    payload: {
      actionType: "elicitation",
      mcpElicitationEvent: "request",
      requestId: snapshot.request.requestId,
      serverName: snapshot.request.serverName,
      mode: snapshot.request.mode,
      promptPreview: snapshot.request.messagePreview,
      schemaPropertyNames: snapshot.request.schemaPropertyNames,
      requiredFields: snapshot.request.requiredFields,
      capabilityRequired: snapshot.request.capabilityRequired,
      capabilitySatisfied: snapshot.request.capabilitySatisfied,
      correlatedToTurn: snapshot.request.correlatedToTurn,
      mcpElicitation: snapshot,
      validationIssues: snapshot.validationIssues,
    },
  } satisfies AgentUiProjectionEvent);
}

export function buildCodexMcpElicitationResolvedEvent(
  input: AgentUiMcpElicitationProjectionInput,
  context: AgentUiProjectionContext = {},
): AgentUiProjectionEvent | undefined {
  const snapshot = extractCodexMcpElicitationSnapshot(input);
  if (!snapshot?.response) return undefined;
  const status = runtimeStatus(snapshot.validationIssues, true);
  return compactProjectionFields({
    type: "action.resolved",
    sourceType: "mcp_elicitation_resolved_projection",
    sequence: context.sequence,
    timestamp: definedString(input.timestamp ?? undefined) ?? context.timestamp,
    sessionId: definedString(context.sessionId ?? undefined),
    threadId: snapshot.request.threadId,
    runId: definedString(context.runId ?? undefined),
    turnId: snapshot.request.turnId,
    toolCallId: snapshot.request.toolCallId,
    actionId: snapshot.request.requestId,
    owner: "action",
    scope: "action_request",
    phase: snapshot.validationIssues.length > 0 ? "failed" : "completed",
    surface: "hitl",
    persistence: "snapshot",
    control: actionControl(snapshot.validationIssues),
    runtimeEntity: "agent_turn",
    runtimeStatus: status,
    latestTurnStatus: status,
    payload: {
      actionType: "elicitation",
      mcpElicitationEvent: "response",
      requestId: snapshot.request.requestId,
      responseAction: snapshot.response.action,
      accepted: snapshot.response.accepted,
      contentKeys: snapshot.response.contentKeys,
      metaKeys: snapshot.response.metaKeys,
      resumeExpected: snapshot.response.accepted && snapshot.validationIssues.length === 0,
      mcpElicitation: snapshot,
      validationIssues: snapshot.validationIssues,
    },
  } satisfies AgentUiProjectionEvent);
}
