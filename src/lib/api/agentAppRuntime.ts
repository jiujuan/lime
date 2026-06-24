import { safeInvoke } from "@/lib/dev-bridge";
import type {
  AgentRuntimeRespondActionRequest,
  AgentTurnConfigSnapshot,
} from "./agentRuntime/types";
import { assertNotDiagnosticFacade } from "./diagnosticFacade";

export const AGENT_APP_RUNTIME_COMMANDS = {
  startTask: "agent_app_runtime_start_task",
  cancelTask: "agent_app_runtime_cancel_task",
  getTask: "agent_app_runtime_get_task",
  submitHostResponse: "agent_app_runtime_submit_host_response",
} as const;

async function invokeAgentAppRuntimeCommand<T>(
  command: string,
  request: unknown,
): Promise<T> {
  const result = await safeInvoke<unknown>(command, { request });
  assertNotDiagnosticFacade(
    command,
    result,
    "真实 Agent App runtime current 通道",
  );
  assertNotErrorEnvelope(command, result);
  if (isRecord(result) && Array.isArray(result.taskEvents)) {
    assertNotErrorEnvelope(command, result.taskEvents);
  }
  return result as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function containsErrorEnvelope(value: unknown): boolean {
  if (isRecord(value) && "error" in value) {
    return true;
  }
  return Array.isArray(value) && value.some(containsErrorEnvelope);
}

function assertNotErrorEnvelope(command: string, value: unknown): void {
  if (containsErrorEnvelope(value)) {
    throw new Error(`${command} returned an error envelope`);
  }
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === "string";
}

function isTaskEvent(value: unknown): value is AgentAppRuntimeTaskEvent {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.eventType === "string" &&
    typeof value.status === "string" &&
    typeof value.message === "string" &&
    isOptionalString(value.severity) &&
    isOptionalString(value.turnId) &&
    isOptionalString(value.requestId) &&
    isOptionalString(value.toolName) &&
    isOptionalString(value.evidenceRef) &&
    isOptionalString(value.artifactRef) &&
    isOptionalString(value.occurredAt)
  );
}

function assertStartTaskResult(
  command: string,
  value: unknown,
): asserts value is AgentAppRuntimeStartTaskResult {
  if (
    !isRecord(value) ||
    typeof value.appId !== "string" ||
    !isOptionalString(value.entryKey) ||
    typeof value.taskId !== "string" ||
    typeof value.traceId !== "string" ||
    typeof value.taskKind !== "string" ||
    typeof value.sessionId !== "string" ||
    typeof value.turnId !== "string" ||
    typeof value.eventName !== "string" ||
    value.status !== "accepted" ||
    typeof value.submittedAt !== "string"
  ) {
    throw new Error(`${command} did not return accepted task result`);
  }
}

function assertCancelTaskResult(
  command: string,
  value: unknown,
): asserts value is AgentAppRuntimeCancelTaskResult {
  if (
    !isRecord(value) ||
    typeof value.appId !== "string" ||
    typeof value.taskId !== "string" ||
    typeof value.sessionId !== "string" ||
    typeof value.cancelled !== "boolean" ||
    (value.status !== "cancelled" && value.status !== "not_running")
  ) {
    throw new Error(`${command} did not return cancel task result`);
  }
}

function assertTaskSnapshot(
  command: string,
  value: unknown,
): asserts value is AgentAppRuntimeTaskSnapshot {
  if (
    !isRecord(value) ||
    typeof value.appId !== "string" ||
    typeof value.taskId !== "string" ||
    typeof value.sessionId !== "string" ||
    value.status !== "thread_read_available" ||
    typeof value.taskStatus !== "string" ||
    !Array.isArray(value.taskEvents) ||
    !value.taskEvents.every(isTaskEvent) ||
    value.threadRead === undefined
  ) {
    throw new Error(`${command} did not return task snapshot`);
  }
}

function assertSubmitHostResponseResult(
  command: string,
  value: unknown,
): asserts value is AgentAppRuntimeSubmitHostResponseResult {
  if (
    !isRecord(value) ||
    typeof value.appId !== "string" ||
    typeof value.taskId !== "string" ||
    value.status !== "submitted"
  ) {
    throw new Error(`${command} did not return submitted host response result`);
  }
}

export interface AgentAppRuntimeStartTaskRequest {
  appId: string;
  entryKey?: string;
  workspaceId?: string;
  sessionId?: string;
  taskId?: string;
  taskKind: string;
  idempotencyKey?: string;
  title?: string;
  prompt?: string;
  input?: unknown;
  expectedOutput?: unknown;
  requiredCapabilities?: string[];
  capabilityHints?: string[];
  knowledgeBindings?: unknown[];
  humanReview?: boolean;
  eventName?: string;
  turnId?: string;
  packageRootPath?: string;
  runtimePackageRoot?: string;
  appRootPath?: string;
  runWorker?: boolean;
  workerTimeoutMs?: number;
  providerPreference?: string;
  modelPreference?: string;
  turnConfig?: AgentTurnConfigSnapshot;
  queueIfBusy?: boolean;
  skipPreSubmitResume?: boolean;
  runStartHooks?: boolean;
  metadata?: Record<string, unknown>;
}

export interface AgentAppRuntimeStartTaskResult {
  appId: string;
  entryKey?: string;
  taskId: string;
  traceId: string;
  taskKind: string;
  sessionId: string;
  turnId: string;
  eventName: string;
  status: "accepted";
  worker?: unknown;
  submittedAt: string;
}

export interface AgentAppRuntimeCancelTaskRequest {
  appId: string;
  taskId: string;
  sessionId: string;
  turnId?: string;
}

export interface AgentAppRuntimeCancelTaskResult {
  appId: string;
  taskId: string;
  sessionId: string;
  cancelled: boolean;
  status: "cancelled" | "not_running";
}

export interface AgentAppRuntimeGetTaskRequest {
  appId: string;
  taskId: string;
  sessionId: string;
}

export interface AgentAppRuntimeTaskEvent {
  id: string;
  eventType: string;
  status: string;
  message: string;
  severity?: string;
  turnId?: string;
  requestId?: string;
  toolName?: string;
  evidenceRef?: string;
  artifactRef?: string;
  occurredAt?: string;
  payload?: unknown;
}

export interface AgentAppRuntimeTaskSnapshot {
  appId: string;
  taskId: string;
  sessionId: string;
  status: "thread_read_available";
  taskStatus: string;
  taskEvents: AgentAppRuntimeTaskEvent[];
  threadRead: unknown;
}

export interface AgentAppRuntimeSubmitHostResponseRequest {
  appId: string;
  taskId: string;
  runtimeRequest: AgentRuntimeRespondActionRequest;
}

export interface AgentAppRuntimeSubmitHostResponseResult {
  appId: string;
  taskId: string;
  status: "submitted";
}

export async function startAgentAppRuntimeTask(
  request: AgentAppRuntimeStartTaskRequest,
): Promise<AgentAppRuntimeStartTaskResult> {
  const command = AGENT_APP_RUNTIME_COMMANDS.startTask;
  const result = await invokeAgentAppRuntimeCommand<unknown>(command, request);
  assertStartTaskResult(command, result);
  return result;
}

export async function cancelAgentAppRuntimeTask(
  request: AgentAppRuntimeCancelTaskRequest,
): Promise<AgentAppRuntimeCancelTaskResult> {
  const command = AGENT_APP_RUNTIME_COMMANDS.cancelTask;
  const result = await invokeAgentAppRuntimeCommand<unknown>(command, request);
  assertCancelTaskResult(command, result);
  return result;
}

export async function getAgentAppRuntimeTask(
  request: AgentAppRuntimeGetTaskRequest,
): Promise<AgentAppRuntimeTaskSnapshot> {
  const command = AGENT_APP_RUNTIME_COMMANDS.getTask;
  const result = await invokeAgentAppRuntimeCommand<unknown>(command, request);
  assertTaskSnapshot(command, result);
  return result;
}

export async function submitAgentAppRuntimeHostResponse(
  request: AgentAppRuntimeSubmitHostResponseRequest,
): Promise<AgentAppRuntimeSubmitHostResponseResult> {
  const command = AGENT_APP_RUNTIME_COMMANDS.submitHostResponse;
  const result = await invokeAgentAppRuntimeCommand<unknown>(command, request);
  assertSubmitHostResponseResult(command, result);
  return result;
}
