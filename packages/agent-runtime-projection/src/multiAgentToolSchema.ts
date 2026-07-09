import type {
  AgentUiControl,
  AgentUiProjectionContext,
  AgentUiProjectionEvent,
  AgentUiRuntimeStatus,
} from "@limecloud/agent-ui-contracts";

import {
  compactProjectionFields,
  definedString,
  readNumberField,
  readRecord,
  readStringField,
} from "./normalization.js";

export type AgentUiMultiAgentToolName =
  | "spawn_agent"
  | "send_message"
  | "followup_task"
  | "wait_agent"
  | "interrupt_agent"
  | "list_agents";

export type AgentUiMultiAgentToolAction =
  | "spawn"
  | "send_message"
  | "followup"
  | "wait"
  | "interrupt"
  | "list";

export type AgentUiMultiAgentToolSchemaIssueCode =
  | "unknown_tool"
  | "legacy_tool_name"
  | "missing_required_field"
  | "forbidden_field"
  | "invalid_timeout";

export interface AgentUiMultiAgentToolSchemaIssue {
  code: AgentUiMultiAgentToolSchemaIssueCode;
  path: string;
  message: string;
}

export interface AgentUiMultiAgentToolSchemaContract {
  name: AgentUiMultiAgentToolName;
  action: AgentUiMultiAgentToolAction;
  control: AgentUiControl;
  requiredInputFields: readonly string[];
  optionalInputFields: readonly string[];
  forbiddenInputFields: readonly string[];
  outputRequiredFields: readonly string[];
  outputStatusField?: string;
}

export interface AgentUiMultiAgentToolSchemaValidationInput {
  toolName: string;
  input?: unknown;
  path?: string;
}

export interface AgentUiMultiAgentToolSchemaProjectionInput {
  toolName: string;
  input?: unknown;
  result?: unknown;
  status?: AgentUiRuntimeStatus | string | null;
  toolCallId?: string | null;
  taskId?: string | null;
  timestamp?: string | null;
}

const CONTRACTS: readonly AgentUiMultiAgentToolSchemaContract[] = [
  {
    name: "spawn_agent",
    action: "spawn",
    control: "delegate",
    requiredInputFields: ["task_name", "message"],
    optionalInputFields: [
      "agent_type",
      "fork_turns",
      "model",
      "reasoning_effort",
      "service_tier",
    ],
    forbiddenInputFields: ["items", "fork_context", "target"],
    outputRequiredFields: ["task_name", "nickname"],
    outputStatusField: "task_name",
  },
  {
    name: "send_message",
    action: "send_message",
    control: "send",
    requiredInputFields: ["target", "message"],
    optionalInputFields: [],
    forbiddenInputFields: ["items", "interrupt"],
    outputRequiredFields: [],
  },
  {
    name: "followup_task",
    action: "followup",
    control: "continue_agent",
    requiredInputFields: ["target", "message"],
    optionalInputFields: [],
    forbiddenInputFields: ["items", "interrupt"],
    outputRequiredFields: [],
  },
  {
    name: "wait_agent",
    action: "wait",
    control: "wait",
    requiredInputFields: [],
    optionalInputFields: ["timeout_ms"],
    forbiddenInputFields: ["targets", "target", "status"],
    outputRequiredFields: ["message", "timed_out"],
    outputStatusField: "timed_out",
  },
  {
    name: "interrupt_agent",
    action: "interrupt",
    control: "interrupt",
    requiredInputFields: ["target"],
    optionalInputFields: [],
    forbiddenInputFields: ["agent_id", "id"],
    outputRequiredFields: ["previous_status"],
    outputStatusField: "previous_status",
  },
  {
    name: "list_agents",
    action: "list",
    control: "open_detail",
    requiredInputFields: [],
    optionalInputFields: ["path_prefix"],
    forbiddenInputFields: ["targets", "agent_ids"],
    outputRequiredFields: ["agents"],
    outputStatusField: "agents",
  },
];

const CONTRACT_BY_NAME = new Map(CONTRACTS.map((contract) => [contract.name, contract]));

const LEGACY_MULTI_AGENT_TOOL_NAMES = new Set([
  "Agent",
  "AgentTool",
  "SubAgentTask",
  "SubAgentTaskTool",
  "SendMessage",
  "SendMessageTool",
  "SendUserMessage",
  "TeamCreate",
  "TeamCreateTool",
  "TeamDelete",
  "TeamDeleteTool",
  "ListPeers",
  "ListPeersTool",
  "multi_agent_v1.spawn_agent",
  "multi_agent_v1.send_input",
  "multi_agent_v1.wait_agent",
  "multi_agent_v1.close_agent",
  "multi_agent_v1.resume_agent",
]);

function normalizedToolName(value: string | null | undefined): string | undefined {
  return definedString(value);
}

function issue(
  code: AgentUiMultiAgentToolSchemaIssueCode,
  path: string,
  message: string,
): AgentUiMultiAgentToolSchemaIssue {
  return { code, path, message };
}

export function listCodexMultiAgentToolSchemaContracts(): readonly AgentUiMultiAgentToolSchemaContract[] {
  return CONTRACTS;
}

export function isCodexMultiAgentToolName(
  toolName: string | null | undefined,
): toolName is AgentUiMultiAgentToolName {
  const normalized = normalizedToolName(toolName);
  return Boolean(normalized && CONTRACT_BY_NAME.has(normalized as AgentUiMultiAgentToolName));
}

export function isLegacyMultiAgentToolName(
  toolName: string | null | undefined,
): boolean {
  const normalized = normalizedToolName(toolName);
  return Boolean(normalized && LEGACY_MULTI_AGENT_TOOL_NAMES.has(normalized));
}

export function getCodexMultiAgentToolSchemaContract(
  toolName: string | null | undefined,
): AgentUiMultiAgentToolSchemaContract | undefined {
  const normalized = normalizedToolName(toolName);
  if (!normalized) return undefined;
  return CONTRACT_BY_NAME.get(normalized as AgentUiMultiAgentToolName);
}

export function validateCodexMultiAgentToolSchema(
  input: AgentUiMultiAgentToolSchemaValidationInput,
): AgentUiMultiAgentToolSchemaIssue[] {
  const path = input.path ?? "$";
  const toolName = normalizedToolName(input.toolName);
  if (!toolName) {
    return [issue("unknown_tool", `${path}.toolName`, "Team tool name is required.")];
  }
  if (isLegacyMultiAgentToolName(toolName)) {
    return [
      issue(
        "legacy_tool_name",
        `${path}.toolName`,
        `${toolName} is a legacy Lime/Aster team tool name; use Codex v2 multi-agent tools instead.`,
      ),
    ];
  }

  const contract = getCodexMultiAgentToolSchemaContract(toolName);
  if (!contract) {
    return [
      issue(
        "unknown_tool",
        `${path}.toolName`,
        `${toolName} is not a Codex v2 multi-agent tool.`,
      ),
    ];
  }

  const args = readRecord(input.input) ?? {};
  const issues: AgentUiMultiAgentToolSchemaIssue[] = [];
  for (const field of contract.requiredInputFields) {
    if (args[field] === undefined || args[field] === null || args[field] === "") {
      issues.push(
        issue(
          "missing_required_field",
          `${path}.input.${field}`,
          `${toolName} requires ${field}.`,
        ),
      );
    }
  }
  for (const field of contract.forbiddenInputFields) {
    if (args[field] !== undefined) {
      issues.push(
        issue(
          "forbidden_field",
          `${path}.input.${field}`,
          `${toolName} does not accept legacy field ${field}.`,
        ),
      );
    }
  }
  const timeoutMs = readNumberField(args, ["timeout_ms"]);
  if (
    toolName === "wait_agent" &&
    timeoutMs !== undefined &&
    (!Number.isInteger(timeoutMs) || timeoutMs < 0)
  ) {
    issues.push(
      issue(
        "invalid_timeout",
        `${path}.input.timeout_ms`,
        "wait_agent timeout_ms must be a non-negative integer.",
      ),
    );
  }
  return issues;
}

function resolveStatus(
  input: AgentUiMultiAgentToolSchemaProjectionInput,
): AgentUiRuntimeStatus {
  const status = definedString(input.status ?? undefined);
  if (status) {
    switch (status) {
      case "pending_init":
      case "queued":
        return "queued";
      case "running":
        return "running";
      case "interrupted":
      case "aborted":
        return "aborted";
      case "shutdown":
      case "closed":
        return "closed";
      case "not_found":
        return "not_found";
      case "completed":
        return "completed";
      case "failed":
      case "errored":
        return "failed";
      default:
        return "unknown";
    }
  }
  const result = readRecord(input.result);
  if (readStringField(result, ["previous_status"]) === "interrupted") {
    return "aborted";
  }
  if (toolNameForProjection(input) === "wait_agent") {
    return result?.timed_out === true ? "waiting" : "completed";
  }
  return "completed";
}

function toolNameForProjection(
  input: AgentUiMultiAgentToolSchemaProjectionInput,
): AgentUiMultiAgentToolName | undefined {
  return getCodexMultiAgentToolSchemaContract(input.toolName)?.name;
}

function projectionTargetId(
  input: AgentUiMultiAgentToolSchemaProjectionInput,
): string | undefined {
  const args = readRecord(input.input);
  const result = readRecord(input.result);
  return (
    definedString(input.taskId ?? undefined) ??
    readStringField(args, ["task_name", "target", "path_prefix"]) ??
    readStringField(result, ["task_name", "agent_name"])
  );
}

export function buildCodexMultiAgentToolSchemaProjectionEvent(
  input: AgentUiMultiAgentToolSchemaProjectionInput,
  context: AgentUiProjectionContext = {},
): AgentUiProjectionEvent | undefined {
  const contract = getCodexMultiAgentToolSchemaContract(input.toolName);
  if (!contract) {
    return undefined;
  }
  const validationIssues = validateCodexMultiAgentToolSchema({
    toolName: input.toolName,
    input: input.input,
  });
  const runtimeStatus = validationIssues.length > 0 ? "failed" : resolveStatus(input);
  const taskId = projectionTargetId(input);
  const timestamp =
    definedString(input.timestamp ?? undefined) ?? context.timestamp;

  return compactProjectionFields({
    type: "task.changed",
    sourceType: "multi_agent_tool_schema_projection",
    sequence: context.sequence,
    timestamp,
    sessionId: definedString(context.sessionId),
    threadId: definedString(context.threadId),
    runId: definedString(context.runId),
    turnId: definedString(context.turnId),
    taskId,
    agentId: taskId,
    toolCallId: definedString(input.toolCallId ?? undefined),
    owner: "task",
    scope: "task",
    phase: validationIssues.length > 0 ? "failed" : "acting",
    surface: "team_policy",
    persistence: "snapshot",
    control: contract.control,
    topology: "coordinator_team",
    runtimeEntity:
      contract.name === "spawn_agent" || contract.name === "list_agents"
        ? "work_item"
        : "subagent_turn",
    runtimeStatus,
    latestTurnStatus: runtimeStatus,
    payload: {
      teamEvent: "multi_agent_tool_schema",
      toolName: contract.name,
      action: contract.action,
      requiredInputFields: [...contract.requiredInputFields],
      optionalInputFields: [...contract.optionalInputFields],
      forbiddenInputFields: [...contract.forbiddenInputFields],
      outputRequiredFields: [...contract.outputRequiredFields],
      outputStatusField: contract.outputStatusField,
      targetId: taskId,
      validationIssues,
    },
  } satisfies AgentUiProjectionEvent);
}
