import { AGENT_RUNTIME_COMMANDS } from "./commandManifest.generated";
import {
  invokeAgentRuntimeCommand,
  type AgentRuntimeCommandInvoke,
} from "./transport";
import type {
  AgentRuntimeCloseSubagentRequest,
  AgentRuntimeCloseSubagentResponse,
  AgentRuntimeResumeSubagentRequest,
  AgentRuntimeResumeSubagentResponse,
  AgentRuntimeSendSubagentInputRequest,
  AgentRuntimeSendSubagentInputResponse,
  AgentRuntimeSpawnSubagentRequest,
  AgentRuntimeSpawnSubagentResponse,
  AgentRuntimeStatusSnapshot,
  AgentRuntimeWaitSubagentsRequest,
  AgentRuntimeWaitSubagentsResponse,
} from "./types";

export interface AgentRuntimeSubagentClientDeps {
  invokeCommand?: AgentRuntimeCommandInvoke;
}

const STATUS_KINDS = new Set<AgentRuntimeStatusSnapshot["kind"]>([
  "idle",
  "queued",
  "running",
  "completed",
  "failed",
  "aborted",
  "closed",
  "not_found",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isRequiredString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === "string";
}

function isOptionalBoolean(value: unknown): value is boolean | undefined {
  return value === undefined || typeof value === "boolean";
}

function isOptionalFiniteNumber(value: unknown): value is number | undefined {
  return (
    value === undefined ||
    (typeof value === "number" && Number.isFinite(value))
  );
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isStatusKind(
  value: unknown,
): value is AgentRuntimeStatusSnapshot["kind"] {
  return (
    typeof value === "string" &&
    STATUS_KINDS.has(value as AgentRuntimeStatusSnapshot["kind"])
  );
}

function isAgentRuntimeStatusSnapshot(
  value: unknown,
): value is AgentRuntimeStatusSnapshot {
  return (
    isRecord(value) &&
    isRequiredString(value.session_id) &&
    isStatusKind(value.kind) &&
    isOptionalString(value.latest_turn_id) &&
    (value.latest_turn_status === undefined ||
      isStatusKind(value.latest_turn_status)) &&
    isOptionalFiniteNumber(value.queued_turn_count) &&
    isOptionalBoolean(value.closed)
  );
}

function isSpawnSubagentResponse(
  value: unknown,
): value is AgentRuntimeSpawnSubagentResponse {
  return (
    isRecord(value) &&
    isRequiredString(value.agent_id) &&
    isOptionalString(value.nickname)
  );
}

function isSendSubagentInputResponse(
  value: unknown,
): value is AgentRuntimeSendSubagentInputResponse {
  return isRecord(value) && isRequiredString(value.submission_id);
}

function isWaitSubagentsResponse(
  value: unknown,
): value is AgentRuntimeWaitSubagentsResponse {
  return (
    isRecord(value) &&
    typeof value.timed_out === "boolean" &&
    isRecord(value.status) &&
    Object.values(value.status).every(isAgentRuntimeStatusSnapshot)
  );
}

function isResumeSubagentResponse(
  value: unknown,
): value is AgentRuntimeResumeSubagentResponse {
  return (
    isRecord(value) &&
    isAgentRuntimeStatusSnapshot(value.status) &&
    isStringArray(value.cascade_session_ids) &&
    isStringArray(value.changed_session_ids)
  );
}

function isCloseSubagentResponse(
  value: unknown,
): value is AgentRuntimeCloseSubagentResponse {
  return (
    isRecord(value) &&
    isAgentRuntimeStatusSnapshot(value.previous_status) &&
    isStringArray(value.cascade_session_ids) &&
    isStringArray(value.changed_session_ids)
  );
}

function assertSpawnSubagentResponse(
  command: string,
  value: unknown,
): asserts value is AgentRuntimeSpawnSubagentResponse {
  if (!isSpawnSubagentResponse(value)) {
    throw new Error(`${command} did not return subagent spawn response`);
  }
}

function assertSendSubagentInputResponse(
  command: string,
  value: unknown,
): asserts value is AgentRuntimeSendSubagentInputResponse {
  if (!isSendSubagentInputResponse(value)) {
    throw new Error(`${command} did not return subagent input response`);
  }
}

function assertWaitSubagentsResponse(
  command: string,
  value: unknown,
): asserts value is AgentRuntimeWaitSubagentsResponse {
  if (!isWaitSubagentsResponse(value)) {
    throw new Error(`${command} did not return subagent wait response`);
  }
}

function assertResumeSubagentResponse(
  command: string,
  value: unknown,
): asserts value is AgentRuntimeResumeSubagentResponse {
  if (!isResumeSubagentResponse(value)) {
    throw new Error(`${command} did not return subagent resume response`);
  }
}

function assertCloseSubagentResponse(
  command: string,
  value: unknown,
): asserts value is AgentRuntimeCloseSubagentResponse {
  if (!isCloseSubagentResponse(value)) {
    throw new Error(`${command} did not return subagent close response`);
  }
}

export function createSubagentClient({
  invokeCommand = invokeAgentRuntimeCommand,
}: AgentRuntimeSubagentClientDeps = {}) {
  async function spawnAgentRuntimeSubagent(
    request: AgentRuntimeSpawnSubagentRequest,
  ): Promise<AgentRuntimeSpawnSubagentResponse> {
    const command = AGENT_RUNTIME_COMMANDS.spawnSubagent;
    const result = await invokeCommand(command, { request });
    assertSpawnSubagentResponse(command, result);
    return result;
  }

  async function sendAgentRuntimeSubagentInput(
    request: AgentRuntimeSendSubagentInputRequest,
  ): Promise<AgentRuntimeSendSubagentInputResponse> {
    const command = AGENT_RUNTIME_COMMANDS.sendSubagentInput;
    const result = await invokeCommand(command, { request });
    assertSendSubagentInputResponse(command, result);
    return result;
  }

  async function waitAgentRuntimeSubagents(
    request: AgentRuntimeWaitSubagentsRequest,
  ): Promise<AgentRuntimeWaitSubagentsResponse> {
    const command = AGENT_RUNTIME_COMMANDS.waitSubagents;
    const result = await invokeCommand(command, { request });
    assertWaitSubagentsResponse(command, result);
    return result;
  }

  async function resumeAgentRuntimeSubagent(
    request: AgentRuntimeResumeSubagentRequest,
  ): Promise<AgentRuntimeResumeSubagentResponse> {
    const command = AGENT_RUNTIME_COMMANDS.resumeSubagent;
    const result = await invokeCommand(command, { request });
    assertResumeSubagentResponse(command, result);
    return result;
  }

  async function closeAgentRuntimeSubagent(
    request: AgentRuntimeCloseSubagentRequest,
  ): Promise<AgentRuntimeCloseSubagentResponse> {
    const command = AGENT_RUNTIME_COMMANDS.closeSubagent;
    const result = await invokeCommand(command, { request });
    assertCloseSubagentResponse(command, result);
    return result;
  }

  return {
    closeAgentRuntimeSubagent,
    resumeAgentRuntimeSubagent,
    sendAgentRuntimeSubagentInput,
    spawnAgentRuntimeSubagent,
    waitAgentRuntimeSubagents,
  };
}

export const {
  closeAgentRuntimeSubagent,
  resumeAgentRuntimeSubagent,
  sendAgentRuntimeSubagentInput,
  spawnAgentRuntimeSubagent,
  waitAgentRuntimeSubagents,
} = createSubagentClient();
