import { safeInvoke } from "@/lib/dev-bridge";
import type {
  AgentRuntimeRespondActionRequest,
  AgentTurnConfigSnapshot,
} from "./agentRuntime/types";
import { assertNotDiagnosticFacade } from "./diagnosticFacade";

export const PLUGIN_RUNTIME_COMMANDS = {
  startTask: "plugin_runtime_start_task",
  cancelTask: "plugin_runtime_cancel_task",
  getTask: "plugin_runtime_get_task",
  submitHostResponse: "plugin_runtime_submit_host_response",
} as const;

async function invokePluginRuntimeCommand<T>(
  command: string,
  request: unknown,
): Promise<T> {
  const result = await safeInvoke<unknown>(command, { request });
  assertNotDiagnosticFacade(
    command,
    result,
    "真实 Plugin runtime current 通道",
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

function isTaskEvent(value: unknown): value is PluginRuntimeTaskEvent {
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
): asserts value is PluginRuntimeStartTaskResult {
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
): asserts value is PluginRuntimeCancelTaskResult {
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
): asserts value is PluginRuntimeTaskSnapshot {
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
): asserts value is PluginRuntimeSubmitHostResponseResult {
  if (
    !isRecord(value) ||
    typeof value.appId !== "string" ||
    typeof value.taskId !== "string" ||
    value.status !== "submitted"
  ) {
    throw new Error(`${command} did not return submitted host response result`);
  }
}

export interface PluginRuntimeStartTaskRequest {
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

export interface PluginRuntimeStartTaskResult {
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

export interface PluginRuntimeCancelTaskRequest {
  appId: string;
  taskId: string;
  sessionId: string;
  turnId?: string;
}

export interface PluginRuntimeCancelTaskResult {
  appId: string;
  taskId: string;
  sessionId: string;
  cancelled: boolean;
  status: "cancelled" | "not_running";
}

export interface PluginRuntimeGetTaskRequest {
  appId: string;
  taskId: string;
  sessionId: string;
}

export interface PluginRuntimeTaskEvent {
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

export interface PluginRuntimeTaskSnapshot {
  appId: string;
  taskId: string;
  sessionId: string;
  status: "thread_read_available";
  taskStatus: string;
  taskEvents: PluginRuntimeTaskEvent[];
  threadRead: unknown;
}

export interface PluginRuntimeSubmitHostResponseRequest {
  appId: string;
  taskId: string;
  runtimeRequest: AgentRuntimeRespondActionRequest;
}

export interface PluginRuntimeSubmitHostResponseResult {
  appId: string;
  taskId: string;
  status: "submitted";
}

export async function startPluginRuntimeTask(
  request: PluginRuntimeStartTaskRequest,
): Promise<PluginRuntimeStartTaskResult> {
  const command = PLUGIN_RUNTIME_COMMANDS.startTask;
  const result = await invokePluginRuntimeCommand<unknown>(command, request);
  assertStartTaskResult(command, result);
  return result;
}

export async function cancelPluginRuntimeTask(
  request: PluginRuntimeCancelTaskRequest,
): Promise<PluginRuntimeCancelTaskResult> {
  const command = PLUGIN_RUNTIME_COMMANDS.cancelTask;
  const result = await invokePluginRuntimeCommand<unknown>(command, request);
  assertCancelTaskResult(command, result);
  return result;
}

export async function getPluginRuntimeTask(
  request: PluginRuntimeGetTaskRequest,
): Promise<PluginRuntimeTaskSnapshot> {
  const command = PLUGIN_RUNTIME_COMMANDS.getTask;
  const result = await invokePluginRuntimeCommand<unknown>(command, request);
  assertTaskSnapshot(command, result);
  return result;
}

export async function submitPluginRuntimeHostResponse(
  request: PluginRuntimeSubmitHostResponseRequest,
): Promise<PluginRuntimeSubmitHostResponseResult> {
  const command = PLUGIN_RUNTIME_COMMANDS.submitHostResponse;
  const result = await invokePluginRuntimeCommand<unknown>(command, request);
  assertSubmitHostResponseResult(command, result);
  return result;
}
